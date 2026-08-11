/**
 * Derived metrics and the formatting of durations.
 *
 * "How long did they take" is deliberately split into three different numbers,
 * because collapsing them hides the thing you usually want to know:
 *
 *   responseMinutes    assignedAt  → acceptedAt    (how fast they reply)
 *   turnaroundMinutes  assignedAt  → submittedAt   (total elapsed time)
 *   workingMinutes     Σ TimeLog                    (hands-on time, optional)
 *
 * A presenter who takes 6 days but only replied on day 5 has a responsiveness
 * problem, not a production problem. One "turnaround" figure would not tell
 * you that.
 */

export interface AssignmentTimingInput {
  assignedAt?: string | Date | null;
  acceptedAt?: string | Date | null;
  submittedAt?: string | Date | null;
  dueAt?: string | Date | null;
  completedAt?: string | Date | null;
}

export interface AssignmentTiming {
  responseMinutes: number | null;
  turnaroundMinutes: number | null;
  latenessMinutes: number | null;
  /** True when submitted at or before dueAt. Null when either date is missing. */
  onTime: boolean | null;
}

function toTime(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function diffMinutes(from: number | null, to: number | null): number | null {
  if (from === null || to === null) return null;
  return Math.round((to - from) / 60_000);
}

export function computeTiming(input: AssignmentTimingInput): AssignmentTiming {
  const assigned = toTime(input.assignedAt);
  const accepted = toTime(input.acceptedAt);
  const submitted = toTime(input.submittedAt);
  const due = toTime(input.dueAt);

  const latenessMinutes = diffMinutes(due, submitted);

  return {
    responseMinutes: diffMinutes(assigned, accepted),
    turnaroundMinutes: diffMinutes(assigned, submitted),
    latenessMinutes,
    onTime: latenessMinutes === null ? null : latenessMinutes <= 0,
  };
}

/**
 * Human duration. Chooses the unit that keeps the number readable:
 *   < 90 min   → "47 min"
 *   < 48 h     → "3h 20m"
 *   otherwise  → "4d 6h"
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const negative = minutes < 0;
  const abs = Math.abs(minutes);

  let out: string;
  if (abs < 90) {
    out = `${abs} min`;
  } else if (abs < 2880) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    out = m === 0 ? `${h}h` : `${h}h ${m}m`;
  } else {
    const d = Math.floor(abs / 1440);
    const h = Math.floor((abs % 1440) / 60);
    out = h === 0 ? `${d}d` : `${d}d ${h}h`;
  }
  return negative ? `-${out}` : out;
}

/** "3 days early" / "on time" / "2 days late" for the lateness column. */
export function formatLateness(latenessMinutes: number | null | undefined): {
  label: string;
  tone: 'positive' | 'neutral' | 'negative';
} {
  if (latenessMinutes === null || latenessMinutes === undefined) {
    return { label: '—', tone: 'neutral' };
  }
  if (latenessMinutes <= 0 && latenessMinutes > -60) return { label: 'On time', tone: 'positive' };
  if (latenessMinutes <= 0) {
    return { label: `${formatDuration(-latenessMinutes)} early`, tone: 'positive' };
  }
  return { label: `${formatDuration(latenessMinutes)} late`, tone: 'negative' };
}

// ---------------------------------------------------------------------------
// Marketing performance
// ---------------------------------------------------------------------------

export interface PerformanceInput {
  views?: number | null;
  impressions?: number | null;
  watchTimeMinutes?: number | null;
  avgViewDurationSeconds?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  clicks?: number | null;
  leads?: number | null;
  conversions?: number | null;
  spendMinor?: number | null;
  revenueMinor?: number | null;
}

export interface PerformanceDerived {
  /** (likes + comments + shares) / views, as a percentage. */
  engagementRatePct: number | null;
  /** clicks / impressions, as a percentage. */
  ctrPct: number | null;
  /** conversions / clicks, as a percentage. */
  conversionRatePct: number | null;
  /** spend / conversions, minor units. */
  costPerConversionMinor: number | null;
  /** revenue / spend, e.g. 3.4 means £3.40 back per £1 spent. */
  roas: number | null;
  /**
   * Presenter fee ÷ views, minor units. Answers "what did this presenter's
   * time cost us per view". Requires the assignment fee to be passed in.
   */
  feeCostPerThousandViewsMinor: number | null;
}

export function derivePerformance(
  m: PerformanceInput,
  assignmentFeeMinor?: number | null,
): PerformanceDerived {
  const pct = (numerator?: number | null, denominator?: number | null): number | null => {
    if (!numerator && numerator !== 0) return null;
    if (!denominator) return null;
    return Number(((numerator / denominator) * 100).toFixed(2));
  };

  const interactions =
    m.likes === null && m.comments === null && m.shares === null
      ? null
      : (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0);

  return {
    engagementRatePct: pct(interactions, m.views),
    ctrPct: pct(m.clicks, m.impressions),
    conversionRatePct: pct(m.conversions, m.clicks),
    costPerConversionMinor:
      m.spendMinor && m.conversions ? Math.round(m.spendMinor / m.conversions) : null,
    roas:
      m.revenueMinor && m.spendMinor ? Number((m.revenueMinor / m.spendMinor).toFixed(2)) : null,
    feeCostPerThousandViewsMinor:
      assignmentFeeMinor && m.views ? Math.round((assignmentFeeMinor / m.views) * 1000) : null,
  };
}

/** Compact number for KPI tiles: 12400 → "12.4K". */
export function formatCompactNumber(value: number | null | undefined, locale = 'en-GB'): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}
