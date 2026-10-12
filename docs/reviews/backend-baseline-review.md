# Foundation reset review ? 2026-10-07

Scope: reset the backend to a foundation for new User Stories, retaining catalog as
the reference module. This supersedes the earlier documentation-only review.

## Changes

- Removed obsolete authentication implementation/configuration, old auth design and
  handoff packages, unused approval policy and speculative Prisma models.
- Preserved catalog, reusable plan/spec templates and import example data.
- Protected APIs fail closed until account/password + JWT is implemented.
- Added a fresh catalog-only migration; no existing/shared database was reset.
- Isolated every PostgreSQL suite with per-run ownership checks. Ownership metadata
  lives outside public so it does not prevent Prisma from applying the first migration.
- Fixed catalog snapshot consistency and deterministic name/id ordering.
- Removed plan-dependent trace/preflight commands and unimplemented test runners.
- Added API/migration Docker targets and a source-built local MinIO image.
- CI now includes isolated PostgreSQL integration and runtime Docker build.

## Dependency fixes

The production audit initially reported 22 advisories. Applied focused patched versions:
proxy-addr 2.0.8, multer 2.4.0, qs 6.16.0, fast-uri 3.1.8, mysql2 3.23.1,
js-yaml 5.4.1, Joi 18.2.9 and a scoped @prisma/config deepmerge-ts 8.0.0 override.

The deepmerge major changes default Map merging; this repository's Prisma config
contains plain configuration objects, not Maps. Verify Prisma validate/generate,
migrate and drift checks after this override. Overrides are temporary compatibility
constraints; review them when upstream dependencies include the patched versions.

References: [proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h),
[deepmerge release](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0),
[Joi changelog](https://joi.dev/resources/changelog/),
[MinIO source-build release](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z).

## Verification

| Check                                                         | Result                                                                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| pnpm check                                                    | Passed: rules/format/lint/schema/client/typecheck, 114 unit tests, 12 rules-checker tests, 8 layout tests, discovery, build |
| pnpm test:e2e                                                 | 3 suites, 25 tests passed                                                                                                   |
| pnpm test:integration                                         | 3 suites, 31 tests passed on an isolated local PostgreSQL container                                                         |
| pnpm openapi:export and OpenAPI diff                          | Passed; wire contract unchanged                                                                                             |
| pnpm audit --prod --audit-level high                          | No known vulnerabilities found at verification time                                                                         |
| Docker runtime and migrate builds                             | Passed; runtime configured as non-root node user                                                                            |
| MinIO source build and isolated Compose up --wait             | Passed; PostgreSQL, Redis and MinIO healthy                                                                                 |
| Migration image deploy, repeat deploy, status and schema diff | Applied successfully; no pending migrations and no schema difference                                                        |
| Runtime HTTP smoke                                            | Liveness/readiness 200, missing token 401, arbitrary supplied token 503                                                     |
| Real storage adapter smoke                                    | Signed upload/download, head and delete passed against isolated MinIO                                                       |
| Worker entry point                                            | Starts, reports no processors, closes and exits successfully                                                                |
| Documentation links / git diff --check                        | No broken file links in remaining tracked docs; diff hygiene passed                                                         |

Disposable integration databases were cleaned up; no slm_*_test databases remained.
Smoke tests used a separate Compose project and ports, with no shared/development data.
The API smoke used development environment settings; it is not a production rollout.

## Limits

This is not a production security certification or a completed business implementation.
Login/JWT/account lifecycle, role/resource policy, file APIs and business processors
must be implemented from the approved US. Catalog is a structure example.
Health ready checks PostgreSQL connectivity, not schema completeness or all dependencies.
Tests using mocks do not prove real authentication or external provider behavior.
CI changes are checked locally; no hosted GitHub Actions run or commit/push was performed.
