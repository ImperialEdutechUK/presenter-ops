import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

/**
 * Validates a request body / query against a Zod schema from the shared
 * package, and returns the PARSED value (with defaults applied and strings
 * coerced) rather than the raw input.
 *
 * Errors come back as a flat map keyed by dotted path so the web form can
 * attach each message to the right field without any client-side mapping:
 *
 *   { "fieldErrors": { "contracts.0.rate": ["Expected number, received string"] } }
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of error.errors) {
          const path = issue.path.join('.') || '_root';
          (fieldErrors[path] ??= []).push(issue.message);
        }
        throw new BadRequestException({
          statusCode: 400,
          error: 'ValidationError',
          message: 'Some fields need attention.',
          fieldErrors,
        });
      }
      throw error;
    }
  }
}

/** Convenience so controllers read `@Body(zodBody(createPresenterSchema))`. */
export const zodBody = (schema: ZodSchema) => new ZodValidationPipe(schema);
export const zodQuery = (schema: ZodSchema) => new ZodValidationPipe(schema);
