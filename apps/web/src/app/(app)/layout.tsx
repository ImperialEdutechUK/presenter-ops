'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { useMe } from '@/lib/queries';

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: me, isLoading, isError } = useMe();

  React.useEffect(() => {
    if (me?.role === 'PRESENTER') {
      router.replace('/portal');
    }
  }, [me?.role, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading PresenterOps…
      </div>
    );
  }

  if (isError || !me || me.role === 'PRESENTER') {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
