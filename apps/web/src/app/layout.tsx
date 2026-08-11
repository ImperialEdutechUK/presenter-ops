import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { Providers } from './providers';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'PresenterOps',
    template: '%s · PresenterOps',
  },
  description: 'Freelance presenter profiles, work assignment, delivery tracking and performance.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning className={inter.variable}>
      <body>
        {/* First tab stop on every page. Keyboard users should not have to
            traverse the whole sidebar to reach the content. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
