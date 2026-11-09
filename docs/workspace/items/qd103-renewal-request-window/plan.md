# Plan: qd103-renewal-request-window

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `1cd81101` + commit năm hạng mục W3 trước + commit W2.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W3, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **một lượt** (4 task, ~20 file).

## Before coding

Đọc README `licensing` (expiry, job, thứ tự khóa), README `requests` (renewal), `docs/rules/database-business.md` (bảng bất biến),
`docs/rules/module-structure.md` (file mới ở cấp capability `licensing/expiry/` mang tiền tố `expiry-` như các file cùng thư mục).
Đối chiếu: `licensing/expiry/expiry-reminder.service.ts:38-63,163-190`, `expiry-reminder.repo.ts` (`candidates`, `insertMany`),
`expiry-reminder.job.ts`, `licensing/expiry/expiry.policy.ts:1-60`, `requests/renewal-request/renewal-request.policy.ts:55-80`,
`renewal-request.service.ts:46-88`, `renewal-request.errors.ts`, `renewal-request.http-errors.ts:15-30`,
`renewal-apply/renewal-apply.service.ts:31-63`, `spend-approval/spend-decision-recorder.service.ts:84-89`, `core/term-limit.ts:31-39`.

## Design review

Audit thiết kế bằng subagent chỉ-đọc 08/11/2026: 1 Cao (chung với amount-and-term, commitment), 0 Trung bình, 1 Thấp ⟹ đã sửa
(DA3-02: Q-29 đổi ở amount-and-term, hạng mục này thêm test quyền kết thúc 31/12 gửi/duyệt tháng 12 và duyệt tháng 01; DA3-22:
ghi giới hạn lượt quét trễ thành Q-34 + README, có test unit); tên file mới đổi `renewal-window.*` → `expiry-renewal-window.*` theo
quy ước thư mục; không sửa: không có.

## Tasks

### Task 1: migration bảng cửa sổ đã mở

- Files: `prisma/models/licensing.prisma` (`AssignmentRenewalWindow`), `prisma/migrations/<ts>_assignment_renewal_windows/migration.sql`
  (PK, FK, CHECK `opens_on`, trigger bất biến, quyền runtime role), `test/integration/licensing/renewal-window-constraints.integration-spec.ts` (mới).
- Depends on: none (trong hạng mục).
- Acceptance: DB từ chối `opens_on` sai, `window_days` 0, UPDATE/DELETE; chèn trùng PK bị bỏ qua bằng `ON CONFLICT`.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/licensing/renewal-window-constraints.integration-spec.ts`.

### Task 2: tham số + lượt mở cửa sổ + thông báo

- Files: `operating-parameters/parameter-definitions.policy.ts` (+ spec), `licensing/expiry/expiry-renewal-window.policy.ts` (mới, + spec),
  `licensing/expiry/expiry-renewal-window.repo.ts` (mới), `licensing/expiry/expiry-renewal-window.service.ts` (mới), `licensing/expiry/expiry-reminder.job.ts`,
  `licensing/licensing.module.ts`, `notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts`,
  `licensing/public/licensing.api.ts` (`renewalWindowOf`), `test/integration/licensing/renewal-window.integration-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: test matrix AC-8 (2 ca), AC-9 (không dòng), tham số (HTTP), R-D05 phần lượt quét.
- Verify: `pnpm exec jest src/modules/licensing/expiry src/modules/operating-parameters`;
  `pnpm test:integration -- test/integration/licensing/renewal-window.integration-spec.ts test/integration/licensing/license-expiry-inbox.integration-spec.ts test/integration/requests/assignment-expiry-reminders.integration-spec.ts test/integration/operating-parameters/operating-parameters-http.integration-spec.ts`.

### Task 3: kiểm cửa sổ khi gửi Request tiếp tục; Q-03 = A có test

- Files: `requests/renewal-request/renewal-request.policy.ts` (+ spec), `renewal-request.service.ts`, `renewal-request.errors.ts`,
  `renewal-request.http-errors.ts` (+ ví dụ OpenAPI), `renewal-requests.controller.ts` (mô tả lỗi), `access-request/request-facts.service.ts`
  (`settings()` thêm `renewalWindowDays`), test `test/integration/licensing/renewal-request.integration-spec.ts` (ca cửa sổ, duyệt ⟹
  kéo dài ngay, không tác vụ IT; quyền kết thúc 31/12 gửi/duyệt tháng 12 và duyệt tháng 01), `test/integration/requests/return-renewal-constraints.integration-spec.ts`,
  `test/http/requests/renewal-window.http-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix AC-7 (4 ca), R-D05 (3 ca), QĐ-108a, AC-1/AC-13, AC-4, AC-12, AC-16, DA3-02/Q-29 (2 dòng), Q-34 (unit).
- Verify: `pnpm exec jest src/modules/requests/renewal-request`;
  `pnpm test:http -- test/http/requests/renewal-window.http-spec.ts`;
  `pnpm test:integration -- test/integration/licensing/renewal-request.integration-spec.ts test/integration/requests/return-renewal-constraints.integration-spec.ts`.

### Task 4: flow và seed

- Files: `test/flows/mf1-request-contract.flow-spec.ts` (ca Request tiếp tục dòng 148: ngày gửi nằm trong cửa sổ theo
  `seed-calendar`), README `licensing` (bảng cửa sổ, lượt quét, vận hành lần đầu, giới hạn Q-34), README `requests`.
- Depends on: Task 3.
- Acceptance: flow MF-1 xanh; `ops:seed` xanh.
- Verify: `pnpm test:flows -- test/flows/mf1-request-contract.flow-spec.ts`;
  `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`.

### Checkpoint

Kiểm tra nhanh tracker §4.5; `openapi:export` (ví dụ lỗi mới, mô tả). Tự review diff.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
