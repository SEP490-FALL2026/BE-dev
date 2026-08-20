# Backend contributor and AI rules

Read `ARCHITECTURE.md` before changing source structure or adding a dependency. Decisions under `docs/decisions/` are binding until superseded by a newer ADR. Follow `docs/README.md` when creating research, plans, specifications or durable documentation.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Development: `pnpm start:dev`
- Full check: `pnpm check`
- Focused unit test: `pnpm test -- <path-or-pattern>`
- E2E: `pnpm test:e2e`
- Fix formatting/lint deliberately: `pnpm format`, then `pnpm lint:fix`

Use the pinned pnpm version in `package.json`. On Windows PowerShell where script execution blocks `pnpm.ps1`, use `pnpm.cmd`; do not change the machine execution policy.

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

## HTTP contracts

- Use Zod 4 DTOs through `nestjs-zod`; do not add `class-validator` DTOs or plain interfaces at an HTTP boundary.
- Request objects use `z.strictObject`. Request and response schemas are separate when coercion/defaults or wire/domain representations differ.
- Wire dates are ISO strings. Map Prisma `Date`, `Decimal`, `BigInt` and entities before returning; never expose Prisma values directly.
- Ordinary JSON success responses use `{ success: true, message, data }`. Apply `@ApiSuccessResponse(...)` with the complete envelope DTO so runtime validation and OpenAPI agree.
- `message` is an uppercase localization key such as `COMMON.SUCCESS`, not English/Vietnamese display copy.
- Streams, redirects, files, raw responses and 204 responses are explicit exceptions; document and test them rather than bypassing the interceptor casually.
- Guards run before pipes. Never inspect body/query/params in an authorization guard as if Zod has already validated them.

## Authentication and authorization

- OIDC is the login protocol; the API verifies JWT access tokens. Do not use an ID token to call the API.
- Authentication is global and deny-by-default. Every anonymous endpoint must opt out with `@Public()` and receive security review.
- Do not add password auth as an outage fallback or create a second production auth mode.
- Do not add a generic AND/OR auth-mode engine for hypothetical flexibility. A real service credential must use an explicit named policy with defined precedence and failure behavior.
- Internal roles, scopes, active state and separation-of-duties rules remain in PostgreSQL.
- Never trust client-provided role claims without mapping them through the trusted identity boundary.
- Tests normally use signed/fake principal fixtures; only dedicated auth E2E requires Keycloak.

## Files and jobs

- Business code depends on the object-storage port, not AWS/MinIO/Cloudflare SDKs.
- MinIO is local/test; Cloudflare R2 is production; both use the S3-compatible adapter.
- Buckets are private. Authorize before issuing a short-lived presigned URL.
- Treat file name, MIME, contents, CSV/XLSX cells and queue payloads as untrusted.
- Every retryable job must be idempotent and store important status in PostgreSQL.

## API and localization

- REST base path is `/api/v1`; resource paths are plural kebab-case.
- Errors use stable machine-readable codes. UI text is localized by FE; do not make FE branch on error messages.
- Backend localization is limited to backend-rendered email, notification and export templates.
- Store UTC timestamps and machine-readable enum/status values.

## Quality and safety

- Add or update tests before behavior changes. Unit-test policies/use cases; integration-test adapters; keep E2E for critical workflows.
- Run `pnpm check` before handoff.
- Do not commit `.env`, tokens, keys, generated build output or real imported data.
- Do not weaken validation, CORS, authorization, file limits or rate limits to make a test pass.
- Do not add dependencies without checking official documentation, maintenance, license and audit impact.
- Put temporary research, plans and draft specifications under the Git-ignored `docs/workspace/` tree.
- Promote approved architecture specifications to `docs/architecture/` and accepted decisions to `docs/decisions/`; these are shared project context and must remain versioned.
- Update `ARCHITECTURE.md` and the relevant durable ADR/spec when an accepted decision or implemented boundary changes.
