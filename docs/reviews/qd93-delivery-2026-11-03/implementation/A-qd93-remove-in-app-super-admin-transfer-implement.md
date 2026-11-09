# A - qd93-remove-in-app-super-admin-transfer implement log

Skills read: test-driven-development, verification-before-completion, incremental-implementation (mapping: process = incremental-implementation, verification = verification-before-completion).

## Task 1 - planned transfer-role
- Red: integration super-admin-recovery-role (6 of 22 failed, all HOLDER_STILL_USABLE / missing APPROVER_IS_HOLDER), unit recovery-procedure.policy.spec + recover.arguments.spec (2 failed).
- Green: integration super-admin-recovery-role + recovery-cli 28/28; unit src/modules/identity-access/recovery + src/cli/recover 33/33; tsc --noEmit and pnpm lint clean.
- Changes: HOLDER_STILL_USABLE removed, APPROVER_IS_HOLDER added, SuccessorEnrolment.requireReady, SUCCESSOR_NOT_FOUND_ACCOUNT before ticket, assertSeparation holderEmail param, --help text.
- Deviation: added new unit spec recovery-procedure.policy.spec.ts (none existed). Test "refuses an operator who is the holder" and "without holder email" were already green (spec says no code change) - kept as regression.
- Tests for fresh admin token: h.admin token is stale after restoreHolder, so the new helper signs in again.

## Task 2 - remove POST /api/v1/super-admin-transfers
- Red: super-admin-transfer-removed.integration-spec failed (holder got 200 and the role moved); account-roles-http new message test failed with old message.
- Green: integration removed+account-roles-http+recovery-cli 22/22; gates module-graph 37/37; arch:check clean; arch:docs:check after pnpm arch:graph + arch:routes; test:http platform + identity-access 14 suites 210 tests; unit src/modules/identity-access 191/191; lint, typecheck clean; openapi:export regenerated (305 operations).
- Changes: deleted 4 src files + http-spec + http integration spec; module providers SuccessorEligibility and APPROVAL_ROLE_HOLDINGS removed from IdentityAccessModule (kept in recovery CLI module); SUPER_ADMIN_TRANSFER.* mapper/errors gone; SUPER_ADMIN_TRANSFER_ONLY message and OpenAPI descriptions changed; manifests; generators.
- Deviation: docs/generated/module-graph.md also regenerated (arch:graph) because arch:docs:check flagged it.
- Coverage note: the deleted super-admin-transfer-http spec also held AC-4 rollback, AC-8 and a DB-backstop case (grant SUPER_ADMIN to head/approval-role holder); AC-5 concurrency moved to the recovery spec in Task 1; backstop case ported in Task 3 (see below).

## Task 3 - account bound to one person (AC-16, OD-2)
- Migration prisma/migrations/20261102043614_identity_app_user_employee_immutable (real UTC at creation; after latest 20261101000200). merged-migrations.txt untouched.
- Red: role-grant-constraints new employee-immutable case failed (UPDATE resolved). Green: role-grant-constraints + super-admin-recovery-role 29/29; prisma:validate ok; migration-order gate 6/6.
- Added regression in recovery spec (transfer + reset leave app_users.employee_id unchanged; already green by design) and ported the head-of-department DB guard case (23514) from the deleted http integration spec into role-grant-constraints. The approval-role-holder half of that old case was NOT ported (approval roles are being reworked by sibling items).

## Task 4 - docs
- Updated docs/rules/operational-commands.md (ops:recover row), README.md, src/modules/identity-access/README.md, superseded note in us-01-09-super-admin-transfer-recovery/spec.md. docs/generated/routes.md already regenerated in task 2. No runbook under docs/guides mentions transfer-role (checked).
- arch:docs:check, rules:check (0 errors), rules:format: exit 0.

## Final verification
- First pnpm check run failed at lint (no-unsafe-return in the new AC-16 test); fixed in 89202039 (typed query), file re-run 23/23.
- Second pnpm check (TEST_DATABASE_* unset): CHECK_EXIT 0 on 89202039.
- Per-file integration (5 files) 51/51 before the lint fix; pnpm test:http 57 suites 1447 tests; openapi:export no drift.
- Deferred to phase B: pnpm test:integration (full), pnpm test:e2e, pnpm test:integration:timing.
- Status fields: plan.md "Triển khai: in-progress - implemented-local (phase A...)" (rules:check accepts only the enum inside backticks); spec.md has the same text in a Triển khai line.
