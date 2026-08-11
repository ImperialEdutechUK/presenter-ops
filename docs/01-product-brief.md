# 01 — Product brief

## The problem

Work is given to freelance presenters over email and chat. That works until it
does not, and it fails in five specific ways:

1. **Nobody can see the whole picture.** Who is doing what right now lives in
   one person's head and their sent folder.
2. **Work drifts to whoever is easiest to ask.** The presenters who reply
   fastest get asked again; the ones who are slightly less convenient quietly
   stop being booked, and nobody notices until they stop being available.
3. **"How long did they take" is unanswerable.** You would have to reconstruct
   it from a thread.
4. **Feedback evaporates.** It is given verbally after a shoot and is gone.
5. **Marketing knows how the videos performed and production does not.** The
   two halves of the same fact live in different tools.

## Who uses it

| Role | What they do here | What they must never see |
|---|---|---|
| **Producer** | Creates profiles, raises and sends work, reviews deliveries, records feedback. The main user. | — |
| **Marketing** | Uploads scripts, records performance figures, can approve. | Cannot edit briefs or rates. |
| **Finance** | Reads fees, exports a payment run. | Cannot change work. |
| **Presenter** | Sees only their own jobs: accept, decline, submit the delivery link, see their earnings. | Internal notes, other presenters, unshared feedback, everyone's rates. Enforced in the API, not the interface. |
| **Admin** | All of the above, plus users and settings. | — |
| **Viewer** | Read-only internal, e.g. a brand lead. | — |

## What was asked for, and where it landed

| Requirement | Where it is |
|---|---|
| Photo, name, rate, contracted websites | Presenter profile — `apps/web/src/app/(app)/presenters/new` |
| Websites as a text field, not a dropdown | `EntityCombobox` — type freely, near-matches surface first, `Create "…"` is the last option. Server de-duplicates by slug so three spellings cannot become three brands. |
| See the work assigned to them | Presenter profile → **Work** tab, split into open and history |
| Whether we are assigning enough work | **Workload balance** screen. This is the piece with no obvious off-the-shelf equivalent, so the maths is documented and shown on hover. |
| Work done in the past | Presenter profile → **Work** → History |
| How long they took | Recorded as three separate figures — see below |
| Feedback | Six rating dimensions plus free text; internal by default, shareable per review |
| Marketing performance data | Snapshot rows per platform per date, with derived engagement, CTR, ROAS and cost per thousand views |
| Upload scripts | Real uploads to object storage, with versioning |
| Not uploading videos | OneDrive/SharePoint link on the assignment |
| Separate backend and frontend | `apps/api` (Railway) and `apps/web` (Vercel), talking over a versioned REST API |
| OpenRouter for AI | `apps/api/src/modules/ai`, off by default |

### "How long did they take" is three numbers, not one

Collapsing them hides what you usually want to know.

| | Measured from → to | The question it answers |
|---|---|---|
| **Response time** | sent → accepted | How fast do they reply? |
| **Turnaround** | sent → delivery link arrives | How long did the whole thing take? |
| **Lateness** | due date → delivery | Did they beat the deadline? |

A presenter who takes six days but only replied on day five has a
responsiveness problem, not a production problem. One blended figure would
call them slow and you would act on the wrong thing. Hours actually worked can
also be logged, optionally, by the presenter.

---

## Decisions taken on your behalf

Each of these was a genuine fork. They are listed so you can overrule any of
them cheaply, before code is written against the assumption.

**1. Money is stored in pence, never as a decimal.**
`£250.00` is stored as the integer `25000`. Floating point cannot represent
`0.1 + 0.2` exactly, and in a system that sums fees for a payment run that
error compounds. Every amount in the API is an integer plus a currency code.

**2. The fee is frozen onto the assignment when it is sent.**
If you raise someone's rate in March, the job you sent in January still shows
January's fee. Without this, historical spend reports silently rewrite
themselves. The consequence: the fee cannot be edited after the presenter
accepts — a variation needs a note explaining it.

**3. Statuses are enforced, not advisory.**
Eleven statuses with an explicit transition table (`packages/shared/src/domain/
assignment-state.ts`). A presenter cannot approve their own work; marketing
cannot rewrite a brief. The web app greys out illegal buttons using the same
table the API enforces, so the two can never disagree.

**4. Reassigning after work has started is blocked.**
Swapping the presenter mid-job would corrupt the turnaround figures for both
people. Past `ACCEPTED` you must cancel and raise a new assignment. If your
process genuinely needs mid-flight reassignment, this is a small change — but
you would need to decide what happens to the clock.

**5. Performance figures are snapshots, not a single row.**
A video with 400 views on day one and 40,000 on day ninety is a different
story from one that got 40,000 immediately, and only dated snapshots can tell
them apart. Aggregations use the latest reading per video so nothing is
double-counted.

**6. The presenter suggestion engine is arithmetic, not a model.**
40 points for being under-allocated, 20 for time since last assigned, 20 for
average rating, 20 for on-time delivery. Every point is itemised on hover, and
excluded presenters are listed with the reason. A recommendation nobody can
interrogate is a recommendation people stop trusting within a month — and this
particular one touches how freelancers get paid, so it has to be inspectable.

**7. Feedback is internal unless explicitly shared.**
Honest internal notes and presenter-facing development feedback are different
documents. Making sharing a deliberate act keeps the first one honest.

**8. Scripts are versioned; the presenter only sees the current one.**
Old versions stay on record so you can always answer "what were they actually
given". This matters the first time a delivery does not match the brief.

**9. AI is off by default and never writes to a record.**
Every AI output is a draft a human accepts, edits or discards, and it is
labelled as AI-produced. Nothing in the AI module ranks or scores a presenter.
See [08 — AI module](08-ai-module.md).

---

## What this system is not

- **Not an invoicing or payments system.** It records agreed fees and exports a
  CSV. It does not raise invoices, calculate VAT, or pay anyone. Integrating
  with your accounting package is a well-defined later project.
- **Not a video platform.** No transcoding, no player, no storage of footage.
- **Not a contract management system.** It records that a contract exists, its
  status and its expiry, and stores the signed PDF. It does not handle
  e-signature. DocuSign or similar would be an integration.
- **Not a scheduling tool.** Availability is recorded as blocked date ranges,
  not as a calendar with bookable slots.
