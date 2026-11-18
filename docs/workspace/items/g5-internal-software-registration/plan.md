# Plan: IT đăng ký phần mềm nội bộ chưa có trong danh mục rồi cho đi đường không phí

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Quyết định: để việc đăng ký cùng transaction với Request thì cho `ApplicationService` và `PlanService` nhận `tx` của người gọi thay vì đăng ký trước rồi liên kết sau, vì sau cách đó một lỗi giữa chừng để lại ứng dụng mồ côi trong danh mục.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`
- Depends on: `g5-it-assessment-of-new-software`
- Acceptance: spec đủ điều kiện, giao dịch, hai đường và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: đường ghi trong `catalog` nhận `tx`

- Files: `application.service.ts` (`declareRecord`), `plan.service.ts`, `internal-software-registration.service.ts`, `catalog.service.ts`, `catalog.module.ts`, `architecture-structure.spec.ts`
- Depends on: Task 1
- Acceptance: hành vi cũ không đổi; ứng dụng `INTERNAL` và gói `K5` trong transaction của người gọi
- Verify: `jest src/modules/catalog` và các suite catalog tích hợp xanh

### Task 3: đăng ký trong `requests`

- Files: `internal-registration.service.ts`, `quote.service.ts`, `assessment.service.ts`, `access-request.repo.ts`, `access-request-pricing.mapper.ts`, `assessment.errors.ts`, `assessment.http-errors.ts`, `assessment.dto.ts`
- Depends on: Task 2
- Acceptance: hai đường, hoàn tác trọn gói, hồ sơ đọc theo có hồ sơ
- Verify: `access-request-internal-registration` (19) xanh

### Task 4: API, harness và gate

- Files: `proposals.controller.ts`, `request-harness.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`, `requests.module.ts`
- Depends on: Task 3
- Acceptance: route mới, op count 157, OpenAPI xuất lại
- Verify: `jest src`, e2e kiểm kê, `tsc`, `eslint` xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                                 | Revision / môi trường | Kết quả thực chạy                                                         | Giới hạn / việc còn lại                       |
| ---------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| `access-request-internal-registration.integration-spec.ts`                         | PostgreSQL 17 Docker  | 19 ca xanh                                                                | —                                             |
| `access-request-new-software.integration-spec.ts` sau khi hồ sơ đọc theo có hồ sơ  | như trên              | 57 ca xanh                                                                | —                                             |
| tích hợp `access-request-*`, cấp phát, licensing, Assignment, catalog, application | như trên              | 31 suite, 496 ca xanh                                                     | chạy lại toàn bộ ở mốc cuối G5                |
| `pnpm exec jest src` (unit, gồm kiến trúc và OpenAPI)                              | như trên              | xanh sau khi đăng ký hai hợp đồng nội module và tách mapper giá khỏi repo | —                                             |
| e2e `api-inventory`, `openapi`                                                     | như trên              | 25 ca xanh, 157 thao tác                                                  | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5 |
| `tsc --noEmit`, `eslint` `src`, `test/integration`, `test/support`                 | như trên              | sạch                                                                      | —                                             |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
