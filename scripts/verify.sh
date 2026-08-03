#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE="http://127.0.0.1:8787"
DATA_DIR="$HOME/Library/Application Support/com.holden.schoolhub"

step() { printf "\n==> %s\n" "$1"; }

step "1/4 TypeScript typecheck"
npx tsc --noEmit

step "2/4 Frontend build"
npm run build

step "3/4 Rust tests"
cargo test --manifest-path "$ROOT/src-tauri/Cargo.toml"

step "4/4 Live API smoke test"
if ! curl -s -m 3 "$BASE/api/health" >/dev/null; then
  echo "NOTE: no server on $BASE — start it with 'npm run tauri dev', then re-run 'npm run verify' for the live API checks."
  exit 0
fi

TOKEN="$(cat "$DATA_DIR/pairing-token" 2>/dev/null || true)"
if [ -z "$TOKEN" ]; then
  echo "WARN: no pairing token found — skipping authenticated checks."
  exit 0
fi
AUTH="Authorization: Bearer $TOKEN"

fail=0

echo "GET  /api/health          $(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health") (want 200)"
echo "GET  /api/courses (noauth) $(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/courses") (want 401)"

for table in courses activities assignments meetings projects notes ideas tags calendar_events; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" "$BASE/api/$table")"
  printf "GET  /api/%-17s %s\n" "$table" "$code"
  [ "$code" != "200" ] && fail=1
done

tmp="$(mktemp)"
code="$(curl -s -o "$tmp" -w '%{http_code}' -X POST -H "$AUTH" -H 'content-type: application/json' \
  -d '{"name":"verify smoke test"}' "$BASE/api/courses")"
echo "POST /api/courses         $code (want 201)"
[ "$code" != "201" ] && fail=1

id="$(python3 -c "import json,sys; print(json.load(open('$tmp'))['id'])" 2>/dev/null || true)"
if [ -n "$id" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "$AUTH" "$BASE/api/courses/$id")"
  echo "DELETE /api/courses/$id   $code (want 204)"
  [ "$code" != "204" ] && fail=1
else
  echo "WARN: could not parse created course id"
fi
rm -f "$tmp"

echo
if [ "$fail" -eq 0 ]; then
  echo "Verify passed ✓"
else
  echo "Verify FAILED (see codes above)"
  exit 1
fi
