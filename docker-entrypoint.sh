#!/bin/sh
set -e

CONFIG_DIRECTORY="${CONFIG_DIRECTORY:-/config}"
MANGA_DIRECTORY="${MANGA_DIRECTORY:-/Manga}"
SECRET_FILE="$CONFIG_DIRECTORY/.session_secret"

# Starts as root only to make the data folders writable, since a bind-mounted folder is usually
# owned by root. The app itself then runs as the unprivileged node user.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$CONFIG_DIRECTORY" "$MANGA_DIRECTORY"
  find "$CONFIG_DIRECTORY" "$MANGA_DIRECTORY" ! -user node -exec chown node:node {} + || echo "Warning: couldn't take ownership of the data folders" >&2
  exec setpriv --reuid=node --regid=node --init-groups "$0" "$@"
fi

mkdir -p "$CONFIG_DIRECTORY"

# The example compose file used to ship one fixed secret. Anyone who has read it could forge a
# login cookie for any install still using it, so it gets replaced with a random one.
case "${SESSION_SECRET:-}" in
  change_me*)
    echo "Warning: ignoring the example SESSION_SECRET and generating a private one." >&2
    unset SESSION_SECRET
    ;;
esac

if [ -z "${SESSION_SECRET:-}" ]; then
  if [ ! -s "$SECRET_FILE" ]; then
    node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("base64"))' > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE" 2>/dev/null || true
  fi
  SESSION_SECRET="$(cat "$SECRET_FILE")"
  export SESSION_SECRET
fi

exec node server.js
