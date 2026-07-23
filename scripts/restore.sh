#!/usr/bin/env bash
# Restores a database dump and/or MinIO archive produced by scripts/backup.sh.
#
# Usage:
#   BACKUP_PASSPHRASE=... ./scripts/restore.sh db backups/db-2026-07-23T02-00-00.sql.gpg
#   BACKUP_PASSPHRASE=... ./scripts/restore.sh minio backups/minio-2026-07-23T02-00-00.tar.gz.gpg
#
# IMPORTANT: this overwrites the running database / MinIO data with the
# backup's contents. Run this against a scratch/staging stack first — never
# against the live office database — until you've actually verified a
# restore end-to-end at least once. That verification is the whole point of
# having a restore script at all: an untested backup is not a backup.

set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:?Usage: restore.sh <db|minio> <backup-file.gpg>}"
BACKUP_FILE="${2:?Usage: restore.sh <db|minio> <backup-file.gpg>}"

if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ]; then
  BACKUP_PASSPHRASE="$(cat "$BACKUP_PASSPHRASE_FILE")"
fi
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE or BACKUP_PASSPHRASE_FILE before running this script}"

case "$MODE" in
  db)
    echo "Restoring Postgres from $BACKUP_FILE — this replaces all data in mwpd_tracker."
    read -r -p "Type 'yes' to continue: " CONFIRM
    [ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 1; }
    gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --decrypt "$BACKUP_FILE" \
      | docker compose exec -T db psql -U mwpd -d mwpd_tracker
    echo "Database restored."
    ;;
  minio)
    MINIO_VOLUME="$(docker volume ls -q --filter "label=com.docker.compose.volume=minio_data")"
    if [ -z "$MINIO_VOLUME" ]; then
      echo "Could not find the minio_data volume — is the stack running (docker compose up -d)?" >&2
      exit 1
    fi
    echo "Restoring MinIO data from $BACKUP_FILE into volume $MINIO_VOLUME — this replaces all scanned documents and forms."
    read -r -p "Type 'yes' to continue: " CONFIRM
    [ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 1; }
    docker compose stop minio
    gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --decrypt "$BACKUP_FILE" \
      | docker run --rm -i -v "$MINIO_VOLUME":/data alpine sh -c 'rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar -xzf - -C /data'
    docker compose start minio
    echo "MinIO data restored."
    ;;
  *)
    echo "Unknown mode '$MODE' — expected 'db' or 'minio'." >&2
    exit 1
    ;;
esac
