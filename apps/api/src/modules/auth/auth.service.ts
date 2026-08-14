import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '@presenter-ops/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Sign in
  // -------------------------------------------------------------------------

  async validateCredentials(
    email: string,
    password: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: email.toLowerCase().trim(),
      },
    });

    const hash =
      user?.passwordHash ??
      '$argon2id$v=19$m=65536,t=3,p=4$notarealsalt$notarealhash';

    let ok = false;

    try {
      ok = await argon2.verify(hash, password);
    } catch {
      ok = false;
    }

    if (!user || !ok || !user.isActive) {
      throw new UnauthorizedException(
        'Email or password is incorrect.',
      );
    }

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
    });

    return user;
  }

  async issueTokens(
    userId: string,
    context: {
      ip?: string;
      userAgent?: string;
    } = {},
  ) {
    const accessToken =
      await this.jwt.signAsync(
        {
          sub: userId,
        },
        {
          expiresIn:
            this.config.get<string>(
              'auth.accessTokenTtl',
            ),
        },
      );

    const raw =
      randomBytes(48).toString('base64url');

    const ttlDays =
      this.config.get<number>(
        'auth.refreshTokenTtlDays',
      )!;

    const expiresAt =
      new Date(
        Date.now() +
          ttlDays * 86_400_000,
      );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(raw),
        expiresAt,
        ip: context.ip,
        userAgent: context.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken: raw,
      refreshExpiresAt: expiresAt,
    };
  }

  async rotateRefreshToken(
    raw: string,
    context: {
      ip?: string;
      userAgent?: string;
    } = {},
  ) {
    const record =
      await this.prisma.refreshToken.findUnique({
        where: {
          tokenHash: sha256(raw),
        },
        include: {
          user: true,
        },
      });

    if (
      !record ||
      record.revokedAt ||
      record.expiresAt < new Date()
    ) {
      throw new UnauthorizedException(
        'Session expired. Please sign in again.',
      );
    }

    await this.prisma.refreshToken.update({
      where: {
        id: record.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return this.issueTokens(
      record.userId,
      context,
    );
  }

  async revokeAllSessions(
    userId: string,
  ) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  // -------------------------------------------------------------------------
  // Invitations
  // -------------------------------------------------------------------------

  async invite(
    input: {
      email: string;
      name: string;
      role: Role;
      presenterId?: string;
    },
    invitedById: string,
  ) {
    const email =
      input.email.toLowerCase().trim();

    const existing =
      await this.prisma.user.findUnique({
        where: {
          email,
        },
      });

    if (existing) {
      throw new BadRequestException(
        'Someone with that email already has an account.',
      );
    }

    if (
      input.role === 'PRESENTER' &&
      !input.presenterId
    ) {
      throw new BadRequestException(
        'A presenter login has to be linked to a presenter profile. Create the profile first.',
      );
    }

    if (input.presenterId) {
      const presenter =
        await this.prisma.presenter.findUnique({
          where: {
            id: input.presenterId,
          },
          select: {
            id: true,
            email: true,
            userId: true,
          },
        });

      if (!presenter) {
        throw new BadRequestException(
          'Presenter profile not found.',
        );
      }

      if (presenter.userId) {
        throw new BadRequestException(
          'This presenter already has portal access.',
        );
      }

      if (
        presenter.email
          .toLowerCase()
          .trim() !== email
      ) {
        throw new BadRequestException(
          'The invitation email must match the presenter profile email.',
        );
      }
    }

    const raw =
      randomBytes(32).toString(
        'base64url',
      );

    const ttlDays =
      this.config.get<number>(
        'auth.inviteTtlDays',
      )!;

    const expiresAt =
      new Date(
        Date.now() +
          ttlDays * 86_400_000,
      );

    const invitation =
      await this.prisma.$transaction(
        async (tx) => {
          /*
           * Delete any previous invitation for
           * this presenter before creating a
           * new one.
           *
           * This makes "Retry invitation"
           * generate a completely new token.
           */
          if (input.presenterId) {
            await tx.invitation.deleteMany({
              where: {
                presenterId:
                  input.presenterId,
              },
            });
          }

          return tx.invitation.create({
            data: {
              email,
              role: input.role,
              presenterId:
                input.presenterId ??
                null,
              tokenHash: sha256(raw),
              invitedById,
              expiresAt,
            },
          });
        },
      );

    const appUrl =
      this.config.get<string>('appUrl');

    const url =
      `${appUrl}` +
      `/accept-invite?token=${raw}`;

    /*
     * Presenter account invitations use
     * EmailJS instead of SMTP.
     */
    const emailSent =
      await this.notifications
        .sendInvitationEmail({
          to: email,
          toName: input.name,
          activationUrl: url,
          expiryDays: ttlDays,
        });

    return {
      id: invitation.id,
      email,
      expiresAt:
        invitation.expiresAt,
      emailSent,

      ...(this.config.get('env') ===
      'development'
        ? {
            devToken: raw,
          }
        : {}),
    };
  }

  async acceptInvite(
    token: string,
    password: string,
    name?: string,
  ) {
    const invitation =
      await this.prisma.invitation.findUnique({
        where: {
          tokenHash: sha256(token),
        },
      });

    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt <
        new Date()
    ) {
      throw new BadRequestException(
        'That invitation link is no longer valid. Ask for a new one.',
      );
    }

    const existingUser =
      await this.prisma.user.findUnique({
        where: {
          email: invitation.email,
        },
      });

    if (existingUser) {
      throw new BadRequestException(
        'An account already exists for this email address.',
      );
    }

    const passwordHash =
      await argon2.hash(
        password,
        {
          type: argon2.argon2id,
        },
      );

    const user =
      await this.prisma.$transaction(
        async (tx) => {
          const created =
            await tx.user.create({
              data: {
                email:
                  invitation.email,
                name:
                  name ??
                  invitation.email.split(
                    '@',
                  )[0],
                passwordHash,
                role:
                  invitation.role,
                isActive: true,
              },
            });

          if (
            invitation.presenterId
          ) {
            await tx.presenter.update({
              where: {
                id:
                  invitation.presenterId,
              },
              data: {
                userId:
                  created.id,
              },
            });
          }

          await tx.invitation.update({
            where: {
              id:
                invitation.id,
            },
            data: {
              acceptedAt:
                new Date(),
            },
          });

          return created;
        },
      );

    return user;
  }

  // -------------------------------------------------------------------------
  // Password management
  // -------------------------------------------------------------------------

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user =
      await this.prisma.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
      });

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'Current password is incorrect.',
      );
    }

    let passwordMatches = false;

    try {
      passwordMatches =
        await argon2.verify(
          user.passwordHash,
          currentPassword,
        );
    } catch {
      passwordMatches = false;
    }

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Current password is incorrect.',
      );
    }

    const passwordHash =
      await argon2.hash(
        newPassword,
        {
          type: argon2.argon2id,
        },
      );

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        passwordHash,
      },
    });

    await this.revokeAllSessions(
      userId,
    );
  }
}

function sha256(
  value: string,
): string {
  return createHash('sha256')
    .update(value)
    .digest('hex');
}
