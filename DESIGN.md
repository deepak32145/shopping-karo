# Shopping Karo — High Level Design (HLD)

| | |
|---|---|
| Status | Draft v0.3 (Java / Spring Boot) — open questions partly answered (§13); for review before any code is written |
| Author | deepak32145@gmail.com |
| Date | 2026-10-11 |
| Target | Production-grade MVP on AWS in ~4 weeks |

---

## 1. Goals and non-goals

### Goals
- Amazon-style multi-vendor marketplace: buyers, sellers, admins.
- Microservices backend, one React web app.
- Fully automated: infra as code, CI/CD via Harness, deploy to AWS, multiple environments.
- Production-grade basics: security, observability, backups, zero-downtime deploys, autoscaling.

### Non-goals (for the 1-month MVP)
- Native mobile apps, recommendation ML, ads, multi-region active-active, multi-currency/i18n, returns marketplace, seller financing.
- Own logistics network (we integrate with a shipping aggregator, e.g. Shiprocket, later).

### Reality check on scope
Amazon is thousands of services built over decades. In 4 weeks, one person/small team can ship a **thin vertical slice of every capability** with a production-grade platform underneath it. The architecture below is designed so the rest can be added service by service without rework. Section 12 gives the phased cut.

---

## 2. Key decisions (ADR summary)

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Backend language | **Java 21 + Spring Boot 3.4** | Owner's preferred stack; mature ecosystem (Spring Security, Spring Data JPA/Mongo, Resilience4j, Micrometer), strong typing, virtual threads. |
| 2 | Repo layout | **Monorepo**: Maven multi-module for backend (`libs/` + `services/`), pnpm for the React app only | Shared contracts/libs, one PR for cross-service change, simple CI for a solo developer. |
| 3 | Compute | **AWS ECS on Fargate** (not EKS) | No cluster ops, cheaper at this scale, autoscaling built-in. Services are containerised so EKS migration stays possible. |
| 4 | IaC | **Terraform** (modules, remote state in S3 + DynamoDB lock) | Industry standard, reviewable, multi-env. |
| 5 | CI/CD | **Harness** (CI + CD), GitHub as source, ECR as registry | As requested. Harness CI builds/tests/scans; Harness CD does rolling/canary deploys to ECS with approvals and rollback. |
| 6 | Databases | **Polyglot, DB-per-service**: PostgreSQL (RDS/Aurora) for transactional; MongoDB (Atlas) for catalog; Redis (ElastiCache) for cart/cache; OpenSearch for search | Right tool per access pattern; see §6. |
| 7 | Messaging | **SNS + SQS** with transactional outbox (Kafka/MSK deferred) | Cheap, managed, enough for MVP. Event contracts are broker-agnostic so MSK can replace later. |
| 8 | Sync API style | REST/JSON externally; REST (or gRPC later) internally | Simplicity first. OpenAPI spec per service. |
| 9 | Edge | CloudFront + WAF → ALB → **API Gateway service** (BFF) | Single public entry, auth, rate limit, routing. |
| 10 | Auth | Own **auth-service** issuing short-lived JWT (RS256) + rotating refresh tokens; RBAC roles BUYER / SELLER / ADMIN | Requirement explicitly wants a login service. Cognito is the fallback if we want to offload. |
| 11 | Payments | **Razorpay** (India) behind a payment-service adapter; Stripe pluggable | Gurgaon-based → UPI/cards/netbanking. |
| 12 | Consistency | **Saga (orchestrated)** for order placement; idempotency keys everywhere | No distributed transactions. |

---

## 3. System context

```
                    ┌────────────┐   ┌─────────────┐
                    │  Buyers    │   │ Sellers /   │
                    │  (browser) │   │ Admins      │
                    └─────┬──────┘   └──────┬──────┘
                          │  HTTPS          │
                  ┌───────▼─────────────────▼───────┐
                  │  CloudFront + WAF (static + API)│
                  └───────┬─────────────────┬───────┘
                          │                 │
                 S3 (React SPA)        ALB → API Gateway service
                                            │
        ┌──────────┬──────────┬─────────────┼───────────┬───────────┬──────────┐
        ▼          ▼          ▼             ▼           ▼           ▼          ▼
     auth/user  catalog    search        cart        order      payment   seller/admin ...
        │          │          │             │           │           │
     Postgres   MongoDB   OpenSearch      Redis     Postgres    Postgres
                    └──────────── SNS topics ◄── outbox ──► SQS queues ───────────┘

   External: Razorpay, SES/SNS (email/SMS), Shipping aggregator, S3 (images)
```

---

## 4. Microservices

Each service: own repo folder, own DB (no shared tables), own Dockerfile, own deploy pipeline, own OpenAPI + event schema.

| Service | Responsibility | Store | Key APIs / events |
|---|---|---|---|
| **api-gateway** | Routing, JWT verification, rate limiting, request aggregation (BFF for web), correlation IDs | Redis (rate limit) | — |
| **auth-service** | Register, login, logout, refresh, password reset, email/OTP verify, social login (later), RBAC claims, JWKS endpoint | Postgres | `UserRegistered` |
| **user-service** | Profile, addresses, preferences, wishlist | Postgres | `AddressChanged` |
| **catalog-service** | Products, categories, variants, attributes, media references, seller listings | MongoDB | `ProductCreated/Updated/Deleted` |
| **search-service** | Full-text search, filters, facets, autocomplete; indexes from catalog events | OpenSearch | consumes `Product*` |
| **inventory-service** | Stock per SKU/seller, reservations with TTL, release/commit | Postgres | `StockReserved`, `StockReleased`, `StockCommitted` |
| **pricing-service** *(phase 2)* | Price, discounts, coupons, tax (GST) calculation | Postgres | — |
| **cart-service** | Guest + logged-in cart, merge on login, price refresh | Redis (+ Postgres snapshot) | `CartCheckedOut` |
| **order-service** | Order lifecycle, saga orchestrator, order history, cancellations | Postgres | `OrderPlaced`, `OrderConfirmed`, `OrderCancelled` |
| **payment-service** | Payment intents, Razorpay webhooks, refunds, reconciliation | Postgres | `PaymentSucceeded/Failed`, `RefundIssued` |
| **shipping-service** | Shipment creation, tracking, delivery status webhooks | Postgres | `OrderShipped`, `OrderDelivered` |
| **seller-service** | Seller onboarding/KYC, store profile, product & stock management, payouts ledger, seller orders view | Postgres | `SellerApproved` |
| **admin-service** | Moderation (sellers/products), user management, order override, platform reports, config/feature flags | Postgres (+ reads via APIs/events) | — |
| **review-service** | Ratings and reviews, verified-purchase check | MongoDB | `ReviewPosted` |
| **notification-service** | Email (SES), SMS, push; template rendering; consumes events | Postgres/DynamoDB | consumes most events |
| **media-service** *(thin)* | Pre-signed S3 uploads, image resize pipeline (Lambda) | S3 | `MediaUploaded` |

> MVP can start with 10 of these: gateway, auth, user, catalog, search, inventory, cart, order, payment, seller, admin, notification. Others are phase 2 (see §12). Avoid more services than the team can operate; **fewer, well-bounded services beat a nano-service sprawl.**

### Service rules
1. A service owns its data; other services access it only via API or events.
2. No synchronous call chains deeper than 2 hops on the request path.
3. All writes that must publish an event use the **transactional outbox** (row in same DB txn → relay publishes to SNS).
4. All consumers are **idempotent** (dedupe on `eventId`).
5. All mutating APIs accept an `Idempotency-Key`.
6. Timeouts, retries with jitter, and circuit breakers on every outbound call.

---

## 5. Core flows

### 5.1 Place order (saga, orchestrated by order-service)

```
Buyer → Gateway → order-service: POST /orders (Idempotency-Key)
 1. order-service: create Order(PENDING) + outbox OrderPlaced
 2. inventory-service: reserve stock (TTL 15 min)      ── fail → Order(CANCELLED)
 3. payment-service: create payment intent             ── returns Razorpay order id to UI
 4. Buyer pays in browser → Razorpay → webhook → payment-service
 5. payment-service: PaymentSucceeded
 6. order-service: Order(CONFIRMED); inventory commit; cart cleared
 7. notification-service: confirmation email/SMS
 8. seller-service: appears in seller's order list; shipping-service creates shipment
Compensation: PaymentFailed / timeout → release reservation → Order(CANCELLED)
```

Order states: `PENDING → PAYMENT_PENDING → CONFIRMED → PACKED → SHIPPED → DELIVERED`; side paths `CANCELLED`, `RETURN_REQUESTED → REFUNDED`.

### 5.2 Search
Catalog write → `ProductUpdated` event → search-service consumer → OpenSearch index. Reads: UI → gateway → search-service. Catalog Mongo is the source of truth; index is rebuildable.

### 5.3 Login
`POST /auth/login` → access JWT (15 min) + refresh token (httpOnly, secure cookie, rotating, stored hashed). Gateway validates JWT using cached JWKS; passes `x-user-id`, `x-roles` to services. Services additionally verify authorization for their resources (sellers only see own data).

---

## 6. Data architecture

| Store | Used by | Rationale |
|---|---|---|
| **PostgreSQL** (Aurora/RDS, one cluster, **separate logical DB + role per service**) | auth, user, inventory, order, payment, shipping, seller, admin, pricing | ACID, relational integrity, money/stock correctness. |
| **MongoDB Atlas** (M10+ on AWS) | catalog, review | Flexible product attributes per category, nested variants, read-heavy. |
| **Redis** (ElastiCache) | cart, rate limit, session denylist, hot catalog cache | Low-latency ephemeral data. |
| **OpenSearch** | search | Relevance, facets, typo tolerance. |
| **S3** | images, invoices, exports | Cheap durable objects, served via CloudFront. |

**Single vs multiple instances:** start with *one* Aurora Postgres cluster hosting one database per service (logical isolation, one thing to operate/back up). Split a service onto its own cluster only when its load, blast-radius, or compliance needs justify it (likely first candidates: order, payment). Because no service reads another's tables, this split is a config change, not a rewrite.

### Core Postgres sketch (order-service)
```
orders(id, user_id, status, total_amount, currency, address_snapshot jsonb,
       idempotency_key unique, created_at, updated_at)
order_items(id, order_id, product_id, seller_id, sku, qty, unit_price, tax)
outbox(id, aggregate_id, type, payload jsonb, created_at, published_at)
```

### Catalog document sketch (Mongo)
```
{ _id, sellerId, title, description, categoryPath: [...],
  attributes: { brand, color, ... }, variants: [{ sku, price, mrp, attrs, images }],
  status: DRAFT|ACTIVE|BLOCKED, createdAt, updatedAt }
```

### Data rules
- Money = integer minor units (paise) + currency code. Never floats.
- Snapshot price/address into order at placement.
- PII (phone, address) encrypted at rest; passwords argon2id.
- Soft delete + audit columns on business entities.

---

## 7. Frontend

Single **React + TypeScript** SPA (Vite), three role-based areas in one app via route-level code-splitting:

- **Storefront**: home, search/listing, PDP, cart, checkout, orders, account.
- **Seller portal** (`/seller/*`): onboarding, listings, inventory, orders, payouts.
- **Admin console** (`/admin/*`): seller/product moderation, users, orders, reports.

Stack: React Router, TanStack Query (server state), Zustand (UI state), React Hook Form + Zod, Tailwind + a component kit (shadcn/ui), generated API client from OpenAPI. Hosting: S3 + CloudFront; each deploy = immutable build with cache-busted assets. Accessibility (WCAG AA) and Core Web Vitals budgets in CI (Lighthouse).

> If SEO on product pages matters, switch the storefront to Next.js later; the API contracts do not change.

---

## 8. AWS infrastructure

```
Account structure:  ONE AWS account (testing) — envs `dev` and `prod` separated by VPC + naming + tags
                    (multi-account dev/staging/prod is the target once this goes commercial)
Region:             ap-south-1 (Mumbai), DR backups to ap-southeast-1

VPC (3 AZ)
 ├─ public subnets:   ALB, NAT gateways
 ├─ private-app:      ECS Fargate tasks
 └─ private-data:     Aurora Postgres, ElastiCache, OpenSearch
Edge:    Route53 → CloudFront + WAF → ALB (path/host routing) → ECS services
Secrets: AWS Secrets Manager (+ KMS), injected at task start; no secrets in images/repo
Images:  ECR (scan on push)
Queues:  SNS topics + SQS queues + DLQs
Logs:    CloudWatch Logs; Metrics/Traces: CloudWatch + OpenTelemetry (X-Ray) — Grafana/Datadog optional
IAM:     one task role per service, least privilege; GitHub/Harness via OIDC (no long-lived keys)
```

**Autoscaling:** ECS target tracking on CPU/requests; min 2 tasks per service in prod across AZs. Aurora with reader replica in prod. 
**Environments:** `dev` (cheap, single AZ, small), `staging` (prod-shaped, smaller), `prod` (multi-AZ).

**Rough monthly cost (prod, low traffic):** ~USD 600–1,000 (Fargate tasks, NAT, Aurora, OpenSearch, ElastiCache, Atlas M10, CloudFront). Dev+staging add ~USD 300–400. Cost levers: single NAT in dev, Fargate Spot for non-critical workers, smaller OpenSearch, scale-to-zero dev at night.

---

## 9. CI/CD with Harness

```
Developer → PR (GitHub)
  ├─ Harness CI (per changed service, via Maven `-pl <changed> -am`):
  │    lint → unit tests → build → SAST/dep scan (Trivy, npm audit) → contract tests
  │    → docker build → push to ECR (tag = git sha) → generate SBOM
  └─ merge to main
        ├─ Harness CD: deploy to DEV   (auto)  → smoke tests
        ├─ Harness CD: deploy to STAGING (auto) → integration/E2E (Playwright)
        └─ Harness CD: deploy to PROD  (manual approval) → rolling/canary 10%→50%→100%
             with health-check verification (CloudWatch metrics) and auto-rollback
Infra: Terraform plan on PR (comment), apply via Harness pipeline with approval per env.
DB migrations: run as a one-off ECS task before app rollout (expand/contract, backward compatible).
```

Conventions: trunk-based development, short-lived branches, conventional commits, semantic image tags + git SHA, feature flags for incomplete work, one pipeline template reused by all services.

---

## 10. Cross-cutting concerns

### Security
- OWASP Top 10 controls; WAF managed rules + rate limits; TLS everywhere (ACM).
- AuthN at gateway, AuthZ in each service; service-to-service via internal ALB/SG rules + signed service tokens.
- PCI scope minimised: card data never touches our servers (Razorpay hosted checkout).
- Secrets rotation, KMS encryption, S3 block-public-access, VPC endpoints, security groups least-open.
- Audit log for admin and seller-sensitive actions. Input validation (Jakarta Bean Validation) on every endpoint.

### Observability
- Structured JSON logs with `traceId`, `userId`, `orderId`.
- RED metrics per service + business KPIs (orders/min, checkout conversion, payment failure rate).
- Distributed tracing (OpenTelemetry). Alerts → SNS → email/Slack/PagerDuty. SLO dashboards.
- Health: `/healthz` (liveness), `/readyz` (dependencies).

### Reliability
- Targets: 99.9% availability for browse/checkout; p95 read < 300 ms, checkout < 1 s (excluding PSP).
- Backups: Aurora PITR 7–14 days, Mongo Atlas continuous backup, S3 versioning. RPO ≤ 5 min, RTO ≤ 1 h. Restore drill before launch.
- DLQs with replay tooling; graceful shutdown; bulkheads between services.

### Testing strategy
Unit (JUnit 5 + Mockito) → contract tests (Pact/OpenAPI) → service integration (Testcontainers) → E2E happy paths (Playwright) → load test (k6) before launch → chaos-lite (kill a task/AZ in staging).

---

## 11. Repository layout (monorepo)

```
shopping-karo/
├─ DESIGN.md
├─ apps/
│  └─ web/                      # React SPA
├─ services/
│  ├─ api-gateway/  auth/  user/  catalog/  search/  inventory/
│  ├─ cart/  order/  payment/  seller/  admin/  notification/ ...
├─ pom.xml                      # Maven parent (Spring Boot 3.4, Java 21)
├─ libs/
│  ├─ sk-contracts/             # event envelopes, shared enums/DTOs
│  └─ sk-common/                # errors (RFC 7807), Money; later outbox, idempotency, auth filter
├─ infra/
│  ├─ terraform/modules/        # vpc, ecs-service, aurora, redis, opensearch, sqs-sns, cdn ...
│  └─ terraform/envs/{dev,staging,prod}/
├─ pipelines/harness/           # pipeline & template YAML (also stored as code)
├─ docker-compose.yml           # local: postgres, mongo, redis, opensearch, localstack
├─ docs/adr/                    # one file per decision
└─ scripts/
```

Local dev: `docker compose up` brings infra + LocalStack (SNS/SQS/S3); `mvn -pl services/<name> -am spring-boot:run` runs a service; `pnpm` is used only inside `apps/web`.

---

## 12. 4-week delivery plan

| Week | Theme | Exit criteria |
|---|---|---|
| **1 — Foundations** | Finalise this design; monorepo; `common` + `contracts`; Terraform for VPC/ECS/ECR/Aurora/Redis in **dev**; Harness CI + CD pipeline template; gateway + **auth** + **user** services deployed to dev; React shell with login | Push to main → auto-deployed to dev; user can register/login on dev URL |
| **2 — Catalog & discovery** | catalog, media, seller (onboarding + listings), search (OpenSearch), inventory; storefront listing/PDP; seller portal basics | Seller lists product, buyer finds it via search |
| **3 — Buy path** | cart, order saga, payment (Razorpay test mode), notification; checkout UI; order history; staging env up | End-to-end purchase in staging with test payment, emails sent |
| **4 — Operate & launch** | admin service/console, shipping (stub/aggregator), reviews (if time), observability, alarms, WAF, backups + restore drill, load test, security pass, prod env + canary pipeline, runbooks | Prod live behind real domain, dashboards + alerts, rollback tested |

**Cut line if behind** (drop in this order): reviews → shipping integration (manual status) → pricing/coupons → social login → admin reports. Never cut: auth, catalog, cart, order, payment, observability, backups.

### Risks
| Risk | Mitigation |
|---|---|
| Scope vs 1 month | Strict MVP cut line; vertical slices; templates for new services so each costs hours not days. |
| Microservices overhead for small team | Monorepo + shared `sk-common` lib + one pipeline template; start with ~10 services. |
| AWS cost surprise | Budgets/alerts per account; dev scale-down schedule. |
| Payment edge cases (webhook retries, double pay) | Idempotency keys, webhook signature check, reconciliation job. |
| Overselling | Reservations with TTL + atomic conditional decrement in Postgres. |

---

## 13. Open questions (please answer to lock the design)

| # | Question | Answer |
|---|---|---|
| 1 | Team size | **1 (solo)** |
| 2 | Payment provider | **Razorpay** (test mode until a KYC'd merchant account exists) |
| 3 | Region/market | **India only, INR, GST invoices** |
| 4 | Search/Mongo hosting | *Not answered — default:* MongoDB Atlas free/M0 tier for dev, upgrade later; **Postgres full-text search** behind the search-service interface for MVP, OpenSearch only when needed (saves ~USD 100+/mo) |
| 5 | Harness | **Will create a new account** (free tier); GitHub as source |
| 6 | Domain / AWS | **One domain and one AWS account available for testing — use these** (see §8 and §13.1) |
| 7 | SEO | *Not answered — default:* SPA (React + Vite) for MVP; revisit Next.js later |
| 8 | Seller model | *Not answered — default:* multi-seller **data model** from day 1 (`sellerId` everywhere), but seller portal kept minimal; platform owner is the first seller |

### 13.1 Impact of the answers on the design
- **Solo developer** → MVP is **8 services**, not 10–16: gateway, auth(+user), catalog(+search), inventory, cart, order, payment, notification. Seller and admin start as **role-gated modules inside existing services** (e.g. seller product CRUD in catalog, admin moderation endpoints in catalog/order) and are split out when load or team size justifies. Service boundaries stay in code (Spring packages/modules) so extraction is mechanical.
- **Single AWS account** → no AWS Organizations multi-account setup. Environments are separated by VPC/naming/tags (`sk-dev`, `sk-prod`) inside one account. Staging is dropped for now; `dev` is the integration env and `prod` is production-shaped but cost-trimmed. Billing alarms are mandatory.
- **Domain available** → one hosted zone; `dev.<domain>` and `www.<domain>`/`api.<domain>`; ACM certs via DNS validation.
- **Harness** → account bootstrap is Week 1 task 1 (connectors: GitHub, AWS via OIDC/IAM role, ECR).

---

## 14. Next steps
1. Confirm the three defaults in §13 (rows 4, 7, 8) or override them.
2. Scaffold monorepo, `common`/`contracts`, docker-compose, and Terraform skeleton.
3. Build auth + gateway first, wire Harness pipeline end-to-end, then proceed per §12.
