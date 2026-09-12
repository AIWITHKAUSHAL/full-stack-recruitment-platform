#!/usr/bin/env bash
# =============================================================================
# Deploy the backend and the frontend to AWS.
#
#   ./scripts/deploy.sh          (or: make deploy)
#
# Steps, in this order and for these reasons:
#
#   1. build the image for linux/amd64   Fargate runs x86_64
#   2. push it to ECR tagged with the git SHA   immutable, traceable
#   3. register a new task definition revision  pointing at that exact image
#   4. run `alembic upgrade head` as a one-off ECS task
#        -> the schema is in place BEFORE any task serving traffic needs it
#   5. update the service and wait for stability
#   6. build the frontend with the CloudFront API base URL
#   7. sync to S3 and invalidate CloudFront
#
# This is the same sequence .github/workflows/deploy.yml runs in CI.
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_command aws
require_command docker
require_command terraform
require_command jq
require_aws_credentials
require_terraform_state

cd "${REPO_ROOT}"

# ---------------------------------------------------------------- discovery --
log "Reading Terraform outputs"
AWS_REGION="$(tf_output aws_region)"
ECR_URL="$(tf_output ecr_repository_url)"
CLUSTER="$(tf_output ecs_cluster_name)"
SERVICE="$(tf_output ecs_service_name)"
TASK_FAMILY="$(tf_output ecs_task_definition_family)"
FRONTEND_BUCKET="$(tf_output frontend_bucket_name)"
DISTRIBUTION_ID="$(tf_output cloudfront_distribution_id)"
APP_URL="$(tf_output application_url)"
ALB_DNS="$(tf_output alb_dns_name)"
SUBNETS="$(terraform -chdir="${TF_DIR}" output -json ecs_task_subnet_ids | jq -r 'join(",")')"
SECURITY_GROUP="$(tf_output ecs_task_security_group_id)"
LOG_GROUP="$(tf_output cloudwatch_log_group)"
DASHBOARD="$(tf_output cloudwatch_dashboard_name)"

# An immutable tag: every deployed image is traceable to one commit. `latest`
# is moved too, purely as a convenience for manual `docker run`.
IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  IMAGE_TAG="${IMAGE_TAG}-dirty"
  warn "Working tree has uncommitted changes; tagging the image ${IMAGE_TAG}"
fi
IMAGE_URI="${ECR_URL}:${IMAGE_TAG}"

# ------------------------------------------------------------ build & push --
log "Authenticating to ECR"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_URL%%/*}" >/dev/null

log "Building backend image ${IMAGE_TAG} (linux/amd64)"
# --platform is not optional: an image built on Apple Silicon without it starts
# on Fargate and immediately dies with "exec format error".
docker build --platform linux/amd64 -f backend/Dockerfile -t "${IMAGE_URI}" -t "${ECR_URL}:latest" .

log "Pushing to ECR"
docker push "${IMAGE_URI}" >/dev/null
docker push "${ECR_URL}:latest" >/dev/null
success "Pushed ${IMAGE_URI}"

# ------------------------------------------------- new task definition rev --
log "Registering a new task definition revision"
NEW_TASK_DEF_ARN="$(
  aws ecs describe-task-definition --task-definition "${TASK_FAMILY}" --region "${AWS_REGION}" \
    | jq --arg IMAGE "${IMAGE_URI}" '
        .taskDefinition
        | .containerDefinitions[0].image = $IMAGE
        | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
              .compatibilities, .registeredAt, .registeredBy)
      ' > /tmp/mjb-task-def.json \
  && aws ecs register-task-definition --region "${AWS_REGION}" \
       --cli-input-json file:///tmp/mjb-task-def.json \
     | jq -r '.taskDefinition.taskDefinitionArn'
)"
rm -f /tmp/mjb-task-def.json
success "Registered ${NEW_TASK_DEF_ARN##*/}"

# ------------------------------------------------------------- migrations --
# Run as a ONE-OFF task with the same image and the same secrets, before the
# service rolls. Running migrations inside the app's own start-up would mean N
# tasks racing each other on every scale-out.
log "Running database migrations (alembic upgrade head)"
MIGRATION_TASK_ARN="$(
  aws ecs run-task \
    --region "${AWS_REGION}" \
    --cluster "${CLUSTER}" \
    --task-definition "${NEW_TASK_DEF_ARN}" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SECURITY_GROUP}],assignPublicIp=ENABLED}" \
    --overrides '{"containerOverrides":[{"name":"backend","command":["alembic","upgrade","head"]}]}' \
    | jq -r '.tasks[0].taskArn'
)"
[ -n "${MIGRATION_TASK_ARN}" ] && [ "${MIGRATION_TASK_ARN}" != "null" ] || fail "Could not start the migration task."

aws ecs wait tasks-stopped --region "${AWS_REGION}" --cluster "${CLUSTER}" --tasks "${MIGRATION_TASK_ARN}"

MIGRATION_EXIT="$(
  aws ecs describe-tasks --region "${AWS_REGION}" --cluster "${CLUSTER}" --tasks "${MIGRATION_TASK_ARN}" \
    | jq -r '.tasks[0].containers[0].exitCode'
)"
if [ "${MIGRATION_EXIT}" != "0" ]; then
  warn "Migration task exited with ${MIGRATION_EXIT}. Recent logs:"
  aws logs tail "${LOG_GROUP}" --since 10m --region "${AWS_REGION}" 2>/dev/null | tail -40 || true
  fail "Database migration failed. The service was NOT updated."
fi
success "Migrations applied"

# ------------------------------------------------------------ ecs release --
log "Updating the ECS service"
aws ecs update-service \
  --region "${AWS_REGION}" \
  --cluster "${CLUSTER}" \
  --service "${SERVICE}" \
  --task-definition "${NEW_TASK_DEF_ARN}" \
  >/dev/null

log "Waiting for the service to stabilise (this usually takes 2-4 minutes)"
aws ecs wait services-stable --region "${AWS_REGION}" --cluster "${CLUSTER}" --services "${SERVICE}"
success "ECS service is stable"

log "Checking the ALB health endpoint"
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 10 "http://${ALB_DNS}/health" >/dev/null 2>&1; then
    success "http://${ALB_DNS}/health returned 200"
    break
  fi
  [ "${attempt}" -eq 30 ] && fail "The API never answered on the load balancer."
  sleep 5
done

# -------------------------------------------------------------- frontend ---
log "Building the frontend against ${APP_URL}"
(
  cd frontend
  npm ci --no-audit --no-fund
  # Baked into the bundle: the browser then calls the API on the same origin as
  # the page, which is why there is no CORS preflight in production.
  VITE_API_BASE_URL="${APP_URL}/api/v1" npm run build
)

log "Uploading to s3://${FRONTEND_BUCKET}"
# Hashed asset filenames can be cached for a year; index.html must never be,
# or browsers keep loading the previous release's asset references.
aws s3 sync frontend/dist "s3://${FRONTEND_BUCKET}" \
  --delete --region "${AWS_REGION}" \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"

aws s3 cp frontend/dist/index.html "s3://${FRONTEND_BUCKET}/index.html" \
  --region "${AWS_REGION}" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

log "Invalidating the CloudFront cache"
INVALIDATION_ID="$(
  aws cloudfront create-invalidation --distribution-id "${DISTRIBUTION_ID}" --paths '/*' \
    | jq -r '.Invalidation.Id'
)"
success "Invalidation ${INVALIDATION_ID} created"

cat <<SUMMARY

${BOLD}==========================================================${RESET}
${BOLD}Mini Job Board Application Tracker deployment completed${RESET}
${BOLD}==========================================================${RESET}

Frontend:
${APP_URL}

API:
${APP_URL}/api/v1/jobs

ALB:
http://${ALB_DNS}

Swagger:
${APP_URL}/docs

Image:
${IMAGE_URI}

CloudWatch Dashboard:
${DASHBOARD}

${BOLD}==========================================================${RESET}

Next: seed the demo data once, if this is a fresh database.
  aws ecs run-task --cluster ${CLUSTER} --task-definition ${NEW_TASK_DEF_ARN##*/} \\
    --launch-type FARGATE \\
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SECURITY_GROUP}],assignPublicIp=ENABLED}" \\
    --overrides '{"containerOverrides":[{"name":"backend","command":["python","-m","scripts.seed"]}]}'

SUMMARY
