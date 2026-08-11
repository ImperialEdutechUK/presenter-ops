'use client';

import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileWarning,
  Inbox,
  Snowflake,
  Timer,
  Wallet,
} from 'lucide-react';
import { formatDuration, formatMoney } from '@presenter-ops/shared';

import { useDashboard } from '@/lib/queries';
import { formatDate, relativeTime } from '@/lib/utils';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
  StatTile,
} from '@/components/ui';
import { BrandChip } from '@/components/ui';
import { DueBadge, StatusPill } from '@/components/status';

/**
 * The dashboard answers one question: what needs a human today?
 *
 * It is deliberately NOT a wall of charts. Everything on this page is either a
 * number someone acts on, or a list of things someone acts on. The single
 * chart (throughput) is there because "are we getting through more or less
 * work than last month" is a real question; nothing else earned its place.
 */
export default function DashboardPage() {
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) return <DashboardSkeleton />;

  const { kpis } = data;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Today"
        description={`Everything current as of ${formatDate(data.generatedAt, true)}.`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/workload">Check workload balance</Link>
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Key figures">
        <StatTile
          label="Active"
          value={kpis.activeAssignments}
          icon={Inbox}
          explain="Assignments that are with a presenter or in review — anything not draft, completed, cancelled or declined."
        />
        <StatTile
          label="Due this week"
          value={kpis.dueThisWeek}
          icon={Clock}
          tone={kpis.dueThisWeek > 0 ? 'warning' : 'neutral'}
          explain="Active assignments with a due date in the next seven days."
        />
        <StatTile
          label="Overdue"
          value={kpis.overdue}
          icon={AlertCircle}
          tone={kpis.overdue > 0 ? 'danger' : 'success'}
          explain="Active assignments whose due date has passed with nothing submitted."
        />
        <StatTile
          label="Awaiting reply"
          value={kpis.awaitingResponse}
          icon={Timer}
          explain="Sent to a presenter who has not yet accepted or declined."
        />
        <StatTile
          label="To review"
          value={kpis.awaitingReview}
          icon={CheckCircle2}
          explain="Delivered by the presenter and waiting on an internal decision."
        />
        <StatTile
          label="Committed"
          value={formatMoney(kpis.committedSpendMinor, kpis.currency, { compact: true })}
          icon={Wallet}
          explain="Total agreed fees on active assignments. This is money promised, not yet paid."
        />
      </section>

      <section className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <StatTile
          label="Median turnaround"
          value={formatDuration(kpis.medianTurnaroundMinutes)}
          sublabel="From sending the job to the delivery link arriving"
          explain="The middle value, not the average — one job that sat for months would drag an average somewhere useless. Calculated over work submitted in the last 30 days."
        />
        <StatTile
          label="Delivered on time"
          value={kpis.onTimeDeliveryPct === null ? '—' : `${kpis.onTimeDeliveryPct}%`}
          sublabel="Submitted on or before the due date"
          tone={
            kpis.onTimeDeliveryPct === null
              ? 'neutral'
              : kpis.onTimeDeliveryPct >= 85
                ? 'success'
                : kpis.onTimeDeliveryPct >= 65
                  ? 'warning'
                  : 'danger'
          }
          explain="Of the jobs submitted in the last 30 days that had a due date, the share that arrived on or before it. Jobs with no due date are excluded rather than counted as on time."
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* --- needs attention -------------------------------------------- */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Needs attention</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Overdue, due within 48 hours, or sent more than two days ago with no reply.
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/assignments?overdueOnly=true">See all</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {data.atRisk.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={CheckCircle2}
                  title="Nothing is slipping"
                  description="No overdue work, nothing due in the next two days, and no unanswered offers."
                />
              </div>
            ) : (
              <ul className="divide-y border-t">
                {data.atRisk.map((assignment) => (
                  <li key={assignment.id}>
                    <Link
                      href={`/assignments/${assignment.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                    >
                      <Avatar
                        name={assignment.presenter?.displayName ?? 'Unassigned'}
                        src={assignment.presenter?.photoUrl}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          <span className="tabular text-muted-foreground">
                            {assignment.reference}
                          </span>{' '}
                          {assignment.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {assignment.presenter?.displayName ?? 'Not assigned to anyone'}
                        </p>
                      </div>
                      {assignment.brand ? (
                        <BrandChip name={assignment.brand.name} colorHex={assignment.brand.colorHex} />
                      ) : null}
                      <StatusPill status={assignment.status} />
                      <div className="w-24 text-right">
                        <DueBadge
                          dueAt={assignment.dueAt}
                          status={assignment.status}
                          latenessMinutes={null}
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* --- going cold + contracts ------------------------------------- */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Snowflake className="size-4 text-info" aria-hidden />
                  Going cold
                </CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Active presenters with no work for a while.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {data.goingCold.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">
                  Everyone has had work recently.
                </p>
              ) : (
                <ul className="divide-y border-t">
                  {data.goingCold.map((presenter) => (
                    <li key={presenter.id}>
                      <Link
                        href={`/presenters/${presenter.id}`}
                        className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/50"
                      >
                        <Avatar name={presenter.displayName} src={presenter.photoUrl} size="sm" />
                        <span className="flex-1 truncate text-sm">{presenter.displayName}</span>
                        <span className="text-xs text-muted-foreground">
                          {presenter.lastAssignedAt
                            ? relativeTime(presenter.lastAssignedAt)
                            : 'Never assigned'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileWarning className="size-4 text-warning" aria-hidden />
                Contracts expiring
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.contractsExpiringSoon.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">
                  No contracts lapse in the next 30 days.
                </p>
              ) : (
                <ul className="divide-y border-t">
                  {data.contractsExpiringSoon.map((contract) => (
                    <li key={`${contract.presenterId}-${contract.brandName}`}>
                      <Link
                        href={`/presenters/${contract.presenterId}?tab=contracts`}
                        className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-muted/50"
                      >
                        <span className="truncate">
                          {contract.presenterName}
                          <span className="text-muted-foreground"> · {contract.brandName}</span>
                        </span>
                        <span className="shrink-0 text-xs text-warning">
                          {formatDate(contract.expiresAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <Skeleton className="h-8 w-40" />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Skeleton className="h-96 xl:col-span-2" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
