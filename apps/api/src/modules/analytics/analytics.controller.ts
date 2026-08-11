import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { formatMoney, suggestPresentersSchema, workloadQuerySchema } from '@presenter-ops/shared';

import { AnalyticsService } from './analytics.service';
import { Roles } from '../../common/decorators';
import { zodQuery } from '../../common/pipes/zod-validation.pipe';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Roles('ADMIN', 'PRODUCER', 'MARKETING', 'FINANCE', 'VIEWER')
  @Get('dashboard')
  dashboard(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analytics.dashboard({ from, to });
  }

  @Roles('ADMIN', 'PRODUCER', 'MARKETING', 'FINANCE', 'VIEWER')
  @Get('workload')
  workload(@Query(zodQuery(workloadQuerySchema)) query: any) {
    return this.analytics.workload(query);
  }

  @Roles('ADMIN', 'PRODUCER')
  @Get('suggest-presenters')
  suggest(@Query(zodQuery(suggestPresentersSchema)) query: any) {
    return this.analytics.suggestPresenters(query);
  }

  @Roles('ADMIN', 'PRODUCER', 'FINANCE')
  @Get('reports/presenters')
  report(@Query('from') from: string, @Query('to') to: string, @Query('brandId') brandId?: string) {
    return this.analytics.presenterReport({
      from: new Date(from),
      to: new Date(to),
      brandId: brandId ? brandId.split(',') : undefined,
    });
  }

  /** CSV for finance. Streams rather than buffering the whole file. */
  @Roles('ADMIN', 'PRODUCER', 'FINANCE')
  @Get('reports/presenters.csv')
  async reportCsv(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
    @Query('brandId') brandId?: string,
  ) {
    const rows = await this.analytics.presenterReport({
      from: new Date(from),
      to: new Date(to),
      brandId: brandId ? brandId.split(',') : undefined,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="presenter-report-${from.slice(0, 10)}-to-${to.slice(0, 10)}.csv"`,
    );

    res.write(
      'Presenter,Assignments,Deliverables,Completed,On time,Median turnaround (hours),Total fees\n',
    );
    for (const r of rows) {
      const median = r.medianTurnaround ? (r.medianTurnaround / 60).toFixed(1) : '';
      res.write(
        [
          csvEscape(r.displayName),
          Number(r.assignments),
          Number(r.deliverables ?? 0),
          Number(r.completed),
          Number(r.onTime),
          median,
          formatMoney(Number(r.totalFee ?? 0), r.currency ?? 'GBP'),
        ].join(',') + '\n',
      );
    }
    res.end();
  }
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
