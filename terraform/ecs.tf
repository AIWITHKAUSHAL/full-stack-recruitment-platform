# =============================================================================
# ECS cluster, task definition and service
#
# WHY ECS FARGATE: the backend is a stateless container. Fargate runs it without
# any EC2 instance to patch, size or pay for when idle, and it integrates
# directly with the ALB, IAM roles and CloudWatch. It is the smallest amount of
# orchestration that still does rolling deployments and health-based
# replacement — which is exactly why this project does NOT use Kubernetes
# (RESTRICTIONS.md #11).
# =============================================================================

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled" # COST: Container Insights bills per metric; the free ECS metrics suffice
  }

  tags = { Name = "${local.name_prefix}-cluster" }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name
  # FARGATE_SPOT would be cheaper but can be interrupted; for a demo that people
  # click through live, predictability is worth more than the saving.
  capacity_providers = ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name_prefix}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory

  # X86_64 because that is what the CI pipeline builds (--platform linux/amd64).
  # A mismatch here is the classic "exec format error" on first deploy.
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  execution_role_arn = aws_iam_role.ecs_execution.arn
  task_role_arn      = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = "${aws_ecr_repository.backend.repository_url}:${var.container_image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 8000
          protocol      = "tcp"
        }
      ]

      # Non-sensitive configuration is plain environment.
      environment = [
        { name = "ENVIRONMENT", value = var.environment },
        { name = "LOG_LEVEL", value = "INFO" },
        { name = "API_V1_PREFIX", value = "/api/v1" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "S3_RESUME_BUCKET", value = aws_s3_bucket.resumes.id },
        { name = "CORS_ORIGINS", value = local.cors_origins },
        { name = "JWT_EXPIRE_MINUTES", value = tostring(var.jwt_expire_minutes) },
        # Migrations are an explicit deployment step, never something N tasks
        # race each other to run at start-up.
        { name = "RUN_MIGRATIONS_ON_START", value = "false" },
        { name = "SEED_ON_START", value = "false" },
      ]

      # Sensitive configuration is injected from SSM by the execution role, so
      # the values appear neither in this task definition nor in the image.
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_ssm_parameter.database_url.arn },
        { name = "JWT_SECRET_KEY", valueFrom = aws_ssm_parameter.jwt_secret.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "backend"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -fsS http://localhost:8000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ])

  tags = { Name = "${local.name_prefix}-backend-task" }
}

resource "aws_ecs_service" "backend" {
  name            = "${local.name_prefix}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.public[*].id
    security_groups = [aws_security_group.ecs.id]
    # Required because there is no NAT Gateway: without a public IP the task
    # cannot reach ECR to pull its own image. Inbound is still blocked to
    # everything except the ALB security group (RESTRICTIONS.md #9).
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8000
  }

  # Give the app time to boot and connect to RDS before the ALB starts counting
  # health-check failures against it.
  health_check_grace_period_seconds = 60

  # Rolling deployment: with desired_count = 1, 200/100 means ECS starts the new
  # task, waits for it to pass health checks, and only then drains the old one.
  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  deployment_circuit_breaker {
    enable   = true
    rollback = true # a task that never becomes healthy rolls back automatically
  }

  # Lets a task's IP register in the target group cleanly on the first deploy.
  depends_on = [aws_lb_listener.http]

  lifecycle {
    # The CI pipeline registers a new task definition revision with the git SHA
    # and updates the service. Terraform must not fight it back to the tag in
    # var.container_image_tag on the next apply.
    ignore_changes = [task_definition, desired_count]
  }

  tags = { Name = "${local.name_prefix}-backend-service" }
}
