# Architecture

Paths in backticks below are relative to the repository root unless stated otherwise.

## Source placement

- `src/core`: framework-free TypeScript primitives only. It may not import NestJS, Prisma, BullMQ, Redis or AWS SDK.
- `src/infrastructure`: application-wide technical capabilities. Keep configuration, HTTP lifecycle, security, database connection, queue, object storage, observability and health in their named folders.
- `src/modules/<domain>`: one business capability using the flat feature-module convention described below.
- `src/app.module.ts`: composition root only. No business decisions.
- `src/main.ts`: bootstrap only. No business decisions.

Inside a business module keep `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repo.ts`, constants, messages and cron/processors at the module root. A root `<module>.contract.ts` holds the public contract (types and metadata decorators) other modules may import; a module with several HTTP surfaces may have several root `*.controller.ts` files (for example `auth.controller.ts` beside `app-users.controller.ts`) but still exactly one `*.repo.ts` that touches Prisma. Create `adapters/`, `dto/`, `errors/`, `helpers/`, `mappers/`, `policies/`, `schemas/` and `services/` only when real files need them. Do not create `api/application/domain/infrastructure` layers or empty architecture theater.

- Keep the conventional folder name `services/`; never create a vague `solution/` or `utils/` dumping ground.
- A root `<module>.service.ts` is the controller-facing/public facade. It may coordinate focused services but must not become a god service or a pass-through wrapper with no real consumer.
- `services/` contains focused workflows/use cases such as `assign-license.service.ts`; `policies/` contains business decisions that can be tested without HTTP or Prisma.
- `schemas/` owns reusable Zod/domain schemas. `dto/` creates distinct HTTP request/response DTOs; do not duplicate the same Zod shape in both places.

## Boundary rules

1. A module may export an application facade/contract, never its repository or Prisma adapter.
2. Never import another module's `adapters/`, `dto/`, `errors/`, `helpers/`, `mappers/`, `policies/`, `schemas/`, `services/` or `*.repo.ts` files. Import only an explicitly exported root facade/contract.
3. Never query another module's table from a repository. Call its public contract.
4. Controllers validate/map HTTP only. Put workflow in use cases and invariants in policies/entities.
5. Request and response DTOs are separate. Never expose Prisma models or domain entities directly.
6. Do not create generic base controllers, services or repositories.
7. Do not use `forwardRef()` to hide a circular dependency. Repair ownership/orchestration.
8. PostgreSQL is authoritative. Redis is for jobs/coordination, not business records.
9. A table that is technical support rather than a business entity (currently only `auth_throttle_windows`) may be owned by a named `src/infrastructure/<capability>` repository. This is an explicit entry in `PRISMA_MODEL_OWNER` and an explicit allowlist in `src/architecture-boundaries.spec.ts`; it never exempts a table from the ownership test, and business modules never query it.
10. An orchestration module (for example `workforce-access`) owns no Prisma model: it calls the owning modules' public contracts inside one transaction supplied by the shared `TransactionRunner`, and parsers or adapters for a workflow live in the orchestrating module, not in the module that owns the target table.
11. `organization-setup` follows rule 10: it owns no table, calls only the public contracts of `organization` and `catalog`, and is owned by the workspace work items 0009/0011 — not by the identity/workforce packages (B1–B10). The organization timezone is chosen at bootstrap and no ordinary API changes it (Docs `QĐ-47d`).
