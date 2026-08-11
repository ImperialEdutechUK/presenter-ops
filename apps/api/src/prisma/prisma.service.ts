import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();

    if (process.env.LOG_SLOW_QUERIES === 'true') {
      // Surfacing slow queries early is cheaper than discovering them in prod.
      (this as any).$on('query', (e: { duration: number; query: string }) => {
        if (e.duration > 200) {
          this.logger.warn(`Slow query ${e.duration}ms: ${e.query.slice(0, 300)}`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
