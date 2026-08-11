# 04 — API reference

Base URL: `/api/v1`. Interactive Swagger at `/api/docs` when the API is
running.

Auth is an httpOnly cookie (`po_access`); a `Bearer` header also works for
server-to-server calls and Postman.

## Error shape

Every failure, including Prisma's own, comes back as:

```json
{
  "statusCode": 400,
  "error": "ValidationError",
  "message": "Some fields need attention.",
  "fieldErrors": { "contracts.0.rate": ["Expected number, received string"] },
  "requestId": "b8f2…"
}
```

`fieldErrors` is keyed by dotted path so a form can attach each message to the
right input with no client-side mapping.

## Pagination

List endpoints take `page` (default 1) and `pageSize` (default 25, max 100) and
return:

```json
{ "data": [ … ], "meta": { "page": 1, "pageSize": 25, "total": 143, "totalPages": 6 } }
```

---

## Auth

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | Sets both cookies, returns the user |
| POST | `/auth/refresh` | public | Rotates the refresh token |
| POST | `/auth/logout` | any | Revokes every session for the user |
| GET | `/auth/me` | any | Current user + linked presenter |
| POST | `/auth/invite` | Admin, Producer | Emails an invitation |
| POST | `/auth/accept-invite` | public | Sets a password, signs in |

## Presenters

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/presenters` | all internal | `q`, `status[]`, `brandId[]`, `tagId[]`, `coldForDays`, `sort`, `direction` |
| GET | `/presenters/:id` | any | Presenters may fetch only themselves; `internalNotes` is stripped for them |
| POST | `/presenters` | Admin, Producer | Creates profile, contracts and tags in one transaction |
| PATCH | `/presenters/:id` | Admin, Producer | Partial; `tags` is replaced wholesale |
| POST | `/presenters/:id/contracts` | Admin, Producer | Upsert by (presenter, brand) |
| DELETE | `/presenters/:id/contracts/:contractId` | Admin, Producer | |
| POST | `/presenters/:id/availability` | any internal | |
| DELETE | `/presenters/:id/availability/:availabilityId` | any internal | |
| POST | `/presenters/:id/recompute-stats` | Admin | Rebuilds the cached statistics |
| GET | `/presenters/:id/feedback` | any | Presenters see only shared reviews |
| GET | `/presenters/:id/feedback/averages` | any internal | Per-dimension means |
| GET | `/presenters/:id/performance` | all internal | Aggregated by platform |

`sort` accepts `name`, `lastAssignedAt`, `completedAssignments`, `avgRating`,
`avgTurnaroundMinutes`, `createdAt`. Nulls sort last, so "never assigned" does
not swamp a descending sort.

## Assignments

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/assignments` | any | Presenters are scoped to their own and never see drafts |
| GET | `/assignments/:id` | any | Includes `availableTransitions` for the caller |
| POST | `/assignments` | Admin, Producer | `sendImmediately: true` creates and sends in one call |
| PATCH | `/assignments/:id` | Admin, Producer, Presenter | Fee locked after acceptance; presenter swap blocked past `ACCEPTED` |
| POST | `/assignments/:id/transition` | role-dependent | `{ to, deliveryUrl?, note? }` |
| POST | `/assignments/:id/comments` | any | `isInternal` refused for presenters |
| POST | `/assignments/:id/time-logs` | any | Updates `actualHours` |
| POST | `/assignments/:id/feedback` | Admin, Producer, Marketing | One per author; posting again edits yours |
| GET/POST | `/assignments/:id/performance` | Marketing + | Snapshot per platform per date |

Filters on the list: `q`, `status[]`, `brandId[]`, `presenterId[]`,
`workTypeId[]`, `priority[]`, `dueFrom`, `dueTo`, `createdFrom`, `createdTo`,
`overdueOnly`, `unassignedOnly`.

`availableTransitions` returns, for the calling role only:

```json
[{ "to": "ASSIGNED", "label": "Send to presenter", "tone": "positive",
   "blockedBy": ["a due date", "a fee"] }]
```

The web app disables a button when `blockedBy` is non-empty and puts the reason
in the tooltip.

## Files

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/files/presign` | Admin, Producer, Marketing | Returns a pre-signed PUT url |
| POST | `/files/confirm` | Admin, Producer, Marketing | Records the attachment; pass `versionGroupId` to supersede |
| POST | `/files/link` | any | Records a OneDrive/SharePoint URL |
| GET | `/files/:id/download` | any | 15-minute pre-signed GET, after an ownership check |
| DELETE | `/files/:id` | Admin, Producer, Marketing | |

Upload sequence: `presign` → browser `PUT`s straight to the bucket → `confirm`.
Bytes never pass through the API.

## Taxonomy

| Method | Path | Roles |
|---|---|---|
| GET | `/brands` · `/work-types` · `/tags` | any |
| POST | `/brands` · `/work-types` | Admin, Producer |
| PATCH | `/brands/:id` | Admin, Producer |
| DELETE | `/brands/:id` | Admin (archives, never deletes) |
| POST | `/brands/:id/merge-into/:targetId` | Admin |

## Analytics

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/analytics/dashboard` | all internal | KPIs, at-risk work, going-cold presenters, expiring contracts, weekly throughput |
| GET | `/analytics/workload` | all internal | The fairness calculation — see [06](06-ux-decisions.md) |
| GET | `/analytics/suggest-presenters` | Admin, Producer | Ranked shortlist, per-component breakdown, and exclusions with reasons |
| GET | `/analytics/reports/presenters` | Admin, Producer, Finance | Per-presenter delivery report |
| GET | `/analytics/reports/presenters.csv` | Admin, Producer, Finance | Streamed CSV for finance |

## AI (optional)

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/ai/status` | any | `{ enabled }`. The UI hides every AI affordance when false |
| POST | `/ai/brief-from-script` | Admin, Producer, Marketing | Drafts a briefing note from an uploaded script |
| POST | `/ai/summarise-feedback` | Admin, Producer | Refuses below 5 written reviews |
| POST | `/ai/draft-assignment-message` | Admin, Producer | Drafts the offer message |

All return `{ draft, model, disclaimer }`. Nothing is written to a record.

## System

| Method | Path | Roles |
|---|---|---|
| GET | `/health` · `/health/ready` | public (no `/api/v1` prefix) |
| GET/POST | `/notifications` · `/notifications/read` | any |
| GET | `/users` · PATCH `/users/:id` | Admin |
| GET | `/settings` · PATCH `/settings` | read: any, write: Admin |
