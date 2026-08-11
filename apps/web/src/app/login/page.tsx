'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { api, ApiRequestError } from '@/lib/api';
import { Button, Card, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await api.post<{ role: string }>('/auth/login', { email, password });
      // Presenters land in their portal, everyone else in the internal app.
      const next = new URLSearchParams(window.location.search).get('next');
      router.push(next ?? (user.role === 'PRESENTER' ? '/portal' : '/'));
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Could not reach the server. Check your connection.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            PO
          </div>
          <div>
            <h1 className="text-base font-semibold">PresenterOps</h1>
            <p className="text-xs text-muted-foreground">Sign in to continue</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Email" required>
            {(props) => (
              <Input
                {...props}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>

          <Field label="Password" required error={error ?? undefined}>
            {(props) => (
              <Input
                {...props}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </Field>

          <Button type="submit" className="w-full" loading={loading}>
            Sign in
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Accounts are created by invitation. Ask an admin if you need access.
        </p>
      </Card>
    </main>
  );
}