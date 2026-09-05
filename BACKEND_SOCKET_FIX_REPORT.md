# LedgerGuard — Backend + Socket.IO Connection Fix Report

Date: 2026-08-29 · Final status: **FIXED — BACKEND + SOCKET.IO VERIFIED**

---

## 1. Root Cause

Two contributing causes, both fixed:

1. **Dead backend process** — the previous backend instance was not running, so
   the Vite dev proxy got `ECONNREFUSED` on `/socket.io/?EIO=4&transport=polling`
   (and would equally fail on `/api/*`). The old `server.ts` made this *silent*:
   in development, a bootstrap failure (Mongo/Redis/seed) logged an error and
   **kept the process alive without ever listening** — matching the reported
   "stops after `tsx watch src/server.ts`" symptom.
2. **IPv6/IPv4 `localhost` mismatch (latent, intermittent)** — the backend binds
   `0.0.0.0` (IPv4 only), while the Vite proxy targets `http://localhost:4000`.
   Node ≥ 17 can resolve `localhost` to `::1` first, which intermittently
   produces `ECONNREFUSED` even while the backend is perfectly healthy.

## 2. Files Inspected
- `frontend/vite.config.ts` + compiled `vite.config.js` (proxy, chunks)
- `frontend/src/lib/realtime.ts` (Socket.IO client singleton)
- `frontend/src/lib/api.ts` (base URL + refresh interceptor)
- `backend/src/server.ts` (bootstrap), `backend/src/app.ts`
- `backend/src/sockets/index.ts` + `eventBus.ts` (server wiring, JWT auth, rooms)
- `backend/src/config/index.ts` (port/host/CORS defaults), `backend/.env`
- `backend/package.json` (predev stale-process cleanup script)

## 3. Files Modified
| File | Change |
| ---- | ------ |
| `backend/src/server.ts` | Bootstrap failure now exits (all envs); `server.on('error')` logs `EADDRINUSE` with the actual port and exits; `unhandledRejection` / `uncaughtException` handlers with graceful shutdown |
| `frontend/vite.config.ts` | Proxy targets `http://localhost:4000` → `http://127.0.0.1:4000` (deterministic IPv4) |
| `frontend/vite.config.js` | Same fix (this compiled copy wins in Vite's config resolution order) |

## 4. Backend Startup Fix
`npm run dev` now produces the full sequence every time, verified live:
Global DB connected → Redis connected/ping OK → tenant connection → seed →
2 workers → **LedgerGuard API listening on 0.0.0.0:4000**. Any failure now
exits loudly with the cause (no silent half-initialized state).

## 5. Socket.IO Fix
No structural change was needed — Socket.IO is attached to the same HTTP
server (`attachSockets(server)`) at `/socket.io` on port 4000. Verified:
polling handshake `200 {"sid":…,"upgrades":["websocket"]}` and a full
**websocket upgrade through the Vite proxy**.

## 6. CORS Fix
Correct as-is: `CORS_ORIGIN` (default `http://localhost:5173`) is applied to
both Express `cors()` and the Socket.IO server. Explicit origin list — no
wildcard-with-credentials. No changes required.

## 7. Vite Proxy Fix
`/api` → `127.0.0.1:4000`, `/socket.io` → `127.0.0.1:4000` with `ws: true`
(already present). The IPv4 pin removes the intermittent `::1` resolution
failure. No hardcoded frontend URLs — the Socket.IO client keeps using
same-origin defaulting (`io()`), so it works identically proxied in dev and
same-origin in production.

## 8. Authentication Compatibility
Untouched and verified: Socket.IO JWT middleware verifies the access token and
resolves `userId`/`tenantId` **from the verified token only**; rooms remain
`user:{id}` and `tenant:{tenantId}`; no client-provided tenant is trusted.

## 9. Redis Status
`redis://localhost:6379` connected, ping OK, distributed locking active.
Degraded mode (locking unavailable) remains honest and non-silent; no in-memory
substitution for financial locks.

## 10. MongoDB Status
Replica set `rs0` up on `127.0.0.1:27018`; `ledgerguard_global` connected;
tenant DB `lg_ledgerguard_platform` connected; transactions reported
supported on the admin health endpoint.

## 11. Health Endpoint
Pre-existing (Phase 4) endpoints verified, none duplicated:
- `GET /health/live` → 200 `{status:"alive"}`
- `GET /api/health/ready` → 200 `{checks:{database:ok,redis:ok}}` (503 when degraded)
- `GET /api/health` → SuperAdmin-only detailed report (401 unauthenticated)

## 12. Tests Executed (live, end-to-end through the Vite proxy)
| Step | Result |
| ---- | ------ |
| `npm run dev` backend boots fully | ✅ all startup log lines present |
| `npm run dev` frontend on 5173 | ✅ |
| `GET /socket.io/?EIO=4&transport=polling` via 5173 | ✅ 200 + sid, **no ECONNREFUSED** |
| WebSocket upgrade via proxy | ✅ `transport=websocket` |
| `POST /api/auth/login` via proxy | ✅ 200, JWT issued, tenant resolved |
| Customer + invoice creation via proxy | ✅ 201 / 201 |
| Real-time `invoice:created` received on tenant room | ✅ `REALTIME_E2E_PASS` |
| Server-side tenant scoping in logs | ✅ `Socket connected: user=… tenant=ledgerguard-platform` |
| Clean disconnect (no listener leaks) | ✅ |

## 13. Build Results
- `backend` `tsc --noEmit` → **exit 0**
- `frontend` `tsc --noEmit` → **exit 0**
- `frontend` `vite build` → **exit 0**
- `npm run verify:analytics` → **30 passed, 0 failed**

## 14. Remaining Warnings
- The backend runs under `tsx watch` in development; it is a foreground process.
  If the terminal/session that started it closes, the process stops — restart
  with `npm run dev` (the predev script cleans stale port-4000 holders first).
- Production deployments should terminate TLS at a reverse proxy and set
  `CORS_ORIGIN` to the real frontend origin (documented in `.env.example`).

## Final Status

**FIXED — BACKEND + SOCKET.IO VERIFIED**

The complete chain Frontend (5173) → Vite proxy → Backend (4000) →
Socket.IO (`4000/socket.io`, websocket upgrade) → Redis (6379) →
MongoDB replica set (27018) was tested live, including authentication,
tenant resolution, tenant-scoped real-time event delivery, and clean
disconnect. No functionality was removed or faked; Phase 1–4 regression
checks pass.
