# =============================================================================
# ECS service autoscaling
#
# Target tracking on average CPU: Application Auto Scaling adds tasks when the
# service's average CPU sits above the target and removes them when it sits
# below.
#
# HONEST FRAMING: this demo starts at ONE task on 0.25 vCPU. Autoscaling is here
# to demonstrate the mechanism and to give a little headroom — not because the
# environment is sized for serious traffic. Real limits come from load testing a
# real workload, and the first bottleneck in this architecture would be the
# db.t4g.micro database, not the tasks (RESTRICTIONS.md #37, #38).
# =============================================================================

resource "aws_appautoscaling_target" "ecs" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"

  min_capacity = var.ecs_min_capacity
  max_capacity = var.ecs_max_capacity
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name_prefix}-cpu-target-tracking"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value = var.ecs_scaling_cpu_target

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    # Scale out quickly, scale in slowly: adding a task costs a little money,
    # removing one too eagerly costs availability during a traffic spike.
    scale_out_cooldown = 60
    scale_in_cooldown  = 300
  }
}
