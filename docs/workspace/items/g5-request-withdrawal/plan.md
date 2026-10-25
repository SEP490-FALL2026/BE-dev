# Plan: người yêu cầu rút Request đang chờ

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (23/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Repo chưa có trạng thái nào cho Request đã rút, chưa có hủy tác vụ cấp, nên hạng mục thêm hai trạng thái Request, trạng thái tác vụ `CANCELLED` và cột `cancelled_at` của assignment, cùng đường chờ IT đóng. Trạng thái _chờ chấp nhận_ của connector chưa có (`US-07-03`): vế đó để chỗ nối, không làm.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`, `roadmap.md`
- Depends on: hạng mục phụ thuộc
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu

- Files: migration `20261024030000`, `20261024030100`, `requests.prisma`, `licensing.prisma`, `organization.prisma`
- Depends on: Task 1
- Acceptance: cột rút đồng bộ với trạng thái, assignment hủy kỳ rỗng và là cuối cùng, tác vụ hủy là cuối cùng và chỉ vào từ ba trạng thái
- Verify: nhóm _what the database refuses_ xanh; `migrate diff --exit-code` = 0

### Task 3: quy tắc thuần

- Files: `withdrawal.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: ai rút ở từng trạng thái, ba chặng của trưởng phòng, lý do bắt buộc
- Verify: 9 ca chính sách xanh

### Task 4: hủy phía licensing

- Files: `provisioning-cancellation.service.ts`, `assignment.service.ts`, `assignment.repo.ts`, `provisioning-task.repo.ts`, `provisioning-decision.service.ts`, `licensing.service.ts`, `licensing.types.ts`, `licensing.errors.ts`, `licensing.module.ts`, gate đăng ký/từ chối
- Depends on: Task 2
- Acceptance: tác vụ chưa ai làm bị hủy cùng assignment, tác vụ lỗi chờ IT, quyết định khác bị từ chối khi đang chờ đóng
- Verify: nhóm _task cancelled_ xanh

### Task 5: rút Request, API

- Files: `withdrawal.service.ts`, `access-request-grant.gate.ts`, `access-request.repo.ts`, `access-request.types.ts`, `access-request-query.service.ts`, DTO, controller, `spend-step.repo.ts`, `spend-batch.repo.ts`, `requests.module.ts`, `provisioning-tasks.controller.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 3, Task 4
- Acceptance: hai thao tác mới; Request thêm `withdrawal`; mọi ca ở ma trận test
- Verify: `access-request-withdrawal` (18) xanh; e2e kiểm kê và OpenAPI xanh; `jest src` xanh; hồi quy `access-request`, `budget`, `spend`, `provisioning` xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 24/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                            | Revision / môi trường | Kết quả thực chạy        | Giới hạn / việc còn lại                                                                           |
| ------------------------------------------------------------- | --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `access-request-withdrawal`                                   | PostgreSQL 17 Docker  | 18 ca xanh               | AC-9 vế lời mời và AC-11 chưa có trạng thái _chờ chấp nhận_ để kiểm                               |
| `withdrawal.policy.spec.ts`                                   | như trên              | 9 ca xanh                | —                                                                                                 |
| `pnpm exec jest src` (unit, gồm kiến trúc, hợp đồng, OpenAPI) | như trên              | 158 suite, 2324 ca xanh  | —                                                                                                 |
| e2e `api-inventory`                                           | như trên              | 22 ca xanh, 209 thao tác | `pnpm test:e2e` đầy đủ và tích hợp toàn bộ chạy ở mốc cuối của G5                                 |
| `tsc --noEmit`, `eslint`, `prettier`                          | như trên              | sạch                     | thông báo cho người liên quan: `g5-request-status-notifications`; chứng từ mua và phần chi: G3/G8 |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
