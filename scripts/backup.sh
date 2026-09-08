#!/usr/bin/env bash
# Encrypted backup of the Postgres database and MinIO object store (scanned
# documents, forms). Both dumps are AES256-encrypted with gpg before they
# ever touch disk, so the output files are safe to copy to removable/offsite
# storage without separately encrypting the transport.
#
# Usage:
#   BACKUP_PASSPHRASE=... ./scripts/backup.sh [backup_dir]
#   BACKUP_PASSPHRASE_FILE=/path/to/passphrase ./scripts/backup.sh [backup_dir]
#
# backup_dir defaults to ./backups. Point it at removable/network storage in
# production — a backup that never leaves the same disk as the original
# doesn't protect against disk failure, theft, or ransomware on that box.
#
# Suggested nightly cron (adjust paths):
#   0 2 * * * BACKUP_PASSPHRASE_FILE=/root/.mwpd-backup-passphrase \
#     /opt/mwpd-cat-system/scripts/backup.sh /mnt/backup-drive >> /var/log/mwpd-backup.log 2>&1
#
# A backup you haven't restored from is a hypothesis, not a backup — see
# scripts/restore.sh and run it against a scratch environment periodically,
# not just when you're already in the middle of an actual incident.

set -euo pipefail
cd "$(dirname "$0")/.."

# Git Bash / MSYS on Windows rewrites Unix-style arguments (like the
# container's "/data" path) into Windows paths before handing them to
# docker.exe, which breaks the volume-archive step. Disable that rewriting.
# The variable is meaningless on Linux, so this is a no-op there.
export MSYS_NO_PATHCONV=1

BACKUP_DIR="${1:-./backups}"
TIMESTAMP="$(date +%Y-%m-%dT%H-%M-%S)"
mkdir -p "$BACKUP_DIR"

if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ]; then
  BACKUP_PASSPHRASE="$(cat "$BACKUP_PASSPHRASE_FILE")"
fi
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE or BACKUP_PASSPHRASE_FILE before running this script}"

# Compose names volumes "<project>_<key>", and the project name depends on
# the directory this was cloned into — filter by the volume's compose label
# instead of hardcoding a name, so this doesn't break on a differently-named
# checkout.
MINIO_VOLUME="$(docker volume ls -q --filter "label=com.docker.compose.volume=minio_data")"
if [ -z "$MINIO_VOLUME" ]; then
  echo "Could not find the minio_data volume — is the stack running (docker compose up -d)?" >&2
  exit 1
fi

# stdin is redirected from /dev/null for both docker invocations below.
# `docker compose exec` reads stdin even with -T, and under Windows Task
# Scheduler there is no stdin handle at all — the nightly job was being killed
# (exit 0xC000013A) after pg_dump had produced nothing, which is why it failed
# on a schedule while the identical command worked by hand in a terminal.

# A minimum plausible size for each artifact. The number itself is not the
# point: an empty or truncated dump must FAIL rather than sit in the backup
# directory looking like a backup. A 15-byte .gpg is gpg faithfully encrypting
# nothing, which is how runs that captured no data went unnoticed for days.
check_size() {
  path="$1"; min="$2"; what="$3"
  size="$(wc -c < "$path" | tr -d '[:space:]')"
  if [ "$size" -lt "$min" ]; then
    echo "BACKUP FAILED: $what is only $size bytes (expected at least $min) — $path" >&2
    echo "Deleting it so it cannot be mistaken for a good backup." >&2
    rm -f "$path"
    exit 1
  fi
}

# Plain `docker`, never `docker compose`, from here on.
#
# The compose CLI plugin is killed outright when it runs under Windows Task
# Scheduler — the nightly job exited 0xC000013A (STATUS_CONTROL_C_EXIT) the
# moment it reached a `docker compose` call, while `docker version` in the same
# context worked fine. That is why this script succeeded by hand for months and
# silently produced 15-byte dumps on a schedule.
#
# The container is found the same way the volume above is: by compose labels,
# so a checkout in a differently-named directory still resolves.
COMPOSE_PROJECT="$(docker volume inspect "$MINIO_VOLUME" --format '{{index .Labels "com.docker.compose.project"}}')"
DB_CONTAINER="$(docker ps -q \
  --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" \
  --filter "label=com.docker.compose.service=db" | head -1)"
if [ -z "$DB_CONTAINER" ]; then
  echo "Could not find the running db container for project $COMPOSE_PROJECT — is the stack up?" >&2
  exit 1
fi
MINIO_CONTAINER="$(docker ps -q \
  --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" \
  --filter "label=com.docker.compose.service=minio" | head -1)"
if [ -z "$MINIO_CONTAINER" ]; then
  echo "Could not find the running minio container for project $COMPOSE_PROJECT — is the stack up?" >&2
  exit 1
fi

echo "[$TIMESTAMP] Dumping Postgres..."
docker exec -i "$DB_CONTAINER" pg_dump -U mwpd mwpd_tracker < /dev/null \
  | gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 \
  > "$BACKUP_DIR/db-$TIMESTAMP.sql.gpg"
check_size "$BACKUP_DIR/db-$TIMESTAMP.sql.gpg" 2000 "the Postgres dump"

echo "[$TIMESTAMP] Archiving MinIO data ($MINIO_VOLUME)..."
# docker cp streams a tar of the container path to stdout, so the archive is
# produced without starting a second container — `docker run` was the last
# thing in this script the Task Scheduler still killed, even as plain docker.
#
# "/data/." (not "/data") makes the members relative to the directory, which is
# the layout restore.sh extracts with `tar -xzf - -C /data`. gzip is applied
# here because docker cp emits an uncompressed tar, keeping the .tar.gz.gpg
# filename honest.
docker cp "$MINIO_CONTAINER":/data/. - \
  | gzip -c \
  | gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 \
  > "$BACKUP_DIR/minio-$TIMESTAMP.tar.gz.gpg"
check_size "$BACKUP_DIR/minio-$TIMESTAMP.tar.gz.gpg" 100 "the MinIO archive"

echo "[$TIMESTAMP] Done: $BACKUP_DIR/db-$TIMESTAMP.sql.gpg, $BACKUP_DIR/minio-$TIMESTAMP.tar.gz.gpg"
