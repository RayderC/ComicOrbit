#!/bin/sh
set -e

CONFIG_DIRECTORY="${CONFIG_DIRECTORY:-/config}"
SECRET_FILE="$CONFIG_DIRECTORY/.session_secret"

mkdir -p "$CONFIG_DIRECTORY" /Manga /Comics

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
