# Authentication, files and jobs

## Authentication and authorization

- Internal accounts: Argon2id passwords, short-lived HS256 access token, rotating refresh token. Login and
  refresh return both in the response body; refresh and logout take the refresh token in the request body.
  The API sets and reads no cookie, so a client must keep the refresh token out of logs and URLs
  (design: ADR-0011, Proposed, amended 17/10/2026; developer review pending). Login, refresh, logout, `/me`,
  account creation, invitations, activation, locking, role grants (slices 1a/1b), forgot/reset and change password
  (slice 1c) and Super Admin transfer exist and are merged to `dev`; none is reviewed or accepted.
- The refresh token is an **opaque** random 256-bit credential, not a JWT. Only its SHA-256 is stored; it is
  authenticated by hash lookup, row locks and the authoritative session/account/employee state in PostgreSQL,
  rotated once per use, and a replayed token revokes the session. Never pass it to `jwt.verify`, never turn it into
  a JWT, and never add Redis or a second session store without a new ADR. Never store or print a raw token.
- Client contract (Owner Q1/Q2, 18/10/2026): the web client keeps the refresh token in memory, not `localStorage`;
  web and mobile single-flight refresh, because a second refresh with the same token is replay and ends the session.
  `refreshExpiresAt` (Q3) is a pending contract change for a separate auth/session item, not implemented.
- Global guards deny by default: every route declares one of `@Public()`, `@AuthenticatedOnly()`,
  `@RequireRoles(...)` (missing means 500). Session, account status and employee status are checked in the
  database on every request; roles are never read from the token. Never use an always-accept verifier
  outside isolated tests.
- Public routes need @Public(), an entry in the public allowlist of `test/e2e/api-inventory.e2e-spec.ts`
  and anonymous HTTP tests. Catalog has no role/resource policy and is not mounted; add authorization
  from the US before opening real business access.
- Passwords enter through the installation prompt, `/auth/login`, `/auth/invitations/redeem`, `/auth/password-resets`
  or `/me/password`; they are never accepted
  as arguments or environment variables, and never logged or stored in audit (`AuditService` rejects
  keys that look like secrets).
- Never trust client-supplied privileges. A signed JWT alone does not establish
  current account status or resource permission.
- Distinguish invalid credentials from unavailable dependencies. Do not log secrets.
- Global rate limiting uses per-process memory, with a separate counter for each route and IP
  (Owner decision 14/10/2026, R-07; pinned by `test/e2e/rate-limit.e2e-spec.ts`).
  Login failure throttling is separately keyed by normalized email: only failed logins increase
  its failure counter, after the password check (Owner confirmed the existing spec, R-06).
  See [G0/G1 remediation review](../reviews/g0-g1-remediation-2026-10-15/README.md). Redis is queue infrastructure.
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
