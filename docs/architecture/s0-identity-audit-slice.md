# S0 identity, organization core and audit — first vertical slice

> **Historical after 2026-10-03 restore.** The uncommitted implementation described below was backed up, then source/config/tests restored to HEAD `78cb675`. “Built” and test counts below describe the earlier working tree. Target direction is now [ADR-0010](../decisions/0010-native-password-authentication.md); use the [native design — Proposed](native-identity-workforce-design.md) for new work.

> Status: **Historical record — was "Accepted for implementation" on 2026-10-02; no longer a build instruction after the 2026-10-03 restore.** Covers part of `S0-A` and the part of `S0-B` needed to sign in, authorize from the database and audit. Data design source: Docs `ERD/logical/LOGICAL-ERD-S0.md` v0.2 (§4.1–4.3, §4.7, §5, §6.1–6.2). Decisions: ADR-0005 (constraints), ADR-0006 (binding and authorization). Work tracking: `docs/workspace/items/0007-s0-core-foundation/` (Git-ignored).

## How to read this historical record

All “Built”, “done”, route lists, migration names and verification results below apply to the uncommitted **2026-10-02 snapshot only**. They are neither available-current-source claims nor acceptance evidence for native authentication. The 2026-10-03 restore did not itself restore database state; an existing local database can still contain a removed migration, so inspect migration status before any future demo or migration.

ADR-0008 later corrected effective-role/terminated-holder rules; ADR-0009 proposes the single-Super-Admin transfer design, replacing the old last-admin count; ADR-0010 selects native passwords, replacing PKCE, first-sign-in binding and the old logout semantics. Current contract/test work belongs in the native design and its verification guide. Preserve the results here as historical evidence; add new dated evidence to the current design/work item instead of rewriting this table as if old tests verified new behavior.

## 1. Scope

**Built in this slice**

- Migration `20261002000000_s0_identity_audit_foundation` (new; the initial migration is not edited). It drops the sketch tables nothing keeps (`access_requests`, `approval_steps`, `usage_records`, `financial_transactions`, `discovery_cases`, `license_assignments`, `license_pools`, `departments`, `principals`, and the old `identity_links`, `employees`, `audit_events`) and creates 11 tables: `currencies`, `roles`, `organizations`, `cost_centers`, `employees`, `employee_cost_center_periods`, `employee_manager_periods`, `app_users`, `identity_links`, `user_role_grants`, `audit_events`.
- Seed: bootstrap (`LR-04`, idempotent) and a demo fixture (`--demo`).
- Principal resolution and authorization from PostgreSQL; API: `GET /me`, `GET/POST /app-users`, `GET /app-users/{id}`, `POST /app-users/{id}/lock|unlock`, `POST /app-users/{id}/roles`, `DELETE /app-users/{id}/roles/{roleCode}`, `POST /app-users/{id}/identity-links`, `GET /audit-events`.
- Swagger UI login through Authorization Code + PKCE.

**Not built (deliberate, next slices)** — `organization-settings`/`parameters` API, `org_non_working_days`, `parameter_values`, `approval_role_holders` and their API (`US-01-03`), `employee_leave_periods`, organization HTTP use cases (`S0-C`), catalog rewrite (`S0-D`; the old `catalog_applications` reference module stays untouched apart from role checks), licenses, files, imports. No AI, GitHub, CSV, approval workflow. F60 is untouched.

## 2. Sources and acceptance criteria covered

| Story / AC                                          | Covered here                 | Note                                                                                             |
| --------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `US-01-01` AC-1, AC-3, AC-4, AC-5, AC-6             | yes                          | AC-2 roles part yes; its self-approval part needs C4                                             |
| `US-01-02` AC-2 data, AC-4                          | derivation of `MANAGER` only | AC-1/AC-3/AC-5 need requests/contracts                                                           |
| `US-01-06` AC-1 (shape), AC-2, AC-3, AC-5, AC-6     | yes                          | AC-1 example uses subscriptions (S0-D); verified on account events. AC-4 needs the retention job |
| `C-03`, `C-04`, `C-06`, `C-10`, `C-13` (Logical §5) | yes                          | `C-05` with `approval_role_holders` later                                                        |
| `LR-04`, `LR-12`, `LR-13`                           | yes                          | ADR-0005, ADR-0006                                                                               |

## 3. Actors, permissions, scope

Roles per ADR-0006: direct `SUPER_ADMIN`, `IT_ADMIN`, `FINANCE`, `EMPLOYEE`; derived `MANAGER`. Single organization per instance (BRD ADR-01); every query is filtered by the principal's `organization_id`.

| Operation                                              | Allowed                                       | Denied (tested)                                                       |
| ------------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------- |
| `GET /me`                                              | any provisioned, `ACTIVE` account             | no token 401 · bad/expired token 401 · unprovisioned 403 · locked 403 |
| app-user list/get/create/lock/unlock/grant/revoke/bind | `SUPER_ADMIN`                                 | IT, FIN, MGR, EMP → 403 `FORBIDDEN`, no row changed                   |
| `GET /audit-events`                                    | `SUPER_ADMIN`                                 | IT, FIN, MGR, EMP → 403 (`US-01-06` AC-5, AC-6)                       |
| `catalog-applications` (legacy reference module)       | read `IT_ADMIN`, `FINANCE`; create `IT_ADMIN` | others 403                                                            |

Self-change (own grants, binding, lock) → 403 `IDENTITY.SELF_CHANGE_FORBIDDEN`. Resources of another organization are not visible (404).

## 4. Data (beyond Logical v0.2 where stated)

Conventions: snake_case columns, `timestamptz` for events, `date` for business days, half-open `[valid_from, valid_to)`, `UNIQUE (organization_id, id)` on every organization table and composite foreign keys `(organization_id, x_id)`.

| Table                          | Key constraints                                                                                                                                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currencies` (shared)          | PK `code char(3)`; seeded `VND` 0, `USD` 2                                                                                                                                                                                                                            |
| `roles` (shared)               | PK `code`; `UNIQUE (code, assignment_mode)`; seeded 6 rows                                                                                                                                                                                                            |
| `organizations`                | FK `reporting_currency`; `CHECK work_day_start < work_day_end`                                                                                                                                                                                                        |
| `cost_centers`                 | `UNIQUE (org, code)`                                                                                                                                                                                                                                                  |
| `employees`                    | `UNIQUE (org, employee_code)`, `UNIQUE (org, work_email_normalized)`; CHECKs: e-mail pair, `in_handover ⇒ status <> TERMINATED`, `(in_handover OR TERMINATED) ⇒ last_working_date`, `last_working_date ≥ hire_date`                                                   |
| `employee_cost_center_periods` | `EXCLUDE` per employee (`INV-14a`); deferred constraint trigger `INV-14b` (continuous cover from `hire_date`, open-ended unless terminated)                                                                                                                           |
| `employee_manager_periods`     | `EXCLUDE` per employee; `CHECK manager ≠ employee`; cycle trigger under a per-organization advisory lock (`C-04`)                                                                                                                                                     |
| `app_users`                    | `UNIQUE (org, employee_id)`, `UNIQUE (org, login_email)` with `CHECK login_email = lower(btrim(login_email))`                                                                                                                                                         |
| `identity_links`               | `UNIQUE (org, issuer, subject)`; **added:** `UNIQUE (org, app_user_id, issuer)`, `link_method`, `linked_at`, `linked_by_app_user_id`                                                                                                                                  |
| `user_role_grants`             | composite FK `(role_code, assignment_mode) → roles` with `CHECK assignment_mode = 'DIRECT'` (`C-13`); partial `UNIQUE (org, app_user_id, role_code) WHERE revoked_at IS NULL`; revoke pair CHECK. **Changed:** `granted_by_app_user_id` nullable (`NULL` = bootstrap) |
| `audit_events`                 | append-only trigger for `UPDATE`/`DELETE`/`TRUNCATE` + `REVOKE` from the runtime role (`C-06`); `CHECK actor_kind = 'USER' ⇒ actor_app_user_id IS NOT NULL`                                                                                                           |

**Transactions.** Every business write runs in one transaction with its single `audit_events` row (`AuditService.record(tx, …)`). App-user writes lock the target row (`FOR UPDATE`); writes that can remove a Super Admin also take `pg_advisory_xact_lock` per organization.

## 5. Flow

```text
Browser / Swagger UI ──(Authorization Code + PKCE)──▶ Keycloak (password, sessions)
        │  access token (JWT, aud=software-license-api)
        ▼
ThrottlerGuard ─▶ AuthenticationGuard: RS256 via JWKS, iss, aud, exp/nbf, sub ── 401 / 503
        ▼
IdentityAccessGuard ─▶ identity_links(iss, sub) ──found──▶ app_users + grants (+ MANAGER from periods)
        │                    └─not found─▶ two-tier binding (ADR-0006) ── 403 PRINCIPAL_NOT_PROVISIONED
        │  LOCKED ─▶ 403 ACCOUNT_LOCKED · @RequireRoles mismatch ─▶ 403 FORBIDDEN
        ▼
Controller (Zod DTO) ─▶ IdentityAccessService / AuditService ─▶ transaction: write + audit_events ─▶ PostgreSQL
```

## 6. API contract

Base `/api/v1`, tag `identity-access` or `audit`, success envelope `{ success, message, data }`, errors per ADR-0004. Request objects are `z.strictObject`, so unknown fields (`status`, `organizationId`, `id`) → 422 `VALIDATION_ERROR` (no mass assignment). Lists use cursor pagination: `limit` 1–100 (default 20) and an opaque `cursor`; responses return `nextCursor`.

| Method + path                                                                          | operationId                              | Success                         | Errors (besides 401/403/503)                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /me`                                                                              | `identityGetMe`                          | 200 `MeResponse`                | —                                                                                                                                                                                                               |
| `GET /app-users`                                                                       | `identityListUsers`                      | 200 page                        | 422                                                                                                                                                                                                             |
| `GET /app-users/{id}`                                                                  | `identityGetUser`                        | 200                             | 404 `IDENTITY.APP_USER_NOT_FOUND`                                                                                                                                                                               |
| `POST /app-users` `{ employeeId, loginEmail, roles[] }`                                | `identityCreateUser`                     | 201 `IDENTITY.APP_USER_CREATED` | 422 `IDENTITY.EMPLOYEE_NOT_FOUND`, `IDENTITY.EMPLOYEE_NOT_ACTIVE`, `IDENTITY.ROLE_NOT_DIRECTLY_ASSIGNABLE`, `IDENTITY.ROLE_COMBINATION_FORBIDDEN`; 409 `IDENTITY.APP_USER_EXISTS`, `IDENTITY.LOGIN_EMAIL_TAKEN` |
| `POST /app-users/{id}/lock` · `/unlock`                                                | `identityLockUser`, `identityUnlockUser` | 200                             | 404; 403 self; 409 `IDENTITY.INVALID_TRANSITION`, `IDENTITY.LAST_SUPER_ADMIN`                                                                                                                                   |
| `POST /app-users/{id}/roles` `{ roleCode }`                                            | `identityGrantRole`                      | 200                             | 404; 403 self; 422 not assignable / combination; 409 `IDENTITY.ROLE_ALREADY_GRANTED`, `IDENTITY.EXPLICIT_BINDING_REQUIRED`                                                                                      |
| `DELETE /app-users/{id}/roles/{roleCode}`                                              | `identityRevokeRole`                     | 200                             | 404 / 404 `IDENTITY.ROLE_NOT_GRANTED`; 403 self; 409 `IDENTITY.LAST_SUPER_ADMIN`                                                                                                                                |
| `POST /app-users/{id}/identity-links` `{ subject }`                                    | `identityBindIdentity`                   | 200                             | 404; 403 self; 409 `IDENTITY.ALREADY_LINKED`, `IDENTITY.SUBJECT_ALREADY_LINKED`                                                                                                                                 |
| `GET /audit-events?resourceType&resourceId&actorAppUserId&action&from&to&limit&cursor` | `auditList`                              | 200 page                        | 422                                                                                                                                                                                                             |

Guard-level codes stay unprefixed like the existing `AUTHENTICATION_REQUIRED`/`INVALID_ACCESS_TOKEN`: `PRINCIPAL_NOT_PROVISIONED`, `ACCOUNT_LOCKED`, `FORBIDDEN`.

## 7. Failure situations and demo limits

- Identity provider down → 503 `TOKEN_VERIFICATION_UNAVAILABLE` (unchanged). Database down → 500 `INTERNAL_SERVER_ERROR`, readiness fails.
- A token issued before logout is accepted until `exp` (ADR-0006 §3). Locking is immediate.
- Demo data is synthetic (`*.demo@saas-sentry.test`), runs only on the isolated local Compose project `slm-demo`. Passwords come from the Git-ignored `.env` and are never written to the repo or logs.
- The audit append-only guarantee is limited locally because the API connects as the table owner (ADR-0005 consequences).

## 8. Test plan (written before implementation)

Levels: **unit** (`pnpm test`, no I/O), **e2e** (`pnpm test:e2e`, repositories/resolver stubbed — contract only), **integration** (`pnpm test:integration`, real PostgreSQL, no IdP), **live** (`pnpm test:live`, real Keycloak → API in-process → real PostgreSQL `_test` database; no stubs). Only live tests are evidence that the IdP → BE → DB path works.

| Requirement                          | Test                                                                                            | Level             | Evidence         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------- | ---------------- |
| ADR-0005 drift + presence            | every named CHECK/EXCLUDE/trigger exists; `prisma migrate diff` exit 0                          | integration       | test output      |
| Migration from clean DB              | `prisma migrate deploy` on an empty `_test` database                                            | command           | log              |
| `C-06` / `US-01-06` AC-2             | raw `UPDATE`, `DELETE`, `TRUNCATE` on `audit_events` fail                                       | integration       |                  |
| `US-01-06` AC-3                      | business write that throws after `record()` leaves no audit row                                 | integration       |                  |
| `C-13` / `US-01-01` AC-4             | inserting a `MANAGER` grant fails at the FK                                                     | integration       |                  |
| partial unique grant                 | second active grant fails; re-grant after revoke succeeds                                       | integration       |                  |
| `C-03`                               | employee without period, or a gap, fails at commit                                              | integration       |                  |
| `C-04`                               | `A→B` then `B→A` fails; concurrent pair → exactly one commits                                   | integration       |                  |
| `C-10`                               | period referencing another organization's cost centre fails                                     | integration       |                  |
| identity link concurrency            | two inserts of one `(issuer, subject)` → one row                                                | integration       |                  |
| seed idempotency                     | seed twice → identical row counts                                                               | integration       |                  |
| role policy table                    | assignable, combinations, self-change, last Super Admin                                         | unit              |                  |
| guard order / envelope               | no token → 401 before any 403; wrong role → 403 `FORBIDDEN`; mass-assignment → 422              | e2e               |                  |
| `US-01-01` AC-1, AC-6; login → `/me` | SA signs in through PKCE, `/me` shows roles from DB                                             | live              |                  |
| token rejection                      | none/garbage/foreign-signed/expired → 401                                                       | live              |                  |
| not provisioned / locked             | outsider, unverified e-mail → 403 reason; locked → 403                                          | live              |                  |
| low privilege                        | EMP/MGR/IT/FIN on `/app-users`, `/audit-events` → 403, row counts unchanged                     | live              |                  |
| `US-01-01` AC-1, AC-5                | SA creates account (201 + audit); terminated employee → 422                                     | live              |                  |
| LR-13 tier 2                         | new EMPLOYEE account auto-links on first sign-in; 5 concurrent first requests → 1 link, 1 audit | live              |                  |
| LR-13 tier 3                         | privileged account → 403 `EXPLICIT_BINDING_REQUIRED`; SA binds subject → 200                    | live              |                  |
| no self-escalation                   | SA grants itself `IT_ADMIN` → 403; `SUPER_ADMIN`+`IT_ADMIN` → 422; `MANAGER` → 422              | live              |                  |
| `US-01-01` AC-6                      | lock → existing token gets 403 immediately; unlock → 200                                        | live              |                  |
| logout semantics                     | after RP logout the old token still works until `exp`, then 401                                 | live              | measured seconds |
| write → read → audit                 | create/lock produce exactly one matching audit row with before/after                            | live              |                  |
| OpenAPI                              | `pnpm openapi:export`, review diff; Swagger "Try it out" with PKCE token                        | command + browser | screenshot       |

## 9. Verification record (2026-10-02, local `slm-demo` stack)

Commands run on the final code of this slice; results are from that run, not reused.

| Gate                                                       | Result                                                                                                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                               | pass — 22 suites, 159 unit/architecture tests, build OK                                                                                                                                            |
| `pnpm test:e2e`                                            | 3 suites, 41 tests pass                                                                                                                                                                            |
| `NODE_ENV=test pnpm test:integration`                      | 4 suites, 51 tests pass; `_test` database rebuilt from both migrations each run; `prisma migrate diff` reports no difference                                                                       |
| `pnpm test:live`                                           | 1 suite, 19 tests pass (Keycloak 26.7 PKCE → API → PostgreSQL 17)                                                                                                                                  |
| Mutation check (`_test` DB, objects removed one at a time) | audit trigger off → append-only test fails · INV-14b triggers dropped → 2 coverage tests fail · cycle trigger dropped → C-04 fails · DIRECT-only FK/CHECK dropped → C-13 fails · rebuild → 51 pass |
| Seed                                                       | `pnpm db:seed:demo` twice: second run created nothing                                                                                                                                              |
| Swagger                                                    | browser: Authorize (PKCE, client `software-license-swagger`) → Keycloak sign-in → "Try it out" `GET /me` → 200 with database roles                                                                 |
| OpenAPI                                                    | `pnpm openapi:export`: one tag per operation, `bearer` scheme only in the exported file, 401/403/503 on protected routes                                                                           |

Defects found and fixed while verifying: the global Zod pipe rejected the server-side `@CurrentPrincipal()` parameter with a 500 (now skips `custom` parameters only); helmet's default `Cross-Origin-Opener-Policy` severed the Swagger OAuth popup (now `same-origin-allow-popups` on docs, `unsafe-none` on the redirect page, only when interactive login is configured).

### Acceptance criteria status

| AC                                                         | Status                  | Evidence                                                                     |
| ---------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `US-01-01` AC-1 create + role + audit                      | done                    | live "creates an account…"                                                   |
| `US-01-01` AC-2 multiple roles                             | done (roles part)       | live grant FINANCE after confirmation; self-approval part → C4               |
| `US-01-01` AC-3 non-SA denied, nothing changes             | done                    | live "least privilege" (row and audit counts unchanged)                      |
| `US-01-01` AC-4 MANAGER not assignable                     | done                    | live 422 + integration C-13 (DB)                                             |
| `US-01-01` AC-5 terminated employee                        | done                    | live 422 `EMPLOYEE_NOT_ACTIVE`                                               |
| `US-01-01` AC-6 lock blocks every call, audit before/after | done                    | live lock test                                                               |
| `US-01-02` AC-2 data, AC-4                                 | partial                 | `MANAGER` derived from periods (live `mgr.demo`); manager-change API is S0-C |
| `US-01-06` AC-2, AC-3                                      | done                    | integration C-06                                                             |
| `US-01-06` AC-5, AC-6                                      | done                    | live + e2e denials                                                           |
| `US-01-06` AC-1                                            | done for account events | example uses subscriptions (S0-D)                                            |
| `LR-13` two-tier binding, concurrency                      | done                    | live tier 2 (5 concurrent → 1 link, 1 audit), tier 3; integration link race  |
