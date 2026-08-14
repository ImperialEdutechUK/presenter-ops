'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    data: me,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['internal-access-check'],
    queryFn: () =>
      api.get<{
        id: string;
        email: string;
        name: string;
        role: string;
      }>('/auth/me'),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  React.useEffect(() => {
    if (me?.role === 'PRESENTER') {
      window.location.replace('/portal');
      return;
    }

    if (isError) {
      window.location.replace('/login');
    }
  }, [me?.role, isError]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  if (isError) {
    return null;
  }

  if (me?.role === 'PRESENTER') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Redirecting to your portal…
      </div>
    );
  }

  if (!me) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
