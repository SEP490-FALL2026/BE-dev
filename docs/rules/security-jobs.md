# Authentication, files and jobs

## Authentication and authorization

- Internal accounts: Argon2id passwords, short-lived HS256 access token, rotating refresh token in an
  `HttpOnly` `SameSite=Strict` cookie scoped to the auth routes (design: ADR-0011, Proposed). Login,
  refresh, logout, `/me`, account creation, invitations, activation, locking and role grants exist
  in slices 1a/1b (merged, pending developer review). Password change/reset is a later slice.
- Global guards deny by default: every route declares one of `@Public()`, `@AuthenticatedOnly()`,
  `@RequireRoles(...)` (missing means 500). Session, account status and employee status are checked in the
  database on every request; roles are never read from the token. Never use an always-accept verifier
  outside isolated tests.
- Public routes need @Public(), an entry in the public allowlist of `test/e2e/api-inventory.e2e-spec.ts`
  and anonymous HTTP tests. Catalog has no role/resource policy and is not mounted; add authorization
  from the US before opening real business access.
- Passwords enter through the installation prompt, `/auth/login` or `/auth/invitations/redeem`; they are never accepted
  as arguments or environment variables, and never logged or stored in audit (`AuditService` rejects
  keys that look like secrets).
- Never trust client-supplied privileges. A signed JWT alone does not establish
  current account status or resource permission.
- Distinguish invalid credentials from unavailable dependencies. Do not log secrets.
- Global rate limiting uses per-process memory, with a separate counter for each route and IP
  (Owner decision 14/10/2026, R-07; pinned by `test/e2e/rate-limit.e2e-spec.ts`).
  Login failure throttling is separately keyed by normalized email: only failed logins increase
  its failure counter, after the password check (Owner confirmed the existing spec, R-06).
  See [review follow-up](../workspace/g0-g1-review-follow-up.md). Redis is queue infrastructure.
- Configure TRUST_PROXY_HOPS only for trusted ingress that overwrites client headers.

## Storage and jobs

- Storage/BullMQ adapters exist; file APIs and BullMQ processors do not.
  `EmailDispatchLoop` in the separate worker polls PostgreSQL `EmailOutbox` and sends via SMTP
  outside the business transaction (ADR-0012, Proposed). Delivery is at-least-once.
- Business modules call ObjectStoragePort rather than vendor SDKs.
- Check permissions before issuing short-lived signed URLs; objects remain private.
- Filenames, MIME, bytes, CSV/XLSX cells and queue payloads are untrusted input.
- Imports need limits, ownership/purpose checks and idempotency defined by the US.
- Retries must not duplicate business writes. PostgreSQL holds authoritative state;
  Redis/job IDs do not replace constraints or durable deduplication.
- Mocks do not prove real storage access, revocation or worker retry behavior.

[Architecture](../../ARCHITECTURE.md) ? [Tests](../../test/README.md).
