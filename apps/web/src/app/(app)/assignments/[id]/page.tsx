'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as Tabs from '@radix-ui/react-tabs';
import {
  ExternalLink,
  FileText,
  Link2,
  MessageSquare,
  Sparkles,
  Star,
  Upload,
} from 'lucide-react';
import {
  RATE_UNIT_LABEL,
  RATE_UNIT_QUANTITY_LABEL,
  formatDuration,
  formatMoney,
} from '@presenter-ops/shared';

import { api, uploadFile } from '@/lib/api';
import {
  useAssignment,
  useRecordPerformance,
  useSaveFeedback,
  useTransitionAssignment,
} from '@/lib/queries';
import { formatDate, relativeTime } from '@/lib/utils';
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
  Field,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
  Tooltip,
} from '@/components/ui';
import { PipelineRail, StatusPill } from '@/components/status';

/**
 * One assignment, everything about it.
 *
 * Layout: the actions live in a right rail that stays put while the left
 * column scrolls. Producers work down the page (brief → scripts → delivery)
 * but need "approve" and "request revisions" reachable throughout; putting
 * them at the bottom would mean scrolling back every time.
 */
export default function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: assignment, isLoading } = useAssignment(id);
  const transition = useTransitionAssignment(id);
  const [note, setNote] = React.useState('');
  const [deliveryUrl, setDeliveryUrl] = React.useState('');

  if (isLoading || !assignment) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const scripts = assignment.attachments.filter((a) => a.kind === 'SCRIPT');

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        breadcrumb={
          <Link href="/assignments" className="hover:underline">
            Work
          </Link>
        }
        title={assignment.title}
        description={`${assignment.reference} · raised by ${assignment.createdBy.name} ${relativeTime(assignment.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            {assignment.brand ? (
              <BrandChip name={assignment.brand.name} colorHex={assignment.brand.colorHex} />
            ) : null}
            <StatusPill status={assignment.status} />
          </div>
        }
      />

      <Card className="mb-5 p-4">
        <PipelineRail
          status={assignment.status}
          timings={{
            responseMinutes: assignment.responseMinutes,
            turnaroundMinutes: assignment.turnaroundMinutes,
          }}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        {/* --- left column --------------------------------------------------- */}
        <div className="min-w-0 space-y-5">
          <Tabs.Root defaultValue="brief">
            <Tabs.List className="mb-4 flex gap-1 border-b" aria-label="Assignment sections">
              {[
                ['brief', 'Brief & scripts'],
                ['delivery', 'Delivery'],
                ['feedback', 'Feedback'],
                ['performance', 'Performance'],
                ['activity', 'Activity'],
              ].map(([value, label]) => (
                <Tabs.Trigger
                  key={value}
                  value={value}
                  className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground"
                >
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            {/* --- brief ---------------------------------------------------- */}
            <Tabs.Content value="brief" className="space-y-5 focus-visible:outline-none">
              <Card>
                <CardHeader>
                  <CardTitle>The brief</CardTitle>
                </CardHeader>
                <CardContent>
                  {assignment.description ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {assignment.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No brief written. The presenter has only the title and the script.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Scripts from marketing</CardTitle>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Uploading a new version of a script keeps the old one on record; the presenter
                      only ever sees the current one.
                    </p>
                  </div>
                  <ScriptUploadButton assignmentId={id} />
                </CardHeader>
                <CardContent className="p-0">
                  {scripts.length === 0 ? (
                    <div className="p-5">
                      <EmptyState
                        icon={FileText}
                        title="No script attached"
                        description="Upload the script marketing supplied so the presenter has it in their portal."
                      />
                    </div>
                  ) : (
                    <ul className="divide-y border-t">
                      {scripts.map((script) => (
                        <li
                          key={script.id}
                          className="flex items-center gap-3 px-5 py-3 text-sm"
                        >
                          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{script.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              v{script.version} · {script.uploadedBy.name} ·{' '}
                              {formatDate(script.createdAt)}
                              {script.sizeBytes
                                ? ` · ${(script.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                                : ''}
                            </p>
                          </div>
                          {!script.isCurrent ? <Badge>superseded</Badge> : null}
                          {!script.visibleToPresenter ? (
                            <Badge tone="warning">hidden from presenter</Badge>
                          ) : null}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const { url } = await api.get<{ url: string }>(
                                `/files/${script.id}/download`,
                              );
                              window.open(url, '_blank', 'noopener');
                            }}
                          >
                            Open
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </Tabs.Content>

            {/* --- delivery -------------------------------------------------- */}
            <Tabs.Content value="delivery" className="focus-visible:outline-none">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Finished files</CardTitle>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Videos stay in OneDrive or SharePoint. The system holds the link, not the
                      file — see the architecture note on why.
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {assignment.deliveryUrl ? (
                    <a
                      href={assignment.deliveryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                    >
                      <Link2 className="size-5 shrink-0 text-primary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">Open the delivered files</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {assignment.deliveryUrl}
                        </p>
                      </div>
                      <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
                    </a>
                  ) : (
                    <Field
                      label="OneDrive or SharePoint link"
                      hint="Paste the folder link once the presenter has uploaded."
                    >
                      {(props) => (
                        <div className="flex gap-2">
                          <Input
                            {...props}
                            value={deliveryUrl}
                            onChange={(event) => setDeliveryUrl(event.target.value)}
                            placeholder="https://yourcompany-my.sharepoint.com/…"
                          />
                          <Button
                            disabled={!deliveryUrl}
                            onClick={() =>
                              transition.mutate({ to: 'SUBMITTED', deliveryUrl })
                            }
                          >
                            Record delivery
                          </Button>
                        </div>
                      )}
                    </Field>
                  )}

                  {assignment.deliveryNotes ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Notes from the presenter
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{assignment.deliveryNotes}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </Tabs.Content>

            {/* --- feedback -------------------------------------------------- */}
            <Tabs.Content value="feedback" className="focus-visible:outline-none">
              <FeedbackPanel assignmentId={id} existing={assignment.feedback} />
            </Tabs.Content>

            {/* --- performance ----------------------------------------------- */}
            <Tabs.Content value="performance" className="focus-visible:outline-none">
              <PerformancePanel assignmentId={id} metrics={assignment.performance} />
            </Tabs.Content>

            {/* --- activity -------------------------------------------------- */}
            <Tabs.Content value="activity" className="space-y-5 focus-visible:outline-none">
              <Card>
                <CardHeader>
                  <CardTitle>Conversation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-4">
                    {assignment.comments.map((comment) => (
                      <li key={comment.id} className="flex gap-3">
                        <Avatar name={comment.author.name} src={comment.author.avatarUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            {comment.author.name}
                            <span className="text-xs font-normal text-muted-foreground">
                              {relativeTime(comment.createdAt)}
                            </span>
                            {comment.isInternal ? <Badge tone="warning">internal</Badge> : null}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm">{comment.body}</p>
                        </div>
                      </li>
                    ))}
                    {assignment.comments.length === 0 ? (
                      <li className="text-sm text-muted-foreground">Nothing said yet.</li>
                    ) : null}
                  </ul>

                  <div className="space-y-2 border-t pt-4">
                    <Textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={2}
                      placeholder="Add a note…"
                      aria-label="Add a comment"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!note}
                        onClick={async () => {
                          await api.post(`/assignments/${id}/comments`, {
                            body: note,
                            isInternal: true,
                          });
                          setNote('');
                        }}
                      >
                        Post as internal note
                      </Button>
                      <Button
                        size="sm"
                        disabled={!note}
                        onClick={async () => {
                          await api.post(`/assignments/${id}/comments`, {
                            body: note,
                            isInternal: false,
                          });
                          setNote('');
                        }}
                      >
                        <MessageSquare aria-hidden />
                        Send to presenter
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>History</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ol className="divide-y border-t">
                    {assignment.events.map((event) => (
                      <li key={event.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                        <span className="w-32 shrink-0 text-xs text-muted-foreground">
                          {formatDate(event.createdAt, true)}
                        </span>
                        <span className="flex-1">
                          {event.actor?.name ?? 'System'}{' '}
                          <span className="text-muted-foreground">
                            {describeEvent(event.type, event.fromStatus, event.toStatus)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </Tabs.Content>
          </Tabs.Root>
        </div>

        {/* --- right rail ---------------------------------------------------- */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">What happens next</h2>
            <div className="space-y-2">
              {assignment.availableTransitions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This assignment is closed. Nothing further to do.
                </p>
              ) : (
                assignment.availableTransitions.map((option) => (
                  <Tooltip
                    key={option.to}
                    content={
                      option.blockedBy.length
                        ? `Fill in ${option.blockedBy.join(' and ')} first.`
                        : (option as { description?: string }).description || option.label
                    }
                  >
                    <span className="block">
                      <Button
                        className="w-full justify-start"
                        variant={
                          option.tone === 'positive'
                            ? 'success'
                            : option.tone === 'destructive'
                              ? 'destructive'
                              : option.tone === 'caution'
                                ? 'outline'
                                : 'secondary'
                        }
                        disabled={option.blockedBy.length > 0}
                        loading={transition.isPending}
                        onClick={() =>
                          transition.mutate({
                            to: option.to,
                            note: note || undefined,
                            deliveryUrl: deliveryUrl || undefined,
                          })
                        }
                      >
                        {option.label}
                      </Button>
                    </span>
                  </Tooltip>
                ))
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <dl className="space-y-3 text-sm">
              <Detail label="Presenter">
                {assignment.presenter ? (
                  <Link
                    href={`/presenters/${assignment.presenter.id}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <Avatar
                      name={assignment.presenter.displayName}
                      src={assignment.presenter.photoUrl}
                      size="xs"
                    />
                    {assignment.presenter.displayName}
                  </Link>
                ) : (
                  <Badge tone="warning">Not assigned</Badge>
                )}
              </Detail>
              <Detail label="Work type">{assignment.workType?.name ?? '—'}</Detail>
              <Detail label="Deliverables">
                {assignment.deliverableCount} video{assignment.deliverableCount === 1 ? '' : 's'}
              </Detail>
              <Detail label="Fee">
                <span className="tabular">
                  {formatMoney(assignment.feeMinor, assignment.feeCurrency)}{' '}
                  <span className="text-xs text-muted-foreground">
                    {assignment.feeUnit ? RATE_UNIT_LABEL[assignment.feeUnit] : ''}
                  </span>
                </span>
              </Detail>
              <Detail label="Total">
                <span className="tabular font-medium">
                  {formatMoney(assignment.totalFeeMinor, assignment.feeCurrency)}
                  {assignment.feeUnit && assignment.feeUnit !== 'PER_PROJECT' ? (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({assignment.feeQuantity} {RATE_UNIT_QUANTITY_LABEL[assignment.feeUnit]})
                    </span>
                  ) : null}
                </span>
              </Detail>
              <Detail label="Sent">{formatDate(assignment.assignedAt, true)}</Detail>
              <Detail label="Due">{formatDate(assignment.dueAt, true)}</Detail>
              <Detail label="Replied in">{formatDuration(assignment.responseMinutes)}</Detail>
              <Detail label="Turnaround">{formatDuration(assignment.turnaroundMinutes)}</Detail>
              <Detail label="Hours logged">
                {assignment.actualHours ?? '—'}
                {assignment.estimatedHours ? (
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    of {assignment.estimatedHours} estimated
                  </span>
                ) : null}
              </Detail>
              {assignment.revisionCount > 0 ? (
                <Detail label="Revisions">
                  <Badge tone="warning">{assignment.revisionCount}</Badge>
                </Detail>
              ) : null}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function describeEvent(type: string, from: string | null, to: string | null) {
  if (type === 'STATUS_CHANGED') return `moved this from ${from?.toLowerCase()} to ${to?.toLowerCase()}`;
  return (
    {
      ASSIGNMENT_CREATED: 'created this assignment',
      ASSIGNMENT_UPDATED: 'edited the details',
      PRESENTER_CHANGED: 'changed the presenter',
      ATTACHMENT_ADDED: 'attached a file',
      ATTACHMENT_REMOVED: 'removed a file',
      COMMENT_ADDED: 'left a comment',
      DELIVERY_SUBMITTED: 'submitted the delivery',
      FEEDBACK_ADDED: 'recorded feedback',
      PERFORMANCE_RECORDED: 'recorded performance figures',
      REMINDER_SENT: 'was sent a reminder',
    }[type] ?? type.toLowerCase().replace(/_/g, ' ')
  );
}

function ScriptUploadButton({ assignmentId }: { assignmentId: string }) {
  const [progress, setProgress] = React.useState<number | null>(null);

  return (
    <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent">
      <Upload className="size-4" aria-hidden />
      {progress === null ? 'Upload script' : `${progress}%`}
      <input
        type="file"
        className="sr-only"
        accept=".pdf,.docx,.doc,.txt,.md,.rtf"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setProgress(0);
          try {
            await uploadFile(file, { kind: 'SCRIPT', assignmentId }, setProgress);
          } finally {
            setProgress(null);
          }
        }}
      />
    </label>
  );
}

function FeedbackPanel({ assignmentId, existing }: { assignmentId: string; existing: any[] }) {
  const save = useSaveFeedback(assignmentId);
  const [ratings, setRatings] = React.useState<Record<string, number>>({ overallRating: 0 });
  const [comment, setComment] = React.useState('');
  const [share, setShare] = React.useState(false);

  const dimensions = [
    ['overallRating', 'Overall'],
    ['deliveryRating', 'Delivery to camera'],
    ['scriptAccuracy', 'Stuck to the script'],
    ['professionalism', 'Professionalism'],
    ['timeliness', 'Timeliness'],
    ['productionQuality', 'Production quality'],
  ] as const;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Record feedback</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Kept internal unless you tick the box. Feeds the presenter&apos;s average rating either
              way.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {dimensions.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  {label}
                  {key === 'overallRating' ? <span className="text-destructive"> *</span> : null}
                </span>
                <div className="flex gap-0.5" role="radiogroup" aria-label={label}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={ratings[key] === value}
                      aria-label={`${value} out of 5`}
                      onClick={() => setRatings((current) => ({ ...current, [key]: value }))}
                      className="rounded p-0.5 hover:scale-110"
                    >
                      <Star
                        className={
                          (ratings[key] ?? 0) >= value
                            ? 'size-5 fill-warning text-warning'
                            : 'size-5 text-muted-foreground/30'
                        }
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Field label="What went well, what to change" hint="Specific beats general.">
            {(props) => (
              <Textarea
                {...props}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={3}
              />
            )}
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={share}
              onChange={(event) => setShare(event.target.checked)}
              className="size-4 accent-[hsl(var(--primary))]"
            />
            Share this with the presenter in their portal
          </label>

          <div className="flex justify-end">
            <Button
              disabled={!ratings.overallRating}
              loading={save.isPending}
              onClick={() =>
                save.mutate({ ...ratings, comment, visibleToPresenter: share })
              }
            >
              Save feedback
            </Button>
          </div>
        </CardContent>
      </Card>

      {existing.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Already recorded</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {existing.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {item.author.name} · {item.overallRating}/5
                  {item.visibleToPresenter ? (
                    <Badge tone="success" className="ml-2">
                      shared
                    </Badge>
                  ) : null}
                </p>
                {item.comment ? <p className="mt-1 text-sm">{item.comment}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function PerformancePanel({ assignmentId, metrics }: { assignmentId: string; metrics: any[] }) {
  const record = useRecordPerformance(assignmentId);
  const [form, setForm] = React.useState<Record<string, string>>({
    platform: 'YOUTUBE',
    measuredOn: new Date().toISOString().slice(0, 10),
  });

  const numericFields = [
    ['views', 'Views'],
    ['impressions', 'Impressions'],
    ['watchTimeMinutes', 'Watch time (minutes)'],
    ['likes', 'Likes'],
    ['comments', 'Comments'],
    ['shares', 'Shares'],
    ['clicks', 'Clicks'],
    ['conversions', 'Conversions'],
  ] as const;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Add a measurement</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Figures are snapshots, not overwrites. Adding a second reading later builds a curve
              rather than replacing the first.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Platform" required>
              {(props) => (
                <select
                  {...props}
                  value={form.platform}
                  onChange={(event) => setForm({ ...form, platform: event.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {['YOUTUBE', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'WEBSITE', 'PAID_ADS'].map(
                    (platform) => (
                      <option key={platform} value={platform}>
                        {platform.replace('_', ' ')}
                      </option>
                    ),
                  )}
                </select>
              )}
            </Field>
            <Field label="Measured on" required>
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={form.measuredOn}
                  onChange={(event) => setForm({ ...form, measuredOn: event.target.value })}
                />
              )}
            </Field>
            <Field label="Content URL">
              {(props) => (
                <Input
                  {...props}
                  value={form.contentUrl ?? ''}
                  onChange={(event) => setForm({ ...form, contentUrl: event.target.value })}
                  placeholder="https://youtube.com/watch?v=…"
                />
              )}
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            {numericFields.map(([key, label]) => (
              <Field key={key} label={label}>
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={0}
                    className="tabular"
                    value={form[key] ?? ''}
                    onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  />
                )}
              </Field>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              loading={record.isPending}
              onClick={() =>
                record.mutate({
                  platform: form.platform,
                  measuredOn: form.measuredOn,
                  contentUrl: form.contentUrl || null,
                  currency: 'GBP',
                  ...Object.fromEntries(
                    numericFields
                      .filter(([key]) => form[key])
                      .map(([key]) => [key, Number(form[key])]),
                  ),
                })
              }
            >
              Record figures
            </Button>
          </div>
        </CardContent>
      </Card>

      {metrics.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recorded</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Platform</th>
                  <th className="px-5 py-2.5 font-medium">Measured</th>
                  <th className="px-5 py-2.5 text-right font-medium" data-numeric>
                    Views
                  </th>
                  <th className="px-5 py-2.5 text-right font-medium" data-numeric>
                    Engagement
                  </th>
                  <th className="px-5 py-2.5 text-right font-medium" data-numeric>
                    Cost / 1k views
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {metrics.map((metric) => (
                  <tr key={metric.id}>
                    <td className="px-5 py-3 capitalize">{metric.platform.toLowerCase()}</td>
                    <td className="px-5 py-3">{formatDate(metric.measuredOn)}</td>
                    <td className="tabular px-5 py-3 text-right" data-numeric>
                      {metric.views?.toLocaleString('en-GB') ?? '—'}
                    </td>
                    <td className="tabular px-5 py-3 text-right" data-numeric>
                      {metric.derived?.engagementRatePct === null ||
                      metric.derived?.engagementRatePct === undefined
                        ? '—'
                        : `${metric.derived.engagementRatePct}%`}
                    </td>
                    <td className="tabular px-5 py-3 text-right" data-numeric>
                      <Tooltip content="The presenter's fee divided by views, scaled to a thousand views. A rough cost-effectiveness figure, not a full cost per acquisition.">
                        <span className="cursor-help">
                          {metric.derived?.feeCostPerThousandViewsMinor
                            ? formatMoney(metric.derived.feeCostPerThousandViewsMinor, 'GBP')
                            : '—'}
                        </span>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
