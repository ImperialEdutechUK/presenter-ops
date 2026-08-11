/**
 * Money handling.
 *
 * RULE: every monetary amount in this system is an integer number of MINOR
 * UNITS (pence for GBP, cents for EUR/USD) plus an ISO-4217 currency code.
 * Nothing is ever stored or transported as a float. `12.30` cannot be
 * represented exactly in binary floating point; `1230` can.
 *
 * Conversion to a display string happens once, at the edge, in `formatMoney`.
 */

export interface Money {
  amountMinor: number;
  currency: string;
}

/** Currencies with no minor unit (JPY etc.) would need adding here. */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  GBP: 2,
  EUR: 2,
  USD: 2,
  AUD: 2,
  CAD: 2,
};

export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2;
}

/** "250" or "250.50" (as typed by a human) → 25000 pence. */
export function parseMoneyToMinor(input: string | number, currency = 'GBP'): number {
  const exponent = minorUnitExponent(currency);
  const raw = typeof input === 'number' ? input.toString() : input.trim().replace(/[^0-9.\-]/g, '');
  if (raw === '' || raw === '-') return 0;

  const negative = raw.startsWith('-');
  const [whole, fraction = ''] = raw.replace('-', '').split('.');
  const paddedFraction = (fraction + '0'.repeat(exponent)).slice(0, exponent);
  const value = Number(whole || '0') * 10 ** exponent + Number(paddedFraction || '0');
  return negative ? -value : value;
}

/** 25000 pence → "£250.00" */
export function formatMoney(
  amountMinor: number | null | undefined,
  currency = 'GBP',
  opts: { locale?: string; compact?: boolean } = {},
): string {
  if (amountMinor === null || amountMinor === undefined) return '—';
  const { locale = 'en-GB', compact = false } = opts;
  const exponent = minorUnitExponent(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : exponent,
    minimumFractionDigits: compact ? 0 : exponent,
  }).format(amountMinor / 10 ** exponent);
}

/**
 * Total fee for a line of work.
 *
 *   PER_PROJECT  → the rate, ignoring quantity (it is a flat fee)
 *   everything else → rate × quantity, rounded half-up to the nearest minor unit
 *
 * Worked example: rate £250.00 per video (feeMinor = 25000), quantity 3
 *   25000 × 3 = 75000 pence = £750.00
 *
 * Worked example with a fractional quantity: £90.00/hour, 2.5 hours
 *   9000 × 2.5 = 22500 pence = £225.00
 */
export function computeTotalFeeMinor(
  feeMinor: number | null | undefined,
  feeQuantity: number | null | undefined,
  feeUnit: string | null | undefined,
): number | null {
  if (feeMinor === null || feeMinor === undefined) return null;
  if (feeUnit === 'PER_PROJECT') return Math.round(feeMinor);
  const quantity = feeQuantity ?? 1;
  return Math.round(feeMinor * quantity);
}

/** Sums amounts that are all in the same currency. Throws if they are not. */
export function sumMoney(items: Money[]): Money {
  if (items.length === 0) return { amountMinor: 0, currency: 'GBP' };
  const currency = items[0].currency;
  for (const item of items) {
    if (item.currency !== currency) {
      throw new Error(
        `sumMoney received mixed currencies (${currency} and ${item.currency}). ` +
          'Convert to a single currency before summing.',
      );
    }
  }
  return { amountMinor: items.reduce((acc, i) => acc + i.amountMinor, 0), currency };
}
