# Adopting the PHP tracker's missing pieces

Plan for porting capabilities from the live PHP tracker at `192.168.100.210`
(DMW Regional Office XIII / Caraga) into this system.

**Ground rule: data model and capabilities only, never their design.** Their UI
(blue government header, yellow role badges, red/green pill buttons, separate
nav item per ledger) stays where it is. Everything below lands inside our
existing layout, components, and the four-module pattern described in
`CLAUDE.md`. If a phase seems to want a new nav item or a new page shape, that
is a signal to reconsider the phase, not to add the item.

Source screenshots: `mwpsd_tracker/`.

## What they have and we don't

| Their feature | Our state | Phase |
| --- | --- | --- |
| Print + Download PDF on every ledger and the calendar | nothing — no print stylesheet, no PDF path | 1 |
| Create account, enable/disable account | seed script only; no in-app user creation | 2 |
| Account status ACTIVE / DISABLED | none — deleting a `User` breaks FKs | 2 |
| Email address on an account | `User` has no email field at all | 2 |
| Received By (desk officer) + time of receipt | `dateReceived` is a date only | 3 |
| Incoming split Internal vs External | one undifferentiated `IncomingDocument` | 3 |
| Structured Doc Type, Agency, Signatory (filterable) | free-text `documentTitle` only | 3 |
| Remarks and Notes as separate fields | both collapsed into `progressRemarks` | 3 |
| **Incoming document ↔ activity link (many-to-many)** | no relation between the two modules | 3 |
| Activity categories with a colour legend (9 types) | `activityName` free text, no type | 4 |
| Activity location | no `location` field | 4 |
| Division on user / office code on records | `officeId` only, no sub-unit | 4 |
| 145 external + 285 outgoing + 3 internal live records | empty | 5 |

What we have that they don't — **do not regress any of this while porting**:
ARTA due dates and complexity, Division Chief sign-off, four roles instead of
two, the `relatedIncomingId` link between ledgers, the audit trail, MinIO
presigned file access, office scoping on every query.

## Open question that gates Phase 5

Is this a **replacement** for the PHP tracker (their records get migrated in)
or a **parallel** system (both keep running)?

- Replacement → their outgoing numbering `PSD-2026-07-367` has to be reconciled
  with ours, and we need their MySQL schema/dump, not screenshots.
- Parallel → numbering is irrelevant, Phase 5 is dropped entirely.

Phases 1–4 are unaffected either way, so this does not block starting.

---

## Phase 1 — Print and PDF export ✅ built

The biggest real gap. A records office that submits hard copies currently
cannot get one out of this system at all.

### What shipped

New: `src/components/PrintLink.tsx` (+ `printHref` / `listHref`),
`PrintToolbar.tsx`, `PrintHeader.tsx`, a `PrinterIcon`, and a `@media print`
block in `globals.css`. Touched: all five list pages, `ActivityCalendar.tsx`,
`Sidebar.tsx`, `Topbar.tsx`.

Flow: **Print** on a ledger links to the same URL with `print=1`, which re-runs
the query without pagination and opens the browser's print dialog on arrival.
"Back to list" returns to the same filters. Both directions build their URLs
through the shared helpers so a filter can't be dropped on the way.

### Two things worth remembering

**`dark:` beats `print:` on specificity.** Tailwind compiles `dark:bg-ink-800`
to a descendant selector (`.dark .dark\:bg-ink-800`, specificity 0-2-0) but
`print:bg-white` to a plain class (0-1-0), so a `print:` colour utility loses
and the printed page comes out in the dark theme. Anything colour-related in
print must be an `!important` rule in the `globals.css` print block, not a
`print:` utility. `print:hidden` is safe (nothing sets `display` under `dark:`),
which is why the chrome-hiding still uses it. Watch for this in Phase 4 when the
activity category colours land.

**`PRINT_MAX = 2000` per ledger.** The print view drops pagination by design, so
without a ceiling an unfiltered print is an unbounded query and a print job
nobody meant to send. `PrintHeader` prints a "narrow the filter" line when the
cap bites, rather than truncating silently.

### Not verified

The build, type-check, and compiled CSS are confirmed. **The printed output
itself has not been looked at** — there's no browser automation here, and print
rendering is exactly the kind of thing that needs eyes on it. Check on real
hardware: page breaks mid-ledger, repeated column headers on sheet 2+, landscape
fit for the widest table (Incoming, 7 columns on paper), and one print taken
from dark mode.

**Original scope**
- A shared `PrintButton` client component (`window.print()`), placed in the
  header row that every list page already has next to the "New" button.
- A `@media print` block in `globals.css`: hide sidebar, topbar, search form,
  pagination, and row action links; force the table to full width; add a
  print-only header with office name, ledger name, filter description, and
  generated-on date.
- Print respects the **current filter**, not just the current page — the list
  pages take `searchParams`, so a `?print=1` variant that skips pagination
  (`take` removed) is enough. No client-side data fetching.
- Same treatment for the activities calendar.

**Files** — new `src/components/PrintButton.tsx`; edits to `globals.css` and the
five list pages (`incoming`, `outgoing`, `internal`, `leave`, `activities`).

**Schema** — none.

**Deliberately not doing** — a real PDF library (`jspdf`/`puppeteer`). Browser
"Print → Save as PDF" produces the same artifact for a table, adds no
dependency, and can't drift from what's on screen. Revisit only if they need a
specific letterhead template we can't get from CSS.

**Done when** — any ledger, filtered, prints to one clean paginated document
with no UI chrome and a legible header.

## Phase 2 — User management ✅ built

### What shipped

Migration `20260731063835_add_user_email_and_is_active` (`User.email String?`,
`User.isActive Boolean @default(true)`). New: `src/lib/session.ts`,
`src/lib/passwordPolicy.ts`, `src/lib/roleLabels.ts`, `POST /api/users`,
`PATCH /api/users/[id]`, and `CreateAccountForm` + `ManageAccountsTable` in
Settings. `canManageUsers` / `MANAGER_ROLES` added to `authz.ts`.

No `DELETE /api/users` — deactivation is the supported way to remove access.
This was confirmed the hard way while cleaning up test accounts: deleting a
`User` fails on `AuditLog_userId_fkey`. The FKs make deletion impossible without
destroying history, which is exactly why `isActive` exists.

### The JWT-staleness bug this phase uncovered

Enforcing "deactivated" only at sign-in and in the dashboard layout was not
enough, and testing found two live holes:

- a **deactivated** account kept writing through `/api/*` — API routes never
  pass through a layout, so nothing re-checked it;
- a user **demoted** from `DIVISION_CHIEF` to `STAFF` still created accounts
  successfully (`201 Created`), because `session.user.role` comes from the JWT
  and the token still said `DIVISION_CHIEF`.

Root cause: the session token is a snapshot from sign-in and NextAuth keeps
issuing it for 30 days, so it outlives the facts it asserts. Fixed with
`getActiveSession()` in `src/lib/session.ts`, which re-reads `role`, `officeId`
and `isActive` from the database and returns `null` for a deactivated user —
so every route's existing `if (!session) return 401` now also ends access on
deactivation. Rolled out across all 21 API route files; the Settings page reads
its role from the database for the same reason. Costs one indexed lookup per
authenticated request.

**Rule for later phases: never trust `role`, `officeId`, or `isActive` off the
session token in an API route. Use `getActiveSession()`.**

### Verified

23/23 on a scripted run against the dev server: password policy (all three
rules), Chief-cannot-create-ADMIN, duplicate username → 409, malformed email →
400, self-deactivation and self-demotion blocked, deactivate → sign-in refused
→ reactivate → sign-in restored, plain staff refused on both routes. Plus two
targeted probes: a live session is evicted to `/login?disabled=1` mid-session,
and the deactivated/demoted API holes are now 401/403. Dev database was restored
to its original 9 accounts afterwards.

Not verified: the Settings UI has not been clicked through in a browser.

### Note for the office

The password rule is now enforced where passwords are *set* (create / reset /
change), not at sign-in — existing accounts keep working. But the seeded
default `changeme123` no longer satisfies it (no symbol), so it can't be reused
when resetting someone's password.

**Original scope**
- `isActive Boolean @default(true)` on `User`. Deactivation instead of
  deletion, because `Leave`, `AuditLog`, `IncomingRoutedStaff`, and
  `ActivityAssignee` all hold FKs to `User`.
- `email String?` on `User` — their Create Account form requires one and their
  whole account list is keyed on it; we have no email field at all. Nullable so
  the existing seeded roster stays valid. Note there is still **no SMTP in this
  system** — this is an identifier and a contact detail, not a notification
  channel.
- Password rule: theirs is "8+ characters, with letters, numbers, and symbols".
  Ours currently enforces only `min(8)` (see `/api/account/reset-password`).
  Match their stricter rule in one shared validator used by create, reset, and
  change-password.
- Login rejects inactive accounts — in the credentials provider in
  `src/lib/auth.ts`, so an existing JWT can't outlive deactivation. Check
  session validity on the dashboard layout too.
- Admin/Chief user list in Settings (extends the existing page, no new nav
  item): create account, deactivate/reactivate, change role, alongside the
  reset-password form already there.
- New `canManageUsers(role)` in `src/lib/authz.ts`. A Chief must not be able to
  create or deactivate an `ADMIN` — mirror the existing rule in
  `/api/account/reset-password`, enforced in the route, not just hidden in UI.
- `logAudit()` on every create/deactivate/role change.

**Files** — `prisma/schema.prisma`, migration `add_user_is_active`;
`src/lib/auth.ts`, `src/lib/authz.ts`; new `src/app/api/users/route.ts` and
`[id]/route.ts`; `src/app/(dashboard)/settings/page.tsx` + a new form component.

**Risks** — an admin deactivating their own account, or the last active admin
in an office, locks people out. Block both in the route.

**Done when** — an admin can create a working account and deactivate one, the
deactivated user is refused at login, and their historical records stay intact
and visible.

## Phase 3 — Incoming document fields ✅ built

### What shipped

Migration `20260731073804_add_incoming_intake_fields` — all additive: the
`DocumentOrigin` enum, seven nullable/defaulted columns on `IncomingDocument`
(`timeReceived`, `receivedById`, `origin`, `originAgency`, `signatory`,
`documentType`, `notes`), and the `IncomingDocumentActivity` join table. New
`src/lib/incomingFormData.ts`. Touched: both incoming API routes, `IncomingForm`,
the list/new/edit pages, `documentTypeCodes.ts` (added `MO`, `MOM`).

`documentType` was previously accepted by the create route, used to build the
routing number, and then discarded — the ledger could not answer "show me every
advisory" without parsing numbers back apart. It is now stored as well.

**Filters:** search (now covering agency and signatory as well as number and
subject), source, type, agency, signatory, status — plus Clear. Agency/type/
signatory options are derived with `distinct` over existing rows, office-wide
rather than narrowed by the current filter, so picking one value doesn't empty
the others.

**Columns:** added Source and Type only. Agency appears as a subtitle under the
subject; received-by, signatory and notes live on the record and in the filters.
A ledger past ~10 columns stops being readable on screen and stops fitting a
printed sheet, and Incoming is already the widest table.

### Verified

30 checks across two scripted runs against the dev server: time-format
rejection, office-scoping on `receivedById` and `activityIds` (both 400 on a
foreign id), every intake field round-tripping, `MO` routing numbers, join rows
written/replaced/cleared at the database level, the reverse relation from
Activity, deleting a document that has activity links, and each filter actually
narrowing — including that they combine as AND and that origin partitions the
ledger exactly (10 + 1 = 11).

Two of my own test assertions were wrong before they were right, both worth
noting: one "two activities linked" check was vacuous (always true) and was
replaced with a real database query; and the filter checks first failed on the
scraper, not the feature — React SSR renders `({total} total)` as
`(<!-- -->11<!-- --> total)`, so the regex needed comment markers stripped.

Not verified: the form has not been clicked through in a browser.

### Deferred deliberately

`timeReceived` is captured but does **not** feed `artaLeadTime.ts`. The cutoff
rule (does 4:50 PM Friday count as Friday or Monday?) is office policy, and the
Division Chief hasn't answered. The code comments say so at both call sites.

### Original notes

All of this is additive to `IncomingDocument`; nothing existing is renamed or
dropped.

**Schema**
```
enum DocumentOrigin { INTERNAL, EXTERNAL }

// on IncomingDocument
origin          DocumentOrigin @default(EXTERNAL)
timeReceived    String?     // "16:50" — clock time; dateReceived stays the date
receivedById    String?     // desk officer who accepted it (FK to User)
originAgency    String?     // "DMW - Ortigas", sender email, etc.
signatory       String?     // person who signed the document
documentType    String?     // MEMORANDUM, ADVISORY, E-MAIL, MEMORANDUM ORDER…
notes           String?     // filing state, separate from progressRemarks
```

**Design constraint (decided)** — their system splits Internal and External into
two nav items and two near-identical pages. We take the distinction as a
**column plus a filter dropdown** on the one incoming page. Same information, no
new route, no duplicated page. (Note the naming trap for later: our existing
`/internal` route is *outgoing* internal memos — a different concept from their
"Incoming Internal".)

**Link to activities (new — from the entry form screenshot)** — their entry form
ends with *"Link to Tentative Activity(s) (optional, can select more than one)"*,
a type-ahead searching by name, activity, or location. Incoming documents are
many-to-many with activities: an advisory about a job fair links to the job fair.
We have no relation between these modules at all. This is the same kind of
cross-ledger link as our existing `OutgoingDocument.relatedIncomingId`, so it
fits the architecture — it just needs a join table:

```
model IncomingDocumentActivity {
  incomingId String
  incoming   IncomingDocument @relation(fields: [incomingId], references: [id])
  activityId String
  activity   Activity         @relation(fields: [activityId], references: [id])
  @@id([incomingId, activityId])
}
```

Follows the shape of `IncomingRoutedStaff` and `ActivityAssignee` exactly. The
picker is a multi-select on `IncomingForm`, and the linked activities show on
the activity detail page in reverse.

**Dropdowns** — confirmed correct approach: on their *entry* form, Type of
Document, Office/Agency, and Signatories are all **plain free-text inputs** —
the dropdowns on their list view are derived from whatever has been typed
before. So we do the same: `findMany({ distinct: [...] })` over existing rows
for the filter options, free text on entry. No reference tables, nothing to
seed or maintain.

**Control No. is manually typed, not generated** — their form has Control No. as
a free-text box, and their internal ledger contains rows with the literal value
`NA` and a different format (`MOM-06-2026`) from the external ledger
(`073026-M-021`). We auto-generate `routingNumber` from `Office.incomingSeqCounter`
and enforce `@unique`. **Keep ours generated** — it is the better system and
abandoning it would lose collision safety. This only becomes a problem at
migration (Phase 5), where their hand-typed and duplicate/`NA` values will not
satisfy our unique constraint.

**Doc types seen in their data** — Memorandum (`M`), Memorandum Order (`MO`),
E-mail (`E`), Advisory (`A`), Minutes of Meeting (`MOM`), Broucher [sic].
`MO` and `MOM` are not in our `documentTypeCodes.ts` yet.

**ARTA interaction (decided, with one external dependency)** — `timeReceived`
should eventually feed `artaLeadTime.ts`, but the cutoff rule is office policy,
not an engineering call: does a 4:50 PM Friday arrival count as Friday or
Monday? **Phase 3 stores the time and leaves the calculation on `dateReceived`
exactly as it is today.** Wiring it in is a later, separate change, blocked on
the Division Chief answering the cutoff question. Do not guess a rule.

**Files** — schema + migration `add_incoming_intake_fields`; `IncomingForm.tsx`,
`incoming/page.tsx`, `incoming/[id]/page.tsx`, both incoming API routes,
`src/lib/documentTypeCodes.ts`.

**Done when** — a records clerk can log everything their PHP form captures, and
filter the ledger the same five ways.

## Phase 4 — Activity categories and division

**Activity categories** — their nine are real office vocabulary worth taking
verbatim: Job Fair, Conference/Training, Skeleton Force, Meetings, Public
Holiday, On Leave, PEOS, Quick-Response Team, Others. Add as an
`ActivityCategory` enum, render as coloured chips in the existing
`ActivityCalendar.tsx` with a legend above the grid.

Colour choice is ours, not theirs — nine categories need a qualitative palette
that survives dark mode and does not collide with the existing red/amber/green
ARTA status semantics. Pick these deliberately; do not reuse their hues.

**The On Leave overlap (decided)** — "On Leave" is a calendar category for them
and a whole module for us. `Leave` records **project** onto the activity
calendar as read-only entries, derived from the `Leave` table at render time.
They are never typed twice and never created from the calendar; the `Leave`
module stays the only place a leave is entered or edited. Consequence: "On
Leave" is a rendered category, not a value staff can pick from the
`ActivityCategory` dropdown when adding an activity.

**Tentative vs confirmed — resolved, add nothing.** The Add Activity modal has
no status toggle: its fields are Legend, Name, Activity, Location, Start Date,
End Date. "Tentative" is a label on the whole module, not a per-record state.
No field needed.

**Location — new field.** Their modal has Location ("e.g. Butuan City Hall") and
their activity type-ahead searches by it. `Activity` needs `location String?`.

**Their "Name" is free text, ours is a relation — keep ours.** Their modal takes
a typed person name ("e.g. Juan Dela Cruz"); we have the `ActivityAssignee` join
to real `User` rows, which is strictly better and already enforces "at least one
person incharge" in `ActivityForm.tsx`. Do not regress this to free text.

**Why that Name field exists: their system has no Leave module.** Confirmed with
the office. The tan chips on their calendar ("MR. E…", "MS. V…", "MS. M…") are
*leave*, matching the tan On Leave dot in the legend — leave is filed through Add
Activity with Legend = "On Leave" and Name = the person who is out. There is no
Leave item in their nav at all; it is one of nine activity categories.

This settles two things:

1. **It validates the projection decision.** We have a real `Leave` model with
   type, start/end, filed date, and scanned copy — far richer than a calendar
   chip. Leave stays owned by the `Leave` module and is *rendered* onto the
   calendar; "On Leave" must not be selectable in the `ActivityCategory`
   dropdown, or we would have two sources of truth for the same fact.
2. **The chip label rule is determined, not an open question** — it was a false
   dichotomy. Leave chips are labelled with the person's name (from
   `Leave.personnel.name`); activity chips are labelled with the activity name.
   Different categories, different labels. Nothing to ask the office.

**Related observation, not a phase.** Their outgoing ledger also carries leave —
`PSD-2026-07-364`, "APPLICATION FOR LEAVE OF MS. VILLARINO…" — so a single leave
exists as an outgoing document *and* a calendar entry, kept in sync by hand. If
that double-entry annoys the office, a nullable `Leave.relatedOutgoingId` (same
shape as `OutgoingDocument.relatedIncomingId`) would link the transmittal to the
record. Do not build it speculatively; wait until someone asks.

**"Legend" is their name for the category field** — a single-select dropdown, one
category per activity. Our `ActivityCategory` enum matches one-for-one.

**Division — bigger than it looked.** Their user table shows a Division column
unpopulated on every row, so it read as a dead label. The Create Account form
says otherwise: *"DIVISION — Determines which Incoming / Outgoing pages this
account can access."* Division is an **access-control dimension** in their
design, not a tag. They built it and never populated it, but the intent is
exactly the multi-division rollout already on the roadmap.

That makes this an architecture decision, not a field add, and it interacts with
our existing `officeId` scoping: is a division a *sub-unit within* an office
(`Division` model under `Office`, records carry `divisionId`), or is each
division simply its own `Office` row? The second needs no new model and works
today; the first is right if divisions must share an office-level view. Decide
this with the office before building, and keep it out of Phases 1–3 so those
don't get blocked on it.

## Phase 5 — Data migration (only if replacing)

Gated on the open question above. Needs their MySQL dump or schema, not
screenshots.

- Map their control numbers: incoming `073026-M-021` already matches our
  `MMDDYY-[Type]-[seq]`; outgoing `PSD-2026-07-367` does not match our
  `MMDDYY-MWPTD-...`. Decide whether to convert or to preserve legacy numbers
  verbatim on imported rows (preserving is safer — those numbers are cited in
  physical files).
- Their `Office.incomingSeqCounter` / `outgoingSeqCounter` must be advanced
  past the highest imported number or the next new record collides on the
  unique `routingNumber`.
- They have no ARTA data, so imported incoming rows need `complexity` and
  `dueDate` backfilled or explicitly left null. Do not fabricate a due date on
  a historical record.
- Their user rows show "N/A" personnel info, and the Create Account screenshot
  explains why: **their form has no full-name field at all** — only username and
  email. Our `User.name` is required, so names have to be collected from the
  office by hand; they do not exist in their database to migrate.
- Their Control No. is hand-typed and not unique — the internal ledger has a row
  with the literal value `NA`, and internal/external use different formats. Our
  `routingNumber` is `@unique`. Imported rows need either generated numbers with
  the legacy value preserved in a separate `legacyControlNo` column
  (recommended — the old numbers are cited in physical files) or a dedup pass.
- Import via a script under `prisma/`, run once, inside a transaction, with a
  fresh backup taken first (`scripts/update.sh` handles backups).

---

## Order and rationale

1 → 2 → 3 → 4 → 5. Phase 1 is self-contained and delivers the most immediately
missed capability. Phase 2 is a prerequisite for real multi-user rollout and
touches auth, so it wants to be early and settled. Phase 3 is the largest and
benefits from Phases 1–2 being stable. Phase 4 contains two decisions worth
making with the office in the room. Phase 5 may not exist at all.

Each phase is one migration and one branch. Local schema changes must be applied
to **both** databases — see the migration warning in `CLAUDE.md`.
