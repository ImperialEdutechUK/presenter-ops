import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Cron,
  CronExpression,
} from '@nestjs/schedule';
import nodemailer, {
  type Transporter,
} from 'nodemailer';
import type {
  AssignmentStatus,
  NotificationType,
} from '@presenter-ops/shared';

import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators';

/**
 * In-app notifications plus email.
 *
 * Presenter account invitation emails use EmailJS.
 *
 * The existing SMTP transport is retained for assignment
 * lifecycle/reminder emails so those parts of PresenterOps
 * do not need to be changed at the same time.
 */
@Injectable()
export class NotificationsService {
  private readonly logger =
    new Logger(
      NotificationsService.name,
    );

  private transporter:
    | Transporter
    | null = null;

  constructor(
    private readonly prisma:
      PrismaService,
    private readonly config:
      ConfigService,
  ) {
    if (
      this.config.get<boolean>(
        'mail.enabled',
      )
    ) {
      this.transporter =
        nodemailer.createTransport({
          host:
            this.config.get<string>(
              'mail.host',
            ),

          port:
            this.config.get<number>(
              'mail.port',
            ),

          secure:
            this.config.get<number>(
              'mail.port',
            ) === 465,

          auth: {
            user:
              this.config.get<string>(
                'mail.user',
              ),

            pass:
              this.config.get<string>(
                'mail.pass',
              ),
          },
        });
    }
  }

  // ==========================================================================
  // In-app notifications
  // ==========================================================================

  async create(input: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    linkUrl?: string;

    alsoEmail?: {
      to: string;
      subject: string;
      text: string;
    };
  }) {
    const notification =
      await this.prisma.notification.create(
        {
          data: {
            userId:
              input.userId,

            type:
              input.type,

            title:
              input.title,

            body:
              input.body ??
              null,

            linkUrl:
              input.linkUrl ??
              null,
          },
        },
      );

    if (input.alsoEmail) {
      /*
       * Assignment/reminder emails are still
       * best-effort SMTP messages.
       */
      void this.sendEmail(
        input.alsoEmail,
      );
    }

    return notification;
  }

  // ==========================================================================
  // Existing SMTP email
  // ==========================================================================

  async sendEmail(message: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(
        `[mail disabled] to=${message.to} subject="${message.subject}"`,
      );

      return false;
    }

    try {
      await this.transporter.sendMail({
        from:
          this.config.get<string>(
            'mail.from',
          ),

        ...message,
      });

      return true;
    } catch (error) {
      this.logger.error(
        `Email to ${message.to} failed: ${
          (error as Error).message
        }`,
      );

      return false;
    }
  }

  // ==========================================================================
  // EmailJS presenter invitation email
  // ==========================================================================

  async sendInvitationEmail(
    input: {
      to: string;
      toName: string;
      activationUrl: string;
      expiryDays: number;
    },
  ): Promise<boolean> {
    const enabled =
      this.config.get<boolean>(
        'emailjs.enabled',
      );

    if (!enabled) {
      this.logger.warn(
        `EmailJS is disabled. Invitation email was not sent to ${input.to}.`,
      );

      return false;
    }

    const serviceId =
      this.config.get<string>(
        'emailjs.serviceId',
      );

    const templateId =
      this.config.get<string>(
        'emailjs.templateId',
      );

    const publicKey =
      this.config.get<string>(
        'emailjs.publicKey',
      );

    const privateKey =
      this.config.get<string>(
        'emailjs.privateKey',
      );

    if (
      !serviceId ||
      !templateId ||
      !publicKey ||
      !privateKey
    ) {
      this.logger.error(
        'EmailJS is enabled but one or more required EmailJS environment variables are missing.',
      );

      return false;
    }

    try {
      const response =
        await fetch(
          'https://api.emailjs.com/api/v1.0/email/send',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                service_id:
                  serviceId,

                template_id:
                  templateId,

                user_id:
                  publicKey,

                /**
                 * Required when EmailJS
                 * non-browser API access is
                 * configured in strict mode.
                 */
                accessToken:
                  privateKey,

                template_params:
                  {
                    to_email:
                      input.to,

                    to_name:
                      input.toName,

                    activation_url:
                      input.activationUrl,

                    expiry_days:
                      String(
                        input.expiryDays,
                      ),
                  },
              }),
          },
        );

      if (!response.ok) {
        const errorText =
          await response.text();

        this.logger.error(
          `EmailJS invitation failed for ${input.to}. ` +
            `HTTP ${response.status}: ${errorText}`,
        );

        return false;
      }

      this.logger.log(
        `Presenter invitation email sent through EmailJS to ${input.to}`,
      );

      return true;
    } catch (error) {
      this.logger.error(
        `EmailJS invitation failed for ${input.to}: ${
          (error as Error).message
        }`,
      );

      return false;
    }
  }

  // ==========================================================================
  // Notification queries
  // ==========================================================================

  list(
    userId: string,
    unreadOnly = false,
  ) {
    return this.prisma.notification.findMany(
      {
        where: {
          userId,

          ...(unreadOnly
            ? {
                readAt: null,
              }
            : {}),
        },

        orderBy: {
          createdAt: 'desc',
        },

        take: 50,
      },
    );
  }

  markRead(
    userId: string,
    ids?: string[],
  ) {
    return this.prisma.notification.updateMany(
      {
        where: {
          userId,
          readAt: null,

          ...(ids?.length
            ? {
                id: {
                  in: ids,
                },
              }
            : {}),
        },

        data: {
          readAt: new Date(),
        },
      },
    );
  }

  // ==========================================================================
  // Assignment lifecycle hooks
  // ==========================================================================

  async onAssignmentTransition(
    params: {
      assignment: {
        id: string;
        reference: string;
        title: string;
        dueAt: Date | null;
      };

      from: AssignmentStatus;
      to: AssignmentStatus;

      actor:
        AuthenticatedUser;

      presenter: {
        id: string;
        displayName: string;
        email: string;
        userId: string | null;
      } | null;

      brandName: string;
      note?: string;
    },
  ) {
    const {
      assignment,
      to,
      presenter,
      brandName,
      note,
    } = params;

    const appUrl =
      this.config.get<string>(
        'appUrl',
      );

    // --- messages that go to the presenter --------------------------------

    const toPresenter: Partial<
      Record<
        AssignmentStatus,
        {
          title: string;
          body: string;
        }
      >
    > = {
      ASSIGNED: {
        title:
          `New job: ${assignment.title}`,

        body:
          `${brandName} — ${assignment.reference}. ${
            assignment.dueAt
              ? `Due ${assignment.dueAt.toDateString()}.`
              : ''
          } Accept or decline in your portal.`,
      },

      REVISIONS_REQUESTED: {
        title:
          `Revisions requested on ${assignment.reference}`,

        body:
          note ??
          'Have a look at the notes on the job.',
      },

      APPROVED: {
        title:
          `${assignment.reference} approved`,

        body:
          'Thanks — this one is signed off.',
      },
    };

    if (
      presenter?.userId &&
      toPresenter[to]
    ) {
      const message =
        toPresenter[to]!;

      await this.create({
        userId:
          presenter.userId,

        type:
          to === 'ASSIGNED'
            ? 'ASSIGNMENT_OFFERED'
            : to ===
                'REVISIONS_REQUESTED'
              ? 'REVISIONS_REQUESTED'
              : 'APPROVED',

        title:
          message.title,

        body:
          message.body,

        linkUrl:
          `/portal/assignments/${assignment.id}`,

        alsoEmail: {
          to:
            presenter.email,

          subject:
            message.title,

          text:
            `${message.body}\n\n` +
            `${appUrl}/portal/assignments/${assignment.id}\n`,
        },
      });
    }

    // --- messages that go back to the internal team ------------------------

    const internalTypes: Partial<
      Record<
        AssignmentStatus,
        NotificationType
      >
    > = {
      ACCEPTED:
        'ASSIGNMENT_ACCEPTED',

      DECLINED:
        'ASSIGNMENT_DECLINED',

      SUBMITTED:
        'DELIVERY_SUBMITTED',
    };

    if (internalTypes[to]) {
      const producers =
        await this.prisma.user.findMany(
          {
            where: {
              role: {
                in: [
                  'PRODUCER',
                  'ADMIN',
                ],
              },

              isActive:
                true,
            },

            select: {
              id: true,
            },
          },
        );

      const verb =
        to === 'ACCEPTED'
          ? 'accepted'
          : to === 'DECLINED'
            ? 'declined'
            : 'submitted';

      await this.prisma.notification.createMany(
        {
          data:
            producers.map(
              (producer) => ({
                userId:
                  producer.id,

                type:
                  internalTypes[to]!,

                title:
                  `${
                    presenter?.displayName ??
                    'A presenter'
                  } ${verb} ${assignment.reference}`,

                body:
                  assignment.title,

                linkUrl:
                  `/assignments/${assignment.id}`,
              }),
            ),
        },
      );
    }
  }

  // ==========================================================================
  // Scheduled reminders
  // ==========================================================================

  /**
   * Runs hourly.
   *
   * Warns about:
   * - work due soon
   * - overdue work
   *
   * Each assignment is reminded once for each
   * reminder state.
   */
  @Cron(
    CronExpression.EVERY_HOUR,
  )
  async sendDueReminders() {
    const settings =
      await this.prisma.appSetting.upsert(
        {
          where: {
            id: 'singleton',
          },

          create: {
            id: 'singleton',
          },

          update: {},
        },
      );

    const now =
      new Date();

    const soon =
      new Date(
        now.getTime() +
          settings.dueSoonHours *
            3_600_000,
      );

    const candidates =
      await this.prisma.assignment.findMany(
        {
          where: {
            status: {
              in: [
                'ASSIGNED',
                'ACCEPTED',
                'IN_PROGRESS',
                'REVISIONS_REQUESTED',
              ],
            },

            dueAt: {
              not: null,
              lte: soon,
            },

            presenter: {
              userId: {
                not: null,
              },
            },
          },

          include: {
            presenter: {
              include: {
                user: true,
              },
            },
          },
        },
      );

    for (
      const assignment
      of candidates
    ) {
      const overdue =
        assignment.dueAt! <
        now;

      const marker =
        overdue
          ? 'overdue'
          : 'due-soon';

      const alreadySent =
        await this.prisma.assignmentEvent.findFirst(
          {
            where: {
              assignmentId:
                assignment.id,

              type:
                'REMINDER_SENT',

              payload: {
                path: [
                  'marker',
                ],

                equals:
                  marker,
              },
            },
          },
        );

      if (alreadySent) {
        continue;
      }

      const presenter =
        assignment.presenter;

      if (
        !presenter ||
        !presenter.user
      ) {
        continue;
      }

      await this.create({
        userId:
          presenter.user.id,

        type:
          overdue
            ? 'ASSIGNMENT_OVERDUE'
            : 'ASSIGNMENT_DUE_SOON',

        title:
          overdue
            ? `${assignment.reference} is overdue`
            : `${assignment.reference} is due soon`,

        body:
          assignment.title,

        linkUrl:
          `/portal/assignments/${assignment.id}`,

        alsoEmail: {
          to:
            presenter.email,

          subject:
            overdue
              ? `Overdue: ${assignment.title}`
              : `Due soon: ${assignment.title}`,

          text:
            `${assignment.reference} — ${assignment.title}\n` +
            `Due ${assignment.dueAt!.toDateString()}.\n`,
        },
      });

      await this.prisma.assignmentEvent.create(
        {
          data: {
            assignmentId:
              assignment.id,

            type:
              'REMINDER_SENT',

            payload: {
              marker,
            },
          },
        },
      );
    }
  }

  /**
   * Daily at 08:00 UTC.
   *
   * Warn internal users about presenter
   * contracts that are about to expire.
   */
  @Cron('0 8 * * *')
  async warnExpiringContracts() {
    const settings =
      await this.prisma.appSetting.findUnique(
        {
          where: {
            id: 'singleton',
          },
        },
      );

    const days =
      settings
        ?.contractExpiryWarningDays ??
      30;

    const cutoff =
      new Date(
        Date.now() +
          days *
            86_400_000,
      );

    const expiring =
      await this.prisma.presenterBrand.findMany(
        {
          where: {
            contractStatus:
              'SIGNED',

            contractExpiresAt: {
              not: null,
              lte: cutoff,
              gte:
                new Date(),
            },
          },

          include: {
            presenter: true,
            brand: true,
          },
        },
      );

    if (
      expiring.length === 0
    ) {
      return;
    }

    const admins =
      await this.prisma.user.findMany(
        {
          where: {
            role: {
              in: [
                'ADMIN',
                'PRODUCER',
              ],
            },

            isActive:
              true,
          },

          select: {
            id: true,
          },
        },
      );

    await this.prisma.notification.createMany(
      {
        data:
          admins.flatMap(
            (admin) =>
              expiring.map(
                (contract) => ({
                  userId:
                    admin.id,

                  type:
                    'CONTRACT_EXPIRING' as const,

                  title:
                    `${contract.presenter.displayName}'s ` +
                    `${contract.brand.name} contract expires soon`,

                  body:
                    `Expires ` +
                    `${contract.contractExpiresAt!.toDateString()}.`,

                  linkUrl:
                    `/presenters/${contract.presenterId}` +
                    `?tab=contracts`,
                }),
              ),
          ),
      },
    );
  }
}
