# Plan: trưởng phòng gắn dòng kế hoạch và trình Request cần duyệt chi theo lô

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Hai AC của Story không thể làm ở đây: rút Request cần trạng thái _Đã rút_ (`g5-request-withdrawal`) và dòng của chính trưởng phòng cần yêu cầu nhóm (`g5-group-requests`); scope map đã chuyển chủ. Yêu cầu _không chọn dòng thì không lưu quyết định_ làm 38 chỗ gọi quyết định nhu cầu trong test phải biết Request có chi phí: harness chọn _ngoài kế hoạch_ thay cho trưởng phòng khi test không nói, và chỉ cho Request mà người quyết là trưởng phòng.

## Tasks

### Task 1: thiết kế `ready`, scope map

- Files: `spec.md`, `plan.md`, `roadmap.md` (US-06-14 AC-6, AC-14, AC-13 chuyển chủ), specs của `g5-group-requests`, `g5-request-withdrawal`
- Depends on: ba hạng mục phụ thuộc
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test; mỗi AC một chủ
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu

- Files: migration `20261023220000_requests_spend_batches`, `requests.prisma`, `architecture-boundaries.spec.ts`
- Depends on: Task 1
- Acceptance: lô và mục không đổi, hồ sơ bổ sung không đổi, ràng buộc lý do và ra khỏi lô
- Verify: `spend-batch-constraints` (19) xanh; `migrate diff --exit-code` = 0

### Task 3: quy tắc thuần

- Files: `spend-submission.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: chọn dòng, cổng trình, vào hàng đợi hay vào thẳng, hồ sơ bổ sung
- Verify: 16 ca chính sách xanh

### Task 4: gắn dòng, giá lại, vào thẳng

- Files: `plan-line.service.ts`, `repricing.service.ts`, `spend-entry.service.ts`, `need-decision.service.ts`, `assessment.service.ts`, `budget-facts.repo.ts`, `budgets.service.ts`, `access-request.dto.ts`
- Depends on: Task 3
- Acceptance: quyết định nhu cầu có dòng và ngày; kiểm ngay khi không ai trình được
- Verify: `spend-need-decision` (17) xanh

### Task 5: hàng đợi, lô, hồ sơ bổ sung, API

- Files: `spend-queue.service.ts`, `spend-batch.service.ts`, `spend-batch-view.service.ts`, `plan-line-route.service.ts`, `supplement.service.ts`, repos, `spend-submission.controller.ts`, `spend-submission.dto.ts`, `finance-review.service.ts` (ra khỏi lô), `api-coverage-manifest.ts`, `openapi.json`, `spend-harness.ts`, `request-harness.ts`
- Depends on: Task 2, Task 4
- Acceptance: trình lô, gắn dòng, hồ sơ bổ sung, 8 thao tác mới
- Verify: `spend-batches` (23), `spend-supplements` (13); `jest src`, e2e kiểm kê xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                                        | Revision / môi trường | Kết quả thực chạy       | Giới hạn / việc còn lại                                                                               |
| ----------------------------------------------------------------------------------------- | --------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `spend-batches`, `spend-supplements`, `spend-need-decision`                               | PostgreSQL 17 Docker  | 23, 13 và 17 ca xanh    | —                                                                                                     |
| `spend-batch-constraints`                                                                 | như trên              | 19 ca xanh              | —                                                                                                     |
| `test/integration/access-request-*`, `budget-*`, `spend-*` sau khi đổi quyết định nhu cầu | như trên              | 25 suite, 596 ca xanh   | —                                                                                                     |
| `pnpm exec jest src` (unit, gồm kiến trúc, hợp đồng danh sách và OpenAPI)                 | như trên              | 153 suite, 2256 ca xanh | —                                                                                                     |
| e2e `api-inventory`, `openapi`                                                            | như trên              | xanh, 194 thao tác      | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5                                                         |
| `prisma migrate deploy` + `migrate diff --exit-code`                                      | CSDL tạm rỗng         | không drift             | —                                                                                                     |
| `tsc --noEmit`, `eslint` `src`, `test/support`, các suite mới                             | như trên              | sạch                    | Kênh mobile không kiểm được ở BE; Request không kiểm được ngay lúc vào thẳng chưa có ai kích hoạt lại |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
