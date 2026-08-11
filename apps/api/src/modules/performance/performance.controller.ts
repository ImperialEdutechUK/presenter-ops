import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { performanceSchema } from '@presenter-ops/shared';

import { PerformanceService } from './performance.service';
import { Audit, CurrentUser, Roles, type AuthenticatedUser } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';

@ApiTags('performance')
@Controller()
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Roles('ADMIN', 'PRODUCER', 'MARKETING')
  @Audit('performance.recorded')
  @Post('assignments/:id/performance')
  record(
    @Param('id') id: string,
    @Body(zodBody(performanceSchema)) body: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.performance.record(id, body, user);
  }

  @Roles('ADMIN', 'PRODUCER', 'MARKETING', 'FINANCE', 'VIEWER')
  @Get('assignments/:id/performance')
  list(@Param('id') id: string) {
    return this.performance.listForAssignment(id);
  }

  @Roles('ADMIN', 'PRODUCER', 'MARKETING', 'FINANCE', 'VIEWER')
  @Get('presenters/:id/performance')
  summary(@Param('id') id: string, @Query('months') months?: string) {
    return this.performance.summaryForPresenter(id, months ? Number(months) : 12);
  }
}
