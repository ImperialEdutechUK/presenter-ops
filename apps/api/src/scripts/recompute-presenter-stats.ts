/**
 * Rebuilds every presenter's denormalised statistics from source data.
 *
 * The Presenter table caches completedAssignments, avgTurnaroundMinutes,
 * avgRating, onTimeDeliveryPct and lastAssignedAt so the directory can sort on
 * them without an aggregate per row. Caches drift — after a bulk import, a
 * manual database edit, or a bug. This script is the reset button, and its
 * existence is what makes the denormalisation a reasonable trade rather than a
 * liability.
 *
 *   npm run recompute:presenter-stats
 *
 * Safe to run at any time; it only writes to the five cached columns.
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const presenters = await prisma.presenter.findMany({ select: { id: true, displayName: true } });
  console.log(`Recomputing statistics for ${presenters.length} presenters…`);

  let changed = 0;

  for (const presenter of presenters) {
    const [agg, ratingAgg, timing, lastAssigned] = await Promise.all([
      prisma.assignment.aggregate({
        where: { presenterId: presenter.id, status: { in: ['APPROVED', 'COMPLETED'] } },
        _count: { _all: true },
        _avg: { turnaroundMinutes: true },
        _max: { completedAt: true },
      }),
      prisma.feedback.aggregate({
        where: { presenterId: presenter.id },
        _avg: { overallRating: true },
      }),
      prisma.assignment.findMany({
        where: {
          presenterId: presenter.id,
          submittedAt: { not: null },
          dueAt: { not: null },
          status: { notIn: ['CANCELLED', 'DECLINED', 'DRAFT'] },
        },
        select: { latenessMinutes: true },
      }),
      prisma.assignment.findFirst({
        where: { presenterId: presenter.id, assignedAt: { not: null } },
        orderBy: { assignedAt: 'desc' },
        select: { assignedAt: true },
      }),
    ]);

    const onTime = timing.filter((t) => (t.latenessMinutes ?? 0) <= 0).length;

    await prisma.presenter.update({
      where: { id: presenter.id },
      data: {
        completedAssignments: agg._count._all,
        avgTurnaroundMinutes: agg._avg.turnaroundMinutes
          ? Math.round(agg._avg.turnaroundMinutes)
          : null,
        lastCompletedAt: agg._max.completedAt,
        lastAssignedAt: lastAssigned?.assignedAt ?? null,
        avgRating: ratingAgg._avg.overallRating
          ? new Prisma.Decimal(ratingAgg._avg.overallRating.toFixed(2))
          : null,
        onTimeDeliveryPct:
          timing.length > 0
            ? new Prisma.Decimal(((onTime / timing.length) * 100).toFixed(2))
            : null,
      },
    });

    changed++;
    console.log(
      `  ${presenter.displayName}: ${agg._count._all} completed, ` +
        `${timing.length} measurable for on-time`,
    );
  }

  console.log(`Updated ${changed} presenters.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
