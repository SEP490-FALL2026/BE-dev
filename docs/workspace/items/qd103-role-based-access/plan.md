# Plan: qd103-role-based-access

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `5fd5f594` (sau commit `qd103-commitment-release-on-revocation`; W2, W3 PASS).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W4, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **hai lượt** — Phase 1 ghi + danh sách + mua + ghi thất bại (Task 1–3, Checkpoint A), Phase 2 thôi vai + chuyển căn cứ +
  sweeper (Task 4–6, Checkpoint B). Ước ~50 file.

## Before coding

Đọc `src/modules/licensing/README.md` (capability, invariants :130-146, listener :140-141), `src/modules/identity-access/README.md`,
`docs/decisions/0018-sweepers-stay-in-the-api-process.md`, `docs/rules/security-jobs.md:69-131` (đăng ký sweeper), `docs/rules/module-structure.md`
(:60-66 nhóm chỉ qua điểm vào; :66-67 phần capability khác dùng là capability; :79-88 R6 không vòng — `role-based` là capability L3 chỉ import
file gốc của `provisioning`, không import nhóm `tasks/`), `scripts/arch/tiers.cjs`. Đối chiếu: `identity-access/accounts/role-grant.service.ts:30-65`,
`identity-access/public/identity-access.extension-points.ts:23-28` (mẫu `ApprovalRoleChangeListeners`), `licensing/expiry/expiry-reminder.job.ts:5-51`,
`licensing/provisioning/provisioning-task-frame.service.ts:44-110` (`selfExecutionMode`, `tellSuperAdmin`), `provisioning/tasks/provisioning-decision.service.ts:85-155`,
`provisioning/grant-cancellation/provisioning-cancellation.service.ts:61-95`, `licensing/handover/handover-confirmer.policy.ts:30-63`,
`licensing/provisioning/revocation.service.ts:42-52`, `core/working-days.ts:25-39`, `operating-parameters/public/` (`getValueAt` :63), W3 `requests/request-limits/`.

## Design review

Audit `design-audit-w4.md` (08/11/2026) — hạng mục này: 1 Cao · 8 TB · 2 Thấp (gồm DA4-29 chung với hóa đơn).

| Finding                                                               | Mức  | Kết quả                                                                                                                     | Sửa ở                               |
| --------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| DA4-03 tác vụ chuyển căn cứ thất bại/rút làm mất seat đang dùng       | Cao  | đã sửa — cột `converts_assignment`; `closeFailed`/`cancel`/`cancelForWithdrawal` không đụng Assignment                      | spec _Behavior_ 6; Task 5           |
| DA4-04 `assignment → provisioning` vòng, gọi nhóm của capability khác | TB   | đã sửa — capability `licensing/role-based/` (L3) + `shared-pool`                                                            | spec _Sizing_, _Ownership_; Task 2  |
| DA4-05 hạn giữ viết cứng                                              | TB   | đã sửa — tham số `ROLE_BASED_HOLD_WORKING_DAYS`, `getValueAt` (R-K03)                                                       | spec _Behavior_ 4; Task 1, 4        |
| DA4-06 Q-41 trái `QĐ-77m`                                             | TB   | đã sửa — `selfExecutionMode`: 403 khi còn IT khác, cờ + báo SA khi một IT                                                   | spec _Behavior_ 1; Task 2           |
| DA4-07 `ROLE_ENDED` rơi về trưởng phòng xác nhận bàn giao             | TB   | đã sửa — `IT_ADMIN` (Q-49)                                                                                                  | spec _Behavior_ 7; Task 6           |
| DA4-08 ghi lần đầu thất bại để Assignment mở                          | TB   | đã sửa — `closeFailedWithoutRequest`                                                                                        | spec _Behavior_ 2; Task 3           |
| DA4-09 enum mới dùng trong cùng migration                             | TB   | đã sửa — `<ts>_role_based_values` + `<ts+1>_role_based_access`                                                              | Task 1                              |
| DA4-12 ma trận thiếu ca; listener vai không được ném                  | TB   | đã sửa — 7 dòng test; định nghĩa _Request mở_; listener no-op                                                               | spec _Behavior_ 4, 7; _Test matrix_ |
| DA4-29 `K1` theo vai không có đích hóa đơn                            | TB   | đã sửa ở `qd103-purchase-invoice-sbf19` (đích `HOLDER_DEPARTMENT`/`UNALLOCATED_COST_CENTER` theo `QĐ-104g`); ở đây giữ `K1` | spec _Behavior_ 2                   |
| DA4-10 `addWorkingDays` không tính ngày gốc                           | Thấp | đã sửa — `nthWorkingDayFrom` ở `core/working-days.ts` (dùng chung với hóa đơn)                                              | Task 1                              |
| DA4-11 migration dự phòng partial unique thừa                         | Thấp | đã sửa — bỏ                                                                                                                 | Task 5                              |

Không sửa: không có.

## Tasks

### Phase 1 — ghi quyền theo vai, danh sách, mua khi kho hết

### Task 1: hai migration + helper ngày 1 + tham số

- Files: `prisma/migrations/<ts>_role_based_values/migration.sql` (3 `ADD VALUE`), `prisma/migrations/<ts+1>_role_based_access/migration.sql`
  (enum `RoleBasedKind`, cột Assignment, `converts_assignment`, CHECK, index), `prisma/models/licensing.prisma`, `src/core/working-days.ts`
  (`nthWorkingDayFrom`), `src/core/working-days.spec.ts`, `src/modules/operating-parameters/parameter-definitions.policy.ts` (+ spec),
  `test/integration/licensing/license-assignment-constraints.integration-spec.ts` (ca CHECK), `test/integration/licensing/provisioning-task-constraints.integration-spec.ts`.
- Depends on: `qd103-grant-from-shared-pool` (enum `ProvisioningPurchaseKind`); W2 PASS (`parameter-definitions.policy.ts`).
- Acceptance: test matrix _migration_ (phần DB), `nthWorkingDayFrom`; tham số mặc định 5, owner `SUPER_ADMIN`.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`; `pnpm exec jest src/core/working-days.spec.ts src/modules/operating-parameters`;
  `pnpm test:integration -- test/integration/licensing/license-assignment-constraints.integration-spec.ts test/integration/licensing/provisioning-task-constraints.integration-spec.ts`.

### Task 2: capability `role-based` — ghi + danh sách (`licenseAssignmentRoleBasedCreate`, `licenseAssignmentRoleBasedList`)

- Files: `src/modules/licensing/role-based/role-based.service.ts`, `role-based.policy.ts` (+ spec), `role-based.repo.ts`, `role-based.dto.ts`,
  `role-based.errors.ts`, `role-based.http-errors.ts`, `role-based-assignments.controller.ts` (mới), `licensing/assignment/assignment.service.ts`
  (`createRoleBased`), `licensing/assignment/assignment.dto.ts` (lọc `ROLE_BASED`), `licensing.module.ts`, `test/support/api-coverage-manifest.ts`;
  test `test/integration/licensing/role-based-assignment.integration-spec.ts` (mới), `test/http/licensing/role-based-assignments.http-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: test matrix AC-1, AC-2, AC-3, AC-4, `QĐ-77m`, _loại gói_, AC-5; `role-based` không bị capability nào import.
- Verify: `pnpm exec jest src/modules/licensing/role-based src/modules/licensing/assignment`;
  `pnpm test:integration -- test/integration/licensing/role-based-assignment.integration-spec.ts test/integration/licensing/license-assignment-http.integration-spec.ts`;
  `pnpm test:http -- test/http/licensing/role-based-assignments.http-spec.ts`; `pnpm arch:capabilities --module licensing`.

### Task 3: mua khi kho hết + thông báo Finance + ghi lần đầu thất bại

- Files: `role-based/role-based.service.ts` (gọi `shared-pool`), `src/modules/notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts`,
  `licensing/assignment/assignment.service.ts` (`closeFailedWithoutRequest`), `provisioning/tasks/provisioning-decision.service.ts` (nhánh `GRANT` không Request);
  test thêm ca vào `test/integration/licensing/role-based-assignment.integration-spec.ts`.
- Depends on: Task 2; W2 PASS (`notifications.types.ts`, `inbox.policy.ts`).
- Acceptance: test matrix AC-8, _ghi thất bại_.
- Verify: `pnpm exec jest src/modules/notifications/inbox src/modules/licensing/provisioning`;
  `pnpm test:integration -- test/integration/licensing/role-based-assignment.integration-spec.ts test/integration/licensing/provisioning-failure-constraints.integration-spec.ts`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`,
`pnpm openapi:export` — diff: 2 operation mới, `licenseAssignmentList`). Tự review theo spec mục 1–3, 8. Ghi _Verification_.

### Phase 2 — thôi vai, chuyển căn cứ, hết hạn giữ

### Task 4: `RoleEndedListeners` + listener hạn giữ + `licenseAssignmentRoleBasedEnd`

- Files: `src/modules/identity-access/public/identity-access.extension-points.ts`, `identity-access/public/identity-access.types.ts`,
  `identity-access/accounts/role-grant.service.ts`, `identity-access/identity-access.module.ts`, `identity-access/README.md`,
  `licensing/role-based/role-ended.listener.ts` (mới), `role-based.policy.ts` (hạn giữ), `role-based-assignments.controller.ts`;
  test `test/integration/identity-access/account-role-change.integration-spec.ts` (ca sự kiện), `test/integration/licensing/role-based-hold.integration-spec.ts` (mới).
- Depends on: Checkpoint A.
- Acceptance: test matrix AC-9 hạn giữ, _tham số_, AC-9 phủ định, `WORKSPACE_ADMIN`, _listener vai_.
- Verify: `pnpm exec jest src/modules/identity-access/accounts src/modules/licensing/role-based`;
  `pnpm test:integration -- test/integration/identity-access/account-role-change.integration-spec.ts test/integration/identity-access/direct-approval-roles.integration-spec.ts test/integration/licensing/role-based-hold.integration-spec.ts`.

### Task 5: Request trong hạn giữ + giữ seat khi duyệt + tác vụ chuyển căn cứ không đụng Assignment

- Files: `src/modules/licensing/public/licensing.api.ts` (`roleBasedHoldOf`), `licensing/public/licensing.types.ts`,
  `licensing/provisioning/tasks/provisioning-grant-planner.service.ts`, `tasks/provisioning-grant-writer.service.ts`, `tasks/provisioning.service.ts`,
  `tasks/provisioning-decision.service.ts` (`closeFailed`, `cancel`), `grant-cancellation/provisioning-cancellation.service.ts` (+ `grant-cancellation.policy.ts` + spec),
  `src/modules/requests/request-limits/request-limits.service.ts` (W3), `requests/request-intake/access-request.service.ts`;
  test `test/integration/licensing/role-based-conversion.integration-spec.ts` (mới), `test/integration/requests/request-limits.integration-spec.ts` (W3, ca `ROLE_ENDED`).
- Depends on: Task 4; W3 `qd103-request-limits-gh` đã PASS.
- Acceptance: test matrix `QĐ-108c`, AC-9 duyệt, _chuyển thất bại_ (3 ca).
- Verify: `pnpm exec jest src/modules/licensing/provisioning src/modules/requests/request-limits src/modules/requests/request-intake`;
  `pnpm test:integration -- test/integration/licensing/role-based-conversion.integration-spec.ts test/integration/requests/request-limits.integration-spec.ts test/integration/licensing/provisioning-grant-http.integration-spec.ts test/integration/requests/group-request-withdrawal.integration-spec.ts`.

### Task 6: sweeper hết hạn giữ + hook Request mở + bàn giao `ROLE_ENDED` + MF-2 + README

- Files: `licensing/role-based/role-hold.job.ts` (+ spec), `licensing/public/licensing.extension-points.ts` (`RoleHoldRequestHook`),
  `src/modules/requests/grant/role-hold-request.listener.ts` (mới), `requests/requests.module.ts`, `licensing/licensing.module.ts`,
  `licensing/handover/handover-confirmer.policy.ts` (+ spec), `licensing/README.md`, `docs/rules/security-jobs.md`;
  test `test/integration/licensing/role-based-hold.integration-spec.ts` (ca sweeper, bàn giao), `test/integration/personnel/offboarding-departure.integration-spec.ts` (AC-7).
- Depends on: Task 5.
- Acceptance: test matrix AC-9 hết hạn, _bàn giao `ROLE_ENDED`_, AC-7, _không cam kết_, _migration + seed_.
- Verify: `pnpm exec jest src/modules/licensing/role-based src/modules/licensing/handover`;
  `pnpm test:integration -- test/integration/licensing/role-based-hold.integration-spec.ts test/integration/personnel/offboarding-departure.integration-spec.ts test/integration/budgets/commitment-release-on-revocation.integration-spec.ts test/integration/installation/seed.integration-spec.ts`;
  `pnpm test:flows -- test/flows/f0-auth-roles.flow-spec.ts test/flows/mf2-offboarding.flow-spec.ts`; `pnpm arch:check`; `pnpm test:gates`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ ở operation spec nêu; `pnpm arch:capabilities --module licensing` không vòng; tự review theo
spec mục 4–7, 9; ghi _Verification_. Seed: không có task seed (fixture không có quyền theo vai).

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
