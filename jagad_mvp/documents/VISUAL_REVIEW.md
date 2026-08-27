# Visual design review — M0 slice

Reviewed at commit `e021247` (detached worktree, dev server on `127.0.0.1:5321`), Chrome
(arm64), 27 Aug 2026. Every screen in `BUILT_SCREENS` plus `/consent/:token`, at 1440x900 and
1024x768, in both densities, as Vivek Jagad (admin) and Kiran Solanki (agent), including empty,
drawer-open and validation-error states.

Screenshots referenced below live in the review scratchpad under `rv/` and are named in each
entry. They are not in the repo.

---

## The overall read

The product looks like two different builds stitched together.

The **table layer is genuinely good**. The queues (`/inquiries`, `/customers`,
`/back-office/kyc`, all seven `/config/*`) are calm, legible, consistently structured, and
typographically disciplined in a way most MVPs never reach — record ids, money and TAT clocks
are all IBM Plex Mono with `tabular-nums`, so columns of numbers line up and scan. The rail
reshapes per role, carries live counts, and groups sensibly. The empty state, the 404 and the
"not built yet" stub are all better written and better composed than the screens they stand in
for. Nothing throws a console error anywhere.

The **prose layer is broken**, and it is broken on the first screen anyone sees. Every
paragraph the Assistant renders — the landing briefing, the proactive notice, the Ask card's
help text, and the same content inside the Cmd-K drawer on every other screen — wraps at one
word per line, down a 15-pixel-wide column. It is the first thing on the demo and it looks like
a rendering failure, because it is one (defect 1).

The **shell layer is unfinished**. Scroll any list past the fold and the whole application
scrolls: the rail leaves the top of the screen, the sticky table header stops sticking, and the
role switcher ends up floating in the middle of the page above 380 pixels of white (defect 2).
This is the same family as the nav-rail footer bug that shipped before — a layout invariant no
test can hold.

And there is **no single page gutter**. Content sits 24px from the rail on a page header, 20px
on a section heading, 25px on a table, 16px on an Assistant card, and 0px on every quotations
and deals screen. On a walkthrough that jumps between modules, the screens read as different
products (defects 7 and 8).

The colour language is well-designed in code — `INQUIRY_TONE` is a principled map — but at the
size the pills actually render, the lime "needs a person" tone and the green "all good" tone are
the same colour to the eye (defect 6). The one signal the design was built to carry is the one
that does not survive contact with the screen.

---

## Defects

### 1. Every Assistant paragraph renders one word per line — BLOCKER

**Screens** `/assistant` (both roles), and the Assistant drawer (Cmd-K) on every screen in the
app.
**Screenshots** `main-1440-comf-vivek__assistant.png`, `assistant-scroll-1400.png`,
`kiran3__landing.png`, `states-1440__state-drawer.png`.

The briefing reads as a vertical column: "10 / open / inquiries / across / the / business."
The proactive notice card is ~700px tall to hold one sentence. The Ask card's help text runs
forty lines down the left edge. Kiran's landing is worse than Vivek's because his briefing is
longer.

**Cause.** `--text-reading` is a *font-size* token (`15px` comfortable, `14px` compact, defined
`src/styles/tokens.css:186` and `:198`) but four rules consume it as a *width*:

- `src/features/assistant/blocks/BlockRenderer.module.css:12` — `.para { max-width: var(--text-reading) }`
- `src/features/assistant/blocks/BlockRenderer.module.css:30` — `.note`
- `src/features/assistant/AssistantConversation.module.css:116`
- `src/components/NotificationRail/NotificationRail.module.css:62`

Every one of those paragraphs is capped at 15px wide, so it collapses to min-content.

**Why it matters.** This is the product's signature feature and its landing view. A client sees
it before anything else and concludes the build is broken.

**Fix.** Add a real measure token (e.g. `--measure-reading: 68ch`) alongside the type scale and
point those four `max-width` declarations at it. Consider also renaming `--text-reading` to
`--text-size-reading` so the two can never be confused again; the token checker cannot catch a
unit-category mistake.

---

### 2. Scrolling a list scrolls the shell, taking the rail with it — BLOCKER

**Screens** every queue with more rows than fit: `/customers`, `/back-office/kyc`,
`/config/products`, `/config/benefits`, `/inquiries`.
**URL** `http://localhost:5321/customers`, then scroll down.
**Screenshots** `scroll-customers-600.png`, `wheel-customers-end.png`.

The shell is `height: 900px; overflow: hidden` with `main { overflow: auto }`, and the table
header is correctly `position: sticky; top: 0`. But the document itself is also scrollable by
337px at 1440x900 (`documentElement.scrollHeight` 1237 vs `innerHeight` 900) even though no
element extends past 901px. A real mouse wheel over the table scrolls `main` to its limit (392)
and then chains to the window (337). The end state:

- the rail's brand mark and its first five nav items are scrolled off the top,
- the rail footer — role switcher and density toggle — floats at mid-screen,
- the sticky column headers are gone, so twenty rows of status pills have no headings,
- 380px of blank white sits below the pagination bar.

**Why it matters.** This is the first thing that happens when anyone touches the scroll wheel on
the customer list. It is also exactly the failure class that shipped before: nav chrome
disappearing on a screen where every gate was green.

**Fix.** Find and remove the 337px of phantom document scroll (start with `#root`, the toaster
mount and the `.drawers` grid track), and pin the document with `html, body { height: 100%;
overflow: hidden }` so `main` is the only scrollport. Then verify the sticky `th` actually
sticks — it currently cannot, because it is sticking to a scrollport the user is not scrolling.

---

### 3. Filter-bar controls are clipped by the bar's own bottom edge — MAJOR

**Screens** every queue at comfortable density. Worst on `/inquiries` ("All category" reads
"All categorv"), `/customers` ("All city" reads "All citv"), `/back-office/kyc` ("All kyc state"
reads "All kvc state"), `/config/agents` (six filters, both rows affected).
**Screenshots** `crop-filterbar.png` (3x), `main-1440-comf-vivek__kyc-queue.png`,
`n1024-comf-vivek__cfg-agents.png`.

`ActionBar` is 48px tall with `padding: 8px 24px`. The `Field` inside it is a label (~15px) plus
a 32px control, about 53px — so the control's bottom sits exactly on the bar's bottom edge
(measured `gapBottom: 0`), and the opaque block that follows paints over the last 8px. Every
descender in a select value is sliced off. It does not happen at compact density, where the
control is 26px.

**Why it matters.** Filter labels are the first words on every queue and they are misspelled by
the layout. A reviewer reads "All categorv" as a typo, not a clipping bug.

**Fix.** Let `ActionBar` size to its content (`min-height: 48px`, not a fixed 48px) or move the
field labels above the bar. Also reconcile the 30px search input against the 32px selects
beside it — they are two pixels out in the same row.

---

### 4. Required-field validation uses the browser's native bubble — MAJOR

**Screen** `/inquiries/new` — press "Save inquiry" with the form empty.
**Screenshot** `states-1440__state-form-error.png`.

Chrome's own orange-and-black "Please fill in this field." tooltip appears, anchored below the
Name field, covering the "Where it came from" section heading. It uses none of the product's
type, colour or radius, and it vanishes on the next click, so the person never sees which fields
are outstanding.

**Why it matters.** The product has a form engine with its own field styling; falling through to
native validation on the simplest form in the build undercuts it. It is also the only place in
the app where a non-Jagad visual language appears.

**Fix.** Prevent native validation (`noValidate` on the form) and render the error through the
existing field error slot, with a summary at the top of the form listing the outstanding fields.

---

### 5. The rail cuts a nav item in half at 768px with no affordance — MAJOR

**Screens** every screen, as admin, at 1024x768. Also at 900px in compact density, where the cut
lands on "Masters".
**Screenshots** `crop-rail-1024.png` (3x), `n1024-comf-vivek__inquiries.png`.

The rail's nav region is `overflow-y: auto` with `scrollHeight` 1336 against `clientHeight` 582.
"Tasks 99+" is sliced through the middle of its glyphs by the footer's opaque top edge. There is
no fade, no shadow, no visible scrollbar (macOS overlay scrollbars are invisible at rest), so
Money, Records and Configuration look absent rather than below the fold. Configuration is where
the whole config walkthrough starts.

**Why it matters.** This is a milder recurrence of the footer-clipping bug: navigation that
exists but cannot be seen to exist. On a 768px-tall projector or a laptop with a browser bar,
the admin appears to have no configuration section.

**Fix.** Add a scroll-shadow or gradient mask at the rail's scroll boundary, and set
`scroll-padding` / a row-height-aligned max-height so the cut never lands mid-item.

---

### 6. The lime "needs a person" tone is indistinguishable from the green "positive" tone — MAJOR

**Screens** every queue. Clearest on `/inquiries` (Unrouted vs Converted in the same column) and
`/back-office/kyc` (KYC part-filled vs KYC complete).
**Screenshots** `main-1440-comf-vivek__inquiries.png`, `main-1440-comf-vivek__kyc-queue.png`.

Measured, at 18px tall and 11px type:

| tone | pill background | pill text |
| --- | --- | --- |
| `attn` (lime, "needs a person") | `rgb(238, 245, 218)` | `rgb(14, 74, 42)` — deep green |
| `ok` (green, "positive") | `rgb(228, 239, 232)` | `rgb(20, 104, 59)` — green |

Two near-identical pale greens carrying green text. Only the 8px status dot differs, and it is
too small to register in a scan. The tone map in `src/features/inquiries/inquiry-view.ts:28` is
correct; the rendering of it is not.

**Why it matters.** "Something needs a person" is the single most important signal in a work
queue, and it is the one the palette was explicitly designed to separate from "fine". Right now
lime is decorating, not carrying meaning.

**Fix.** Give the `attn` pill lime as its *text and border* colour rather than deep green, or
give it a distinctly heavier treatment (solid lime background with dark ink). Whatever is chosen,
put an `ok` pill and an `attn` pill side by side at 11px and confirm they separate at a glance.

---

### 7. Quotations and deals have no page gutter; the Assistant has an asymmetric one — MAJOR

**Screens** `/quotations/new`, `/quotations/:id`, `/deals/:id` (no gutter); `/assistant`
(asymmetric).
**Screenshots** `main-1440-comf-vivek__quotations-new.png`,
`main-1440-comf-vivek__quotation-detail.png`, `main-1440-comf-vivek__deal-detail.png`,
`main-1440-comf-vivek__assistant.png`.

Measured left inset from the edge of `main`, and right inset from its right edge:

| screen | page header | section heading | content |
| --- | --- | --- | --- |
| `/inquiries/:id` | 24 | 20 | — |
| `/customers/:id` | 24 | 20 | — |
| `/quotations/new` | 24 | **0** | full bleed |
| `/quotations/:id` | 24 | **0** | table at left 1, right 1 |
| `/deals/:id` | 24 | **0** | full bleed |
| `/assistant` | 24 | — | card at **left 16, right 128** |

On the quotation and deal screens the section headings and their underlines run flush against
the rail's border on the left and off the right edge of the window. On the Assistant the
conversation column is pushed 112px further from the right edge than the left, so the page looks
tipped over.

**Why it matters.** Four different left edges on adjacent screens is the clearest possible signal
that the modules were built by different hands and never reconciled. It reads to a client as
"unfinished", which is fair.

**Fix.** Put one page-gutter token on the shell (`main { padding-inline: var(--page-gutter) }`,
24px) and delete the per-screen insets. Centre the Assistant column or give it equal gutters.

---

### 8. The filter bar is full-bleed while the table under it is inset 25px — MAJOR

**Screens** every queue.
**Screenshot** `main-1440-comf-vivek__inquiries.png`.

The `ActionBar` sits at left 0 / right 0 of `main`; the table below it at left 25 / right 25.
The filter controls therefore start 25px to the left of the column they filter, and the bar's
background band runs wider than everything on the page. The gap between the bar's bottom and the
next block is 0px on every queue, so they touch.

**Why it matters.** The filter bar and the table are one unit conceptually and are drawn as two
misaligned ones. It is the most-repeated alignment error in the build — it appears on eleven
screens.

**Fix.** Give the ActionBar the same gutter as the table (or make both full-bleed), and put a
`--sp-3` gap between the bar and whatever follows it.

---

### 9. Plural nouns are built by appending "s" — MAJOR

**Screens** `/inquiries` header reads "13 inquirys"; filtered to nothing it reads "0 inquirys".
**Screenshots** `main-1440-comf-vivek__inquiries.png`, `states-1440__state-empty-inquiries.png`.

Related, in the same family: filter placeholders read "All kyc", "All kyc state", "All city",
"All permission template", "All sub-agent grant" — inconsistent casing against the column
headers ("KYC", "City") and singular where they should be plural.

**Why it matters.** It sits next to the page title in 13px mono on the flagship queue. It is the
kind of thing a client screenshots.

**Fix.** Add an explicit plural to the queue config (`noun: { one: 'inquiry', many: 'inquiries' }`)
rather than deriving it, and give the "All X" placeholders an explicit label rather than
lowercasing the field key.

---

### 10. The Customer 360 tab strip clips its last tab at 1024, including the active one — MAJOR

**Screen** `/customers/:id?tab=timeline` at 1024x768.
**Screenshot** `n1024-comf-vivek__cust-timeline.png`.

Seven tabs need 841px; the column is 784px. "Timeline" is cut mid-word at the viewport edge with
no scroll affordance and no overflow menu — and when it is the active tab, the underline marking
the current view is on a label you cannot read. The panel below is correct, so the screen shows
the timeline while appearing to be on "KYC and consent".

**Fix.** Make the tab strip a horizontally scrollable region with edge fades, or drop the count
badges below 1200px so the seven labels fit.

---

### 11. Record ids break across lines in narrow columns — MAJOR

**Screens** `/inquiries` at 1024 ("INQ-" / "1045"); `/config/agents` at 1024 ("AGT-" / "0007",
and "Jagad Insurance Brokers - General" over four lines).
**Screenshots** `n1024-comf-vivek__inquiries.png`, `n1024-comf-vivek__cfg-agents.png`.

A `systemNo` is an atomic identifier — someone reads it aloud on a phone call. Breaking it at the
hyphen makes it look like two values.

**Fix.** `white-space: nowrap` on `<RecordId>` and give its column a `min-width` in ch units. The
table already scrolls horizontally inside its own container, so nothing else breaks.

---

### 12. Full-width primary controls — MAJOR

**Screens** `/deals/:id` — "Begin policy entry" is a 1200px navy bar; `/quotations/new` — the
customer combobox and the "Add a customer" button are each 1200px wide.
**Screenshots** `main-1440-comf-vivek__deal-detail.png`,
`main-1440-comf-vivek__quotations-new.png`.

A 1200px navy slab is not a button, it is a banner; and a search-by-name field the width of the
whole content column invites nothing. Every other primary action in the build is a compact pill
in the top-right of the page header.

**Fix.** Size these to their content and put "Begin policy entry" in the page header where
"New quotation" and "New account" already sit, so the primary action is in the same place on
every screen.

---

### 13. The pagination row uses an unstyled native select — MAJOR

**Screens** every paginated queue (eleven screens).
**Screenshots** `main-1440-comf-vivek__quotations.png`, `states-1440__cfg-masters.png`.

The "Rows [25]" control is a raw `<select>` with the OS chrome — different border, different
background, different double-arrow glyph — sitting fifteen pixels from four instances of the
design system's own `Select` in the filter bar above it. It is the only place in the product
where an unstyled control appears.

**Fix.** Route it through the same `Select` component. Also consider hiding the prev/next arrows
and the "Page 1 of 1" line entirely when there is only one page — three disabled controls
announcing nothing is the current state on `/quotations`, `/deals` and five config screens.

---

### 14. Six columns across the build carry the same value in every row — MAJOR

**Screens and columns**

| screen | column | value in every visible row |
| --- | --- | --- |
| `/customers` | Household | "No household" |
| `/config/users` | Two-factor | "Not enrolled" |
| `/config/users` | Account | "Active" |
| `/config/products` | Documents | "Company checklist" |
| `/config/products` | Status | "Active" |
| `/config/masters` | Cascades from | "Flat list" |

**Screenshots** `main-1440-comf-vivek__customers.png`, `main-1440-comf-vivek__cfg-users.png`,
`states-1440__cfg-products.png`, `states-1440__cfg-masters.png`.

On `/config/users` that is three of seven columns; on `/config/products`, two of seven — roughly
300px of a 1200px table spent repeating one word twenty times. It also makes the fixture data
look thinner than it is, and "Cascades from: Flat list" does not parse as a header-value pair.

**Fix.** This is partly a fixture problem and partly a column-choice problem. Either seed
variation into the fixtures (some households, one enrolled 2FA account, one inactive product) or
drop the column and surface the value in the row detail. A demo dataset where every row is
identical in three columns is worse than fewer columns.

---

### 15. The drawer's resize handle is the loudest thing on the screen — MAJOR

**Screen** any screen with Cmd-K pressed.
**Screenshot** `states-1440__state-drawer.png`.

A full-height bright lime bar runs down x=1000. Lime means "needs a person" everywhere else in
this product, so a drag handle is wearing the alarm colour, and it out-shouts the four breached
inquiries in the panel beside it. The table underneath is hard-clipped mid-word ("cl", "TA") with
no shadow or fade to say it continues.

**Fix.** Make the handle a 1px hairline that thickens to a neutral grey on hover and only takes
the focus-ring lime when keyboard-focused. Add a scroll shadow on the drawer's left edge.

---

### 16. Money is left-aligned in table cells — MAJOR

**Screens** `/quotations` (Accepted premium), `/quotations/:id` (Final Payable Premium across
comparison columns).
**Screenshot** `main-1440-comf-vivek__quotation-detail.png`.

`text-align: start`. The whole point of tabular figures — which the build correctly applies — is
that decimal points align, and left-aligning throws that away. On the quotation comparison,
`4,838.00` and `13,806.00` are the two numbers the customer is being asked to choose between and
they do not line up.

**Fix.** `text-align: right` on money columns and money cells in the comparison matrix.

---

### 17. Detail screens end halfway down the viewport — MAJOR

**Screens** `/inquiries/:id` (content ends at y=613 of 900), `/deals/:id` (633), `/quotations`
(454), `/deals` (410), `/config/agents` (410).
**Screenshots** `main-1440-comf-vivek__inquiry-detail.png`,
`main-1440-comf-vivek__deal-detail.png`, `main-1440-comf-vivek__quotations.png`,
`kiran3___deals.png`.

On the demo laptop the bottom third to half of these screens is blank white. `/deals` as Kiran
is two rows of table and then 530px of nothing. The empty space is not composed — it is left
over.

**Why it matters.** Next to `/customers` and `/back-office/kyc`, which fill the screen, these
read as unfinished rather than as spacious.

**Fix.** Either give the two-column detail screens a full-height layout (the record panel running
to the bottom edge), or add the next thing the person needs — recent activity, the related
records — rather than leaving the fold empty. At minimum, put a footer rule where content ends so
the emptiness looks intentional.

---

### 18. `/consent/:token` takes about 56 seconds to render — MAJOR (needs re-measuring on a production build)

**URL** `/consent/cns-8f31c6d2a47b9e05f1a2`.
**Screenshots** `states-1440__consent.png` (the state it holds for a minute),
`consent-ready-1440.png` (what eventually appears).

Timed twice on a warm dev server: 56.4s and 55.5s to first content. The page shows "Opening your
form." for the whole of it, with no progress, no skeleton of the form to come, and no timeout. I
sampled the DOM every 500ms for 20 seconds and it never changed.

The mock adapter's `DEFAULT_LATENCY` is 150-400ms per repository call, so this implies roughly
150-200 sequential awaits behind `loadKycChecklist` plus the master-value fan-out. Tests never
see it because they inject `NO_LATENCY`.

**Why it matters.** This is the only customer-facing screen in the build, and it is the one you
would show a client on a phone. A minute of a bare loading line is indistinguishable from a
broken link.

**Caveat.** I measured on the dev server. The sequential-await count is a product property, not
a Vite property, so I expect it to reproduce in a production build at a smaller multiple — but I
did not verify that, and it should be re-measured before it is treated as a fix priority.

**Fix.** Find the sequential loop in `loadKycChecklist` and parallelise it, and in the meantime
render the form's shell with skeleton fields instead of a single line of text.

---

### 19. Row heights are inconsistent between queues at the same density — MINOR

Measured at compact: `/inquiries` 30px, `/config/*` 30px, `/customers` 37px (the two-line
name-plus-mobile cell forces it), `/quotations/:id` comparison rows 43px. Compact promises the
ops team more rows on screen and delivers 23% fewer on the customer list than on the inquiry
list.

**Fix.** Either put the mobile number on one line with the name, or accept a two-line row as its
own density variant and make it deliberate.

---

### 20. The role switcher truncates without an ellipsis and repeats itself — MINOR

**Screenshot** `crop-rail-1024.png`.

The select shows "Vivek Jagad — Admin. whole", cut mid-word with no ellipsis, and the line
directly beneath it reads "Admin, whole business" — the same information, in full. At compact
density it becomes "Vivek Jagad — Admin, whole busi".

**Fix.** Put only the name in the select and leave the role to the line below, which already has
room for it.

---

### 21. Status colour is decorating, not signalling, in three places — MINOR

- `/config/masters`, USE column: "Use is not counted" is an amber (warning) pill. It is a neutral
  fact about a master list, not a warning. The pill text also repeats the column header.
- `/config/agents`: "Sub-agent of Kiran Solanki" is a blue (info) pill — a relationship label
  wearing a status pill's clothes.
- `/back-office/kyc`: "KYC part-filled" is a lime pill and "KYC complete" a green one, which is
  correct in intent but unreadable in practice (see defect 6).

**Fix.** Reserve pills for states that change; render facts and relationships as plain text.

---

### 22. Two adjacent time columns use two typefaces — MINOR

**Screen** `/inquiries`. "TAT remaining" is IBM Plex Mono with tabular figures; "Age", the very
next column, is IBM Plex Sans with proportional figures. Both are elapsed times.

**Fix.** Mono for both, per the charter.

---

### 23. Density and account do not survive a refresh — MINOR

`useSessionStore` has no persistence, so a browser reload drops back to Vivek Jagad at
comfortable density. Ops staff who choose compact once will lose it every morning, and a
demo that refreshes mid-walkthrough silently changes who is signed in.

**Fix.** Persist both to `localStorage`.

---

### 24. Icon choices that contradict their message — POLISH

- The 404 page (`states-1440__notfound.png`) uses a **padlock**. "No screen answers to that
  address" is not a permissions failure; a padlock says it is.
- The empty-queue state (`states-1440__state-empty-inquiries.png`) uses a **grid** icon, which
  says nothing about an empty result.
- `/inquiries/inq-1025`'s assignment trail uses navy, amber and green circular event badges;
  navy is the action colour everywhere else.

---

### 25. `/config/users` puts a navy filled tab next to a navy filled button — POLISH

**Screenshot** `main-1440-comf-vivek__cfg-users.png`.

"People" (active sub-nav tab, navy fill) sits 130px from "New account" (primary action, navy
fill). Two navy solids of different shapes on one line; the tab reads as a second primary action.
This sub-nav pattern also appears on no other config screen, so `/config/users` looks structurally
different from its six neighbours.

**Fix.** Make the active sub-nav tab an underline or a soft navy tint, not a solid.

---

### 26. Small alignment and finish items — POLISH

- `/customers/:id`, Contact block: the Aadhaar row is three lines tall ("Last four", the masked
  value, and "The last four digits are the whole record.") while the PAN row opposite it is two,
  so the two columns fall out of step for the rest of the block.
  (`main-1440-comf-vivek__cust-household.png`)
- `/consent/:token`: the step heading "Identity" carries a visible lime focus ring after a step
  change — programmatic focus on a non-interactive heading. (`consent-ready-1440.png`)
- `/consent/:token`: date of birth is a native `<input type="date">` with the browser's own
  dd/mm/yyyy chrome and calendar glyph — a third control style on a page that otherwise holds
  the product's.
- `/quotations/new`: the "Line" select floats to the right of the "Policies to compare" heading,
  above the section rule, aligned to nothing.
  (`main-1440-comf-vivek__quotations-new.png`)
- `/assistant`: a stray small grey box sits inside the proactive notice card below the text.
  (`assistant-scroll-1400.png`)

---

## What is genuinely good

I went looking for problems, and these held up:

- **Numeric typography.** Money, record ids and TAT clocks are all IBM Plex Mono with
  `font-variant-numeric: tabular-nums`, verified in the computed styles. Columns of ids scan
  cleanly, which is most of what a work queue is for. Very few builds at this stage get this
  right.
- **The empty state.** "No inquiry matches these filters / The queue is not empty — this view is
  narrowed" plus a "Show everything" button is better written and better composed than most
  finished products manage. `states-1440__state-empty-inquiries.png`.
- **The 404 and the planned-screen stub.** Both are honest, calm and well-centred. The stub
  naming the playbook step that will build the screen is a genuinely good idea, well executed.
  `states-1440__notfound.png`, `states-1440__planned-stub.png`.
- **The Customer 360 header.** Name, record id, three status pills and a one-line summary
  ("3 live policies · on the books since 2024"). It is the best page header in the product and
  the pattern the detail screens should standardise on.
  `main-1440-comf-vivek__cust-household.png`.
- **The config family.** All seven config screens are consistent with each other in structure,
  spacing and tone. `/config/products` and `/config/benefits` in particular look finished.
- **Compact density actually works.** 40px rows become 30px, the rail reveals two more sections,
  and — a nice accident — the filter-bar clipping of defect 3 disappears.
  `compact2-1440-vivek__inquiries.png`.
- **The rail reshapes convincingly per role.** Kiran's "My book / Money / Reference" grouping
  with his own counts is a persuasive demonstration that the nav is rendered by `can()`.
  `kiran3__landing.png`.
- **Tables scroll horizontally inside their own container.** At 1024 the document width stays
  1024 on every screen; nothing breaks the page. The affordance is missing (defect 15's cousin)
  but the containment is right.
- **The consent form itself.** Once it loads, it is well made: a four-step progress strip,
  "Aadhaar last 4" with the reassurance line underneath, a "Still to record (6)" panel, an
  explicit "no password, no OTP, never the full Aadhaar" notice. `consent-ready-1440.png`.
- **Aadhaar handling.** Last-four only, everywhere I looked — customer 360, household members,
  the consent form. The invariant holds visually.
- **No console errors** on any of the 26 screens, in any role or density.

---

## What I could not review, and why

- **Routes not in `BUILT_SCREENS`** render a stub: `/policies`, `/policies/new`, `/policies/:id`,
  `/back-office`, `/back-office/drafts`, `/commission`, `/tasks`, `/documents`, `/reports`,
  `/renewals/*`, `/claims/*`, `/endorsements/*`. Nothing to judge yet.
- **`/login`, `/login/2fa` and the whole `/portal/*` shell** are not built.
- **`/upload/:token`** is not built, so the tokenised-page pair could only be judged from the
  consent half.
- **`/quotations/:id/v/:version`** renders the same composer as `/quotations/:id`, so it was not
  reviewed separately.
- **The generated-document surface.** Source Serif 4 is loaded but used by nothing — no screen
  renders a document yet, so the third typeface in the design system is untested in place.
- **Interaction states.** Hover, active, focus-visible and drag states were not systematically
  captured; this was a static-composition review. The one focus state I did see by accident
  (defect 26, the consent step heading) was wrong, which suggests a focus pass is worth doing.
- **Dark theme.** The token file is structured for one (`[data-theme='dark']` re-points only the
  semantic layer) but no dark block exists, so there is nothing to review.
- **Five of the eight accounts.** I reviewed Vivek Jagad (admin) and Kiran Solanki (agent) in
  full. Nikunj Shah, Priya Desai, Amit Rana, Sneha Patel, Nita Shah and Meera Joshi were only
  checked to the extent that their rails render.
- **Real device rendering.** Everything here is Chrome on macOS at `deviceScaleFactor` 1 and 3.
  No Safari, no Windows, no actual projector.
- **Defect 18's severity.** Measured on the dev server only. The cause looks like a product-level
  sequential fetch rather than a build-tool artifact, but that needs confirming against
  `npm run build` output before anyone budgets time for it.
