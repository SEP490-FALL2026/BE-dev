# ADR-0006: Bind OIDC identities to internal accounts and authorize from the database

## Status

**Accepted 2026-10-02 — superseded in part by [ADR-0010](0010-native-password-authentication.md) (2026-10-03).** Superseded: OIDC subject binding, three-tier linking, logout/Swagger PKCE flows. Still in force: database authorization on every request, Employee-linked accounts, no auto-created accounts, and §2 as amended by ADR-0008.

**2026-10-03 amendment:** [ADR-0010](0010-native-password-authentication.md) supersedes OIDC binding/provisioning as the target design. Employee-linked accounts, database authorization and unaffected business constraints remain. Native activation and privileged-account eligibility are proposed in the new design; the old uncommitted implementation was backed up and restored out of the working source.

Accepted 2026-10-02. **§2 _Effective roles_ amended by [ADR-0008](0008-effective-roles-super-admin-and-terminated-holders.md) (accepted 2026-10-03)** — no derived `MANAGER` for Super Admins; terminated holders blocked; the _Open_ item under _Consequences_ is closed there. Resolves `LR-13` of Docs `ERD/logical/LOGICAL-ERD-S0.md` v0.2. Builds on ADR-0002 (OIDC Bearer, deny by default), which it does not change. _Note added 2026-10-03:_ the _last active Super Admin_ sentence of §2 is proposed to be superseded by [ADR-0009](0009-single-super-admin-and-transfer.md) (**Proposed**, awaiting the Owner's review; Docs `QĐ-44`: at most one Super Admin per organization); it stands as written until ADR-0009 is Accepted.

Business points marked **Owner session decision** were chosen by the project Owner in the 2026-10-02 session from options presented to them. They are **not** supervisor (GVHD) decisions and still have to be propagated to the Docs decision log (`Docs/Decisions/project-decisions.md`) by the Owner.

## Date

2026-10-02

**Authority annotation — 2026-10-03:** read “stands as written until ADR-0009 is Accepted” above as ADR history only. Accepted ADR-0010 and FR-8.10 retain the at-most-one holder business rule; a pending technical proposal cannot reopen multi-Super-Admin provisioning. The comparisons and OIDC binding/logout/Swagger flows below are the superseded 2026-10-02 design. After restore, current HEAD has only OIDC authentication, without the described principal resolver or role APIs. In that verifier, `exp` is checked when supplied but is not required; this is a known baseline gap, not verified mandatory-expiry protection.

## Context

The API already verifies OIDC access tokens (RS256, JWKS, `iss`, `aud`, `exp`/`nbf`, `sub`). What was missing is the step from _"the identity provider says this is subject X"_ to _"this is app user U, employee E, with roles R"_. No business source says how a Keycloak subject is attached to an `app_users` row created by a Super Admin (`R-06`). The Logical ERD proposed auto-linking on `email_verified`; the Owner asked that a verified email not be the only safeguard, especially for privileged accounts.

The BRD still lists the identity provider as open (`OQ-15`, `QĐKT-02`). That table predates ADR-0002; `docs/rules/context.md` forbids undoing the accepted OIDC boundary because of it. This ADR keeps OIDC + Keycloak (self-hosted, open source, no Google/Microsoft account and no paid service required) and only decides the binding and authorization steps behind it.

### Options compared (2026-10-02)

| Question                               | A — OIDC, Keycloak self-hosted (kept)                                                                                                                                        | B — API manages passwords itself                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| How a user signs in                    | Keycloak login page (Authorization Code + PKCE); MFA/SSO are Keycloak settings                                                                                               | A `POST /login` on the API                                                                                      |
| Who creates accounts / holds passwords | IT creates the Keycloak user (self-registration off); Keycloak stores the password hash. The Super Admin creates the internal `app_users` row. The API never sees a password | The API: hashing, storage, reset e-mails                                                                        |
| Login / logout / expiry / refresh      | Keycloak sessions, refresh tokens and RP-initiated logout; the API is a stateless resource server                                                                            | Must be built: sessions or token signing, refresh rotation, revocation list                                     |
| Lock                                   | Internal `LOCKED` status checked on **every** request (immediate); optionally also disable the Keycloak user                                                                 | Must be built                                                                                                   |
| Where business permissions live        | PostgreSQL (`user_role_grants`, manager periods) in both options — never token claims                                                                                        | same                                                                                                            |
| Work today                             | Realm users/clients, principal resolution, guards                                                                                                                            | Hashing, rate-limited login, lockout, session/refresh, revocation, recovery, tests — not safely doable in a day |
| Maintenance                            | One more container; production can point at another OIDC provider by configuration                                                                                           | Security-critical code owned by a 5-person student team                                                         |
| Switching cost from current foundation | none                                                                                                                                                                         | Supersede ADR-0002 and `ARCHITECTURE.md` §10; violates `docs/rules/security-jobs.md`                            |

## Decision

### 1. Binding (`identity_links`) — two tiers (Owner session decision, 2026-10-02)

A request whose `(issuer, subject)` already has a link resolves through that link only. The e-mail in the token is then ignored, so a later e-mail change or reuse at the identity provider cannot move the link.

Otherwise:

| Tier            | When                                                          | Who asserts the subject                                                                                                                                                                                                                                                      | `link_method`    |
| --------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Bootstrap       | Seed of the first Super Admin and of demo fixtures            | The operator, through deployment configuration (`BOOTSTRAP_SUPER_ADMIN_OIDC_SUBJECT`) or the versioned demo fixture                                                                                                                                                          | `BOOTSTRAP`      |
| Verified e-mail | First sign-in of an account that holds **no privileged role** | The identity provider, under all of: token `iss` equals the configured issuer; `email_verified === true`; the lower-cased e-mail matches **exactly one** `ACTIVE` app user; that app user has no link for this issuer; it holds none of `SUPER_ADMIN`, `IT_ADMIN`, `FINANCE` | `VERIFIED_EMAIL` |
| Explicit        | Any account, required for privileged ones                     | A Super Admin, through `POST /app-users/{id}/identity-links` with the subject read from the identity provider (or from the `403` the user received)                                                                                                                          | `ADMIN_BOUND`    |

Rules that hold in every tier:

- **No automatic account creation and no role from token, e-mail or domain.** A subject without a link and without a qualifying account receives `403 PRINCIPAL_NOT_PROVISIONED` with `details.reason` (`NO_MATCHING_ACCOUNT`, `EMAIL_NOT_VERIFIED`, `EXPLICIT_BINDING_REQUIRED`, `ACCOUNT_ALREADY_LINKED`) plus the caller's own `issuer`/`subject`, so they can hand the subject to a Super Admin.
- Granting a privileged role to an account whose link is `VERIFIED_EMAIL` is refused (`409 IDENTITY.EXPLICIT_BINDING_REQUIRED`) until a Super Admin confirms the same subject through the explicit endpoint, which upgrades the link to `ADMIN_BOUND`.
- A Super Admin cannot bind their own account.
- Concurrency: the link is inserted in a transaction that locks the app-user row (`SELECT … FOR UPDATE`). `UNIQUE (organization_id, issuer, subject)` and `UNIQUE (organization_id, app_user_id, issuer)` are the backstop. When two first sign-ins race, exactly one link exists; a loser holding the same subject reads it back and proceeds, a loser holding a different subject gets `403`.
- Every link is audited (`IDENTITY_LINKED`, `IDENTITY_LINK_CONFIRMED`) in the same transaction.

### 2. Authorization

- `AuthenticationGuard` (infrastructure) verifies the token. `IdentityAccessGuard` (module `identity-access`) runs next and resolves the principal **from PostgreSQL on every request**. It then enforces coarse role metadata (`@RequireRoles`). Resource scope and SoD checks stay in use cases.
- A `LOCKED` account gets `403 ACCOUNT_LOCKED` on its next request, even with a token that is still valid.
- Effective roles = active direct grants + `MANAGER` when the employee has a direct report whose manager period contains today in the organization's time zone (`US-01-02`). `SPENDING_APPROVER` comes from `approval_role_holders` (`S0-B` remainder, not built yet) and is never granted directly.
- Assignable directly: `SUPER_ADMIN`, `IT_ADMIN`, `FINANCE`, `EMPLOYEE`. `MANAGER`/`SPENDING_APPROVER` → `422 IDENTITY.ROLE_NOT_DIRECTLY_ASSIGNABLE`. The database enforces this too (composite FK to `roles(code, assignment_mode)` with `assignment_mode = 'DIRECT'`).
- **Owner session decision (2026-10-02):** an account holding `SUPER_ADMIN` may not also hold `IT_ADMIN` or `FINANCE` (`422 IDENTITY.ROLE_COMBINATION_FORBIDDEN`). Without this rule, `SoD-1`/`FR-8.5` would be bypassed. `EMPLOYEE` combines with anything.
- Nobody changes their own grants, binding or lock status (`403 IDENTITY.SELF_CHANGE_FORBIDDEN`). The last active Super Admin cannot be locked or lose the role (`409 IDENTITY.LAST_SUPER_ADMIN`). Super-Admin-affecting writes serialise on a per-organization advisory lock.

### 3. Logout and token lifetime

The API validates tokens offline against the JWKS and keeps no session. After Keycloak logout, or after a user is disabled in Keycloak, an access token **already issued** stays acceptable to the API until its `exp`. Locking the internal account is the immediate kill switch. Measured lifetimes on the local realm are recorded in `docs/guides/local-demo-runbook.md`. Token introspection per request was rejected: it couples every call to Keycloak availability for a gain the internal lock already provides.

### 4. Swagger

The interactive docs obtain a real access token through Authorization Code + PKCE with the public client `software-license-swagger`: exact redirect URI `http://localhost:3000/api/docs/oauth2-redirect.html`, no client secret, direct-access grants disabled. The OAuth2 scheme is added only to the document served by the local UI. The exported `openapi.json` keeps the provider-neutral `bearer` scheme that the runtime actually enforces. There is no password endpoint on the API.

## Consequences

- Each authenticated request costs one or two indexed queries.
- New privileged staff need one extra Super Admin action (bind subject) — the price of not trusting a mutable e-mail claim for privileged access.
- `identity_links` gains `link_method`, `linked_at`, `linked_by_app_user_id` and the second unique constraint, beyond Logical v0.2. `user_role_grants.granted_by_app_user_id` is nullable (`NULL` = system bootstrap). Both are reported back to the Logical ERD.
- Open (not decided here, no source): whether terminating an employee locks their app user.
