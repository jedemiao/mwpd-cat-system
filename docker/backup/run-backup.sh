#!/bin/sh
# One encrypted backup of Postgres + MinIO, run from inside the stack.
#
# The point of doing this in a container rather than from Windows: there is no
# Docker CLI here at all. Postgres is reached over the compose network at
# db:5432, and the MinIO data is a mounted volume, not something fetched with
# `docker cp`. Every attaching docker command was being delivered a spurious
# console control event under Windows Task Scheduler and killed mid-run
# (0xC000013A), and none of them exist on this path.
#
# Output filenames and the archive layout are unchanged, so scripts/restore.sh
# restores these exactly as it restores the ones backup.sh produces.
set -eu

# gpg insists on a writable home directory for its keyring and lockfiles, and
# this container runs with a read-only root filesystem. Pointing it at the
# tmpfs keeps both true — and means the keyring is discarded with the container
# rather than persisting somewhere nobody is watching.
export GNUPGHOME="${GNUPGHOME:-/tmp/gnupg}"
mkdir -p "$GNUPGHOME"
chmod 700 "$GNUPGHOME"

TIMESTAMP="$(date +%Y-%m-%dT%H-%M-%S)"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
MINIO_DIR="${MINIO_DIR:-/minio}"
DB_HOST="${DB_HOST:-db}"
DB_USER="${DB_USER:-mwpd}"
DB_NAME="${DB_NAME:-mwpd_tracker}"

# A file is preferred over the environment variable: an env var is visible to
# anyone who can run `docker inspect`, whereas the file is mounted read-only and
# stays out of the container's configuration.
if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -f "${BACKUP_PASSPHRASE_FILE}" ]; then
  BACKUP_PASSPHRASE="$(cat "$BACKUP_PASSPHRASE_FILE")"
fi
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE or mount BACKUP_PASSPHRASE_FILE}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required to reach the database}"

# A minimum plausible size for each artifact. The number is not the point: an
# empty or truncated dump must FAIL rather than sit in the backup directory
# looking like a backup. A 15-byte .gpg is gpg faithfully encrypting nothing,
# which is exactly how the old scheduled job went unnoticed for days.
check_size() {
  path="$1"; min="$2"; what="$3"
  size="$(wc -c < "$path" | tr -d '[:space:]')"
  if [ "$size" -lt "$min" ]; then
    echo "[$TIMESTAMP] BACKUP FAILED: $what is only $size bytes (expected at least $min)." >&2
    echo "[$TIMESTAMP] Deleting $path so it cannot be mistaken for a good backup." >&2
    rm -f "$path"
    exit 1
  fi
}

# The plaintext dump must not outlive the run, however it ends.
TMP_SQL="$(mktemp)"
trap 'rm -f "$TMP_SQL"' EXIT INT TERM

echo "[$TIMESTAMP] Dumping Postgres from $DB_HOST..."
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" > "$TMP_SQL"
gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 \
  --output "$BACKUP_DIR/db-$TIMESTAMP.sql.gpg" "$TMP_SQL"
check_size "$BACKUP_DIR/db-$TIMESTAMP.sql.gpg" 2000 "the Postgres dump"

# "-C $MINIO_DIR ." keeps members relative to the data directory, which is the
# layout restore.sh extracts with `tar -xzf - -C /data`.
echo "[$TIMESTAMP] Archiving MinIO data from $MINIO_DIR..."
tar -czf - -C "$MINIO_DIR" . \
  | gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 \
  > "$BACKUP_DIR/minio-$TIMESTAMP.tar.gz.gpg"
check_size "$BACKUP_DIR/minio-$TIMESTAMP.tar.gz.gpg" 100 "the MinIO archive"

echo "[$TIMESTAMP] Done: db-$TIMESTAMP.sql.gpg, minio-$TIMESTAMP.tar.gz.gpg"

# Retention is opt-in and off by default: deleting somebody's only copy of a
# record because a variable was unset is not a mistake worth risking. Set
# BACKUP_KEEP_DAYS to a number to start pruning.
if [ -n "${BACKUP_KEEP_DAYS:-}" ]; then
  echo "[$TIMESTAMP] Pruning backups older than $BACKUP_KEEP_DAYS days..."
  find "$BACKUP_DIR" -name '*.gpg' -type f -mtime "+$BACKUP_KEEP_DAYS" -print -delete
fi
