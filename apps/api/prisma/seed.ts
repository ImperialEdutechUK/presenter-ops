/**
 * Development seed.
 *
 * Creates the four brands currently in use, a handful of presenters with
 * deliberately UNEVEN workloads (so the workload-balance screen has something
 * real to show), and assignments spread across every status.
 *
 * All people, ratings and performance figures below are invented for local
 * development. Nothing here is real data about anyone.
 *
 *   npm run db:seed
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import slugify from 'slugify';

const prisma = new PrismaClient();

const BRANDS = [
  { name: 'Aspirex', colorHex: '#2563EB', websiteUrl: 'https://aspirex.example' },
  { name: 'South London College', colorHex: '#16A34A', websiteUrl: 'https://slc.example' },
  { name: 'Imperial Audio Tech', colorHex: '#7C3AED', websiteUrl: 'https://iat.example' },
  { name: 'Selector', colorHex: '#EA580C', websiteUrl: 'https://selector.example' },
];

const WORK_TYPES = [
  { name: 'Talking head', defaultEstimatedHours: 3, defaultTurnaroundDays: 7 },
  { name: 'Voiceover', defaultEstimatedHours: 1.5, defaultTurnaroundDays: 4 },
  { name: 'Course module', defaultEstimatedHours: 8, defaultTurnaroundDays: 14 },
  { name: 'Social short', defaultEstimatedHours: 1, defaultTurnaroundDays: 3 },
  { name: 'Product demo', defaultEstimatedHours: 4, defaultTurnaroundDays: 10 },
  { name: 'Webinar', defaultEstimatedHours: 6, defaultTurnaroundDays: 21 },
];

const TAGS = [
  'on-camera',
  'voice only',
  'owns studio',
  'finance',
  'technology',
  'education',
  'RP accent',
  'autocue',
  'BSL',
];

const PRESENTERS = [
  {
    fullName: 'Amara Okafor',
    email: 'amara.okafor@example.com',
    location: 'London',
    defaultRate: 28000, // £280.00
    unit: 'PER_VIDEO' as const,
    weight: 1.0,
    target: 8,
    tags: ['on-camera', 'finance', 'autocue'],
    brands: ['Aspirex', 'Selector'],
    bio: 'Business and finance presenter. Ten years in broadcast, comfortable with autocue and complex numbers.',
  },
  {
    fullName: 'Daniel Whitfield',
    email: 'daniel.whitfield@example.com',
    location: 'Manchester',
    defaultRate: 22000,
    unit: 'PER_VIDEO' as const,
    weight: 1.0,
    target: 8,
    tags: ['on-camera', 'education', 'owns studio'],
    brands: ['South London College', 'Aspirex'],
    bio: 'Former lecturer. Specialises in longer-form course modules and explainers.',
  },
  {
    fullName: 'Priya Raghavan',
    email: 'priya.raghavan@example.com',
    location: 'Birmingham',
    defaultRate: 9000,
    unit: 'PER_HOUR' as const,
    weight: 0.5,
    target: 4,
    tags: ['voice only', 'technology'],
    brands: ['Imperial Audio Tech'],
    bio: 'Voiceover artist working part time. Technology and audio hardware background.',
  },
  {
    fullName: 'Tom Beresford',
    email: 'tom.beresford@example.com',
    location: 'Leeds',
    defaultRate: 35000,
    unit: 'PER_DAY' as const,
    weight: 1.0,
    target: 6,
    tags: ['on-camera', 'technology', 'owns studio'],
    brands: ['Imperial Audio Tech', 'Selector', 'Aspirex'],
    bio: 'Product demo specialist with a home studio. Fast turnaround on short-form.',
  },
  {
    fullName: 'Elena Marchetti',
    email: 'elena.marchetti@example.com',
    location: 'Brighton',
    defaultRate: 26000,
    unit: 'PER_VIDEO' as const,
    weight: 1.0,
    target: 8,
    tags: ['on-camera', 'RP accent', 'education'],
    brands: ['South London College'],
    bio: 'Education and lifestyle presenter.',
  },
  {
    fullName: 'Marcus Hale',
    email: 'marcus.hale@example.com',
    location: 'Glasgow',
    defaultRate: 24000,
    unit: 'PER_VIDEO' as const,
    weight: 1.0,
    target: 6,
    tags: ['on-camera', 'BSL'],
    brands: ['Aspirex', 'South London College'],
    bio: 'Accessible-content specialist. BSL fluent.',
  },
];

// Deliberately lopsided: Amara and Tom are getting a lot, Marcus and Elena are
// getting almost nothing. This is what the workload screen has to surface.
const ASSIGNMENT_PLAN: {
  presenter: string;
  brand: string;
  workType: string;
  count: number;
  status: string;
  daysAgo: number;
}[] = [
  { presenter: 'Amara Okafor', brand: 'Aspirex', workType: 'Talking head', count: 4, status: 'COMPLETED', daysAgo: 41 },
  { presenter: 'Amara Okafor', brand: 'Aspirex', workType: 'Talking head', count: 3, status: 'COMPLETED', daysAgo: 27 },
  { presenter: 'Amara Okafor', brand: 'Selector', workType: 'Social short', count: 5, status: 'COMPLETED', daysAgo: 18 },
  { presenter: 'Amara Okafor', brand: 'Aspirex', workType: 'Talking head', count: 2, status: 'IN_REVIEW', daysAgo: 6 },
  { presenter: 'Amara Okafor', brand: 'Aspirex', workType: 'Social short', count: 3, status: 'IN_PROGRESS', daysAgo: 3 },
  { presenter: 'Tom Beresford', brand: 'Imperial Audio Tech', workType: 'Product demo', count: 3, status: 'COMPLETED', daysAgo: 35 },
  { presenter: 'Tom Beresford', brand: 'Imperial Audio Tech', workType: 'Product demo', count: 4, status: 'COMPLETED', daysAgo: 20 },
  { presenter: 'Tom Beresford', brand: 'Selector', workType: 'Social short', count: 2, status: 'SUBMITTED', daysAgo: 4 },
  { presenter: 'Tom Beresford', brand: 'Imperial Audio Tech', workType: 'Product demo', count: 2, status: 'ACCEPTED', daysAgo: 2 },
  { presenter: 'Daniel Whitfield', brand: 'South London College', workType: 'Course module', count: 2, status: 'COMPLETED', daysAgo: 30 },
  { presenter: 'Daniel Whitfield', brand: 'South London College', workType: 'Course module', count: 2, status: 'REVISIONS_REQUESTED', daysAgo: 9 },
  { presenter: 'Daniel Whitfield', brand: 'Aspirex', workType: 'Talking head', count: 1, status: 'ASSIGNED', daysAgo: 1 },
  { presenter: 'Priya Raghavan', brand: 'Imperial Audio Tech', workType: 'Voiceover', count: 3, status: 'COMPLETED', daysAgo: 22 },
  { presenter: 'Priya Raghavan', brand: 'Imperial Audio Tech', workType: 'Voiceover', count: 2, status: 'COMPLETED', daysAgo: 11 },
  { presenter: 'Elena Marchetti', brand: 'South London College', workType: 'Talking head', count: 1, status: 'COMPLETED', daysAgo: 26 },
  { presenter: 'Marcus Hale', brand: 'Aspirex', workType: 'Talking head', count: 1, status: 'COMPLETED', daysAgo: 58 },
];

async function main() {
  console.log('Seeding…');

  // --- users --------------------------------------------------------------
  const passwordHash = await argon2.hash('ChangeMe!2026', { type: argon2.argon2id });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    create: { email: 'admin@example.com', name: 'Ops Admin', role: 'ADMIN', passwordHash },
    update: {},
  });
  const producer = await prisma.user.upsert({
    where: { email: 'producer@example.com' },
    create: { email: 'producer@example.com', name: 'Jo Producer', role: 'PRODUCER', passwordHash },
    update: {},
  });
  const marketer = await prisma.user.upsert({
    where: { email: 'marketing@example.com' },
    create: { email: 'marketing@example.com', name: 'Sam Marketing', role: 'MARKETING', passwordHash },
    update: {},
  });

  await prisma.appSetting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', organisationName: 'Imperial Learning' },
    update: {},
  });

  // --- taxonomy -----------------------------------------------------------
  const brands: Record<string, string> = {};
  for (const brand of BRANDS) {
    const record = await prisma.brand.upsert({
      where: { slug: slugify(brand.name, { lower: true, strict: true }) },
      create: { ...brand, slug: slugify(brand.name, { lower: true, strict: true }) },
      update: {},
    });
    brands[brand.name] = record.id;
  }

  const workTypes: Record<string, string> = {};
  for (const wt of WORK_TYPES) {
    const record = await prisma.workType.upsert({
      where: { slug: slugify(wt.name, { lower: true, strict: true }) },
      create: {
        name: wt.name,
        slug: slugify(wt.name, { lower: true, strict: true }),
        defaultEstimatedHours: new Prisma.Decimal(wt.defaultEstimatedHours),
        defaultTurnaroundDays: wt.defaultTurnaroundDays,
      },
      update: {},
    });
    workTypes[wt.name] = record.id;
  }

  const tags: Record<string, string> = {};
  for (const name of TAGS) {
    const record = await prisma.tag.upsert({
      where: { slug: slugify(name, { lower: true, strict: true }) },
      create: { name, slug: slugify(name, { lower: true, strict: true }) },
      update: {},
    });
    tags[name] = record.id;
  }

  // --- presenters ---------------------------------------------------------
  const presenterIds: Record<string, string> = {};
  for (const p of PRESENTERS) {
    const presenter = await prisma.presenter.upsert({
      where: { email: p.email },
      create: {
        fullName: p.fullName,
        displayName: p.fullName,
        email: p.email,
        location: p.location,
        bio: p.bio,
        status: 'ACTIVE',
        defaultRateMinor: p.defaultRate,
        defaultRateUnit: p.unit,
        defaultCurrency: 'GBP',
        capacityWeight: new Prisma.Decimal(p.weight),
        targetDeliverablesPerMonth: p.target,
        onboardedAt: new Date(Date.now() - 200 * 86_400_000),
        tags: { create: p.tags.map((t) => ({ tagId: tags[t] })) },
        contracts: {
          create: p.brands.map((b) => ({
            brandId: brands[b],
            contractStatus: 'SIGNED' as const,
            contractSignedAt: new Date(Date.now() - 180 * 86_400_000),
            contractExpiresAt: new Date(Date.now() + 120 * 86_400_000),
          })),
        },
      },
      update: {},
    });
    presenterIds[p.fullName] = presenter.id;
  }

  // One presenter without portal access and one paused, so the directory shows
  // more than a single happy state.
  await prisma.presenter.update({
    where: { email: 'marcus.hale@example.com' },
    data: { status: 'PAUSED' },
  });

  // A presenter login, so the portal can be demonstrated.
  const amaraId = presenterIds['Amara Okafor'];
  const amaraUser = await prisma.user.upsert({
    where: { email: 'amara.okafor@example.com' },
    create: {
      email: 'amara.okafor@example.com',
      name: 'Amara Okafor',
      role: 'PRESENTER',
      passwordHash,
    },
    update: {},
  });
  await prisma.presenter.update({ where: { id: amaraId }, data: { userId: amaraUser.id } });

  // --- assignments --------------------------------------------------------
  let created = 0;
  for (const plan of ASSIGNMENT_PLAN) {
    const brandId = brands[plan.brand];
    const presenterId = presenterIds[plan.presenter];
    const brandRecord = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } });

    const prefix = brandRecord.slug
      .split('-')
      .map((s) => s[0])
      .join('')
      .toUpperCase()
      .slice(0, 4)
      .padEnd(3, 'X');

    const counter = await prisma.brandCounter.upsert({
      where: { brandId },
      create: { brandId, prefix, next: 2 },
      update: { next: { increment: 1 } },
    });
    const reference = `${counter.prefix}-${String(counter.next - 1).padStart(4, '0')}`;

    const presenter = await prisma.presenter.findUniqueOrThrow({ where: { id: presenterId } });
    const feeMinor = presenter.defaultRateMinor!;
    const assignedAt = new Date(Date.now() - plan.daysAgo * 86_400_000);
    const dueAt = new Date(assignedAt.getTime() + 7 * 86_400_000);

    const terminal = ['COMPLETED', 'APPROVED'].includes(plan.status);
    const submitted = terminal || ['SUBMITTED', 'IN_REVIEW'].includes(plan.status);
    // Vary turnaround between 2 and 9 days deterministically off the plan index
    // so the reports have a spread without needing randomness.
    const turnaroundDays = 2 + ((created * 3) % 8);
    const submittedAt = submitted
      ? new Date(assignedAt.getTime() + turnaroundDays * 86_400_000)
      : null;

    const assignment = await prisma.assignment.create({
      data: {
        reference,
        title: `${plan.workType} — ${plan.brand} (${plan.count} deliverable${plan.count > 1 ? 's' : ''})`,
        description:
          'Read the attached script to camera. Neutral background, brand lower-third supplied separately.',
        brandId,
        presenterId,
        workTypeId: workTypes[plan.workType],
        createdById: producer.id,
        status: plan.status as any,
        priority: plan.daysAgo < 5 ? 'HIGH' : 'NORMAL',
        deliverableCount: plan.count,
        feeMinor,
        feeUnit: presenter.defaultRateUnit,
        feeQuantity: new Prisma.Decimal(plan.count),
        feeCurrency: 'GBP',
        totalFeeMinor: feeMinor * plan.count,
        estimatedHours: new Prisma.Decimal(plan.count * 2),
        assignedAt,
        dueAt,
        acceptedAt: plan.status === 'ASSIGNED' ? null : new Date(assignedAt.getTime() + 3_600_000 * 5),
        startedAt: plan.status === 'ASSIGNED' ? null : new Date(assignedAt.getTime() + 86_400_000),
        submittedAt,
        turnaroundMinutes: submittedAt
          ? Math.round((submittedAt.getTime() - assignedAt.getTime()) / 60_000)
          : null,
        latenessMinutes: submittedAt
          ? Math.round((submittedAt.getTime() - dueAt.getTime()) / 60_000)
          : null,
        responseMinutes: plan.status === 'ASSIGNED' ? null : 300,
        approvedAt: terminal ? new Date(submittedAt!.getTime() + 2 * 86_400_000) : null,
        completedAt:
          plan.status === 'COMPLETED' ? new Date(submittedAt!.getTime() + 3 * 86_400_000) : null,
        deliveryUrl: submitted
          ? 'https://example-my.sharepoint.com/:f:/g/personal/demo/EXAMPLE-FOLDER-LINK'
          : null,
        events: {
          create: [
            { type: 'ASSIGNMENT_CREATED', toStatus: 'DRAFT', actorId: producer.id },
            { type: 'STATUS_CHANGED', fromStatus: 'DRAFT', toStatus: 'ASSIGNED', actorId: producer.id },
          ],
        },
      },
    });
    created++;

    // Feedback + performance on the finished ones only.
    if (plan.status === 'COMPLETED') {
      const rating = 3 + (created % 3); // 3, 4 or 5
      await prisma.feedback.create({
        data: {
          assignmentId: assignment.id,
          presenterId,
          authorId: producer.id,
          overallRating: rating,
          deliveryRating: rating,
          scriptAccuracy: Math.min(5, rating + 1),
          professionalism: 5,
          timeliness: (assignment.latenessMinutes ?? 0) <= 0 ? 5 : 3,
          comment:
            rating >= 4
              ? 'Clean read, good energy, minimal retakes needed.'
              : 'Usable, but the pacing dropped in the second half and we lost a little energy.',
          visibleToPresenter: rating >= 4,
        },
      });

      await prisma.performanceMetric.create({
        data: {
          assignmentId: assignment.id,
          platform: 'YOUTUBE',
          measuredOn: new Date(),
          publishedAt: assignment.completedAt,
          views: 1200 + created * 830,
          impressions: 9000 + created * 4100,
          watchTimeMinutes: 400 + created * 260,
          avgViewDurationSeconds: 95 + (created % 5) * 12,
          likes: 40 + created * 7,
          comments: 3 + (created % 6),
          shares: 5 + (created % 4),
          clicks: 210 + created * 45,
          conversions: 6 + (created % 9),
          spendMinor: 15000,
          revenueMinor: 42000 + created * 3000,
          currency: 'GBP',
          recordedById: marketer.id,
        },
      });
    }
  }

  // Refresh the denormalised presenter stats from what we just inserted.
  for (const id of Object.values(presenterIds)) {
    const [agg, ratingAgg, timing, lastAssigned] = await Promise.all([
      prisma.assignment.aggregate({
        where: { presenterId: id, status: { in: ['APPROVED', 'COMPLETED'] } },
        _count: { _all: true },
        _avg: { turnaroundMinutes: true },
        _max: { completedAt: true },
      }),
      prisma.feedback.aggregate({ where: { presenterId: id }, _avg: { overallRating: true } }),
      prisma.assignment.findMany({
        where: { presenterId: id, submittedAt: { not: null }, dueAt: { not: null } },
        select: { latenessMinutes: true },
      }),
      prisma.assignment.findFirst({
        where: { presenterId: id, assignedAt: { not: null } },
        orderBy: { assignedAt: 'desc' },
        select: { assignedAt: true },
      }),
    ]);

    const onTime = timing.filter((t) => (t.latenessMinutes ?? 0) <= 0).length;

    await prisma.presenter.update({
      where: { id },
      data: {
        completedAssignments: agg._count._all,
        avgTurnaroundMinutes: agg._avg.turnaroundMinutes
          ? Math.round(agg._avg.turnaroundMinutes)
          : null,
        lastCompletedAt: agg._max.completedAt,
        lastAssignedAt: lastAssigned?.assignedAt ?? null,
        avgRating: ratingAgg._avg.overallRating
          ? new Prisma.Decimal(ratingAgg._avg.overallRating.toFixed(2))
          : null,
        onTimeDeliveryPct:
          timing.length > 0
            ? new Prisma.Decimal(((onTime / timing.length) * 100).toFixed(2))
            : null,
      },
    });
  }

  console.log(`Done. ${PRESENTERS.length} presenters, ${created} assignments.`);
  console.log('Sign in with admin@example.com / ChangeMe!2026 (change this before deploying).');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
