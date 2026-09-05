# LedgerGuard — Final Enterprise Features

This document describes the final enterprise extension added on top of the
Phase 1–4 core. It integrates with the existing multi-tenant, zero-knowledge
billing engine using its established patterns (per-tenant connections,
maker-checker approvals, Redis-locked idempotent finance, Socket.IO tenant
rooms, global audit log). It does not replace or duplicate Phase 1–4 work.

## Architecture

- **Tenant isolation** is preserved through the existing
  `TenantConnectionManager` — every new model is bound to the tenant's
  dedicated database. `tenantId` is always derived server-side from the
  authenticated principal, never trusted from the request body.
- **New platform model** (`ApiKey`) lives in the global database because the
  auth middleware must resolve a key before a tenant connection exists.
- **Webhooks** run fire-and-forget so receiver latency never blocks a financial
  request; a dedicated worker sweeps failed deliveries.
- **SLA** is computed from real timestamps via a pure helper (`utils/sla.ts`);
  no fake timers.

## New Features

1. **Payment & Reconciliation Exception Center** (`/reconciliation/exceptions`)
   Queue for transactions needing human attention. Categories, severities,
   statuses (open/investigating/resolved/ignored), assign/investigate/resolve/
   reopen (resolution reason required), live SLA badge, audited actions.
2. **Finance Operations Work Queue** (`/operations`)
   Unified queue over pending approvals, failed payments, overdue invoices,
   reconciliation exceptions and failed webhooks — with SLA and priority.
3. **SLA Tracking** — configurable per item type (`DEFAULT_SLA_HOURS`),
   on-track / at-risk / breached / resolved computed from actual timestamps.
4. **Executive Month-End Close** (`/close`)
   Real aggregations (invoices, payments, AR, notes, net cash flow) + a
   readiness score that never reports ready while critical blockers exist.
5. **API Key Management** (`/developer/api-keys`)
   SHA-256-hashed keys (raw shown once), least-privilege scopes
   (READ/WRITE/BILLING/PAYMENTS/REPORTS/WEBHOOKS/ADMIN), expiry, revoke,
   rotate. Auth middleware accepts `lgk_…` bearer keys; revoked/expired keys → 401.
6. **Webhook Management** (`/developer/webhooks`)
   Signed (HMAC-SHA256 `X-LedgerGuard-Signature`) endpoints, event selection,
   enable/disable, secret rotation, deliveries with status/attempts/latency/
   retry, manual retry, test endpoint, exponential backoff (30s·2^n, 5 attempts),
   idempotent event IDs with a unique per-endpoint index preventing replays.
7. **Developer Portal** (`/developer`)
   API keys, webhooks, API reference, event catalogue.

## Database Models

Reused from Phases 1–4: `ApprovalRequest`, `FinancialPeriod`, `Invoice`,
`LedgerTransaction`, `BankTransaction`, `CreditNote`, `DebitNote`, `RecurringPlan`,
`TaxRate`, `BillingNotification`, `Customer`, `BillingAccount`.

New:
- `PaymentException` (tenant DB): `exceptionId`, `type`, `severity`, `status`,
  `reason`, `assignedTo`, `resolvedBy`, `resolution`, `amountMinor`, `dueAt`.
  Indexes: `{tenantId, exceptionId}` unique, `{tenantId,status,createdAt}`,
  `{tenantId,type}`, `{tenantId,'assignedTo.id'}`.
- `WebhookEndpoint` (tenant DB): `endpointId`, `url`, `events`, `active`, `secret`.
  Indexes: `{tenantId,endpointId}` unique, `{tenantId,active}`.
- `WebhookDelivery` (tenant DB): `deliveryId`, `eventId`, `eventType`, `status`,
  `attempts`, `responseStatus`, `nextRetryAt`, `payload`. Index:
  `{tenantId,endpointId,eventId}` unique (replay protection) plus status/createdAt
  and nextRetryAt.
- `ApiKey` (global DB): `keyId`, `keyHash`, `displayPrefix`, `permissions`,
  `expiresAt`, `revokedAt`. Unique on `keyId` and `keyHash`; `{tenantId,createdAt}`.

## API Routes

- `/api/billing/exceptions` GET (list) · POST (create) ·
  `/exceptions/:id` GET · `/exceptions/:id/assign|investigate|resolve|reopen`
- `/api/operations/queue` GET · `/api/operations/close` GET
- `/api/developer/api-keys` GET/POST · `/api-keys/:id/revoke|rotate`
- `/api/developer/webhooks` GET/POST · `/webhooks/:id` PATCH ·
  `/webhooks/:id/rotate-secret|test` · `/webhooks/:id/deliveries` GET ·
  `/webhooks/deliveries/:id/retry` POST

## RBAC

- **Viewer** — read-only across all new modules (list/queue/close view).
- **Finance Manager** — exception create/assign/investigate/resolve/reopen,
  webhook create/update/test/retry.
- **Company Admin** — API keys (create/revoke/rotate), webhook secret rotation,
  month-end close. Same for Super Admin.
- Entering exceptions via the API is server-side guarded with
  `requireRole(FinanceManager)`; API-key scopes map to the least-privilege role.

## Tenant Isolation

Every query filters by the server-resolved `tenantId` (exceptions, endpoints,
deliveries, keys, operations, close). API keys are scoped to one tenant; a key
for Tenant A can never resolve Tenant B.

## Events

- Verified Socket.IO tenant-room events:
  `exception:created`, `exception:updated`, `webhook:delivered`,
  `webhook:failed` (plus the pre-existing suite).
- All financial emissions remain inside `tenant:{id}` rooms.

## Security

- API keys hashed with SHA-256; raw keys returned exactly once.
- Signing secrets are high-entropy (`whsec_…`) and never returned in list
  responses; rotation returns the new secret once.
- Webhook payloads HMAC-SHA256 signed with a timestamp, tolerant to ±5min
  (validated by unit tests).
- `/developer/api-keys` and secret rotation require elevated roles; all
  mutation is audited.

## Testing

Unit/integration suites added (run with `npm test`):
`tests/sla.test.ts`, `tests/apiKey.test.ts`, `tests/webhook.test.ts`,
`tests/rbac.test.ts`, `tests/exception.test.ts` (28 tests).

Live E2E scripts: `scripts/e2e-enterprise.ps1` (queue, close, exceptions, API
keys, webhooks, viewer RBAC), `scripts/e2e-apikey.ps1` (auth/least-privilege/
revocation), `scripts/e2e-webhook.mjs` (signed delivery + retry).

## Failure Handling

- Webhook receiver timeouts (10s) and non-2xx responses schedule exponential
  backoff; deliveries exhaust after 5 attempts and surface in the operations
  queue. Manual retry resets the budget.
- Webhook dispatch is wrapped so a failing receiver never breaks the financial
  operation that triggered it.
- Exceptions can never be double-resolved (409) and reopening is audited.

## Deployment Considerations

- New tenant models are created lazily on the existing per-tenant connection
  (no migration tool required).
- `ApiKeyModel` auto-creates its collection/indexes in the global DB at boot.
- The webhook retry worker runs independently of Redis (60s sweep).
- Production: keep `REDIS_ENABLED` and `LOCK_FAILURE_POLICY=fail_closed` for
  the financial guarantees; seed accounts are development only.
