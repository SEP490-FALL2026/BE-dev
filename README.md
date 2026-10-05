# Software License Management Backend

NestJS modular monolith for internal software-license, approval, usage and technology-cost management.

## Native Auth transition — 2026-10-03

Owner selected backend-managed email/password login. See [ADR-0010](docs/decisions/0010-native-password-authentication.md), [design](docs/architecture/native-identity-workforce-design.md), [API verification plan](docs/guides/native-identity-verification.md), [maintenance](docs/guides/native-identity-maintenance.md), and [employee CSV/XLSX templates with 15 synthetic employees](docs/examples/employee-import/README.md).

**Not implemented yet:** code/config/test were restored to HEAD `78cb675`, which still has OIDC foundation and health/catalog APIs. Native login/account/profile/import endpoints and slice-1 seed scripts described in historical instructions below are not currently available. Follow the new design/build plan after review. Git restore did not migrate/reset databases or change `.env`.

## Requirements

- Node.js 22 or 24
- pnpm 11.1.3
- Docker with Compose for local infrastructure

On Windows PowerShell, use `pnpm.cmd` when the machine execution policy blocks `pnpm.ps1`.

## Historical S0 quick start — not runnable after restore

The step-by-step local and demo guide is [docs/guides/local-demo-runbook.md](docs/guides/local-demo-runbook.md). In short:

```bash
pnpm install --frozen-lockfile
docker compose up -d postgres keycloak   # .env sets COMPOSE_PROJECT_NAME=slm-demo, POSTGRES_HOST_PORT=55432
pnpm db:migrate:deploy
pnpm db:seed:demo                        # synthetic demo organization, idempotent
pnpm keycloak:demo-users                 # sets DEMO_USER_PASSWORD (from .env) on the local realm users
pnpm start:dev
```

- API liveness: `http://localhost:3000/api/v1/health/live`
- API readiness (pings PostgreSQL): `http://localhost:3000/api/v1/health/ready`
- Swagger UI: `http://localhost:3000/api/docs` — **Authorize** signs in through Keycloak (Authorization Code + PKCE)

Copy `.env.example` to `.env` only for local overrides. Never commit `.env` or production credentials.

## Historical S0 OIDC setup

The internal-account resolver and demo setup described here were removed by restore. The HEAD OIDC token verifier remains until native authentication replaces it.

Keycloak is the identity provider: it holds passwords and sessions; the API never sees a password and has no login endpoint. The API verifies the access token, then resolves the internal account and its roles from PostgreSQL on every request (ADR-0006).

The imported realm contains public PKCE clients (`software-license-web`, `software-license-swagger`, `software-license-e2e`) and synthetic demo users with fixed ids, but **no credentials or client secrets**; `pnpm keycloak:demo-users` sets the demo password from `.env`. Production may use Keycloak or another trusted OIDC provider by configuration (`OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URI`).

OIDC is the login protocol; JWT is the access-token format used by the API. FE calls protected endpoints with an access token, not an ID token.

Business routes are protected by default. Only explicitly reviewed routes marked `@Public()` bypass authentication.

## API contract

HTTP DTOs use Zod 4. Ordinary JSON success responses use `{ success: true, message, data }`; `message` is a stable localization key for FE `en`/`vi` mapping. Errors use `{ success: false, error: { code, message, requestId, details? } }`. The exported OpenAPI document contains the complete wire envelope used by Orval.

## Source layout

Business code uses flat feature modules under `src/modules/<domain>`. A root `<module>.service.ts` is the narrow facade; focused workflows go in `services/`, rules in `policies/`, HTTP contracts in `dto/`, and persistence stays in the private root `*.repo.ts`. Do not create `solution/` or nested `api/application/domain/infrastructure` layers.

Application-wide technical concerns are explicit under `src/infrastructure`: `config`, `http`, `security`, `database`, `queue`, `object-storage`, `observability` and `health`. Framework-free shared primitives only belong in `src/core`.

## Storage environments

- Local/test: MinIO at the configured object-storage endpoint.
- Production: private Cloudflare R2 bucket with `region=auto` and the R2 S3 API endpoint.

Both use the same AWS SDK v3 adapter. Business modules depend only on `ObjectStoragePort`.

## Commands

`package.json` is authoritative. The old S0 commands `db:seed`, `db:seed:demo`, `keycloak:demo-users` and `test:live` no longer exist after the 2026-10-03 restore and were removed from the table below; they are described only in the historical runbook. Every command in the table exists in `package.json`.

| Command                             | Purpose                                   |
| ----------------------------------- | ----------------------------------------- |
| `pnpm start:dev`                    | Run HTTP API with watch mode              |
| `pnpm start:worker`                 | Run BullMQ worker context with watch mode |
| `pnpm test`                         | Unit tests                                |
| `pnpm test:e2e`                     | API E2E tests (no database required)      |
| `pnpm test:integration`             | Repository tests against real PostgreSQL  |
| `pnpm lint`                         | Non-mutating lint                         |
| `pnpm typecheck`                    | TypeScript check                          |
| `pnpm prisma:validate`              | Validate all Prisma schema files          |
| `pnpm prisma:generate`              | Generate ignored Prisma client            |
| `pnpm db:migrate:dev --name <name>` | Create/apply a local migration            |
| `pnpm db:migrate:deploy`            | Apply committed production migrations     |
| `pnpm openapi:export`               | Regenerate versioned `openapi.json`       |
| `pnpm check`                        | Full local quality gate                   |

### Integration tests

`pnpm test:integration` needs a real PostgreSQL and is deliberately **not** part of `pnpm check`, so the everyday gate stays fast and needs no Docker.

```bash
docker compose up -d
NODE_ENV=test pnpm test:integration   # rebuilds <database>_test from the migrations, then runs
```

`NODE_ENV=test` appends `_test` to the database name, so the suite can truncate its own rows without ever touching the database you develop against.

If something else already owns port 5432 — a natively installed PostgreSQL service is the usual culprit on Windows, and it wins over the container for `localhost` connections — either stop that service or point the suite elsewhere:

```bash
docker run -d --name slm-test-db -e POSTGRES_DB=software_license_management_test \
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -p 5433:5432 postgres:17-alpine

export NODE_ENV=test
export TEST_DATABASE_URL=postgresql://app:app@localhost:5433/software_license_management_test
pnpm db:migrate:deploy && pnpm test:integration
```

The suite fails with the host it tried rather than skipping quietly, so a misconfigured port is immediately obvious.

Read `AGENTS.md` before contributing and `ARCHITECTURE.md` before changing boundaries. Accepted architectural decisions live under `docs/decisions/`.

Work in progress lives in the Git-ignored `docs/workspace/` tree: `PROGRESS.md` for where things stand, `INDEX.md` for the register of work items, and one folder per item under `items/`. `docs/README.md` has the full convention, and an architecture test fails the build if documents are written outside it.
