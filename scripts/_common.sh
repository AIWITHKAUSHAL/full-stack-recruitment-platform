#!/usr/bin/env bash
# Shared helpers for every script in this directory.
# Sourced, never executed directly.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="${REPO_ROOT}/terraform"

# Colours are disabled when the output is not a terminal (CI logs stay clean).
if [ -t 1 ]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi

log()     { printf '%s==>%s %s\n' "${BLUE}${BOLD}" "${RESET}" "$*"; }
success() { printf '%s  ok%s %s\n' "${GREEN}" "${RESET}" "$*"; }
warn()    { printf '%swarn%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2; }
fail()    { printf '%sfail%s %s\n' "${RED}" "${RESET}" "$*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "'$1' is required but was not found on PATH."
}

require_aws_credentials() {
  aws sts get-caller-identity >/dev/null 2>&1 \
    || fail "No AWS credentials. Run 'aws configure' or export AWS_PROFILE."
}

# Reads a single Terraform output. Fails loudly rather than returning an empty
# string that would silently break the caller.
tf_output() {
  local name="$1" value
  value="$(terraform -chdir="${TF_DIR}" output -raw "${name}" 2>/dev/null)" || true
  [ -n "${value}" ] || fail "Terraform output '${name}' is empty. Has 'terraform apply' been run?"
  printf '%s' "${value}"
}

tf_output_optional() {
  terraform -chdir="${TF_DIR}" output -raw "$1" 2>/dev/null || true
}

require_terraform_state() {
  [ -f "${TF_DIR}/terraform.tfstate" ] \
    || fail "No Terraform state found in ${TF_DIR}. Run 'make infra-apply' first."
}

confirm() {
  local prompt="$1" answer
  # CI has no tty; require an explicit environment opt-in instead of hanging.
  if [ ! -t 0 ]; then
    [ "${ASSUME_YES:-false}" = "true" ] || fail "Not a terminal. Re-run with ASSUME_YES=true to proceed."
    return 0
  fi
  read -r -p "${prompt} " answer
  [ "${answer}" = "yes" ] || fail "Aborted."
}
