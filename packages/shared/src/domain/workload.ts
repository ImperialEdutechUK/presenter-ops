/**
 * Workload distribution.
 *
 * This answers the question "when we assign work to several presenters, are we
 * giving each of them enough?". Every number here is computed with an explicit,
 * inspectable formula — the UI shows the formula in a tooltip next to the
 * figure, so nobody has to trust a black box.
 *
 * Definitions
 * -----------
 * period            the date range being looked at (e.g. last 30 days)
 * weight_p          Presenter.capacityWeight. 1.0 = a normal full share.
 *                   0.5 = someone who only wants half the usual amount.
 * delivered_p       number of deliverables assigned to presenter p in the
 *                   period, counting assignments that were not cancelled or
 *                   declined (see ACTIVE + DELIVERED status lists)
 * expectedShare_p   weight_p / Σ weight            — the fraction of the pool
 *                                                    this person "should" get
 * actualShare_p     delivered_p / Σ delivered      — the fraction they got
 * balanceIndex_p    actualShare_p / expectedShare_p
 *
 *   balanceIndex = 1.00  exactly their fair share
 *   balanceIndex = 0.50  they got half of what their weight implies
 *   balanceIndex = 2.00  they got double
 *
 * Thresholds are configurable in Settings (AppSetting.workloadUnderThreshold /
 * workloadOverThreshold); the defaults are 0.80 and 1.25.
 *
 * A separate `giniCoefficient` summarises the whole pool in one number:
 *   0.0 = every presenter got an identical weighted share
 *   1.0 = one presenter got everything
 * It is reported alongside the count of presenters so a small pool is not
 * over-interpreted — with fewer than 4 presenters the number is noisy and the
 * UI says so rather than displaying it as if it were meaningful.
 */

export interface PresenterWorkloadInput {
  presenterId: string;
  displayName: string;
  photoUrl?: string | null;
  capacityWeight: number;
  targetDeliverablesPerMonth?: number | null;
  /** Deliverables counted in the period (non-cancelled, non-declined). */
  deliverablesInPeriod: number;
  /** Assignments counted in the period. */
  assignmentsInPeriod: number;
  /** Assignments currently occupying them, regardless of period. */
  activeAssignments: number;
  /** Total agreed fees in the period, minor units, single currency. */
  earnedMinor: number;
  /** ISO date of the most recent assignedAt, or null if never assigned. */
  lastAssignedAt?: string | null;
}

export interface PresenterWorkloadRow extends PresenterWorkloadInput {
  expectedShare: number;
  actualShare: number;
  /** null when nothing at all was assigned in the period (0/0 is undefined). */
  balanceIndex: number | null;
  status: 'UNDER' | 'BALANCED' | 'OVER' | 'NO_DATA';
  /** How many more deliverables would bring them to exactly their fair share. */
  deliverablesToParity: number;
  daysSinceLastAssigned: number | null;
  /** Progress toward their own stated monthly target, 0–1+, null if no target. */
  targetProgress: number | null;
}

export interface WorkloadSummary {
  periodStart: string;
  periodEnd: string;
  presenterCount: number;
  totalDeliverables: number;
  totalAssignments: number;
  totalEarnedMinor: number;
  giniCoefficient: number | null;
  /** True when the pool is too small for the Gini number to mean much. */
  giniIsIndicativeOnly: boolean;
  underAllocated: number;
  overAllocated: number;
  rows: PresenterWorkloadRow[];
}

export interface WorkloadThresholds {
  under: number;
  over: number;
}

export const DEFAULT_WORKLOAD_THRESHOLDS: WorkloadThresholds = { under: 0.8, over: 1.25 };

function daysBetween(fromIso: string | null | undefined, to: Date): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return null;
  return Math.floor((to.getTime() - from) / 86_400_000);
}

/**
 * Gini coefficient of weighted shares.
 *
 * Standard formula on the sorted vector x of length n:
 *
 *   G = ( 2 · Σ i·x_i ) / ( n · Σ x_i )  −  (n + 1) / n      for i = 1..n
 *
 * We feed it `delivered_p / weight_p` (weight-adjusted output) so that a
 * part-time presenter receiving proportionally less is not counted as unfair.
 * Returns null when the total is zero.
 */
export function giniCoefficient(values: number[]): number | null {
  const n = values.length;
  if (n === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((acc, v) => acc + v, 0);
  if (total === 0) return null;

  let weightedSum = 0;
  for (let i = 0; i < n; i++) weightedSum += (i + 1) * sorted[i];

  const g = (2 * weightedSum) / (n * total) - (n + 1) / n;
  // Clamp to [0,1] — floating point can push it a hair outside.
  return Math.min(1, Math.max(0, Number(g.toFixed(4))));
}

export function computeWorkload(
  inputs: PresenterWorkloadInput[],
  options: {
    periodStart: string;
    periodEnd: string;
    thresholds?: WorkloadThresholds;
    now?: Date;
  },
): WorkloadSummary {
  const thresholds = options.thresholds ?? DEFAULT_WORKLOAD_THRESHOLDS;
  const now = options.now ?? new Date();

  const totalWeight = inputs.reduce((acc, p) => acc + (p.capacityWeight || 0), 0);
  const totalDeliverables = inputs.reduce((acc, p) => acc + p.deliverablesInPeriod, 0);
  const totalAssignments = inputs.reduce((acc, p) => acc + p.assignmentsInPeriod, 0);
  const totalEarnedMinor = inputs.reduce((acc, p) => acc + p.earnedMinor, 0);

  const rows: PresenterWorkloadRow[] = inputs.map((p) => {
    const expectedShare = totalWeight > 0 ? p.capacityWeight / totalWeight : 0;
    const actualShare = totalDeliverables > 0 ? p.deliverablesInPeriod / totalDeliverables : 0;

    const balanceIndex =
      totalDeliverables === 0 || expectedShare === 0
        ? null
        : Number((actualShare / expectedShare).toFixed(3));

    let status: PresenterWorkloadRow['status'] = 'NO_DATA';
    if (balanceIndex !== null) {
      if (balanceIndex < thresholds.under) status = 'UNDER';
      else if (balanceIndex > thresholds.over) status = 'OVER';
      else status = 'BALANCED';
    }

    // Deliverables that would take them to exactly expectedShare of the pool.
    // Solving (delivered + x) / (total + x) = expectedShare for x:
    //   x = (expectedShare · total − delivered) / (1 − expectedShare)
    const denominator = 1 - expectedShare;
    const deliverablesToParity =
      denominator <= 0
        ? 0
        : Math.max(
            0,
            Math.ceil((expectedShare * totalDeliverables - p.deliverablesInPeriod) / denominator),
          );

    const targetProgress =
      p.targetDeliverablesPerMonth && p.targetDeliverablesPerMonth > 0
        ? Number((p.deliverablesInPeriod / p.targetDeliverablesPerMonth).toFixed(3))
        : null;

    return {
      ...p,
      expectedShare: Number(expectedShare.toFixed(4)),
      actualShare: Number(actualShare.toFixed(4)),
      balanceIndex,
      status,
      deliverablesToParity,
      daysSinceLastAssigned: daysBetween(p.lastAssignedAt, now),
      targetProgress,
    };
  });

  const weightAdjusted = inputs
    .filter((p) => p.capacityWeight > 0)
    .map((p) => p.deliverablesInPeriod / p.capacityWeight);

  return {
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    presenterCount: inputs.length,
    totalDeliverables,
    totalAssignments,
    totalEarnedMinor,
    giniCoefficient: giniCoefficient(weightAdjusted),
    giniIsIndicativeOnly: inputs.length < 4,
    underAllocated: rows.filter((r) => r.status === 'UNDER').length,
    overAllocated: rows.filter((r) => r.status === 'OVER').length,
    rows,
  };
}

/**
 * Ranks presenters for a new assignment. This is a transparent scoring
 * function, NOT a machine-learning model — every component is listed so the
 * producer can see exactly why someone is at the top and overrule it.
 *
 * Hard filters applied before scoring (a presenter failing any of these is
 * excluded entirely, with the reason recorded):
 *   - status must be ACTIVE
 *   - must hold a SIGNED contract for the brand
 *   - must not have an UNAVAILABLE block overlapping the due date
 *
 * Score, 0–100:
 *   40  under-allocation   (how far below their fair share they are)
 *   20  recency            (longer since last assigned scores higher)
 *   20  quality            (avgRating, 1–5, scaled)
 *   20  reliability        (onTimeDeliveryPct)
 * Missing history scores the neutral midpoint for that component rather than
 * zero, so a brand-new presenter is not permanently buried.
 */
export interface SuggestionInput {
  presenterId: string;
  displayName: string;
  balanceIndex: number | null;
  daysSinceLastAssigned: number | null;
  avgRating: number | null;
  onTimeDeliveryPct: number | null;
  activeAssignments: number;
}

export interface SuggestionResult extends SuggestionInput {
  score: number;
  breakdown: { label: string; points: number; max: number; reason: string }[];
}

export function scorePresenters(inputs: SuggestionInput[]): SuggestionResult[] {
  return inputs
    .map((p) => {
      // Under-allocation: balanceIndex 0 → full 40; 1.0 → 20; ≥2.0 → 0.
      const bi = p.balanceIndex ?? 1;
      const allocationPoints = Math.max(0, Math.min(40, 40 - bi * 20));

      // Recency: 0 days → 0; 60+ days → full 20. Never assigned → full 20.
      const days = p.daysSinceLastAssigned ?? 60;
      const recencyPoints = Math.max(0, Math.min(20, (days / 60) * 20));

      // Quality: rating 1 → 0; rating 5 → 20. No history → 10 (neutral).
      const qualityPoints =
        p.avgRating === null ? 10 : Math.max(0, Math.min(20, ((p.avgRating - 1) / 4) * 20));

      // Reliability: 0% → 0; 100% → 20. No history → 10 (neutral).
      const reliabilityPoints =
        p.onTimeDeliveryPct === null
          ? 10
          : Math.max(0, Math.min(20, (p.onTimeDeliveryPct / 100) * 20));

      const score = Number(
        (allocationPoints + recencyPoints + qualityPoints + reliabilityPoints).toFixed(1),
      );

      return {
        ...p,
        score,
        breakdown: [
          {
            label: 'Under-allocated',
            points: Number(allocationPoints.toFixed(1)),
            max: 40,
            reason:
              p.balanceIndex === null
                ? 'No work assigned in the period, so treated as a full fair share owed'
                : `Balance index ${p.balanceIndex.toFixed(2)} (1.00 = exactly their fair share)`,
          },
          {
            label: 'Time since last assigned',
            points: Number(recencyPoints.toFixed(1)),
            max: 20,
            reason:
              p.daysSinceLastAssigned === null
                ? 'Never assigned work'
                : `${p.daysSinceLastAssigned} days ago`,
          },
          {
            label: 'Feedback rating',
            points: Number(qualityPoints.toFixed(1)),
            max: 20,
            reason:
              p.avgRating === null
                ? 'No feedback recorded yet — scored at the neutral midpoint'
                : `Average ${p.avgRating.toFixed(2)} / 5`,
          },
          {
            label: 'On-time delivery',
            points: Number(reliabilityPoints.toFixed(1)),
            max: 20,
            reason:
              p.onTimeDeliveryPct === null
                ? 'No completed work yet — scored at the neutral midpoint'
                : `${p.onTimeDeliveryPct.toFixed(0)}% delivered on or before the due date`,
          },
        ],
      };
    })
    .sort((a, b) => b.score - a.score);
}
