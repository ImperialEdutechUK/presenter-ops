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

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Always run a hash comparison even when the user does not exist, so the
    // response time does not reveal which emails are registered.
    const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$notarealsalt$notarealhash';
    let ok = false;
    try {
      ok = await argon2.verify(hash, password);
    } catch {
      ok = false;
    }

    if (!user || !ok || !user.isActive) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return user;
  }

  async issueTokens(userId: string, context: { ip?: string; userAgent?: string } = {}) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { expiresIn: this.config.get<string>('auth.accessTokenTtl') },
    );

    const raw = randomBytes(48).toString('base64url');
    const ttlDays = this.config.get<number>('auth.refreshTokenTtlDays')!;
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(raw),
        expiresAt,
        ip: context.ip,
        userAgent: context.userAgent,
      },
    });

    return { accessToken, refreshToken: raw, refreshExpiresAt: expiresAt };
  }

  /** Rotates the refresh token: the old one is revoked as the new one is made. */
  async rotateRefreshToken(raw: string, context: { ip?: string; userAgent?: string } = {}) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(raw) },
      include: { user: true },
    });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    // A revoked token being presented again means it was stolen and replayed.
    // Kill every session for that user rather than just refusing this one.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(record.userId, context);
  }

  async revokeAllSessions(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // Invitations — how both staff and presenters get an account
  // -------------------------------------------------------------------------

  async invite(input: { email: string; name: string; role: Role; presenterId?: string }, invitedById: string) {
    const email = input.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('Someone with that email already has an account.');

    if (input.role === 'PRESENTER' && !input.presenterId) {
      throw new BadRequestException(
        'A presenter login has to be linked to a presenter profile. Create the profile first.',
      );
    }

    const raw = randomBytes(32).toString('base64url');
    const ttlDays = this.config.get<number>('auth.inviteTtlDays')!;

    const invitation = await this.prisma.invitation.create({
      data: {
        email,
        role: input.role,
        presenterId: input.presenterId ?? null,
        tokenHash: sha256(raw),
        invitedById,
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      },
    });

    const url = `${this.config.get<string>('appUrl')}/accept-invite?token=${raw}`;
    await this.notifications.sendEmail({
      to: email,
      subject: `You have been invited to ${process.env.ORG_NAME ?? 'PresenterOps'}`,
      text:
        `Hello ${input.name},\n\n` +
        `You have been given access to the presenter management system.\n\n` +
        `Set your password here (the link is valid for ${ttlDays} days):\n${url}\n`,
    });

    // The raw token is returned only so a developer can copy it in local dev
    // when SMTP is off. It is never logged or returned in production.
    return {
      id: invitation.id,
      email,
      expiresAt: invitation.expiresAt,
      ...(this.config.get('env') === 'development' ? { devToken: raw } : {}),
    };
  }

  async acceptInvite(token: string, password: string, name?: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
    });

    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      throw new BadRequestException('That invitation link is no longer valid. Ask for a new one.');
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: invitation.email,
          name: name ?? invitation.email.split('@')[0],
          passwordHash,
          role: invitation.role,
        },
      });

      if (invitation.presenterId) {
        await tx.presenter.update({
          where: { id: invitation.presenterId },
          data: { userId: created.id },
        });
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return created;
    });

    return user;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(newPassword, { type: argon2.argon2id }) },
    });
    await this.revokeAllSessions(userId);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
