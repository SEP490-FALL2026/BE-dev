# Plan: trưởng phòng mới rà soát công cụ ngoài bộ chuẩn sau điều chuyển

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (24/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, uncommitted). PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, [module structure](../../../rules/module-structure.md), [database rules](../../../rules/database-business.md), spec của `g6-transfer-record` (sự kiện `OrganizationChange`), `g6-revocation-by-grant-kind` (`openRevocation`, `listPersonalSeatsOf`) và `g6-handover-confirmation` (hook); mã `catalog/standard-toolset` ở BE `7920ee5`. Đối chiếu: `CatalogService.isPlanInStandardToolset` hiện chỉ trả từng gói nên cần thêm hàm trả cả tập theo cặp; `TRANSFER_REVIEW_WORKING_DAYS` đã có trong `parameter-definitions.ts`. Ba hạng mục phụ thuộc phải xong trước. Migration `20261024160000_personnel_transfer_reviews` là task riêng đi trước mã dùng nó.

## Tasks

### Task 1: thiết kế `ready` (xong)

- Files: `spec.md`, `plan.md`, `docs/roadmap.md` (scope map G6 do người tích hợp dán)
- Depends on: none
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu (xong)

- Files: `prisma/migrations/20261024160000_personnel_transfer_reviews/migration.sql`, `prisma/models/personnel.prisma`, `test/gates/architecture-boundaries.gate-spec.ts` (model owner)
- Depends on: Task 1, `g6-transfer-record`
- Acceptance: hai enum, `transfer_reviews` (unique `placement_id`), `transfer_review_items` (khóa `(review_id, assignment_id)`), `CHECK` đồng bộ quyết định, trigger ghi một lần
- Verify: nhóm test _what the database refuses_ xanh; `pnpm prisma:validate`; `migrate diff --exit-code` = 0 trên CSDL kiểm thử riêng

### Task 3: quy tắc thuần (xong)

- Files: `src/modules/personnel/transfer-review/transfer-review.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: công cụ ngoài bộ theo `plan_id`, hạn bằng `addWorkingDays` không tính ngày hiệu lực, ai quyết, quyết định cho phép, trạng thái phiên
- Verify: unit test đủ bảng ca xanh; `policy-ownership.spec.ts` xanh

### Task 4: đọc bộ chuẩn và mở phiên (xong)

- Files: `catalog.service.ts`, `catalog/standard-toolset/standard-toolset.service.ts`, `catalog.types.ts`, `personnel/transfer-review/transfer-review.service.ts`, `transfer-review.listener.ts`, `transfer-review.repo.ts`, `personnel.module.ts`
- Depends on: Task 2, Task 3
- Acceptance: `getStandardToolsetPlanIds` theo một câu lệnh; listener mở phiên chỉ khi đổi phòng và có công cụ ngoài bộ, idempotent theo `placement_id`, phiên cũ thành `SUPERSEDED`
- Verify: integration PostgreSQL của AC-1, AC-2, AC-8 và ca sự kiện lặp xanh

### Task 5: quyết định, quá hạn và đọc (xong)

- Files: `transfer-review.service.ts`, `transfer-review.sweeper.ts`, `transfer-review.controller.ts`, `transfer-review.dto.ts`, `transfer-review.http-errors.ts`, `transfer-review.mapper.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 4
- Acceptance: ba quyết định đúng, `NOT_NEEDED` mở thu hồi nguồn `TRANSFER_REVIEW`, chỉ trưởng phòng hiệu lực của phòng nhận quyết, phòng thiếu trưởng phòng thì chờ và hạn không đặt lại, quá hạn chỉ nhắc, danh sách và công cụ phân trang
- Verify: integration + e2e của AC-3→AC-7, AC-9, AC-11→AC-14 và `US-07-05` AC-9 xanh; `pnpm openapi:export` không lệch; test đếm câu lệnh xanh

### Checkpoint (xong, kết quả ở bảng dưới)

Gate xanh trên cây làm việc (`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên CSDL riêng), tự review diff theo AC; kiểm tay luồng đầu-cuối với `g6-handover-confirmation` nếu đã merge.

## Verification and handoff

Chạy từ gốc BE theo [CONTRIBUTING](../../../../CONTRIBUTING.md) và [test guide](../../../../test/README.md): `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` (CSDL riêng), `pnpm openapi:export`.

| Lệnh / kiểm tra AC                                           | Revision / môi trường                                                                                                                                      | Kết quả thực chạy                                                                                                                                                                                                                                                           | Giới hạn / việc còn lại                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm typecheck`, `pnpm lint`, `pnpm prisma:validate`        | cây làm việc local, chưa commit (BE `7920ee5` cộng thay đổi G5/G6 chưa commit)                                                                             | xanh                                                                                                                                                                                                                                                                        | —                                                                                    |
| `pnpm exec jest --runInBand`                                 | như trên                                                                                                                                                   | 188 suite, 2867 ca xanh (mới: `transfer-review.policy.spec.ts` 24 ca; cổng kiến trúc, `policy-ownership`, `module-graph`, `api-collection-contract` xanh)                                                                                                                   | —                                                                                    |
| `pnpm openapi:export` rồi `pnpm test:e2e`                    | như trên, 248 thao tác                                                                                                                                     | 35 suite, 899 ca xanh (mới: `transfer-reviews.e2e-spec.ts`; kiểm kê 248)                                                                                                                                                                                                    | —                                                                                    |
| Tích hợp của hạng mục (PostgreSQL thật, CSDL riêng)          | như trên                                                                                                                                                   | 4 suite, 30 ca xanh: `transfer-review-open` (8), `-decide` (13), `-read` (5), `-constraints` (4)                                                                                                                                                                            | —                                                                                    |
| Tích hợp hồi quy (17 suite, 211 ca)                          | như trên                                                                                                                                                   | xanh: `department-transfer-record`, `-change`, `-integrity`, `handover-duty-*` (5), `provisioning-revocation-*` (4: `PersonalSeat` thêm `grantReason`), `standard-toolset-http`, `-constraints`, `catalog-standard-toolset-read-batching`, `return-request`, `organization` | không chạy toàn bộ tích hợp: người tích hợp chạy một lần ở cuối G6                   |
| Drift migration                                              | CSDL tạm trong container test, `prisma migrate deploy` rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`, rồi xóa CSDL tạm | không lệch (`No difference detected`)                                                                                                                                                                                                                                       | —                                                                                    |
| `pnpm build`, `pnpm test:discovery`                          | như trên                                                                                                                                                   | xanh (188 unit, 35 e2e, 189 tích hợp)                                                                                                                                                                                                                                       | —                                                                                    |
| `pnpm rules:check`, `pnpm rules:format`, `pnpm format:check` | như trên                                                                                                                                                   | xanh                                                                                                                                                                                                                                                                        | `AC-10` và vế chi phí của `AC-3` chờ G8; bốn mặc định `OQ-A-17` chưa phải Owner chọn |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối (mục _Như đã xây và khác biệt_ của spec); chưa có peer review.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`docs/rules/security-jobs.md`, ARCHITECTURE.md, `test/README.md`, AGENTS.md); phần chưa kiểm chứng ghi rõ trong spec.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
