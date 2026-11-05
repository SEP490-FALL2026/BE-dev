# Plan: g7-g3-g4-decisions (khung)

- [Spec](spec.md); revision đầu vào: Docs `5dad7b6`, BE `3e4553b9`.
- Phụ trách: chưa giao. Thiết kế ban đầu bởi: Owner + Claude (DESIGN G7); khung do AI (điều phối viên) 05/11/2026.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Khung — chưa thiết kế chi tiết. Lượt thiết kế đọc DESIGN.md §10, §12 và spec/plan đã chốt của `g7-ai-usage-intake`,
`g7-vendor-usage-import-identity`, `g7-g1-g2-recommendations`.

## Tasks

### Task 1: thiết kế chi tiết — Đợt sau

- Files: `spec.md`, `plan.md` của hạng mục này (và thư mục hạng mục tách ra nếu có); dòng map G7 ở `docs/roadmap.md`.
- Depends on: `g7-ai-usage-intake`, `g7-vendor-usage-import-identity`, `g7-g1-g2-recommendations`.
- Acceptance: spec đủ mục thiết kế; quyết định tách hay giữ (Size exception được Owner chấp nhận hoặc tách hạng mục); test
  matrix theo AC; plan chia phase/checkpoint; không AC mồ côi.
- Verify: `pnpm rules:check` → không lỗi của hạng mục này.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại       |
| ------------------ | --------------------- | ----------------- | ----------------------------- |
| planned            | —                     | —                 | khung, chưa thiết kế chi tiết |
