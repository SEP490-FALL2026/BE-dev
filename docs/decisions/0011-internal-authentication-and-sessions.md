# ADR-0011: Internal authentication, sessions and identity persistence conventions

Status: **Proposed** (12/10/2026). Not implemented. Items marked _lead decision_ were
chosen by the project lead on 12/10/2026 in a design session; every item still needs
the BE developer's feasibility review before slice 1a is coded. An AI assistant did the
research and drafting; that is not a review or an approval.

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
   `AUTH_THROTTLE_PEPPER` (`node:crypto`). It is independent of the global per-IP
   throttler, which stays enabled on every route.
7. **Installation password prompt.** No dependency: `process.stdin.setRawMode(true)`
   with manual Enter/Backspace/Ctrl+C handling. The command refuses to run without a TTY.
8. **Transactions** (_lead decision_ for the values). A `TransactionRunner` wraps the
   Prisma 7.9.1 interactive transaction at Read Committed with `timeout: 10000`
   and `maxWait: 2000`. Each transaction sets `lock_timeout` 3 s and `statement_timeout` 5 s for that
   transaction only, with `SELECT set_config(name, value, true)` (PostgreSQL rejects bind
   parameters in `SET`), so a single slow statement fails in PostgreSQL first; a
   multi-statement transaction may still reach Prisma's `P2028`, which maps the same way. Row locks use
   `$queryRaw` inside the transaction. `40P01`, `55P03`, `57014`, Prisma `P2028`
   and connection loss roll back and map to 503. With `@prisma/adapter-pg` 7.9.1 the first
   three (and exclusion violation `23P01`) arrive as `P2010`/`P2039` with the SQLSTATE in
   `meta.driverAdapterError.cause`; only `23505` (`P2002`) and `40001` (`P2034`) have
   dedicated codes. Integration tests must trigger `55P03` and `57014` for real. The lock order is the foundation
   spec's _Giao thức khóa chung_.
9. **Persistence conventions for new tables** (_lead decision_). Columns are snake_case
   through `@map`; tables are snake_case plural through `@@map`. Placement overlap
   is prevented by `btree_gist` and an `EXCLUDE` constraint. Migrations follow the
   foundation spec's order: three in slice 1a, one in slice 1b.
10. **Platform boundary.** Stay on Nest 11 and CommonJS. Do not add ESM-only packages
    (`@nestjs/jwt` 12.x, `jose` 6.x) until the repository migrates as a separate decision.

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

- When this ADR is **Accepted**, it replaces the sentence _"Until implemented, supplied
  tokens receive 503 AUTHENTICATION_NOT_CONFIGURED"_ of ADR-0002 and _"The unimplemented
  verifier returns 503 AUTHENTICATION_NOT_CONFIGURED"_ of ADR-0004; both ADRs then get a
  link to this one. Until then they are unchanged. Slice 1a removes
  `UnconfiguredTokenVerifier` and updates the security/API rules and ARCHITECTURE.
- The migration role needs `CREATE` on the target database for `btree_gist`; confirm
  for every shared environment before deploying.
- The database temporarily has two column conventions (catalog camelCase, new tables
  snake_case) until the catalog is redesigned in G3.
- New dependencies must pass `pnpm install --frozen-lockfile` and the CI audit gate.
- Acceptance gate: the lead moves this ADR to Accepted, with the BE developer's review
  link, before slice 1a merges; the same PR adds the link notes to ADR-0002 and ADR-0004.

## Verification

Evidence so far is limited to isolated experiments listed in the research note
(library behaviour in CommonJS/ts-jest, pnpm 11 install behaviour, the runtime image,
PostgreSQL extension/constraint/lock behaviour). Product behaviour is unverified until
slice 1a's unit, e2e and PostgreSQL integration/concurrency tests pass.
