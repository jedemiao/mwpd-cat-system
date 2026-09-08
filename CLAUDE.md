# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Next.js/Prisma replacement for the MWPD (Migrant Workers Protection Division) Excel tracker: Incoming correspondence, Outgoing dispatches, Monthly Activity logs, and Leave records, with ARTA (Anti-Red Tape Act) due-date compliance and role-based access. Built to run on an on-premise office server via Docker Compose, with the schema already shaped to onboard additional offices later without a rewrite (see "Multi-tenancy" below).

## Commands

```bash
npm install                              # install dependencies
npm run dev                              # start dev server (localhost:3000)
npm run build && npm run start           # production build / run
npx prisma migrate dev --name <name>     # apply a schema change (edit prisma/schema.prisma first)
npm run prisma:studio                    # browse the database
npm run prisma:seed                      # seed one office + the staff roster (prisma/seed.ts)
npm run seed-temp                        # fill a DEV database with throwaway records in every register
npm run seed-temp -- --undo              # remove exactly what that seeded (prisma/.temp-seed-manifest.json)
docker compose up -d db minio            # start just the local dev dependencies (Postgres + MinIO)
docker compose up -d --build             # full stack: db, minio, app, nginx (documented deploy path)
```

There is no test suite and no ESLint config in this repo yet (`next lint` will prompt to create one on first run) — don't assume either exists.

The Postgres container's host port is remapped to **5433** (not 5432) in `docker-compose.yml`, to avoid clashing with a native Postgres install some dev machines already have running. `DATABASE_URL` in `.env` must match.

### Updating the deployment

`./scripts/update.sh` is the one command to update the running stack. Get the new code in first (`git pull` or your edits), then run it — it backs up, applies migrations to the prod DB, and rebuilds the app, in that order:

```bash
BACKUP_PASSPHRASE=... ./scripts/update.sh    # or BACKUP_PASSPHRASE_FILE=...
SKIP_BACKUP=1 ./scripts/update.sh            # only if you just ran a backup
```

### Backups

Backups run **inside the stack**, as the `backup` service — a container that
sleeps until `BACKUP_AT` (default 12:00, container timezone) and writes an
encrypted dump of Postgres and the MinIO volume to `./backups`.

```bash
docker compose logs backup            # when it last ran, when it runs next
docker compose run --rm --entrypoint /usr/local/bin/run-backup.sh backup   # one now
```

This replaced a Windows Task Scheduler job (now disabled, not deleted) that ran
`scripts/backup.sh`. That job failed two ways: it was killed part-way through
every run — exit `0xC000013A`, with a literal `^C` in its output, because the
Docker CLI receives a spurious console control event in a scheduled session —
and it only ran at all while somebody was signed in to Windows. The container
shells out to docker for nothing: it reaches Postgres over `db-net` and mounts
the MinIO volume read-only.

`scripts/backup.sh` still works and is still what `update.sh` calls; it is the
way to take a backup by hand. Both it and the container now **delete** an
undersized artifact and fail loudly, because the original bug left 15-byte
`.gpg` files sitting in `./backups` looking like real backups for days.

The passphrase is mounted from `secrets/backup-passphrase` (gitignored) rather
than passed as an environment variable, so it stays out of `docker inspect`.
Backups still land on the same disk as the data — offsite copies and retention
(`BACKUP_KEEP_DAYS`, off by default) are still open questions.

Three things make an update safe here, and they're easy to get wrong by hand — which is why they live in the script:
- **Data survives rebuilds.** Postgres and MinIO data are in named volumes (`db_data`, `minio_data`); `up -d --build`, `restart`, and plain `down` never touch them. The **one** command that wipes them is `docker compose down -v` — never run it against the deployment. The script never does.
- **Migrations do NOT run on container startup** (the app just runs `node server.js`). A schema change that ships without `prisma migrate deploy` crashes the app with "column ... does not exist". `update.sh` always runs `migrate deploy` (a no-op when nothing's pending), so you never have to decide whether the schema changed.
- **Prod migrations use `.env` → port 5433 → the db container**, not `.env.local` → port 5432 (that's the local `npm run dev` database). `prisma migrate deploy` on the host targets the right one via `.env`; `update.sh` relies on this. A bare `prisma migrate dev` also loads `.env`, so it hits prod too — use `migrate deploy` for the deployment, and remember local-dev schema changes must be applied to *both* databases.

  This bites scripts as well, and less visibly: **importing `@prisma/client` auto-loads `.env` into `process.env` at module load**, before any of your code runs. So a `ts-node` script that reads `process.env.DATABASE_URL` targets the *deployment* even when it never asked for it, and even when it read `.env.local` itself. Any script that means to hit the dev database has to take the URL from the file it loaded (and pass it via `new PrismaClient({ datasources: { db: { url } } })`) rather than trusting the ambient variable — see `scripts/seed-temp-documents.ts`.

## Architecture

### Multi-tenancy via `officeId`, enforced at the application layer

Every core table (`User`, `IncomingDocument`, `OutgoingDocument`, `Activity`, `Leave`, `AuditLog`) carries an `officeId`. There is **no Postgres Row-Level Security** configured — office isolation is entirely manual: every Prisma query is scoped with `where: { officeId: session.user.officeId }`, and every mutating API route derives `officeId` from the session rather than trusting anything the client sends. When adding a query or route, follow this pattern exactly; don't accept `officeId` as client input anywhere.

### Auth and session shape

`src/lib/auth.ts` defines `authOptions` (NextAuth, JWT strategy, credentials provider checking `bcrypt` against `User.passwordHash`). The session's `user` object carries `id`, `officeId`, and `role` — typed via the module augmentation in `src/types/next-auth.d.ts`.

`src/app/(dashboard)/layout.tsx` is the single auth gate for all four modules: it requires a session (redirects to `/login` otherwise) and renders the nav + the ARTA alert badge. Individual pages still call `getServerSession(authOptions)` again themselves to read `officeId`/`role` for their own queries — this is deliberate duplication, not an oversight, since the layout guarantees a session exists but doesn't pass data down to children.

### Authorization: `src/lib/authz.ts`

Two role checks, both enforced server-side in API routes (not just hidden in the UI):
- `canSignOffAsChief` (`DIVISION_CHIEF`/`ADMIN` only) gates `IncomingDocument.dcSignOffDate` — the Division Chief's distinct sign-off step, separate from ADAS III's record-keeping fields.
- `canDelete` (`DIVISION_CHIEF`/`ADMIN` only) gates every `DELETE` route.

The UI (form fields, Delete buttons) hides what a role can't do, but that's convenience — the actual boundary is the 403 in the route handler.

### Audit trail: `src/lib/auditLog.ts`

`logAudit()` is called after every CREATE/UPDATE/DELETE across all four modules' API routes, writing to `AuditLog` with the actor, action, entity, and a JSON snapshot (the full record, on delete). Treat these rows as immutable history — nothing in the app ever edits or prunes them.

### The four-module pattern (Incoming / Outgoing / Activities / Leave)

All four follow an identical five-piece shape. Copy this exactly for any new module rather than inventing a variant:
- `src/app/api/<module>/route.ts` — `GET` (office-scoped list) + `POST` (create)
- `src/app/api/<module>/[id]/route.ts` — `PATCH` (update) + `DELETE` (role-gated)
- `src/app/(dashboard)/<module>/page.tsx` — server component list view; reads search/filter/page from `searchParams`, queries Prisma directly (no client-side fetch for the initial render), paginates with the shared `src/components/Pagination.tsx`
- `src/app/(dashboard)/<module>/new/page.tsx` and `.../[id]/page.tsx` — thin server components that fetch dropdown data (and, for edit, the existing record + 404 if it's missing or belongs to another office), then render the module's form component in `create` or `edit` mode
- `src/app/(dashboard)/<module>/<Module>Form.tsx` — one client component handling both create and edit; edit mode reveals extra fields that don't make sense at creation time (e.g. `IncomingForm`'s DC-owned fields, `ActivityForm`'s file uploads)

`OutgoingDocument.relatedIncomingId` is a real foreign key back to `IncomingDocument` — the actual link between the intake and dispatch ledgers (the original Excel version only had this as a manual text note).

### ARTA due-date logic

`src/lib/artaLeadTime.ts` computes `dueDate` by adding N working days (skipping weekends) to `dateReceived`, based on `DocComplexity` (`SIMPLE`=3, `COMPLEX`=7, `HIGHLY_TECHNICAL`=20). `src/lib/artaAlerts.ts` derives overdue/due-soon counts from that; the dashboard nav shows a badge and the Incoming page shows a full banner. Alerting is **in-app only** — there's no SMTP/email integration, so nothing pings anyone outside the app.

### File storage: MinIO via presigned URLs

`src/lib/minio.ts` uses a single shared bucket (`mwpd-scans`) with object keys prefixed `{officeId}/{uuid}-{filename}`. `POST /api/upload` is the only thing that should ever produce a key; `GET /api/files/[...key]` checks the key's office prefix against the caller's session before redirecting to a short-lived presigned URL. That prefix check is the entire access-control mechanism for files — never construct or accept a `scannedCopyUrl`-shaped value from anywhere other than the upload route's response.

### Routing number conventions (not schema-enforced, just carried over from the original tracker)

Incoming: `MMDDYY-[Type]-[seq]` where Type is `L`/`E`/`M`/`A`/`IA`/`C` (Letter/Email/Memo/Advisory/Inspection Authority/Certification). Outgoing: `MMDDYY-MWPTD-...`. These are free-text fields — the actual cross-ledger link is `relatedIncomingId`, not the number format.

## Frontend design direction

This project has three reference skill docs at the repo root (`taste-skill.md` / `frontend-skill.md` — duplicates of the same frontend-design skill — and `featdev-skill.md`). Apply their guidance rather than defaulting to generic templates:

- **New or reshaped UI** should follow the frontend-design skill's approach: ground choices in this project's actual subject matter (a government records office — routing numbers, ARTA compliance, staff rosters, physical-to-digital filing), not generic CRM/dashboard tropes. Pick a deliberate type/color/layout direction and justify it against the brief instead of reaching for the three clustered "AI-default" looks the skill calls out (cream/serif/terracotta; near-black with one bright accent; broadsheet hairlines). The current UI is intentionally plain (system-ish Tailwind defaults) because no design pass has happened yet — that's a gap to fill deliberately, not a direction to preserve out of inertia.
- **Non-trivial new features** (something touching multiple files or requiring an architectural choice) should loosely follow the phased approach in `featdev-skill.md`: understand what's being asked, check how the existing four-module pattern already solves similar problems before inventing a new one, surface real ambiguities before building, and note trade-offs when there's more than one reasonable approach — rather than jumping straight to code on an underspecified request.
