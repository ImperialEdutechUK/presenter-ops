'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { useTheme } from 'next-themes';
import {
  Bell,
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Scale,
  Search,
  Settings,
  Sun,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useMe } from '@/lib/queries';
import { Avatar, Badge, Button, Tooltip } from '@/components/ui';

/**
 * Application shell.
 *
 * Layout decisions worth stating, because they are the ones that make a tool
 * like this feel fast rather than merely complete:
 *
 *  - A persistent left rail, not a hamburger. Six destinations is few enough
 *    that hiding them behind a click only costs time.
 *  - ⌘K opens a command palette that reaches every screen and every action.
 *    Once someone uses this daily, the mouse is the slow path.
 *  - The primary action ("New assignment") is fixed in the top bar on every
 *    screen. Creating work is the thing this tool exists for; it should never
 *    be more than one click away.
 */

const NAVIGATION = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'g d' },
  { href: '/assignments', label: 'Work', icon: ClipboardList, shortcut: 'g w' },
  { href: '/presenters', label: 'Presenters', icon: Users, shortcut: 'g p' },
  { href: '/workload', label: 'Workload', icon: Scale, shortcut: 'g b' },
  { href: '/brands', label: 'Brands', icon: Building2, shortcut: 'g r' },
  { href: '/settings', label: 'Settings', icon: Settings, shortcut: 'g s' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  // ⌘K / Ctrl+K anywhere. Ignored while typing into a field so it does not
  // hijack a genuine keystroke.
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === '/' && !typing) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen">
      {/* --- sidebar ------------------------------------------------------- */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-60 shrink-0 border-r bg-background transition-transform lg:static lg:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            PO
          </div>
          <span className="text-sm font-semibold">PresenterOps</span>
        </div>

        <nav className="space-y-0.5 p-3" aria-label="Main">
          {NAVIGATION.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileNavOpen(false)}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute inset-x-0 bottom-0 border-t p-3">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <Search className="size-4" aria-hidden />
            <span className="flex-1 text-left">Search</span>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>
        </div>
      </aside>

      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* --- main ---------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>

          <div className="flex-1" />

          <Button asChild size="sm">
            <Link href="/assignments/new">
              <Plus aria-hidden />
              New assignment
            </Link>
          </Button>

          <NotificationBell />
          <ThemeToggle />

          {me ? (
            <div className="flex items-center gap-2 border-l pl-3">
              <Avatar name={me.name} src={me.avatarUrl} size="sm" />
              <div className="hidden text-xs leading-tight sm:block">
                <p className="font-medium">{me.name}</p>
                <p className="capitalize text-muted-foreground">{me.role.toLowerCase()}</p>
              </div>
              <Tooltip content="Sign out">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Sign out"
                  onClick={async () => {
                    await api.post('/auth/logout');
                    router.push('/login');
                  }}
                >
                  <LogOut />
                </Button>
              </Tooltip>
            </div>
          ) : null}
        </header>

        <main id="main" className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {mounted && resolvedTheme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(0);
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);

  const loadUnread = React.useCallback(async () => {
    try {
      const unreadItems = await api.get<NotificationItem[]>('/notifications', {
        unreadOnly: 'true',
      });
      setUnread(unreadItems.length);
    } catch {
      // A failed notification poll must never interrupt what the user is doing.
    }
  }, []);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);

    try {
      const allItems = await api.get<NotificationItem[]>('/notifications');
      setItems(allItems);
      setUnread(allItems.filter((item) => !item.readAt).length);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadUnread();

    const timer = setInterval(() => {
      void loadUnread();
    }, 60_000);

    return () => clearInterval(timer);
  }, [loadUnread]);

  React.useEffect(() => {
    if (open) {
      void loadAll();
    }
  }, [open, loadAll]);

  const markRead = async (ids?: string[]) => {
    await api.post('/notifications/read', ids ? { ids } : {});

    const now = new Date().toISOString();

    setItems((current) =>
      current.map((item) =>
        !ids || ids.includes(item.id)
          ? { ...item, readAt: item.readAt ?? now }
          : item,
      ),
    );

    if (!ids) {
      setUnread(0);
      return;
    }

    setUnread((current) => {
      const newlyRead = items.filter(
        (item) => ids.includes(item.id) && !item.readAt,
      ).length;
      return Math.max(0, current - newlyRead);
    });
  };

  const openNotification = async (item: NotificationItem) => {
    try {
      if (!item.readAt) {
        await markRead([item.id]);
      }
    } catch {
      // Navigation should still work even if marking as read fails.
    }

    setOpen(false);

    if (item.linkUrl) {
      router.push(item.linkUrl);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications, ${unread} unread`}
        >
          <Bell />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover shadow-lg"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-xs text-muted-foreground">
                {unread === 0 ? 'You are all caught up.' : `${unread} unread`}
              </p>
            </div>

            {unread > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void markRead()}
              >
                Mark all read
              </Button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Loading notifications...
              </p>
            ) : loadFailed ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-medium">Could not load notifications</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => void loadAll()}
                >
                  Try again
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell
                  className="mx-auto mb-2 size-5 text-muted-foreground"
                  aria-hidden
                />
                <p className="text-sm font-medium">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Assignment updates and reminders will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void openNotification(item)}
                      className={cn(
                        'w-full px-4 py-3 text-left transition-colors hover:bg-accent',
                        !item.readAt && 'bg-primary/5',
                      )}
                    >
                      <span className="flex items-start gap-3">
                        <span
                          className={cn(
                            'mt-1.5 size-2 shrink-0 rounded-full',
                            item.readAt
                              ? 'bg-muted-foreground/25'
                              : 'bg-primary',
                          )}
                          aria-hidden
                        />

                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">
                            {item.title}
                          </span>

                          {item.body ? (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {item.body}
                            </span>
                          ) : null}

                          <span className="mt-1.5 block text-[11px] text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<
    { type: 'presenter' | 'assignment'; id: string; label: string; sub: string }[]
  >([]);

  // Debounced so typing "amara" is one request, not five.
  React.useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const [presenters, assignments] = await Promise.all([
          api.get<{ data: any[] }>('/presenters', { q: query, pageSize: 5 }),
          api.get<{ data: any[] }>('/assignments', { q: query, pageSize: 5 }),
        ]);
        setResults([
          ...presenters.data.map((p) => ({
            type: 'presenter' as const,
            id: p.id,
            label: p.displayName,
            sub: p.brands.map((b: any) => b.name).join(', ') || 'No brands',
          })),
          ...assignments.data.map((a) => ({
            type: 'assignment' as const,
            id: a.id,
            label: `${a.reference} — ${a.title}`,
            sub: a.presenter?.displayName ?? 'Unassigned',
          })),
        ]);
      } catch {
        setResults([]);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const go = (href: string) => {
    onOpenChange(false);
    setQuery('');
    router.push(href);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-24 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 animate-slide-up overflow-hidden rounded-xl border bg-popover shadow-lg">
          <Dialog.Title className="sr-only">Search and commands</Dialog.Title>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2 border-b px-4">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Search presenters and work, or jump to a screen…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <Command.List className="max-h-80 overflow-y-auto p-2">
              {results.length > 0 ? (
                <Command.Group heading="Results" className="px-1 text-xs text-muted-foreground">
                  {results.map((result) => (
                    <Command.Item
                      key={`${result.type}-${result.id}`}
                      value={`${result.type}-${result.id}`}
                      onSelect={() =>
                        go(
                          result.type === 'presenter'
                            ? `/presenters/${result.id}`
                            : `/assignments/${result.id}`,
                        )
                      }
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-accent"
                    >
                      <span className="truncate">{result.label}</span>
                      <Badge tone="neutral">{result.sub}</Badge>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              <Command.Group heading="Go to" className="px-1 text-xs text-muted-foreground">
                {NAVIGATION.map((item) => (
                  <Command.Item
                    key={item.href}
                    value={`nav-${item.label}`}
                    onSelect={() => go(item.href)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-accent"
                  >
                    <item.icon className="size-4" aria-hidden />
                    {item.label}
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group heading="Create" className="px-1 text-xs text-muted-foreground">
                <Command.Item
                  value="create-assignment"
                  onSelect={() => go('/assignments/new')}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-accent"
                >
                  <Plus className="size-4" aria-hidden />
                  New assignment
                </Command.Item>
                <Command.Item
                  value="create-presenter"
                  onSelect={() => go('/presenters/new')}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-accent"
                >
                  <Plus className="size-4" aria-hidden />
                  New presenter profile
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
