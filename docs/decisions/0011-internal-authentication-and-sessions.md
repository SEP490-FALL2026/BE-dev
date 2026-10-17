# ADR-0011: Internal authentication, sessions and identity persistence conventions

Status: **Proposed** (12/10/2026). Implemented in slice 1a through PR #4 (`64073c4`),
with remediation `a0cf5f1` incorporated into `origin/dev` through PR #7/#8;
developer review and acceptance are still pending as of 15/10/2026. Slice 1c (decision 11) is implemented
in the working tree on 16/10/2026, locally verified only and not reviewed.
Items marked _lead decision_ were chosen on 12/10/2026; the planned pre-merge review
gate was not completed. AI research, drafting and testing do not constitute developer approval.

Number 0011 is used because 0006 and 0008–0010 still exist in Git history
(`1e8d0a1`) for the earlier native-identity design; they are not reused.

## Context

Business decisions: `QĐ-46` (backend owns credentials; one internal login mechanism),
`QĐ-47` (recovery, zero direct roles, immutable organization time zone) and `QĐ-67`
(installation exception, Finance slot) in the Docs decision log, snapshot
`S-2026-10-12b` (see [sources](../workspace/sources.md)). Stories: `US-01-01`,
`US-01-06`, `US-01-10`. Design: [foundation spec](../workspace/items/foundation-org-identity-boundary/spec.md),
[slice 1a spec](../workspace/items/us-01-bootstrap-login-session/spec.md),
[slice 1b spec](../workspace/items/us-01-account-invitation-activation/spec.md).
Evidence: [research](../workspace/items/us-01-bootstrap-login-session/research.md).

The repository is CommonJS on Node 22–24, Nest 11.1.28, Express 5.2.1, Prisma 7.9.1,
pnpm 11.1.3 with an explicit `allowBuilds` list, and CI runs
`pnpm audit --prod --audit-level high`.

## Decision

1. **Access token.** A JWT signed with HS256 through `@nestjs/jwt` 11.0.2
   (`jsonwebtoken` 9.0.3). Claims: `sub` (app user id), `sid` (session id), `iss`,
   `aud`, `iat`, `exp`; lifetime 600 s. Verification pins `algorithms: ['HS256']`,
   issuer and audience. The secret (`AUTH_ACCESS_TOKEN_SECRET`, at least 32 random
   bytes) has no production default. Roles are **not** in the token: every request
   reads the session, account and active grants, and the employee status through
   the organization facade, so a lock or revoke applies from the next request.
2. **Refresh token.** Opaque, 32 random bytes from `node:crypto`, base64url.
   The database stores only its SHA-256 digest (high entropy, so no slow hash).
   Rotated on every refresh. Presenting a consumed token revokes the whole session,
   writes an audit event and **commits** before the 401 is returned.
3. **Refresh cookie.** `HttpOnly`, `SameSite=Strict`, `Secure` outside development,
   `Path=/api/v1/auth`, `Max-Age` equal to the session's remaining absolute lifetime.
   It is cleared with identical attributes, as Express 5 `res.clearCookie` requires.
   Read with `cookie-parser` 1.4.7, without a signing secret.
4. **Logout** is a `@Public()` route authenticated by the refresh cookie. It returns
   204 for every case except 503 (database unavailable; the cookie is kept) and the
   global throttler's 429. It revokes only the session owning the presented token
   and ignores any `Authorization` header.
5. **Password hashing** (_lead decision_). `@node-rs/argon2` 2.2.2 with explicit
   parameters `Argon2id, memoryCost 19456, timeCost 2, parallelism 1` (OWASP
   minimum), stored as a PHC string with `hashPolicyVersion = 1`. Unknown accounts
   are verified against a dummy hash to keep response time similar.
6. **Login throttling.** The key is HMAC-SHA256 of the normalized email with
   `AUTH_THROTTLE_PEPPER` (`node:crypto`). Owner confirmation on 14/10/2026 (R-06):
   only failed logins increase the failure counter; in-flight attempts are not counted
   as failures. The counter is raised after the password check fails, in one atomic statement,
   so simultaneous wrong guesses are all counted. A burst of simultaneous guesses is therefore no
   longer capped at the failure limit before it is checked; it is bounded only by the global
   throttler below. Any separate overload protection needs its own design and review. The global throttler
   stays enabled on every route with a separate counter per route and IP (Owner decision
   14/10/2026, R-07); it is independent of the email failure counter and uses process-local memory.
7. **Installation password prompt.** No dependency: `process.stdin.setRawMode(true)`
   with manual Enter/Backspace/Ctrl+C handling. The command refuses to run without a TTY.
8. **Transactions** (_lead decision_ for the values). A `TransactionRunner` wraps the
   Prisma 7.9.1 interactive transaction at Read Committed with `timeout: 10000`
   and `maxWait: 2000`. Each transaction sets `lock_timeout` 3 s and `statement_timeout` 5 s for that
   transaction only, with `SELECT set_config(name, value, true)` (PostgreSQL rejects bind
   parameters in `SET`), so a single slow statement fails in PostgreSQL first; a
   multi-statement transaction may still reach Prisma's `P2028`, which maps the same way. Row locks use
   `$queryRaw` inside the transaction. `40P01`, `55P03`, `57014`, Prisma `P2028`
   and connection loss before `COMMIT` is sent roll back and map to 503. A timeout or a lost
   connection while `COMMIT` is in flight also maps to 503, but the outcome is unknown: the server
   may already have committed, so a write is never retried automatically and the caller reads the
   state again first. With `@prisma/adapter-pg` 7.9.1 the first
   three (and exclusion violation `23P01`) arrive as `P2010`/`P2039` with the SQLSTATE in
   `meta.driverAdapterError.cause`; only `23505` (`P2002`) and `40001` (`P2034`) have
   dedicated codes. Integration tests must trigger `55P03` and `57014` for real. The lock order is the foundation
   spec's _Giao thức khóa chung_.

   The server-side limits above cannot fire when PostgreSQL never answers, so the pool also has
   client-side limits: `DB_CONNECT_TIMEOUT_MS` (default 3 s) and `DB_QUERY_TIMEOUT_MS` (default 8 s, higher
   than the statement timeout). A pg `query_timeout` only rejects the call; the statement and an open
   transaction stay active on the connection. The application therefore owns the pool
   (`src/infrastructure/database/pg-pool.ts`, handed to `PrismaPg` with `disposeExternalPool`): a
   connection whose query timed out is retired (`end()`), never reused, and a connection released while a
   transaction is still open is retired too (review N-1). `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` is the
   PostgreSQL-side backstop (`idle_in_transaction_session_timeout`; default
   `max(20000, DB_TRANSACTION_TIMEOUT_MS + 10000)`, validated to be higher than
   `DB_TRANSACTION_TIMEOUT_MS`). Design and evidence:
   [remediation spec](../workspace/items/g0-g1-remediation-after-rereview/spec.md).

9. **Persistence conventions for new tables** (_lead decision_). Columns are snake_case
   through `@map`; tables are snake_case plural through `@@map`. Placement overlap
   is prevented by `btree_gist` and an `EXCLUDE` constraint. Migrations follow the
   foundation spec's order: three in slice 1a, one in slice 1b.
10. **Platform boundary.** Stay on Nest 11 and CommonJS. Do not add ESM-only packages
    (`@nestjs/jwt` 12.x, `jose` 6.x) until the repository migrates as a separate decision.
11. **Forgot, reset and change password (slice 1c, `US-01-10` AC-3 → AC-7, AC-12).** Values are the `T-*`
    table of the [slice 1c spec](../workspace/items/us-01-password-self-service/spec.md); they still need the
    developer review that `US-01-10` _Business rules_ requires before the slice leaves local verification.
    A reset link is a one-time token of 32 random bytes, stored as SHA-256 in `account_action_tokens` with
    purpose `RESET_PASSWORD`, valid `AUTH_PASSWORD_RESET_TTL_SECONDS` (default 1800; 300–86400). An account may
    be issued `AUTH_PASSWORD_RESET_MAX_PER_HOUR` links in any 60 minutes (default 3; 1–100), counted from the
    token table under the AppUser row lock; a further request is answered like every other and issues nothing.
    A new request revokes the previous usable link (`SUPERSEDED`) and cancels its unsent mail, so one link works
    at a time. Reset or change replaces the hash, revokes every other usable link (`CREDENTIAL_CHANGED`) and every
    open session (`PASSWORD_RESET` / `PASSWORD_CHANGED`, the current one included), clears the email's
    `login_throttles` row so the owner is not left blocked, queues a notice mail and writes the audit event in the
    same transaction (`CredentialChangeService`). A wrong current password counts on the same failure counter as
    a wrong sign-in (`LoginThrottle`, shared with `LoginService`), answers 422 (not 401, which tells a client its
    session ended) and never locks the account. The two public routes carry a route throttle of 10 requests a
    minute per address on top of the global one.
    _Known residual risk (spec Q-6):_ the answer to a reset request has the same content for every email. An email
    that cannot get a link (unknown, not activated, locked, employee left) leaves after the same unlocked reads
    without opening a transaction; only the one case that writes a token and a mail takes a few milliseconds
    longer, and no artificial delay is added. A caller who can measure that can still tell which emails have an account that may use a
    link. Accepted for the MVP; the route throttle limits how much of it one address can measure.

## Alternatives rejected

- `argon2` 0.45.1 (node-argon2): its install script makes pnpm 11.1.3 report
  `ERR_PNPM_IGNORED_BUILDS` unless added to `allowBuilds`; hashes are compatible, so
  it remains a fallback.
- `jose` 6.x and `@nestjs/jwt` 12.x: ESM-only; risky with ts-jest in CommonJS mode.
- Bearer-authenticated logout: an expired access token or a repeated call is stopped by
  the guard and the `HttpOnly` cookie cannot be cleared.
- Overlap trigger instead of `btree_gist`: hand-written locking, extra race tests.
- camelCase columns as in `catalog_applications`: every raw SQL statement would need
  quoted identifiers.

## Consequences

- Slice 1a already removed `UnconfiguredTokenVerifier` and its
  `503 AUTHENTICATION_NOT_CONFIGURED` response. ADR-0002 and ADR-0004 already contain
  implementation notes linking here; those notes do not make this ADR Accepted.
- The migration role needs `CREATE` on the target database for the baseline's
  `CREATE SCHEMA IF NOT EXISTS public` and `btree_gist`; confirm
  for every shared environment before deploying.
- The database temporarily has two column conventions (catalog camelCase, new tables
  snake_case) until the catalog is redesigned in G3.
- New dependencies must pass `pnpm install --frozen-lockfile` and the CI audit gate.
- Acceptance remains open after merge: a BE developer must review the design and code,
  then the lead records the acceptance decision with the reviewer, revision and review link.
  The original pre-merge gate was missed; do not retroactively mark it fulfilled.

## Verification

The [research note](../workspace/items/us-01-bootstrap-login-session/research.md) records
the initial isolated experiments. The consolidated
[G0/G1 review and remediation report](../reviews/g0-g1-remediation-2026-10-15/README.md)
records the findings, test results and remaining limits through `a0cf5f1`. That remediation retires
pooled connections after client-side query timeout and has entered `origin/dev` through PR #7/#8.
The results belong to the named revisions and do not close developer review or acceptance;
this ADR remains Proposed.
