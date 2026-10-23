# Plan: toàn vẹn tệp hợp đồng — liên kết tải lên ràng buộc loại/kích thước, tệp đã xác minh bất biến, tải về dạng đính kèm

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review (chặn `ready`: phương án A/B bất biến). Peer review: tùy chọn.
- Triển khai: `verified` local (23/10/2026, cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026). PR: chưa có — chưa commit lúc ghi dòng này.

## Before coding

Đọc ADR-0014, [security và jobs](../../../rules/security-jobs.md), `docs/guides/containers.md`; dựng MinIO local theo Compose
(profile storage) để kiểm kho thật. Đối chiếu spec với BE revision lúc bắt đầu.

## Tasks

### Task 1: migration (nếu phương án cần cột mới)

- Files: `prisma/models/catalog.prisma`, `prisma/migrations/<mới>/migration.sql`.
- Depends on: Owner chọn A/B.
- Acceptance: cột khóa cuối/`version_id` có ràng buộc; dữ liệu cũ hợp lệ.
- Verify: migrate trên CSDL tạm; `prisma migrate diff` không lệch.

### Task 2: presign ràng buộc + header

- Files: adapter S3, `document.service.ts`, `documents.controller.ts`, unit adapter, e2e tài liệu.
- Depends on: none.
- Acceptance: `SEC-01` (chữ ký), `SEC-07`.
- Verify: unit đỏ-trước/xanh-sau; e2e header; kiểm thủ công trên MinIO (`SEC-09`).

### Task 3: bất biến sau xác minh + `complete` sớm + vòng đời

- Files: `document.service.ts`, repo tài liệu, integration `contract-documents-http`.
- Depends on: Task 1, Task 2.
- Acceptance: `SEC-01` (thay tệp), `DB-13`.
- Verify: integration; kiểm kho thật; cập nhật ADR-0014 và runbook lifecycle.

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng xanh; bằng chứng kho thật ghi vào plan; Owner
review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                                                 | Revision / môi trường                                                         | Kết quả thực chạy     | Giới hạn / việc còn lại                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec jest --config test/config/jest.integration.cjs` các suite: `document-http` (mới 7), `document-constraints`, `document-final-key-migration`, `object-storage-real` (chạy trên LocalStack 3.8.1), unit `content-disposition`                                                                                              | cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026 | xanh                  | Chưa có hạn cho tệp `PENDING_ATTACH` không bao giờ được gắn; lifecycle rule/CORS của bucket là cấu hình vận hành chưa kiểm chứng. |
| Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. | cùng cây                                                                      | xem kết quả trong câu | Remote CI chưa chạy; chưa Owner review.                                                                                           |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (xem giới hạn ở bảng trên).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có (tùy chọn).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
