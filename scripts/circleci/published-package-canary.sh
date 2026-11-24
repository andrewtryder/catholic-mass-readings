#!/usr/bin/env bash
# CircleCI published-package canary — tests catholic-mass-readings@latest from npm.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP_PROJECT="$(mktemp -d)"

cleanup() {
  rm -rf "$TEMP_PROJECT"
}
trap cleanup EXIT

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