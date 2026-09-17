#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

(cd .. && uv run python -c "import json; from makespan.main import app; print(json.dumps(app.openapi()))") | npx openapi-typescript /dev/stdin -o src/api/schema.ts
