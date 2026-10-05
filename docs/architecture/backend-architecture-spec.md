# Backend architecture specification

> Status: Accepted for incremental implementation
>
> This specification was accepted on 2026-08-12. Foundation work must still land incrementally and keep the repository buildable.
>
> **Current applicability — 2026-10-03:** the foundation remains accepted. [ADR-0010](../decisions/0010-native-password-authentication.md) supersedes its OIDC-only target; [native identity/workforce](native-identity-workforce-design.md) v1.2 is Accepted for implementation (Owner, 2026-10-04; not GVHD) and unbuilt. Restored HEAD `78cb675` has OIDC authentication and health/catalog, without S0 principal/role/workforce APIs. Dated completion records below describe foundation evidence, not native feature completion.
>
> **Implementation note.**
>
> **2026-08-12** — source foundation, local Compose services, Prisma schemas/migration, OIDC/JWT verifier, MinIO/R2 adapter, worker context, Zod HTTP contracts, default-deny authentication, correlated error handling, OpenAPI export and reference approval policy.
>
> **2026-08-21** — foundation hardening and completion: readiness probe, configured rate limiting with pinned guard order, single 5xx error code, availability signalling for an unreachable identity provider, envelope opt-out, request-id trust taken from configuration, per-environment database resolution, and four architecture tests covering Prisma table ownership, repository confinement and raw SQL. See ADR-0004.
>
> **2026-08-21** — `catalog` shipped as the reference vertical slice. Business capabilities use the flat feature-module convention accepted by ADR-0003; concrete workflows are added as vertical slices rather than empty module scaffolds.

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
- Backend-managed passwords as the accepted target direction (ADR-0010); OIDC/JWT remains only in the restored foundation until replacement.
- audit trail, file access control, data minimization and retention.
- direct-manager approvals and no self-approval; the Spending Approver decides added spending. Finance provides budget advice/records and never approves or blocks expenditure (BRD FR-3.4, SoD).
- MVP/demo performance target and about 100 concurrent users.

## 5. Accepted foundation approach

Adopt ADR-0001 and the detailed design in the repository `ARCHITECTURE.md`. Implement a thin vertical slice first, so boundaries, transactions, OpenAPI, tests and AI rules are proven before all domains are generated.

**The slice built was `catalog`, not the license-assignment example originally sketched here.** `CatalogApplication` has no foreign key to another module's table, so it was the only capability buildable without first creating `identity-access` and `organization`. License assignment remains a good later slice; it is not a good first one.

## 6. Acceptance criteria for the foundation

Status as of 2026-08-21. An unmet criterion is listed with why it is outstanding, so this table reads as a record rather than a wish.

| #   | Criterion                                                                                                | Status                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Lint, typecheck, unit, integration, e2e and build commands are explicit and non-mutating                 | ⚠️ all exist; `pnpm test:integration` is **not** in CI because it needs a database service                                                                                    |
| 2   | App refuses to boot on invalid required configuration                                                    | ✅                                                                                                                                                                            |
| 3   | `/api/v1` URI versioning, validation, stable error envelope and generated OpenAPI                        | ✅                                                                                                                                                                            |
| 4   | Readiness and liveness endpoints have distinct semantics                                                 | ✅ liveness checks the process; readiness pings PostgreSQL                                                                                                                    |
| 5   | Prisma migration and multi-file schema convention work against PostgreSQL                                | ✅                                                                                                                                                                            |
| 6   | Module boundary checks reject private cross-domain imports                                               | ✅ extended to Prisma table ownership, repository confinement and raw SQL                                                                                                     |
| 7   | OIDC/JWT adapter exists; tests prove no-self-approval at policy level                                    | ⚠️ authentication and the policy test are done; **authorization is not modelled at all** — no roles, scopes or permissions exist yet. It belongs to `identity-access`.        |
| 8   | BullMQ example job is idempotent and exposes durable job status                                          | ❌ deliberately deferred until a genuinely slow or retryable job exists. `QueueInfrastructureModule` is configured; no queue is registered. See `ARCHITECTURE.md` section 16. |
| 9   | S3-compatible adapter keeps buckets private and returns short-lived signed URLs only after authorization | ⚠️ the adapter and key factory exist and are unit-tested; no caller uses them, so "only after authorization" is unproven and will be proven by the first file endpoint        |
| 10  | Structured logs contain request/correlation IDs and redact secrets                                       | ✅                                                                                                                                                                            |
| 11  | Docker Compose provides PostgreSQL, Redis, MinIO and a local OIDC provider                               | ✅                                                                                                                                                                            |
| 12  | `AGENTS.md` and AI rule adapters explain folders, file placement, required tests and forbidden patterns  | ✅                                                                                                                                                                            |

## 7. Decision status and remaining review gate

Foundation choices are accepted through ADR-0001–0004; do not ask the team to select them again. Native implementation details still require review under ADR-0010:

| Decision              | Proposed default                                                                               | Why                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| architecture          | modular monolith                                                                               | lowest justified operational complexity                            |
| ORM                   | Prisma                                                                                         | type-safe client, migrations, supported domain-split schema files  |
| target authentication | native password direction accepted; protocol details Accepted in design v1.2 (not implemented) | ADR-0010; Keycloak is the historical foundation provider           |
| tenancy               | single organization                                                                            | matches internal-system BRD; avoids accidental pseudo-multitenancy |
| deploy                | API + worker containers                                                                        | isolates slow jobs while retaining one codebase                    |
| storage               | MinIO local + Cloudflare R2 production through one S3-compatible adapter                       | local independence and portable private object storage             |

## 8. Deliverables after approval

1. ✅ Foundation dependencies, strict configuration and bootstrap.
2. ✅ Docker Compose and environment templates.
3. ✅ Prisma base + domain-split schemas and migration workflow.
4. ✅ API contract/error/validation/OpenAPI foundation.
5. ⚠️ AuthN policy boundary. AuthZ is still unmodelled — see criterion 7.
6. ⚠️ File infrastructure exists; queue infrastructure is configured but unwired — see criterion 8.
7. ✅ Observability, health and graceful shutdown.
8. ✅ Example vertical slice and tests — `catalog`, with unit, e2e and integration coverage.
9. ✅ Detailed contributor/AI documentation and CI quality gates.
