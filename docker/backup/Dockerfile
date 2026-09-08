# The backup runner.
#
# Based on the same Postgres major version as the db service, because pg_dump
# refuses to dump a server newer than itself — pinning them together here means
# a Postgres upgrade cannot silently break backups, it breaks the build instead.
FROM postgres:16-alpine

# gnupg for the AES256 encryption; tar and gzip are already in the base image.
RUN apk add --no-cache gnupg

COPY run-backup.sh /usr/local/bin/run-backup.sh
COPY scheduler.sh /usr/local/bin/scheduler.sh
RUN chmod +x /usr/local/bin/run-backup.sh /usr/local/bin/scheduler.sh

# The base image's entrypoint starts a database server; this container only ever
# runs the scheduler, so it is replaced rather than wrapped.
ENTRYPOINT ["/usr/local/bin/scheduler.sh"]
