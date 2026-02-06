# Billing/Invoicing Mini-Service (Node.js + TypeScript)
[![CI](https://github.com/abdelrahmansapryalwtany/billing-invoicing-service-node-ts/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/abdelrahmansapryalwtany/billing-invoicing-service-node-ts/actions/workflows/ci.yml)

Production-ish mini-service for billing & invoicing built with **Express + TypeScript + PostgreSQL + Prisma + pg-boss**, including **PDF invoices**, **background jobs**, **Swagger docs**, and **integration tests** using **Testcontainers**.

## What it does

- **Charge management**: create, list, edit, and void (soft-delete) charges.
- **Atomic invoice generation**: generates invoices in a single DB transaction and marks charges as billed.
- **Idempotency**: invoice generation is idempotent per `(customerId, periodFrom, periodTo)`.
- **PDF invoices**: download a clean PDF via an endpoint (non-empty bytes).
- **Pending invoice notifications**: pg-boss scheduled job + manual trigger, logs mock “emails” to DB.

## Quick start (local)

Start Postgres:

```bash
docker compose up -d
```

Install deps + run migrations:

```bash
npm install
cp env.example .env  # don't commit this file
npx prisma migrate dev
```

Run the API:

```bash
npm run dev
```

Open docs:

- Swagger UI: `/docs`
- OpenAPI JSON: `/openapi.json`

## Example curl

### 1) Create a customer

```bash
curl -s -X POST http://localhost:3000/v1/customers \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Inc","email":"billing@acme.test","currency":"usd"}'
```

Copy the `id` from the response as `CUSTOMER_ID`.

### 2) Create a charge

```bash
curl -s -X POST http://localhost:3000/v1/charges \
  -H "Content-Type: application/json" \
  -d '{
    "customerId":"CUSTOMER_ID",
    "type":"service",
    "amount":2500,
    "currency":"usd",
    "description":"Consulting",
    "serviceDate":"2026-02-10"
  }'
```

### 3) Generate an invoice (idempotent)

```bash
curl -s -X POST http://localhost:3000/v1/invoices/generate \
  -H "Content-Type: application/json" \
  -d '{
    "customerId":"CUSTOMER_ID",
    "periodFrom":"2026-02-01",
    "periodTo":"2026-02-28",
    "taxRate":0.15,
    "issueNow":true
  }'
```

Run the same request again → you’ll get the **same invoice** back.

### 4) Download the PDF

```bash
curl -s -L "http://localhost:3000/v1/invoices/INVOICE_ID/pdf" -o invoice.pdf
```

## Jobs: pending invoices notifications

- **Scheduled**: pg-boss schedules `SEND_PENDING_INVOICES` every hour in `src/jobs/boss.ts`.
- **Manual trigger**:

```bash
curl -s -X POST http://localhost:3000/v1/notifications/pending-invoices/send \
  -H "Content-Type: application/json" \
  -d '{}'
```

This creates a `CommunicationLog` row and “sends” by logging to stdout and updating the log to `sent`.

## Running tests

Tests are integration-style and use **Testcontainers** (Postgres 16) + Prisma migrations.

```bash
npm test
```

## Definition of Done / Acceptance

- `npm install` then `npm run dev` works with docker Postgres.
- `/docs` loads and shows endpoints; `/openapi.json` returns OpenAPI JSON.
- Invoice generation is idempotent (same period returns same invoice).
- PDF endpoint returns valid PDF bytes (`Content-Type: application/pdf` and non-empty body).
- Pending invoices job + manual trigger creates `CommunicationLog` rows.
- `npm test` passes locally and in GitHub Actions.
- No secrets committed (`.env` is gitignored; `env.example` present).

