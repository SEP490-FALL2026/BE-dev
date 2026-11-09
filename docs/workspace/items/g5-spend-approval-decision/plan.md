# Plan: Người duyệt chi quyết định trên snapshot ngân sách, kể cả quyết trong lô

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Scope map đổi chủ ba nhóm AC không làm được ở đây: yêu cầu nhóm (`US-06-01` AC-15, `US-06-08` AC-10, `US-05-17` AC-9) sang `g5-group-requests`, tạo thay (`US-06-08` AC-2, AC-9) sang `g5-delegated-requests`; vế tạo khoản cam kết của các AC duyệt thuộc `g5-commitment-creation`. Phát hiện hạng mục quyết phiên bản chưa có người thay thế (`US-06-08` AC-11) và sửa ở đây. Harness chọn người quyết phiên bản theo vai: Người duyệt chi làm trưởng phòng thì người thay thế quyết.

## Tasks

### Task 1: thiết kế `ready`, scope map

- Files: `spec.md`, `plan.md`, `roadmap.md` (`US-06-01` AC-15, `US-06-08` AC-2, AC-9, AC-10, `US-05-17` AC-9 chuyển chủ), specs của `g5-group-requests`, `g5-delegated-requests`
- Depends on: ba hạng mục phụ thuộc
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test; mỗi AC một chủ
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu

- Files: migrations `20261023230000`, `20261023230100`, `20261023230200`, `requests.prisma`, `architecture-boundaries.spec.ts`
- Depends on: Task 1
- Acceptance: quyết định và snapshot không đổi, override có lý do và năm, vai người thay thế
- Verify: `spend-decision-constraints` (10) xanh; `migrate diff --exit-code` = 0

### Task 3: quy tắc thuần

- Files: `spend-decision.policy.ts` (+ spec), `budget.policy.ts` (+ spec), `budget-check.policy.ts` (đang chờ)
- Depends on: Task 1
- Acceptance: ai quyết, duyệt được khi nào, người thay thế quyết phiên bản
- Verify: 14 ca chính sách xanh

### Task 4: quyết định và quyết trong lô

- Files: `spend-decision.service.ts`, `spend-decision.repo.ts`, `spend-batch-decision.service.ts`, `budget-check.service.ts` (`compute`), `spend-routing.service.ts`
- Depends on: Task 2, Task 3
- Acceptance: kiểm lại, snapshot, override, quay về, lô
- Verify: `spend-approval` (17), `spend-approval-batch` (9) xanh

### Task 5: bảng của Người duyệt chi, người thay thế, API

- Files: `spend-approval-view.service.ts`, `spend-approvals.controller.ts`, `spend-approval.dto.ts`, `spend-view.service.ts`, `spend-status.service.ts`, `version-decision.service.ts`, `budget-support.service.ts`, `decision.repo.ts`, `spend-harness.ts`, `api-coverage-manifest.ts`, `openapi.json`
- Depends on: Task 4
- Acceptance: bảng, hàng đợi, người thay thế quyết phiên bản, 4 thao tác mới
- Verify: `spend-substitute` (9) xanh; `jest src`, e2e kiểm kê xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                        | Revision / môi trường | Kết quả thực chạy        | Giới hạn / việc còn lại                                                           |
| ------------------------------------------------------------------------- | --------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `spend-approval`, `spend-approval-batch`, `spend-substitute`              | PostgreSQL 17 Docker  | 17, 9 và 9 ca xanh       | —                                                                                 |
| `spend-decision-constraints`                                              | như trên              | 10 ca xanh               | —                                                                                 |
| `test/integration/access-request-*`, `budget-*`, `spend-*` sau khi đổi    | như trên              | 29 suite, 641 ca xanh    | —                                                                                 |
| `pnpm exec jest src` (unit, gồm kiến trúc, hợp đồng danh sách và OpenAPI) | như trên              | 154 suite, 2270 ca xanh  | —                                                                                 |
| e2e `api-inventory`, `openapi`                                            | như trên              | 25 ca xanh, 198 thao tác | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5                                     |
| `prisma migrate deploy` + `migrate diff --exit-code`                      | CSDL tạm rỗng         | không drift              | —                                                                                 |
| `tsc --noEmit`, `eslint` `src`, `test/support`, các suite mới             | như trên              | sạch                     | Chưa tạo khoản cam kết khi duyệt (hạng mục sau); kênh mobile không kiểm được ở BE |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
