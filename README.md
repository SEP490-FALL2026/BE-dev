# Software License Management Backend

NestJS modular monolith for internal software-license, approval, usage and technology-cost management.

## Requirements

- Node.js 22 or 24
- pnpm 11.1.3
- Docker with Compose for local infrastructure

On Windows PowerShell, use `pnpm.cmd` when the machine execution policy blocks `pnpm.ps1`.

## Quick start

```bash
pnpm install --frozen-lockfile
docker compose up -d postgres redis minio
pnpm prisma:generate
pnpm db:migrate:dev --name init
pnpm start:dev
```

- API health: `http://localhost:3000/api/v1/health/live`
- Swagger UI: `http://localhost:3000/api/docs`
- MinIO console: `http://localhost:9001`

Copy `.env.example` to `.env` only for local overrides. Never commit `.env` or production credentials.

## Optional OIDC provider

Most unit, integration and ordinary API E2E tests do not need Keycloak. Start it only when testing the real OIDC browser flow:

```bash
docker compose --profile auth up -d keycloak
```

The imported realm contains no application users or client secrets. Create local users through the Keycloak admin console. Production may use Keycloak or another trusted OIDC provider without changing the API verifier boundary.

OIDC is the login protocol; JWT is the access-token format used by the API. FE calls protected endpoints with an access token, not an ID token.

Business routes are protected by default. Only explicitly reviewed routes marked `@Public()` bypass OIDC authentication.

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

| Command                             | Purpose                                   |
| ----------------------------------- | ----------------------------------------- |
| `pnpm start:dev`                    | Run HTTP API with watch mode              |
| `pnpm start:worker`                 | Run BullMQ worker context with watch mode |
| `pnpm test`                         | Unit tests                                |
| `pnpm test:e2e`                     | API E2E tests                             |
| `pnpm lint`                         | Non-mutating lint                         |
| `pnpm typecheck`                    | TypeScript check                          |
| `pnpm prisma:validate`              | Validate all Prisma schema files          |
| `pnpm prisma:generate`              | Generate ignored Prisma client            |
| `pnpm db:migrate:dev --name <name>` | Create/apply a local migration            |
| `pnpm db:migrate:deploy`            | Apply committed production migrations     |
| `pnpm openapi:export`               | Regenerate versioned `openapi.json`       |
| `pnpm check`                        | Full local quality gate                   |

Read `AGENTS.md` before contributing and `ARCHITECTURE.md` before changing boundaries. Documentation placement and promotion rules live in `docs/README.md`; accepted architectural decisions live under `docs/decisions/`.
