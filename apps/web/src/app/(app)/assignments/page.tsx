'use client';

import * as React from 'react';
import Link from 'next/link';
import { ClipboardList, Columns3, Filter, List, Plus } from 'lucide-react';
import {
  ASSIGNMENT_STATUS_LABEL,
  formatDuration,
  formatMoney,
  type AssignmentStatus,
  type AssignmentSummaryDto,
} from '@presenter-ops/shared';

import { useAssignments, useBrands } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  Avatar,
  Badge,
  BrandChip,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { DueBadge, StatusPill } from '@/components/status';

/**
 * The work screen.
 *
 * BOARD is the default because the everyday question is "where is everything?",
 * which is a spatial question. TABLE exists because the other question —
 * "which of these took too long?" — is a comparison question, and comparison
 * needs columns.
 *
 * The board deliberately collapses eleven statuses into five columns. Eleven
 * columns is not a board, it is a spreadsheet turned sideways; the detail is
 * still on the card and in the table.
 */

const COLUMNS: { id: string; label: string; statuses: AssignmentStatus[]; tone: string }[] = [
  { id: 'draft', label: 'Draft', statuses: ['DRAFT'], tone: 'bg-muted-foreground/40' },
  {
    id: 'offered',
    label: 'With presenter',
    statuses: ['ASSIGNED', 'ACCEPTED'],
    tone: 'bg-info',
  },
  {
    id: 'progress',
    label: 'In production',
    statuses: ['IN_PROGRESS', 'REVISIONS_REQUESTED'],
    tone: 'bg-primary',
  },
  { id: 'review', label: 'To review', statuses: ['SUBMITTED', 'IN_REVIEW'], tone: 'bg-warning' },
  { id: 'done', label: 'Signed off', statuses: ['APPROVED', 'COMPLETED'], tone: 'bg-success' },
];

export default function AssignmentsPage() {
  const [view, setView] = React.useState<'board' | 'table'>('board');
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [brandId, setBrandId] = React.useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 220);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: brands } = useBrands();
  const { data, isLoading } = useAssignments({
    q: debounced || undefined,
    brandId: brandId ? [brandId] : undefined,
    overdueOnly: overdueOnly || undefined,
    pageSize: 200,
    sort: 'dueAt',
  });

  const assignments = data?.data ?? [];

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Work"
        description={data ? `${data.meta.total} assignments` : undefined}
        actions={
          <>
            <div className="flex rounded-md border p-0.5" role="group" aria-label="View">
              <Button
                variant={view === 'board' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8"
                aria-pressed={view === 'board'}
                aria-label="Board view"
                onClick={() => setView('board')}
              >
                <Columns3 />
              </Button>
              <Button
                variant={view === 'table' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8"
                aria-pressed={view === 'table'}
                aria-label="Table view"
                onClick={() => setView('table')}
              >
                <List />
              </Button>
            </div>
            <Button asChild>
              <Link href="/assignments/new">
                <Plus aria-hidden />
                New assignment
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by reference or title"
          aria-label="Search assignments"
          className="max-w-64"
        />
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
        <Button
          variant={overdueOnly ? 'secondary' : 'outline'}
          size="sm"
          aria-pressed={overdueOnly}
          onClick={() => setOverdueOnly((value) => !value)}
        >
          <Filter aria-hidden />
          Overdue only
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-96" />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No work matches"
          description="Clear the filters, or raise the first assignment. It takes about thirty seconds."
          action={
            <Button asChild>
              <Link href="/assignments/new">New assignment</Link>
            </Button>
          }
        />
      ) : view === 'board' ? (
        <div className="grid gap-3 lg:grid-cols-5">
          {COLUMNS.map((column) => {
            const items = assignments.filter((a) => column.statuses.includes(a.status));
            const value = items.reduce((sum, a) => sum + (a.totalFeeMinor ?? 0), 0);

            return (
              <section key={column.id} aria-label={column.label} className="min-w-0">
                <header className="mb-2 flex items-center gap-2 px-1">
                  <span className={cn('size-2 rounded-full', column.tone)} aria-hidden />
                  <h2 className="text-sm font-semibold">{column.label}</h2>
                  <Badge className="tabular ml-auto">{items.length}</Badge>
                </header>
                <p className="tabular mb-2 px-1 text-xs text-muted-foreground">
                  {formatMoney(value, 'GBP', { compact: true })} committed
                </p>

                <ul className="space-y-2">
                  {items.map((assignment) => (
                    <li key={assignment.id}>
                      <Link href={`/assignments/${assignment.id}`} className="block">
                        <Card className="p-3 transition-shadow hover:shadow-md">
                          <div className="flex items-start justify-between gap-2">
                            <span className="tabular text-xs text-muted-foreground">
                              {assignment.reference}
                            </span>
                            {assignment.priority === 'URGENT' || assignment.priority === 'HIGH' ? (
                              <Badge tone={assignment.priority === 'URGENT' ? 'danger' : 'warning'}>
                                {assignment.priority.toLowerCase()}
                              </Badge>
                            ) : null}
                          </div>

                          <p className="mt-1 line-clamp-2 text-sm font-medium">{assignment.title}</p>

                          {assignment.brand ? (
                            <div className="mt-2">
                              <BrandChip
                                name={assignment.brand.name}
                                colorHex={assignment.brand.colorHex}
                              />
                            </div>
                          ) : null}

                          <div className="mt-3 flex items-center justify-between gap-2">
                            {assignment.presenter ? (
                              <span className="flex min-w-0 items-center gap-1.5">
                                <Avatar
                                  name={assignment.presenter.displayName}
                                  src={assignment.presenter.photoUrl}
                                  size="xs"
                                />
                                <span className="truncate text-xs">
                                  {assignment.presenter.displayName}
                                </span>
                              </span>
                            ) : (
                              <Badge tone="warning">Unassigned</Badge>
                            )}
                            <DueBadge
                              dueAt={assignment.dueAt}
                              status={assignment.status}
                              latenessMinutes={
                                assignment.status === 'COMPLETED' ? assignment.latenessMinutes : null
                              }
                            />
                          </div>

                          {assignment.scriptCount > 0 ? (
                            <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                              {assignment.scriptCount} script
                              {assignment.scriptCount === 1 ? '' : 's'} attached
                            </p>
                          ) : null}
                        </Card>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">All assignments</caption>
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Ref</th>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Brand</th>
                <th className="px-4 py-2.5 font-medium">Presenter</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium" data-numeric>
                  Turnaround
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Due</th>
                <th className="px-4 py-2.5 text-right font-medium" data-numeric>
                  Fee
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {assignments.map((assignment: AssignmentSummaryDto) => (
                <tr key={assignment.id} className="hover:bg-muted/40">
                  <td className="tabular px-4 py-2.5 text-muted-foreground">
                    <Link href={`/assignments/${assignment.id}`} className="hover:underline">
                      {assignment.reference}
                    </Link>
                  </td>
                  <td className="max-w-xs truncate px-4 py-2.5 font-medium">
                    <Link href={`/assignments/${assignment.id}`} className="hover:underline">
                      {assignment.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {assignment.brand ? (
                      <BrandChip name={assignment.brand.name} colorHex={assignment.brand.colorHex} />
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {assignment.presenter?.displayName ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={assignment.status} />
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" data-numeric>
                    {formatDuration(assignment.turnaroundMinutes)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DueBadge
                      dueAt={assignment.dueAt}
                      status={assignment.status}
                      latenessMinutes={assignment.latenessMinutes}
                    />
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" data-numeric>
                    {formatMoney(assignment.totalFeeMinor, assignment.feeCurrency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
