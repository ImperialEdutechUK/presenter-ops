import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Turns every thrown thing into the same JSON envelope, so the web app has
 * exactly one error shape to handle. Prisma's own errors are translated into
 * something a human can act on rather than "Unique constraint failed on the
 * fields: (`email`)".
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) ?? randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = {
      statusCode: status,
      error: 'InternalServerError',
      message: 'Something went wrong. The team has been notified.',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      body =
        typeof payload === 'string'
          ? { statusCode: status, error: exception.name, message: payload }
          : { statusCode: status, error: exception.name, ...(payload as object) };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const target = (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'value';
          body = {
            statusCode: status,
            error: 'Conflict',
            message: `That ${target} is already in use.`,
          };
          break;
        }
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          body = { statusCode: status, error: 'NotFound', message: 'That record no longer exists.' };
          break;
        case 'P2003':
          status = HttpStatus.CONFLICT;
          body = {
            statusCode: status,
            error: 'Conflict',
            message:
              'Something else still references this record, so it cannot be removed. Archive it instead.',
          };
          break;
        default:
          this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
      }
    } else if (exception instanceof Error) {
      this.logger.error(`${request.method} ${request.url} — ${exception.message}`, exception.stack);
    }

    if (status >= 500) {
      this.logger.error(`[${requestId}] ${request.method} ${request.url} → ${status}`);
    }

    response.status(status).json({ ...body, requestId });
  }
}
