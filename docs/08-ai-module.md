# 08 — AI module (optional, off by default)

`apps/api/src/modules/ai/`. Enabled by `AI_ENABLED=true` plus an
`OPENROUTER_API_KEY`. While disabled, `/ai/status` returns `{ enabled: false }`
and the web app hides every AI affordance — no greyed-out buttons hinting at a
feature that is not there.

## Three rules this module follows

**1. Nothing is ever written to a record automatically.** Every response comes
back as a `draft` a human accepts, edits or discards. There is no endpoint that
writes AI output to a database column.

**2. Every AI-produced block is labelled as such** in the interface, with the
model name and a disclaimer returned alongside the text.

**3. Nothing here scores or ranks a presenter.** The suggestion engine in
`AnalyticsService` is a fixed arithmetic formula precisely so that "why is she
top of the list" always has an answer that does not involve a model. That
boundary is deliberate: this system influences how freelancers are paid.

## What it does

| Endpoint | What it produces |
|---|---|
| `POST /ai/brief-from-script` | From an uploaded script: a two-sentence summary, an estimated spoken duration (stating the words-per-minute figure used), tricky pronunciations, an on-camera checklist, and anything ambiguous the producer should clarify. |
| `POST /ai/summarise-feedback` | Themes across a presenter's written reviews: consistent strengths, recurring issues, where reviewers disagree, and whether the pattern is moving. **Refuses below five written reviews** — a summary of three would read as a pattern when it is not. |
| `POST /ai/draft-assignment-message` | The short briefing message that goes out with a new job. British English, under 150 words, no fee mentioned (that is shown separately in the portal). |

The prompts instruct the model not to invent facts and to flag ambiguity rather
than resolve it silently. That reduces confabulation; it does not eliminate it.
The disclaimer on every response says so.

## The OpenRouter client

`openrouter.client.ts`, dependency-free — Node 20's global `fetch` is enough,
and adding an SDK for four fields is not worth the upgrade treadmill.

```
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer <OPENROUTER_API_KEY>
Content-Type: application/json
HTTP-Referer: <OPENROUTER_SITE_URL>     (optional attribution)
X-Title: <OPENROUTER_SITE_NAME>         (optional attribution)

{ "model": "anthropic/claude-3.5-sonnet",
  "messages": [{"role":"system",…},{"role":"user",…}],
  "temperature": 0.2, "max_tokens": 1500, "stream": false }
```

The endpoint, method, auth header and OpenAI-compatible body shape are as
published in OpenRouter's API reference:
<https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request>

Models are identified as `provider/model-name`. Changing `OPENROUTER_MODEL`
switches provider with no code change — that is the reason for using OpenRouter
rather than a single vendor's SDK.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `AI_ENABLED` | `false` | Master switch |
| `OPENROUTER_API_KEY` | — | Required when enabled |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | |
| `OPENROUTER_MODEL` | `anthropic/claude-3.5-sonnet` | Any `provider/model` |
| `OPENROUTER_SITE_URL` / `_SITE_NAME` | — | Attribution headers |
| `OPENROUTER_MAX_TOKENS` | `1500` | |
| `OPENROUTER_TIMEOUT_MS` | `45000` | Aborts and returns 503 |

Failures return `503` with a message that says to carry on without it. The AI
is never on the critical path of anything.

## Known gap: text extraction

`AiService.extractText` handles plain text and markdown today. DOCX and PDF
throw an explicit error naming this document, rather than failing silently or
sending gibberish to the model.

To enable them:

```bash
npm install mammoth pdf-parse --workspace @presenter-ops/api
```

then in `ai.service.ts`:

```ts
if (mime.includes('wordprocessingml')) {
  const mammoth = await import('mammoth');
  return (await mammoth.extractRawText({ buffer })).value;
}
if (mime === 'application/pdf') {
  const pdf = (await import('pdf-parse')).default;
  return (await pdf(buffer)).text;
}
```

Both are small and well maintained. They are left out of `package.json` so the
dependency is a conscious decision rather than something inherited. Note that
`pdf-parse` reads the text layer only — a scanned PDF returns nothing, and the
error message already says so.

## What was deliberately not built

- **Auto-assigning presenters.** Ranking is arithmetic for the reasons above.
- **Auto-writing feedback.** Feedback is a manager's judgement. A model
  drafting it would launder responsibility.
- **Auto-approving deliveries.** Nobody wants to explain that a model signed
  off a video.
- **Predicting video performance.** There is nowhere near enough data, and a
  confident-sounding wrong number is worse than no number.

## Cost

Only when enabled. A script brief is roughly 3–10k input tokens and under 1k
output — pennies per call at current rates, and it is called deliberately by a
human, not on a loop. Set a spend limit in the OpenRouter dashboard anyway.
