# OctoSupply API (TypeScript)

Express + TypeScript reference implementation of the OctoSupply API. The C#, Python, and Java variants are ports of this service.

## Run

```bash
npm install
npm run dev
```

Default API URL: `http://localhost:3000`

## Environment

- `PORT` (default: `3000`)
- `DB_FILE` (default: `./data/app.db`)
- `API_CORS_ORIGINS` (comma-separated override; optional)
- `DB_ENABLE_WAL` (enable WAL mode; default: `true`)
- `DB_FOREIGN_KEYS` (enforce foreign keys; default: `true`)
- `DB_TIMEOUT` (busy timeout in ms; default: `30000`)

## Database

On startup, the API applies SQL migrations from:

- `../database/migrations/*.sql`

and seeds from:

- `../database/seed/*.sql`

## OpenAPI

- OpenAPI JSON: `http://localhost:3000/api-docs.json`
- Swagger UI: `http://localhost:3000/api-docs`

## Order history

`GET /api/orders?branchId=1` returns the branch's orders newest first (descending
order ID breaks date ties). Each order includes its existing fields, a `total`
rounded to two decimal places, and `orderDetails` with `productId`, `productName`,
`quantity`, and the stored `unitPrice` (not the product's current catalog price).
Line items also include `orderDetailId`, `orderId`, and nullable `notes`.

History is paginated by order: `limit` defaults to 50 (maximum 100), and `offset`
defaults to 0. For example: `GET /api/orders?branchId=1&limit=20&offset=20`.
Each returned order always contains all its line items. No matching orders,
including an unknown branch, returns `200` with `[]`. Orders without line items
have `orderDetails: []` and `total: 0`. Invalid IDs or pagination return `400`.
`limit` and `offset` require `branchId`.

Branches represent customers in the current data model; no separate customer
identifier or authentication is implemented. Branch filtering is not authorization.
The existing unfiltered `GET /api/orders` and other CRUD endpoints are unchanged.
The shared frontend's `/orders` page uses this TypeScript endpoint. The other API
variants do not yet implement the history response.

## Tests

Run TypeScript tests from the `src/` directory:

```bash
make test-ts
```
