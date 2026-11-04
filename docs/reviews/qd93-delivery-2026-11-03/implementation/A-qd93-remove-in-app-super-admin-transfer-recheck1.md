# Recheck 1: qd93-remove-in-app-super-admin-transfer (AC-4 rollback test)

Date: 2026-11-02. Repo `BE-dev-software-license-management`, branch `feat/qd93-remove-in-app-super-admin-transfer`, HEAD `7daf6856adf9e96297a4b17eb2e5861358ccb786`.

Skills: `superpowers:verification-before-completion` (verification; it also served as the process skill for this short read-only re-check). No domain skill was needed.

## 1. Static read of commit 7daf6856

- The commit changes two files: `plan.md` (+1 row) and `test/integration/identity-access/super-admin-recovery-role.integration-spec.ts` (+26 lines: 1 import and 1 `it`).
- The spy is `h.recoveryModule.get(RoleGrantService, { strict: false })`. `recoveryModule` is the `RecoveryCliModule` testing module, and `h.recovery.transferRole` calls `RoleTransferRecoveryApi` from that same module. The spy is `mockRejectedValueOnce` and is restored in `finally`.
- Order in `RoleHandover.move` (`src/modules/identity-access/recovery/role-handover.service.ts`): `revokeRole(holder)` runs before `grantRole(successor)`. The failing grant therefore comes after the revoke. The `catch` maps only SQLSTATE 23514, so the generic error is rethrown.
- `RoleTransferRecoveryApi.transferRole` puts every step from the lock through ticket open, handover, ticket COMPLETED and audit inside one `this.runner.run(...)`.
- The assertions read the DB (`holders()`, `ticketRow()`, `auditOf()`), not mocks. The only mock assertions are `toHaveBeenCalledTimes(1)` and the rejection. After the fault, the same ticket is re-run and the test asserts `ROLE_TRANSFERRED` with holder = successor.

## 2. Mutation experiment (working tree only, never committed)

The mutation was in `src/infrastructure/database/transaction-runner.ts` `run()`:
`if (process.env.MUT_NO_TX) return await work(this.prisma as unknown as DbTx);` placed before `$transaction`, so the callback runs with no transaction.

I ran the single file with `MUT_NO_TX=1` and the inline env. Log: `A-recheck1-mutant.log`.
- Result: exit 1, **Tests: 2 failed, 22 passed, 24 total**.
- The new AC-4 case FAILED at line 222: `holders()` expected `[superAdmin]`, received `[]`. The holder's revoke had persisted without rollback.
- Its earlier assertions (the rejection and `grantFails` called once) passed, which proves the spy sits on the instance that the CLI path uses.
- The second failure ("refuses an invited successor ... while the holder can still act", tickets 5→6) is the next test in order. It most likely failed because of the state the mutant left behind. It does not affect the verdict.

Restore: `git checkout -- src/infrastructure/database/transaction-runner.ts`. Afterwards `git status --short` was empty and `git stash list` was empty.

## 3. Per-file run on the clean tree

I ran `npx jest --config ./test/config/jest.integration.cjs test/integration/identity-access/super-admin-recovery-role.integration-spec.ts` with the inline env only (`TEST_DATABASE_ADMIN_URL`, `TEST_DATABASE_BOOTSTRAP_URL` on 127.0.0.1:55432). Log: `A-recheck1-clean.log`.
- exit 0, **Test Suites: 1 passed; Tests: 24 passed, 24 total**. The AC-4 case passed (293 ms).
- `git status --short` was empty after the run. HEAD was unchanged at `7daf6856`.

## Verdict

PASS. The new test checks the real rollback, and it fails when the transaction is removed. No commits, pushes, Docs edits or full-suite runs were made.
