# Plan: qd96-100-transfer-labels-and-overlap (khung)

- [Spec](spec.md); revision đầu vào: Docs `5dad7b6`, BE `3e4553b9`.
- Phụ trách: chưa giao. Thiết kế ban đầu bởi: AI (điều phối viên), khung 05/11/2026.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Khung — chưa thiết kế chi tiết. Lượt thiết kế đọc `qd96-100-transfer-review-defaults` (mô hình hạn đã chốt), ITEMS.md H6,
ledger L-501, L-504, L-509 và `US-03-12` ở Docs đang pin.

## Tasks

### Task 1: thiết kế chi tiết — Đợt sau

- Files: `spec.md`, `plan.md` của hạng mục này; dòng map G6 ở `docs/roadmap.md` nếu đổi chủ AC.
- Depends on: `qd96-100-transfer-review-defaults` (thiết kế đã chốt); Owner trả lời Q-01.
- Acceptance: spec đủ mục thiết kế, test matrix theo AC của bảng Primary; plan chia task implement; thiết kế `ready` sau review.
- Verify: `pnpm rules:check` → không lỗi của hạng mục này.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại       |
| ------------------ | --------------------- | ----------------- | ----------------------------- |
| planned            | —                     | —                 | khung, chưa thiết kế chi tiết |
