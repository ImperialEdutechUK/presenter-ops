import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';

import { AUDIT_KEY, type AuthenticatedUser } from '../decorators';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Writes an AuditLog row for any handler decorated with @Audit('...').
 *
 * Deliberately fire-and-forget: an audit write must never fail the request the
 * user actually made. Failures are logged, not surfaced.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string>(AUDIT_KEY, context.getHandler());
    if (!action) return next.handle();

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    return next.handle().pipe(
      tap((result) => {
        const entityId =
          (result as { id?: string })?.id ?? request.params?.id ?? 'unknown';
        const entityType = action.split('.')[0] ?? 'unknown';

        void this.prisma.auditLog
          .create({
            data: {
              actorId: user?.id ?? null,
              action,
              entityType,
              entityId,
              after: sanitise(result),
              ip: request.ip,
              userAgent: request.headers?.['user-agent'] ?? null,
            },
          })
          .catch(() => undefined);
      }),
    );
  }
}

/** Keeps audit rows small and free of anything sensitive. */
function sanitise(value: unknown): object | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const clone: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (['passwordHash', 'tokenHash', 'internalNotes'].includes(key)) continue;
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) clone[key] = v;
  }
  return clone;
}
