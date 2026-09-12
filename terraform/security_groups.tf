# =============================================================================
# Security groups
#
#   Internet ──► ALB SG (:80 from anywhere)
#                  │
#                  ▼
#             ECS SG (:8000 from the ALB SG only)
#                  │
#                  ▼
#             RDS SG (:5432 from the ECS SG only)
#
# Every hop references the *security group* of the previous hop rather than a
# CIDR block. That way the rules stay correct when subnets or IPs change, and
# there is no way to accidentally widen the database to the internet
# (RESTRICTIONS.md #10).
# =============================================================================

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Public entry point: accepts HTTP from the internet (CloudFront)"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name_prefix}-alb-sg" }
}

# The only 0.0.0.0/0 ingress rule in this configuration, and it is on the load
# balancer, which is the component whose job is to be public.
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from the internet (in practice, from CloudFront)"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "Forward traffic to the ECS tasks"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --------------------------------------------------------------------- ecs ---
resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-ecs-sg"
  description = "FastAPI tasks: reachable only from the load balancer"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name_prefix}-ecs-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "Application traffic from the ALB only"
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 8000
  to_port                      = 8000
  ip_protocol                  = "tcp"
}

# Outbound is open because the task must reach ECR, S3, CloudWatch and RDS.
# Inbound is what matters, and inbound is locked to the ALB.
resource "aws_vpc_security_group_egress_rule" "ecs_all" {
  security_group_id = aws_security_group.ecs.id
  description       = "Outbound to ECR, S3, CloudWatch and RDS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --------------------------------------------------------------------- rds ---
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "PostgreSQL: reachable only from the ECS tasks"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name_prefix}-rds-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_ecs" {
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from the ECS tasks only - never from a CIDR"
  referenced_security_group_id = aws_security_group.ecs.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

# The database has no reason to initiate outbound connections, and its subnets
# have no internet route anyway.
resource "aws_vpc_security_group_egress_rule" "rds_none" {
  security_group_id = aws_security_group.rds.id
  description       = "Responses within the VPC only"
  cidr_ipv4         = var.vpc_cidr
  ip_protocol       = "-1"
}
