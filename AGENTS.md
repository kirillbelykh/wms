# Project map for agents

Read this file before changing the application. Follow the existing implementation in the same domain and avoid introducing a new pattern when a local one already works.

## Repository map

| Path | Responsibility |
|---|---|
| `backend/app/api/` | Thin FastAPI routes and permission checks |
| `backend/app/services/` | Domain workflows and business rules |
| `backend/app/repositories/` | Persistence operations |
| `backend/app/models/` | SQLAlchemy entities |
| `backend/app/schemas/` | Pydantic API contracts |
| `frontend/src/pages/` | Page-level application logic |
| `frontend/src/components/ui/` | Shared UI primitives |
| `frontend/src/api/client.ts` | Main HTTP client and API helpers |
| `frontend/src/types/wms.ts` | Shared API types |
| `frontend/src/lib/` | Formatting, status and access helpers |
| `frontend/src/stores/` | Focused Zustand state |
| `tests/` | Backend integration and domain tests |
| `migrations/` | Alembic migrations |

The `/marking` frontend is a separate subsystem with its own `api.ts`, components, tabs and workspaces. Do not force it into the patterns used by ordinary CRUD pages.

## Architecture rules

- Keep routes thin: validate input, check permission, call a service, then emit audit or realtime events when the surrounding code does so.
- Keep business logic in services and persistence logic in repositories.
- Reuse schemas from `backend/app/schemas` for input and output contracts.
- Preserve API field names in `snake_case`; do not add a client-side camelCase mapping layer without a concrete need.
- Use TanStack Query for server state and invalidate the existing query keys after mutations.
- Use local React state for page-local behavior and Zustand only for genuinely shared state.
- Use existing UI primitives, `ConfirmDialog`, toast helpers and error formatting before creating alternatives.
- Preserve audit information and rollback behavior in stock, picking, production and history changes.
- Normalize business dates through the existing Moscow-time helpers.

## Frontend landmarks

| Area | Files |
|---|---|
| Routing | `frontend/src/App.tsx` |
| Layout and navigation | `frontend/src/components/layout/AppLayout.tsx` |
| Authentication and theme | `frontend/src/stores/authStore.ts`, `appStore.ts` |
| Realtime notifications | `frontend/src/hooks/useRealtimeNotifications.ts` |
| Access rules | `frontend/src/lib/sectionAccess.ts` |
| Design tokens | `frontend/src/index.css` |
| Marking module | `frontend/src/pages/marking/` |

Keep the interface quiet and operational: dense information, restrained accents, short animations and predictable actions. Preserve desktop tables and their mobile card/list alternatives where both exist.

## Backend domains

| Domain | Main route/service/model areas |
|---|---|
| Authentication and users | `api/auth.py`, `api/admin.py`, `services/user.py`, `models/user.py` |
| Warehouses and cells | `api/warehouses.py`, `api/cell.py`, corresponding services and models |
| Items and stock | `api/item.py`, `api/stock.py`, corresponding services and models |
| Orders and picking | `api/order.py`, `api/picking.py`, order/picking services and models |
| Production | `api/production.py`, `services/production.py`, `models/production.py` |
| Marking integration | `api/chz.py`, `services/chz.py`, `models/chz.py` |
| Audit and rollback | `api/audit.py`, `services/audit.py`, `services/history_rollback.py` |

## Verification

For frontend changes:

```bash
cd frontend
npm ci
npm run typecheck
npm run build
```

For backend changes, run the relevant tests first and then the full passing suite:

```bash
uv sync --dev
uv run pytest
```

Ruff, mypy and ESLint currently contain inherited findings. Do not describe them as passing gates until the existing debt has been addressed and the commands have been rerun successfully.

## Safety

- Never commit `.env`, credentials, tokens, certificates, database files, dumps, logs or local runtime state.
- Do not expose the local marking bridge without authentication and explicit network review.
- Do not silently rename statuses, inventory types or domain fields.
- Do not weaken role checks, audit logging or destructive-action confirmation.
- Keep changes scoped; avoid unrelated architecture or visual rewrites.
