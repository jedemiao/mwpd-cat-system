#!/usr/bin/env bash
# Verifies that a backup produced by scripts/backup.sh is actually restorable,
# WITHOUT touching the live database or MinIO data. This is the "an untested
# backup is not a backup" check — run it periodically, and before a pilot.
#
# It differs from restore.sh on purpose: restore.sh overwrites the live
# mwpd_tracker DB / minio_data volume (that's for real recovery). This script
# restores into a throwaway database (mwpd_restore_test) and a temp directory,
# checks they loaded, prints what it found, and cleans up. Nothing live is
# modified.
#
# Usage:
#   BACKUP_PASSPHRASE=...      ./scripts/test-restore.sh [db-backup.gpg] [minio-backup.gpg]
#   BACKUP_PASSPHRASE_FILE=... ./scripts/test-restore.sh
#
# With no file args it picks the newest db-*.gpg and minio-*.gpg in ./backups.

set -euo pipefail
cd "$(dirname "$0")/.."

# See backup.sh: stop Git Bash/MSYS from rewriting the container's "/data"
# path on Windows. No-op on Linux.
export MSYS_NO_PATHCONV=1

if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ]; then
  BACKUP_PASSPHRASE="$(cat "$BACKUP_PASSPHRASE_FILE")"
fi
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE or BACKUP_PASSPHRASE_FILE before running this script}"

DB_BACKUP="${1:-$(ls -t backups/db-*.sql.gpg 2>/dev/null | head -1 || true)}"
MINIO_BACKUP="${2:-$(ls -t backups/minio-*.tar.gz.gpg 2>/dev/null | head -1 || true)}"
SCRATCH_DB="mwpd_restore_test"

fail() { echo "FAIL: $*" >&2; exit 1; }

# --- DB restore into a scratch database ----------------------------------
[ -n "$DB_BACKUP" ] && [ -f "$DB_BACKUP" ] || fail "no db backup file found (looked for backups/db-*.sql.gpg)"
echo "== DB test-restore from: $DB_BACKUP =="

# Drop-and-recreate the scratch DB (never mwpd_tracker). Safe to re-run.
docker compose exec -T db psql -U mwpd -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH_DB;" >/dev/null
docker compose exec -T db psql -U mwpd -d postgres -c "CREATE DATABASE $SCRATCH_DB;" >/dev/null

if ! gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --decrypt "$DB_BACKUP" 2>/dev/null \
     | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U mwpd -d "$SCRATCH_DB" >/tmp/restore-test-psql.log 2>&1; then
  echo "---- psql output ----"; tail -20 /tmp/restore-test-psql.log
  docker compose exec -T db psql -U mwpd -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH_DB;" >/dev/null || true
  fail "decrypt or load failed (wrong passphrase, or corrupt/truncated dump)"
fi

echo "Loaded into scratch DB '$SCRATCH_DB'. Row counts restored:"
docker compose exec -T db psql -U mwpd -d "$SCRATCH_DB" -tAc "
  SELECT 'offices    = ' || count(*) FROM \"Office\";
  SELECT 'users      = ' || count(*) FROM \"User\";
  SELECT 'incoming   = ' || count(*) FROM \"IncomingDocument\";
  SELECT 'outgoing   = ' || count(*) FROM \"OutgoingDocument\";
  SELECT 'activities = ' || count(*) FROM \"Activity\";
  SELECT 'leave      = ' || count(*) FROM \"Leave\";
  SELECT 'audit      = ' || count(*) FROM \"AuditLog\";" 2>&1 | sed 's/^/  /'

# Tear down the scratch DB so it can't be mistaken for anything real.
docker compose exec -T db psql -U mwpd -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH_DB;" >/dev/null
echo "Scratch DB dropped. DB restore VERIFIED."

# --- MinIO archive extract into a temp dir (not the live volume) ---------
if [ -n "$MINIO_BACKUP" ] && [ -f "$MINIO_BACKUP" ]; then
  echo
  echo "== MinIO test-restore from: $MINIO_BACKUP =="
  TMPDIR_M="$(mktemp -d)"
  trap 'rm -rf "$TMPDIR_M"' EXIT
  if gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --decrypt "$MINIO_BACKUP" 2>/dev/null \
       | tar -xzf - -C "$TMPDIR_M" 2>/dev/null; then
    OBJCOUNT="$(find "$TMPDIR_M" -type f | wc -l | tr -d ' ')"
    echo "Archive decrypted and extracted OK — $OBJCOUNT file(s) inside. MinIO archive VERIFIED."
  else
    fail "MinIO archive failed to decrypt/extract (wrong passphrase or corrupt archive)"
  fi
else
  echo
  echo "(no MinIO backup file found — skipped)"
fi

echo
echo "ALL CHECKS PASSED — the backup is restorable."
