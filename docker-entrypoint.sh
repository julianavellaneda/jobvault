#!/bin/sh
set -e

# Run the server as the unprivileged `bun` user. When the container starts as
# root (the default), first hand the data volume to that user — bind mounts
# created by `docker compose` or by images before 0.6.0 are root-owned.
if [ "$(id -u)" = "0" ]; then
  find /app/data \! -user bun -exec chown bun:bun {} +
  exec setpriv --reuid=bun --regid=bun --init-groups -- "$@"
fi

exec "$@"
