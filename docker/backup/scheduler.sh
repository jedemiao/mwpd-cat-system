#!/bin/sh
# Runs run-backup.sh once a day at BACKUP_AT, for as long as the stack is up.
#
# A plain sleep loop rather than cron: the whole reason this moved off Windows
# Task Scheduler is that an extra scheduling layer was killing the job, and a
# container that exists only to run one command a day does not need a second one
# inside it. The loop is also visible — `docker compose logs backup` shows when
# it last ran and when it will run next, which cron in a container does not.
set -eu

BACKUP_AT="${BACKUP_AT:-12:00}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

case "$BACKUP_AT" in
  [0-2][0-9]:[0-5][0-9]) ;;
  *) echo "BACKUP_AT must look like HH:MM (24-hour); got '$BACKUP_AT'" >&2; exit 1 ;;
esac

# 10# forces base 10: "08" and "09" are invalid octal and would abort the shell.
target_secs=$(( 10#${BACKUP_AT%%:*} * 3600 + 10#${BACKUP_AT##*:} * 60 ))

now_secs() {
  echo $(( 10#$(date +%H) * 3600 + 10#$(date +%M) * 60 + 10#$(date +%S) ))
}

backed_up_today() {
  # Filenames start with the date, so today's presence is a glob, not a stat.
  set -- "$BACKUP_DIR"/db-"$(date +%Y-%m-%d)"T*.sql.gpg
  [ -e "$1" ]
}

run_backup() {
  # Never let one failure end the loop: a database that happened to be
  # restarting at noon must not mean no backups until somebody notices the
  # container has exited.
  if /usr/local/bin/run-backup.sh; then
    return 0
  fi
  echo "[$(date +%Y-%m-%dT%H-%M-%S)] Backup FAILED — will try again at $BACKUP_AT." >&2
}

echo "Backup service started. Daily at $BACKUP_AT (container time: $(date))."

# Catch-up on start. Task Scheduler had "run as soon as possible after a missed
# start" for a reason: this machine is not on overnight, so a fixed time alone
# would silently skip every day the stack happened to be down at that moment.
if [ "$(now_secs)" -ge "$target_secs" ] && ! backed_up_today; then
  echo "Today's backup was missed while the stack was down — running it now."
  run_backup
fi

while true; do
  current=$(now_secs)
  if [ "$current" -lt "$target_secs" ]; then
    wait_secs=$(( target_secs - current ))
  else
    wait_secs=$(( 86400 - current + target_secs ))
  fi

  echo "Next backup in $(( wait_secs / 3600 ))h $(( (wait_secs % 3600) / 60 ))m."
  sleep "$wait_secs"

  # Re-checked rather than assumed: a container resumed from a suspended host
  # can wake long past the time it slept for.
  backed_up_today || run_backup

  # Clears the current minute so the loop cannot fire twice within it.
  sleep 60
done
