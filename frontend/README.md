# WMS Frontend

React + TypeScript frontend for the FastAPI warehouse management backend.

## Requirements

- Node.js
- Backend running at `http://localhost:8000`

## Setup

```bash
npm ci
npm run dev
```

The API base URL defaults to `http://localhost:8000`. To override it, create `.env` in `frontend`:

```bash
VITE_API_URL=http://localhost:8000
```

## Useful Commands

```bash
npm run lint
npm run typecheck
npm run build
npm run preview
```

## Current Backend Notes

The frontend integrates with real API endpoints only. Admin user management is shown as a settings limitation because the backend currently exposes auth user endpoints but no user CRUD or role model.
