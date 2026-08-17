# LedgerGuard — Architecture Overview

## High-level diagram

```
┌──────────────────────┐      REST / JSON       ┌───────────────────────┐
│   React SPA (Vite)   │ ─────────────────────► │   Express API         │
│   Redux Toolkit      │ ◄───────────────────── │   (TypeScript)        │
│   React Router       │                        └───────────┬───────────┘
└──────────────────────┘                                    │
                                                            │ Mongoose ODM
                                                   ┌────────▼─────────┐
                                                   │     MongoDB      │
                                                   └──────────────────┘
                                                   ┌──────────────────┐
                                                   │ Redis (optional) │
                                                   │  - rate limiting │
                                                   │  - workers/queue │
                                                   └──────────────────┘
                         Socket.io (real-time ledger events)
                     Frontend  ◄────►  API (WebSocket)
```

## Repository layout

The project is an **npm workspaces** monorepo with three packages:

| Package           | Path         | Purpose                                  |
| ----------------- | ------------ | ---------------------------------------- |
| `@ledgerguard/shared`  | `shared/`   | Shared TypeScript types & constants      |
| `@ledgerguard/backend` | `backend/`  | Express + MongoDB REST API               |
| `@ledgerguard/frontend`| `frontend/` | React + Vite single-page application     |

## Backend layering

The backend follows a layered architecture to keep business rules separate from
transport concerns:

- **routes/** — map HTTP methods + paths to controllers, apply Zod validation.
- **controllers/** — parse requests, call services, shape JSON responses.
- **services/** — business logic (auth, accounts, transactions, ledger).
- **models/** — Mongoose schemas & document models.
- **middleware/** — auth, role checks, validation, error handling.
- **security/** — password hashing, JWT, input sanitisation.
- **database/** — connection bootstrapping and seeding.
- **sockets/** — Socket.io real-time event layer.
- **workers/** — background job registry (Redis-backed once enabled).

All responses use a consistent envelope (`ApiResponse<T>`):

```json
{ "success": true, "data": { ... }, "meta": { ... } }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

## Frontend layout

- **store/** — Redux Toolkit store, slices and memoised selectors.
- **services/** — thin API clients (axios) typed against shared contracts.
- **hooks/** — `useAuth`, `useAccounts`, `useDocumentTitle`.
- **routes/** — route registry; **layouts/** — auth & app shells; **pages/** — screens.
- **components/** — reusable presentational components.

## Key decisions

- **Type safety** — TypeScript end to end; shared package prevents frontend/backend drift.
- **Money handling** — amounts stored as integers in the smallest currency unit; formatting centrally.
- **Security defaults** — bcrypt password hashing, JWT auth, helmet, CORS whitelist, rate limiting.
- **Idempotent seeding** — DB seeded on first boot with an admin user and starter chart of accounts.
