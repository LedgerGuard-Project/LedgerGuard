# LedgerGuard — Database Schema

Database: MongoDB (Mongoose ODM). Collections and key fields below.

## users

| Field         | Type      | Notes                               |
| ------------- | --------- | ----------------------------------- |
| `_id`         | ObjectId  | primary key                         |
| `name`        | String    | required, trimmed                   |
| `email`       | String    | required, unique, lowercased        |
| `passwordHash`| String    | bcrypt hash (never exposed via JSON)|
| `role`        | String    | `admin` | `manager` | `viewer`       |
| `isActive`    | Boolean   | default true                        |
| `createdAt`/`updatedAt` | Date | timestamps                     |

## accounts

| Field      | Type     | Notes                              |
| ---------- | -------- | ---------------------------------- |
| `_id`      | ObjectId | primary key                        |
| `userId`   | ObjectId | ref `User`, indexed                |
| `name`     | String   | unique per user                    |
| `type`     | String   | `asset|liability|equity|revenue|expense` |
| `currency` | String   | ISO 4217 (default `USD`)           |
| `balance`  | Number   | integer in smallest unit, default 0|
| `isArchived` | Boolean | default false                    |

Unique index: `{ userId: 1, name: 1 }`.

## transactions

| Field       | Type     | Notes                                   |
| ----------- | -------- | --------------------------------------- |
| `_id`       | ObjectId | primary key                             |
| `userId`    | ObjectId | ref `User`, indexed                     |
| `type`      | String   | `income|expense|transfer`               |
| `accountId` | ObjectId | ref `Account`                           |
| `toAccountId` | ObjectId | ref `Account` (transfers only)        |
| `categoryId`| ObjectId | ref `Category` (optional)               |
| `amount`    | Number   | positive integer in smallest unit       |
| `currency`  | String   | ISO 4217                                |
| `note`      | String   | optional, max 500                       |
| `recordedAt`| Date     | business date of the transaction        |

Indexes: `{ userId: 1, recordedAt: -1 }`, `{ userId: 1, accountId: 1 }`.

## categories

| Field       | Type     | Notes                             |
| ----------- | -------- | --------------------------------- |
| `_id`       | ObjectId | primary key                       |
| `userId`    | ObjectId | ref `User`, indexed               |
| `name`      | String   | unique per user                   |
| `kind`      | String   | `income` | `expense`               |
| `color`     | String   | optional hex colour               |

Unique index: `{ userId: 1, name: 1 }`.

## ledgerentries

The double-entry posting lines (currently maintained alongside transactions;
balances live on the account document).

| Field          | Type     | Notes                             |
| -------------- | -------- | --------------------------------- |
| `_id`          | ObjectId | primary key                       |
| `transactionId`| ObjectId | ref `Transaction`, indexed       |
| `accountId`    | ObjectId | ref `Account`, indexed            |
| `amount`       | Number   | signed numeric value              |
| `debit`/`credit`| Boolean | posting direction flags           |
| `recordedAt`   | Date     |                                   |

Index: `{ accountId: 1, recordedAt: -1 }`.

## Money convention

All monetary fields (`balance`, `amount`) are stored as **integers in the smallest
currency unit** (e.g. cents for USD) to avoid floating-point rounding errors.
Formatting to display units is performed in the frontend (`utils/format.ts`).
