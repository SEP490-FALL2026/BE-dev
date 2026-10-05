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

## Local development at HEAD

At HEAD the API still authenticates with OIDC until native authentication replaces it (ADR-0010). The removed slice-1 commands (`db:seed:demo`, `keycloak:demo-users`) do not exist; do not follow instructions that use them.

```bash
pnpm install --frozen-lockfile
pnpm check                 # rules, format, lint, typecheck, unit tests, script tests, test discovery, traceability, build
pnpm test:e2e              # HTTP contract, no database needed
```

- API liveness: `http://localhost:3000/api/v1/health/live`
- API readiness (pings PostgreSQL): `http://localhost:3000/api/v1/health/ready`

Copy `.env.example` to `.env` only for local overrides. Never commit `.env` or production credentials.

Business routes are protected by default. Only explicitly reviewed routes marked `@Public()` bypass authentication. FE calls protected endpoints with an access token, not an ID token.

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

`package.json` is authoritative. The old S0 commands `db:seed` and `db:seed:demo` and `keycloak:demo-users` no longer exist after the 2026-10-03 restore. Every command in the table exists in `package.json`. The map of test runners, directories and prerequisites is in [test/README.md](test/README.md); the scripts are described in [scripts/README.md](scripts/README.md).

| Command                                | Purpose                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm start:dev`                       | Run HTTP API with watch mode                                                    |
| `pnpm start:worker`                    | Run BullMQ worker context with watch mode                                       |
| `pnpm test`                            | Unit tests                                                                      |
| `pnpm test:e2e`                        | API E2E tests (no database required)                                            |
| `pnpm test:integration`                | Real-PostgreSQL tests (disposable database per run)                             |
| `pnpm test:live` / `pnpm test:browser` | Whole-stack and browser gates (`test:browser` fails until a runner is approved) |
| `pnpm test:discovery`                  | Every spec file belongs to exactly one runner                                   |
| `pnpm test:trace`                      | Acceptance IDs <-> packages <-> test titles                                     |
| `pnpm test:scripts`                    | Tests of the verification scripts                                               |
| `pnpm db:preflight`                    | Read-only report of what the native migration would meet                        |
| `pnpm lint`                            | Non-mutating lint                                                               |
| `pnpm typecheck`                       | TypeScript check                                                                |
| `pnpm prisma:validate`                 | Validate all Prisma schema files                                                |
| `pnpm prisma:generate`                 | Generate ignored Prisma client                                                  |
| `pnpm db:migrate:dev --name <name>`    | Create/apply a local migration                                                  |
| `pnpm db:migrate:deploy`               | Apply committed production migrations                                           |
| `pnpm openapi:export`                  | Regenerate versioned `openapi.json`                                             |
| `pnpm check`                           | Full local quality gate                                                         |

### Integration tests

`pnpm test:integration` needs a real PostgreSQL and is deliberately **not** part of `pnpm check`, so the everyday gate stays fast and needs no Docker.

Each run creates its own `slm_<nonce>_test` database, checks it against the disposable guard (`localhost`/`127.0.0.1`, name ends in `_test`, ownership marker for this run) and drops it afterwards, so a suite can never touch a database you develop against. Set `TEST_DATABASE_ADMIN_URL` to a localhost role that may create databases (see `.env.example`). A throwaway container on any free port is enough:

```bash
docker run -d --rm --name slm-test-pg -e POSTGRES_PASSWORD=<pw> -p 127.0.0.1::5432 postgres:17-alpine
docker port slm-test-pg 5432        # e.g. 127.0.0.1:55921
export TEST_DATABASE_ADMIN_URL=postgresql://postgres:<pw>@localhost:55921/postgres
pnpm test:integration
```

`catalog.repo.integration-spec.ts` predates the disposable database and still expects `<DATABASE_NAME>_test` to exist with migrations applied (`NODE_ENV=test` appends `_test`; set `TEST_DATABASE_URL` to override). A missing prerequisite fails the run with the host it tried; nothing is skipped quietly.

Read `AGENTS.md` before contributing and `ARCHITECTURE.md` before changing boundaries. Accepted architectural decisions live under `docs/decisions/`.

Work in progress lives in the Git-ignored `docs/workspace/` tree: `PROGRESS.md` for where things stand, `INDEX.md` for the register of work items, and one folder per item under `items/`. `docs/README.md` has the full convention, and an architecture test fails the build if documents are written outside it.
