# Plan: toàn vẹn tiền tệ báo cáo — khóa đổi tiền tệ không bị write skew, tiền tệ báo cáo phải có trong danh mục

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` local (23/10/2026, cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026). PR: chưa có — chưa commit lúc ghi dòng này.

## Before coding

Đọc [database và nghiệp vụ](../../../rules/database-business.md), ADR-0005, ADR-0007, `test/support/lock-wait.ts`. Đối chiếu
spec với BE revision lúc bắt đầu.

## Tasks

### Task 1: migration khóa + FK có kiểm kê

- Files: `prisma/migrations/<mới>/migration.sql`, `prisma/models/organization.prisma` (quan hệ FK nếu khai ở Prisma),
  integration ràng buộc mới.
- Depends on: none.
- Acceptance: `DB-01` (tầng CSDL), `DB-02` (FK).
- Verify: migrate trên CSDL tạm có và không có tiền tệ ngoài danh mục; test đua bằng `pg_locks` đỏ trên migration cũ, xanh
  sau; `prisma migrate diff` không lệch.

### Task 2: ứng dụng — khởi tạo và ánh xạ lỗi

- Files: `installation.input.ts`/service, `finance.service.ts`, mapper lỗi finance, integration khởi tạo và giá.
- Depends on: Task 1.
- Acceptance: `DB-02`.
- Verify: integration đỏ-trước/xanh-sau; e2e nếu mô tả lỗi đổi.

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng xanh; `pnpm openapi:export` review diff; Owner
review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                                                 | Revision / môi trường                                                         | Kết quả thực chạy     | Giới hạn / việc còn lại                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------- |
| `pnpm exec jest --config test/config/jest.integration.cjs` các suite: `reporting-currency-integrity` (8), `reporting-currency-application`                                                                                                                                                                                         | cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026 | xanh                  | Không chạm CSDL dùng chung; migration chỉ chạy trên CSDL dùng một lần. |
| Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. | cùng cây                                                                      | xem kết quả trong câu | Remote CI chưa chạy; chưa Owner review.                                |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (xem giới hạn ở bảng trên).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có (tùy chọn).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
