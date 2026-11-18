# ADR-0001: Adopt a modular monolith

- Status: Accepted
- Date: 2026-08-12
- Decision owners: Backend team
- Accepted: 2026-08-12

## Context

The product is an internal software-license and technology-cost management system. Its catalog, organization, approval, license, usage, finance, discovery and audit workflows are closely connected and often require consistent writes. The BRD targets an MVP/demo load around 100 concurrent users and the delivery team is small.

At the time of the original decision, the starter repository was a minimal NestJS 11 application with no persistence, authentication or infrastructure decisions implemented.

## Decision

Build one NestJS modular monolith with:

- business-oriented Nest feature modules;
- one PostgreSQL database as the system of record;
- Prisma schema files split by domain with logical table ownership;
- synchronous module facades for required in-process collaboration;
- in-process events for non-critical side effects;
- Redis/BullMQ for durable background work;
- private MinIO storage locally and Cloudflare R2 in production through one S3-compatible adapter;
- one codebase with API and worker process entrypoints.

Every module owns its business rules and persistence adapter. Only explicit application contracts are exported. Cross-module repository access is forbidden.

### Historical implementation status, 2026-08-21

For the reset baseline, use [ARCHITECTURE](../../ARCHITECTURE.md).
The table below records the earlier review, not current verification.

The decision stands as written; two parts of it are not built yet, and this note exists so nobody reads the list above as a description of the code.

| Part of the decision                                                         | Status                                                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Feature modules, one PostgreSQL, domain-split Prisma schemas, module facades | ✅ in place; ~~`catalog` is the reference module~~ (superseded 2026-10-19, see amendment)      |
| Cross-module repository access forbidden                                     | ✅ enforced by tests covering table ownership, repository confinement and raw SQL              |
| API and worker entrypoints                                                   | ✅ both exist; the worker has no processor yet and says so on start                            |
| MinIO local, Cloudflare R2 production, one S3 adapter                        | ⚠️ adapter built and unit-tested; no caller yet, not mounted since H6.4 (E2 = A)               |
| Redis/BullMQ for durable background work                                     | ❌ source kept, not mounted since H6.4 (E2 = A). Deferred until a slow or retryable job exists |
| In-process events for non-critical side effects                              | ❌ no event mechanism exists. Deferred until a real side effect needs one                      |

### Amendment, 2026-10-19

The claim that `catalog` is the reference module is superseded. Its source, schema, migration and tests are kept, but
`CatalogModule` is not mounted, has no access declarations and does not follow the current
[module structure](../rules/module-structure.md) rules, so it is no template. New code follows that rule and the
architecture gates. G3 decides whether to keep, replace or remove the module and its table (Owner decision E1 = A in
the [H4.0 audit](../reviews/be-full-src-architecture-audit-2026-10-19/README.md#quyết-định-owner-09b)). The rest of
this decision is unchanged and remains accepted.

## Consequences

### Positive

- one local environment and deployment model;
- straightforward PostgreSQL transactions for approval/license/audit workflows;
- lower operational and debugging overhead for a small team;
- module boundaries create a possible extraction seam if future evidence requires it;
- one OpenAPI contract for FE Orval generation.

### Negative

- boundaries are enforced primarily by code conventions, lint/dependency tests and review;
- a badly written module can affect the single runtime;
- independent scaling is limited, although worker processes can scale separately;
- database migrations require coordination across modules.

### Mitigations

- module public APIs and dependency rules;
- separate API/worker processes in staging and production;
- per-module schema files and ownership documentation;
- integration tests for repository boundaries and critical transactions;
- ADR required before introducing cross-module persistence access or extracting a service.

## Alternatives considered

### Microservices

Rejected for the current stage. They add network failure handling, distributed transactions, contract/version management, tracing and multiple deployment pipelines without a demonstrated scaling or team-ownership requirement.

### Layered monolith by technical type

Rejected. Global `controllers/`, `services/` and `repositories/` directories make ownership unclear and encourage broad coupling as the feature count grows.

### Event sourcing/CQRS framework

Rejected as a default. Audit requirements are met with append-only audit records and an outbox; current read/write complexity does not justify the additional model and operational cost.

## Revisit triggers

- a module needs materially different availability or scaling;
- independent teams own and deploy separate domains;
- compliance demands process/database isolation;
- measured release contention cannot be solved by module cleanup;
- a dedicated workload exceeds the API/worker split.
