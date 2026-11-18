# Plan: cổng mức kiểm soát: IT từ chối phần mềm không kiểm soát được

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Quyết định: từ chối là một route và một trạng thái riêng chứ không phải giá trị của mức kiểm soát, vì kết luận _không đủ điều kiện vào danh mục_ không thuộc ba mức.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`, bản đồ G5 (AC-7 `deferred`, ba AC `partial`)
- Depends on: `g5-it-assessment-of-new-software`
- Acceptance: spec đủ dữ liệu, API, quyền đọc và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu của từ chối

- Files: migration `20261023170000_requests_it_rejection_states`, `20261023170100_requests_it_rejection_columns`, `requests.prisma` và back-relation
- Depends on: Task 1
- Acceptance: trạng thái, kind, lý do, phương án và ràng buộc trạng thái của hồ sơ
- Verify: `access-request-constraints` (85) xanh; `migrate diff --exit-code` = 0

### Task 3: từ chối ở cổng

- Files: `assessment.service.ts` (`reject`), `assessment.repo.ts`, `assessment-step.repo.ts`, `assessment-view.service.ts`, `grant.policy.ts`, `assessment.dto.ts`, `assessment.errors.ts`
- Depends on: Task 2
- Acceptance: kết thúc Request và bước, ghi lý do và phương án, hiện trong hồ sơ
- Verify: `access-request-control-gate` (20) xanh

### Task 4: API và gate

- Files: `proposals.controller.ts`, `request-harness.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`, `requests.module.ts`
- Depends on: Task 3
- Acceptance: route mới, op count 158, OpenAPI xuất lại
- Verify: `jest src`, e2e kiểm kê, `tsc`, `eslint` xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                                 | Revision / môi trường | Kết quả thực chạy        | Giới hạn / việc còn lại                       |
| ---------------------------------------------------------------------------------- | --------------------- | ------------------------ | --------------------------------------------- |
| `access-request-control-gate.integration-spec.ts`                                  | PostgreSQL 17 Docker  | 20 ca xanh               | —                                             |
| `access-request-constraints.integration-spec.ts` (thêm 7 ca về từ chối)            | như trên              | 85 ca xanh               | —                                             |
| tích hợp `access-request-*`, cấp phát, licensing, Assignment, catalog, application | như trên              | 32 suite, 523 ca xanh    | chạy lại toàn bộ ở mốc cuối G5                |
| `pnpm exec jest src` (unit, gồm kiến trúc và OpenAPI)                              | như trên              | 149 suite, 2184 ca xanh  | —                                             |
| e2e `api-inventory`, `openapi`                                                     | như trên              | 25 ca xanh, 158 thao tác | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5 |
| `prisma migrate deploy` + `migrate diff --exit-code`                               | CSDL tạm rỗng         | 0 (không drift)          | —                                             |
| `tsc --noEmit`, `eslint` `src`, `test/integration`, `test/support`                 | như trên              | sạch                     | —                                             |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
