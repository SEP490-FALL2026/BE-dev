# Plan: qd96-100-spend-notifications

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` + #6 → #16 của Track B.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-B).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `AGENTS.md`, README `notifications`, `requests/status`. Xác nhận Audit detail của `BUDGET_CHECKED`, `SPEND_STEP_CLOSED`,
`SPEND_BATCH.SUBMITTED` khớp hợp đồng Audit ở spec `qd96-100-budget-check-three-outcomes` mục 11 (C-REVIEW R-13: hạng mục này chỉ
đọc; thiếu trường ⟹ báo điều phối viên sửa hợp đồng ở #6, không tự thêm ở đây). Không migration.

FE-tonight (chỉnh 05/11 theo review main flow): toàn bộ là **phần B**.

## Tasks

### Task 1: facts và chính sách tham số

- Files: `requests/status/request-status.types.ts` + loader facts (nhu cầu `BUDGET_CHECK`, `SPENDING_APPROVER`, `IT_ADMIN_IN_CHARGE`),
  `notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts` (+ spec).
- Depends on: `qd96-100-request-year-without-spend-date`.
- Acceptance: 4 mã mới đăng ký; khóa số tiền chỉ cho 3 mã.
- Verify: `pnpm test -- inbox.policy`.

### Task 2: rule lô, dùng dự phòng, bị chặn, trả về lúc duyệt

- Files: mới `requests/status/rules/status-rules-spend.policy.ts`, `request-status-rules.policy.ts`, spec mới
  `request-status-rules-spend.policy.spec.ts`.
- Depends on: Task 1.
- Acceptance: dòng 43, 49, 72, 73; `US-06-12` AC-23; `US-12-15` AC-30.
- Verify: `pnpm test -- request-status-rules` đỏ trước/xanh sau.

### Task 3: trưởng phòng nhận kết quả cấp phát

- Files: `requests/status/rules/status-rules-outcome.policy.ts`, `request-status-rules.policy.spec.ts`.
- Depends on: Task 1.
- Acceptance: L-811.
- Verify: `pnpm test -- request-status-rules`.

### Checkpoint

Quick gates (`typecheck`, `lint`, `arch:check`, `rules:check`, `test:gates`); integration hộp thông báo:
`pnpm test:integration -- spend-batches spend-approval` (thêm kiểm người nhận) — Finance không nhận. **CP-3** (cùng #17, #20, #21).

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| --- | --- | --- | --- |
| planned | — | — | full suite do Owner ở audit |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; FE được báo mã mới.
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi trạng thái sau đúng sự kiện thật.
