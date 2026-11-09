# Plan: toàn vẹn ghi catalog/finance/licensing — nhóm từ điển không mất cập nhật, đổi gói giữ bất biến con, đầu phiên bản chỉ tiến

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` local (23/10/2026, cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026). PR: chưa có — chưa commit lúc ghi dòng này.

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

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                                                 | Revision / môi trường                                                         | Kết quả thực chạy     | Giới hạn / việc còn lại                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `pnpm exec jest --config test/config/jest.integration.cjs` các suite: `catalog-licensing-write-integrity` (12), thử DB-09 trong `application-retirement-http`, `cost-allocation-constraints`, `vendor-tax-profile-constraints` (sửa theo ràng buộc mới)                                                                            | cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026 | xanh                  | Chưa chạy trên dữ liệu thật; ADR-0005/ADR-0007 chú thích nhưng vẫn Proposed. |
| Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. | cùng cây                                                                      | xem kết quả trong câu | Remote CI chưa chạy; chưa Owner review.                                      |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (xem giới hạn ở bảng trên).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có (tùy chọn).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.

**Prompt 29 (23/10/2026):** `P28-10` import khóa nay giữ thuê bao/gói trong transaction (comment `20261022110000:25-26` nay đúng), một `INSERT` cho cả lô; `P28-06` test `DB-09` kiểm chính transaction (đối số thứ tư); `P28-12` kẻ thua đua `DB-03` nhận 409 như spec (cùng mã `APPLICATION.DICTIONARY_LINE_MISMATCH`). [g0-g4-checkpoint-fix-forward](../g0-g4-checkpoint-fix-forward/spec.md).

**Prompt 29A (24/10/2026, `P29-N3`):** kẻ thua đua `DB-03` giữ 409 nhưng nay mang mã riêng
`APPLICATION.DICTIONARY_GROUP_CHANGED` (một mã chỉ một status); đường tạo ứng dụng (`ensureForDictionaryGroup`) thôi ném `Error`
thô: tên đã thuộc nhóm khác ⟹ 422 mismatch, thua đua ⟹ 409 mã riêng. Test đua tất định bằng khóa dòng (không sleep) trong
`catalog-licensing-write-integrity.integration-spec.ts`; bằng chứng ở
[g0-g4-checkpoint-fix-forward](../g0-g4-checkpoint-fix-forward/plan.md), Phase E.
