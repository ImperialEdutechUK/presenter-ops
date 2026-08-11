'use client';

import * as React from 'react';
import {
  ASSIGNMENT_STATUS_LABEL,
  PIPELINE_STAGES,
  formatDuration,
  formatLateness,
  type AssignmentStatus,
  type PresenterStatus,
} from '@presenter-ops/shared';
import { AlertTriangle, Check, Clock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui';

/**
 * Status colour is meaning, not decoration. The mapping is fixed here so the
 * same status is the same colour on the board, the table, the profile and the
 * portal — a user should never have to re-learn what amber means per screen.
 *
 * Colour is never the ONLY signal: every pill carries its label, so the scheme
 * still works for the roughly 1 in 12 men with a colour vision deficiency.
 */
const STATUS_TONE: Record<AssignmentStatus, string> = {
  DRAFT: 'bg-secondary text-secondary-foreground',
  ASSIGNED: 'bg-info/10 text-info',
  ACCEPTED: 'bg-info/10 text-info',
  IN_PROGRESS: 'bg-primary/10 text-primary',
  SUBMITTED: 'bg-warning/10 text-warning',
  IN_REVIEW: 'bg-warning/10 text-warning',
  REVISIONS_REQUESTED: 'bg-destructive/10 text-destructive',
  APPROVED: 'bg-success/10 text-success',
  COMPLETED: 'bg-success/10 text-success',
  DECLINED: 'bg-muted text-muted-foreground line-through',
  CANCELLED: 'bg-muted text-muted-foreground line-through',
};

export function StatusPill({
  status,
  className,
}: {
  status: AssignmentStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_TONE[status],
        className,
      )}
    >
      {ASSIGNMENT_STATUS_LABEL[status]}
    </span>
  );
}

const PRESENTER_TONE: Record<PresenterStatus, string> = {
  ACTIVE: 'bg-success/10 text-success',
  ONBOARDING: 'bg-info/10 text-info',
  PAUSED: 'bg-warning/10 text-warning',
  ARCHIVED: 'bg-muted text-muted-foreground',
};

export function PresenterStatusPill({ status }: { status: PresenterStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        PRESENTER_TONE[status],
      )}
    >
      {status.toLowerCase()}
    </span>
  );
}

/**
 * The progress rail on an assignment. Shows where the job is in the pipeline
 * and how long each completed step took — which is the answer to "how long did
 * they take", broken down instead of as one opaque number.
 */
export function PipelineRail({
  status,
  timings,
}: {
  status: AssignmentStatus;
  timings: { responseMinutes: number | null; turnaroundMinutes: number | null };
}) {
  const terminated = status === 'CANCELLED' || status === 'DECLINED';
  if (terminated) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        <AlertTriangle className="size-4" aria-hidden />
        This assignment was {status === 'CANCELLED' ? 'cancelled' : 'declined'} and is closed.
      </div>
    );
  }

  const currentIndex = PIPELINE_STAGES.indexOf(status);
  // REVISIONS_REQUESTED is not a stage — it is a loop back to IN_PROGRESS.
  const effectiveIndex =
    status === 'REVISIONS_REQUESTED' ? PIPELINE_STAGES.indexOf('IN_PROGRESS') : currentIndex;

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Progress">
      {PIPELINE_STAGES.map((stage, index) => {
        const done = index < effectiveIndex;
        const current = index === effectiveIndex;

        return (
          <li key={stage} className="flex items-center gap-1">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                done && 'bg-success/10 text-success',
                current && 'bg-primary text-primary-foreground',
                !done && !current && 'bg-muted text-muted-foreground',
              )}
              aria-current={current ? 'step' : undefined}
            >
              {done ? <Check className="size-3" aria-hidden /> : null}
              {ASSIGNMENT_STATUS_LABEL[stage]}
            </span>
            {index < PIPELINE_STAGES.length - 1 ? (
              <span className="h-px w-3 bg-border" aria-hidden />
            ) : null}
          </li>
        );
      })}

      {status === 'REVISIONS_REQUESTED' ? (
        <li>
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
            Revisions requested
          </span>
        </li>
      ) : null}

      <li className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
        <Tooltip content="Time between the job being sent and the presenter accepting it.">
          <span className="tabular flex items-center gap-1">
            <Clock className="size-3" aria-hidden />
            Replied in {formatDuration(timings.responseMinutes)}
          </span>
        </Tooltip>
        <Tooltip content="Time between the job being sent and the delivery link arriving.">
          <span className="tabular">Turnaround {formatDuration(timings.turnaroundMinutes)}</span>
        </Tooltip>
      </li>
    </ol>
  );
}

export function DueBadge({
  dueAt,
  status,
  latenessMinutes,
}: {
  dueAt: string | null;
  status: AssignmentStatus;
  latenessMinutes: number | null;
}) {
  if (latenessMinutes !== null) {
    const { label, tone } = formatLateness(latenessMinutes);
    return (
      <span
        className={cn(
          'tabular text-xs font-medium',
          tone === 'positive' && 'text-success',
          tone === 'negative' && 'text-destructive',
          tone === 'neutral' && 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    );
  }

  if (!dueAt) return <span className="text-xs text-muted-foreground">No due date</span>;

  const due = new Date(dueAt);
  const hoursLeft = (due.getTime() - Date.now()) / 3_600_000;
  const live = !['COMPLETED', 'CANCELLED', 'DECLINED', 'APPROVED'].includes(status);

  return (
    <span
      className={cn(
        'tabular text-xs font-medium',
        live && hoursLeft < 0 && 'text-destructive',
        live && hoursLeft >= 0 && hoursLeft < 48 && 'text-warning',
        (!live || hoursLeft >= 48) && 'text-muted-foreground',
      )}
    >
      {hoursLeft < 0 && live
        ? `${formatDuration(Math.abs(Math.round(hoursLeft * 60)))} overdue`
        : `Due ${due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
    </span>
  );
}
