import { Injectable } from '@nestjs/common';
import { derivePerformance, parseMoneyToMinor } from '@presenter-ops/shared';

import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators';

/**
 * Marketing's side of the record: how the finished video actually performed.
 *
 * Numbers are stored as SNAPSHOTS keyed by (assignment, platform, date) rather
 * than being overwritten. A video with 400 views on day 1 and 40,000 on day 90
 * is a different story from one that got 40,000 immediately, and only snapshots
 * can tell them apart.
 */
@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async record(assignmentId: string, input: any, actor: AuthenticatedUser) {
    const measuredOn = new Date(input.measuredOn);

    const metric = await this.prisma.performanceMetric.upsert({
      where: {
        assignmentId_platform_measuredOn: {
          assignmentId,
          platform: input.platform,
          measuredOn,
        },
      },
      create: {
        assignmentId,
        platform: input.platform,
        contentUrl: input.contentUrl ?? null,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
        measuredOn,
        ...this.numericFields(input),
        recordedById: actor.id,
      },
      update: {
        contentUrl: input.contentUrl ?? null,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
        ...this.numericFields(input),
        recordedById: actor.id,
      },
      include: { recordedBy: { select: { id: true, name: true } } },
    });

    await this.prisma.assignmentEvent.create({
      data: {
        assignmentId,
        actorId: actor.id,
        type: 'PERFORMANCE_RECORDED',
        payload: { platform: input.platform, measuredOn: input.measuredOn },
      },
    });

    return metric;
  }

  private numericFields(input: any) {
    return {
      impressions: input.impressions ?? null,
      views: input.views ?? null,
      uniqueViewers: input.uniqueViewers ?? null,
      watchTimeMinutes: input.watchTimeMinutes ?? null,
      avgViewDurationSeconds: input.avgViewDurationSeconds ?? null,
      likes: input.likes ?? null,
      comments: input.comments ?? null,
      shares: input.shares ?? null,
      clicks: input.clicks ?? null,
      leads: input.leads ?? null,
      conversions: input.conversions ?? null,
      spendMinor:
        input.spend === null || input.spend === undefined || input.spend === ''
          ? null
          : parseMoneyToMinor(input.spend, input.currency),
      revenueMinor:
        input.revenue === null || input.revenue === undefined || input.revenue === ''
          ? null
          : parseMoneyToMinor(input.revenue, input.currency),
      currency: input.currency,
      notes: input.notes ?? null,
    };
  }

  async listForAssignment(assignmentId: string) {
    const [assignment, metrics] = await this.prisma.$transaction([
      this.prisma.assignment.findUniqueOrThrow({
        where: { id: assignmentId },
        select: { totalFeeMinor: true },
      }),
      this.prisma.performanceMetric.findMany({
        where: { assignmentId },
        orderBy: [{ platform: 'asc' }, { measuredOn: 'desc' }],
        include: { recordedBy: { select: { id: true, name: true } } },
      }),
    ]);

    return metrics.map((m) => ({
      ...m,
      derived: derivePerformance(m, assignment.totalFeeMinor),
    }));
  }

  /**
   * Aggregate performance for one presenter — the "how well do their videos do"
   * question. Uses only the LATEST snapshot per (assignment, platform) so a
   * video measured five times is not counted five times.
   */
  async summaryForPresenter(presenterId: string, months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const rows = await this.prisma.$queryRaw<
      {
        platform: string;
        assignments: bigint;
        views: bigint | null;
        impressions: bigint | null;
        watch: bigint | null;
        likes: bigint | null;
        comments: bigint | null;
        shares: bigint | null;
        clicks: bigint | null;
        conversions: bigint | null;
        spend: bigint | null;
        revenue: bigint | null;
      }[]
    >`
      WITH latest AS (
        SELECT DISTINCT ON (pm."assignmentId", pm."platform")
               pm.*
        FROM "PerformanceMetric" pm
        JOIN "Assignment" a ON a.id = pm."assignmentId"
        WHERE a."presenterId" = ${presenterId}
          AND pm."measuredOn" >= ${since}
        ORDER BY pm."assignmentId", pm."platform", pm."measuredOn" DESC
      )
      SELECT "platform",
             COUNT(DISTINCT "assignmentId")::bigint AS assignments,
             SUM("views")::bigint            AS views,
             SUM("impressions")::bigint      AS impressions,
             SUM("watchTimeMinutes")::bigint AS watch,
             SUM("likes")::bigint            AS likes,
             SUM("comments")::bigint         AS comments,
             SUM("shares")::bigint           AS shares,
             SUM("clicks")::bigint           AS clicks,
             SUM("conversions")::bigint      AS conversions,
             SUM("spendMinor")::bigint       AS spend,
             SUM("revenueMinor")::bigint     AS revenue
      FROM latest
      GROUP BY "platform"
      ORDER BY views DESC NULLS LAST
    `;

    return rows.map((r) => {
      const metric = {
        views: num(r.views),
        impressions: num(r.impressions),
        watchTimeMinutes: num(r.watch),
        likes: num(r.likes),
        comments: num(r.comments),
        shares: num(r.shares),
        clicks: num(r.clicks),
        conversions: num(r.conversions),
        spendMinor: num(r.spend),
        revenueMinor: num(r.revenue),
      };
      return {
        platform: r.platform,
        assignments: Number(r.assignments),
        ...metric,
        derived: derivePerformance(metric),
      };
    });
  }
}

function num(value: bigint | null): number | null {
  return value === null ? null : Number(value);
}
