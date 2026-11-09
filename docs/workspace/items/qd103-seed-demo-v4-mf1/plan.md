# Plan: qd103-seed-demo-v4-mf1

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `d9e83c86` (sau `qd103-seed-demo-v4` Checkpoint C).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI (subagent chat review, W7).
- Owner review: chưa review. Peer review: cổng thiết kế W7 — đã chạy 09/11/2026 (`design-audit-w7.md`), đã sửa (mục _Design review_).
- Triển khai: `not-started`. PR: chưa có. Cỡ ước: M ≈ 11h, ~22 file ⟹ 2 phase, mỗi phase một commit `feat(qd103-w7): seed-demo-v4-mf1 P<n>`.

## Before coding

- Điều kiện: W1 → W6 PASS và `qd103-seed-demo-v4` Checkpoint C (commit P3).
- Đối chiếu body thật trong `openapi.json` của: `accessRequestSubmit` (`expectedEndDate`, `manyPaidSoftwareReason`), `groupRequestSubmit`,
  `accessRequestPropose`, `spendBatchSubmit`, `spendReserveConfirm`, `provisioningTaskGrant` (`purchase`), `provisioningTaskComplete` (`licenseKeyId`,
  `deviceId`), `deviceCreate`, `licenseKeyImport`, `licenseKeyWithdraw`, `licenseAssignmentRoleBasedCreate`, `purchaseInvoiceSubmit`,
  `purchaseInvoiceConfirm`, `purchaseInvoiceReturn`, `appUserChangeRole`, `departmentHeadAssign`. Lệch tên/trường ⟹ sửa spec mục 6 (không đổi API).
- Đọc mã lỗi hiện có cho ba dòng chưa có mã: DM1-54 (`spendApprovalDecide` khi Request chưa có bước chi mở), DM1-59 (Super Admin gửi Request),
  DM1-55 (lý do dòng _khác phòng_ của Request nhóm nhân viên); ghi mã thật vào spec mục 6.
- Đọc định nghĩa `pending` của W3 (`budget-check-three-outcomes` mục 1) để unit _số tiền không phụ thuộc tháng_ dùng đúng: R11, R22 bị chặn có tính vào
  `pending` của SAL không (DM1-53 cần `pending` = 0); và `confirm_due_on` sau `purchaseInvoiceResubmit` (DM1-52 dùng SV-HD4 nộp lại ở `D0`).
- Kiểm tra nhanh theo tracker §4.5 mỗi task; không `pnpm check`, không full suite.

## Design review

Audit thiết kế bằng subagent chỉ-đọc 09/11/2026 (`design-audit-w7.md`). Hạng mục này nhận DA7-05 (Cao), DA7-06 (Cao, vế DM1), DA7-07 (vế DM1-15,
DM1-52), DA7-08 (SV-HD5), DA7-11 (DM1-50 tháng 12), DA7-16, DA7-23, DA7-24 ⟹ đã sửa trong spec: R10/R11/R22 ổn định mọi tháng nhờ MKT/SAL không seat
trả phí nền (dữ liệu ở spec nền), thứ tự dòng theo `scenarioDay`, R25 đề xuất thứ hai cho DM1-15, DM1-52 dùng SV-HD4, SV-HD5 Notion, DM1-50 tính _theo
`D0`_, DM1-53…59, DM1-08 mã `REQUEST_PARTY.INELIGIBLE` (đọc code), DM1-14 đích `AWAITING_SPEND_SUBMISSION`, `REMOVED_OPERATIONS` cho DM1-42, DM1-35 giải
phóng cam kết, RB1–RB3 trong unit kho. Sửa khác đề xuất: DM1-54 (R10 chưa có bước chi nên Người duyệt chi không _duyệt trước_ được — dòng kiểm lời
từ chối); ngoại lệ GH-1 trong chồng lấn MF-3 chuyển `-mf5` DM5-37 (cùng dữ liệu NV-MOV1); DM1-57, DM1-58 chạy world riêng. Finding không sửa: không có.

## Tasks

### Phase 1 — Request

### Task 1: kiểu kịch bản và đường đi

- Files: `src/cli/seed/fixture/demo-fixture.types.ts` (`kind`, `end`, `expectCheck`, `expectRouting`, `manyPaidSoftwareReason`, `grant`),
  `src/cli/seed/steps/scenario-path.ts`, `src/cli/seed/steps/scenario-path.spec.ts`.
- Depends on: `qd103-seed-demo-v4` Checkpoint C.
- Acceptance: test matrix _đường kịch bản_.
- Verify: `pnpm exec jest src/cli/seed/steps/scenario-path.spec.ts`.

### Task 2: 25 Request theo bảng, Request nhóm, đề xuất, Request một bước

- Files: `src/cli/seed/fixture/shared-demo-v4/requests.ts` (gồm R25), `src/cli/seed/steps/request.steps.ts` (gửi theo `kind`; `expectedEndDate` từ
  `demo-dates`; trình lô theo phòng; đọc `budgetCheckGet`/`routing`; cấp từ kho), `src/cli/seed/fixture/shared-demo-v4/extras.ts`,
  `src/cli/seed/steps/extras.steps.ts`, `src/cli/seed/fixture/shared-demo-v4.spec.ts` (mô phỏng GH, bất đẳng thức `EOM` với `spent` tối đa và `pending`,
  đủ chỗ trong kho).
- Depends on: Task 1.
- Acceptance: spec mục 2; test matrix _GH theo thứ tự seed_, _số tiền không phụ thuộc tháng_, _kho đủ chỗ_ (trừ dòng `K4`).
- Verify: `pnpm exec jest src/cli/seed/fixture/shared-demo-v4.spec.ts src/cli/seed/steps`.

### Checkpoint A

Kiểm tra nhanh §4.5 xanh; `pnpm exec jest src/cli/seed` xanh;
`pnpm test:integration -- test/integration/installation/seed.integration-spec.ts` (phần Request) xanh. Commit `… P1`.

### Phase 2 — tài sản, quyền theo vai, hóa đơn, kiểm chứng

### Task 3: thiết bị và kho khóa `K4` (R19, R20)

- Files: `src/cli/seed/fixture/shared-demo-v4/assets.ts` (mới), `src/cli/seed/steps/assets.steps.ts` (mới: `deviceCreate`, `licenseKeyImport`,
  `licenseKeyWithdraw`; idempotent theo tag, mọi trạng thái ⟹ `present`), `src/cli/seed/demo-run.types.ts` (`devices`, `licenseKeys`),
  `src/cli/seed/seed-steps.ts`, `requests.ts` (R19 `grant: KEY`).
- Depends on: Checkpoint A.
- Acceptance: spec mục 3; KEY-1 `ASSIGNED` trên D-DEV2, KEY-2 rút, R20 chờ cấp với kho khóa 0.
- Verify: `pnpm exec jest src/cli/seed`.

### Task 4: quyền theo vai RB1–RB3

- Files: `src/cli/seed/fixture/shared-demo-v4/role-based.ts` (mới), `src/cli/seed/steps/role-based.steps.ts` (mới: `licenseAssignmentRoleBasedCreate`
  đúng người ghi; idempotent qua `licenseAssignmentRoleBasedList`, mọi trạng thái ⟹ `present`), `src/cli/seed/seed-steps.ts`.
- Depends on: Task 3.
- Acceptance: spec mục 4; không `ASSIGNMENT.OVERLAP` với seat nền (unit của spec nền); Slack 3/3, Google Workspace 2/3.
- Verify: `pnpm exec jest src/cli/seed`.

### Task 5: hóa đơn SV-HD1…SV-HD5

- Files: `src/cli/seed/fixture/shared-demo-v4/invoices.ts` (mới, thay mảng `invoices` của W4 Task 8), `src/cli/seed/steps/invoice.steps.ts` (tách từ
  `finance.steps.ts`: IT nộp + tải tệp, Finance xác nhận/trả), `src/cli/seed/steps/finance.steps.ts`, `src/cli/seed/seed-steps.ts`,
  `src/cli/seed/fixture/shared-demo-v4.spec.ts` (SV-HD5 phủ đúng kỳ đang chạy của Notion).
- Depends on: Task 4.
- Acceptance: spec mục 5; idempotent theo (nhà cung cấp, số), mọi trạng thái.
- Verify: `pnpm exec jest src/cli/seed`.

### Task 6: integration seed phần MF-1

- Files: `test/integration/installation/seed.integration-spec.ts`, `seed-rerun.integration-spec.ts`, `seed-calendar.integration-spec.ts`.
- Depends on: Task 5.
- Acceptance: các dòng integration của test matrix.
- Verify: `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts test/integration/installation/seed-calendar.integration-spec.ts`.

### Task 7: flow `@MF1`, README

- Files: `test/flows/demo-mf1.flow-spec.ts` (mới, `@MF1 @DEMO`, DM1-01 → DM1-59: dòng `D0` theo thứ tự bảng, dòng có ngày sắp theo `scenarioDay`;
  DM1-57, DM1-58 trong `describe` world riêng), `test/support/flows/demo-scenarios.ts` (ID, khóa _Khi_, kết quả _theo `D0`_ của DM1-50 và
  `DEMO_SCENARIO_OPERATIONS`/`REMOVED_OPERATIONS` phần MF-1), `test/support/flows/flow-world.ts` (pass `role-hold`, `purchase-invoice-reminder` nếu W4
  chưa đăng ký), `test/flows/demo-sbf20.flow-spec.ts` (DS20-13 khẳng định dòng `CANCELLED` = SV-HD5 khi fixture có SV-HD5),
  `src/cli/seed/fixture/shared-demo-v4/README.md`.
- Depends on: Task 6.
- Acceptance: test matrix _MF-1 từng bước_, _consumer_; không `FlowClockError`.
- Verify: `pnpm test:flows -- test/flows/demo-mf1.flow-spec.ts test/flows/demo-sbf20.flow-spec.ts test/flows/mf1-request-contract.flow-spec.ts test/flows/mf1-group-request.flow-spec.ts test/flows/mf2-offboarding.flow-spec.ts test/flows/mf3-transfer.flow-spec.ts test/flows/f0-auth-roles.flow-spec.ts`;
  `pnpm exec jest src/cli/seed/fixture/shared-demo-v4.spec.ts`; `pnpm rules:format` rồi `pnpm rules:check`.

### Checkpoint B

Kiểm tra nhanh §4.5 xanh; test theo file Task 3–7 xanh; "`pnpm check` và test toàn bộ CHƯA chạy". Commit `… P2`. Sau đó giao `qd103-seed-demo-v4-mf5`.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| (chưa chạy)        | —                     | —                 | full suite ở W9         |

- [ ] AC trong scope có bằng chứng; lệch so với thiết kế ghi ở cột _Giới hạn_ trên.
- [ ] Giao chat review (R2) SHA hai commit.
