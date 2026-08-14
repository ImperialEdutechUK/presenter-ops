'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { api, ApiRequestError } from '@/lib/api';
import { Button, Card, Field, Input } from '@/components/ui';

export default function AcceptInvitePage() {
  const router = useRouter();

  const [token, setToken] = React.useState('');
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');

  const [loading, setLoading] = React.useState(false);
  const [checkingLink, setCheckingLink] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('token') ?? '';

    setToken(inviteToken);
    setCheckingLink(false);

    if (!inviteToken) {
      setError(
        'This invitation link is incomplete. Ask your PresenterOps administrator for a new invitation.',
      );
    }
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    setError(null);

    if (!token) {
      setError('This invitation link is not valid.');
      return;
    }

    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }

    if (password.length < 10) {
      setError('Your password must contain at least 10 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/accept-invite', {
        token,
        password,
        name: name.trim(),
      });

      const me = await api.get<{ role: string }>('/auth/me');

      if (me.role === 'PRESENTER') {
        router.replace('/portal');
      } else {
        router.replace('/');
      }
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Could not activate your account. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingLink) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          Checking invitation…
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              PO
            </div>

            <div>
              <h1 className="text-base font-semibold">PresenterOps</h1>
              <p className="text-xs text-muted-foreground">
                Activate your account
              </p>
            </div>
          </div>

          <h2 className="text-xl font-semibold">
            Create your PresenterOps account
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Enter your details and choose a password to accept your invitation.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Your name" required>
            {(props) => (
              <Input
                {...props}
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!token}
              />
            )}
          </Field>

          <Field
            label="Password"
            hint="Use at least 10 characters."
            required
          >
            {(props) => (
              <Input
                {...props}
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={!token}
              />
            )}
          </Field>

          <Field label="Confirm password" required>
            {(props) => (
              <Input
                {...props}
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={!token}
              />
            )}
          </Field>

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            loading={loading}
            disabled={!token}
          >
            Activate account
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Already activated your account?{' '}
          <a href="/login" className="font-medium hover:underline">
            Sign in
          </a>
        </p>
      </Card>
    </main>
  );
}
