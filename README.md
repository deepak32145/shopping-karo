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
