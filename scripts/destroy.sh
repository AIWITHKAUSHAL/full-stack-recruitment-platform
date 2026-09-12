#!/usr/bin/env bash
# =============================================================================
# Safely destroy EVERY AWS resource this project created — and nothing else.
#
#   ./scripts/destroy.sh          (or: make destroy)
#
# SAFETY MODEL:
#   * Every name comes from `terraform output`, so only the buckets, cluster and
#     task definition family this configuration created are ever touched.
#   * There is no `aws s3 ls | xargs rb`, no wildcard delete, no tag-based
#     delete sweep across the account (RESTRICTIONS.md #32, #33).
#   * Everything else is removed by `terraform destroy`, which only touches
#     resources present in this state file.
#   * The final check (scripts/check-leftovers.sh) is read-only: it lists what
#     is left, it never deletes.
#
# WHY THE STEPS AROUND `terraform destroy`: a few things exist in AWS that
# Terraform did not create, and each would either block the destroy or survive
# it:
#
#   S3 objects              uploaded by deploy.sh and by candidates
#   one-off ECS tasks       migrations / seed started with `aws ecs run-task`;
#                           a running one stops the cluster from being deleted
#   task definition revs    registered by every deploy (free, but clutter);
#                           deregistered, then permanently deleted
#
# Safe to re-run: every step skips whatever is already gone.
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_command aws
require_command terraform
require_command jq
require_aws_credentials
require_terraform_state

# Read every name BEFORE destroying: once the state is empty, the outputs are gone.
AWS_REGION="$(tf_output_optional aws_region)"
AWS_REGION="${AWS_REGION:-us-east-1}"
FRONTEND_BUCKET="$(tf_output_optional frontend_bucket_name)"
RESUME_BUCKET="$(tf_output_optional resume_bucket_name)"
CLUSTER="$(tf_output_optional ecs_cluster_name)"
TASK_FAMILY="$(tf_output_optional ecs_task_definition_family)"
NAME_PREFIX="$(tf_output_optional name_prefix)"
PROJECT_TAG="$(tf_output_optional project_tag)"

cat <<WARNING

${YELLOW}${BOLD}This will permanently destroy the following AWS resources:${RESET}

  VPC, subnets, route tables, internet gateway, security groups
  Application Load Balancer and target group
  ECS cluster, service, running tasks and every task definition revision   (${CLUSTER:-n/a})
  ECR repository and every image in it
  RDS PostgreSQL instance ${BOLD}and all its data${RESET} (no final snapshot, no backups kept)
  S3 bucket ${FRONTEND_BUCKET:-n/a}  (frontend)
  S3 bucket ${RESUME_BUCKET:-n/a}  (resumes, including candidate uploads)
  CloudFront distribution, CloudWatch log groups, dashboard and alarm
  IAM roles and policies (plus the GitHub OIDC provider, only if this stack created it)
  SSM parameters holding the database URL and the JWT signing key

${YELLOW}Nothing outside this Terraform state is touched.${RESET}
It takes about 10-20 minutes; CloudFront and RDS are the slow ones.

WARNING

confirm "Type 'yes' to destroy everything listed above:"

# ---------------------------------------------------- stop one-off ECS tasks --
# Service tasks are drained by `terraform destroy` itself. Tasks started with
# `aws ecs run-task` (migrations, seed) belong to no service, and the cluster
# cannot be deleted while one of them is still running.
stop_standalone_tasks() {
  [ -n "${CLUSTER}" ] || return 0

  local task_arns standalone task
  task_arns="$(aws ecs list-tasks --cluster "${CLUSTER}" --desired-status RUNNING \
    --region "${AWS_REGION}" --output json 2>/dev/null | jq -r '.taskArns[]?' || true)"
  [ -n "${task_arns}" ] || return 0

  # shellcheck disable=SC2086  # one argument per ARN is intended
  standalone="$(aws ecs describe-tasks --cluster "${CLUSTER}" --tasks ${task_arns} \
    --region "${AWS_REGION}" --output json 2>/dev/null \
    | jq -r '.tasks[] | select(.group | startswith("service:") | not) | .taskArn' || true)"
  [ -n "${standalone}" ] || return 0

  log "Stopping one-off tasks still running in ${CLUSTER}"
  for task in ${standalone}; do
    aws ecs stop-task --cluster "${CLUSTER}" --task "${task}" --reason "make destroy" \
      --region "${AWS_REGION}" >/dev/null || true
  done
  # shellcheck disable=SC2086
  aws ecs wait tasks-stopped --cluster "${CLUSTER}" --tasks ${standalone} \
    --region "${AWS_REGION}" || true
  success "One-off tasks stopped"
}

# ------------------------------------------------------------ empty buckets --
empty_bucket() {
  local bucket="$1"
  [ -n "${bucket}" ] || return 0

  if ! aws s3api head-bucket --bucket "${bucket}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    warn "Bucket ${bucket} does not exist or is already gone; skipping."
    return 0
  fi

  log "Emptying s3://${bucket}"
  aws s3 rm "s3://${bucket}" --recursive --region "${AWS_REGION}" >/dev/null || true

  # Versioning is disabled on both buckets, but if it was ever turned on by
  # hand, leftover versions would block the delete. Clear them defensively.
  local versions
  versions="$(aws s3api list-object-versions --bucket "${bucket}" --region "${AWS_REGION}" \
    --output json --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' 2>/dev/null || echo '{}')"
  if [ "$(printf '%s' "${versions}" | jq -r '.Objects // empty | length // 0')" != "0" ]; then
    aws s3api delete-objects --bucket "${bucket}" --region "${AWS_REGION}" \
      --delete "${versions}" >/dev/null 2>&1 || true
  fi

  local markers
  markers="$(aws s3api list-object-versions --bucket "${bucket}" --region "${AWS_REGION}" \
    --output json --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' 2>/dev/null || echo '{}')"
  if [ "$(printf '%s' "${markers}" | jq -r '.Objects // empty | length // 0')" != "0" ]; then
    aws s3api delete-objects --bucket "${bucket}" --region "${AWS_REGION}" \
      --delete "${markers}" >/dev/null 2>&1 || true
  fi

  success "Emptied ${bucket}"
}

# ------------------------------------------------ task definition revisions --
# Terraform knows only the revision it registered; every deploy added another.
# They cost nothing, but leaving them ACTIVE makes the teardown look unfinished.
deregister_task_definitions() {
  [ -n "${TASK_FAMILY}" ] || return 0

  local arns arn
  # --family-prefix is a prefix match, so keep exactly this family and no other.
  arns="$(aws ecs list-task-definitions --family-prefix "${TASK_FAMILY}" --status ACTIVE \
    --region "${AWS_REGION}" --output json 2>/dev/null \
    | jq -r --arg family "${TASK_FAMILY}" \
        '.taskDefinitionArns[]? | select(test(":task-definition/" + $family + ":[0-9]+$"))' || true)"
  [ -n "${arns}" ] || return 0

  log "Deregistering task definition revisions of ${TASK_FAMILY}"
  for arn in ${arns}; do
    aws ecs deregister-task-definition --task-definition "${arn}" \
      --region "${AWS_REGION}" >/dev/null || true
  done
  success "Task definitions deregistered"
}

# Deregistering only marks a revision INACTIVE; AWS keeps listing it. Deleting
# it removes it for good (ECS finishes the delete once no task references it).
# Includes revisions deregistered by earlier runs, and never another family.
delete_task_definitions() {
  [ -n "${TASK_FAMILY}" ] || return 0

  local arns
  arns="$(aws ecs list-task-definitions --family-prefix "${TASK_FAMILY}" --status INACTIVE \
    --region "${AWS_REGION}" --output json 2>/dev/null \
    | jq -r --arg family "${TASK_FAMILY}" \
        '.taskDefinitionArns[]? | select(test(":task-definition/" + $family + ":[0-9]+$"))' || true)"
  [ -n "${arns}" ] || return 0

  log "Permanently deleting task definition revisions of ${TASK_FAMILY}"
  # The API accepts at most 10 revisions per call.
  if printf '%s\n' ${arns} | xargs -n 10 aws ecs delete-task-definitions \
    --region "${AWS_REGION}" --task-definitions >/dev/null; then
    success "Task definitions deleted"
  else
    warn "Some task definition revisions could not be deleted; check-leftovers.sh will list them."
  fi
}

stop_standalone_tasks
empty_bucket "${FRONTEND_BUCKET}"
empty_bucket "${RESUME_BUCKET}"

# --------------------------------------------------------------- terraform --
# A destroy occasionally trips over AWS eventual consistency — typically a
# Fargate network interface still detaching from a security group. One retry
# after a short pause almost always clears it.
log "Running terraform destroy"
DESTROY_OK=true
if ! terraform -chdir="${TF_DIR}" destroy -auto-approve; then
  warn "terraform destroy did not finish. Retrying once in 60 seconds..."
  sleep 60
  terraform -chdir="${TF_DIR}" destroy -auto-approve || DESTROY_OK=false
fi

deregister_task_definitions
delete_task_definitions

# ---------------------------------------------------------------- verify ----
log "Verifying that the state is empty"
REMAINING="$(terraform -chdir="${TF_DIR}" state list 2>/dev/null | wc -l | tr -d ' ')"
if [ "${REMAINING}" = "0" ]; then
  success "Terraform state is empty."
else
  DESTROY_OK=false
  warn "${REMAINING} resource(s) remain in the state:"
  terraform -chdir="${TF_DIR}" state list
  warn "Re-run this script, or inspect the listed resources in the console."
fi

# The state only proves what Terraform knows about. This asks AWS directly.
log "Checking the AWS account for anything left behind"
export AWS_REGION NAME_PREFIX PROJECT_TAG
LEFTOVERS_OK=true
if ! "${REPO_ROOT}/scripts/check-leftovers.sh"; then
  warn "AWS can keep listing deleted resources for a few minutes. Checking again in 2 minutes..."
  sleep 120
  "${REPO_ROOT}/scripts/check-leftovers.sh" || LEFTOVERS_OK=false
fi

if [ "${DESTROY_OK}" = true ] && [ "${LEFTOVERS_OK}" = true ]; then
  cat <<SUMMARY

${BOLD}==========================================================${RESET}
${GREEN}Teardown complete. Nothing from this project is left in AWS,${RESET}
${GREEN}so this project adds no further charges to your bill.${RESET}

Still on disk locally (not billable):
  terraform/terraform.tfstate(.backup)
  local docker images and volumes  (docker compose down -v)
${BOLD}==========================================================${RESET}

SUMMARY
else
  cat <<SUMMARY

${BOLD}==========================================================${RESET}
${RED}Teardown NOT confirmed — something listed above may still be billing.${RESET}

  1. Wait ~10 minutes, then run:  make destroy-check
  2. Still listed? Run 'make destroy' again (safe to repeat).
  3. Still listed after that? Delete that item in the AWS console;
     the check prints its exact name or ARN.
${BOLD}==========================================================${RESET}

SUMMARY
  exit 1
fi
