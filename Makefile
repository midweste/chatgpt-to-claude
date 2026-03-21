.DEFAULT_GOAL := help

.PHONY: help dev build test coverage clean release

VERSION := $(shell node -p "require('./package.json').version")

help:			## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# === Extension Dashboard ===

dev:			## Start dashboard dev server
	cd extension/dashboard && npm run dev

build:			## Build dashboard + background worker for production
	cd extension/dashboard && npm run build
	cd extension && npx vite build --config vite.background.config.ts

release: build		## Build and package extension as a distributable ZIP
	@rm -rf release && mkdir -p release/chatgpt-to-claude
	@cp extension/manifest.json release/chatgpt-to-claude/
	@cp extension/popup.html release/chatgpt-to-claude/
	@cp -r extension/icons release/chatgpt-to-claude/
	@cp -r extension/dist release/chatgpt-to-claude/
	@cd release && zip -r ../chatgpt-to-claude-v$(VERSION).zip chatgpt-to-claude/
	@rm -rf release
	@echo "\n  ✅ chatgpt-to-claude-v$(VERSION).zip ready for distribution\n"

# === Testing ===

test:			## Run test suite
	npx vitest run

coverage:		## Run tests with coverage report
	npx vitest run --coverage

clean:			## Remove build artifacts
	rm -rf extension/dist chatgpt-to-claude-v*.zip

