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

echo "[$TIMESTAMP] Dumping Postgres..."
docker compose exec -T db pg_dump -U mwpd mwpd_tracker \
  | gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 \
  > "$BACKUP_DIR/db-$TIMESTAMP.sql.gpg"

echo "[$TIMESTAMP] Archiving MinIO data ($MINIO_VOLUME)..."
docker run --rm -v "$MINIO_VOLUME":/data:ro alpine tar -czf - -C /data . \
  | gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 \
  > "$BACKUP_DIR/minio-$TIMESTAMP.tar.gz.gpg"

echo "[$TIMESTAMP] Done: $BACKUP_DIR/db-$TIMESTAMP.sql.gpg, $BACKUP_DIR/minio-$TIMESTAMP.tar.gz.gpg"
