# Plan: toàn vẹn ghi catalog/finance/licensing — nhóm từ điển không mất cập nhật, đổi gói giữ bất biến con, đầu phiên bản chỉ tiến

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc [database và nghiệp vụ](../../../rules/database-business.md), ADR-0005, `test/support/lock-wait.ts`,
`test/support/concurrency-harness.ts`. Đối chiếu spec với BE revision lúc bắt đầu.

## Tasks

### Phase 1 — CSDL

### Task 1: migration trigger mới

- Files: `prisma/migrations/<mới>/migration.sql`, integration ràng buộc (`vendor-constraints`, `plan-constraints`,
  `tax-profile-constraints`, `cost-allocation-constraints`).
- Depends on: none.
- Acceptance: `DB-03` (CSDL), `DB-07` (CSDL), `DB-08`, `DB-14`.
- Verify: ghi thẳng bị từ chối; migrate trên CSDL tạm có dữ liệu cũ hợp lệ; `prisma migrate diff` không lệch.

### Checkpoint

`pnpm check` xanh; integration ràng buộc xanh.

### Phase 2 — ứng dụng

### Task 2: nhóm từ điển và audit

- Files: `vendor.repo.ts`, `vendor-directory.service.ts`, `application.service.ts`, `vendor-proposal-intake.service.ts`,
  integration ứng dụng/từ điển.
- Depends on: Task 1.
- Acceptance: `DB-03`, `DB-11`.
- Verify: test đua bằng `pg_locks` đỏ-trước/xanh-sau.

### Task 3: đổi gói, phân bổ, cùng transaction

- Files: `plan.service.ts`, `subscription-allocation.service.ts`, `finance.service.ts`, `application-retirement.service.ts`,
  `seat-occupancy.reader.ts`, integration tương ứng.
- Depends on: Task 1.
- Acceptance: `DB-07`, `DB-09`, `DB-10`.
- Verify: integration đỏ-trước/xanh-sau.

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng xanh; ADR-0005 cập nhật; Owner review trên
revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
