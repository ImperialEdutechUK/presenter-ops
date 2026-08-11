'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Skeleton,
} from '@/components/ui';

/**
 * The thresholds that drive the dashboard warnings and the workload screen are
 * settings, not constants. Every organisation's idea of "under-allocated" is
 * different, and a hard-coded 0.8 would be quietly wrong for most of them.
 */
export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<any>('/settings'),
  });
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});

  if (isLoading || !settings) return <Skeleton className="h-96" />;

  const value = (key: string) => (draft[key] ?? settings[key]) as string | number;

  const save = async () => {
    await api.patch('/settings', draft);
    setDraft({});
    queryClient.invalidateQueries({ queryKey: ['settings'] });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Thresholds, reminders and integrations." />

      <Card className="mb-5">
        <CardHeader>
          <div>
            <CardTitle>Workload thresholds</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              A balance index of 1.00 means a presenter received exactly the share their capacity
              weight implies.
            </p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Under-allocated below"
            hint="Default 0.80 — they got less than 80% of their fair share."
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                step="0.05"
                min="0"
                max="1"
                className="tabular"
                value={value('workloadUnderThreshold')}
                onChange={(event) =>
                  setDraft({ ...draft, workloadUnderThreshold: Number(event.target.value) })
                }
              />
            )}
          </Field>
          <Field label="Over-allocated above" hint="Default 1.25.">
            {(props) => (
              <Input
                {...props}
                type="number"
                step="0.05"
                min="1"
                className="tabular"
                value={value('workloadOverThreshold')}
                onChange={(event) =>
                  setDraft({ ...draft, workloadOverThreshold: Number(event.target.value) })
                }
              />
            )}
          </Field>
          <Field
            label="Flag as going cold after"
            hint="Days without an assignment before a presenter appears on the dashboard."
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                className="tabular"
                value={value('goingColdAfterDays')}
                onChange={(event) =>
                  setDraft({ ...draft, goingColdAfterDays: Number(event.target.value) })
                }
              />
            )}
          </Field>
          <Field label="Warn about contracts" hint="Days before expiry.">
            {(props) => (
              <Input
                {...props}
                type="number"
                className="tabular"
                value={value('contractExpiryWarningDays')}
                onChange={(event) =>
                  setDraft({ ...draft, contractExpiryWarningDays: Number(event.target.value) })
                }
              />
            )}
          </Field>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
        </CardHeader>
        <CardContent>
          <Field
            label="Remind presenters this many hours before the due date"
            hint="Sent once per assignment, plus once more if it goes overdue."
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                className="tabular max-w-32"
                value={value('dueSoonHours')}
                onChange={(event) => setDraft({ ...draft, dueSoonHours: Number(event.target.value) })}
              />
            )}
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={Object.keys(draft).length === 0}>
          Save settings
        </Button>
      </div>
    </div>
  );
}
