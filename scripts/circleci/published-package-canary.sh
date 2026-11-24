#!/usr/bin/env bash
# CircleCI published-package canary — tests catholic-mass-readings@latest from npm.
set +e

: "${HEALTHCHECKS_PING_URL:?HEALTHCHECKS_PING_URL is required}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/circleci/healthchecks-notification.sh
source "${ROOT}/scripts/circleci/healthchecks-notification.sh"

LOG_FILE="$(mktemp)"
TEMP_PROJECT="$(mktemp -d)"

cleanup() {
  rm -rf "$TEMP_PROJECT" "$LOG_FILE"
}
trap cleanup EXIT

# Optional start signal. Failure to ping must not prevent the test.
healthchecks_ping "start" "/start" || true

(
  set -euo pipefail

  cp "${ROOT}/scripts/daily-canary.mjs" "$TEMP_PROJECT/"
  cd "$TEMP_PROJECT"

  printf '%s\n' \
    '{"name":"cmr-daily-canary","version":"1.0.0","type":"module","private":true}' \
    > package.json

  # Install from npm rather than using the repository checkout.
  npm install \
    --engine-strict \
    --omit=dev \
    --no-audit \
    --no-fund \
    catholic-mass-readings@latest

  # Verify the published CLI binary.
  npx --no-install catholic-mass-readings --help >/dev/null

  # Prevent an unexpected network/challenge problem from hanging CI.
  timeout 150s node daily-canary.mjs
) >"$LOG_FILE" 2>&1

STATUS=$?

PING_PATH=""
if [ "$STATUS" -ne 0 ]; then
  PING_PATH="/fail"
fi

# Healthchecks stores the diagnostic output with the event.
healthchecks_ping "complete" "$PING_PATH" --data-binary @"$LOG_FILE" || true

cat "$LOG_FILE"
exit "$STATUS"