'use client';

import Link from 'next/link';
import { CheckCircle2, Clock, FileText, Wallet } from 'lucide-react';
import { formatMoney } from '@presenter-ops/shared';

import { useAssignments, useMe } from '@/lib/queries';
import { formatDate } from '@/lib/utils';
import {
  Badge,
  BrandChip,
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
import { DueBadge, StatusPill } from '@/components/status';
import { useTransitionAssignment } from '@/lib/queries';

/**
 * The presenter's own view.
 *
 * A separate surface rather than a filtered version of the internal app,
 * because the jobs are different. A presenter needs four things: what have I
 * been offered, what am I working on, where do I put the files, what am I owed.
 * Everything else — workload balance, other presenters' rates, internal
 * feedback — is deliberately absent, and the API enforces that rather than
 * relying on this page to hide it.
 */
export default function PortalPage() {
  const { data: me } = useMe();
  const { data, isLoading } = useAssignments({ pageSize: 100, sort: 'dueAt' });

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const offers = data.data.filter((a) => a.status === 'ASSIGNED');
  const live = data.data.filter((a) =>
    ['ACCEPTED', 'IN_PROGRESS', 'REVISIONS_REQUESTED', 'SUBMITTED', 'IN_REVIEW'].includes(a.status),
  );
  const done = data.data.filter((a) => ['APPROVED', 'COMPLETED'].includes(a.status));
  const earned = done.reduce((sum, a) => sum + (a.totalFeeMinor ?? 0), 0);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <PageHeader
        title={`Hello${me ? `, ${me.name.split(' ')[0]}` : ''}`}
        description="Your work with us, in one place."
      />

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="New offers"
          value={offers.length}
          tone={offers.length > 0 ? 'warning' : 'neutral'}
          explain="Jobs waiting for you to accept or decline."
          icon={Clock}
        />
        <StatTile label="In progress" value={live.length} explain="Jobs you have accepted." icon={FileText} />
        <StatTile
          label="Completed"
          value={done.length}
          explain="Jobs signed off."
          icon={CheckCircle2}
        />
        <StatTile
          label="Earned"
          value={formatMoney(earned, 'GBP', { compact: true })}
          explain="Total agreed fees on completed work. This is what has been signed off, not what has been paid — check with accounts for payment dates."
          icon={Wallet}
        />
      </section>

      {offers.length > 0 ? (
        <Card className="mb-6 border-warning/40">
          <CardHeader>
            <CardTitle>Waiting on you</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {offers.map((offer) => (
              <OfferCard key={offer.id} assignment={offer} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Your current work</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {live.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nothing on right now"
                description="When a producer sends you a job it will appear here, with the script and the deadline."
              />
            </div>
          ) : (
            <ul className="divide-y border-t">
              {live.map((assignment) => (
                <li key={assignment.id}>
                  <Link
                    href={`/portal/assignments/${assignment.id}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{assignment.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {assignment.reference} · {assignment.deliverableCount} video
                        {assignment.deliverableCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    {assignment.brand ? (
                      <BrandChip name={assignment.brand.name} colorHex={assignment.brand.colorHex} />
                    ) : null}
                    <StatusPill status={assignment.status} />
                    <DueBadge
                      dueAt={assignment.dueAt}
                      status={assignment.status}
                      latenessMinutes={null}
                    />
                    <span className="tabular w-20 text-right text-sm font-medium">
                      {formatMoney(assignment.totalFeeMinor, assignment.feeCurrency)}
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
          <CardTitle>Completed</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y border-t">
            {done.map((assignment) => (
              <li key={assignment.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{assignment.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(assignment.completedAt)}
                </span>
                <span className="tabular w-20 text-right font-medium">
                  {formatMoney(assignment.totalFeeMinor, assignment.feeCurrency)}
                </span>
              </li>
            ))}
            {done.length === 0 ? (
              <li className="px-5 py-4 text-sm text-muted-foreground">Nothing completed yet.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}

function OfferCard({ assignment }: { assignment: any }) {
  const transition = useTransitionAssignment(assignment.id);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{assignment.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {assignment.reference} · {assignment.deliverableCount} video
            {assignment.deliverableCount === 1 ? '' : 's'} · due{' '}
            {formatDate(assignment.dueAt)}
          </p>
        </div>
        <Badge tone="primary" className="tabular">
          {formatMoney(assignment.totalFeeMinor, assignment.feeCurrency)}
        </Badge>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          variant="success"
          loading={transition.isPending}
          onClick={() => transition.mutate({ to: 'ACCEPTED' })}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => transition.mutate({ to: 'DECLINED', note: 'Declined from the portal.' })}
        >
          Decline
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link href={`/portal/assignments/${assignment.id}`}>See the brief</Link>
        </Button>
      </div>
    </div>
  );
}
