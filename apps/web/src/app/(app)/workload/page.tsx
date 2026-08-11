'use client';

import * as React from 'react';
import Link from 'next/link';
import { Info, Scale } from 'lucide-react';
import { formatMoney } from '@presenter-ops/shared';

import { useBrands, useWorkload } from '@/lib/queries';
import { cn, relativeTime } from '@/lib/utils';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
  StatTile,
  Tooltip,
} from '@/components/ui';

/**
 * Workload balance — "are we giving everyone enough work?"
 *
 * The one screen in this product that had to be invented rather than copied.
 * Its whole job is to make an uncomfortable fact visible: that work drifts to
 * whoever is easiest to ask, and the people you are not thinking about quietly
 * stop being booked.
 *
 * Every number shows its own formula on hover. That is not decoration — a
 * fairness figure nobody understands is a fairness figure nobody acts on.
 */

const RANGES = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 6 months', days: 182 },
  { label: 'Last 12 months', days: 365 },
];

export default function WorkloadPage() {
  const [days, setDays] = React.useState(30);
  const [brandId, setBrandId] = React.useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = React.useState(false);

  const range = React.useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [days]);

  const { data: brands } = useBrands();
  const { data, isLoading } = useWorkload({
    ...range,
    brandId: brandId ? [brandId] : undefined,
    includeInactive,
  });

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Workload balance"
        description="Who is getting a fair share of the work, and who is being missed."
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          {RANGES.map((option) => (
            <button
              key={option.days}
              onClick={() => setDays(option.days)}
              aria-pressed={days === option.days}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                days === option.days
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <select
          value={brandId ?? ''}
          onChange={(event) => setBrandId(event.target.value || null)}
          aria-label="Filter by brand"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All brands</option>
          {brands?.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
            className="size-4 rounded border-input accent-[hsl(var(--primary))]"
          />
          Include onboarding and paused
        </label>
      </div>

      {isLoading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-96" />
        </div>
      ) : data.rows.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No presenters to compare"
          description="Add some presenters, or widen the filters, and this screen will show how work is being distributed between them."
          action={
            <Button asChild>
              <Link href="/presenters/new">Add a presenter</Link>
            </Button>
          }
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Distribution summary">
            <StatTile
              label="Deliverables"
              value={data.totalDeliverables}
              sublabel={`across ${data.totalAssignments} assignments`}
              explain="Total videos handed out in this period, counting assignments that were not cancelled or declined. Counted from the date the work was ASSIGNED, because that is the moment we control."
            />
            <StatTile
              label="Under-allocated"
              value={data.underAllocated}
              tone={data.underAllocated > 0 ? 'warning' : 'success'}
              sublabel="below 0.80 balance index"
              explain="Presenters who received less than 80% of the share their capacity weight implies. Threshold configurable in Settings."
            />
            <StatTile
              label="Over-allocated"
              value={data.overAllocated}
              tone={data.overAllocated > 0 ? 'warning' : 'success'}
              sublabel="above 1.25 balance index"
              explain="Presenters who received more than 125% of their implied share. Often the first sign of a burnout risk or a single point of failure."
            />
            <StatTile
              label="Evenness"
              value={data.giniCoefficient === null ? '—' : data.giniCoefficient.toFixed(2)}
              sublabel={data.giniIsIndicativeOnly ? 'indicative only — small pool' : 'Gini coefficient'}
              tone={
                data.giniCoefficient === null
                  ? 'neutral'
                  : data.giniCoefficient < 0.2
                    ? 'success'
                    : data.giniCoefficient < 0.4
                      ? 'warning'
                      : 'danger'
              }
              explain="Gini coefficient of weight-adjusted output. 0.00 means every presenter received exactly the share their capacity implies; 1.00 means one person received everything. Below 4 presenters this number is noisy and is labelled indicative only."
            />
          </section>

          <Card className="mt-6 overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>By presenter</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Sorted by who is furthest below their fair share.
                </p>
              </div>
              <Tooltip
                content={
                  'Balance index = (their share of deliverables) ÷ (their share of total capacity weight). ' +
                  '1.00 is exactly fair. Hover any row for the numbers behind it.'
                }
              >
                <span className="flex cursor-help items-center gap-1 text-xs text-muted-foreground">
                  <Info className="size-3.5" aria-hidden />
                  How this is calculated
                </span>
              </Tooltip>
            </CardHeader>

            <CardContent className="p-0">
              <ul className="divide-y border-t">
                {[...data.rows]
                  .sort((a, b) => (a.balanceIndex ?? 0) - (b.balanceIndex ?? 0))
                  .map((row) => {
                    const percent =
                      row.balanceIndex === null ? 0 : Math.min(100, (row.balanceIndex / 2) * 100);

                    return (
                      <li key={row.presenterId} className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={row.displayName} src={row.photoUrl} size="sm" />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/presenters/${row.presenterId}`}
                                className="text-sm font-medium hover:underline"
                              >
                                {row.displayName}
                              </Link>
                              {row.capacityWeight !== 1 ? (
                                <Tooltip content="Capacity weight — their share is scaled by this before comparison.">
                                  <Badge className="tabular cursor-help">
                                    {row.capacityWeight.toFixed(2)}×
                                  </Badge>
                                </Tooltip>
                              ) : null}
                              <StatusBadge status={row.status} />
                            </div>

                            {/* The bar. 1.0 sits at the midpoint, so "fair" is
                                a position on the scale rather than a number to
                                interpret. */}
                            <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  row.status === 'UNDER' && 'bg-warning',
                                  row.status === 'OVER' && 'bg-info',
                                  row.status === 'BALANCED' && 'bg-success',
                                  row.status === 'NO_DATA' && 'bg-muted-foreground/30',
                                )}
                                style={{ width: `${percent}%` }}
                              />
                              <div
                                className="absolute inset-y-0 left-1/2 w-px bg-foreground/40"
                                aria-hidden
                                title="Fair share"
                              />
                            </div>

                            <p className="mt-1.5 text-xs text-muted-foreground">
                              {row.deliverablesInPeriod} of {data.totalDeliverables} deliverables (
                              {(row.actualShare * 100).toFixed(0)}% received vs{' '}
                              {(row.expectedShare * 100).toFixed(0)}% expected)
                              {row.status === 'UNDER' && row.deliverablesToParity > 0 ? (
                                <>
                                  {' '}
                                  ·{' '}
                                  <span className="font-medium text-warning">
                                    {row.deliverablesToParity} more would reach parity
                                  </span>
                                </>
                              ) : null}
                            </p>
                          </div>

                          <dl className="hidden shrink-0 gap-6 text-right sm:flex">
                            <div>
                              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Balance
                              </dt>
                              <dd className="tabular text-sm font-semibold">
                                <Tooltip
                                  content={`${(row.actualShare * 100).toFixed(1)}% received ÷ ${(row.expectedShare * 100).toFixed(1)}% expected = ${row.balanceIndex?.toFixed(2) ?? 'n/a'}`}
                                >
                                  <span className="cursor-help">
                                    {row.balanceIndex?.toFixed(2) ?? '—'}
                                  </span>
                                </Tooltip>
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Active
                              </dt>
                              <dd className="tabular text-sm font-semibold">{row.activeAssignments}</dd>
                            </div>
                            <div className="w-24">
                              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Earned
                              </dt>
                              <dd className="tabular text-sm font-semibold">
                                {formatMoney(row.earnedMinor, 'GBP', { compact: true })}
                              </dd>
                            </div>
                            <div className="w-28">
                              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Last assigned
                              </dt>
                              <dd className="text-sm">
                                {row.lastAssignedAt ? relativeTime(row.lastAssignedAt) : 'Never'}
                              </dd>
                            </div>
                          </dl>

                          <Button variant="outline" size="sm" asChild>
                            <Link
                              href={`/assignments/new?presenterId=${row.presenterId}`}
                              aria-label={`Assign work to ${row.displayName}`}
                            >
                              Assign
                            </Link>
                          </Button>
                        </div>

                        {row.targetProgress !== null ? (
                          <p className="mt-2 pl-11 text-xs text-muted-foreground">
                            Against their own target of {row.targetDeliverablesPerMonth}/month:{' '}
                            <span
                              className={cn(
                                'font-medium',
                                row.targetProgress >= 0.9 ? 'text-success' : 'text-warning',
                              )}
                            >
                              {(row.targetProgress * 100).toFixed(0)}%
                            </span>
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            </CardContent>
          </Card>

          <p className="mt-4 text-xs text-muted-foreground">
            Counted from the date work was assigned, not completed — the question this screen
            answers is what we handed out, which is the part we control. Cancelled and declined
            assignments are excluded.
          </p>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'UNDER' | 'BALANCED' | 'OVER' | 'NO_DATA' }) {
  const map = {
    UNDER: { tone: 'warning' as const, label: 'Under-allocated' },
    BALANCED: { tone: 'success' as const, label: 'Balanced' },
    OVER: { tone: 'info' as const, label: 'Over-allocated' },
    NO_DATA: { tone: 'neutral' as const, label: 'No work this period' },
  };
  const { tone, label } = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}
