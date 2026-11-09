# Plan: kiểm tra ngân sách tự động, định tuyến ngoại lệ và Finance rà soát trước Người duyệt chi

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Phát hiện hạng mục dựng phiên bản chưa có ngưỡng giá trị cao tuyệt đối mà `US-06-12` AC-3 cần: thêm cột và đường đi của nó ở đây. Không có route trình nên phép kiểm được dựng như dịch vụ chạy trong transaction của người gọi, test gọi đúng như việc trình sẽ gọi. Quy tắc `NULL` của `CHECK` lại để lọt một lần (mã của năm), phát hiện bởi test ràng buộc và sửa tại chỗ vì migration chưa merge.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`, ADR-0015, ADR-0016
- Depends on: ba hạng mục phụ thuộc
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: ngưỡng tuyệt đối, cột `spent`

- Files: migration `20261023200000_budgets_high_value_amount`, `budgets.prisma`, `version.repo.ts`, `version.service.ts`, `budget.dto.ts`, `version-view.service.ts`, `commitment.repo.ts`, `budget-view.service.ts`
- Depends on: Task 1
- Acceptance: version có số tiền tuyệt đối; bảng ngân sách có `spent` và _còn lại_ trừ cả chi phí
- Verify: `budget-version-threshold` (7), `spend-budget-check-years` xanh

### Task 3: facade và listener của ngân sách

- Files: `budgets.service.ts`, `budgets.types.ts`, `budget-facts.repo.ts`, `budget-change-listeners.ts`, `version-decision.service.ts`, `version-line.service.ts`, `module-graph.spec.ts`, `architecture-structure.spec.ts`
- Depends on: Task 2
- Acceptance: requests đọc ngân sách qua facade và nghe thay đổi trong transaction của nó
- Verify: ba cổng kiến trúc, `module-graph` xanh

### Task 4: dữ liệu của phép kiểm và rà soát

- Files: migrations `20261023210000_requests_spend_states`, `20261023210100_requests_budget_checks`, `requests.prisma`, `architecture-boundaries.spec.ts`
- Depends on: Task 1
- Acceptance: kiểm và kết cục không đổi, cột dòng kế hoạch, hai bước mở tối đa
- Verify: `spend-constraints` (41) xanh; `migrate diff --exit-code` = 0

### Task 5: phán đoán và định tuyến

- Files: `budget-check.policy.ts`, `spend-routing.policy.ts`, `finance-review.policy.ts` (+ spec), `budget-check.service.ts`, `spend-routing.service.ts`, `identity-access` (`findUsableFinanceEmployeeId`)
- Depends on: Task 3, Task 4
- Acceptance: mã theo năm, tuyến, người giữ bước
- Verify: 24 ca chính sách; `spend-budget-check`, `spend-budget-check-years`, `spend-routing` xanh

### Task 6: rà soát, listener, API

- Files: `finance-review.service.ts`, `spend-budget.listener.ts`, `spend-status.service.ts`, `spend-view.service.ts`, `finance-reviews.controller.ts`, `spend.dto.ts`, `access-request-query.service.ts`, `api-coverage-manifest.ts`, `openapi.json`, `spend-harness.ts`
- Depends on: Task 5
- Acceptance: ba kết cục, kiểm lại khi dời dòng và khi phiên bản đổi, `spend` ở Request, 5 thao tác mới
- Verify: `spend-finance-review` (22), `spend-review-flows` (14); `jest src`, e2e kiểm kê xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                        | Revision / môi trường | Kết quả thực chạy                                                   | Giới hạn / việc còn lại                       |
| ------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| `spend-budget-check`, `spend-budget-check-years`                          | PostgreSQL 17 Docker  | 12 và 10 ca xanh                                                    | —                                             |
| `spend-finance-review`, `spend-review-flows`, `spend-routing`             | như trên              | 22, 14 và 6 ca xanh                                                 | —                                             |
| `spend-constraints`                                                       | như trên              | 41 ca xanh; một ca lộ lỗ hổng so sánh với NULL ở mã của năm, đã sửa | —                                             |
| `budget-version-threshold`                                                | như trên              | 7 ca xanh                                                           | —                                             |
| `test/integration/budget-*`, `access-request-*` sau khi đổi               | như trên              | 14 suite, 412 ca xanh                                               | —                                             |
| `pnpm exec jest src` (unit, gồm kiến trúc, hợp đồng danh sách và OpenAPI) | như trên              | 152 suite, 2240 ca xanh                                             | —                                             |
| e2e `api-inventory`, `openapi`                                            | như trên              | 25 ca xanh, 186 thao tác                                            | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5 |
| `prisma migrate deploy` + `migrate diff --exit-code`                      | CSDL tạm rỗng         | không drift                                                         | —                                             |
| `tsc --noEmit`, `eslint` `src`, `test/support`, các suite mới             | như trên              | sạch                                                                | —                                             |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
