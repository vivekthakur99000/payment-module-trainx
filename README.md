# Trainx Payment Module

A TypeScript/Express payment API using Cashfree for checkout, PostgreSQL for persistence, and Prisma ORM 7 for data access.

## Requirements

- Node.js (the project uses ESM and TypeScript)
- PostgreSQL database
- Cashfree sandbox credentials (or production credentials when deploying)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root:

   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
   CASHFREE_APP_ID="your_cashfree_app_id"
   CASHFREE_SECRET_KEY="your_cashfree_secret_key"
   PORT=3000
   ```

   Replace the database connection details with your PostgreSQL credentials and use the Cashfree credentials for the environment selected in `config/cashfree.ts`. Keep `.env` private; it is excluded from Git.

3. Apply the Prisma schema to the database and generate the client:

   ```bash
   npx prisma migrate dev
   ```

   The Prisma CLI loads `DATABASE_URL` from `.env` through `prisma7.config.ts`.

4. Start the API:

   ```bash
   npm start
   ```

   By default, the server listens on `http://localhost:3000`. Set `PORT` in `.env` to use another port.

## API

The routes are mounted under `/api`. Examples below use `http://localhost:3000` as the base URL.

### `POST /api/create-order`

Creates or finds a student, stores a pending order, and requests a Cashfree payment session.

Request:

```json
{
  "amount": 1500.5,
  "customerPhone": "9876543210",
  "customerEmail": "student@example.com",
  "customerName": "Example Student"
}
```

Successful response:

```json
{
  "message": "Order created successfully",
  "orderId": "the-database-order-id",
  "paymentSessionId": "cashfree-payment-session-id"
}
```

Use `paymentSessionId` with the Cashfree checkout flow. The `orderId` is the database order ID and is also sent to Cashfree as its order ID.

### `POST /api/webhook`

Cashfree sends payment event notifications to this endpoint. Configure this URL in the Cashfree dashboard using a publicly reachable HTTPS URL when deployed. The server requires the `x-webhook-signature` and `x-webhook-timestamp` headers and verifies them against the exact raw request body.

Illustrative event body (Cashfree controls the actual payload):

```json
{
  "type": "PAYMENT_SUCCESS_WEBHOOK",
  "event_time": "2026-10-06T12:00:00Z",
  "data": {
    "order": {
      "order_id": "the-database-order-id"
    },
    "payment": {
      "cf_payment_id": "cashfree-payment-id",
      "payment_amount": 1500.5,
      "payment_status": "SUCCESS",
      "payment_group": "upi"
    }
  }
}
```

Do not call this endpoint from a browser or construct webhook headers yourself; payment notifications must come from Cashfree with a valid signature.

### `GET /api/status/:orderId`

Returns the locally stored status. If the order is still pending, the API checks Cashfree for payment attempts and synchronizes a successful payment.

Example:

```http
GET /api/status/the-database-order-id
```

Example response:

```json
{
  "status": "PENDING"
}
```

The status may also be `PAID`, `EXPIRED`, or `FAILED`, depending on the stored order state.

## Payment workflow and design decisions

1. The create-order endpoint finds or creates the student, saves a pending order in PostgreSQL, then requests a Cashfree payment session.
2. `Order` and `Payment` are separate records. An order represents the intent to pay; related payment records can represent individual attempts, including failures, without creating a new order for each retry. The current webhook and fallback handlers synchronize successful attempts.
3. Cashfree webhooks are verified using the raw request body and the gateway signature before their contents are trusted. This protects payment status updates from forged notifications.
4. The status endpoint provides fallback polling: if webhook delivery is delayed or lost because of a network issue, it fetches payment attempts from Cashfree and synchronizes a successful payment locally.

## Project structure

- `index.ts` configures Express middleware and mounts the API router.
- `routes/payment.routes.ts` maps API paths to controller handlers.
- `controller/payment.controller.ts` handles order creation and status polling.
- `controller/webhook.controller.ts` verifies and processes Cashfree webhook events.
- `config/` contains the Prisma and Cashfree client setup.
- `prisma/` contains the schema and database migrations.

## Useful commands

```bash
npm start
npx prisma migrate dev
npx prisma generate
```
