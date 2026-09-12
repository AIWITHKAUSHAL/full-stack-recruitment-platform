# =============================================================================
# Application Load Balancer
#
# WHY AN ALB: ECS tasks come and go with new IP addresses on every deployment.
# The ALB is the stable address in front of them, it health-checks each task and
# stops sending traffic to unhealthy ones, and it is what makes a rolling deploy
# possible without dropping requests.
#
#   CloudFront ──► ALB :80 ──► target group :8000 ──► ECS task (FastAPI)
#
# COST: an ALB has an hourly charge plus LCU charges. It is the second most
# expensive item in this stack after RDS and is unavoidable for ECS + rolling
# deployments.
#
# TLS: the ALB listens on plain HTTP because the deployment has no custom domain
# and therefore no ACM certificate. Viewers always reach CloudFront over HTTPS;
# the CloudFront-to-ALB hop runs inside AWS. With a real domain you would add an
# ACM certificate and an HTTPS listener here, and redirect :80 to :443.
# =============================================================================

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  idle_timeout               = 60
  drop_invalid_header_fields = true
  enable_deletion_protection = false # must stay destroyable

  tags = { Name = "${local.name_prefix}-alb" }
}

resource "aws_lb_target_group" "backend" {
  name        = "${local.name_prefix}-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip" # Fargate tasks register by ENI IP, not by instance

  # /health is the liveness endpoint and deliberately does NOT touch the
  # database: a database blip should not make the ALB kill every task
  # (app/api/v1/health.py).
  health_check {
    enabled             = true
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # Long enough to finish in-flight requests during a deploy, short enough that
  # `terraform destroy` and rolling updates do not crawl.
  deregistration_delay = 30

  tags = { Name = "${local.name_prefix}-tg" }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}
