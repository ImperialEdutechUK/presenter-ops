'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as Tabs from '@radix-ui/react-tabs';
import { CalendarDays, Mail, MapPin, Phone, Star } from 'lucide-react';
import {
  RATE_UNIT_LABEL,
  formatDuration,
  formatMoney,
  type AssignmentSummaryDto,
} from '@presenter-ops/shared';

import { api } from '@/lib/api';
import { useAssignments, usePresenter } from '@/lib/queries';
import { formatDate, relativeTime } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
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
  Tooltip,
} from '@/components/ui';
import { DueBadge, PresenterStatusPill, StatusPill } from '@/components/status';

/**
 * The presenter profile. Everything about one person in one place, split into
 * tabs so the page opens on what you came for rather than a wall.
 *
 * The default tab is WORK, not "about" — the reason to open a presenter is
 * almost always to see what they have been given, not to re-read their bio.
 */
export default function PresenterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = React.useState('work');

  React.useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (requestedTab) setTab(requestedTab);
  }, []);

  const { data: presenter, isLoading } = usePresenter(id);
  const { data: assignments } = useAssignments({ presenterId: [id], pageSize: 100, sort: 'assignedAt', direction: 'desc' });
  const { data: feedback } = useQuery({
    queryKey: ['presenter-feedback', id],
    queryFn: () => api.get<any[]>(`/presenters/${id}/feedback`),
  });
  const { data: performance } = useQuery({
    queryKey: ['presenter-performance', id],
    queryFn: () => api.get<any[]>(`/presenters/${id}/performance`),
  });

  if (isLoading || !presenter) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const live = (assignments?.data ?? []).filter((a) =>
    ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'IN_REVIEW', 'REVISIONS_REQUESTED'].includes(
      a.status,
    ),
  );
  const past = (assignments?.data ?? []).filter((a) => !live.includes(a));

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        breadcrumb={
          <Link href="/presenters" className="hover:underline">
            Presenters
          </Link>
        }
        title={presenter.displayName}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/presenters/${id}/edit`}>Edit profile</Link>
            </Button>
            <Button asChild>
              <Link href={`/assignments/new?presenterId=${id}`}>Assign work</Link>
            </Button>
          </>
        }
      />

      {/* --- identity card ------------------------------------------------- */}
      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar name={presenter.displayName} src={presenter.photoUrl} size="xl" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{presenter.fullName}</h2>
              <PresenterStatusPill status={presenter.status} />
              {presenter.hasPortalAccess ? (
                <Badge tone="success">Portal access</Badge>
              ) : (
                <Badge tone="warning">Not invited to portal</Badge>
              )}
            </div>

            {presenter.bio ? <p className="mt-1.5 text-sm">{presenter.bio}</p> : null}

            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <Mail className="size-3.5" aria-hidden />
                <a href={`mailto:${presenter.email}`} className="hover:underline">
                  {presenter.email}
                </a>
              </li>
              {presenter.phone ? (
                <li className="flex items-center gap-1.5">
                  <Phone className="size-3.5" aria-hidden />
                  {presenter.phone}
                </li>
              ) : null}
              {presenter.location ? (
                <li className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden />
                  {presenter.location}
                </li>
              ) : null}
              <li className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden />
                Joined {formatDate(presenter.createdAt)}
              </li>
            </ul>

            <ul className="mt-3 flex flex-wrap gap-1.5">
              {presenter.tags.map((tag) => (
                <li key={tag.id}>
                  <Badge>{tag.name}</Badge>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-4">
            <StatTile
              label="Completed"
              value={presenter.completedAssignments}
              explain="Assignments that reached approved or completed."
            />
            <StatTile
              label="Turnaround"
              value={formatDuration(presenter.avgTurnaroundMinutes)}
              explain="Mean time from the job being sent to the delivery link arriving, across completed work."
            />
            <StatTile
              label="On time"
              value={
                presenter.onTimeDeliveryPct === null
                  ? '—'
                  : `${presenter.onTimeDeliveryPct.toFixed(0)}%`
              }
              tone={
                presenter.onTimeDeliveryPct === null
                  ? 'neutral'
                  : presenter.onTimeDeliveryPct >= 85
                    ? 'success'
                    : 'warning'
              }
              explain="Share of submitted work with a due date that arrived on or before it."
            />
            <StatTile
              label="Rating"
              value={presenter.avgRating?.toFixed(1) ?? '—'}
              sublabel={feedback ? `${feedback.length} reviews` : undefined}
              explain="Mean overall rating across every internal review of their work, on a 1–5 scale."
            />
          </div>
        </div>
      </Card>

      {/* --- tabs ---------------------------------------------------------- */}
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="mb-4 flex gap-1 border-b" aria-label="Presenter sections">
          {[
            ['work', 'Work'],
            ['contracts', 'Contracts & rates'],
            ['feedback', 'Feedback'],
            ['performance', 'Video performance'],
            ['availability', 'Availability'],
          ].map(([value, label]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* --- work -------------------------------------------------------- */}
        <Tabs.Content value="work" className="space-y-5 focus-visible:outline-none">
          <Card>
            <CardHeader>
              <CardTitle>Currently with them ({live.length})</CardTitle>
              <p className="text-sm text-muted-foreground">
                Last assigned{' '}
                {presenter.lastAssignedAt ? relativeTime(presenter.lastAssignedAt) : 'never'}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {live.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">
                  Nothing open. {presenter.status === 'ACTIVE' ? 'They are free to take work.' : ''}
                </p>
              ) : (
                <AssignmentList assignments={live} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History ({past.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {past.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title="No completed work yet"
                    description="Once they have delivered something it will be listed here with the turnaround, the feedback and how the video performed."
                  />
                </div>
              ) : (
                <AssignmentList assignments={past} />
              )}
            </CardContent>
          </Card>
        </Tabs.Content>

        {/* --- contracts --------------------------------------------------- */}
        <Tabs.Content value="contracts" className="focus-visible:outline-none">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Websites under contract</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  A rate set here overrides their default of{' '}
                  {formatMoney(presenter.defaultRateMinor, presenter.defaultCurrency)}{' '}
                  {RATE_UNIT_LABEL[presenter.defaultRateUnit]}.
                </p>
              </div>
              <Button variant="outline" size="sm">
                Add contract
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Brand</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 text-right font-medium" data-numeric>
                      Rate
                    </th>
                    <th className="px-5 py-2.5 text-right font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {presenter.contracts.map((contract) => (
                    <tr key={contract.id}>
                      <td className="px-5 py-3">
                        <BrandChip name={contract.brand.name} colorHex={contract.brand.colorHex} />
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          tone={
                            contract.contractStatus === 'SIGNED'
                              ? 'success'
                              : contract.contractStatus === 'EXPIRED'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {contract.contractStatus.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="tabular px-5 py-3 text-right" data-numeric>
                        {formatMoney(contract.effectiveRateMinor, contract.effectiveCurrency)}{' '}
                        <span className="text-xs text-muted-foreground">
                          {RATE_UNIT_LABEL[contract.effectiveRateUnit]}
                        </span>
                        {contract.rateIsInherited ? (
                          <Tooltip content="No brand-specific rate is set, so their default applies.">
                            <Badge className="ml-2 cursor-help">default</Badge>
                          </Tooltip>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-right text-muted-foreground">
                        {formatDate(contract.contractExpiresAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </Tabs.Content>

        {/* --- feedback ---------------------------------------------------- */}
        <Tabs.Content value="feedback" className="focus-visible:outline-none">
          <Card>
            <CardHeader>
              <CardTitle>Internal feedback</CardTitle>
              <p className="text-sm text-muted-foreground">
                Reviews marked “shared” are visible to the presenter in their portal.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {!feedback || feedback.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">No feedback recorded yet.</p>
              ) : (
                <ul className="divide-y border-t">
                  {feedback.map((item) => (
                    <li key={item.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="flex items-center gap-1 text-sm font-medium">
                            {Array.from({ length: 5 }).map((_, index) => (
                              <Star
                                key={index}
                                className={
                                  index < item.overallRating
                                    ? 'size-3.5 fill-warning text-warning'
                                    : 'size-3.5 text-muted-foreground/30'
                                }
                                aria-hidden
                              />
                            ))}
                            <span className="tabular ml-1">{item.overallRating}/5</span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {item.author.name} · {formatDate(item.createdAt)} ·{' '}
                            <Link
                              href={`/assignments/${item.assignment.id}`}
                              className="hover:underline"
                            >
                              {item.assignment.reference}
                            </Link>
                          </p>
                        </div>
                        {item.visibleToPresenter ? (
                          <Badge tone="success">Shared with presenter</Badge>
                        ) : (
                          <Badge>Internal only</Badge>
                        )}
                      </div>
                      {item.comment ? <p className="mt-2 text-sm">{item.comment}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </Tabs.Content>

        {/* --- performance -------------------------------------------------- */}
        <Tabs.Content value="performance" className="focus-visible:outline-none">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>How their videos performed</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Marketing figures, aggregated across their delivered work. Uses the most recent
                  measurement of each video so nothing is double-counted.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!performance || performance.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">
                  No performance figures recorded yet. Marketing can add them from any completed
                  assignment.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">Platform</th>
                      <th className="px-5 py-2.5 text-right font-medium" data-numeric>
                        Videos
                      </th>
                      <th className="px-5 py-2.5 text-right font-medium" data-numeric>
                        Views
                      </th>
                      <th className="px-5 py-2.5 text-right font-medium" data-numeric>
                        Engagement
                      </th>
                      <th className="px-5 py-2.5 text-right font-medium" data-numeric>
                        CTR
                      </th>
                      <th className="px-5 py-2.5 text-right font-medium" data-numeric>
                        Conversions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {performance.map((row) => (
                      <tr key={row.platform}>
                        <td className="px-5 py-3 capitalize">
                          {row.platform.toLowerCase().replace('_', ' ')}
                        </td>
                        <td className="tabular px-5 py-3 text-right" data-numeric>
                          {row.assignments}
                        </td>
                        <td className="tabular px-5 py-3 text-right" data-numeric>
                          {row.views?.toLocaleString('en-GB') ?? '—'}
                        </td>
                        <td className="tabular px-5 py-3 text-right" data-numeric>
                          {row.derived.engagementRatePct === null
                            ? '—'
                            : `${row.derived.engagementRatePct}%`}
                        </td>
                        <td className="tabular px-5 py-3 text-right" data-numeric>
                          {row.derived.ctrPct === null ? '—' : `${row.derived.ctrPct}%`}
                        </td>
                        <td className="tabular px-5 py-3 text-right" data-numeric>
                          {row.conversions?.toLocaleString('en-GB') ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </Tabs.Content>

        {/* --- availability ------------------------------------------------ */}
        <Tabs.Content value="availability" className="focus-visible:outline-none">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Unavailable dates</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Presenters marked unavailable on a due date are excluded from the suggestion list
                  for that job, with the reason shown.
                </p>
              </div>
              <Button variant="outline" size="sm">
                Add dates
              </Button>
            </CardHeader>
            <CardContent>
              {presenter.availability.length === 0 ? (
                <p className="text-sm text-muted-foreground">No blocked dates.</p>
              ) : (
                <ul className="space-y-2">
                  {presenter.availability.map((block) => (
                    <li
                      key={block.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span>
                        {formatDate(block.startDate)} – {formatDate(block.endDate)}
                      </span>
                      <span className="text-muted-foreground">{block.note ?? block.type}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function AssignmentList({ assignments }: { assignments: AssignmentSummaryDto[] }) {
  return (
    <ul className="divide-y border-t">
      {assignments.map((assignment) => (
        <li key={assignment.id}>
          <Link
            href={`/assignments/${assignment.id}`}
            className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-muted/50"
          >
            <span className="tabular w-20 shrink-0 text-xs text-muted-foreground">
              {assignment.reference}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{assignment.title}</span>
            {assignment.brand ? (
              <BrandChip name={assignment.brand.name} colorHex={assignment.brand.colorHex} />
            ) : null}
            <StatusPill status={assignment.status} />
            <span className="tabular w-24 text-right text-xs text-muted-foreground">
              {formatDuration(assignment.turnaroundMinutes)}
            </span>
            <span className="w-24 text-right">
              <DueBadge
                dueAt={assignment.dueAt}
                status={assignment.status}
                latenessMinutes={assignment.latenessMinutes}
              />
            </span>
            <span className="tabular w-20 text-right text-sm">
              {formatMoney(assignment.totalFeeMinor, assignment.feeCurrency)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}