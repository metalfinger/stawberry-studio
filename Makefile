.PHONY: dev backend frontend types install ci lint test test-backend test-frontend mypy migrate

PY := venv/bin/python
PIP := venv/bin/pip
JSON2TS := frontend/node_modules/.bin/json2ts

install:
	python -m venv venv
	$(PIP) install -e .
	cd frontend && npm install

dev:
	./start.sh

backend:
	$(PY) -m uvicorn backend.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

types:
	$(PY) -m pydantic2ts --module backend.models --output frontend/src/api/generated.ts --json2ts-cmd "$(PWD)/$(JSON2TS)"

lint:
	$(PY) -m ruff check backend/
	cd frontend && npm run lint

mypy:
	$(PY) -m mypy

test-backend:
	$(PY) -m pytest -q

test-frontend:
	cd frontend && npm test --if-present

test: test-backend test-frontend

migrate:
	$(PY) -c "import asyncio; from backend.database.migrations import run_migrations; from backend.database.core import DB_PATH; asyncio.run(run_migrations(DB_PATH))"

ci: lint test
