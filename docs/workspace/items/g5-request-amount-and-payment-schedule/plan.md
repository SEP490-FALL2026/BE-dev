# Plan: số tiền của Request, lịch thanh toán dự kiến và ngày dự kiến phát sinh khoản chi

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Phát hiện khi viết test ràng buộc: CHECK của bản migration đầu để lọt Request đã định giá không có số tiền (so sánh với NULL là unknown); sửa bằng migration mới thay vì sửa migration đã áp.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`
- Depends on: `g5-request-submission-and-routing`
- Acceptance: spec đủ dữ liệu, API, công thức và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: hàm tính thuần và năm tài chính

- Files: `src/core/fiscal-year.ts`, `pricing.policy.ts` và spec của chúng
- Depends on: Task 1
- Acceptance: công thức, năm theo từng kỳ, ba lý do thiếu giá
- Verify: `pricing.policy.spec.ts` (10), `fiscal-year.spec.ts` (6) xanh

### Task 3: đọc giá từ `catalog`

- Files: `catalog.service.ts`, `subscription-lookup.service.ts`, `subscription.repo.ts`
- Depends on: Task 2
- Acceptance: thuê bao ACTIVE mới nhất có giá và chu kỳ; bản nháp không tính
- Verify: integration `access-request-pricing` xanh

### Task 4: dữ liệu và service gửi

- Files: migration `20261023140000_requests_pricing`, `20261023150000_requests_pricing_check_not_null`, `requests.prisma`, `access-request.repo.ts`, `access-request.service.ts`, DTO, query service, `requests.module.ts`
- Depends on: Task 3
- Acceptance: snapshot số tiền, lịch, năm; thiếu giá không chặn gửi; nội bộ không nhận ngày chi
- Verify: `access-request-pricing` (9), `access-request-constraints` (55) xanh

### Task 5: harness, OpenAPI và gate

- Files: `request-harness.ts`, `openapi.json`
- Depends on: Task 4
- Acceptance: kiểu wire đủ trường; OpenAPI xuất lại; không route mới
- Verify: `tsc`, `eslint`, e2e kiểm kê xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                   | Revision / môi trường | Kết quả thực chạy                                                                | Giới hạn / việc còn lại                       |
| -------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- |
| `access-request-pricing.integration-spec.ts`                         | PostgreSQL 17 Docker  | 9 ca xanh                                                                        | —                                             |
| `access-request-constraints.integration-spec.ts` (thêm 18 ca về giá) | như trên              | 55 ca xanh; một ca đỏ lần đầu vì CHECK để lọt NULL, đã sửa bằng migration mới    | —                                             |
| suite tích hợp `access-request-*`                                    | như trên              | 6 suite, 107 ca xanh trước khi thêm ca ràng buộc; suite ràng buộc chạy lại riêng | chạy lại toàn bộ ở mốc cuối G5                |
| `pnpm exec jest src` (unit)                                          | như trên              | 146 suite, 2128 ca xanh                                                          | —                                             |
| e2e `api-inventory`, `openapi`                                       | như trên              | 25 ca xanh (không route mới, vẫn 150 thao tác)                                   | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5 |
| `tsc --noEmit`, `eslint` các thư mục đã sửa                          | như trên              | sạch                                                                             | —                                             |
| `prisma migrate deploy` + `migrate diff --exit-code`                 | CSDL tạm rỗng         | 0 (không drift)                                                                  | —                                             |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
