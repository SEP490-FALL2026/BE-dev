# Plan: đọc tổ chức và danh tính — dự án phân trang, đếm cùng snapshot, lịch sử có biên

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

`g2-g4-unit-only-cost-attribution` đã merge (route `/cost-centers`); harness của `api-list-detail-contract-remediation`
đã có; ghi quyết định Owner về `description` dự án. Đối chiếu spec với BE revision lúc bắt đầu.

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

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng xanh; gỡ mục registry; ghi chú FE; Owner
review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
