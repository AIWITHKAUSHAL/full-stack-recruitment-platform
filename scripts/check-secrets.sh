#!/usr/bin/env bash
# Check files that are tracked or would be added by `git add` for
# high-confidence credentials and sensitive filenames. This is intentionally
# dependency-free so it can run locally and in GitHub Actions.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

fail=0

report_error() {
  printf 'ERROR: %s\n' "$1" >&2
  fail=1
}

is_allowed_example() {
  case "$1" in
    .env.example|*/.env.example|*.tfvars.example)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_sensitive_filename() {
  local path="$1" base
  base="${path##*/}"

  case "${base}" in
    .env|.env.*|*.tfstate|*.tfstate.*|*.tfvars|*.tfplan|*.pem|*.key|*.p8|*.p12|*.pfx|*.jks|*.keystore|credentials|aws-credentials*|id_rsa*|id_ed25519*|.npmrc|.pypirc|.netrc)
      return 0
      ;;
  esac

  case "${path}" in
    */.aws/*|.aws/*|*/.docker/config.json|.docker/config.json)
      return 0
      ;;
  esac

  return 1
}

# Include tracked files and untracked files that are not ignored. This makes the
# command useful before `git add`, as well as after staging.
while IFS= read -r -d '' path; do
  if is_sensitive_filename "${path}" && ! is_allowed_example "${path}"; then
    report_error "sensitive file is eligible for commit: ${path}"
  fi
done < <(git ls-files --cached --others --exclude-standard -z)

# Do not print matching lines: a scanner must not echo a discovered credential
# into CI logs. Report only the affected filename and credential category.
scan_pattern() {
  local label="$1" pattern="$2" path

  while IFS= read -r -d '' path; do
    [ "${path}" = "scripts/check-secrets.sh" ] && continue
    [ -f "${path}" ] || continue

    if LC_ALL=C grep -Iq . "${path}" 2>/dev/null \
      && LC_ALL=C grep -Eq -- "${pattern}" "${path}" 2>/dev/null; then
      report_error "possible ${label} found in ${path}"
    fi
  done < <(git ls-files --cached --others --exclude-standard -z)
}

scan_pattern "AWS access-key ID" '(AKIA|ASIA)[0-9A-Z]{16}'
scan_pattern "AWS secret-access-key assignment" '(AWS_SECRET_ACCESS_KEY|aws_secret_access_key)[[:space:]]*[:=][[:space:]]*[A-Za-z0-9/+=]{40}'
scan_pattern "private key" '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'
scan_pattern "GitHub token" '(github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})'
scan_pattern "GitLab token" 'glpat-[A-Za-z0-9_-]{20,}'
scan_pattern "Slack token" 'xox[baprs]-[A-Za-z0-9-]{10,}'
scan_pattern "Stripe live secret key" 'sk_live_[A-Za-z0-9]{16,}'
scan_pattern "Google API key" 'AIza[0-9A-Za-z_-]{35}'

if [ "${fail}" -ne 0 ]; then
  printf '\nSecret check failed. Remove the credential and rotate it if it was real.\n' >&2
  exit 1
fi

printf 'Secret check passed: no high-confidence credentials or sensitive filenames found.\n'
printf 'Note: automated scanning does not replace reviewing `git diff --cached`.\n'
