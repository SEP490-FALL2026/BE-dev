# Plan: xem trước chi phí, chuỗi duyệt và thời gian dự kiến trước khi gửi

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Quyết định: tách phần đọc dữ kiện của `submit` thành `RequestAssessmentService` dùng chung với xem trước thay vì sao chép logic, để bản xem trước không thể lệch với việc gửi.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`
- Depends on: `g5-request-amount-and-payment-schedule`
- Acceptance: spec đủ API, thứ tự đọc, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: tách dịch vụ đánh giá dùng chung

- Files: `request-assessment.service.ts`, `access-request.service.ts`, `pricing-view.service.ts`, `access-request-query.service.ts`, `requests.module.ts`
- Depends on: Task 1
- Acceptance: gửi giữ nguyên hành vi; xem trước và gửi đọc cùng dữ kiện
- Verify: các suite `access-request-*` cũ xanh

### Task 3: dựng chuỗi và ước tính

- Files: `request-preview.policy.ts` (+ spec), `request-preview.service.ts`, `catalog` (`getPlanVendorId`)
- Depends on: Task 2
- Acceptance: chuỗi theo bảng định tuyến, bốn con số thuế, thiếu giá
- Verify: `request-preview.policy.spec.ts` (17) xanh

### Task 4: hai từ chối khi gửi

- Files: `access-request.errors.ts`, `access-request.http-errors.ts`, `access-request.service.ts`
- Depends on: Task 1
- Acceptance: 409 đã có quyền kèm quyền; 422 thiếu lý do ngoài bộ chuẩn
- Verify: `access-request-preview` xanh; test cũ chỉnh theo hành vi mới

### Task 5: API, harness và gate

- Files: `request-preview.dto.ts`, `access-requests.controller.ts`, `request-harness.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 3, Task 4
- Acceptance: route mới, op count 151, OpenAPI xuất lại
- Verify: `tsc`, `eslint`, e2e kiểm kê, `jest src` xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                                     | Revision / môi trường | Kết quả thực chạy                                                | Giới hạn / việc còn lại                       |
| -------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| `access-request-preview.integration-spec.ts`                                           | PostgreSQL 17 Docker  | 25 ca xanh; đột biến cho `heldAccess` luôn `null` làm ca AC-2 đỏ | —                                             |
| suite tích hợp `access-request-*`                                                      | như trên              | 7 suite, 151 ca xanh                                             | chạy lại toàn bộ ở mốc cuối G5                |
| `request-preview.policy.spec.ts` và unit `src/modules/requests`                        | như trên              | 17 ca; 5 suite, 65 ca xanh                                       | —                                             |
| `pnpm exec jest src` (unit, gồm kiến trúc và OpenAPI)                                  | như trên              | 147 suite, 2145 ca xanh                                          | —                                             |
| e2e `api-inventory`, `openapi`                                                         | như trên              | 25 ca xanh, 151 thao tác                                         | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5 |
| `tsc --noEmit`, `eslint` `src/modules`, `src/core`, `test/support`, `test/integration` | như trên              | sạch                                                             | —                                             |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
