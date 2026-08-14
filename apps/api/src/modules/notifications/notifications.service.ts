import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import nodemailer, { type Transporter } from 'nodemailer';
import type {
  AssignmentStatus,
  NotificationType,
} from '@presenter-ops/shared';

import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators';

/**
 * In-app notifications plus email.
 *
 * Email is best-effort: a failed SMTP send is logged and the in-app
 * notification still exists, because losing the record of "we told them" is
 * worse than losing the email itself. When MAIL_ENABLED is false (local dev)
 * messages are written to the log instead of being sent.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    if (this.config.get<boolean>('mail.enabled')) {
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('mail.host'),
        port: this.config.get<number>('mail.port'),
        secure: this.config.get<number>('mail.port') === 465,
        auth: {
          user: this.config.get<string>('mail.user'),
          pass: this.config.get<string>('mail.pass'),
        },
      });
    }
  }

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
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        linkUrl: input.linkUrl ?? null,
      },
    });

    if (input.alsoEmail) {
      void this.sendEmail(input.alsoEmail);
    }

    return notification;
  }

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
        from: this.config.get<string>('mail.from'),
        ...message,
      });

      return true;
    } catch (error) {
      this.logger.error(
        `Email to ${message.to} failed: ${(error as Error).message}`,
      );

      return false;
    }
  }

  list(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });
  }

  markRead(userId: string, ids?: string[]) {
    return this.prisma.notification.updateMany({
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
    });
  }

  // ==========================================================================
  // Assignment lifecycle hooks
  // ==========================================================================

  async onAssignmentTransition(params: {
    assignment: {
      id: string;
      reference: string;
      title: string;
      dueAt: Date | null;
    };
    from: AssignmentStatus;
    to: AssignmentStatus;
    actor: AuthenticatedUser;
    presenter: {
      id: string;
      displayName: string;
      email: string;
      userId: string | null;
    } | null;
    brandName: string;
    note?: string;
  }) {
    const {
      assignment,
      to,
      presenter,
      brandName,
      note,
    } = params;

    const appUrl = this.config.get<string>('appUrl');

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
        title: `New job: ${assignment.title}`,
        body: `${brandName} — ${assignment.reference}. ${
          assignment.dueAt
            ? `Due ${assignment.dueAt.toDateString()}.`
            : ''
        } Accept or decline in your portal.`,
      },

      REVISIONS_REQUESTED: {
        title: `Revisions requested on ${assignment.reference}`,
        body:
          note ??
          'Have a look at the notes on the job.',
      },

      APPROVED: {
        title: `${assignment.reference} approved`,
        body: 'Thanks — this one is signed off.',
      },
    };

    if (presenter?.userId && toPresenter[to]) {
      const message = toPresenter[to]!;

      await this.create({
        userId: presenter.userId,

        type:
          to === 'ASSIGNED'
            ? 'ASSIGNMENT_OFFERED'
            : to === 'REVISIONS_REQUESTED'
              ? 'REVISIONS_REQUESTED'
              : 'APPROVED',

        title: message.title,
        body: message.body,

        linkUrl: `/portal/assignments/${assignment.id}`,

        alsoEmail: {
          to: presenter.email,
          subject: message.title,
          text:
            `${message.body}\n\n` +
            `${appUrl}/portal/assignments/${assignment.id}\n`,
        },
      });
    }

    // --- messages that go back to the internal team ------------------------

    const internalTypes: Partial<
      Record<AssignmentStatus, NotificationType>
    > = {
      ACCEPTED: 'ASSIGNMENT_ACCEPTED',
      DECLINED: 'ASSIGNMENT_DECLINED',
      SUBMITTED: 'DELIVERY_SUBMITTED',
    };

    if (internalTypes[to]) {
      const producers = await this.prisma.user.findMany({
        where: {
          role: {
            in: ['PRODUCER', 'ADMIN'],
          },
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      const verb =
        to === 'ACCEPTED'
          ? 'accepted'
          : to === 'DECLINED'
            ? 'declined'
            : 'submitted';

      await this.prisma.notification.createMany({
        data: producers.map((producer) => ({
          userId: producer.id,
          type: internalTypes[to]!,
          title: `${
            presenter?.displayName ?? 'A presenter'
          } ${verb} ${assignment.reference}`,
          body: assignment.title,
          linkUrl: `/assignments/${assignment.id}`,
        })),
      });
    }
  }

  // ==========================================================================
  // Scheduled reminders
  // ==========================================================================

  /**
   * Runs hourly.
   *
   * 1. Warn about work due within AppSetting.dueSoonHours
   * 2. Flag work that is now overdue
   *
   * Each assignment is reminded once per state, tracked by looking for an
   * existing REMINDER_SENT event.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendDueReminders() {
    const settings = await this.prisma.appSetting.upsert({
      where: {
        id: 'singleton',
      },
      create: {
        id: 'singleton',
      },
      update: {},
    });

    const now = new Date();

    const soon = new Date(
      now.getTime() +
        settings.dueSoonHours * 3_600_000,
    );

    const candidates =
      await this.prisma.assignment.findMany({
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
      });

    for (const assignment of candidates) {
      const overdue =
        assignment.dueAt! < now;

      const marker = overdue
        ? 'overdue'
        : 'due-soon';

      const alreadySent =
        await this.prisma.assignmentEvent.findFirst({
          where: {
            assignmentId: assignment.id,
            type: 'REMINDER_SENT',

            payload: {
              path: ['marker'],
              equals: marker,
            },
          },
        });

      if (alreadySent) {
        continue;
      }

      await this.create({
        userId: assignment.presenter!.user!.id,

        type: overdue
          ? 'ASSIGNMENT_OVERDUE'
          : 'ASSIGNMENT_DUE_SOON',

        title: overdue
          ? `${assignment.reference} is overdue`
          : `${assignment.reference} is due soon`,

        body: assignment.title,

        linkUrl: `/portal/assignments/${assignment.id}`,

        alsoEmail: {
          to: assignment.presenter!.email,

          subject: overdue
            ? `Overdue: ${assignment.title}`
            : `Due soon: ${assignment.title}`,

          text:
            `${assignment.reference} — ${assignment.title}\n` +
            `Due ${assignment.dueAt!.toDateString()}.\n`,
        },
      });

      await this.prisma.assignmentEvent.create({
        data: {
          assignmentId: assignment.id,
          type: 'REMINDER_SENT',
          payload: {
            marker,
          },
        },
      });
    }
  }

  /**
   * Daily 08:00 UTC — warn about contracts about to lapse.
   */
  @Cron('0 8 * * *')
  async warnExpiringContracts() {
    const settings =
      await this.prisma.appSetting.findUnique({
        where: {
          id: 'singleton',
        },
      });

    const days =
      settings?.contractExpiryWarningDays ?? 30;

    const cutoff = new Date(
      Date.now() + days * 86_400_000,
    );

    const expiring =
      await this.prisma.presenterBrand.findMany({
        where: {
          contractStatus: 'SIGNED',

          contractExpiresAt: {
            not: null,
            lte: cutoff,
            gte: new Date(),
          },
        },

        include: {
          presenter: true,
          brand: true,
        },
      });

    if (expiring.length === 0) {
      return;
    }

    const admins = await this.prisma.user.findMany({
      where: {
        role: {
          in: ['ADMIN', 'PRODUCER'],
        },
        isActive: true,
      },

      select: {
        id: true,
      },
    });

    await this.prisma.notification.createMany({
      data: admins.flatMap((admin) =>
        expiring.map((contract) => ({
          userId: admin.id,

          type: 'CONTRACT_EXPIRING' as const,

          title:
            `${contract.presenter.displayName}'s ` +
            `${contract.brand.name} contract expires soon`,

          body:
            `Expires ` +
            `${contract.contractExpiresAt!.toDateString()}.`,

          linkUrl:
            `/presenters/${contract.presenterId}` +
            `?tab=contracts`,
        })),
      ),
    });
  }
}
