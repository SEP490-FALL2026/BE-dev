# Backend architecture specification

> Status: Accepted for incremental implementation
>
> This specification was accepted on 2026-08-12. Foundation work must still land incrementally and keep the repository buildable.

> Implementation note: the source foundation, local Compose services, Prisma schemas/migration, OIDC/JWT verifier, MinIO/R2 adapter, worker context, Zod HTTP contracts, default-deny authentication, correlated error handling, OpenAPI export and reference approval policy were implemented on 2026-08-12. Business capabilities use the flat feature-module convention accepted by ADR-0003; concrete workflows are added as vertical slices rather than empty module scaffolds.

## 1. Problem

Create a maintainable NestJS backend foundation for a small team and AI-assisted contributors. It must support the BRD's connected approval, license, usage, finance, discovery and audit workflows without premature distributed-system complexity.

## 2. Goals

- Make domain ownership and allowed dependencies obvious from paths and imports.
- Provide stable REST/OpenAPI contracts for FE-generated clients.
- Make critical authorization, separation-of-duties and audit behavior testable.
- Run slow imports and analyses without blocking HTTP requests.
- Support repeatable local development and container deployment.
- Give human and AI contributors explicit guardrails against architectural drift.

## 3. Non-goals

- Microservices, multi-region HA or independent per-domain deployment.
- Building a CASB or automatically blocking/revoking discovered applications.
- Provider-specific procurement/payment automation.
- Mobile-specific API behavior.
- Implementing all business modules during the foundation phase.

## 4. Accepted constraints from the BRD

- NestJS REST API and role-based access.
- PostgreSQL, Redis/background jobs, MinIO local and Cloudflare R2 production.
- CSV/Excel imports and job visibility.
- OIDC/OAuth2 authentication with JWT access tokens.
- audit trail, file access control, data minimization and retention.
- direct-manager approvals, no self-approval and Finance step when cost is added.
- MVP/demo performance target and about 100 concurrent users.

## 5. Proposed solution

Adopt ADR-0001 and the detailed design in the repository `ARCHITECTURE.md`. Implement a thin vertical slice first—health/config plus one license-assignment example—so boundaries, transactions, OpenAPI, tests and AI rules are proven before all domains are generated.

## 6. Acceptance criteria for the foundation

- `pnpm lint`, typecheck, unit, integration, e2e and build commands are explicit and non-mutating in CI.
- App refuses to boot on invalid required configuration.
- `/api/v1` URI versioning, validation, stable error envelope and generated OpenAPI exist.
- Readiness and liveness endpoints have distinct semantics.
- Prisma migration and multi-file schema convention work against PostgreSQL.
- Module boundary checks reject private service/policy/schema/DTO/adapter/repository imports across domains.
- OIDC/JWT adapter and authorization contract exist; tests prove no-self-approval at policy level.
- BullMQ example job is idempotent and exposes durable job status.
- S3-compatible adapter keeps buckets private and returns short-lived signed URLs only after authorization.
- Structured logs contain request/correlation IDs and redact secrets.
- Docker Compose provides PostgreSQL, Redis, MinIO and the selected local OIDC provider.
- `AGENTS.md` and AI rule adapters explain every folder, file-placement examples, required tests and forbidden patterns.

## 7. Review gate

Team must explicitly accept or replace these defaults:

| Decision | Proposed default | Why |
| --- | --- | --- |
| architecture | modular monolith | lowest justified operational complexity |
| ORM | Prisma | type-safe client, migrations, supported domain-split schema files |
| local OIDC | Keycloak | real OIDC flow without custom passwords |
| tenancy | single organization | matches internal-system BRD; avoids accidental pseudo-multitenancy |
| deploy | API + worker containers | isolates slow jobs while retaining one codebase |
| storage | MinIO local + Cloudflare R2 production through one S3-compatible adapter | local independence and portable private object storage |

## 8. Deliverables after approval

1. Foundation dependencies, strict configuration and bootstrap.
2. Docker Compose and environment templates.
3. Prisma base + domain-split schemas and migration workflow.
4. API contract/error/validation/OpenAPI foundation.
5. AuthN/AuthZ policy boundary.
6. Queue/import/file infrastructure.
7. Observability, health and graceful shutdown.
8. Example vertical slice and tests.
9. Detailed contributor/AI documentation and CI quality gates.
