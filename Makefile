# =============================================================================
# Mini Job Board Application Tracker
# =============================================================================
SHELL := /bin/bash
.DEFAULT_GOAL := help

PROJECT      := mini-job-board-application-tracker
TF_DIR       := terraform
BACKEND_DIR  := backend
FRONTEND_DIR := frontend
COMPOSE      := docker compose

.PHONY: help install local local-build down logs test test-backend test-frontend lint \
        migrate makemigration seed infra-init infra-validate infra-plan infra-apply \
        outputs deploy verify destroy destroy-check clean

help: ## Show this help
	grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------- local dev --
install: ## Install backend + frontend dependencies natively (no Docker)
	cd $(BACKEND_DIR) && python3 -m venv .venv && . .venv/bin/activate && \
		pip install --upgrade pip && pip install -r requirements.txt -r requirements-dev.txt
	cd $(FRONTEND_DIR) && npm ci

local: ## Start the whole stack locally (postgres + backend + frontend)
	$(COMPOSE) up

local-build: ## Rebuild images and start the stack
	$(COMPOSE) up --build

down: ## Stop the local stack (keeps the postgres volume)
	$(COMPOSE) down

logs: ## Tail local container logs
	$(COMPOSE) logs -f --tail=100

# ------------------------------------------------------------------- tests --
test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend pytest suite (SQLite-backed, no services needed)
	cd $(BACKEND_DIR) && . .venv/bin/activate && pytest -q

test-frontend: ## Run frontend Vitest suite
	cd $(FRONTEND_DIR) && npm run test -- --run

lint: ## Lint backend (ruff) and frontend (eslint + tsc)
	cd $(BACKEND_DIR) && . .venv/bin/activate && ruff check app tests
	cd $(FRONTEND_DIR) && npm run lint && npx tsc --noEmit

# ---------------------------------------------------------------- database --
migrate: ## Apply Alembic migrations against DATABASE_URL
	cd $(BACKEND_DIR) && . .venv/bin/activate && alembic upgrade head

makemigration: ## Create a new Alembic revision: make makemigration m="add x"
	cd $(BACKEND_DIR) && . .venv/bin/activate && alembic revision --autogenerate -m "$(m)"

seed: ## Seed jobs, demo applications and the bootstrap admin (idempotent)
	./scripts/seed.sh

# --------------------------------------------------------------- terraform --
infra-init: ## terraform init
	cd $(TF_DIR) && terraform init

infra-validate: ## terraform fmt -check + validate
	cd $(TF_DIR) && terraform fmt -check -recursive && terraform validate

infra-plan: ## terraform plan
	cd $(TF_DIR) && terraform plan

infra-apply: ## terraform apply (creates billable AWS resources)
	cd $(TF_DIR) && terraform apply

outputs: ## Show terraform outputs
	cd $(TF_DIR) && terraform output

# -------------------------------------------------------------- deployment --
deploy: ## Build, push, migrate, release backend + frontend to AWS
	./scripts/deploy.sh

verify: ## Verify the deployed environment end to end
	./scripts/verify.sh

destroy: ## Empty project buckets and destroy ALL project AWS infrastructure
	./scripts/destroy.sh

destroy-check: ## Read-only: list anything from this project still in AWS
	./scripts/check-leftovers.sh

clean: ## Remove local build artefacts
	rm -rf $(FRONTEND_DIR)/dist $(FRONTEND_DIR)/node_modules/.vite
	find $(BACKEND_DIR) -name '__pycache__' -prune -exec rm -rf {} +
	rm -rf $(BACKEND_DIR)/.pytest_cache $(BACKEND_DIR)/.ruff_cache
