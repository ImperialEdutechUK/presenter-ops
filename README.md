# PresenterOps

A system for creating freelance presenter profiles, assigning work to them,
tracking what they delivered and how long it took, capturing feedback, and
recording how the finished videos performed.

Built to be handed to a full-stack developer and deployed on Railway (API +
Postgres) and Vercel (web).

---

## What is in this repository

```
presenter-ops/
├── prototype/
│   └── presenter-ops-prototype.html   ← open this first, in any browser
├── packages/
│   └── shared/                        Types, Zod schemas and the domain maths,
│                                      imported by BOTH the API and the web app
├── apps/
│   ├── api/                           NestJS + Prisma + PostgreSQL  → Railway
│   └── web/                           Next.js 15 + Tailwind          → Vercel
├── docs/                              Nine documents, listed below
├── docker-compose.yml                 Local Postgres + S3-compatible storage
└── .env.example                       Every environment variable, annotated
```

**Start with `prototype/presenter-ops-prototype.html`.** It is a single file
with no dependencies — double-click it. Every screen is clickable, the search
palette works (`⌘K`), dark mode works, and the "type a brand that does not
exist yet" behaviour is live. Sign the interface off there before anyone writes
production code.

---

## The five things this system does

| | |
|---|---|
| **1. Presenter profiles** | Photo, contact details, rate, skills, and the websites they hold signed contracts to. A rate can be set per brand, falling back to a default. |
| **2. Assigning work** | Raise a job against a brand, attach the script from marketing, pick a presenter, set a fee and a deadline, send it. |
| **3. Tracking** | Every job moves through an enforced lifecycle. The system records how fast they replied, how long the work took in total, and whether it beat the deadline. |
| **4. Fair distribution** | A workload screen that shows who is getting more than their share and who is quietly being forgotten, with the arithmetic shown on every figure. |
| **5. Outcomes** | Internal feedback ratings, plus marketing's own numbers on how each video performed — views, engagement, conversions, cost per thousand views. |

Videos themselves are **not** stored. The system holds a OneDrive/SharePoint
link. Scripts and contracts *are* stored, in S3-compatible object storage.
See [docs/02-architecture.md](docs/02-architecture.md) for why.

---

## Running it locally

Requirements: Node 20.11+, Docker, and about five minutes.

```bash
cp .env.example .env          # then set JWT_SECRET to any long random string
npm install
npm run setup                 # starts Postgres + MinIO, migrates, seeds demo data
npm run dev                   # API on :4000, web app on :3000
```

`npm run setup` is a shortcut for `db:up` → `build:shared` → `db:migrate` →
`db:seed`. If it fails, run those four steps individually to see where.

**Demo logins** (created by the seed — change them before deploying anywhere):

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `ChangeMe!2026` | Admin |
| `producer@example.com` | `ChangeMe!2026` | Producer |
| `marketing@example.com` | `ChangeMe!2026` | Marketing |
| `amara.okafor@example.com` | `ChangeMe!2026` | Presenter (portal view) |

Useful URLs once running:

- Web app — <http://localhost:3000>
- API docs (Swagger) — <http://localhost:4000/api/docs>
- Database browser — `npm run db:studio`
- Object storage console — <http://localhost:9001> (`minioadmin` / `minioadmin`)

---

## The documents

Read them in this order if you are the developer picking this up.

| | |
|---|---|
| [01 — Product brief](docs/01-product-brief.md) | What the system is for, who uses it, and the decisions that were made on the requester's behalf, each one flagged so it can be overruled. |
| [02 — Architecture](docs/02-architecture.md) | Services, request flow, the storage decision, security model, and what is deliberately left out. |
| [03 — Data model](docs/03-data-model.md) | Every table, why it exists, and the four modelling decisions that matter most. |
| [04 — API reference](docs/04-api-reference.md) | Every endpoint with its role requirements. |
| [05 — Design system](docs/05-design-system.md) | Tokens, type scale, components, accessibility commitments. |
| [06 — UX decisions](docs/06-ux-decisions.md) | The reasoning behind each screen, and the alternatives rejected. |
| [07 — Deployment](docs/07-deployment.md) | Railway and Vercel step by step, with every environment variable. |
| [08 — AI module](docs/08-ai-module.md) | The optional OpenRouter integration, off by default, and the rules it follows. |
| [09 — Roadmap](docs/09-roadmap.md) | What is built, what is stubbed, and a realistic build order with estimates. |

---

## Honest status

This repository is a **complete, reviewed design plus a substantial reference
implementation** — not a finished product that has been run in anger.

**Verified in this session**

- The 28 unit tests covering the money, workload, timing, performance and state
  machine logic pass (`npm test --workspace @presenter-ops/shared`).
- The shared package type-checks and builds cleanly.
- The Prisma schema validates, and its initial migration — 21 tables, 43
  indexes — generates cleanly and is committed.
- The HTML prototype renders with no JavaScript errors and was inspected on
  every screen, in light and dark.

**Not yet verified, because it needs a database and a real `npm install`**

- The committed migration has been generated but never applied to a live
  Postgres.
- The NestJS app has not been booted; the web app has not been built.
- No end-to-end test has been run.

Treat [docs/09-roadmap.md](docs/09-roadmap.md) as the definitive list of what is
finished and what still needs work. It is deliberately blunt about the gaps.
