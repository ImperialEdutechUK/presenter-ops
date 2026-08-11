import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { acceptInviteSchema, inviteUserSchema, loginSchema } from '@presenter-ops/shared';

import { AuthService } from './auth.service';
import { CurrentUser, Public, Roles, type AuthenticatedUser } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(zodBody(loginSchema)) body: { email: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.validateCredentials(body.email, body.password);
    const tokens = await this.auth.issueTokens(user.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setCookies(res, tokens);
    return this.me({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      presenterId: null,
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.po_refresh;
    const tokens = await this.auth.rotateRefreshToken(raw, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setCookies(res, tokens);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeAllSessions(user.id);
    res.clearCookie('po_access', this.cookieOptions());
    res.clearCookie('po_refresh', this.cookieOptions());
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        timezone: true,
        presenter: { select: { id: true, displayName: true, photoUrl: true } },
      },
    });
    return {
      ...record,
      presenterId: record.presenter?.id ?? null,
    };
  }

  @Roles('ADMIN', 'PRODUCER')
  @Post('invite')
  invite(
    @Body(zodBody(inviteUserSchema))
    body: { email: string; name: string; role: any; presenterId?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.auth.invite(body, user.id);
  }

  @Public()
  @Post('accept-invite')
  @HttpCode(200)
  async acceptInvite(
    @Body(zodBody(acceptInviteSchema)) body: { token: string; password: string; name?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.acceptInvite(body.token, body.password, body.name);
    const tokens = await this.auth.issueTokens(user.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setCookies(res, tokens);
    return { ok: true };
  }

  // -------------------------------------------------------------------------

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get<boolean>('auth.cookieSecure'),
      sameSite: this.config.get<'none' | 'lax' | 'strict'>('auth.cookieSameSite'),
      domain: this.config.get<string | undefined>('auth.cookieDomain'),
      path: '/',
    } as const;
  }

  private setCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
  ) {
    // httpOnly means JavaScript on the page can never read the token, which
    // removes the entire class of "XSS steals the session" attacks. The trade
    // is that the frontend must call the API with credentials: 'include'.
    res.cookie('po_access', tokens.accessToken, { ...this.cookieOptions(), maxAge: 15 * 60_000 });
    res.cookie('po_refresh', tokens.refreshToken, {
      ...this.cookieOptions(),
      expires: tokens.refreshExpiresAt,
    });
  }
}
