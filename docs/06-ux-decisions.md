# 06 — UX decisions

Why each screen is shaped the way it is, and what was rejected.

---

## Dashboard — "Today"

**Answers:** what needs a human today?

Not a wall of charts. Everything on the page is either a number someone acts on
or a list of things someone acts on. Six KPI tiles, two quality figures, then
three lists: work that is slipping, presenters going cold, contracts expiring.

*Rejected:* a revenue chart above the fold. Nobody opens an operations tool at
09:00 to look at a trend line; they open it to find out what is on fire.

**Median, not mean turnaround.** One job that sat for three months would drag a
mean somewhere useless, and the reader has no way to know it happened.

**"Going cold" is on the dashboard, not buried in reports.** It is the failure
mode the requester described — presenters quietly stopping being booked — and
things that are not visible daily do not get fixed.

---

## Work — board plus table

Board by default: the everyday question is "where is everything?", which is
spatial. Table exists because the other question — "which of these took too
long?" — is comparative, and comparison needs columns.

Eleven statuses collapse into five columns. Each column shows its committed
spend, because the second question after "how many" is nearly always "how
much".

*Rejected:* drag-and-drop between columns as the primary interaction. Several
transitions require information (a delivery link, a revision note) and a drag
cannot collect it. Dragging would need to open a dialog anyway, which is slower
than a button. It is a reasonable phase-2 addition for the transitions that
need nothing.

---

## Presenter directory — cards plus table

Two views because two jobs are being done. **Cards** are for "who could do
this?" — faces, brands, availability at a glance. **Table** is for "who have we
underused?" — sortable numbers. Neither is a compromise of the other, and the
choice is remembered in `localStorage`.

Sorting by "longest since last assigned" puts nulls last, so people who have
never been assigned do not swamp the list — they are surfaced deliberately on
the dashboard instead.

---

## Creating a presenter — one page, four sections, no wizard

A wizard is the obvious choice for a form this size. It was rejected because it
hides fields the producer wants to cross-check against a contract in another
window, and it turns fixing a typo into a three-click operation.

**Only two fields are required: name and email.** Not the rate, not the
contract, not the photo. A form that refuses to save because a rate has not
been agreed yet is a form people work around with fake data, and fake data is
worse than missing data. The profile saves as *Onboarding* and can be completed
later.

Optional fields are marked "Optional" rather than required ones being starred.
Most fields here are optional; inverting the convention makes the two that
matter visible.

The sticky save bar shows what is about to be saved ("2 contracts · saved as
Onboarding") so the button is never a leap of faith.

---

## The brand field

The brief said: *rather than a dropdown, a text field.* Taken literally, a
plain text field produces "Aspirex", "aspirex" and "Aspirex " as three brands
inside a fortnight, and once that happens the reporting is wrong and the tool
is not trusted again.

So it is a combobox that behaves like a text field:

1. Type freely — it filters what exists as you go.
2. If nothing matches exactly, the last row is `Create "Selector"`. One
   keystroke.
3. Near-matches appear **above** the create option, with a line saying how many
   exist. Typing "south london" surfaces South London College rather than
   quietly letting you make a second one.
4. The server de-duplicates by slug regardless, so even two people typing the
   same new brand simultaneously resolve to one row.

A newly typed value shows a small `new` badge until it is saved, so nobody
wonders whether it took.

---

## Workload balance

The screen with no off-the-shelf equivalent, so its maths is documented in
public.

For a period, per presenter:

```
expectedShare = their capacity weight ÷ total capacity weight
actualShare   = their deliverables    ÷ total deliverables
balanceIndex  = actualShare ÷ expectedShare
```

`1.00` is exactly fair. Below `0.80` is flagged under-allocated, above `1.25`
over-allocated; both thresholds are settings, because every organisation's idea
of "under" differs and a hard-coded default would be quietly wrong for most.

**Capacity weight** stops the screen punishing part-timers. Someone on `0.5`
who receives half as much as a colleague on `1.0` is *balanced*, not neglected.

The bar puts `1.00` at the **midpoint**, with a marker line. Fair becomes a
position on a scale rather than a number to interpret.

**"5 more would reach parity"** is shown for anyone under-allocated. Solving
`(delivered + x) / (total + x) = expectedShare` gives the number of extra
deliverables that would bring them level — actionable in a way that "0.22" is
not.

**Counted from `assignedAt`, not `completedAt`.** The question is what we
*handed out*, which is the part we control. A presenter who was given plenty
but delivered slowly is a different problem, answered by the turnaround column.

**The Gini coefficient** summarises the whole pool in one number, computed on
weight-adjusted output. Below four presenters it is labelled "indicative only",
because with three people it is noise and presenting it as a finding would be
misleading.

---

## Choosing a presenter

The rail on the new-assignment screen ranks eligible presenters and shows its
working:

- 40 points — how far below their fair share they are
- 20 points — time since last assigned
- 20 points — average feedback rating
- 20 points — on-time delivery percentage

Hovering the score itemises all four with the underlying figures. Presenters
with no history score the **neutral midpoint** on the history-based components,
not zero, so a new presenter is not permanently buried by a cold start.

**Exclusions are listed with reasons** — "No signed contract for this brand",
"Marked unavailable on the due date", "Status is paused". A name simply missing
from a list is unexplainable, and unexplainable is where trust goes.

The methodology sentence sits at the bottom of the rail, in the product, not
just in this document.

This is deliberately **not** a machine-learning model. It affects how
freelancers are paid; it has to be arguable line by line, and a producer has to
be able to disagree with it and pick someone else without friction.

---

## Assignment detail

Actions live in a right rail that stays put while the left column scrolls.
Producers work down the page — brief, scripts, delivery — but need "approve"
and "request revisions" reachable throughout. At the bottom would mean
scrolling back every time.

The progress rail shows the pipeline with response time and turnaround at the
end of it, so "how long did they take" is answered without opening a report.

Buttons for illegal transitions are **shown but disabled**, with the reason in
the tooltip ("Fill in a due date and a fee first"). Hiding them would make the
interface change shape unpredictably; disabling them teaches the workflow.

Internal notes and presenter-facing comments are the same thread with a visible
flag, rather than two threads. One place to look.

---

## Presenter portal

A separate surface, not a filtered version of the internal app.

A presenter needs four things: what have I been offered, what am I working on,
where do I put the files, what am I owed. Everything else — workload balance,
other people's rates, internal feedback — is absent, and **the API refuses to
send it** rather than the page hiding it.

The earnings tile says "signed off, not paid", because the alternative is a
support message every month asking where the money is.

---

## Interaction details that matter more than they look

- **⌘K everywhere.** Search presenters and work, jump to any screen, create
  anything. Once someone uses this daily the mouse is the slow path.
- **Optimistic status changes.** The card moves the instant you click and rolls
  back if the server disagrees. On a board, a 300ms wait reads as broken.
- **Skeletons, not spinners.** A spinner says something is happening; a
  skeleton says what is about to arrive.
- **Toasts carry the API's own message**, not a generic failure. "That email is
  already in use" is actionable; "Something went wrong" is not.
- **Debounced search at 220ms.** Fast enough to feel live, slow enough not to
  fire a request per keystroke.
- **Filtering keeps the previous results on screen** while the new ones load,
  so the list never flashes empty.
