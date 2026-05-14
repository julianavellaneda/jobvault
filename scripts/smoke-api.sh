#!/usr/bin/env bash
# End-to-end smoke test for Phase 2 REST surface.
#
# Prerequisites:
#   - `vercel dev` running on $BASE (default http://localhost:3000)
#   - DATABASE_URL set in .env.local pointing at a writable libSQL file
#   - Migrations applied (drizzle-kit push or migrate-from-firebase ran once)
#   - AUTH_MODE unset or `none`
#
# Exits 0 on full create -> patch (with auto-stamp) -> approve -> delete round-trip.

set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"

say() { printf "\n\033[1m== %s ==\033[0m\n" "$1"; }
fail() { printf "\033[31mFAIL: %s\033[0m\n" "$1" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || fail "missing dep: $1"; }
need curl
need jq

say "list applications (initial)"
curl -fsS "$BASE/api/applications" | jq -e 'type == "array"' >/dev/null || fail "list not array"

say "create application"
CREATE_BODY='{"url":"https://example.com/job-smoke","company":"Smoke Co","role":"Tester"}'
APP=$(curl -fsS -X POST -H 'content-type: application/json' -d "$CREATE_BODY" "$BASE/api/applications")
APP_ID=$(echo "$APP" | jq -er .id) || fail "no id on create"
echo "  id=$APP_ID"

say "patch status -> applied (expect auto-stamp)"
PATCHED=$(curl -fsS -X PATCH -H 'content-type: application/json' \
  -d '{"status":"applied"}' "$BASE/api/applications/$APP_ID")
APPLIED_AT=$(echo "$PATCHED" | jq -r .appliedAt)
[ "$APPLIED_AT" != "null" ] && [ -n "$APPLIED_AT" ] || fail "appliedAt not auto-stamped, got: $APPLIED_AT"
echo "  appliedAt=$APPLIED_AT"

say "delete application"
curl -fsS -X DELETE -o /dev/null -w '%{http_code}\n' "$BASE/api/applications/$APP_ID" | grep -q 204 \
  || fail "delete didn't return 204"

say "create pending url"
PEND_BODY='{"url":"https://example.com/pending-smoke","extracted":{"company":"","role":"","salary":"","location":"","workArrangement":"","source":""}}'
PENDING=$(curl -fsS -X POST -H 'content-type: application/json' -d "[$PEND_BODY]" "$BASE/api/pending")
PEND_ID=$(echo "$PENDING" | jq -er '.[0].id') || fail "no id on bulk pending create"
echo "  pending id=$PEND_ID"

say "approve pending -> application"
APPROVE_BODY='{"url":"https://example.com/pending-smoke","company":"Approved Co","role":"Approved Role","status":"applied"}'
APPROVED=$(curl -fsS -X POST -H 'content-type: application/json' -d "$APPROVE_BODY" "$BASE/api/pending/$PEND_ID/approve")
APPROVED_ID=$(echo "$APPROVED" | jq -er .id) || fail "no id on approve"
[ "$(echo "$APPROVED" | jq -r .status)" = "applied" ] || fail "approved status wrong"
echo "  application id=$APPROVED_ID"

say "cleanup approved app"
curl -fsS -X DELETE -o /dev/null "$BASE/api/applications/$APPROVED_ID"

say "negative: missing id returns 405 on bare collection PATCH"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH -H 'content-type: application/json' -d '{}' "$BASE/api/applications")
[ "$CODE" = "405" ] || fail "expected 405 on PATCH collection, got $CODE"

say "negative: bad body returns 400"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"bogus":1}' "$BASE/api/applications")
[ "$CODE" = "400" ] || fail "expected 400 on bad body, got $CODE"

printf "\n\033[32mOK: smoke passed\033[0m\n"

# ----------------------------------------------------------------------------
# OAuth mode (manual — requires a real Google client + a browser).
#
# 1. In Google Cloud Console, create an OAuth 2.0 Web client with
#    redirect URI: http://localhost:3000/api/auth/callback
# 2. Add to .env.local:
#      AUTH_MODE=oauth
#      OAUTH_CLIENT_ID=...
#      OAUTH_CLIENT_SECRET=...
#      SESSION_SECRET=$(openssl rand -base64 32)
#      PUBLIC_BASE_URL=http://localhost:3000
#      ALLOWLIST=your.email@gmail.com
# 3. Restart `vercel dev`.
# 4. Open http://localhost:3000/api/auth/login in a browser, complete Google sign-in,
#    you should be redirected to PUBLIC_BASE_URL.
# 5. curl -b cookies.txt $BASE/api/auth/me  -> { uid, email, displayName }
# 6. curl -b cookies.txt $BASE/api/applications  -> 200
# 7. curl -X POST -b cookies.txt $BASE/api/auth/logout  -> 204
# 8. curl -b cookies.txt $BASE/api/auth/me  -> 401
# ----------------------------------------------------------------------------
