'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  PRESENTER_STATUSES,
  PRESENTER_STATUS_LABEL,
  RATE_UNITS,
  RATE_UNIT_LABEL,
  formatMoney,
  parseMoneyToMinor,
  type PresenterStatus,
  type RateUnit,
} from '@presenter-ops/shared';

import { usePresenter, useUpdatePresenter } from '@/lib/queries';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
} from '@/components/ui';
import {
  EntityMultiCombobox,
  type NameOrIdValue,
} from '@/components/entity-combobox';

export default function EditPresenterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: presenter, isLoading } = usePresenter(id);
  const updatePresenter = useUpdatePresenter(id);

  const initialisedFor = React.useRef<string | null>(null);

  const [fullName, setFullName] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [timezone, setTimezone] = React.useState('Europe/London');
  const [status, setStatus] = React.useState<PresenterStatus>('ONBOARDING');

  const [defaultRate, setDefaultRate] = React.useState('');
  const [defaultRateUnit, setDefaultRateUnit] =
    React.useState<RateUnit>('PER_VIDEO');
  const [currency, setCurrency] = React.useState('GBP');

  const [target, setTarget] = React.useState('');
  const [capacityWeight, setCapacityWeight] = React.useState('1');
  const [supplierRef, setSupplierRef] = React.useState('');
  const [internalNotes, setInternalNotes] = React.useState('');
  const [tags, setTags] = React.useState<NameOrIdValue[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!presenter || initialisedFor.current === presenter.id) return;

    initialisedFor.current = presenter.id;

    setFullName(presenter.fullName ?? '');
    setDisplayName(presenter.displayName ?? '');
    setEmail(presenter.email ?? '');
    setPhone(presenter.phone ?? '');
    setLocation(presenter.location ?? '');
    setBio(presenter.bio ?? '');
    setTimezone(presenter.timezone ?? 'Europe/London');
    setStatus(presenter.status);

    setDefaultRate(
      presenter.defaultRateMinor === null
        ? ''
        : (presenter.defaultRateMinor / 100).toFixed(2),
    );
    setDefaultRateUnit(presenter.defaultRateUnit);
    setCurrency(presenter.defaultCurrency || 'GBP');

    setTarget(
      presenter.targetDeliverablesPerMonth === null
        ? ''
        : String(presenter.targetDeliverablesPerMonth),
    );
    setCapacityWeight(String(presenter.capacityWeight ?? 1));
    setSupplierRef(presenter.supplierRef ?? '');
    setInternalNotes(presenter.internalNotes ?? '');

    setTags(
      presenter.tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
      })),
    );
  }, [presenter]);

  const tagOptions = React.useMemo(
    () =>
      (presenter?.tags ?? []).map((tag) => ({
        id: tag.id,
        name: tag.name,
      })),
    [presenter?.tags],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const nextErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      nextErrors.fullName = 'A name is required.';
    }

    if (!email.trim()) {
      nextErrors.email = 'An email address is required.';
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }

    const normalisedCurrency = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalisedCurrency)) {
      nextErrors.currency = 'Use a 3-letter currency code, for example GBP.';
    }

    const capacity = Number(capacityWeight);
    if (
      !capacityWeight.trim() ||
      !Number.isFinite(capacity) ||
      capacity < 0.1 ||
      capacity > 5
    ) {
      nextErrors.capacityWeight = 'Enter a value from 0.1 to 5.';
    }

    if (target.trim()) {
      const targetNumber = Number(target);
      if (
        !Number.isInteger(targetNumber) ||
        targetNumber < 0 ||
        targetNumber > 500
      ) {
        nextErrors.target =
          'Enter a whole number from 0 to 500, or leave it blank.';
      }
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    await updatePresenter.mutateAsync({
      fullName: fullName.trim(),
      displayName: (displayName.trim() || fullName.trim()),
      email: email.trim(),
      phone: phone.trim(),
      location: location.trim(),
      bio,
      timezone: timezone.trim() || 'Europe/London',
      status,

      defaultRate: defaultRate.trim() || null,
      defaultRateUnit,
      defaultCurrency: normalisedCurrency,

      targetDeliverablesPerMonth: target.trim() ? Number(target) : null,
      capacityWeight: capacity,

      supplierRef: supplierRef.trim(),
      internalNotes,

      tags: tags.map((tag) =>
        'id' in tag ? { id: tag.id } : { name: tag.name.trim() },
      ),
    });

    router.push(`/presenters/${id}`);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!presenter) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Presenter not found"
          breadcrumb={
            <Link href="/presenters" className="hover:underline">
              Presenters
            </Link>
          }
        />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              This presenter could not be loaded.
            </p>
            <Button className="mt-4" asChild>
              <Link href="/presenters">Back to presenters</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl pb-24">
      <PageHeader
        title={`Edit ${presenter.displayName}`}
        description="Update the presenter's profile, status, rate and internal planning details."
        breadcrumb={
          <Link href={`/presenters/${id}`} className="hover:underline">
            {presenter.displayName}
          </Link>
        }
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Who they are</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar
              name={displayName || fullName || presenter.displayName}
              src={presenter.photoUrl}
              size="xl"
            />
            <div>
              <p className="text-sm font-medium">
                {displayName || fullName || presenter.displayName}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The existing profile photo is kept unchanged.
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
                  autoComplete="name"
                />
              )}
            </Field>

            <Field
              label="Known as"
              hint="Leave blank to use their full name."
            >
              {(props) => (
                <Input
                  {...props}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={fullName || 'Display name'}
                />
              )}
            </Field>

            <Field label="Email" required error={errors.email}>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
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
                  autoComplete="tel"
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

            <Field label="Status">
              {(props) => (
                <select
                  {...props}
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as PresenterStatus)
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {PRESENTER_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {PRESENTER_STATUS_LABEL[value]}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Timezone">
              {(props) => (
                <Input
                  {...props}
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  placeholder="Europe/London"
                />
              )}
            </Field>

            <Field
              label="Skills and attributes"
              hint="Add or remove skills. New ones are created as you type."
            >
              {() => (
                <EntityMultiCombobox
                  options={tagOptions}
                  values={tags}
                  onChange={setTags}
                  entityLabel="tag"
                  placeholder="on-camera, finance, owns studio..."
                />
              )}
            </Field>
          </div>

          <Field
            label="Short bio"
            hint="What they are good at. Shown to producers when choosing someone."
          >
            {(props) => (
              <Textarea
                {...props}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={4}
              />
            )}
          </Field>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <div>
            <CardTitle>Default rate</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The fallback rate used when a brand-specific contract does not
              override it.
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Amount">
              {(props) => (
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {currency.trim().toUpperCase() === 'GBP' ? '£' : ''}
                  </span>
                  <Input
                    {...props}
                    value={defaultRate}
                    onChange={(event) => setDefaultRate(event.target.value)}
                    inputMode="decimal"
                    placeholder="250.00"
                    className={
                      currency.trim().toUpperCase() === 'GBP'
                        ? 'tabular pl-7'
                        : 'tabular'
                    }
                  />
                </div>
              )}
            </Field>

            <Field label="Per">
              {(props) => (
                <select
                  {...props}
                  value={defaultRateUnit}
                  onChange={(event) =>
                    setDefaultRateUnit(event.target.value as RateUnit)
                  }
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

            <Field label="Currency" error={errors.currency}>
              {(props) => (
                <Input
                  {...props}
                  value={currency}
                  onChange={(event) =>
                    setCurrency(event.target.value.toUpperCase())
                  }
                  maxLength={3}
                  placeholder="GBP"
                />
              )}
            </Field>
          </div>

          {defaultRate ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Current entry:{' '}
              <span className="font-medium text-foreground">
                {formatMoney(
                  parseMoneyToMinor(
                    defaultRate,
                    currency.trim().toUpperCase() || 'GBP',
                  ),
                  currency.trim().toUpperCase() || 'GBP',
                )}
              </span>{' '}
              {RATE_UNIT_LABEL[defaultRateUnit]}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <div>
            <CardTitle>Planning and internal details</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              These fields help producers plan workload and manage supplier
              information.
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Target deliverables per month"
              error={errors.target}
              hint="Leave blank if there is no fixed target."
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={0}
                  max={500}
                  step={1}
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                />
              )}
            </Field>

            <Field
              label="Capacity weight"
              error={errors.capacityWeight}
              hint="1 is normal capacity. Allowed range: 0.1 to 5."
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={capacityWeight}
                  onChange={(event) => setCapacityWeight(event.target.value)}
                />
              )}
            </Field>

            <Field label="Supplier reference">
              {(props) => (
                <Input
                  {...props}
                  value={supplierRef}
                  onChange={(event) => setSupplierRef(event.target.value)}
                  placeholder="Optional supplier or finance reference"
                />
              )}
            </Field>
          </div>

          <Field
            label="Internal notes"
            hint="For staff only. Presenters do not see these notes."
          >
            {(props) => (
              <Textarea
                {...props}
                value={internalNotes}
                onChange={(event) => setInternalNotes(event.target.value)}
                rows={5}
              />
            )}
          </Field>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            Existing brand contracts are left unchanged when this profile is
            saved.
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-4 backdrop-blur">
        <Button type="button" variant="outline" asChild>
          <Link href={`/presenters/${id}`}>Cancel</Link>
        </Button>

        <Button type="submit" disabled={updatePresenter.isPending}>
          {updatePresenter.isPending ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
