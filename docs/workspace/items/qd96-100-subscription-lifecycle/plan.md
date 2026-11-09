# Plan: qd96-100-subscription-lifecycle (khung)

- [Spec](spec.md); revision đầu vào: Docs `5dad7b6`, BE `3e4553b9`.
- Phụ trách: chưa giao. Thiết kế ban đầu bởi: AI (điều phối viên), khung 05/11/2026.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Khung — chưa thiết kế chi tiết. Lượt thiết kế đọc `qd96-100-subscription-owner-confirmation`,
`qd96-100-renewal-milestones-and-recipients`, ITEMS.md H3 và ledger nêu ở spec.

## Tasks

### Task 1: thiết kế chi tiết và tách hạng mục — Đợt sau

- Files: `spec.md`, `plan.md` của hạng mục này; thư mục hạng mục tách ra; dòng map G8 ở `docs/roadmap.md`; items index.
- Depends on: `qd96-100-subscription-owner-confirmation`; Owner trả lời Q-01, Q-09.
- Acceptance: tách ít nhất bốn hạng mục (điểm linh hoạt; hết hạn và đóng; đổi tier và kết quả; nhắc và email), mỗi hạng mục
  có spec/plan và dòng map; không AC mồ côi.
- Verify: `pnpm rules:check` → không lỗi của các hạng mục này.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại       |
| ------------------ | --------------------- | ----------------- | ----------------------------- |
| planned            | —                     | —                 | khung, chưa thiết kế chi tiết |
