# Plan: qd96-100-renewal-chaining-and-window

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-R).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Thứ tự Track R: #4 → #5 → #15 → #20 → **#21** → #19.
- Migration dự kiến (thứ 3 của Track R, sau `<ts>_organization_employee_contract_end_date`, trước `<ts>_requests_step_state_queued`):
  `<ts>_licensing_expiry_reminder_kind` — đặt timestamp lúc implement.

## Before coding

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/api-contract.md`, README `requests`, `licensing`. Kiểm lại:
`RenewalRequestRepo.hasOpenFor` (trạng thái kết thúc) để chắc quyền K1 được giữ khi Request ở `AWAITING_EXECUTION`;
cách tìm IT Admin phụ trách phòng (như `provisioning-grant-writer` dùng `inCharge`); test hiện có
`test/integration/licensing/renewal-request.integration-spec.ts`, `test/integration/requests/return-renewal-constraints.integration-spec.ts`.
Ranh giới `expectedSpendOn` của `renewalSubmitSchema` đã chốt: thuộc hạng mục này (C-REVIEW R-14). Không chạy full suite.

## Tasks

FE-tonight (chỉnh 05/11 theo review main flow): **phần A** = Task 1 (không vế `contractEndDate`), Task 2 và tham số
`RENEWAL_WINDOW_DAYS`; khi duyệt giữ `RenewalApplyService.apply` hiện có. **Phần B** = Task 3, 4, 5 (migration loại nhắc ở Task 5)
và vế `contractEndDate` của Task 1 (sau `approved-end-date` phần B).

### Đợt 1 — chốt contract (Owner 05/11/2026)

Đợt 1 = Task 2 + hàm `renewalEndOf` của Task 1 (cần để BE tự tính ngày mới — logic thật). `windowOpensOn`, khóa
`RENEWAL_WINDOW_DAYS` và 422 `WINDOW_NOT_OPEN` đi **Đợt 3**; vế `contractEndDate` = B. Request tiếp tục: chỉ người giữ (#4 Task 3).

| Task                  | Operation                    | Request sau                                                  | Response sau                                                                                                                                                                                                   | Test 422 field bỏ                                                                                 |
| --------------------- | ---------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1 (`renewalEndOf`), 2 | `accessRequestRenewalSubmit` | `{assignmentId, extensionMonths: int 1..12, businessReason}` | `request.renewal.newExpectedEndDate` BE tính (`previousEnd + 1` + N tháng, cắt cuối năm tài chính nếu linh hoạt), `termMonths`, giá theo ngày bắt đầu; `outcome` giữ; quyền không ngày ⟹ `NO_END_DATE` hiện có | `newExpectedEndDate`, `expectedSpendOn`, `termConfirmation` (3 test); `extensionMonths: 13` ⟹ 422 |

### Task 1: policy nối tiếp và cửa sổ

- Files: `requests/renewal-request/{renewal-request.policy.ts, renewal-request.policy.spec.ts}`;
  `operating-parameters/{parameter-definitions.policy.ts, parameter-definitions.policy.spec.ts}`.
- Depends on: `qd96-100-request-term-limit` (`termEndOf`, `termLimitOf`).
- Acceptance: `renewalEndOf`, `windowOpensOn` đúng test matrix AC-3, AC-7, Q-03 b1; khóa `RENEWAL_WINDOW_DAYS` mặc định 30.
- Verify: `pnpm jest src/modules/requests/renewal-request/renewal-request.policy.spec.ts`.

### Task 2: form gửi số tháng, neo lịch trả

- Files: `renewal-request/{renewal-request.dto.ts, renewal-request.service.ts, renewal-request-writer.service.ts,
renewal-request.errors.ts, renewal-request.http-errors.ts, renewal-requests.controller.ts, renewal-request-submission.mapper.ts}`.
- Depends on: Task 1, `qd96-100-approved-end-date` (đọc `contractEndDate`).
- Acceptance: body mới; `WINDOW_NOT_OPEN`, `CONTRACT_ENDS`; lịch trả từ `start`; nhánh sau hạn dùng `extensionMonths`.
- Verify: HTTP `accessRequestRenewalSubmit`; integration `renewal-request.integration-spec.ts` (sửa theo body mới).

### Checkpoint A

`pnpm typecheck && pnpm lint && pnpm arch:check && pnpm test:gates`; tự review theo AC-3, AC-7.

### Task 3: áp dụng theo kiểu gói (K2 tự động + báo IT; K1 chờ IT)

- Files: `renewal-apply/renewal-apply.service.ts` (+ spec mới), `need-decision/need-decision-effects.service.ts`,
  `spend-approval/spend-decision-recorder.service.ts`, `notifications/{public/notifications.types.ts, inbox/inbox.policy.ts}`.
- Depends on: Task 2.
- Acceptance: test matrix AC-13 K2, AC-13 K1 (vào hàng đợi), K4 (như K1 — điều phối viên chốt 05/11), AC-4.
- Verify: integration K1/K2 theo file.

### Task 4: thao tác IT _đã kéo dài_ và hàng đợi

- Files: `renewal-request/renewal-requests.controller.ts` (hoặc controller riêng `renewal-extension.controller.ts`),
  service mới `renewal-extension.service.ts`, `grant-queue/{grant-queue.repo.ts, grant-queue.dto.ts, grant-queue.service.ts}`,
  `test/support/{api-coverage-manifest.ts, openapi-example-manifest.ts}`.
- Depends on: Task 3.
- Acceptance: `accessRequestRenewalExtend` 200/409/403 theo matrix; `grantQueueList` có dòng `RENEWAL`.
- Verify: HTTP spec mới; `pnpm test:gates` (api coverage).

### Task 5: nhắc khi cửa sổ mở (AC-8)

- Files: `prisma/models/licensing.prisma`, `prisma/migrations/<ts>_licensing_expiry_reminder_kind/migration.sql`,
  `licensing/expiry/{expiry.policy.ts, expiry-reminder.repo.ts, expiry-reminder.service.ts, *.spec.ts}`,
  `notifications/{public/notifications.types.ts, inbox/inbox.policy.ts}`.
- Depends on: Task 1 (`RENEWAL_WINDOW_DAYS`, `windowOpensOn`).
- Acceptance: test matrix AC-8 (nhắc một lần cho người giữ và trưởng phòng; không nhắc khi đã có Request mở, tài khoản dịch vụ, chưa tới cửa sổ).
- Verify: `pnpm prisma:validate`; unit `expiry.policy.spec.ts`; `pnpm jest test/integration/licensing/license-expiry-inbox.integration-spec.ts
--config ./test/config/jest.integration.cjs` (bổ sung ca cửa sổ).

### Checkpoint B

`pnpm typecheck && pnpm lint && pnpm arch:check && pnpm rules:check && pnpm test:gates && pnpm openapi:export`; test theo
file; ghi bằng chứng.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| chưa chạy          | —                     | —                 | —                       |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh đúng implementation cuối; Open questions đã có câu trả lời hoặc ghi mặc định đã dùng.
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
