# 02 — Architecture

## Shape

```
┌──────────────────┐        HTTPS, cookie auth        ┌─────────────────────┐
│   Next.js 15     │ ───────────────────────────────▶ │   NestJS 10 API     │
│   apps/web       │ ◀─────────────────────────────── │   apps/api          │
│   → Vercel       │        JSON, /api/v1/*           │   → Railway         │
└──────────────────┘                                  └──────────┬──────────┘
        │                                                        │
        │ pre-signed PUT / GET                                   │ Prisma
        │ (bytes never touch the API)                            ▼
        ▼                                             ┌─────────────────────┐
┌──────────────────┐                                  │  PostgreSQL 16      │
│  S3 / R2 / MinIO │                                  │  → Railway plugin   │
│  scripts,        │                                  └─────────────────────┘
│  contracts       │
└──────────────────┘                                  ┌─────────────────────┐
                                                      │  OpenRouter         │
   OneDrive / SharePoint ── link only, no bytes ─────▶ │  (optional, off)    │
                                                      └─────────────────────┘

          packages/shared — types, Zod schemas, domain maths
          imported by BOTH sides. One definition, two consumers.
```

## Why the shared package exists

`packages/shared` is the piece that stops the two halves drifting apart. It
holds:

- **Zod schemas** for every request body. The API validates against them with a
  pipe; the web form validates against the same object. A field cannot be
  optional on the client and required on the server, because there is only one
  definition.
- **The domain maths** — money arithmetic, the workload fairness calculation,
  turnaround derivation, the presenter scoring function. Written once, tested
  once (28 unit tests), used in both places. The web app can therefore show a
  live "total commitment" figure that is guaranteed to match what the server
  will store.
- **The assignment state machine.** The API enforces it; the web app reads the
  same table to decide which buttons to disable. The client never guesses.
- **Enum values and their display labels**, so the API, the web app and any CSV
  export spell things identically.

The cost is a build step: `npm run build:shared` must run before either app
builds. The Vercel and Railway build commands both do it.

---

## Request flow, in full

1. Browser calls `apps/web`'s API client (`src/lib/api.ts`) with
   `credentials: 'include'`.
2. The `po_access` httpOnly cookie carries a 15-minute JWT. JavaScript on the
   page cannot read it, which removes the entire "XSS steals the session" class
   of attack.
3. NestJS: `JwtAuthGuard` → `RolesGuard` → `ThrottlerGuard`. The JWT strategy
   re-reads the user on every request (one indexed lookup) so deactivating an
   account takes effect immediately rather than in fifteen minutes.
4. The controller validates the body with `ZodValidationPipe`, which returns
   parsed, defaulted, coerced data — never the raw input.
5. The service does the work inside a Prisma transaction where more than one
   table is touched.
6. `AuditInterceptor` writes an `AuditLog` row for anything decorated
   `@Audit(...)`, fire-and-forget so an audit failure can never fail the user's
   actual request.
7. `HttpExceptionFilter` turns everything — including Prisma's own errors —
   into one JSON envelope with a `requestId`.

On a 401 the client fires **one** silent refresh and replays the request.
Concurrent 401s share a single in-flight refresh promise, so ten parallel
queries do not fire ten refreshes and invalidate each other's rotated token.

---

## Why we do not store video

The brief flagged database size as a concern. That concern is right, but the
reasoning goes further than storage cost:

- **Cost.** A single 4K master is 5–40 GB. A hundred a year is meaningful spend
  on storage you already pay for once in Microsoft 365.
- **Egress.** Serving video from object storage is charged per gigabyte
  transferred, repeatedly, every time someone reviews a cut.
- **Duplication.** The files already exist in OneDrive, where the editors and
  marketing team already work. A second copy is a second thing to keep in sync
  and a second place for the wrong version to live.
- **Nobody would use it.** The people cutting these videos are in the
  Microsoft 365 tools all day. A separate video store means an extra upload
  step, and extra steps get skipped.

So: **assignments carry a `deliveryUrl`.** The `Attachment` model has a
`storage` field with two values — `S3` for real bytes, `EXTERNAL_LINK` for a
OneDrive/SharePoint URL — which means the same UI handles both without knowing
which is which.

**Scripts are different and are stored properly.** They are small (kilobytes),
they need versioning, they need to be visible in the presenter portal without
granting SharePoint access to a freelancer, and the AI module needs to be able
to read them. Uploads go straight from the browser to the bucket via a
pre-signed PUT — the API issues the URL and never sees the bytes, so a 90 MB
file does not occupy a request thread or the container's memory.

**A caveat to state plainly:** a OneDrive link can be moved, renamed or deleted
without this system knowing. It will show a link that 404s. Mitigating that
properly means Microsoft Graph integration to resolve item IDs rather than
URLs — a worthwhile phase 2, listed in [09 — Roadmap](09-roadmap.md).

---

## Security

| | |
|---|---|
| **Passwords** | Argon2id. Login runs a hash comparison even for a non-existent email so response time does not reveal which addresses are registered. |
| **Sessions** | 15-minute access JWT + 30-day refresh token, both httpOnly cookies. Refresh tokens rotate on use; only a SHA-256 hash is stored, never the token. |
| **Replay detection** | Presenting an already-revoked refresh token means it was stolen. The API revokes every session for that user rather than just refusing the one request. |
| **Authorisation** | `@Roles(...)` on controllers, plus row-level scoping in services. A presenter's `presenterId` is compared to the record's, in the service, on every read and write. |
| **Presenter data hiding** | Internal comments, unshared feedback, internal notes and performance figures are stripped in `AssignmentsService.findOne` before the DTO is built. The client is never trusted to hide them. |
| **File access** | Nothing in the bucket is public. Every download is a pre-signed GET valid for 15 minutes, issued only after an ownership check. |
| **Input** | Zod on every body and query. Prisma parameterises all SQL, including the handful of raw queries in the analytics service. |
| **Transport** | Helmet, an explicit CORS origin list (never `*`, because credentials are included), HSTS via the platform. |
| **Rate limiting** | 300 requests per minute per IP globally. Tighten `/auth/login` before going live — see the roadmap. |
| **Audit** | Immutable `AuditLog` of who changed what, with before/after. |

---

## Deliberate omissions

Named so nobody wonders whether they were forgotten.

- **No Redis, no queue.** The two background jobs (due reminders, contract
  expiry warnings) are `@Cron` methods in-process. At this scale that is
  correct. It becomes wrong the moment you run more than one API replica —
  every replica would fire the same reminder. If you scale horizontally, move
  the cron work to a Railway cron service that hits an internal endpoint, or
  add a distributed lock.
- **No WebSockets.** The dashboard polls every two minutes and notifications
  every minute. Real-time collaboration is not what this is.
- **No multi-tenancy.** One organisation per deployment. `AppSetting` is a
  single row. Adding tenancy later means an `organisationId` on almost every
  table — much cheaper to decide now than in a year.
- **No soft deletes.** Brands and presenters archive rather than delete;
  assignments cancel. Nothing important is ever actually removed, so a
  `deletedAt` column on everything would be complexity without a payoff.
- **No GraphQL.** A REST surface this small does not benefit from it, and the
  generated Swagger document is easier to hand to someone.

## Performance notes

- Indexes are on the columns actually filtered on. See the schema — each one is
  there for a named query, not sprinkled hopefully.
- Five statistics are denormalised onto `Presenter` (`completedAssignments`,
  `avgTurnaroundMinutes`, `avgRating`, `onTimeDeliveryPct`, `lastAssignedAt`)
  so the directory can sort on them without an aggregate per row. They are
  recomputed on every relevant write, and `npm run recompute:presenter-stats`
  rebuilds them from source. That script's existence is what makes the
  denormalisation an acceptable trade rather than a liability.
- Dashboard and workload use raw SQL for the percentile and window functions
  Prisma cannot express. They are parameterised.
- The web app uses TanStack Query with `placeholderData` on lists, so filtering
  does not flash an empty state.
