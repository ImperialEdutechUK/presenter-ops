import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  computeWorkload,
  scorePresenters,
  type PresenterWorkloadInput,
} from '@presenter-ops/shared';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async settings() {
    return this.prisma.appSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
  }

  // ==========================================================================
  // Dashboard
  // ==========================================================================

  async dashboard(params: { from?: string; to?: string } = {}) {
    const settings = await this.settings();
    const to = params.to ? new Date(params.to) : new Date();
    const from = params.from ? new Date(params.from) : new Date(to.getTime() - 30 * 86_400_000);
    const now = new Date();
    const endOfWeek = new Date(now.getTime() + 7 * 86_400_000);

    const [
      activeAssignments,
      dueThisWeek,
      overdue,
      awaitingResponse,
      awaitingReview,
      completedInPeriod,
      committed,
    ] = await this.prisma.$transaction([
      this.prisma.assignment.count({ where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } } }),
      this.prisma.assignment.count({
        where: {
          status: { in: ACTIVE_ASSIGNMENT_STATUSES },
          dueAt: { gte: now, lte: endOfWeek },
        },
      }),
      this.prisma.assignment.count({
        where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES }, dueAt: { lt: now } },
      }),
      this.prisma.assignment.count({ where: { status: 'ASSIGNED' } }),
      this.prisma.assignment.count({ where: { status: { in: ['SUBMITTED', 'IN_REVIEW'] } } }),
      this.prisma.assignment.count({
        where: { status: { in: ['APPROVED', 'COMPLETED'] }, completedAt: { gte: from, lte: to } },
      }),
      this.prisma.assignment.aggregate({
        where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
        _sum: { totalFeeMinor: true },
      }),
    ]);

    // Median rather than mean: one job that sat for three months would drag a
    // mean turnaround somewhere useless.
    const medianRow = await this.prisma.$queryRaw<{ median: number | null }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "turnaroundMinutes") AS median
      FROM "Assignment"
      WHERE "turnaroundMinutes" IS NOT NULL
        AND "submittedAt" BETWEEN ${from} AND ${to}
    `;

    const onTimeRow = await this.prisma.$queryRaw<{ ontime: bigint; total: bigint }[]>`
      SELECT COUNT(*) FILTER (WHERE "latenessMinutes" <= 0)::bigint AS ontime,
             COUNT(*)::bigint AS total
      FROM "Assignment"
      WHERE "latenessMinutes" IS NOT NULL
        AND "submittedAt" BETWEEN ${from} AND ${to}
    `;

    const coldCutoff = new Date(Date.now() - settings.goingColdAfterDays * 86_400_000);
    const goingCold = await this.prisma.presenter.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ lastAssignedAt: null }, { lastAssignedAt: { lt: coldCutoff } }],
      },
      orderBy: { lastAssignedAt: { sort: 'asc', nulls: 'first' } },
      take: 10,
      select: { id: true, displayName: true, photoUrl: true, lastAssignedAt: true },
    });

    const expiryCutoff = new Date(
      Date.now() + settings.contractExpiryWarningDays * 86_400_000,
    );
    const contractsExpiringSoon = await this.prisma.presenterBrand.findMany({
      where: {
        contractStatus: 'SIGNED',
        contractExpiresAt: { not: null, lte: expiryCutoff, gte: new Date() },
      },
      orderBy: { contractExpiresAt: 'asc' },
      take: 10,
      include: {
        presenter: { select: { id: true, displayName: true } },
        brand: { select: { name: true } },
      },
    });

    const atRisk = await this.prisma.assignment.findMany({
      where: {
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        OR: [
          { dueAt: { lt: now } },
          { dueAt: { lte: new Date(now.getTime() + settings.dueSoonHours * 3_600_000) } },
          { status: 'ASSIGNED', assignedAt: { lt: new Date(now.getTime() - 48 * 3_600_000) } },
        ],
      },
      orderBy: [{ dueAt: 'asc' }],
      take: 15,
      include: {
        brand: { select: { id: true, name: true, colorHex: true } },
        presenter: { select: { id: true, displayName: true, photoUrl: true } },
        workType: { select: { id: true, name: true } },
      },
    });

    const throughput = await this.prisma.$queryRaw<
      { week: Date; assigned: bigint; completed: bigint }[]
    >`
      WITH weeks AS (
        SELECT generate_series(
          date_trunc('week', ${from}::timestamptz),
          date_trunc('week', ${to}::timestamptz),
          interval '1 week'
        ) AS week
      )
      SELECT w.week,
             COUNT(a.id) FILTER (WHERE date_trunc('week', a."assignedAt") = w.week)::bigint  AS assigned,
             COUNT(c.id) FILTER (WHERE date_trunc('week', c."completedAt") = w.week)::bigint AS completed
      FROM weeks w
      LEFT JOIN "Assignment" a ON date_trunc('week', a."assignedAt")  = w.week
      LEFT JOIN "Assignment" c ON date_trunc('week', c."completedAt") = w.week
      GROUP BY w.week
      ORDER BY w.week
    `;

    const recentActivity = await this.prisma.assignmentEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: {
        actor: { select: { id: true, name: true, avatarUrl: true } },
        assignment: { select: { id: true, reference: true, title: true } },
      },
    });

    const onTime = onTimeRow[0];

    return {
      generatedAt: new Date().toISOString(),
      period: { from: from.toISOString(), to: to.toISOString() },
      kpis: {
        activeAssignments,
        dueThisWeek,
        overdue,
        awaitingResponse,
        awaitingReview,
        completedInPeriod,
        committedSpendMinor: committed._sum.totalFeeMinor ?? 0,
        currency: settings.defaultCurrency,
        medianTurnaroundMinutes: medianRow[0]?.median ? Math.round(medianRow[0].median) : null,
        onTimeDeliveryPct:
          onTime && Number(onTime.total) > 0
            ? Number(((Number(onTime.ontime) / Number(onTime.total)) * 100).toFixed(1))
            : null,
      },
      goingCold,
      contractsExpiringSoon: contractsExpiringSoon.map((c) => ({
        presenterId: c.presenter.id,
        presenterName: c.presenter.displayName,
        brandName: c.brand.name,
        expiresAt: c.contractExpiresAt,
      })),
      atRisk,
      recentActivity,
      throughputByWeek: throughput.map((t) => ({
        weekStart: t.week.toISOString().slice(0, 10),
        assigned: Number(t.assigned),
        completed: Number(t.completed),
      })),
    };
  }

  // ==========================================================================
  // Workload balance — "are we giving everyone enough?"
  // ==========================================================================

  async workload(params: { from?: string; to?: string; brandId?: string[]; includeInactive?: boolean }) {
    const settings = await this.settings();
    const to = params.to ? new Date(params.to) : new Date();
    const from = params.from ? new Date(params.from) : new Date(to.getTime() - 30 * 86_400_000);

    const presenters = await this.prisma.presenter.findMany({
      where: {
        status: params.includeInactive ? { in: ['ACTIVE', 'ONBOARDING', 'PAUSED'] } : 'ACTIVE',
        ...(params.brandId?.length ? { contracts: { some: { brandId: { in: params.brandId } } } } : {}),
      },
      select: {
        id: true,
        displayName: true,
        photoUrl: true,
        capacityWeight: true,
        targetDeliverablesPerMonth: true,
        lastAssignedAt: true,
      },
    });

    if (presenters.length === 0) {
      return computeWorkload([], { periodStart: from.toISOString(), periodEnd: to.toISOString() });
    }

    const ids = presenters.map((p) => p.id);
    const brandFilter = params.brandId?.length
      ? Prisma.sql`AND a."brandId" = ANY(${params.brandId})`
      : Prisma.empty;

    // Counted on assignedAt, not completedAt — the question is what we HANDED
    // OUT in the period, which is the thing we control.
    const rows = await this.prisma.$queryRaw<
      { presenterId: string; assignments: bigint; deliverables: bigint; earned: bigint | null }[]
    >`
      SELECT a."presenterId"                       AS "presenterId",
             COUNT(*)::bigint                      AS assignments,
             SUM(a."deliverableCount")::bigint     AS deliverables,
             SUM(COALESCE(a."totalFeeMinor",0))::bigint AS earned
      FROM "Assignment" a
      WHERE a."presenterId" = ANY(${ids})
        AND a."assignedAt" BETWEEN ${from} AND ${to}
        AND a."status" NOT IN ('CANCELLED','DECLINED','DRAFT')
        ${brandFilter}
      GROUP BY a."presenterId"
    `;

    const active = await this.prisma.assignment.groupBy({
      by: ['presenterId'],
      where: { presenterId: { in: ids }, status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
      _count: { _all: true },
    });

    const byId = new Map(rows.map((r) => [r.presenterId, r]));
    const activeById = new Map(active.map((a) => [a.presenterId!, a._count._all]));

    const inputs: PresenterWorkloadInput[] = presenters.map((p) => {
      const row = byId.get(p.id);
      return {
        presenterId: p.id,
        displayName: p.displayName,
        photoUrl: p.photoUrl,
        capacityWeight: Number(p.capacityWeight),
        targetDeliverablesPerMonth: p.targetDeliverablesPerMonth,
        deliverablesInPeriod: row ? Number(row.deliverables) : 0,
        assignmentsInPeriod: row ? Number(row.assignments) : 0,
        activeAssignments: activeById.get(p.id) ?? 0,
        earnedMinor: row ? Number(row.earned ?? 0) : 0,
        lastAssignedAt: p.lastAssignedAt?.toISOString() ?? null,
      };
    });

    return computeWorkload(inputs, {
      periodStart: from.toISOString(),
      periodEnd: to.toISOString(),
      thresholds: {
        under: Number(settings.workloadUnderThreshold),
        over: Number(settings.workloadOverThreshold),
      },
    });
  }

  // ==========================================================================
  // Who should get this job?
  // ==========================================================================

  /**
   * Returns a ranked shortlist with the reasoning attached, plus the people who
   * were excluded and why — the exclusions matter as much as the ranking,
   * because "she isn't in the list" is otherwise unexplainable.
   */
  async suggestPresenters(params: { brandId: string; workTypeId?: string; dueAt?: string; limit: number }) {
    const dueDate = params.dueAt ? new Date(params.dueAt) : null;

    const candidates = await this.prisma.presenter.findMany({
      where: { contracts: { some: { brandId: params.brandId } } },
      include: {
        contracts: { where: { brandId: params.brandId } },
        availability: dueDate
          ? { where: { type: 'UNAVAILABLE', startDate: { lte: dueDate }, endDate: { gte: dueDate } } }
          : false,
        _count: {
          select: { assignments: { where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } } } },
        },
      },
    });

    const workload = await this.workload({ brandId: [params.brandId] });
    const balanceById = new Map(workload.rows.map((r) => [r.presenterId, r]));

    const excluded: { presenterId: string; displayName: string; reason: string }[] = [];
    const eligible = candidates.filter((p) => {
      if (p.status !== 'ACTIVE') {
        excluded.push({
          presenterId: p.id,
          displayName: p.displayName,
          reason: `Status is ${p.status.toLowerCase()}`,
        });
        return false;
      }
      if (p.contracts[0]?.contractStatus !== 'SIGNED') {
        excluded.push({
          presenterId: p.id,
          displayName: p.displayName,
          reason: 'No signed contract for this brand',
        });
        return false;
      }
      if (dueDate && Array.isArray(p.availability) && p.availability.length > 0) {
        excluded.push({
          presenterId: p.id,
          displayName: p.displayName,
          reason: 'Marked unavailable on the due date',
        });
        return false;
      }
      return true;
    });

    const scored = scorePresenters(
      eligible.map((p) => ({
        presenterId: p.id,
        displayName: p.displayName,
        balanceIndex: balanceById.get(p.id)?.balanceIndex ?? null,
        daysSinceLastAssigned: balanceById.get(p.id)?.daysSinceLastAssigned ?? null,
        avgRating: p.avgRating === null ? null : Number(p.avgRating),
        onTimeDeliveryPct: p.onTimeDeliveryPct === null ? null : Number(p.onTimeDeliveryPct),
        activeAssignments: p._count.assignments,
      })),
    );

    const byId = new Map(candidates.map((c) => [c.id, c]));

    return {
      suggestions: scored.slice(0, params.limit).map((s) => {
        const presenter = byId.get(s.presenterId)!;
        const contract = presenter.contracts[0];
        return {
          ...s,
          photoUrl: presenter.photoUrl,
          rateMinor: contract?.rateMinor ?? presenter.defaultRateMinor,
          rateUnit: contract?.rateUnit ?? presenter.defaultRateUnit,
          currency: contract?.currency ?? presenter.defaultCurrency,
          rateIsInherited: !contract?.rateMinor,
        };
      }),
      excluded,
      methodology:
        'Deterministic score out of 100: under-allocation 40, time since last assigned 20, ' +
        'average feedback rating 20, on-time delivery 20. Presenters with no history score the ' +
        'neutral midpoint on the history-based components. This is a ranking aid, not a decision.',
    };
  }

  // ==========================================================================
  // Reports
  // ==========================================================================

  /** Per-presenter delivery report for a period — the export finance asks for. */
  async presenterReport(params: { from: Date; to: Date; brandId?: string[] }) {
    const brandFilter = params.brandId?.length
      ? Prisma.sql`AND a."brandId" = ANY(${params.brandId})`
      : Prisma.empty;

    return this.prisma.$queryRaw<
      {
        presenterId: string;
        displayName: string;
        assignments: bigint;
        deliverables: bigint;
        completed: bigint;
        onTime: bigint;
        medianTurnaround: number | null;
        totalFee: bigint | null;
        currency: string;
      }[]
    >`
      SELECT p.id                                   AS "presenterId",
             p."displayName"                        AS "displayName",
             COUNT(a.id)::bigint                    AS assignments,
             SUM(a."deliverableCount")::bigint      AS deliverables,
             COUNT(a.id) FILTER (WHERE a."status" IN ('APPROVED','COMPLETED'))::bigint AS completed,
             COUNT(a.id) FILTER (WHERE a."latenessMinutes" <= 0)::bigint               AS "onTime",
             percentile_cont(0.5) WITHIN GROUP (ORDER BY a."turnaroundMinutes")        AS "medianTurnaround",
             SUM(COALESCE(a."totalFeeMinor",0))::bigint AS "totalFee",
             MAX(a."feeCurrency")                   AS currency
      FROM "Presenter" p
      LEFT JOIN "Assignment" a
        ON a."presenterId" = p.id
       AND a."assignedAt" BETWEEN ${params.from} AND ${params.to}
       AND a."status" NOT IN ('CANCELLED','DECLINED','DRAFT')
       ${brandFilter}
      GROUP BY p.id, p."displayName"
      HAVING COUNT(a.id) > 0
      ORDER BY deliverables DESC
    `;
  }
}
