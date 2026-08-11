# 03 — Data model

Source of truth: `apps/api/prisma/schema.prisma`, which is heavily commented.
This document explains the reasoning; the schema explains the detail.

## Tables at a glance

**Identity**
`User` · `RefreshToken` · `Invitation`

**Taxonomy — the user-extensible lists**
`Brand` · `WorkType` · `Tag` · `PresenterTag`

**People**
`Presenter` · `PresenterBrand` (contract + rate) · `Availability`

**Work**
`Assignment` · `BrandCounter` · `Attachment` · `Comment` · `AssignmentEvent` ·
`TimeLog`

**Outcomes**
`Feedback` · `PerformanceMetric`

**System**
`Notification` · `AuditLog` · `AppSetting`

---

## The four decisions that matter

### 1. Brands are a table, statuses are an enum

The rule applied throughout: *anything the business will keep inventing new
values for is a table; anything with behaviour attached is an enum.*

Brands, work types and tags are tables, so they can be created inline from a
text field with no deployment. Statuses, roles and rate units are enums,
because adding a value to any of them requires code changes anyway — a new
status needs transition rules, a new role needs permissions.

De-duplication is by **slug**, not raw name. `South London College`,
`south london college` and `South London  College` all slugify to
`south-london-college` and resolve to one row. Without that, the reporting
splits three ways within a fortnight and nobody trusts it again.

`TaxonomyService.mergeBrands()` exists for when a duplicate still gets through
— it moves assignments and contracts across, dropping links that would violate
the unique constraint, then archives the source.

### 2. Money is integer minor units

`feeMinor: 25000` + `feeCurrency: 'GBP'` = £250.00.

Floats cannot represent `0.1 + 0.2` exactly. In a system that sums fees for a
payment run, that error accumulates. `packages/shared/src/domain/money.ts`
holds the parse, format and multiply helpers, and `sumMoney` **throws** on
mixed currencies rather than producing a wrong total quietly.

### 3. Fees are snapshotted onto the assignment

`Assignment` carries `feeMinor`, `feeUnit`, `feeQuantity`, `feeCurrency` and a
computed `totalFeeMinor` — copied from the rate card at the moment of
assignment, then never re-read.

Rates change. If the assignment held a foreign key to the rate card instead,
raising someone's rate in March would rewrite what January's jobs appear to
have cost. Historical spend has to be stable.

`PresenterBrand.rateMinor` is nullable and falls back to
`Presenter.defaultRateMinor`. The API returns an `effectiveRate` with a
`rateIsInherited` flag, so the interface can show a small `default` badge
rather than making the producer work out where the number came from.

### 4. Denormalised statistics, with a reset button

Five columns on `Presenter` cache values that could be computed:

| Column | Recomputed from |
|---|---|
| `completedAssignments` | count of approved/completed assignments |
| `avgTurnaroundMinutes` | mean `turnaroundMinutes` |
| `avgRating` | mean `Feedback.overallRating` |
| `onTimeDeliveryPct` | share with `latenessMinutes <= 0` |
| `lastAssignedAt` | most recent `assignedAt` |

They exist so the directory can sort 200 presenters by "longest since last
assigned" without an aggregate subquery per row. They are refreshed by
`PresentersService.recomputeStats()` after every status change and every new
piece of feedback, and `npm run recompute:presenter-stats` rebuilds all of them
from source.

Caches drift — after a bulk import, a manual database edit, a bug. The reset
script is what makes this trade acceptable. Do not remove it.

`Assignment.turnaroundMinutes`, `responseMinutes` and `latenessMinutes` are
denormalised for the same reason: reporting queries become plain aggregates
rather than date arithmetic across the table.

---

## Reference codes

`ASP-0014`, `SLC-0007`. The prefix comes from the brand slug's initials; the
number is a per-brand counter in `BrandCounter`, incremented inside the same
transaction as the insert. Two producers creating work simultaneously cannot
be handed the same number.

Humans quote these in Slack and in email. A cuid would not be quoted.

---

## The assignment lifecycle

```
DRAFT ──▶ ASSIGNED ──▶ ACCEPTED ──▶ IN_PROGRESS ──▶ SUBMITTED ──▶ IN_REVIEW
  │           │  │                      ▲               │            │
  │           │  │                      │               ▼            ▼
  │           │  └──▶ DECLINED ──▶ DRAFT│         REVISIONS_REQUESTED
  │           │                          └──────────────┘     │
  │           │                                               ▼
  └───────────┴──────────────▶ CANCELLED              APPROVED ──▶ COMPLETED
```

Defined in `packages/shared/src/domain/assignment-state.ts` with, per
transition: which roles may perform it, what fields must be present first, the
button label, and the tone for styling. Both sides read the same table.

Timestamps written on transition: `assignedAt`, `acceptedAt`, `startedAt`,
`submittedAt`, `approvedAt`, `completedAt`, `cancelledAt` — plus the three
derived durations, computed once on submission.

---

## Attachments: one model, two storage backends

```
storage: 'S3'             → storageKey points into the bucket
storage: 'EXTERNAL_LINK'  → externalUrl is a OneDrive/SharePoint link
```

The same list UI renders both. `FilesService.getDownloadUrl` returns a
pre-signed URL for the first and the raw link for the second.

Versioning: files sharing a `versionGroupId` are versions of one document.
`isCurrent` marks the newest; older rows survive. The presenter portal filters
to `isCurrent && visibleToPresenter`.

---

## Performance snapshots

Unique on `(assignmentId, platform, measuredOn)`. Recording the same video on
the same platform on a later date creates a **new row**, not an overwrite.

Aggregations use `DISTINCT ON (assignmentId, platform) … ORDER BY measuredOn
DESC` so a video measured five times counts once.

Derived figures — engagement rate, CTR, conversion rate, cost per conversion,
ROAS, fee cost per thousand views — are computed on read in
`packages/shared/src/domain/metrics.ts`, never stored. They return `null`
rather than `0` when the denominator is missing, because "no data" and "zero"
are different facts and a chart that conflates them lies.

---

## Migrations

```bash
npm run db:migrate                                    # dev, creates + applies
npx prisma migrate dev --name add_something --create-only   # review first
npm run prisma:deploy --workspace @presenter-ops/api  # production
```

The API Dockerfile runs `prisma migrate deploy` on boot. It is idempotent, so a
restarted or scaled container does not re-apply anything.

**Before the first deploy**, generate the initial migration locally and commit
it — the schema in this repository has not yet been run through
`prisma migrate`. Expect to fix one or two things the first time.
