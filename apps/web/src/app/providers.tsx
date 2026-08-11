'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';

import { TooltipProvider } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              // Retrying a 401/403/404 achieves nothing except delay.
              if (error instanceof ApiRequestError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster
            position="bottom-right"
            closeButton
            richColors
            // 6 seconds: long enough to read and reach the undo, short enough
            // not to stack up during bulk actions.
            duration={6000}
          />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
