#!/usr/bin/env bash
# One-command update for the deployed Docker stack. Runs the three steps that
# have to happen in the right order every time, so a routine update can't
# silently skip a backup or leave the database a schema behind the code (the
# "column ... does not exist" crash you get when the app ships a schema change
# but the migration was never applied to the running database).
#
# What it does, in order:
#   1. Encrypted backup of Postgres + MinIO (scripts/backup.sh) — skippable.
#   2. prisma migrate deploy against the PROD database (.env -> :5433 -> db
#      container). A no-op when there are no pending migrations, so it's always
#      safe to run — that's the point: you never have to decide "did the schema
#      change?".
#   3. docker compose up -d --build — rebuilds the app image and recreates only
#      the containers whose image/config actually changed. Your data lives in
#      named volumes (db_data, minio_data) and is untouched by a rebuild.
#
# It deliberately never runs `docker compose down -v` — the one command that
# would delete those volumes. Get the new code in first (git pull, or your
# edits), THEN run this.
#
# Usage:
#   BACKUP_PASSPHRASE=...      ./scripts/update.sh
#   BACKUP_PASSPHRASE_FILE=... ./scripts/update.sh
#   SKIP_BACKUP=1              ./scripts/update.sh   # only if you JUST backed up
#
# Migrations use .env (port 5433 = the prod Docker DB), NOT .env.local
# (port 5432 = your local `npm run dev` DB). This script is for the deployed
# system, so .env is correct.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "== MWPD deploy update =="

# --- 1. Backup ------------------------------------------------------------
if [ "${SKIP_BACKUP:-0}" = "1" ]; then
  echo "[1/3] Backup SKIPPED (SKIP_BACKUP=1)."
else
  echo "[1/3] Backing up Postgres + MinIO before touching anything..."
  ./scripts/backup.sh
fi

# --- 2. Migrate the prod database ----------------------------------------
# Make sure the datastore containers are up so migrate has something to talk
# to (backup already needs db up, but this covers SKIP_BACKUP=1 too).
echo "[2/3] Ensuring db + minio are up, then applying migrations..."
docker compose up -d db minio
npx prisma migrate deploy

# --- 3. Rebuild + restart the app ----------------------------------------
echo "[3/3] Rebuilding and restarting changed containers..."
docker compose up -d --build

echo
echo "Update complete. Current status:"
docker compose ps

# Best-effort health check — non-fatal, just a signal the app is answering.
if command -v curl >/dev/null 2>&1; then
  code="$(curl -sk -o /dev/null -w '%{http_code}' --connect-timeout 6 https://localhost/login 2>/dev/null || echo '000')"
  echo
  if [ "$code" = "200" ]; then
    echo "Health check: https://localhost/login -> $code (OK)"
  else
    echo "Health check: https://localhost/login -> $code (not 200 yet — the app"
    echo "container may still be starting; re-check in a few seconds)."
  fi
fi
