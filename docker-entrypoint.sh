#!/bin/sh
set -e

CONFIG_DIRECTORY="${CONFIG_DIRECTORY:-/config}"
SECRET_FILE="$CONFIG_DIRECTORY/.session_secret"

mkdir -p "$CONFIG_DIRECTORY" /Manga /Comics

if [ -z "${SESSION_SECRET:-}" ]; then
  if [ ! -s "$SECRET_FILE" ]; then
    node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("base64"))' > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE" 2>/dev/null || true
  fi
  SESSION_SECRET="$(cat "$SECRET_FILE")"
  export SESSION_SECRET
fi

exec node server.js
