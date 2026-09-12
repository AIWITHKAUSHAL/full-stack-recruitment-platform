#!/usr/bin/env bash
# =============================================================================
# Read-only check: is anything from this project still in the AWS account?
#
#   ./scripts/check-leftovers.sh          (or: make destroy-check)
#
# destroy.sh runs this automatically at the end. Run it again on its own a few
# minutes after a teardown, or any time you want proof that the project is no
# longer on the bill.
#
# It needs no Terraform state, which is the point: it still works after the
# state is empty, or if the state file was lost. It only LISTS; it never
# deletes, so it cannot affect other projects in the account
# (RESTRICTIONS.md #32).
#
# Two lookups, because neither alone is complete:
#   * the Project tag   — everything Terraform created carries it
#   * the name prefix   — catches what AWS creates on our behalf without our
#                         tags (log groups, RDS snapshots and backups)
#
# Exit code: 0 when nothing is left, 1 otherwise.
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_command aws
require_command jq
require_aws_credentials

# Defaults match terraform/variables.tf; destroy.sh passes the real values.
AWS_REGION="${AWS_REGION:-us-east-1}"
NAME_PREFIX="${NAME_PREFIX:-mini-job-board-dev}"
PROJECT_TAG="${PROJECT_TAG:-MiniJobBoardApplicationTracker}"

FOUND=0
UNCHECKED=0

# Runs one AWS CLI query that returns a JSON list and prints each entry as a
# leftover. A failed call is reported, never silently read as "nothing found".
lookup() {
  local kind="$1" out item
  shift
  if ! out="$("$@" --region "${AWS_REGION}" --output json 2>/dev/null)"; then
    warn "Could not check ${kind} (missing permission?) — look in the console."
    UNCHECKED=$((UNCHECKED + 1))
    return 0
  fi
  while IFS= read -r item; do
    [ -n "${item}" ] || continue
    printf '  %s•%s %-24s %s\n' "${RED}" "${RESET}" "${kind}" "${item}"
    FOUND=$((FOUND + 1))
  done < <(printf '%s' "${out}" | jq -r '.[]? | if type == "array" then join("  ") else . end')
}

log "Checking ${AWS_REGION} for Project=${PROJECT_TAG} or names starting ${NAME_PREFIX}"

# The tagging API keeps answering for some deleted resources, so two kinds of
# ARN are left out of the tag lookup and checked directly instead:
#   * ECS (clusters, services, task definitions): deleted ones linger as
#     INACTIVE or DELETE_IN_PROGRESS records. Clusters and task definitions are
#     checked by status below; a service only exists inside an ACTIVE cluster.
#   * security-group rules: they cannot exist without their security group,
#     and the groups themselves are still covered by the tag lookup.
lookup "tagged resource" aws resourcegroupstaggingapi get-resources \
  --tag-filters "Key=Project,Values=${PROJECT_TAG}" \
  --query "ResourceTagMappingList[?!contains(ResourceARN, ':ecs:') && !contains(ResourceARN, ':security-group-rule/')].ResourceARN"

# Only an ACTIVE cluster can run, and bill for, tasks.
lookup "ECS cluster" aws ecs describe-clusters --clusters "${NAME_PREFIX}-cluster" \
  --query "clusters[?status=='ACTIVE'].[clusterName, status]"

# ACTIVE or INACTIVE means destroy.sh did not delete it. DELETE_IN_PROGRESS
# revisions are on their way out and are not listed.
lookup "ECS task definition" aws ecs list-task-definitions \
  --family-prefix "${NAME_PREFIX}" --status ACTIVE --query "taskDefinitionArns"
lookup "ECS task definition" aws ecs list-task-definitions \
  --family-prefix "${NAME_PREFIX}" --status INACTIVE --query "taskDefinitionArns"

lookup "RDS instance" aws rds describe-db-instances \
  --query "DBInstances[?starts_with(DBInstanceIdentifier, '${NAME_PREFIX}')].[DBInstanceIdentifier, DBInstanceStatus]"

lookup "RDS snapshot" aws rds describe-db-snapshots \
  --query "DBSnapshots[?starts_with(DBInstanceIdentifier, '${NAME_PREFIX}')].[DBSnapshotIdentifier, SnapshotType]"

lookup "RDS retained backup" aws rds describe-db-instance-automated-backups \
  --query "DBInstanceAutomatedBackups[?starts_with(DBInstanceIdentifier, '${NAME_PREFIX}')].[DBInstanceIdentifier, Status]"

lookup "CloudWatch log group" aws logs describe-log-groups \
  --log-group-name-prefix "/ecs/${NAME_PREFIX}" --query "logGroups[].logGroupName"

lookup "CloudWatch log group" aws logs describe-log-groups \
  --log-group-name-prefix "/aws/rds/instance/${NAME_PREFIX}" --query "logGroups[].logGroupName"

lookup "load balancer" aws elbv2 describe-load-balancers \
  --query "LoadBalancers[?starts_with(LoadBalancerName, '${NAME_PREFIX}')].LoadBalancerName"

lookup "ECR repository" aws ecr describe-repositories \
  --query "repositories[?starts_with(repositoryName, '${NAME_PREFIX}')].repositoryName"

lookup "S3 bucket" aws s3api list-buckets \
  --query "Buckets[?starts_with(Name, '${NAME_PREFIX}')].Name"

lookup "CloudFront distribution" aws cloudfront list-distributions \
  --query "DistributionList.Items[?contains(Comment, '${PROJECT_TAG}')].[Id, Status, DomainName]"

# CloudFront Functions cannot carry tags, so the tag lookup above never sees them.
lookup "CloudFront function" aws cloudfront list-functions \
  --query "FunctionList.Items[?starts_with(Name, '${NAME_PREFIX}')].Name"

# CloudFront creates this log group itself if the function ever logs.
lookup "CloudWatch log group" aws logs describe-log-groups \
  --log-group-name-prefix "/aws/cloudfront/function/${NAME_PREFIX}" --query "logGroups[].logGroupName"

# IAM is global and the tag lookup above does not cover it, so this project's
# roles and customer-managed policies are checked by name. AWS service-linked
# roles (AWSServiceRoleFor…) are deliberately not listed: AWS creates and owns
# them, they are free, and other projects in the account may rely on them.
lookup "IAM role" aws iam list-roles \
  --query "Roles[?starts_with(RoleName, '${NAME_PREFIX}')].RoleName"
lookup "IAM policy" aws iam list-policies --scope Local \
  --query "Policies[?starts_with(PolicyName, '${NAME_PREFIX}')].PolicyName"

echo
if [ "${FOUND}" -eq 0 ] && [ "${UNCHECKED}" -eq 0 ]; then
  success "Nothing from this project remains in ${AWS_REGION}."
  exit 0
fi

[ "${FOUND}" -eq 0 ] || warn "${FOUND} item(s) above still exist."
[ "${UNCHECKED}" -eq 0 ] || warn "${UNCHECKED} check(s) could not run."
exit 1
