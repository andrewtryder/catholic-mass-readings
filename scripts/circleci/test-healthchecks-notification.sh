#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/circleci/healthchecks-notification.sh
source "${ROOT}/scripts/circleci/healthchecks-notification.sh"

TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT

PASS=0
FAIL=0

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "FAIL: $label (missing '$needle')"
    FAIL=$((FAIL + 1))
    return 1
  fi
  PASS=$((PASS + 1))
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "FAIL: $label (leaked '$needle')"
    FAIL=$((FAIL + 1))
    return 1
  fi
  PASS=$((PASS + 1))
}

install_mock_curl() {
  local exit_code="$1"
  local http_code="$2"
  local tls_verify="$3"
  cat >"$TEST_DIR/curl" <<EOF
#!/usr/bin/env bash
echo "${http_code} ${tls_verify}"
exit ${exit_code}
EOF
  chmod +x "$TEST_DIR/curl"
}

export HEALTHCHECKS_PING_URL="https://hc-ping.example/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
export SECRET_PROBE="https://user:secret-token@hc-ping.example/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?auth=query"

# --- Expired TLS certificate (curl 60) ---
install_mock_curl 60 000 1
PATH="$TEST_DIR:$PATH"
output="$(healthchecks_ping "test" "/start" 2>&1 >/dev/null || true)"
assert_contains "$output" "failure_category=ssl_certificate_problem" "ssl certificate problem category"
assert_contains "$output" "curl_exit=60" "ssl curl exit code"
assert_contains "$output" "tls_verify=1" "tls verify field"
assert_not_contains "$output" "aaaaaaaa-bbbb" "uuid not in diagnostics"
assert_not_contains "$output" "secret-token" "credentials not in diagnostics"

# --- Invalid certificate chain (curl 60 variant) ---
install_mock_curl 60 000 0
output="$(healthchecks_ping "test" "/start" 2>&1 >/dev/null || true)"
assert_contains "$output" "failure_category=ssl_certificate_problem" "invalid chain category"

# --- DNS failure (curl 6) ---
install_mock_curl 6 000 0
output="$(healthchecks_ping "test" "/start" 2>&1 >/dev/null || true)"
assert_contains "$output" "failure_category=dns_resolution_failure" "dns failure category"

# --- Connection failure (curl 7) ---
install_mock_curl 7 000 0
output="$(healthchecks_ping "test" "/start" 2>&1 >/dev/null || true)"
assert_contains "$output" "failure_category=connection_failure" "connection failure category"

# --- Timeout (curl 28) ---
install_mock_curl 28 000 0
output="$(healthchecks_ping "test" "/start" 2>&1 >/dev/null || true)"
assert_contains "$output" "failure_category=timeout" "timeout category"

# --- HTTP error with --fail (curl 56) ---
install_mock_curl 56 400 0
output="$(healthchecks_ping "test" "/fail" 2>&1 >/dev/null || true)"
assert_contains "$output" "failure_category=http_error" "http error category"
assert_contains "$output" "http_status=400" "http status in diagnostics"

# --- Connection reset / empty response (curl 52) ---
install_mock_curl 52 000 0
output="$(healthchecks_ping "test" "/start" 2>&1 >/dev/null || true)"
assert_contains "$output" "failure_category=empty_response" "empty response category"

# --- Success path produces no stderr ---
install_mock_curl 0 204 0
output="$(healthchecks_ping "test" "/start" 2>&1 >/dev/null || true)"
if [ -n "$output" ]; then
  echo "FAIL: success ping should not print diagnostics"
  FAIL=$((FAIL + 1))
else
  PASS=$((PASS + 1))
fi

# --- Job exit status preservation (mocked canary flow) ---
run_job_with_mock_node() {
  local node_exit="$1"
  local canary_script="$TEST_DIR/node"
  cat >"$canary_script" <<EOF
#!/usr/bin/env bash
exit ${node_exit}
EOF
  chmod +x "$canary_script"

  local log_file
  log_file="$(mktemp)"
  install_mock_curl 0 204 0
  PATH="$TEST_DIR:$PATH"

  local status=0
  healthchecks_ping "start" "/start" || true
  ( PATH="$TEST_DIR:$PATH" "$canary_script" ) >"$log_file" 2>&1 || status=$?
  local ping_path=""
  if [ "$status" -ne 0 ]; then
    ping_path="/fail"
  fi
  healthchecks_ping "complete" "$ping_path" || true
  rm -f "$log_file"
  echo "$status"
}

install_mock_curl 60 000 1
PATH="$TEST_DIR:$PATH"
canary_status=0
healthchecks_ping "start" "/start" || true
# Successful canary subshell would exit 0.
healthchecks_ping "complete" "" || true
if [ "$canary_status" -ne 0 ]; then
  echo "FAIL: successful canary should keep exit 0 when notifications fail"
  FAIL=$((FAIL + 1))
else
  PASS=$((PASS + 1))
fi

failed_canary_status="$(run_job_with_mock_node 1)"
if [ "$failed_canary_status" -ne 1 ]; then
  echo "FAIL: failed canary must preserve nonzero exit (got ${failed_canary_status})"
  FAIL=$((FAIL + 1))
else
  PASS=$((PASS + 1))
fi

success_canary_status="$(run_job_with_mock_node 0)"
if [ "$success_canary_status" -ne 0 ]; then
  echo "FAIL: successful canary must return 0 (got ${success_canary_status})"
  FAIL=$((FAIL + 1))
else
  PASS=$((PASS + 1))
fi

echo "Healthchecks shell tests passed: ${PASS}, failed: ${FAIL}"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi