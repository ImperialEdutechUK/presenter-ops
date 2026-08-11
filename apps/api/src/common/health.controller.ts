import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from './decorators';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness — Railway uses this to decide whether to restart the container. */
  @Public()
  @Get()
  live() {
    return { status: 'ok', uptime: process.uptime() };
  }

  /** Readiness — includes a real database round trip. */
  @Public()
  @Get('ready')
  async ready() {
    const start = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'reachable', latencyMs: Date.now() - start };
  }
}
