'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Info, Sparkles } from 'lucide-react';
import {
  RATE_UNITS,
  RATE_UNIT_LABEL,
  formatMoney,
  parseMoneyToMinor,
  type RateUnit,
} from '@presenter-ops/shared';

import { useBrands, useCreateAssignment, useSuggestedPresenters, useWorkTypes } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Textarea,
  Tooltip,
} from '@/components/ui';
import { EntityCombobox, type NameOrIdValue } from '@/components/entity-combobox';

/**
 * Raise and send a piece of work.
 *
 * The panel on the right is the point of this screen. Once a brand is chosen,
 * it ranks the presenters who could do the job and — importantly — shows WHY
 * each one is where they are, and who was excluded and for what reason. The
 * producer keeps the decision; the tool just stops the same two names getting
 * picked out of habit.
 */
export default function NewAssignmentClient({
  initialPresenterId,
}: {
  initialPresenterId: string | null;
}) {
  const router = useRouter();
  const createAssignment = useCreateAssignment();

  const { data: brands } = useBrands();
  const { data: workTypes } = useWorkTypes();

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [brand, setBrand] = React.useState<NameOrIdValue | null>(null);
  const [workType, setWorkType] = React.useState<NameOrIdValue | null>(null);
  const [presenterId, setPresenterId] = React.useState<string | null>(initialPresenterId);
  const [deliverableCount, setDeliverableCount] = React.useState('1');
  const [dueAt, setDueAt] = React.useState('');
  const [priority, setPriority] = React.useState('NORMAL');
  const [fee, setFee] = React.useState('');
  const [feeUnit, setFeeUnit] = React.useState<RateUnit>('PER_VIDEO');

  const brandId = brand && 'id' in brand ? brand.id : undefined;
  const { data: suggestions } = useSuggestedPresenters({
    brandId,
    workTypeId: workType && 'id' in workType ? workType.id : undefined,
    dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
  });

  const chosen = suggestions?.suggestions?.find((s: any) => s.presenterId === presenterId);

  // Picking a presenter fills the fee from their rate card, but leaves it
  // editable — the rate is a starting point, not a rule.
  React.useEffect(() => {
    if (chosen && !fee && chosen.rateMinor) {
      setFee((chosen.rateMinor / 100).toFixed(2));
      setFeeUnit(chosen.rateUnit);
    }
  }, [chosen, fee]);

  const submit = async (send: boolean) => {
    const assignment = await createAssignment.mutateAsync({
      title,
      description,
      brand,
      workType,
      presenterId,
      priority,
      deliverableCount: Number(deliverableCount) || 1,
      fee: fee || null,
      feeUnit,
      feeQuantity: Number(deliverableCount) || 1,
      feeCurrency: 'GBP',
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      sendImmediately: send,
    });
    router.push(`/assignments/${(assignment as { id: string }).id}`);
  };

  const totalFee = fee
    ? parseMoneyToMinor(fee) * (feeUnit === 'PER_PROJECT' ? 1 : Number(deliverableCount) || 1)
    : null;

  return (
    <div className="mx-auto max-w-[1200px] pb-24">
      <PageHeader title="New assignment" breadcrumb={<span>Work / New</span>} />

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>The job</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Title" required>
                {(props) => (
                  <Input
                    {...props}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Autumn intake explainer — 3 videos"
                  />
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Brand or website" required>
                  {(props) => (
                    <EntityCombobox
                      {...props}
                      options={(brands ?? []).map((b) => ({
                        id: b.id,
                        name: b.name,
                        colorHex: b.colorHex,
                      }))}
                      value={brand}
                      onChange={setBrand}
                      entityLabel="brand"
                      placeholder="Aspirex, Selector…"
                    />
                  )}
                </Field>

                <Field label="Type of work">
                  {(props) => (
                    <EntityCombobox
                      {...props}
                      options={workTypes ?? []}
                      value={workType}
                      onChange={setWorkType}
                      entityLabel="work type"
                      placeholder="Talking head, voiceover…"
                    />
                  )}
                </Field>
              </div>

              <Field label="Brief" hint="What the presenter needs to know. The script is attached separately.">
                {(props) => (
                  <Textarea
                    {...props}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={5}
                  />
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scope, timing and fee</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="How many videos" required>
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    value={deliverableCount}
                    onChange={(event) => setDeliverableCount(event.target.value)}
                    className="tabular"
                  />
                )}
              </Field>

              <Field label="Due by" required hint="Turnaround is measured against this.">
                {(props) => (
                  <Input
                    {...props}
                    type="datetime-local"
                    value={dueAt}
                    onChange={(event) => setDueAt(event.target.value)}
                  />
                )}
              </Field>

              <Field label="Priority">
                {(props) => (
                  <select
                    {...props}
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                )}
              </Field>

              <Field
                label="Fee"
                hint={
                  chosen
                    ? `Pre-filled from ${chosen.displayName}'s ${chosen.rateIsInherited ? 'default' : 'brand'} rate.`
                    : 'Fills automatically once you choose a presenter.'
                }
              >
                {(props) => (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        £
                      </span>
                      <Input
                        {...props}
                        value={fee}
                        onChange={(event) => setFee(event.target.value)}
                        inputMode="decimal"
                        className="tabular pl-7"
                      />
                    </div>
                    <select
                      value={feeUnit}
                      onChange={(event) => setFeeUnit(event.target.value as RateUnit)}
                      aria-label="Fee unit"
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {RATE_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {RATE_UNIT_LABEL[unit]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </Field>

              {totalFee ? (
                <p className="tabular text-sm sm:col-span-2">
                  Total commitment:{' '}
                  <span className="font-semibold">{formatMoney(totalFee, 'GBP')}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    This figure is fixed onto the assignment when you send it, so changing their
                    rate later will not rewrite it.
                  </span>
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* --- suggestion rail ------------------------------------------------ */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Who should do this?</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {brandId
                    ? 'Ranked by who is owed work, not by who is best.'
                    : 'Choose a brand to see who is contracted to it.'}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 p-3">
              {!brandId ? (
                <p className="p-2 text-sm text-muted-foreground">
                  Presenters only appear once they hold a signed contract for the brand.
                </p>
              ) : (
                <>
                  {suggestions?.suggestions?.map((suggestion: any) => (
                    <button
                      key={suggestion.presenterId}
                      type="button"
                      onClick={() => setPresenterId(suggestion.presenterId)}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                        presenterId === suggestion.presenterId &&
                          'border-primary bg-primary/5 ring-1 ring-primary',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={suggestion.displayName} src={suggestion.photoUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{suggestion.displayName}</p>
                          <p className="tabular text-xs text-muted-foreground">
                            {formatMoney(suggestion.rateMinor, suggestion.currency)}{' '}
                            {RATE_UNIT_LABEL[suggestion.rateUnit as RateUnit]}
                          </p>
                        </div>
                        <Tooltip
                          content={
                            <ul className="space-y-1">
                              {suggestion.breakdown.map((part: any) => (
                                <li key={part.label}>
                                  <span className="font-medium">
                                    {part.label}: {part.points}/{part.max}
                                  </span>
                                  <br />
                                  {part.reason}
                                </li>
                              ))}
                            </ul>
                          }
                        >
                          <Badge tone="primary" className="tabular cursor-help">
                            {suggestion.score}
                          </Badge>
                        </Tooltip>
                      </div>
                    </button>
                  ))}

                  {suggestions?.excluded?.length > 0 ? (
                    <details className="rounded-lg border p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        {suggestions.excluded.length} not shown
                      </summary>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {suggestions.excluded.map((item: any) => (
                          <li key={item.presenterId}>
                            <span className="font-medium text-foreground">{item.displayName}</span> —{' '}
                            {item.reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  {suggestions?.methodology ? (
                    <p className="flex gap-1.5 px-2 pt-1 text-xs text-muted-foreground">
                      <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                      {suggestions.methodology}
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur lg:pl-64">
        <div className="mx-auto flex max-w-[1200px] items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={!title || !brand}
            loading={createAssignment.isPending}
            onClick={() => submit(false)}
          >
            Save as draft
          </Button>
          <Tooltip
            content={
              !presenterId || !dueAt
                ? 'A presenter and a due date are needed before this can be sent.'
                : 'Notifies the presenter and starts the turnaround clock.'
            }
          >
            <span>
              <Button
                disabled={!title || !brand || !presenterId || !dueAt}
                loading={createAssignment.isPending}
                onClick={() => submit(true)}
              >
                Create and send
              </Button>
            </span>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}