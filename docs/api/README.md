# LedgerGuard — API Reference

Base URL: `/api` (backend on port `4000` by default).

## Authentication

All endpoints except `POST /auth/register` and `POST /auth/login` require a bearer token:

```
Authorization: Bearer <JWT>
```

### POST `/auth/register`
Creates a new user account. Returns a JWT.

```json
{ "name": "Ada", "email": "ada@example.com", "password": "supersecret", "role": "viewer" }
```

### POST `/auth/login`
Authenticates and returns a JWT plus the user profile.

### GET `/auth/me`
`auth` — returns the currently authenticated user.

## Accounts — `/accounts` (auth)

| Method | Path           | Description                          |
| ------ | -------------- | ------------------------------------ |
| GET    | `/`            | List accounts (add `?includeArchived=true`) |
| POST   | `/`            | Create an account                    |
| GET    | `/:id`         | Get a single account                 |
| PATCH  | `/:id`         | Update name/type/currency            |
| POST   | `/:id/archive` | Archive an account                   |

Create payload:
```json
{ "name": "Checking", "type": "asset", "currency": "USD" }
```

## Transactions — `/transactions` (auth)

| Method | Path | Description                  |
| ------ | ---- | ---------------------------- |
| GET    | `/`  | List (paginated, filterable) |
| POST   | `/`  | Create a transaction         |

Query filters: `accountId`, `categoryId`, `type` (`income|expense|transfer`),
`from`, `to`, `page`, `perPage`.

Create payload:
```json
{
  "type": "expense",
  "accountId": "64f....",
  "categoryId": "64f....",
  "amount": 1299,
  "currency": "USD",
  "note": "Groceries"
}
```
Transfers additionally require `toAccountId`:

```json
{ "type": "transfer", "accountId": "A", "toAccountId": "B", "amount": 5000 }
```

## Categories — `/categories` (auth)

| Method | Path     | Description          |
| ------ | -------- | -------------------- |
| GET    | `/`      | List categories      |
| POST   | `/`      | Create a category    |
| PATCH  | `/:id`   | Update a category    |
| DELETE | `/:id`   | Delete a category    |

## Reports — `/reports` (auth)

| Method | Path               | Description                          |
| ------ | ------------------ | ------------------------------------ |
| GET    | `/balance`         | Income/expense/total summary (optional `from`,`to`) |
| GET    | `/accounts/:id/trail` | Recent activity trail for an account |

## Health

| Method | Path       | Description            |
| ------ | ---------- | ---------------------- |
| GET    | `/health`  | Liveness/uptime check  |

## Error format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed: name: Required",
    "details": ["name: Required"]
  }
}
```

Common codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `DUPLICATE_KEY`, `RATE_LIMITED`.
