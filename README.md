# Shopping Karo

Multi-vendor e-commerce platform. Architecture: see [DESIGN.md](DESIGN.md).

## Prerequisites
Java 21, Maven 3.9+, Docker, Node 20 + pnpm (web app only).

## Local development
```bash
docker compose up -d     # postgres, mongo, redis, localstack
mvn test                 # build + test all backend modules
```
Layout: `libs/` (`sk-common`, `sk-contracts`), `services/` (Spring Boot microservices), `apps/web` (React), `infra/` (Terraform), `pipelines/` (Harness).

## Auth service (MongoDB)
```bash
mvn -pl services/auth-service -am package -DskipTests
java -jar services/auth-service/target/auth-service-0.1.0-SNAPSHOT.jar   # http://localhost:8081
pnpm --filter web dev                                                   # http://localhost:5173 (proxies /api/auth)
```
The service uses `MONGO_URI` (default `mongodb://localhost:27017/sk_auth`, i.e. a locally installed mongod).
To use the docker-compose Mongo instead: `MONGO_URI=mongodb://localhost:27018/sk_auth`.
Integration tests start their own MongoDB via Testcontainers (Docker must be running).

### Email (OTP + reset links) and Google sign-in
Create `services/auth-service/.env` (gitignored; read automatically at startup):
```
EMAIL_USER=<gmail address>
EMAIL_PASS=<gmail app password, 16 chars>
GOOGLE_CLIENT_ID=<oauth client id>
CLIENT_URL=http://localhost:5173
```
and `apps/web/.env.local` with `VITE_GOOGLE_CLIENT_ID=<same client id>`.
Without `EMAIL_USER`, emails are printed to the service log instead of being sent.
Google sign-in needs `http://localhost:5173` listed under "Authorized JavaScript origins" for the client in Google Cloud Console.

## Products, cart, orders and admin
Two Node.js (TypeScript, Express, Mongoose) services sit beside the Java auth service. They verify the auth service's JWTs
using its public keys (`/.well-known/jwks.json`), so they never call it per request.

| Service | Port | Mongo database | What it does |
|---|---|---|---|
| auth-service (Java) | 8081 | `sk_auth` | accounts, sign-in, tokens, admin bootstrap |
| catalog-service (Node) | 8082 | `sk_catalog` | public product browsing; admin add / edit / archive |
| cart-service (Node) | 8083 | `sk_cart` | one saved cart per signed-in user; merges the guest cart on sign-in |
| user-service (Java) | 8084 | `sk_user` | address book (up to 10 addresses, one default) |
| order-service (Java) | 8085 | `sk_order` | checkout, fake payment gateway (card / UPI / cash on delivery), order lifecycle, live updates (SSE), admin order management |

```bash
pnpm install
pnpm --filter @sk/node-common build                 # shared package, build once (and after changing it)
pnpm --filter catalog-service dev                   # http://localhost:8082
pnpm --filter catalog-service seed                  # one-off: loads 100 sample products (20 per category). Safe to re-run; never overwrites edits
pnpm --filter cart-service dev                      # http://localhost:8083
pnpm --filter web dev                               # http://localhost:5173 (proxies every /api/* route to its service)
pnpm -r test                                        # Node tests (Docker must be running; they start a throwaway MongoDB)
```

**Admin account:** set `ADMIN_EMAIL` (and `ADMIN_PASSWORD` for a new account) in `services/auth-service/.env`. At startup the
auth service creates that account (verified, ADMIN role) or promotes it if it already exists. Sign in, then open `/admin`.
There is no public way to become an admin. Sign out and in again after being promoted so your token carries the new role.

### Running the Java services
```bash
mvn install -DskipTests                                      # once, and after changing anything under libs/
cd services/auth-service  && mvn spring-boot:run             # 8081
cd services/user-service  && mvn spring-boot:run             # 8084
cd services/order-service && mvn spring-boot:run             # 8085
```
Each service reads its own `.env` (gitignored) from its folder.

**Stock reservation needs a shared secret.** order-service tells catalog-service to take or return stock through
`/internal/stock/*`. Put the same random `INTERNAL_API_KEY=...` (16+ characters) in `services/catalog-service/.env` and
`services/order-service/.env`. Without it the catalog's internal API stays switched off and checkout cannot reserve stock.

### How an order flows
1. **Checkout** (`POST /orders`): the server reads your saved cart, prices it from the catalogue, snapshots the chosen address and
   takes the stock (all-or-nothing). The order waits for payment for 15 minutes, then is cancelled and the stock returns.
2. **Pay** (`POST /orders/{id}/pay`): the fake gateway decides by card number (see the test-mode hints in the payment dialog, or
   `FakePaymentGateway.java`). Cash on delivery confirms immediately. A paid order empties the cart.
3. **Fulfil** (admin): Confirmed, Packed, Shipped, Delivered; or Cancelled before shipping (a paid order is refunded and the stock
   restored). Every change is pushed live to the admin dashboard and to the customer's open order page.
