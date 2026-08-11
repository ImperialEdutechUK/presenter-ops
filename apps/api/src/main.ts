import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('bootstrap');

  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser(process.env.COOKIE_SECRET));

  // The web app runs on a different origin (Vercel) from the API (Railway), so
  // credentials must be explicitly allowed and the origin list pinned.
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  // Zod does the real validation (see ZodValidationPipe); this pipe only
  // handles the few class-based DTOs used by file upload multipart handling.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableShutdownHooks();

  if (process.env.ENABLE_SWAGGER !== 'false') {
    const config = new DocumentBuilder()
      .setTitle('PresenterOps API')
      .setDescription(
        'Freelance presenter profiles, work assignment, delivery tracking and performance.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('po_access')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on :${port} — docs at /api/docs`);
}

void bootstrap();
