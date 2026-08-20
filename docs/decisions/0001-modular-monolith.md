# ADR-0001: Adopt a modular monolith

- Status: Accepted
- Date: 2026-08-12
- Decision owners: Backend team
- Accepted: 2026-08-12

## Context

The product is an internal software-license and technology-cost management system. Its catalog, organization, approval, license, usage, finance, discovery and audit workflows are closely connected and often require consistent writes. The BRD targets an MVP/demo load around 100 concurrent users and the delivery team is small.

The starter repository is currently a minimal NestJS 11 application with no persistence, authentication or infrastructure decisions implemented.

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
