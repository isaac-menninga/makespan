#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

tmpfile="$(mktemp)"
trap 'rm -f "$tmpfile"' EXIT

(cd .. && uv run python -c "import json; from makespan.main import app; print(json.dumps(app.openapi()))") \
  | openapi-typescript /dev/stdin -o "$tmpfile"

if diff -q src/api/schema.ts "$tmpfile" > /dev/null; then
  echo "schema.ts is up to date"
else
  echo "schema.ts is OUT OF DATE — run 'npm run generate-types' and commit the result" >&2
  exit 1
fi
