# =============================================================================
# CloudWatch logs and dashboard
#
# WHY: a Fargate task has no disk to SSH into. Its stdout is the only record of
# what happened, and the awslogs driver in the task definition streams it here.
# The backend writes structured JSON (app/core/logging.py), so Logs Insights can
# query fields directly:
#
#   fields @timestamp, request_id, method, path, status_code, duration_ms
#   | filter status_code >= 500
#   | sort @timestamp desc
#
# COST: log ingestion and storage are billed per GB. Retention is short by
# default for exactly that reason.
# =============================================================================

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = var.log_retention_days

  tags = { Name = "${local.name_prefix}-ecs-logs" }
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.name_prefix}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "text", x = 0, y = 0, width = 24, height = 2,
        properties = {
          markdown = "# ${var.project_display_name} - ${var.environment}\nALB -> ECS (FastAPI) -> RDS PostgreSQL. Logs: `${aws_cloudwatch_log_group.ecs.name}`"
        }
      },

      # ------------------------------------------------------------- ALB ---
      {
        type = "metric", x = 0, y = 2, width = 12, height = 6,
        properties = {
          title  = "ALB - requests and errors"
          region = var.aws_region
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main.arn_suffix],
            [".", "HTTPCode_Target_4XX_Count", ".", "."],
            [".", "HTTPCode_Target_5XX_Count", ".", "."],
            [".", "HTTPCode_ELB_5XX_Count", ".", "."]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 2, width = 12, height = 6,
        properties = {
          title  = "ALB - latency and healthy targets"
          region = var.aws_region
          view   = "timeSeries"
          period = 300
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.main.arn_suffix, { stat = "p95" }],
            ["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", aws_lb_target_group.backend.arn_suffix,
            "LoadBalancer", aws_lb.main.arn_suffix, { stat = "Average", yAxis = "right" }],
            ["AWS/ApplicationELB", "UnHealthyHostCount", "TargetGroup", aws_lb_target_group.backend.arn_suffix,
            "LoadBalancer", aws_lb.main.arn_suffix, { stat = "Average", yAxis = "right" }]
          ]
        }
      },

      # ------------------------------------------------------------- ECS ---
      {
        type = "metric", x = 0, y = 8, width = 12, height = 6,
        properties = {
          title  = "ECS - CPU and memory utilisation"
          region = var.aws_region
          view   = "timeSeries"
          stat   = "Average"
          period = 300
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.backend.name],
            [".", "MemoryUtilization", ".", ".", ".", "."]
          ]
        }
      },

      # ------------------------------------------------------------- RDS ---
      {
        type = "metric", x = 12, y = 8, width = 12, height = 6,
        properties = {
          title  = "RDS - CPU, connections and free storage"
          region = var.aws_region
          view   = "timeSeries"
          stat   = "Average"
          period = 300
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.main.identifier],
            [".", "DatabaseConnections", ".", ".", { yAxis = "right" }],
            [".", "FreeStorageSpace", ".", ".", { yAxis = "right" }]
          ]
        }
      },

      # ---------------------------------------------------------- errors ---
      {
        type = "log", x = 0, y = 14, width = 24, height = 6,
        properties = {
          title  = "Recent application errors"
          region = var.aws_region
          query  = "SOURCE '${aws_cloudwatch_log_group.ecs.name}' | fields @timestamp, request_id, level, message, path, status_code | filter level = 'ERROR' or status_code >= 500 | sort @timestamp desc | limit 50"
          view   = "table"
        }
      }
    ]
  })
}

# A single alarm, on the one symptom that always matters: the load balancer has
# no healthy backend. More alarms without an on-call rotation would be noise.
resource "aws_cloudwatch_metric_alarm" "no_healthy_targets" {
  alarm_name          = "${local.name_prefix}-no-healthy-targets"
  alarm_description   = "The ALB has no healthy ECS task; the API is down."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    TargetGroup  = aws_lb_target_group.backend.arn_suffix
    LoadBalancer = aws_lb.main.arn_suffix
  }

  # No SNS topic on purpose: adding one that nobody is subscribed to would be
  # theatre. The alarm is visible in the console and on the dashboard.
  tags = { Name = "${local.name_prefix}-no-healthy-targets" }
}
