#!/bin/sh
set -e

DB_PATH="${TRAVEL_DB_PATH:-/app/data/travel.db}"
TEMPLATE="/app/data/travel.db.template"

mkdir -p "$(dirname "$DB_PATH")"

if [ ! -f "$DB_PATH" ] || [ ! -s "$DB_PATH" ]; then
  if [ -f "$TEMPLATE" ]; then
    cp "$TEMPLATE" "$DB_PATH"
    echo "Initialized database from template at $DB_PATH"
  else
    echo "ERROR: Database missing at $DB_PATH and no template at $TEMPLATE" >&2
    exit 1
  fi
fi

exec node backend/dist/main.js
