# Plan: IT đánh giá và phân loại phần mềm chưa có trong danh mục

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Quyết định: gom việc đọc dữ kiện của đề xuất vào `RequestAssessmentService` như của Request thường; hồ sơ `BM-02` là một dòng riêng, không phải cột của Request; tách tính tiền từ báo giá thành hàm thuần có test riêng.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`, bản đồ G5 (ba AC thành `partial`)
- Depends on: `g5-manager-need-decision`
- Acceptance: spec đủ dữ liệu, API, quy tắc hoàn tất, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu của nhánh (c)

- Files: migration `20261023160000_requests_new_software_states`, `20261023160100_requests_new_software_tables`, `requests.prisma` và back-relation, `architecture-boundaries.spec.ts`
- Depends on: Task 1
- Acceptance: nhánh, trạng thái, bước, bảng khai báo và hồ sơ đánh giá, `plan_id` được rỗng có điều kiện
- Verify: `access-request-constraints` (78) xanh; `migrate diff --exit-code` = 0

### Task 3: chính sách thuần

- Files: `quote-pricing.policy.ts`, `assessment.policy.ts`, `access-request.policy.ts`, `pricing.policy.ts`, `need-decision.policy.ts`, `grant.policy.ts` và spec
- Depends on: Task 2
- Acceptance: kỳ ràng buộc và dự báo, mục còn thiếu, ai điền và khi nào, khi nào liên kết được
- Verify: `quote-pricing` (15), `assessment.policy` (24) xanh

### Task 4: gửi, điền, hoàn tất, liên kết

- Files: `proposal.service.ts`, `assessment.service.ts`, `catalog-link.service.ts`, `assessment*.repo.ts`, `need-decision.service.ts`, `request-assessment.service.ts`, `catalog` (`getPlanBusinessOwnerId`, `getVendorName`), `licensing` (`NOT_IN_CATALOG`)
- Depends on: Task 3
- Acceptance: đề xuất, bước của IT, hoàn tất tính tiền, liên kết và cổng cấp phát
- Verify: `access-request-new-software` (57) xanh; đột biến cho hai chốt liên kết làm 4 ca đỏ

### Task 5: API, harness và gate

- Files: `assessment.dto.ts`, `proposals.controller.ts`, `request-harness.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 4
- Acceptance: 5 route mới, op count 156, OpenAPI xuất lại, trang chủ kiểm bằng `refine` để không thêm `pattern`
- Verify: `jest src`, e2e kiểm kê, `tsc`, `eslint` xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                                 | Revision / môi trường | Kết quả thực chạy                                         | Giới hạn / việc còn lại                       |
| ---------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------- | --------------------------------------------- |
| `access-request-new-software.integration-spec.ts`                                  | PostgreSQL 17 Docker  | 57 ca xanh; đột biến bỏ hai chốt của liên kết làm 4 ca đỏ | —                                             |
| `access-request-constraints.integration-spec.ts` (thêm 23 ca về hai bảng mới)      | như trên              | 78 ca xanh                                                | —                                             |
| tích hợp `access-request-*`, cấp phát, licensing, Assignment, catalog, application | như trên              | 30 suite, 477 ca xanh                                     | chạy lại toàn bộ ở mốc cuối G5                |
| `quote-pricing.policy.spec.ts`, `assessment.policy.spec.ts`                        | như trên              | 15 và 24 ca xanh                                          | —                                             |
| `pnpm exec jest src` (unit, gồm kiến trúc và OpenAPI)                              | như trên              | 149 suite, 2184 ca xanh                                   | —                                             |
| e2e `api-inventory`, `openapi`                                                     | như trên              | 25 ca xanh, 156 thao tác                                  | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5 |
| `prisma migrate deploy` + `migrate diff --exit-code`                               | CSDL tạm rỗng         | 0 (không drift)                                           | —                                             |
| `tsc --noEmit`, `eslint` các thư mục đã sửa                                        | như trên              | sạch                                                      | —                                             |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
