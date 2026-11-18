# Plan: đọc Assignment, công cụ đang dùng của phòng và kho khóa — phân trang ở SQL, có tên, cùng snapshot

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` local (23/10/2026, cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026). PR: chưa có — chưa commit lúc ghi dòng này.

## Before coding

`g2-g4-unit-only-cost-attribution` đã merge (phòng sở hữu); harness của `api-list-detail-contract-remediation` đã có; ghi
lựa chọn Owner về trường định danh. Đối chiếu spec với BE revision lúc bắt đầu.

## Tasks

### Task 1: kho khóa cùng snapshot

- Files: `license-key.repo.ts`, `license-key.service.ts`, `license-key-http.integration-spec.ts`.
- Depends on: none.
- Acceptance: `LD-11`.
- Verify: integration với ghi đồng thời; `pnpm check`.

### Task 2: công cụ đang dùng phân trang ở SQL

- Files: `department-tools.service.ts`, `assignment.repo.ts`, `department-tools-http.integration-spec.ts`.
- Depends on: `api-list-detail-contract-remediation`, `g2-g4-unit-only-cost-attribution`.
- Acceptance: `LD-09`.
- Verify: harness đỏ trên code cũ (đọc mọi Assignment), xanh sau; integration.

### Task 3: item Assignment có tên + `select`

- Files: `assignment.dto.ts`, `assignment.service.ts`, `assignment.repo.ts`, `license-assignment-http.integration-spec.ts`,
  e2e, `openapi.json` (sinh).
- Depends on: Task 2.
- Acceptance: `LD-10`.
- Verify: harness; `pnpm openapi:export` (chỉ thêm trường); e2e.

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng xanh; gỡ ba mục registry; ghi chú FE; Owner
review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                                                 | Revision / môi trường                                                         | Kết quả thực chạy     | Giới hạn / việc còn lại                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| `pnpm exec jest --config test/config/jest.integration.cjs` các suite: `licensing-assignment-read-contracts` (3), `license-assignment-http`, `department-tools-http`, `license-key-http`                                                                                                                                            | cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026 | xanh                  | `reason` chưa có biên ghi (đề xuất 1000) — không đổi hành vi ghi trong hạng mục này. |
| Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. | cùng cây                                                                      | xem kết quả trong câu | Remote CI chưa chạy; chưa Owner review.                                              |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (xem giới hạn ở bảng trên).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có (tùy chọn).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.

**Prompt 29 (23/10/2026):** `P28-06` — `LD-09` (`departmentToolsInUse#query`) nay có test đếm câu lệnh 3 và 33 seat, phân trang ở SQL. [g0-g4-checkpoint-fix-forward](../g0-g4-checkpoint-fix-forward/spec.md).
