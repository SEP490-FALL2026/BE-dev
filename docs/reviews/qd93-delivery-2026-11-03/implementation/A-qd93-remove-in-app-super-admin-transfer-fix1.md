# qd93-remove-in-app-super-admin-transfer fix round 1
Skills: test-driven-development, verification-before-completion (read).
Finding: US-01-09 AC-4 rollback of CLI transfer-role untested.
Test added: super-admin-recovery-role.integration-spec.ts "rolls a planned transfer back when granting the successor fails after the holder was revoked" (spy RoleGrantService.grantRole rejects once).
Red-first: NOT red; passed immediately. Reason: RoleTransferRecoveryApi.transferRole runs the whole move (ticket open, revoke, grant, setStatus, audit) inside one TransactionRunner.run, so throw rolls back all. Ticket row absent after failure; retry same ticket succeeds. No production change.
Per-file run: 24/24 pass (A-fix1-spec.log). pnpm check: exit 0 (A-fix1-check.log).
plan.md: AC-4 evidence row added.
Commit: 7daf6856
