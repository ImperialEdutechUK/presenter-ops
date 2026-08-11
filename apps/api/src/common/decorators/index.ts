import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@presenter-ops/shared';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as reachable without a session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restricts a route to the listed roles. Absent = any authenticated user. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const AUDIT_KEY = 'audit';
/** Records an AuditLog row on success, e.g. @Audit('assignment.transition'). */
export const Audit = (action: string) => SetMetadata(AUDIT_KEY, action);

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Present only for PRESENTER-role users. */
  presenterId: string | null;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    return data ? user?.[data] : user;
  },
);
