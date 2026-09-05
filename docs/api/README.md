# LedgerGuard — API Reference

Base URL: `/api` (backend on port `4000` by default). All responses use the
standard envelope:

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "requestId": "req_..." } }
```

Error codes: `AUTH_REQUIRED`, `FORBIDDEN`, `VALIDATION_ERROR`,
`RESOURCE_NOT_FOUND`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `DUPLICATE_KEY`,
`RATE_LIMITED`, `DATABASE_ERROR`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`.
Stack traces and internal details are never returned to clients; every error
carries a `requestId` correlating to server logs.

## Authentication

Bearer JWT: `Authorization: Bearer <token>`. Auth routes are rate-limited
(brute-force protection) and never reveal whether an email exists.

| Method | Path            | Auth | Notes |
| ------ | --------------- | ---- | ----- |
| POST   | `/auth/register`| —    | Creates user + tenant; returns access + refresh tokens |
| POST   | `/auth/login`   | —    | Returns access + refresh tokens and user profile |
| POST   | `/auth/refresh` | —    | Rotates the access token from a valid refresh token |
| POST   | `/auth/logout`  | —    | Invalidates the presented refresh token |
| GET    | `/auth/me`      | JWT  | Current user + tenant context |

## Health

| Path | Auth | Purpose |
| ---- | ---- | ------- |
| GET  | `/health/live`        | — (also mounted at service root) | Liveness probe |
| GET  | `/health/ready`       | — | Readiness: verifies MongoDB + Redis (503 when degraded) |
| GET  | `/health`             | SuperAdmin | Detailed infra health: DB/Redis latency, transaction support, worker telemetry, socket count, tenant connection pool stats, version, uptime |

## Users — `/users` (CompanyAdmin+)

Tenant-scoped user management. Privilege escalation is blocked server-side
(users cannot grant roles above their own; SuperAdmin management stays on the
platform tier).

| Method | Path                | Description |
| ------ | ------------------- | ----------- |
| GET    | `/`                 | List users (last login, status, role) |
| POST   | `/`                 | Create a user |
| PATCH  | `/:id/role`         | Change role (RBAC-checked) |
| PATCH  | `/:id/status`       | Activate / deactivate |

## Tenants — `/tenants`

| Method | Path                  | Auth       | Notes |
| ------ | --------------------- | ---------- | ----- |
| GET    | `/me`                 | JWT        | Current tenant profile |
| GET    | `/`                   | SuperAdmin | List tenants |
| POST   | `/`                   | SuperAdmin | Provision tenant (dedicated DB) |
| PATCH  | `/:id`                | SuperAdmin | Update tenant |
| GET    | `/pool`               | SuperAdmin | Connection-pool diagnostics |
| POST   | `/:id/disconnect`     | SuperAdmin | Drop a tenant connection |

## Dashboard — `/dashboard`

| Method | Path       | Auth | Notes |
| ------ | ---------- | ---- | ----- |
| GET    | `/summary` | JWT  | Tenant KPIs (AR, overdue, collected, monthly billing) |

## Billing — `/billing`

All billing data is tenant-scoped from the authenticated session; cross-tenant
access is impossible by construction (dedicated database per tenant).

### Core

| Method | Path | Auth | Notes |
| ------ | ---- | ---- | ----- |
| GET    | `/summary`                    | JWT | Billing overview KPIs |
| GET    | `/customers` / `/:id`         | JWT | Paginated, searchable |
| POST / PATCH | `/customers`           | JWT | Create / update customer |
| GET    | `/invoices` / `/:id`          | JWT | Paginated, status-filtered |
| POST / PATCH | `/invoices`            | JWT | Create / update invoice |
| GET    | `/invoices/:id/pdf`           | JWT | Signed PDF download (RBAC-checked) |
| GET    | `/payments`                   | JWT | Payment history |
| POST   | `/payments`                   | JWT | **Requires `Idempotency-Key` header** — safe to retry; duplicate keys replay the original result |
| GET    | `/ledger` / `/ledger/:txId`   | JWT | Append-only ledger (paginated, type/date filters) |
| GET    | `/accounts` / `/:id`          | JWT | Cash/bank accounts |
| GET    | `/reconciliation/:key`        | JWT | Ledger↔invoice↔payment consistency |

### Finance-manager operations (FinanceManager+)

Refunds, credit notes, debit notes, recurring plans, tax rates, approvals,
financial periods, reconciliation runs. Mutations are additionally rate-limited
(`paymentLimiter`) where they move money.

| Area | Paths |
| ---- | ----- |
| Refund | `POST /payments/:transactionId/refund` |
| Credit notes | `GET/POST /credit-notes`, `POST /credit-notes/:id/issue`, `POST /credit-notes/:id/cancel` |
| Debit notes | `GET/POST /debit-notes`, `POST /debit-notes/:id/issue`, `POST /debit-notes/:id/cancel` |
| Recurring | `GET/POST /recurring`, `PATCH /recurring/:id`, `POST /recurring/:id/pause|resume|cancel` |
| Tax rates | `GET/POST /tax-rates`, `PATCH /tax-rates/:id` |
| Approvals | `GET/POST /approvals`, `POST /approvals/:id/approve|reject|cancel` |
| Periods | `GET/POST /financial-periods`, `PATCH /:id`, `POST /:id/close`, `POST /:id/reopen` (reopen: CompanyAdmin+) |

## Analytics — `/analytics` (all reads: JWT)

Range queries accept `preset` (`7d|30d|90d|12m|ytd`) or explicit `from`/`to`.
All aggregations are tenant-scoped and cached in Redis under
tenant-prefixed keys.

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/overview`         | KPI snapshot |
| GET | `/revenue`          | Revenue series + invoice intelligence |
| GET | `/payments`         | Payment volume/methods |
| GET | `/customers`        | Customer scores & bands |
| GET | `/invoices`         | Aging, DSO, status mix |
| GET | `/cashflow`         | Inflow/outflow buckets |
| GET | `/ledger`           | Ledger analytics |
| GET | `/financial-health` | Composite score + reasons |
| GET | `/activity`         | Recent activity feed |
| GET | `/forecast`         | `?horizon=n` — linear trend / WMA (insufficient history returns an empty forecast, never fake values) |
| GET | `/anomalies`        | List (filter `status`, `severity`, `limit`) |
| POST | `/anomalies/detect` | **FinanceManager+** — run detection |
| PATCH | `/anomalies/:id` | **FinanceManager+** — `action: reviewed|acknowledged|dismissed` |

## Alerts — `/alerts`

| Method | Path | Auth |
| ------ | ---- | ---- |
| GET    | `/rules` | JWT |
| POST   | `/rules` | FinanceManager+ |
| PATCH  | `/rules/:id` | FinanceManager+ |
| DELETE | `/rules/:id` | FinanceManager+ |

## Reports — `/reports`

| Method | Path | Auth | Notes |
| ------ | ---- | ---- | ----- |
| GET    | `/` | JWT | Saved report configurations |
| POST   | `/` | FinanceManager+ | Create report config |
| DELETE | `/:id` | FinanceManager+ | Delete config |
| POST   | `/export` | FinanceManager+ | Generate CSV/JSON export (paginated internally, CSV formula-injection safe) |
| GET    | `/exports` | JWT | Export history with download authorization |

## WebSocket events (Socket.IO)

Clients join `tenant:{tenantId}` rooms after JWT authentication; events never
cross tenants. Key events: invoice/payment/ledger updates, analytics
refreshes, anomaly and alert notifications, export status. The frontend
refetches authoritative data after reconnect (sockets are a hint layer, not
the source of truth).

## Pagination

List endpoints accept `page` (≥ 1) and `perPage` (≤ 100) and return
`items`, `total`, `page`, `perPage`, `totalPages`. Out-of-range values are
clamped, never error.

