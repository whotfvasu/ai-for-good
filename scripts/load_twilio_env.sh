#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.twilio}"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >&2 <<EOF
Missing Twilio env file: $ENV_FILE

Create it from the template:
  cp "$ROOT_DIR/.env.twilio.example" "$ROOT_DIR/.env.twilio"

Then fill in:
  TWILIO_SID
  TWILIO_TOKEN
  TWILIO_FROM
  MARROW_DEMO_WHATSAPP_TO
EOF
  return 1 2>/dev/null || exit 1
fi

set -a
source "$ENV_FILE"
set +a

for key in TWILIO_SID TWILIO_TOKEN TWILIO_FROM MARROW_DEMO_WHATSAPP_TO; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing value for $key in $ENV_FILE" >&2
    return 1 2>/dev/null || exit 1
  fi
done

echo "Loaded Twilio env from $ENV_FILE"
echo "TWILIO_SID=${TWILIO_SID:0:6}..."
echo "TWILIO_FROM=$TWILIO_FROM"
echo "MARROW_DEMO_WHATSAPP_TO=$MARROW_DEMO_WHATSAPP_TO"
