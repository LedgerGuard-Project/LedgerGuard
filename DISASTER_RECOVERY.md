# LedgerGuard — Disaster Recovery & Operational Readiness

> Status: **Production readiness documentation** (Phase 4, Part 25).
> This document describes recovery strategy and procedures. It does not
> introduce an automated backup service — schedule jobs below with your own
> infrastructure (cron / Kubernetes CronJob / cloud provider tooling).

---

## 1. Objectives

| Metric | Target | Notes |
| ------ | ------ | ----- |
| **RPO** (Recovery Point Objective) | ≤ 15 min | MongoDB replica-set oplog incremental backups or continuous snapshotting |
| **RTO** (Recovery Time Objective) | ≤ 60 min | Restore Mongo dump, restart API tier; stateless services recover in minutes |

Stateless components (API servers, frontend assets, background workers) are
disposable. **All durable state lives in MongoDB; Redis is not authoritative**
(see §5).

---

## 2. MongoDB Backup Strategy

### 2.1 Topology requirement

Financial multi-document ACID transactions require a **replica set** (a
single-node RS is fine for small installs). Standalone servers will show
`dependencies.database.transactionsSupported: false` on the admin health
endpoint — surfaced intentionally, never silently degraded.

```bash
mongod --dbpath /data/lg --port 27017 --replSet lg-rs --bind_ip 127.0.0.1
mongosh --eval "rs.initiate()"
```

### 2.2 Scheduled dumps

```bash
# Full nightly, retain 14 days (plus weekly/monthly per policy)
mongodump --uri="mongodb://<user>:<pass>@host:27017/?replicaSet=lg-rs&authSource=admin" \
  --gzip --archive=/backups/lg-$(date +%F).archive.gz

# Incremental every ~15 min via oplog timestamps of last dump,
# or PITR snapshots if running Atlas / Cloud Manager.
```

### 2.3 Per-tenant layout
---

## 3. Restore Strategy

### 3.1 Full environment loss

1. Provision hosts/DNS/secrets manager entries (§6 inventory).
2. Start MongoDB replica set; `mongorestore` latest full archive, replay
   oplog incrementals to target timestamp (`--oplogReplay`).
3. Restore secrets (`JWT_SECRET`, `MONGO_URI`, etc.) from the store.
4. Build & start API tier + workers; gate traffic on `/api/health/ready` → `200`.

### 3.2 Single corrupted tenant

Restore that tenant's database into a scratch instance, extract needed
collections, re-import per-namespace. Freeze writes for the tenant while repairing.

### 3.3 Integrity validation post-restore

Ledger reconciliation is the built-in corruption detector — run it
(FinanceManager+ scope) and require a clean report before resuming writes or
restarting workers.

---

## 4. Secret & Environment Recovery

All secrets must live in a **secrets manager** (or encrypted offline copy of the
inventory). Required items mirror `backend/.env.example`: `MONGO_URI`,
`JWT_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL`, `PLATFORM_ADMIN_*`,
`CORS_ORIGIN`, TLS certs, registry credentials.

Rotation: rotating `JWT_SECRET` invalidates access tokens only (short expiry,
auto-refresh). Rotating `JWT_REFRESH_SECRET` forces global re-login — maintenance
window operation.

---

## 5. Redis Recovery

Redis holds **non-authoritative** data: analytics cache, distributed locks,
idempotency markers, rate-limit counters, worker coordination.

- Loss is survivable; services degrade per `LOCK_FAILURE_POLICY`
  (`fail_closed` = refuse money movement without locks — recommended in
  production; `fail_open` = proceed with alerts).
- Idempotency markers have bounded TTL (`IDEMPOTENCY_TTL_SECONDS`); durable
  protection comes from unique DB constraints on idempotency keys as the second line of defence.
- Empty-start Redis is fine; caches repopulate lazily under tenant-prefixed keys
  (`analytics:{tenantId}:...`). No manual warm-up required.

---

## 6. Failure Scenario Runbooks

| Scenario | Detection | Immediate action | Recovery |
| -------- | --------- | ---------------- | -------- |
| Primary Mongo down | `/api/health/ready` non-200, `DATABASE_ERROR` responses | Pause workers | RS election typically automatic; verify health then resume |
| Replica lag high | Monitoring | Read-only mode | Catch up members; throttle writes |
| Redis down | Health page `redis.state ≠ ready`; payments blocked when `fail_closed` (by design) | None destructive | Restart Redis; clear incident when ping passes |
| Worker crash loop | System health job telemetry `lastOk=false` | Disable that job type via config | Fix cause, redeploy, re-enqueue missed scheduled work |
| Bad deploy | Error-rate spike | Roll back image/build | Verify migrations additive-only before rollback |
| Suspected data loss / cross-tenant exposure | Tenant report or security events | **Freeze writes immediately** (S1) | Follow §7, then post-restore reconciliation |

Declare severity at detection (S1 data loss/security, S2 payments unavailable,
S3 degraded), assign an owner, track timeline in the Incident Center.

---

## 7. Tenant Recovery Checklist

1. Confirm tenant record in global DB (`tenantId`, `databaseConnection`).
2. Restore that tenant's dedicated DB archive.
3. Run reconciliation for the tenant; investigate any imbalance.
4. Tenant admin verifies dashboard figures against last known-good export.
5. Close incident with full timeline.

---

## 8. Maintenance Operations

Graceful shutdown is implemented end-to-end (HTTP server drain + Socket.IO close
+ worker stops + DB disconnects on SIGTERM), so rolling deploys are safe. Review
new indexes with `explain()` before rollout to large tenants; do not run
destructive migrations automatically (see Part 40 policy).


The global DB holds platform metadata (tenants, subscriptions); each tenant has
a dedicated database named by its `databaseConnection` field. A full-instance
dump captures all tenants; restore single tenants via per-database `--nsFrom/--nsTo`.

### 2.4 Verification

Backups are worthless until restored — run a quarterly drill into a scratch
instance (`mongorestore --uri=... --drop --gzip --archive=...`) and record the
measured duration against RTO.
