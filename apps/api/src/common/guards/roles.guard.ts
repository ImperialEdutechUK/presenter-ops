import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@presenter-ops/shared';

import { IS_PUBLIC_KEY, ROLES_KEY, type AuthenticatedUser } from '../decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user: AuthenticatedUser = context.switchToHttp().getRequest().user;
    if (!user) return false;

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `This action needs one of these roles: ${required.join(', ')}. Yours is ${user.role}.`,
      );
    }
    return true;
  }
}
