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
- Client contract (Owner Q1–Q3, 18/10/2026) — the one source for web and mobile clients:
  - Login and refresh return `expiresAt` (expiry of the access token) and `refreshExpiresAt` (stored expiry of the
    refresh token in the same response: the idle timeout, capped at the absolute session expiry). Near the end of a
    session `refreshExpiresAt` can be earlier than `expiresAt`; do not assume an order.
  - Web keeps the refresh token in memory, never in `localStorage`; how a reload that loses it is handled is a later UX
    design. Mobile storage is not decided yet: store it securely, never log it. Never put a token in a URL or a log.
  - Single-flight refresh: one refresh at a time, and replace both tokens from each successful response. Sending a
    spent token again is replay and ends the session; there is no grace window.
  - Refresh before `expiresAt`; after `refreshExpiresAt` sign in again. A refresh answered 401 `AUTH.SESSION_INVALID`
    means discard both tokens and sign in again; 503 `AUTH.UNAVAILABLE` means keep the refresh token and retry.
  - Logout sends the refresh token in the body and is 204 whether or not a session was open.
- Global guards deny by default: every route declares one of `@Public()`, `@AuthenticatedOnly()`,
  `@RequireRoles(...)` (missing means 500). Session, account status and employee status are checked in the
  database on every request; roles are never read from the token. Never use an always-accept verifier
  outside isolated tests.
- Public routes need @Public(), an entry in the public allowlist of `test/e2e/api-inventory.e2e-spec.ts`
  and anonymous HTTP tests. Add authorization from the US before opening real business access.
- Passwords enter through the installation prompt, `/auth/login`, `/auth/invitations/redeem`, `/auth/password-resets`
  or `/me/password`; they are never accepted
  as arguments or environment variables, and never logged or stored in audit (`AuditService` rejects
  keys that look like secrets).
- Transport limits only bound the body; the password policy (12–128) decides and names the reason. A new password
  (reset, change, invitation) may carry up to 1024 characters, so 129–1024 answers `AUTH.PASSWORD_POLICY_VIOLATION`
  and longer answers `VALIDATION_ERROR` (AUTH.2 / F-31); the login and current passwords stay at 256.
- `Authorization: Bearer <token>`: the scheme is case-insensitive (`bearer`, `BEARER`, RFC 9110), the rest is exact — one
  space and a token without whitespace (AUTH.1 / F-18).
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

- Only the API mounts the object storage (ADR-0014, contract files, signed links); the queue is mounted in no graph
  (E2 = A) and has no processors. A slice that mounts either restores its production validation (Redis password,
  HTTPS storage endpoint). A storage that cannot answer is a 503, never a 500 and never a successful write.
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
