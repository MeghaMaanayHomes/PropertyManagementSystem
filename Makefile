.PHONY: help install dev build lint preview clean

help: ## Show available commands
	@echo "Megha Maanay Homes Portal"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

install: ## Install project dependencies
	@echo "Installing dependencies..."
	npm install

dev: ## Start the development server (Vite)
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