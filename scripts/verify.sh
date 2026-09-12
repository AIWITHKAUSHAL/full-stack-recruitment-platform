#!/usr/bin/env bash
# =============================================================================
# End-to-end verification of a deployed environment.
#
#   ./scripts/verify.sh          (or: make verify)
#
# Exercises the real candidate and administrator journeys against the live
# CloudFront URL, then prints a pass/fail summary. Read-only apart from one
# demonstration application it submits and then leaves in APPLIED.
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_command curl
require_command jq
require_command terraform
require_terraform_state

APP_URL="$(tf_output application_url)"
API="${APP_URL}/api/v1"
ALB_DNS="$(tf_output alb_dns_name)"

PASS=0
FAIL=0

check() {
  local description="$1" actual="$2" expected="$3"
  if [ "${actual}" = "${expected}" ]; then
    printf '  %s✓%s %s\n' "${GREEN}" "${RESET}" "${description}"
    PASS=$((PASS + 1))
  else
    printf '  %s✗%s %s (expected %s, got %s)\n' "${RED}" "${RESET}" "${description}" "${expected}" "${actual}"
    FAIL=$((FAIL + 1))
  fi
}

status_of() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@"; }

log "Verifying ${APP_URL}"

echo
printf '%sInfrastructure%s\n' "${BOLD}" "${RESET}"
check "ALB health endpoint returns 200"        "$(status_of "http://${ALB_DNS}/health")" "200"
check "CloudFront serves the frontend"          "$(status_of "${APP_URL}/")" "200"
check "CloudFront SPA fallback for a deep link" "$(status_of "${APP_URL}/track")" "200"
check "Readiness reports a reachable database"  "$(curl -s --max-time 20 "${APP_URL}/health/ready" | jq -r '.checks.database')" "ok"
check "Resume storage is backed by S3"          "$(curl -s --max-time 20 "${APP_URL}/health/ready" | jq -r '.checks.resume_storage')" "s3"
check "Swagger is reachable"                    "$(status_of "${APP_URL}/docs")" "200"

echo
printf '%sPublic API%s\n' "${BOLD}" "${RESET}"
JOBS_JSON="$(curl -s --max-time 20 "${API}/jobs?page_size=5")"
JOB_TOTAL="$(printf '%s' "${JOBS_JSON}" | jq -r '.total // 0')"
JOB_ID="$(printf '%s' "${JOBS_JSON}" | jq -r '.items[0].id // empty')"

check "Jobs endpoint returns a pagination envelope" "$(printf '%s' "${JOBS_JSON}" | jq -r 'has("items") and has("page") and has("total")')" "true"
if [ "${JOB_TOTAL}" -gt 0 ] 2>/dev/null; then
  printf '  %s✓%s %s active jobs are published\n' "${GREEN}" "${RESET}" "${JOB_TOTAL}"
  PASS=$((PASS + 1))
else
  printf '  %s✗%s No active jobs found — has the database been seeded?\n' "${RED}" "${RESET}"
  FAIL=$((FAIL + 1))
fi

check "Department filter works" "$(status_of "${API}/jobs?department=Engineering")" "200"
check "Search works"            "$(status_of "${API}/jobs?search=engineer")" "200"
check "Filter options endpoint" "$(status_of "${API}/jobs/filters")" "200"
[ -n "${JOB_ID}" ] && check "Job detail works" "$(status_of "${API}/jobs/${JOB_ID}")" "200"
check "Unknown job returns 404"  "$(status_of "${API}/jobs/99999999")" "404"

echo
printf '%sSecurity%s\n' "${BOLD}" "${RESET}"
check "Admin jobs endpoint rejects anonymous callers"         "$(status_of "${API}/admin/jobs")" "401"
check "Admin applications endpoint rejects anonymous callers" "$(status_of "${API}/admin/applications")" "401"
check "Admin stats endpoint rejects anonymous callers"        "$(status_of "${API}/admin/stats")" "401"
check "A forged token is rejected" "$(status_of -H 'Authorization: Bearer not.a.real.token' "${API}/admin/stats")" "401"
check "Tracking requires an email as well as a code" "$(status_of "${API}/applications/track?application_code=APP-2026-XXXXXX")" "422"
check "Tracking a bogus code returns 404" "$(status_of "${API}/applications/track?application_code=APP-2026-XXXXXX&email=nobody@example.com")" "404"

echo
printf '%sCandidate journey%s\n' "${BOLD}" "${RESET}"
if [ -n "${JOB_ID}" ]; then
  EMAIL="verify-$(date +%s)@example.com"
  SUBMISSION="$(curl -s --max-time 30 -X POST "${API}/jobs/${JOB_ID}/applications" \
    -F "name=Verification Candidate" \
    -F "email=${EMAIL}" \
    -F "phone=+91 9000000000" \
    -F "experience=3-5 years" \
    -F "cover_note=Submitted by scripts/verify.sh")"
  CODE="$(printf '%s' "${SUBMISSION}" | jq -r '.application_code // empty')"

  if [ -n "${CODE}" ]; then
    printf '  %s✓%s Application submitted, code %s\n' "${GREEN}" "${RESET}" "${CODE}"
    PASS=$((PASS + 1))
    check "Tracking with the code and email works" \
      "$(curl -s --max-time 20 --get --data-urlencode "application_code=${CODE}" --data-urlencode "email=${EMAIL}" "${API}/applications/track" | jq -r '.status')" \
      "APPLIED"
    check "Tracking with the wrong email fails" \
      "$(status_of --get --data-urlencode "application_code=${CODE}" --data-urlencode "email=wrong@example.com" "${API}/applications/track")" \
      "404"
    check "A duplicate application is rejected" \
      "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST "${API}/jobs/${JOB_ID}/applications" \
         -F "name=Verification Candidate" -F "email=${EMAIL}" -F "phone=+91 9000000000" -F "experience=3-5 years")" \
      "409"
  else
    printf '  %s✗%s Application submission failed: %s\n' "${RED}" "${RESET}" "${SUBMISSION}"
    FAIL=$((FAIL + 1))
  fi
else
  warn "Skipping the candidate journey: no active job to apply to."
fi

echo
printf '%s==========================================================%s\n' "${BOLD}" "${RESET}"
printf '  %s%d passed%s, %s%d failed%s\n' "${GREEN}" "${PASS}" "${RESET}" \
  "$([ "${FAIL}" -eq 0 ] && printf '%s' "${GREEN}" || printf '%s' "${RED}")" "${FAIL}" "${RESET}"
printf '%s==========================================================%s\n\n' "${BOLD}" "${RESET}"

[ "${FAIL}" -eq 0 ] || exit 1
