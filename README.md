# LedgerGuard

**LedgerGuard** is a self-hosted, double-entry bookkeeping and personal/corporate financial ledger
platform. It provides a modern React frontend, a Node.js/Express + TypeScript API, a MongoDB data
layer, per-user authentication, and real-time balance tracking.

> ⚠️ **Status:** Scaffold / initial setup. Endpoint wiring and UI screens are progressively being
> implemented on top of this structure.

---

## Monorepo Layout (npm workspaces)

```
ledgerguard/
├── frontend/            # React + Vite + TypeScript SPA
│   └── src/
│       ├── components/  # Reusable UI components
│       ├── pages/       # Route-level screens
│       ├── layouts/     # App / Auth layout wrappers
│       ├── hooks/       # Custom React hooks
│       ├── services/    # API client & data services
│       ├── store/       # Redux Toolkit slices & store
│       ├── types/       # Shared frontend TypeScript types
│       ├── utils/       # Helper functions
│       ├── assets/      # Static assets (images, styles)
│       └── routes/      # Routing configuration
├── backend/             # Express + TypeScript API
│   └── src/
│       ├── config/      # Environment & app config
│       ├── controllers/ # Request handlers
│       ├── middleware/  # Auth, validation, error handling
│       ├── models/      # Mongoose models
│       ├── routes/      # Express route definitions
│       ├── services/    # Business logic
│       ├── database/    # Connection bootstrapping
│       ├── security/    # Password hashing, JWT, sanitisation
│       ├── sockets/     # WebSocket layer
│       ├── workers/     # Background jobs
│       ├── utils/       # Shared helpers
│       └── types/       # Backend TypeScript types
├── shared/              # Shared types & constants
│   ├── types/
│   └── constants/
├── docs/                # Architecture, API & DB docs
│   ├── architecture/
│   ├── api/
│   └── database/
├── docker/              # Dockerfiles
├── docker-compose.yml   # Local infra (mongo, redis, api, web)
└── package.json         # Root workspace scripts
```

---

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **MongoDB** (local or via Docker) 
- **Redis** (optional, used by queue/workers & rate limiting)

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend (optional; has sensible defaults)
cp frontend/.env.example frontend/.env
```

### 3. Start an infra stack (Mongo + Redis) — recommended

```bash
docker compose up -d mongo redis
```

Or point `MONGO_URI` in `backend/.env` at an already-running MongoDB instance.

### 4. Run in development

```bash
npm run dev
```

This starts the backend on `http://localhost:4000` and the frontend on
`http://localhost:5173` concurrently.

---

## Available Scripts (root)

| Command               | Description                              |
| --------------------- | ---------------------------------------- |
| `npm run dev`         | Run backend + frontend in watch mode     |
| `npm run dev:backend` | Run only the backend                     |
| `npm run dev:frontend`| Run only the frontend                    |
| `npm run build`       | Build shared, backend & frontend         |
| `npm run start`       | Start the built backend                  |
| `npm run typecheck`   | Type-check all workspaces                |
| `npm run lint`        | Lint all workspaces                      |
| `npm test`            | Run tests in all workspaces              |

---

## Documentation

- [Architecture](./docs/architecture/overview.md)
- [API Reference](./docs/api/README.md)
- [Database Schema](./docs/database/schema.md)

---

## License

Proprietary / internal use. All rights reserved.
