IMAGE_NAME ?= property-management-system
IMAGE_TAG  ?= latest
PORT       ?= 4000

.PHONY: help install dev build lint preview clean docker-build docker-run

help: ## Show available commands
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

install: ## Install project dependencies
	@echo "Installing dependencies..."
	npm install

pre-dev:
	@echo "Running pre-dev..."
	@echo "Installing dependencies..."
	npx -y npm install

dev: pre-dev ## Start the development server (Vite)
	@echo "Starting Vite development server..."
	npm run dev

build: ## Build production assets
	@echo "Building production package..."
	npm run build

lint: ## Run linter (oxlint)
	@echo "Running linter..."
	npm run lint

preview: ## Preview the production build locally
	@echo "Starting local preview server..."
	npm run preview

clean: ## Remove build artifacts and node_modules
	@echo "Cleaning project..."
	rm -rf dist node_modules

docker-build: ## Build the Docker image
	@echo "Building Docker image $(IMAGE_NAME):$(IMAGE_TAG)..."
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .

docker-run: ## Run the Docker container
	@echo "Running Docker container on port $(PORT)..."
	docker run --rm -it -p $(PORT):4000 --name $(IMAGE_NAME)-container $(IMAGE_NAME):$(IMAGE_TAG)