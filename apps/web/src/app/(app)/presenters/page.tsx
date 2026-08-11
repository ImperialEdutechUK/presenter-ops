'use client';

import * as React from 'react';
import Link from 'next/link';
import { LayoutGrid, List, Plus, Search, Star, Users } from 'lucide-react';
import { formatDuration, formatMoney, RATE_UNIT_LABEL } from '@presenter-ops/shared';

import { useBrands, usePresenters } from '@/lib/queries';
import { relativeTime } from '@/lib/utils';
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
  Tooltip,
} from '@/components/ui';
import { PresenterStatusPill } from '@/components/status';

/**
 * Presenter directory.
 *
 * Two views because two jobs are being done here:
 *   - the CARD view is for "who could do this?" — faces, brands, availability
 *   - the TABLE view is for "who have we underused?" — numbers, sortable
 * Neither is a compromise of the other, and the choice is remembered.
 */
export default function PresentersPage() {
  const [view, setView] = React.useState<'cards' | 'table'>('cards');
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [brandId, setBrandId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string[]>(['ACTIVE', 'ONBOARDING']);
  const [sort, setSort] = React.useState('name');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 220);
    return () => clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    const saved = window.localStorage.getItem('presenters:view');
    if (saved === 'cards' || saved === 'table') setView(saved);
  }, []);

  const { data: brands } = useBrands();
  const { data, isLoading } = usePresenters({
    q: debounced || undefined,
    brandId: brandId ? [brandId] : undefined,
    status,
    sort,
    direction: sort === 'name' ? 'asc' : 'desc',
    pageSize: 60,
  });

  const setViewAndRemember = (next: 'cards' | 'table') => {
    setView(next);
    window.localStorage.setItem('presenters:view', next);
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Presenters"
        description={
          data ? `${data.meta.total} profile${data.meta.total === 1 ? '' : 's'}` : undefined
        }
        actions={
          <>
            <div className="flex rounded-md border p-0.5" role="group" aria-label="View">
              <Button
                variant={view === 'cards' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8"
                aria-pressed={view === 'cards'}
                aria-label="Card view"
                onClick={() => setViewAndRemember('cards')}
              >
                <LayoutGrid />
              </Button>
              <Button
                variant={view === 'table' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8"
                aria-pressed={view === 'table'}
                aria-label="Table view"
                onClick={() => setViewAndRemember('table')}
              >
                <List />
              </Button>
            </div>
            <Button asChild>
              <Link href="/presenters/new">
                <Plus aria-hidden />
                Add presenter
              </Link>
            </Button>
          </>
        }
      />

      {/* --- filters ------------------------------------------------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email or location"
            aria-label="Search presenters"
            className="pl-9"
          />
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

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort by"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="name">Name A–Z</option>
          <option value="lastAssignedAt">Longest since last assigned</option>
          <option value="completedAssignments">Most work completed</option>
          <option value="avgRating">Highest rated</option>
          <option value="avgTurnaroundMinutes">Fastest turnaround</option>
        </select>

        <Button
          variant={status.includes('ARCHIVED') ? 'secondary' : 'outline'}
          size="sm"
          onClick={() =>
            setStatus((current) =>
              current.includes('ARCHIVED')
                ? ['ACTIVE', 'ONBOARDING']
                : ['ACTIVE', 'ONBOARDING', 'PAUSED', 'ARCHIVED'],
            )
          }
        >
          {status.includes('ARCHIVED') ? 'Hide' : 'Show'} paused and archived
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44" />
          ))}
        </div>
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title={debounced ? 'No presenters match that search' : 'No presenters yet'}
          description={
            debounced
              ? 'Try a shorter search, or clear the brand filter.'
              : 'Add the first profile: their photo, rate, and the websites they have signed contracts to.'
          }
          action={
            <Button asChild>
              <Link href="/presenters/new">Add the first presenter</Link>
            </Button>
          }
        />
      ) : view === 'cards' ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {data.data.map((presenter) => (
            <li key={presenter.id}>
              <Link href={`/presenters/${presenter.id}`} className="group block h-full">
                <Card className="h-full p-4 transition-shadow group-hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <Avatar name={presenter.displayName} src={presenter.photoUrl} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-medium">{presenter.displayName}</p>
                        <PresenterStatusPill status={presenter.status} />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{presenter.email}</p>
                      <p className="tabular mt-1.5 text-sm">
                        {presenter.defaultRateMinor
                          ? `${formatMoney(presenter.defaultRateMinor, presenter.defaultCurrency)} ${RATE_UNIT_LABEL[presenter.defaultRateUnit]}`
                          : 'No rate set'}
                      </p>
                    </div>
                  </div>

                  <ul className="mt-3 flex flex-wrap gap-1">
                    {presenter.brands.slice(0, 4).map((brand) => (
                      <li key={brand.id}>
                        <BrandChip name={brand.name} colorHex={brand.colorHex} />
                      </li>
                    ))}
                    {presenter.brands.length > 4 ? (
                      <li>
                        <Badge>+{presenter.brands.length - 4}</Badge>
                      </li>
                    ) : null}
                    {presenter.brands.length === 0 ? (
                      <li>
                        <Badge tone="warning">No contracts yet</Badge>
                      </li>
                    ) : null}
                  </ul>

                  <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-center">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Active
                      </dt>
                      <dd className="tabular text-sm font-medium">{presenter.activeAssignments}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Done
                      </dt>
                      <dd className="tabular text-sm font-medium">
                        {presenter.completedAssignments}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Rating
                      </dt>
                      <dd className="tabular flex items-center justify-center gap-0.5 text-sm font-medium">
                        {presenter.avgRating ? (
                          <>
                            <Star className="size-3 fill-warning text-warning" aria-hidden />
                            {presenter.avgRating.toFixed(1)}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-3 text-xs text-muted-foreground">
                    Last assigned{' '}
                    {presenter.lastAssignedAt ? relativeTime(presenter.lastAssignedAt) : 'never'}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">Presenters with workload and quality statistics</caption>
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Presenter
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Brands
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium" data-numeric>
                  Rate
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium" data-numeric>
                  Active
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium" data-numeric>
                  Completed
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium" data-numeric>
                  Turnaround
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium" data-numeric>
                  On time
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium" data-numeric>
                  Rating
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Last assigned
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.data.map((presenter) => (
                <tr key={presenter.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/presenters/${presenter.id}`}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      <Avatar name={presenter.displayName} src={presenter.photoUrl} size="xs" />
                      {presenter.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {presenter.brands.map((brand) => (
                        <BrandChip key={brand.id} name={brand.name} colorHex={brand.colorHex} />
                      ))}
                    </div>
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" data-numeric>
                    {formatMoney(presenter.defaultRateMinor, presenter.defaultCurrency)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" data-numeric>
                    {presenter.activeAssignments}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" data-numeric>
                    {presenter.completedAssignments}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" data-numeric>
                    <Tooltip content="Median time from sending the job to the delivery arriving, across completed work.">
                      <span>{formatDuration(presenter.avgTurnaroundMinutes)}</span>
                    </Tooltip>
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" data-numeric>
                    {presenter.onTimeDeliveryPct === null
                      ? '—'
                      : `${presenter.onTimeDeliveryPct.toFixed(0)}%`}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" data-numeric>
                    {presenter.avgRating?.toFixed(1) ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {presenter.lastAssignedAt ? relativeTime(presenter.lastAssignedAt) : 'Never'}
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
