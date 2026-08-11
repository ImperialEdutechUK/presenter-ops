'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Upload } from 'lucide-react';
import {
  RATE_UNITS,
  RATE_UNIT_LABEL,
  formatMoney,
  parseMoneyToMinor,
  type RateUnit,
} from '@presenter-ops/shared';

import { useBrands, useCreatePresenter } from '@/lib/queries';
import { uploadFile } from '@/lib/api';
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
import { EntityCombobox, EntityMultiCombobox, type NameOrIdValue } from '@/components/entity-combobox';

/**
 * Create a presenter profile.
 *
 * One page, four grouped sections, no wizard. A wizard would be the obvious
 * choice for a form this size, but it hides fields the producer wants to check
 * against a contract in another window, and it makes going back to fix a typo
 * a three-click operation. Grouped sections on one scrollable page let someone
 * fill in what they know, save, and come back — which is how this is actually
 * used, because the signed contract often arrives after the phone call.
 *
 * Only three fields are required: name, email, and nothing else. Everything
 * else can be added later. A form that refuses to save because a rate has not
 * been agreed yet is a form people work around with fake data.
 */

interface ContractRow {
  key: string;
  brand: NameOrIdValue | null;
  contractStatus: 'PENDING' | 'SIGNED' | 'DRAFT' | 'EXPIRED' | 'TERMINATED';
  contractSignedAt: string;
  contractExpiresAt: string;
  rate: string;
  rateUnit: RateUnit | '';
}

const emptyContract = (): ContractRow => ({
  key: Math.random().toString(36).slice(2),
  brand: null,
  contractStatus: 'PENDING',
  contractSignedAt: '',
  contractExpiresAt: '',
  rate: '',
  rateUnit: '',
});

export default function NewPresenterPage() {
  const router = useRouter();
  const { data: brands } = useBrands();
  const createPresenter = useCreatePresenter();

  const [fullName, setFullName] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);

  const [defaultRate, setDefaultRate] = React.useState('');
  const [defaultRateUnit, setDefaultRateUnit] = React.useState<RateUnit>('PER_VIDEO');
  const [currency] = React.useState('GBP');

  const [target, setTarget] = React.useState('');
  const [capacityWeight, setCapacityWeight] = React.useState('1');

  const [tags, setTags] = React.useState<NameOrIdValue[]>([]);
  const [contracts, setContracts] = React.useState<ContractRow[]>([emptyContract()]);
  const [internalNotes, setInternalNotes] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const brandOptions = React.useMemo(
    () => (brands ?? []).map((b) => ({ id: b.id, name: b.name, colorHex: b.colorHex })),
    [brands],
  );

  const updateContract = (key: string, patch: Partial<ContractRow>) =>
    setContracts((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const handlePhoto = async (file: File) => {
    setUploading(true);
    try {
      const attachment = (await uploadFile(file, { kind: 'OTHER' })) as { id: string };
      // The API returns an attachment; the profile stores a stable URL to it.
      setPhotoUrl(`/api/v1/files/${attachment.id}/download`);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const nextErrors: Record<string, string> = {};
    if (!fullName.trim()) nextErrors.fullName = 'A name is required.';
    if (!email.trim()) nextErrors.email = 'An email address is required.';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) nextErrors.email = 'That does not look like an email address.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      document.getElementById('presenter-form')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const presenter = await createPresenter.mutateAsync({
      fullName,
      displayName: displayName || fullName,
      email,
      phone,
      location,
      bio,
      photoUrl,
      status: 'ONBOARDING',
      defaultRate: defaultRate || null,
      defaultRateUnit,
      defaultCurrency: currency,
      targetDeliverablesPerMonth: target ? Number(target) : null,
      capacityWeight: Number(capacityWeight) || 1,
      internalNotes,
      tags,
      contracts: contracts
        .filter((row) => row.brand)
        .map((row) => ({
          brand: row.brand!,
          contractStatus: row.contractStatus,
          contractSignedAt: row.contractSignedAt
            ? new Date(row.contractSignedAt).toISOString()
            : null,
          contractExpiresAt: row.contractExpiresAt
            ? new Date(row.contractExpiresAt).toISOString()
            : null,
          rate: row.rate || null,
          rateUnit: row.rateUnit || null,
          currency,
        })),
    });

    router.push(`/presenters/${(presenter as { id: string }).id}`);
  };

  return (
    <form id="presenter-form" onSubmit={submit} className="mx-auto max-w-3xl pb-24">
      <PageHeader
        title="Add a presenter"
        description="Only a name and an email are needed to save. Everything else can follow."
        breadcrumb={<span>Presenters / New</span>}
      />

      {/* --- 1. who they are ---------------------------------------------- */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Who they are</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar name={fullName || 'New presenter'} src={photoUrl} size="xl" />
            <div>
              <label
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-accent"
                aria-busy={uploading}
              >
                <Upload className="size-4" aria-hidden />
                {uploading ? 'Uploading…' : photoUrl ? 'Replace photo' : 'Upload a photo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handlePhoto(file);
                  }}
                />
              </label>
              <p className="mt-1.5 text-xs text-muted-foreground">
                JPG, PNG or WebP. A square headshot works best.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={errors.fullName}>
              {(props) => (
                <Input
                  {...props}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Amara Okafor"
                  autoComplete="name"
                />
              )}
            </Field>

            <Field label="Known as" hint="Leave blank to use their full name.">
              {(props) => (
                <Input
                  {...props}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={fullName || 'Amara'}
                />
              )}
            </Field>

            <Field label="Email" required error={errors.email} hint="Used to invite them to the portal.">
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="amara@example.com"
                  autoComplete="email"
                />
              )}
            </Field>

            <Field label="Phone">
              {(props) => (
                <Input
                  {...props}
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+44 7700 900000"
                />
              )}
            </Field>

            <Field label="Based in">
              {(props) => (
                <Input
                  {...props}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="London"
                />
              )}
            </Field>

            <Field label="Skills and attributes" hint="Type to add. New ones are created as you go.">
              {() => (
                <EntityMultiCombobox
                  options={[]}
                  values={tags}
                  onChange={setTags}
                  entityLabel="tag"
                  placeholder="on-camera, finance, owns studio…"
                />
              )}
            </Field>
          </div>

          <Field label="Short bio" hint="What they are good at. Shown to producers when choosing someone.">
            {(props) => (
              <Textarea
                {...props}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={3}
                placeholder="Business and finance presenter. Ten years in broadcast, comfortable with autocue."
              />
            )}
          </Field>
        </CardContent>
      </Card>

      {/* --- 2. money ------------------------------------------------------ */}
      <Card className="mb-4">
        <CardHeader>
          <div>
            <CardTitle>Default rate</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The fallback. A brand-specific rate below overrides it.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Amount">
              {(props) => (
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    £
                  </span>
                  <Input
                    {...props}
                    value={defaultRate}
                    onChange={(event) => setDefaultRate(event.target.value)}
                    inputMode="decimal"
                    placeholder="250.00"
                    className="tabular pl-7"
                  />
                </div>
              )}
            </Field>

            <Field label="Per">
              {(props) => (
                <select
                  {...props}
                  value={defaultRateUnit}
                  onChange={(event) => setDefaultRateUnit(event.target.value as RateUnit)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {RATE_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {RATE_UNIT_LABEL[unit]}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <div className="flex items-end pb-1">
              {defaultRate ? (
                <p className="tabular text-sm text-muted-foreground">
                  ={' '}
                  <span className="font-medium text-foreground">
                    {formatMoney(parseMoneyToMinor(defaultRate, currency), currency)}
                  </span>{' '}
                  {RATE_UNIT_LABEL[defaultRateUnit]}
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- 3. contracts -------------------------------------------------- */}
      <Card className="mb-4">
        <CardHeader>
          <div>
            <CardTitle>Websites they have contracts to</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Type the brand name. If it does not exist yet, you will be offered{' '}
              <span className="font-medium">Create “…”</span> — no need to set it up first.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setContracts((rows) => [...rows, emptyContract()])}
          >
            <Plus aria-hidden />
            Add another
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {contracts.map((row, index) => (
            <fieldset key={row.key} className="rounded-lg border p-4">
              <legend className="px-1.5 text-xs font-medium text-muted-foreground">
                Contract {index + 1}
              </legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Brand or website" className="sm:col-span-2">
                  {(props) => (
                    <EntityCombobox
                      {...props}
                      options={brandOptions}
                      value={row.brand}
                      onChange={(brand) => updateContract(row.key, { brand })}
                      entityLabel="brand"
                      placeholder="Aspirex, South London College, Selector…"
                    />
                  )}
                </Field>

                <Field label="Contract status">
                  {(props) => (
                    <select
                      {...props}
                      value={row.contractStatus}
                      onChange={(event) =>
                        updateContract(row.key, { contractStatus: event.target.value as never })
                      }
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="PENDING">Sent, awaiting signature</option>
                      <option value="SIGNED">Signed</option>
                      <option value="DRAFT">Draft</option>
                      <option value="EXPIRED">Expired</option>
                    </select>
                  )}
                </Field>

                <Field label="Expires on" hint="You will be warned 30 days before.">
                  {(props) => (
                    <Input
                      {...props}
                      type="date"
                      value={row.contractExpiresAt}
                      onChange={(event) =>
                        updateContract(row.key, { contractExpiresAt: event.target.value })
                      }
                    />
                  )}
                </Field>

                <Field
                  label="Rate for this brand"
                  hint={
                    defaultRate
                      ? `Leave blank to use the default of ${formatMoney(parseMoneyToMinor(defaultRate, currency), currency)}.`
                      : 'Leave blank to use their default rate.'
                  }
                >
                  {(props) => (
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        £
                      </span>
                      <Input
                        {...props}
                        value={row.rate}
                        onChange={(event) => updateContract(row.key, { rate: event.target.value })}
                        inputMode="decimal"
                        placeholder={defaultRate || '250.00'}
                        className="tabular pl-7"
                      />
                    </div>
                  )}
                </Field>

                <Field label="Per">
                  {(props) => (
                    <select
                      {...props}
                      value={row.rateUnit}
                      onChange={(event) =>
                        updateContract(row.key, { rateUnit: event.target.value as RateUnit })
                      }
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Same as default</option>
                      {RATE_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {RATE_UNIT_LABEL[unit]}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>

              {contracts.length > 1 ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setContracts((rows) => rows.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 aria-hidden />
                    Remove
                  </Button>
                </div>
              ) : null}
            </fieldset>
          ))}
        </CardContent>
      </Card>

      {/* --- 4. capacity --------------------------------------------------- */}
      <Card className="mb-4">
        <CardHeader>
          <div>
            <CardTitle>How much work they want</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Used by the workload screen to tell you whether they are getting a fair share.
            </p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Target videos per month"
            hint="What they have told you they can take on."
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder="8"
                className="tabular"
              />
            )}
          </Field>

          <Field
            label="Share of work"
            hint="1.0 is a normal full share. Use 0.5 for someone part time, 2.0 for someone taking double."
          >
            {(props) => (
              <div className="flex items-center gap-3">
                <input
                  {...props}
                  type="range"
                  min={0.25}
                  max={2}
                  step={0.25}
                  value={capacityWeight}
                  onChange={(event) => setCapacityWeight(event.target.value)}
                  className="flex-1 accent-[hsl(var(--primary))]"
                />
                <Tooltip content="A presenter on 0.5 who receives half as much work as a colleague on 1.0 is counted as perfectly balanced, not under-used.">
                  <Badge tone="primary" className="tabular cursor-help">
                    {Number(capacityWeight).toFixed(2)}×
                  </Badge>
                </Tooltip>
              </div>
            )}
          </Field>

          <Field
            label="Internal notes"
            hint="Never visible to the presenter."
            className="sm:col-span-2"
          >
            {(props) => (
              <Textarea
                {...props}
                value={internalNotes}
                onChange={(event) => setInternalNotes(event.target.value)}
                rows={2}
                placeholder="Prefers morning shoots. Invoices via their limited company."
              />
            )}
          </Field>
        </CardContent>
      </Card>

      {/* --- save bar ------------------------------------------------------ */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur lg:pl-64">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {contracts.filter((c) => c.brand).length} contract
            {contracts.filter((c) => c.brand).length === 1 ? '' : 's'} · saved as{' '}
            <span className="font-medium">Onboarding</span> until you mark them active
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={createPresenter.isPending}>
              Save presenter
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
