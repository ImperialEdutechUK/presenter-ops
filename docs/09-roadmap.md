# 09 — Status and roadmap

Blunt about what is finished and what is not. Read this before quoting a
timeline.

## Verified in the session that produced this repository

- **28 unit tests pass** covering money arithmetic, the workload fairness
  calculation, the Gini coefficient, presenter scoring, timing derivation,
  performance derivations and the state machine
  (`npm test --workspace @presenter-ops/shared`).
- **The shared package type-checks and builds cleanly** (`tsc --noEmit`, then
  `tsc`).
- **The Prisma schema validates** (`prisma validate`) and the initial migration
  SQL generates cleanly — 21 tables, 43 indexes. It is committed at
  `apps/api/prisma/migrations/20260806120000_init/migration.sql`.
- **The HTML prototype renders with no JavaScript errors** and was inspected on
  every screen in both light and dark themes.

## Not verified — needs a real install and a database

- The committed migration has been **generated but never applied** to a live
  Postgres. It should apply cleanly; check the first run rather than assuming.
- The NestJS app has not been booted. Dependency versions are current as of
  writing but have not been installed together.
- The Next.js app has not been built. Some `any` types in page components will
  want tightening once real API responses exist.
- No end-to-end test has been run.

---

## Complete

| | |
|---|---|
| Data model | Every table, index, enum and relationship. Commented throughout. |
| Domain logic | Money, workload fairness, presenter scoring, timing, performance derivations, state machine. Tested. |
| API | Auth + RBAC, presenters, contracts, brands/work types/tags, assignments + transitions, files (pre-signed upload + external links + versioning), feedback, performance, analytics, notifications, cron reminders, AI module. |
| Web app | Dashboard, work board + table, assignment detail, new assignment with the suggestion rail, presenter directory (cards + table), presenter profile with five tabs, new presenter form, workload balance, brands, settings, login, presenter portal. |
| Design system | Tokens, type scale, component library, dark mode, accessibility foundations. |
| Prototype | Every key screen, clickable, single file. |
| Docs | These nine documents. |
| Infrastructure | Dockerfile, railway.json, vercel.json, docker-compose for local Postgres + MinIO, annotated `.env.example`, seed script. |

## Stubbed or missing — needs work before launch

**Must do**

| | Estimate |
|---|---|
| Apply the committed migration to a real Postgres and confirm it | 0.5 day |
| `npm install` both apps, boot them, fix version and type issues | 1 day |
| Tighten rate limiting on `/auth/login` — currently the global 300/min | 1 hour |
| Password reset flow (invitations exist; "forgot password" does not) | 0.5 day |
| Presenter edit page (`/presenters/[id]/edit`) — linked but not built | 0.5 day |
| Portal assignment detail (`/portal/assignments/[id]`) — linked but not built | 0.5 day |
| Presenter photo upload currently routes through the generic attachment endpoint; it needs its own path and an image resize | 0.5 day |
| Availability and contract dialogs on the profile — buttons exist, dialogs do not | 0.5 day |
| End-to-end tests for the two critical paths: create presenter, and raise → send → accept → deliver → approve | 1 day |
| Automated accessibility audit, especially dark-mode contrast | 0.5 day |

**Should do**

| | Estimate |
|---|---|
| Reports screen (the API endpoints and CSV export exist; there is no UI) | 1 day |
| Notification centre panel (bell shows a count; clicking does nothing yet) | 0.5 day |
| Bulk actions on the work board | 1 day |
| Saved filter views | 1 day |
| Empty-state illustrations rather than icons | 0.5 day |

**Realistic total to a production-ready v1: 8–12 developer days**, assuming
one experienced full-stack developer and no scope added.

---

## After launch

**Phase 2 — the obvious next things**

- **Microsoft Graph integration.** Resolve OneDrive item IDs rather than URLs,
  so a moved or renamed folder does not become a dead link. Given the
  organisation is already on Microsoft 365, this is the single highest-value
  integration.
- **Invoicing export** into your accounting package. The data is already
  correct — fees are snapshotted and currency-safe — so this is a mapping
  exercise, not a modelling one.
- **Platform API pulls** for performance figures (YouTube Data API, Meta
  Graph). Today marketing types the numbers in. The snapshot model was designed
  for automated collection.
- **Drag-and-drop on the board** for the transitions that need no extra input.
- **Presenter self-service availability** in the portal.

**Phase 3 — only if the volume justifies it**

- Multi-tenancy, if you ever run this for more than one organisation. Decide
  early; retrofitting an `organisationId` onto every table is painful.
- E-signature integration for contracts.
- A mobile app for presenters. The portal is responsive; measure whether anyone
  actually wants more before building it.
- Horizontal scaling — which requires moving the two cron jobs out of process
  first (see [02 — Architecture](02-architecture.md)).

---

## Things a future maintainer should not undo

Listed because each looks like an oddity until you know why.

1. **Money as integers.** Do not "simplify" to decimals.
2. **Fee snapshotting.** Do not replace with a foreign key to the rate card.
3. **The reset script for denormalised statistics.** Deleting it turns an
   acceptable trade into a liability.
4. **Slug-based de-duplication of brands.** Removing it re-introduces the
   three-spellings problem.
5. **Presenter data hidden in the service, not the client.** Never move that
   filtering to the frontend.
6. **The suggestion engine as arithmetic.** If it becomes a model, the
   explanation goes and so does the trust.
7. **Snapshot performance rows.** Do not collapse to one row per video.
8. **The `explain` prop on `StatTile` being required.** It is the reason every
   number in the product is defensible.
