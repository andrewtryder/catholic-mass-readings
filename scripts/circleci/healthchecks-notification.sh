#!/usr/bin/env bash
# Healthchecks monitoring helpers for CircleCI.
# shellcheck shell=bash
# Treat HEALTHCHECKS_PING_URL as a credential — never log curl stderr or request URLs.

healthchecks_failure_category() {
  case "$1" in
    6) echo "dns_resolution_failure" ;;
    7) echo "connection_failure" ;;
    18) echo "partial_transfer" ;;
    23) echo "write_error" ;;
    28) echo "timeout" ;;
    35) echo "ssl_connect_error" ;;
    51) echo "peer_certificate_invalid" ;;
    52) echo "empty_response" ;;
    56) echo "http_error" ;;
    60) echo "ssl_certificate_problem" ;;
    77) echo "ca_cert_lookup_failure" ;;
    *) echo "curl_error" ;;
  esac
}

healthchecks_emit_failure() {
  local phase="$1"
  local ping_path="$2"
  local curl_exit="$3"
  local http_code="$4"
  local tls_verify="$5"
  local category
  category="$(healthchecks_failure_category "$curl_exit")"
  # Allowlisted diagnostics only — no arbitrary curl output.
  printf '%s\n' \
    "healthchecks_notification_failed phase=${phase} path=${ping_path} curl_exit=${curl_exit} failure_category=${category} http_status=${http_code:-unknown} tls_verify=${tls_verify:-unknown}" \
    >&2
}

healthchecks_ping() {
  local phase="$1"
  local ping_path="$2"
  shift 2
  local -a ping_args=()
  if [ "$#" -gt 0 ]; then
    ping_args=("$@")
  fi
  local meta_file
  meta_file="$(mktemp)"
  local curl_exit=0

  if [ "${#ping_args[@]}" -gt 0 ]; then
    curl \
      --fail \
      --silent \
      --output /dev/null \
      --max-time 10 \
      --retry 3 \
      --write-out '%{http_code} %{ssl_verify_result}\n' \
      "${ping_args[@]}" \
      "${HEALTHCHECKS_PING_URL}${ping_path}" \
      >"$meta_file" \
      2>/dev/null || curl_exit=$?
  else
    curl \
      --fail \
      --silent \
      --output /dev/null \
      --max-time 10 \
      --retry 3 \
      --write-out '%{http_code} %{ssl_verify_result}\n' \
      "${HEALTHCHECKS_PING_URL}${ping_path}" \
      >"$meta_file" \
      2>/dev/null || curl_exit=$?
  fi

  local http_code="unknown"
  local tls_verify="unknown"
  if [ -s "$meta_file" ]; then
  read -r http_code tls_verify <"$meta_file" || true
  fi
  rm -f "$meta_file"

  if [ "$curl_exit" -ne 0 ]; then
    healthchecks_emit_failure "$phase" "$ping_path" "$curl_exit" "$http_code" "$tls_verify"
    return "$curl_exit"
  fi
}