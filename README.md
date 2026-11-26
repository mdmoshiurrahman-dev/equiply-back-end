# 🏗️ Equiply — Backend API

**Equiply** is a full-featured REST API backend for an **equipment rental marketplace**. Users can apply to become equipment **providers**, admins approve listing applications, and **renters** can browse, search, filter, favorite, book, and pay for equipment online through **Stripe Checkout**.

Built with **Node.js**, **Express 5**, **MongoDB**, and **Stripe**.

---

## 📑 Table of Contents

- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Running the Server](#-running-the-server)
- [Roles & Access Levels](#-roles--access-levels)
- [JWT Authentication](#-jwt-authentication)
- [API Reference](#-api-reference)
- [Payment Flow (Stripe)](#-payment-flow-stripe)
- [Database Collections](#-database-collections)
- [Security Notes](#-security-notes)
- [License](#-license)

---

## 🛠 Tech Stack

| Technology | Purpose |
|---|---|
| [Node.js](https://nodejs.org/) (ES Modules) | JavaScript runtime |
| [Express 5](https://expressjs.com/) | Web framework / REST API |
| [MongoDB](https://www.mongodb.com/) (native driver v7) | Database (Atlas replica set) |
| [Stripe](https://stripe.com/) (Node SDK v23) | Checkout payments & webhooks |
| [jose](https://www.npmjs.com/package/jose) | JWT verification with remote JWK sets |
| [CORS](https://www.npmjs.com/package/cors) | Cross-origin resource sharing |
| [dotenv](https://www.npmjs.com/package/dotenv) | Environment configuration |

---

## ✨ Features

- 🔐 **JWT + session authentication** — protected routes require both an authorization session token and a verified JWT. JWTs are validated through the frontend application's remote JWKS endpoint.
- 🎟️ **Session-token authentication** — protected routes require an `Authorization: Bearer <token>` header validated against a `session` collection in MongoDB.
- 👥 **Role-based access control (RBAC)** — five roles: `none`, `pending`, `provider`, `renter`, `admin`. Admins approve or dismiss provider/renter applications and manage all users.
- 🧰 **Equipment listing management** — providers submit equipment applications, view their own listings, update or delete them; admins approve/reject/delete any listing.
- 🔎 **Public equipment catalog** — a public aggregation endpoint with **filtering** (category, rental type, price range, availability), **searching** (name/location), and **sorting** (recently added, oldest, price low→high, price high→low) using the MongoDB Aggregation Pipeline.
- 💳 **Stripe Checkout payments** — creates a Stripe Checkout session for bookings and handles the `checkout.session.completed` webhook to mark payments as paid and decrement equipment stock.
- ❤️ **Favorites** — renters can toggle equipment in/out of their favorites list.
- ⭐ **Reviews** — renters can leave ratings/comments; the latest 20 reviews are served publicly.
- 📊 **Admin statistics** — payment success/failure rate and top 6 equipment categories by count.

---

## 📂 Project Structure

The backend is intentionally simple — a single-file Express server:

```
backend/
├── index.js          # All routes, middleware, DB connection & Stripe logic
├── package.json      # Dependencies and npm scripts
├── .env              # Environment variables (NEVER commit this)
└── README.md
```

Inside `index.js` the code is organized in sections:

1. Middleware setup (CORS)
2. MongoDB connection & collections
3. Stripe webhook (before `express.json()` so the **raw body** is available for signature verification)
4. `verifyUser` session authentication middleware
5. `jsonWebTokenVerify` JWT verification middleware
6. User application / admin management routes
7. Equipment application & listing routes
8. Public catalog & featured routes
9. Payment & payment-record routes
10. Reviews, favorites & statistics routes
11. Server listener

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18 (uses top-level `await`, Express 5, ESM)
- A **MongoDB Atlas** cluster (or local MongoDB) connection string
- A **Stripe** account (secret key + webhook secret)

### Installation

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd backend

# 2. Install dependencies
npm install

# 3. Create a .env file in the project root (see next section)
```

### Environment Variables

Create a **`.env`** file in the `backend/` root with the following keys:

```env
# MongoDB Atlas connection string
MONGO_DB_CONNECT=mongodb://<username>:<password>@<cluster-hosts>/?ssl=true&replicaSet=<rs>&authSource=admin

# Stripe credentials (use test keys during development)
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx

# Frontend base URL used for Stripe success/cancel redirects
CLIENT_BASE_URL=http://localhost:3000

# Server port (optional, defaults to 5000)
PORT=5000
```

> ⚠️ **Never commit your `.env` file to Git.** Add it to `.gitignore` and rotate any keys that have been exposed.

---

## ▶️ Running the Server

```bash
npm start
```

You should see:

```
Mongodb connected successfully
server is running on  5000
```

Quick health check:

```bash
curl http://localhost:5000/
# → { "message": "server is running" }
```

---

## 👤 Roles & Access Levels

User accounts follow an application/approval lifecycle managed by admins:

```
none ──submit application──▶ pending ──admin approves──▶ provider | renter | admin
```

| Role | Meaning | Can do |
|---|---|---|
| `none` | Un-registered role (visitor) | Submit an application (`/update-user-data`, `/update-renter-data`) |
| `pending` | Application awaiting review | Waits for admin decision |
| `provider` | Equipment owner | Create/update/delete own equipment listings, view incoming payment records |
| `renter` | Customer | Book & pay for equipment, manage favorites, leave reviews, view payment history |
| `admin` | Administrator | Approve/dismiss applications, manage all equipment & users, view all payment records & stats |

**Authentication:** JWT-protected routes require both authentication headers:

```
Authorization: Bearer <session-token>
jwt-token: Bearer <jwt>
```

---

## 🔑 JWT Authentication

Equiply uses a two-layer authentication process for protected routes:

1. The MongoDB-backed `verifyUser` middleware validates the session token from:

   ```http
   Authorization: Bearer <session-token>
   ```

2. The `jsonWebTokenVerify` middleware validates the JWT from:

   ```http
   jwt-token: Bearer <jwt>
   ```

The JWT is verified using the application's JWKS URL:

```text
${CLIENT_BASE_URL}/api/auth/jwks
```

Example request headers:

```http
Authorization: Bearer mongodb-session-token
jwt-token: Bearer eyJhbGciOiJSUzI1NiIs...
```

Both tokens must be valid. Requests with missing or invalid tokens receive `401 Unauthorized`.

---

## 📡 API Reference

Base URL: `http://localhost:5000`
🔓 = public · 🔐 = requires session token + JWT · 🛡️ = role-restricted

### Health

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | 🔓 | Health check — returns `{ message: "server is running" }` |

### User Applications & Profile

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/update-user-data` | 🔐 (`none` only) | Submit a **provider** application |
| POST | `/update-renter-data` | 🔐 (`none` only) | Submit a **renter** application |
| GET | `/get-user-data/:id` | 🔐 | Get public profile fields for a user |
| GET | `/get-profile-info/` | 🔐 | Get the authenticated user's own profile |
| PATCH | `/update-profile-info` | 🔓 | Update a user's profile info (`userID` + fields in body) |

### Admin — Users & Applications

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/get-all-applicant-data` | 🔐 🛡️ admin | List all users with `pending` applications |
| PATCH | `/set-user-role/:action` | 🔐 🛡️ admin | Approve/dismiss an applicant. `:action` = `provider` \| `dismissRequest` |
| GET | `/all-users` | 🔐 🛡️ admin | List all users |
| GET | `/admin-action-user/:id/:action` | 🔐 🛡️ admin | Delete (`delete`) or set role (`admin`/`renter`/`provider`) for a user |

### Equipment Listings

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/equipment-application` | 🔐 🛡️ provider | Submit a new equipment application (status `pending`) |
| GET | `/equipment-application/list` | 🔐 🛡️ provider | List the provider's own equipment |
| PUT | `/equipment-application/update/:id` | 🔐 🛡️ provider/admin | Update an equipment listing (admin or owner only) |
| DELETE | `/delete-equipment/:id` | 🔐 🛡️ provider | Delete own equipment listing |
| GET | `/equipment-details/:id` | 🔐 | Get full details of one equipment |

### Admin — Equipment Moderation

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/all-equipment-application` | 🔐 🛡️ admin | View all equipment applications (any status) |
| PATCH | `/application-action/:action/:id` | 🔐 🛡️ admin | `:action` = `approve` \| `reject` |
| DELETE | `/delete/equipment/:id` | 🔐 🛡️ admin | Delete any equipment listing |

### Public Catalog (no auth required)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/all-application-public` | 🔓 | Approved equipment with filters & sorting |
| GET | `/latest-rental-equipments` | 🔓 | 6 most recently added approved listings (featured) |
| GET | `/top-six-category` | 🔓 | Top 6 categories with equipment counts |
| GET | `/most-used-category` | 🔓 | *(Not yet implemented)* |

**Query parameters for `/all-application-public`:**

| Param | Values | Example |
|---|---|---|
| `search` | free text (matches name/location) | `?search=drill` |
| `category` | a category, or `all-categories` | `?category=Power%20Tools` |
| `rental_type` | a rental type, or `all-rental-types` | `?rental_type=daily` |
| `price_range` | `from-to`, or `all-prices` | `?price_range=10-50` |
| `availability` | `available` \| `unavailable` | `?availability=available` |
| `sort_by` | `recently-added` \| `oldest-first` \| `price-low-to-high` \| `price-high-to-low` | `?sort_by=price-low-to-high` |

### Payments (Stripe)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/webhooks/stripe` | 🔓 (Stripe-signed) | Stripe webhook — verifies signature, marks payment `paid`, decrements stock |
| POST | `/payment` | 🔐 🛡️ renter | Create a payment record + Stripe Checkout session |
| GET | `/get-payment-record/:id` | 🔐 | Get a booking/payment record (requester only) |
| GET | `/get-payment-history` | 🔐 | The renter's own payment history |
| GET | `/get-payment-record` | 🔐 🛡️ provider | All payment records for the provider's equipment |
| GET | `/get-user-payment-record/:id` | 🔐 🛡️ provider | One payment record for a provider's equipment |
| GET | `/get-payment-record-as-admin` | 🔐 🛡️ admin | All payment records |
| GET | `/payment-success-failed-rate` | 🔓 | Payment success/failed/total counts |

**`POST /payment` request body (example):**

```json
{
  "equipmentId": "665f1c9e8a2b3c4d5e6f7081",
  "productName": "Bosch Cordless Drill",
  "requiredQuantity": 2,
  "rentalStartDate": "2025-01-10",
  "rentalEndDate": "2025-01-15",
  "rentalDays": 5
}
```

The response is a Stripe Checkout **session object** — redirect the user to `session.url` to complete payment. On success the frontend is sent to `${CLIENT_BASE_URL}/payment/success?bookingId=...` (or `/payment/cancel` on cancel).

### Favorites (renters)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/add-to-favorite` | 🔐 | Toggle an equipment in/out of the user's favorites (`{ "id": "<equipmentId>" }`) |
| GET | `/get-favorite/:id` | 🔐 | Check whether an equipment is in the user's favorites (`{ found: true/false }`) |
| GET | `/get-fev-equipments` | 🔐 | All favorited equipment documents for the user |
| DELETE | `/delete-fev-item/:id` | 🔐 | Remove one equipment from favorites |

### Reviews

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/get-retting` | 🔐 | Submit a rating/comment (timestamped server-side) |
| GET | `/user-reviews` | 🔓 | Latest 20 reviews |

---

## 💳 Payment Flow (Stripe)

```
Renter selects equipment
        │
        ▼
POST /payment  ──▶ creates paymentRecord (payment: "pending")
        │             total = price × quantity × rentalDays
        ▼
Stripe Checkout Session created (metadata: bookedId, bookingProductId, quantity)
        │
        ▼
User pays on Stripe-hosted page
        │            success ──▶ {CLIENT_BASE_URL}/payment/success?bookingId=...
        │            cancel  ──▶ {CLIENT_BASE_URL}/payment/cancel?bookingId=...
        ▼
Stripe fires checkout.session.completed
        │
        ▼
POST /api/webhooks/stripe  (raw body + STRIPE_WEBHOOK_SECRET signature check)
        │
        ├─ paymentRecord: payment "pending" ➜ "paid"
        └─ equipment stock: equipmentQuantity − quantity
```

> ⚠️ The webhook route must receive the **raw request body**, which is why `express.raw()` is mounted on `/api/webhooks/stripe` **before** the global `express.json()` middleware.

**Local webhook testing (optional):**

```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```

---

## 🗄 Database Collections

Database name: **`Equiply`**

| Collection | Purpose |
|---|---|
| `user` | User accounts: profile fields + `role` (`none`/`pending`/`provider`/`renter`/`admin`) |
| `session` | Active login sessions — maps auth `token` → `userId` (drives `verifyUser`) |
| `equipments` | Equipment listings with `status` (`pending`/`approve`/`reject`), price, quantity, category, images, terms, `creatorId` |
| `paymentRecord` | Bookings: renter info, rental dates/days, quantity, `total`, `payment` status, `equepmentOwnerId` |
| `review` | Ratings & comments with `reviewDate` |
| `favorite` | Favorite links: `equipmentId` + `userId` (unique pair) |

---

## 🔒 Security Notes

- **Session authentication** uses session tokens stored in MongoDB, so revoking a session row instantly invalidates that session.
- **JWT authentication** uses `jose.jwtVerify` and a remote JWK set from `${CLIENT_BASE_URL}/api/auth/jwks`. JWKS public keys are fetched dynamically and used to verify the JWT signature.
- **Dual-header authentication** requires both `Authorization: Bearer <session-token>` and `jwt-token: Bearer <jwt>` for JWT-protected routes.
- **Stripe webhook** signature is verified with `constructEvent` against `STRIPE_WEBHOOK_SECRET`.
- CORS is currently **fully open** (`cors()` with no options) — restrict the origin to your frontend domain for production.
- Secrets live in `.env` — keep it out of version control and never commit real keys.

---

## 📄 License

This project is licensed under the **ISC License** — see the [`license`](https://opensource.org/licenses/ISC) field in `package.json`.

---

*Made with Node.js, Express, MongoDB & Stripe ⚡*
