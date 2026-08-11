import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "Amara Okafor" → "AO". Used for avatar fallbacks. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Readable text colour for a brand chip, chosen from the chip's own background
 * using the WCAG relative-luminance formula. Guessing "dark colours get white
 * text" fails on mid-greens; this does not.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function readableTextOn(hex: string): '#000000' | '#FFFFFF' {
  const clean = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  // Contrast against white is (1.05)/(L+0.05); against black it is (L+0.05)/0.05.
  return luminance > 0.179 ? '#000000' : '#FFFFFF';
}

/** "2 hours ago", "in 3 days". Deliberately coarse — precision is in the tooltip. */
export function relativeTime(value: string | Date | null | undefined, now = new Date()): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];

  const formatter = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (abs >= ms) return formatter.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}
