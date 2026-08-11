# 07 — Deployment

Target: **API + PostgreSQL on Railway**, **web app on Vercel**, **object
storage on Cloudflare R2** (or AWS S3).

These platforms change their dashboards regularly. The names below were
accurate when written; if a setting has moved, the shape of what you need has
not.

---

## 1. Object storage

Scripts, briefs and contracts only. Videos stay in OneDrive.

**Cloudflare R2** is the cheaper choice for this workload because it charges no
egress fee; AWS S3 charges per gigabyte transferred out, and script downloads
are frequent.

1. Create a bucket, e.g. `presenter-ops`.
2. Create an API token with object read/write on that bucket.
3. Note the account ID — the endpoint is
   `https://<account-id>.r2.cloudflarestorage.com`.
4. Keep the bucket **private**. Nothing in it is public; every download goes
   through a 15-minute pre-signed URL issued after an ownership check.
5. Add a CORS rule allowing `PUT` and `GET` from your web app's origin —
   without it, the browser's direct upload is blocked:

```json
[{
  "AllowedOrigins": ["https://your-app.vercel.app"],
  "AllowedMethods": ["PUT", "GET"],
  "AllowedHeaders": ["content-type"],
  "MaxAgeSeconds": 3000
}]
```

For AWS S3 instead: leave `S3_ENDPOINT` blank, set `S3_REGION` to your region
(e.g. `eu-west-2`) and `S3_FORCE_PATH_STYLE=false`.

---

## 2. API on Railway

1. New project → **Deploy from GitHub repo**, pointed at this repository.
2. Add the **PostgreSQL** plugin. It provides `DATABASE_URL` automatically.
3. On the API service, set **Root Directory** to `/` (the Dockerfile needs the
   workspace root) and **Dockerfile Path** to `apps/api/Dockerfile`.
   `apps/api/railway.json` already declares this, plus the health check.
4. Set the variables below.
5. Deploy. Migrations run on boot — `prisma migrate deploy` is idempotent, so a
   restart or a scale event does not re-apply anything.
6. Generate a public domain and note it.

### API environment variables

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` (Railway injects its own; the app reads it) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — Railway's reference syntax |
| `APP_URL` | `https://your-app.vercel.app` |
| `CORS_ORIGINS` | `https://your-app.vercel.app` (comma-separated for more) |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `COOKIE_SECRET` | a second, different random string |
| `COOKIE_SAMESITE` | `none` — see the note below |
| `COOKIE_DOMAIN` | leave blank unless both apps sit under one parent domain |
| `S3_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` for R2 |
| `S3_BUCKET` | `presenter-ops` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | from step 1 |
| `S3_FORCE_PATH_STYLE` | `false` for R2 and S3 |
| `MAIL_ENABLED` | `true` once SMTP is configured |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | your provider |
| `AI_ENABLED` | `false` unless you want the AI features |
| `ENABLE_SWAGGER` | `false` in production |

**The cookie question.** `api-xyz.up.railway.app` and `app.vercel.app` are
different registrable domains, so the session cookie is cross-site and needs
`SameSite=None; Secure`. That works, but browsers are steadily tightening
third-party cookie behaviour.

The more durable arrangement is a custom domain on both:
`api.yourdomain.com` and `app.yourdomain.com`. Then set
`COOKIE_SAMESITE=lax` and `COOKIE_DOMAIN=.yourdomain.com` and the cookie is
first-party. **Do this before launch if you can** — retrofitting it means
every session is invalidated.

---

## 3. Web app on Vercel

1. Import the repository.
2. **Root Directory:** `apps/web`.
3. Framework preset: Next.js. `apps/web/vercel.json` already sets the build and
   install commands to run from the workspace root so the shared package is
   built first.
4. Environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com/api/v1` — the `/api/v1` suffix is required |
| `NEXT_PUBLIC_APP_NAME` | `PresenterOps` |

5. Deploy, then go back to Railway and make sure `CORS_ORIGINS` and `APP_URL`
   match the final Vercel domain.

---

## 4. First run

```bash
# Locally, pointed at the production database:
DATABASE_URL="postgresql://…" npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

Then create the first admin. The seed script's demo accounts must **not** be
used in production. Either:

- run a one-off script that inserts one `User` with role `ADMIN` and an Argon2
  hash of a password you choose, or
- temporarily allow the invite endpoint without auth, invite yourself, and
  revert.

The first option is safer. After that, everyone else is invited from the UI.

---

## 5. Before you call it live

- [ ] `JWT_SECRET` and `COOKIE_SECRET` are freshly generated, not copied from
      `.env.example`.
- [ ] No demo account exists in production.
- [ ] `ENABLE_SWAGGER=false`.
- [ ] `CORS_ORIGINS` lists only your real domains.
- [ ] The bucket is private and its CORS rule names only your web origin.
- [ ] Rate limiting on `/auth/login` has been tightened from the global 300/min
      to something like 10/min per IP. **This is not done yet** — see
      [09 — Roadmap](09-roadmap.md).
- [ ] A database backup schedule exists. Railway's Postgres plugin has backup
      settings; turn them on and test a restore once.
- [ ] Error reporting is wired up (Sentry, or Railway logs at minimum).
- [ ] Uptime monitoring points at `/health/ready`, which includes a real
      database round trip.
- [ ] Someone has actually received one of the notification emails.

## 6. Cost, honestly

Approximate monthly figures for a team of this size. **Verify current pricing
on each provider's site — these change and are not quoted from a live check.**

| | |
|---|---|
| Railway (API + Postgres) | usage-based; a small always-on service plus a small database is typically the lower tens of dollars |
| Vercel | the free hobby tier covers this; a team plan is per-seat |
| Cloudflare R2 | a few dollars at most — scripts are kilobytes and R2 has no egress charge |
| SMTP | free tiers cover this volume at most providers |
| OpenRouter | only if `AI_ENABLED=true`; pay per token, pennies at this usage |

## 7. Scaling notes

The one thing that breaks if you scale horizontally: the two `@Cron` jobs run
**in-process**, so every replica would fire the same reminder. Before setting
replicas above one, either move that work to a Railway cron service hitting an
internal endpoint, or add a distributed lock. Everything else in the API is
stateless.
