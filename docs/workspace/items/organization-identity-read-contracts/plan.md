# Plan: đọc tổ chức và danh tính — dự án phân trang, đếm cùng snapshot, lịch sử có biên

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` local (23/10/2026, cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026). PR: chưa có — chưa commit lúc ghi dòng này.

## Before coding

`g2-g4-unit-only-cost-attribution` đã merge (route `/cost-centers`); harness của `api-list-detail-contract-remediation`
đã có; ghi quyết định Owner về `description` dự án và hợp đồng có biên đã chọn cho cảnh báo phòng (`LD-15`). Đối chiếu spec
với BE revision lúc bắt đầu.

## Tasks

### Task 1: đếm + trang cùng snapshot

- Files: `department.repo.ts`, `department-query.service.ts`, `cost-center.repo.ts`, `cost-center.service.ts`,
  `departments-http.integration-spec.ts`, `cost-centers-http.integration-spec.ts`.
- Depends on: none.
- Acceptance: `LD-11` (organization).
- Verify: integration ghi đồng thời; `pnpm check`.

### Task 2: dự án phân trang + detail

- Files: `project.*`, `projects.controller.ts`, `department-query.service.ts`, integration dự án, e2e,
  `test/support/api-coverage-manifest.ts`, `openapi.json` (sinh).
- Depends on: `api-list-detail-contract-remediation`.
- Acceptance: `LD-12`.
- Verify: harness; `pnpm openapi:export` review diff; e2e inventory.

### Task 3: lịch sử có biên + `hasMore`

- Files: `role-grant.repo.ts`, DTO tài khoản, `approval-role.*`, `operating-parameters.*`, DTO trưởng phòng, integration.
- Depends on: none.
- Acceptance: `LD-14`.
- Verify: integration; OpenAPI chỉ thêm trường.

### Task 4: cảnh báo phòng có biên toàn response

- Files: `department-query.service.ts`, `departments.controller.ts`, `department.dto.ts`, integration cảnh báo phòng,
  `test/gates/api-collection-contract.gate-spec.ts` (gỡ mục `departmentWarningList#unbounded`), `openapi.json` (sinh) nếu đổi wire.
- Depends on: hợp đồng đã được Owner duyệt (phân trang thật hoặc trần cứng của toàn response — chưa chọn).
- Acceptance: `LD-15` (vế `departmentWarningList`).
- Verify: test đỏ trước khi số phòng vượt biên; harness; gate collection xanh sau khi gỡ mục; `pnpm openapi:export` review diff.

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng xanh; gỡ mục registry; ghi chú FE; Owner
review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                                                 | Revision / môi trường                                                         | Kết quả thực chạy     | Giới hạn / việc còn lại                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec jest --config test/config/jest.integration.cjs` các suite: `organization-identity-read-contracts` (11), `departments-http`, `approval-roles-http`                                                                                                                                                                       | cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026 | xanh                  | Cảnh báo phòng tính từ hai lần đọc nhẹ của mọi phòng đang hoạt động rồi cắt trang (vì việc "IT Admin dùng được" thuộc identity-access). |
| Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. | cùng cây                                                                      | xem kết quả trong câu | Remote CI chưa chạy; chưa Owner review.                                                                                                 |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (xem giới hạn ở bảng trên).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có (tùy chọn).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
