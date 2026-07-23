# MWPD Communication & Activity Tracker — starter scaffold

A web-based replacement for the MWPD Excel tracker: Incoming, Outgoing,
Monthly Activity, and Leave, plus ARTA due-date compliance and role-based
access, built to run on an on-premise server and to support additional
offices later without a rewrite.

## Stack

- Next.js (React + TypeScript) — frontend and API routes in one app
- PostgreSQL + Prisma — data storage and type-safe queries
- MinIO — self-hosted file storage for scanned copies
- NextAuth — authentication and role-based access
- Docker Compose + Nginx — packages the whole system for the office server

## Project structure

```
mwpd-system/
├── docker-compose.yml      # the whole system: app, db, minio, nginx
├── Dockerfile              # builds the Next.js app image
├── nginx.conf              # reverse proxy config
├── .env.example            # copy to .env and fill in real secrets
├── prisma/
│   ├── schema.prisma       # Office, User, IncomingDocument, OutgoingDocument,
│   │                       # Activity, Leave, AuditLog — all office-scoped
│   └── seed.ts             # seeds one office + the current staff roster
└── src/
    ├── lib/
    │   ├── prisma.ts           # shared Prisma client
    │   └── artaLeadTime.ts     # ARTA due-date calculation (skips weekends)
    └── app/
        ├── layout.tsx
        ├── globals.css
        ├── api/
        │   ├── incoming/route.ts    # GET/POST — working example
        │   ├── outgoing/route.ts    # placeholder — mirror incoming/route.ts
        │   ├── activities/route.ts  # placeholder
        │   └── leave/route.ts       # placeholder
        └── (dashboard)/
            ├── incoming/page.tsx    # working example — live status table
            ├── outgoing/page.tsx    # placeholder
            ├── activities/page.tsx  # placeholder
            └── leave/page.tsx       # placeholder
```

The `incoming` route and page are fully wired up end to end (schema → API →
UI) as a working template. Copy that pattern for `outgoing`, `activities`,
and `leave` — the placeholder folders are already created for you.

## First-time setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Configure environment**
   ```
   cp .env.example .env
   ```
   Fill in real passwords and run `openssl rand -base64 32` for `NEXTAUTH_SECRET`.

3. **Start the database and file storage**
   ```
   docker compose up -d db minio
   ```

4. **Run migrations and seed the initial office + staff**
   ```
   npx prisma migrate dev --name init
   npm run prisma:seed
   ```

5. **Run the app in development**
   ```
   npm run dev
   ```
   Visit `http://localhost:3000`.

## Deploying to the office server

```
docker compose up -d --build
```

This brings up Postgres, MinIO, ClamAV, the Next.js app, and Nginx together.
Nginx is the only service exposed on ports 80/443 — everything else stays on
localhost, matching the architecture diagram discussed earlier.

### Backups

`scripts/backup.sh` dumps Postgres and archives the MinIO data volume, both
AES256-encrypted with a passphrase before they touch disk:

```
BACKUP_PASSPHRASE_FILE=/root/.mwpd-backup-passphrase ./scripts/backup.sh /mnt/backup-drive
```

Wire that into a nightly cron job pointed at removable/offsite storage — see
the comments in the script for a ready-to-use crontab line. `scripts/restore.sh`
reverses the process; test it against a scratch stack periodically, since an
untested backup isn't one you can actually rely on during an incident.

## Scaling to multiple offices later

The schema already carries `officeId` on every core table, so onboarding a
second office is additive, not a rewrite:

1. Insert a new `Office` row (or use the admin UI once built).
2. Create `User` accounts scoped to that `officeId`.
3. Enable Postgres Row-Level Security so a query without the right
   `officeId` context can never return another office's rows. Example
   policy (run once against the database):
   ```sql
   ALTER TABLE "IncomingDocument" ENABLE ROW LEVEL SECURITY;
   CREATE POLICY office_isolation ON "IncomingDocument"
     USING ("officeId" = current_setting('app.current_office_id')::text);
   ```
   Set `app.current_office_id` per request/session based on the logged-in
   user — this is the enforcement layer, not just an application-level filter.
4. Give each office its own MinIO bucket (e.g. `scans-mwptd-caraga`,
   `scans-mwptd-office-b`) for scanned-copy isolation.

## Next steps

- Wire up NextAuth with credentials or your office's existing directory (if
  any), and gate pages by `Role`.
- Build out `outgoing`, `activities`, and `leave` following the `incoming`
  pattern (schema is already in place for all four).
- Add a notifications job (e.g. a daily cron script) that emails or flags
  documents approaching their ARTA due date.
- Add an audit-log viewer using the `AuditLog` table for the Division Chief.
