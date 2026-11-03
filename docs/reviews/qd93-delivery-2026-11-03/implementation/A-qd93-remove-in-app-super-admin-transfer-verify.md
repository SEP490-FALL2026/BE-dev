# A - qd93-remove-in-app-super-admin-transfer VERIFY log (02/11/2026)

Skills read/used: superpowers:verification-before-completion (verification), code-review-and-quality (review/domain).
Process skill mapping: no dedicated "verifier" process skill; verification-before-completion's gate function used as the process (identify command, run, read, then claim).

Repo: Code/BE-dev-software-license-management, branch feat/qd93-remove-in-app-super-admin-transfer, parent 164f6e67.
Revision verified: 89202039 (tree clean). Evidence commit: 7e1f3d4d (plan.md only).
Note: commit 6df7eb98 titled "verify: phase A evidence" was made by the implementer (spec/plan status), not by this verifier.

## Commands (real results)
| Command | Exit | Counts | Log |
|---|---|---|---|
| pnpm check (TEST_DATABASE_* unset) | 0 | unit 327 suites/4444 tests; gates 16/326; test:scripts 274 (272 pass, 0 fail, 2 skipped: Windows symlink/POSIX mode); discovery ok; build ok | A-transfer-verify-check.log |
| pnpm rules:check | 0 | 411 files, 3340 links, 0 errors | A-transfer-verify-rules.log |
| pnpm test:integration -- 5 files (super-admin-recovery-role, recovery-cli, super-admin-transfer-removed, account-roles-http, role-grant-constraints), inline TEST_DATABASE_* | 0 | 5 suites / 51 tests | A-transfer-verify-integration.log |
| pnpm test:http -- test/http/platform | 0 | 12 suites / 188 tests | A-transfer-verify-http-platform.log |
| git diff 164f6e67...HEAD -- scripts/verify/merged-migrations.txt | - | 0 lines (unchanged) | - |
| full test:integration, test:e2e, test:integration:timing | deferred to phase B - not run | | |

## Tasks
1 done (66eca12f) / 2 done (cb0dd725) / 3 done (a9dd573d) / 4 done (57754e43). Lint fix 89202039 (typed query in AC-16 test).

## Migration (OD-2)
20261102043614_identity_app_user_employee_immutable: function app_users_reject_employee_change + trigger app_users_employee_immutable BEFORE UPDATE OF employee_id FOR EACH ROW; IS DISTINCT FROM -> ERRCODE 23514 (constraint name app_users_employee_is_final); rollback comment present. Matches OD-2/spec. Ordered after 20261101000200. No production code updates app_users.employee_id (app-user.repo.ts updates only status/employee_left_on/etc.).

## Deleted spec super-admin-transfer-http.integration-spec.ts (at 164f6e67) - disposition per case
- :86 / :125 AC-1/AC-2 via HTTP -> obsolete route; CLI equivalents super-admin-recovery-role:176.
- :149-221 AC-3 via HTTP -> obsolete route; CLI equivalent super-admin-recovery-role:438 (AC-3 itself belongs to sibling item).
- :236 AC-4 rollback (spy RoleGrantRepo.grantRole) -> exercised the removed SuperAdminTransferService only. RoleHandover.move (CLI, src/modules/identity-access/recovery/role-handover.service.ts:23-50: revoke then grant in one tx) has NO failure-injection test anywhere. AC-4 text (US-01-09) now says "lệnh chuyển lại vai gặp lỗi..."; spec.md:53 keeps AC-4 "chạy lại với ca có kế hoạch". => IN SCOPE, NOT COVERED.
- :281 AC-5 HTTP race (3 rounds, forced FOR UPDATE overlap, deadlock count) -> replaced by super-admin-recovery-role:291 (one round, Promise.all, no forced overlap, no deadlock check). Covered, weaker.
- :312 AC-6 role refusals -> super-admin-transfer-removed:44 (404 for all).
- :326 AC-7 -> account-roles-http:80.
- :343 AC-8 (holder TERMINATED: transfer 401, role-grants 401, role stays) -> route half obsolete; "role stays" covered by recovery-role:307/:438 (holders()==[S1] after holderLeaves); role-grants refusal covered for usable holder only (account-roles-http:80). Terminated-holder variant not tested - Low.
- :365 DB guard: head half ported to role-grant-constraints:96; approval_role_holders half (trigger role_grants_super_admin_exclusions, migration 20261016190000) not ported, no other test covers it (approval-roles-http:184 is the opposite direction, app-level). Outside this item's AC (AC-3 -> qd93-direct-manager-spending-approver-roles); flag for that sibling.

## Per-AC coverage
AC-1 covered recovery-role:176 (+:254,:263,:277, unit recovery-procedure.policy.spec.ts); AC-2 covered :176; AC-4 NOT covered (in scope); AC-5 covered :291 (weaker); AC-6 covered removed:44 + http platform; AC-7/US-01-01 AC-13 covered account-roles-http:80; AC-8 covered by composition, route half obsolete; AC-12 covered :162,:206,:220,:307; AC-13 covered :26,:263,:277; AC-16 covered role-grant-constraints:114, recovery-role:493,:55.

## Test to add (AC-4)
test/integration/identity-access/super-admin-recovery-role.integration-spec.ts, in "the role has to move to someone else": "rolls a planned transfer back when granting the successor fails after the holder was revoked (AC-4)": activeSuccessor; jest.spyOn(h.ctx.app.get(RoleGrantService), 'grantRole').mockRejectedValueOnce(new Error('disk full')); expect transferRole(ticket, {successorEmployeeCode, holderEmail}) rejects; holders() == [S1]; auditOf(ticket) has no SUPER_ADMIN.TRANSFERRED_*; ticketRow not COMPLETED (absent); S1 still 200 on GET /api/v1/app-users. Optionally same for the unusable-holder stage 2.

## Other observations
- Code review of src diff: holderUsable && no account -> SUCCESSOR_NOT_FOUND_ACCOUNT before ticket (role-transfer-recovery.api.ts:68); requireReady never sends invitation; assertSeparation APPROVER_IS_HOLDER only in SHARED. Matches spec. No issues found.
