# 05 — Design system

Implemented in `apps/web/src/styles/globals.css`,
`apps/web/tailwind.config.ts` and `apps/web/src/components/ui/index.tsx`.
The prototype uses identical values, so what you approve there is what gets
built.

## Principles

**1. Restraint over expression.** This is a tool people open forty times a day.
One neutral ramp, one accent, four semantic colours. Every additional colour
makes the meaningful ones quieter.

**2. Brand colours are data, not design tokens.** Aspirex blue and SLC green
arrive from the database and appear only on small brand chips — never on
buttons, headers or navigation. Without that separation the interface becomes a
rainbow the moment a fifth brand is added.

**3. Every number explains itself.** Any derived figure carries a tooltip with
its formula. A metric nobody understands is a metric nobody acts on, and in a
tool that influences how freelancers get paid, unexplained arithmetic is worse
than none.

**4. Colour is never the only signal.** Every status pill carries its label.
Roughly one man in twelve has a colour vision deficiency; a red-versus-green
system fails them silently.

**5. Empty states do work.** Each one says what would be here, why it is not,
and the single action that fixes it. An empty screen with no next step is the
commonest way a good product feels broken.

---

## Tokens

Colours are HSL triplets without the `hsl()` wrapper, so Tailwind can add an
alpha channel: `bg-primary/10` works because the token is `221 83% 53%`.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--canvas` | `220 20% 97%` | `224 32% 6%` | Page background — slightly tinted so white cards lift off it |
| `--card` | `0 0% 100%` | `224 26% 11%` | Cards, popovers |
| `--foreground` | `222 47% 11%` | `210 40% 96%` | Body text |
| `--muted-foreground` | `220 9% 46%` | `218 11% 65%` | Secondary text |
| `--primary` | `221 83% 53%` | `217 91% 60%` | Actions, current state |
| `--success` | `142 71% 36%` | `142 60% 45%` | Approved, on time, balanced |
| `--warning` | `38 92% 45%` | `38 92% 55%` | Due soon, under-allocated |
| `--destructive` | `0 72% 51%` | `0 72% 58%` | Overdue, revisions, destructive actions |
| `--info` | `199 89% 44%` | `199 89% 55%` | With presenter, over-allocated |
| `--border` | `220 13% 91%` | `223 18% 20%` | Hairlines |

Radius: `--radius: 0.625rem` (10px) for cards, `calc(var(--radius) - 2px)` for
controls. Shadows are layered rather than single, so elevation reads as depth
instead of a grey halo.

## Type

Inter, six sizes. More than six and hierarchy stops being legible.

| | Size / line height | Used for |
|---|---|---|
| `xs` | 12 / 16 | Metadata, timestamps |
| `sm` | 13 / 20 | Table cells, secondary text |
| `base` | 14 / 22 | Body — the application default |
| `lg` | 16 / 24 | Card titles |
| `xl` | 20 / 28 | Section headings |
| `2xl` | 28 / 34, −0.02em | Page titles |

`font-variant-numeric: tabular-nums` on every number that is compared to
another number — the `.tabular` class and `[data-numeric]` cells. Without it a
column of amounts jitters as digits change width and the eye cannot scan it.

## Status colours

Fixed across every surface, so nobody has to re-learn what amber means per
screen.

| Status | Tone |
|---|---|
| Draft | neutral |
| Awaiting response · Accepted | info |
| In progress | primary |
| Submitted · In review | warning |
| Revisions requested | destructive |
| Approved · Completed | success |
| Declined · Cancelled | muted, struck through |

The board collapses eleven statuses into five columns — Draft, With presenter,
In production, To review, Signed off. Eleven columns is not a board, it is a
spreadsheet turned sideways.

## Components

`apps/web/src/components/ui/index.tsx` — `Button` (7 variants × 4 sizes),
`Badge`, `BrandChip`, `Card`, `Input`, `Textarea`, `Field`, `Avatar`,
`Skeleton`, `EmptyState`, `Tooltip`, `PageHeader`, `StatTile`.

Two are worth reading before you write anything else:

**`Field`** wires the label, hint and error to the input with the correct
`aria-describedby` and `aria-invalid`, so no field can end up unlabelled by
accident. It also marks optional fields explicitly rather than marking required
ones — most fields here are optional, and inverting the convention makes the
three that matter stand out.

**`StatTile`** takes a required `explain` prop. A KPI cannot be added without
saying how it is calculated. That is enforced by the type, not by discipline.

**`EntityCombobox`** (`components/entity-combobox.tsx`) is the "just type the
website" control. Type freely; matches filter as you go; if nothing matches
exactly, the last row is `Create "Selector"`. Near-matches appear *above* the
create option, and a line underneath says how many existing entries match — the
nudge away from creating a duplicate. The server still de-duplicates by slug.

## Accessibility

Target is WCAG 2.1 AA. What is done, and what still needs checking:

**Done**

- Skip-to-content link as the first tab stop.
- Focus is restyled, never removed; a 2px ring with an offset.
- Semantic landmarks; every icon-only button has an `aria-label`.
- `Field` handles labelling and error association.
- Radix primitives for tooltip, popover, dialog, tabs and avatar — focus
  trapping and roving tabindex come for free.
- Tables use `<caption class="sr-only">` and scoped headers.
- `prefers-reduced-motion` disables every animation.
- Brand chip text colour is computed from the chip's own background using the
  WCAG relative-luminance formula (`readableTextOn`), not guessed.
- Loading states are skeletons, and `aria-busy` is set on busy buttons.

**Still to verify before launch**

- Automated contrast audit on the dark palette. The light palette was designed
  against AA; dark has not been measured.
- Keyboard walk-through of the board and the combobox with a screen reader.
- The workload bar needs a text alternative for the visual position of the
  fairness marker — currently the numbers are adjacent but not associated.
