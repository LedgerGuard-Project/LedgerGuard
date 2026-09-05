# LedgerGuard

**LedgerGuard** is a multi-tenant, zero-knowledge billing engine: double-entry
ledger accounting, idempotent payment processing, real-time analytics,
forecasting, anomaly detection and enterprise administration.

Status: **production-ready core** through Phase 4 hardening — security, RBAC,
tenant isolation, idempotent financial pipelines, observability and health
endpoints are all implemented against a real MongoDB/Redis backend. No mocked
data paths.

Enterprise extension (Final Enterprise Features): Payment & Reconciliation
Exception Center, Finance Operations Work Queue with SLA tracking, Executive
Month-End Close dashboard, API Key management (hashed keys, least-privilege
scopes), signed Webhook management with retry/backoff/idempotent deliveries,
and a Developer Portal. See [`FINAL_ENTERPRISE_FEATURES.md`](./FINAL_ENTERPRISE_FEATURES.md).

> ⚠️ All seeded credentials (`PLATFORM_ADMIN_*`, `DEV_*_EMAIL/PASSWORD`) are
> **DEVELOPMENT ONLY** values from `backend/.env.example`. Never reuse them in
> production; provision secrets via your own secret store.

---

## Feature Overview

| Phase | Capability |
| ----- | ---------- |
| 1 | Organization registration → dedicated per-tenant database, JWT auth + refresh, RBAC (SuperAdmin/CompanyAdmin/FinanceManager/Viewer), audit logging |
| 2 | Double-entry ledger, ACID transactions on a replica set, Redis distributed locks, idempotency keys (replay-safe), invoices/payments/refunds/credit & debit notes, recurring billing, reconciliation engine |
| 3 | Analytics KPIs, revenue/payment forecasting (deterministic linear trend / WMA), anomaly detection with review workflow, financial health scoring, report center + scheduled exports (CSV/PDF), alerts, Socket.IO live updates |
| 4 | Security hardening (login rate limits, lockout, tenant-scoped cache keys), pagination standards, correlation IDs, standardized API errors, `/health/live` · `/health/ready` · SuperAdmin detailed `/api/health`, System Health page, worker telemetry, lazy-loaded analytics bundle |
| Enterprise | Payment & Reconciliation Exception Center (`/reconciliation/exceptions`), Operations Work Queue with SLA tracking (`/operations`), Month-End Close dashboard (`/close`), API Key management (hashed, least-privilege) + Webhooks (signed, retry/backoff, idempotent) + Developer Portal (`/developer`) |

---

## Technology Stack

- **Frontend** React 18 + Vite + TypeScript, TanStack Query, Tailwind CSS, Recharts, lucide-react
- **Backend** Node.js ≥ 18, Express, TypeScript, Mongoose, Zod validation
- **Data** MongoDB (replica set required for transactions), Redis (optional but recommended)
- **Realtime** Socket.IO with authenticated tenant rooms (`tenant:{id}`)
- **Shared** `@ledgerguard/shared` package for roles/constants/validation

## Monorepo Layout (npm workspaces)

```
ledgerguard/
├── frontend/        # React SPA — src/{components,pages,layouts,hooks,services,store,routes}
├── backend/         # Express API — src/{routes,controllers,services,middleware,database,security,sockets,workers}
├── shared/          # Shared types, role weights, plan constants
├── docs/            # architecture/, api/, database/
├── docker/          # Dockerfiles
├── scripts/         # Dev helper scripts (Mongo start, port cleanup)
├── docker-compose.yml
├── DISASTER_RECOVERY.md
└── PHASE_4_AUDIT.md
```

---

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env    # then edit secrets
cp frontend/.env.example frontend/.env  # optional, sensible defaults
```

Every variable is documented inline in `backend/.env.example`. Required at boot:
`MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `GLOBAL_DB_NAME`.
The server validates critical config on startup and refuses unsafe production defaults.

### 3A. Containerized infra (recommended)

```bash
docker compose up -d mongo redis   # replica-set Mongo + Redis
npm run dev                        # native app servers against containers
```

### 3B. Native Windows development

Backend `predev` automatically launches a local single-node MongoDB on port
**27018** via `scripts/start-mongo27018.ps1`; point `MONGO_URI` there
(`mongodb://127.0.0.1:27018`). Redis is optional — run `redis-server` or leave
`REDIS_ENABLED=false` (locks/idempotency then rely on durable DB constraints).

### 4. Seed (development)

```bash
cd backend
npm run seed               # platform admin + demo org users (DEV ONLY creds)
npm run seed:analytics     # demo_* dataset powering charts/demo mode (idempotent)
```

### 5. Run

```bash
npm run dev                # backend :4000, frontend :5173 concurrently
```

Open `http://localhost:5173`.

---

## Available Scripts

| Command | Scope | Description |
| ------- | ----- | ----------- |
| `npm run dev` | root | Backend (tsx watch) + frontend (vite) |
| `npm run build` | root | Build shared → backend → frontend |
| `npm run typecheck` | root/ws | Strict TS across workspaces |
| `npm run lint` | ws | Lint/typegate |
| `npm test` | root | Workspace tests |
| `npm run seed` / `seed:analytics` | backend | Dev data seeds |
| `npm run verify:analytics` | backend | Pure-function analytics assertion suite (30 checks) |

---

---

## Architecture Notes

**Tenant isolation:** every request resolves tenant context server-side from the
authenticated user (JWT claim → `tenantConnectionManager` dedicated database).
`tenantId` in query/body is never trusted. Financial cache keys embed
`{tenantId}`; Socket.IO joins only authenticated `tenant:{id}` rooms.

**Financial safety:** payments/refunds run inside Mongo transactions guarded by a
Redis distributed lock keyed to the invoice, with an idempotency record
(unique-indexed) returning the original response on replay. With Redis disabled,
durable unique indexes remain the second line of defence.

**Observability:** every HTTP response carries an `X-Request-ID`; structured logs
include requestId/tenant/user where safe. Standard error envelope:
`{ success:false, error:{ code, message, requestId } }`.

## Health & Operations

| Endpoint | Access | Purpose |
| -------- | ------ | ------- |
| `/api/health/live` | public | Liveness (process up) |
| `/api/health/ready` | public (no internals) | Readiness: DB/Redis dependencies |
| `/api/health` | **SuperAdmin** | Detailed: versions, latencies, pool stats, socket + worker telemetry |

UI equivalent for admins: **System Health** page (`/system/health`).

## Security Summary

- bcrypt password hashing; configurable lockout (`LOCKOUT_*`) + auth rate limits
- Short-lived access JWT + refresh rotation secrets split; no tokens in URLs
- Zod validation on all writes; MongoDB operator injection sanitised
- Helmet-class headers, CORS allow-list, JSON body size limits
- No secrets/tokens/passwords logged; detailed health SuperAdmin-only

Full checklist and phase-by-phase findings: [`PHASE_4_AUDIT.md`](./PHASE_4_AUDIT.md)
· Recovery procedures: [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md)

## Documentation

- [Architecture](./docs/architecture/overview.md)
- [API Reference](./docs/api/README.md)
- [Database Schema](./docs/database/schema.md)

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `transactionsSupported: false` on health | Mongo is standalone — init replica set (see DISASTER_RECOVERY §2.1) |
| Payments 503 when Redis down | Intentional `LOCK_FAILURE_POLICY=fail_closed`; restore Redis |
| Login instantly 429 after restarts | Auth rate-limit counters are IP-based; wait window or raise `AUTH_RATE_LIMIT_MAX` in dev |
| Port 27018 already in use | `scripts/stop-stale-ledgerguard.ps1 -Ports 27018` |
| Empty charts on dashboard | Run `npm run seed:analytics` (development demo dataset) |

---

## License

Proprietary / internal use. All rights reserved.

