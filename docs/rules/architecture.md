# Architecture

Paths in backticks below are relative to the repository root unless stated otherwise.

## Source placement

- `src/core`: framework-free TypeScript primitives only. It may not import NestJS, Prisma, BullMQ, Redis or AWS SDK.
- `src/infrastructure`: application-wide technical capabilities. Keep configuration, HTTP lifecycle, security, database connection, queue, object storage, observability and health in their named folders.
- `src/modules/<domain>`: one business capability using the flat feature-module convention described below.
- `src/app.module.ts`: composition root only. No business decisions.
- `src/main.ts`: bootstrap only. No business decisions.

Inside a business module keep `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repo.ts`, constants, messages and cron/processors at the module root. Create `adapters/`, `dto/`, `errors/`, `helpers/`, `mappers/`, `policies/`, `schemas/` and `services/` only when real files need them. Do not create `api/application/domain/infrastructure` layers or empty architecture theater.

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
