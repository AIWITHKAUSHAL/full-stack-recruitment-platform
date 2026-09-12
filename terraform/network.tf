# =============================================================================
# VPC and subnets
#
# Layout (deliberately simple, deliberately cheap):
#
#   Internet
#      │
#   Internet Gateway
#      │
#   Public subnets  (2 AZs)  ── ALB, ECS Fargate tasks
#      │
#   Private subnets (2 AZs)  ── RDS only, no route to the internet
#
# WHY NO NAT GATEWAY: a NAT Gateway costs about $32/month plus data processing —
# more than everything else in this stack combined. The only thing that needs
# outbound internet is the ECS task (to pull its image from ECR and to write to
# S3/CloudWatch), so the tasks run in the public subnets with a public IP and a
# security group that allows NO inbound traffic except from the ALB. The
# database, which must never be reachable from the internet, stays in the
# private subnets with no route out at all.
# =============================================================================

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true # required for the RDS endpoint hostname to resolve

  tags = { Name = "${local.name_prefix}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${local.name_prefix}-igw" }
}

# ------------------------------------------------------------------ public ---
resource "aws_subnet" "public" {
  count = length(var.public_subnet_cidrs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.name_prefix}-public-${local.azs[count.index]}"
    Tier = "public"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name_prefix}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ----------------------------------------------------------------- private ---
resource "aws_subnet" "private" {
  count = length(var.private_subnet_cidrs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = {
    Name = "${local.name_prefix}-private-${local.azs[count.index]}"
    Tier = "private"
  }
}

# No 0.0.0.0/0 route: this route table only knows about the VPC's local range,
# which is what makes these subnets genuinely private.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${local.name_prefix}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
