# Warehouse Management System

A full-stack warehouse management system for receiving, storing, picking, packing and production operations. The project combines an async FastAPI backend, a React operator interface, role-based access control and an auditable PostgreSQL data model.

## Capabilities

- warehouse, cell and stock management;
- order import and lifecycle tracking;
- picking, reservation and packing workflows;
- production operations and employee labor records;
- role and permission management;
- audit history with controlled rollback operations;
- WebSocket updates and optional web-push notifications;
- integration with a local Chestny ZNAK marking agent;
- database migrations, backup scripts and container deployment files.

## Stack

| Layer | Technologies |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic |
| Data | PostgreSQL, Redis, asyncpg |
| Frontend | React 19, TypeScript, Vite, HeroUI, TanStack Query, Zustand |
| Operations | Docker Compose, Nginx, uv, GitHub Actions |
| Verification | pytest, pytest-asyncio, Ruff, mypy, ESLint, TypeScript |

## Repository layout

```text
backend/       API, domain services, repositories and models
frontend/      browser application for warehouse operators
migrations/    Alembic database migrations
tests/         backend integration and domain tests
docs/          focused technical plans and integration notes
nginx/         reverse-proxy configuration
scripts/       backup, secret-generation and deployment helpers
```

The backend keeps HTTP handlers thin: domain work lives in `backend/app/services`, persistence in `backend/app/repositories`, and database entities in `backend/app/models`. See [AGENTS.md](AGENTS.md) for a concise engineering map.

## Local backend

Requirements: Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env
# fill every required value in .env
uv sync --dev
uv run alembic upgrade head
uv run uvicorn backend.app.main:app --reload
```

Set `DATABASE_URL`, `SECRET_KEY`, the PostgreSQL and Redis connection values, authentication limits, CORS origins and local integration settings before starting the service. Empty assignments in `.env.example` are intentional: the repository does not prescribe or publish deployment data. Tests use an isolated in-memory SQLite database and disable external integrations.

## Local frontend

Requirements: Node.js 20 or newer and npm.

```bash
cd frontend
npm ci
npm run dev
```

The development server starts on `http://localhost:5173`. Set `VITE_API_URL` in `frontend/.env` when the API is not available at its default address.

## Verification

Backend:

```bash
uv run pytest
```

Frontend:

```bash
cd frontend
npm run typecheck
npm run build
```

Ruff, mypy and ESLint configurations are retained for incremental cleanup, but the current production snapshot has pre-existing findings and they are not presented as passing gates.

## Deployment model

`docker-compose.prod.yml` describes the production topology: PostgreSQL, Redis, the FastAPI service and an Nginx-served frontend. Before using it, copy `.env.example` to `.env.prod`, fill every value, replace `wms.example.com` in `nginx/nginx.conf` with the real host, and provide the matching TLS certificates.

```bash
cp .env.example .env.prod
# fill .env.prod and adapt nginx/nginx.conf before continuing
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml up -d --build
```

The repository does not contain production credentials, databases or certificates. The deployment helper assumes an already prepared host and must be reviewed before use in another environment.

## Security notes

- Generate a unique `SECRET_KEY` and strong database credentials.
- Keep `.env`, `.env.prod`, certificates and database dumps outside Git.
- Configure `CORS_ORIGINS` for the actual frontend hosts.
- Treat the Chestny ZNAK bridge token as a production secret.
- Review roles and seeded permissions before exposing the service.

## Limitations

This repository is a cleaned portfolio snapshot of a production-oriented internal system. External marking, push and deployment flows require organization-specific services and infrastructure, so they are disabled or replaced with test doubles during the automated test suite.
