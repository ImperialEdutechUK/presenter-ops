import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';

import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators';

/**
 * Accepts the access token from either an httpOnly cookie (browser) or an
 * Authorization header (server-to-server, Postman, the mobile app if one ever
 * exists). Cookie first, because that is the path that matters for XSS safety.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.po_access ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwtSecret')!,
    });
  }

  async validate(payload: { sub: string }): Promise<AuthenticatedUser> {
    // Re-reading the user on every request costs one indexed lookup and means
    // deactivating someone takes effect immediately rather than in 15 minutes.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        presenter: { select: { id: true } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('This account is no longer active.');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      presenterId: user.presenter?.id ?? null,
    };
  }
}
