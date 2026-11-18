# Plan: đọc bộ công cụ chuẩn theo lô, có tên phòng/chức vụ và thứ tự theo tên

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` local (23/10/2026, cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026). PR: chưa có — chưa commit lúc ghi dòng này.

## Before coding

Harness của `api-list-detail-contract-remediation` đã có. Đối chiếu spec với BE revision lúc bắt đầu; chọn cách sắp theo
tên (join hay giữ thứ tự) và ghi vào spec.

## Tasks

### Task 1: phiên bản và gói theo lô

- Files: `standard-toolset.repo.ts`, `standard-toolset.service.ts`, `plan.repo.ts`, `standard-toolset-http.integration-spec.ts`.
- Depends on: `api-list-detail-contract-remediation`.
- Acceptance: `LD-07` (số câu lệnh hằng số cho danh sách và lịch sử).
- Verify: harness đỏ trên code cũ, xanh sau; `pnpm check`; integration.

### Task 2: tên phòng/chức vụ và thứ tự

- Files: `standard-toolset.dto.ts`, service, facade `organization`, e2e, `openapi.json` (sinh).
- Depends on: Task 1.
- Acceptance: `LD-07` (item có tên, thứ tự đã chọn ổn định).
- Verify: integration; `pnpm openapi:export` (chỉ thêm trường).

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng xanh; gỡ mục registry; ghi chú FE; Owner
review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                                                 | Revision / môi trường                                                         | Kết quả thực chạy     | Giới hạn / việc còn lại                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- | --------------------------------------- |
| `pnpm exec jest --config test/config/jest.integration.cjs` các suite: `catalog-standard-toolset-read-batching`                                                                                                                                                                                                                     | cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026 | xanh                  | Thêm trường (không bớt).                |
| Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. | cùng cây                                                                      | xem kết quả trong câu | Remote CI chưa chạy; chưa Owner review. |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (xem giới hạn ở bảng trên).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có (tùy chọn).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
