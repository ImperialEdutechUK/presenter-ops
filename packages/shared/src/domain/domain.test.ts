import { describe, expect, it } from 'vitest';

import { computeTotalFeeMinor, formatMoney, parseMoneyToMinor, sumMoney } from './money';
import { computeWorkload, giniCoefficient, scorePresenters } from './workload';
import { computeTiming, derivePerformance, formatDuration, formatLateness } from './metrics';
import { allowedTransitions, canTransition, missingRequirements } from './assignment-state';

describe('money', () => {
  it('parses whole and decimal amounts to minor units', () => {
    expect(parseMoneyToMinor('250')).toBe(25000);
    expect(parseMoneyToMinor('250.50')).toBe(25050);
    expect(parseMoneyToMinor('250.5')).toBe(25050);
    expect(parseMoneyToMinor('0.07')).toBe(7);
    expect(parseMoneyToMinor('£1,250.00')).toBe(125000);
    expect(parseMoneyToMinor('')).toBe(0);
  });

  it('does not lose a penny on values floats get wrong', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; integers make it a non-issue.
    expect(parseMoneyToMinor('0.1') + parseMoneyToMinor('0.2')).toBe(parseMoneyToMinor('0.3'));
  });

  it('formats to the viewer currency', () => {
    expect(formatMoney(25000, 'GBP')).toBe('£250.00');
    expect(formatMoney(null)).toBe('—');
  });

  it('multiplies rate by quantity, and ignores quantity for flat projects', () => {
    expect(computeTotalFeeMinor(25000, 3, 'PER_VIDEO')).toBe(75000);
    expect(computeTotalFeeMinor(9000, 2.5, 'PER_HOUR')).toBe(22500);
    expect(computeTotalFeeMinor(150000, 4, 'PER_PROJECT')).toBe(150000);
    expect(computeTotalFeeMinor(null, 3, 'PER_VIDEO')).toBeNull();
  });

  it('refuses to sum mixed currencies rather than producing a wrong total', () => {
    expect(() =>
      sumMoney([
        { amountMinor: 100, currency: 'GBP' },
        { amountMinor: 100, currency: 'EUR' },
      ]),
    ).toThrow(/mixed currencies/);
  });
});

describe('workload balance', () => {
  const base = { periodStart: '2026-07-01T00:00:00Z', periodEnd: '2026-07-31T00:00:00Z' };

  const presenter = (
    id: string,
    deliverables: number,
    weight = 1,
  ) => ({
    presenterId: id,
    displayName: id,
    capacityWeight: weight,
    deliverablesInPeriod: deliverables,
    assignmentsInPeriod: deliverables,
    activeAssignments: 0,
    earnedMinor: deliverables * 25000,
    lastAssignedAt: null,
  });

  it('gives everyone a balance index of 1.0 when work is split evenly', () => {
    const result = computeWorkload([presenter('a', 5), presenter('b', 5)], base);
    expect(result.rows.every((r) => r.balanceIndex === 1)).toBe(true);
    expect(result.rows.every((r) => r.status === 'BALANCED')).toBe(true);
  });

  it('flags the under- and over-allocated presenter', () => {
    // 9 of 10 deliverables to one person: expected 0.5 each, actual 0.9 / 0.1
    const result = computeWorkload([presenter('busy', 9), presenter('idle', 1)], base);
    const busy = result.rows.find((r) => r.presenterId === 'busy')!;
    const idle = result.rows.find((r) => r.presenterId === 'idle')!;

    expect(busy.balanceIndex).toBeCloseTo(1.8, 5);
    expect(busy.status).toBe('OVER');
    expect(idle.balanceIndex).toBeCloseTo(0.2, 5);
    expect(idle.status).toBe('UNDER');
    expect(result.underAllocated).toBe(1);
    expect(result.overAllocated).toBe(1);
  });

  it('treats a half-weight presenter fairly rather than as under-loaded', () => {
    // weights 1.0 and 0.5 → expected shares 2/3 and 1/3.
    const result = computeWorkload([presenter('full', 6), presenter('part', 3, 0.5)], base);
    expect(result.rows.every((r) => r.balanceIndex === 1)).toBe(true);
  });

  it('says how many deliverables would bring someone to parity', () => {
    const result = computeWorkload([presenter('busy', 9), presenter('idle', 1)], base);
    const idle = result.rows.find((r) => r.presenterId === 'idle')!;
    // Solving (1 + x)/(10 + x) = 0.5  →  x = 8
    expect(idle.deliverablesToParity).toBe(8);
  });

  it('returns NO_DATA rather than dividing by zero on an empty period', () => {
    const result = computeWorkload([presenter('a', 0), presenter('b', 0)], base);
    expect(result.rows.every((r) => r.balanceIndex === null)).toBe(true);
    expect(result.rows.every((r) => r.status === 'NO_DATA')).toBe(true);
  });

  it('computes a Gini coefficient of 0 for a perfectly even split', () => {
    expect(giniCoefficient([5, 5, 5, 5])).toBe(0);
  });

  it('computes a Gini coefficient approaching 1 when one person has everything', () => {
    expect(giniCoefficient([0, 0, 0, 20])).toBeGreaterThan(0.7);
  });

  it('marks small pools as indicative only', () => {
    expect(computeWorkload([presenter('a', 1), presenter('b', 1)], base).giniIsIndicativeOnly).toBe(
      true,
    );
  });
});

describe('presenter suggestion scoring', () => {
  it('ranks the under-allocated, long-idle presenter above the busy one', () => {
    const [first] = scorePresenters([
      {
        presenterId: 'busy',
        displayName: 'Busy',
        balanceIndex: 1.9,
        daysSinceLastAssigned: 2,
        avgRating: 5,
        onTimeDeliveryPct: 100,
        activeAssignments: 4,
      },
      {
        presenterId: 'idle',
        displayName: 'Idle',
        balanceIndex: 0.2,
        daysSinceLastAssigned: 55,
        avgRating: 4.2,
        onTimeDeliveryPct: 90,
        activeAssignments: 0,
      },
    ]);
    expect(first.presenterId).toBe('idle');
  });

  it('does not bury a brand-new presenter with no history', () => {
    const results = scorePresenters([
      {
        presenterId: 'new',
        displayName: 'New',
        balanceIndex: null,
        daysSinceLastAssigned: null,
        avgRating: null,
        onTimeDeliveryPct: null,
        activeAssignments: 0,
      },
    ]);
    // 20 (allocation, bi treated as 1) + 20 (recency) + 10 + 10 = 60
    expect(results[0].score).toBe(60);
    expect(results[0].breakdown).toHaveLength(4);
  });

  it('always explains every point it awarded', () => {
    const [result] = scorePresenters([
      {
        presenterId: 'x',
        displayName: 'X',
        balanceIndex: 0.5,
        daysSinceLastAssigned: 30,
        avgRating: 4,
        onTimeDeliveryPct: 80,
        activeAssignments: 1,
      },
    ]);
    const summed = result.breakdown.reduce((acc, b) => acc + b.points, 0);
    expect(Number(summed.toFixed(1))).toBe(result.score);
    expect(result.breakdown.every((b) => b.reason.length > 0)).toBe(true);
  });
});

describe('timing metrics', () => {
  it('separates response time from total turnaround', () => {
    const timing = computeTiming({
      assignedAt: '2026-08-01T09:00:00Z',
      acceptedAt: '2026-08-01T14:00:00Z',
      submittedAt: '2026-08-05T09:00:00Z',
      dueAt: '2026-08-06T09:00:00Z',
    });
    expect(timing.responseMinutes).toBe(300);
    expect(timing.turnaroundMinutes).toBe(5760);
    expect(timing.latenessMinutes).toBe(-1440);
    expect(timing.onTime).toBe(true);
  });

  it('returns nulls instead of guesses when dates are missing', () => {
    const timing = computeTiming({ assignedAt: '2026-08-01T09:00:00Z' });
    expect(timing.turnaroundMinutes).toBeNull();
    expect(timing.onTime).toBeNull();
  });

  it('formats durations at a readable scale', () => {
    expect(formatDuration(47)).toBe('47 min');
    expect(formatDuration(200)).toBe('3h 20m');
    expect(formatDuration(6120)).toBe('4d 6h');
    expect(formatDuration(null)).toBe('—');
  });

  it('describes lateness in plain words', () => {
    expect(formatLateness(-2880).label).toBe('2d early');
    expect(formatLateness(-30).label).toBe('On time');
    expect(formatLateness(2880).label).toBe('2d late');
    expect(formatLateness(2880).tone).toBe('negative');
  });
});

describe('performance derivations', () => {
  it('computes engagement, CTR and ROAS from raw counts', () => {
    const derived = derivePerformance(
      {
        views: 10_000,
        impressions: 100_000,
        likes: 300,
        comments: 50,
        shares: 150,
        clicks: 2_000,
        conversions: 100,
        spendMinor: 50_000,
        revenueMinor: 250_000,
      },
      75_000,
    );
    expect(derived.engagementRatePct).toBe(5);
    expect(derived.ctrPct).toBe(2);
    expect(derived.conversionRatePct).toBe(5);
    expect(derived.costPerConversionMinor).toBe(500);
    expect(derived.roas).toBe(5);
    // £750 fee ÷ 10,000 views × 1,000 = £75.00 per thousand views = 7500 pence
    expect(derived.feeCostPerThousandViewsMinor).toBe(7500);
  });

  it('returns null rather than 0 when the denominator is missing', () => {
    const derived = derivePerformance({ likes: 10 });
    expect(derived.engagementRatePct).toBeNull();
    expect(derived.roas).toBeNull();
  });
});

describe('assignment state machine', () => {
  it('lets a producer send a draft but not approve it', () => {
    expect(canTransition('DRAFT', 'ASSIGNED', 'PRODUCER')).toBe(true);
    expect(canTransition('DRAFT', 'APPROVED', 'PRODUCER')).toBe(false);
  });

  it('lets a presenter accept or decline, but not cancel', () => {
    expect(canTransition('ASSIGNED', 'ACCEPTED', 'PRESENTER')).toBe(true);
    expect(canTransition('ASSIGNED', 'DECLINED', 'PRESENTER')).toBe(true);
    expect(canTransition('ASSIGNED', 'CANCELLED', 'PRESENTER')).toBe(false);
  });

  it('gives marketing review rights but no editing rights', () => {
    expect(canTransition('SUBMITTED', 'APPROVED', 'MARKETING')).toBe(true);
    expect(canTransition('DRAFT', 'ASSIGNED', 'MARKETING')).toBe(false);
  });

  it('offers nothing once an assignment is completed', () => {
    expect(allowedTransitions('COMPLETED', 'ADMIN')).toHaveLength(0);
  });

  it('lists what is missing before a send is allowed', () => {
    expect(missingRequirements('DRAFT', 'ASSIGNED', { presenterId: null, dueAt: null })).toEqual([
      'presenterId',
      'dueAt',
      'feeMinor',
    ]);
    expect(
      missingRequirements('DRAFT', 'ASSIGNED', {
        presenterId: 'p1',
        dueAt: '2026-09-01',
        feeMinor: 25000,
      }),
    ).toEqual([]);
  });

  it('requires a delivery link before submission', () => {
    expect(missingRequirements('IN_PROGRESS', 'SUBMITTED', { deliveryUrl: null })).toEqual([
      'deliveryUrl',
    ]);
  });
});
