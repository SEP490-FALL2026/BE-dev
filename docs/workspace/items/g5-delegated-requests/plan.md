# Plan: trưởng phòng tạo Request thay cho nhân viên trong phòng

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Hạng mục dựa vào đường gửi, định tuyến và xác nhận nhu cầu có sẵn; thêm một cách tạo (trưởng phòng gửi thay) mà không đổi đường gửi cho chính mình. Nhóm nhiều người trong một Request vẫn thuộc `g5-group-requests`, nên ở đây mỗi (người, công cụ) là một Request.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`, `roadmap.md`
- Depends on: hai hạng mục phụ thuộc
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu

- Files: migration `20261024020000`, `requests.prisma`, `access-request.repo.ts`, `access-request.dto.ts`
- Depends on: Task 1
- Acceptance: mã lô, ngày kết thúc, hàng 5 ghi được
- Verify: `migrate diff --exit-code` = 0

### Task 3: quy tắc thuần

- Files: `delegated-request.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: ai gửi cho ai, email, ngày kết thúc, phần của trưởng phòng
- Verify: 16 ca chính sách xanh

### Task 4: gửi thay

- Files: `delegated-request.service.ts`, `request-assessment.service.ts`, `access-request.errors.ts`, `access-request.http-errors.ts`
- Depends on: Task 2, Task 3
- Acceptance: tất cả hoặc không, xác nhận bằng việc gửi, Audit
- Verify: `spend-delegated-requests` (15) xanh

### Task 5: hàng đợi và ngày kết thúc, API

- Files: `grant-queue.repo.ts`, `grant-queue.service.ts`, `delegated-requests.controller.ts`, `delegated-request.dto.ts`, `grant.policy.ts`, `licensing.types.ts`, `provisioning.service.ts`, `requests.module.ts`, `spend-harness.ts`, `api-coverage-manifest.ts`, `openapi.json`
- Depends on: Task 4
- Acceptance: hàng đợi gộp theo người; ngày kết thúc thành seat; 2 thao tác mới
- Verify: e2e kiểm kê và OpenAPI xanh; `jest src` xanh; hồi quy `access-request`, `budget`, `spend`, `provisioning`, `seat` xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                                                 | Revision / môi trường | Kết quả thực chạy        | Giới hạn / việc còn lại                                                                                                               |
| -------------------------------------------------------------------------------------------------- | --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `spend-delegated-requests`                                                                         | PostgreSQL 17 Docker  | 15 ca xanh               | —                                                                                                                                     |
| `delegated-request.policy.spec.ts`                                                                 | như trên              | 16 ca xanh               | —                                                                                                                                     |
| `test/integration/access-request-*`, `budget-*`, `spend-*`, `provisioning-*`, `seat-*` sau khi đổi | như trên              | 45 suite, 862 ca xanh    | —                                                                                                                                     |
| `pnpm exec jest src` (unit, gồm kiến trúc, hợp đồng danh sách và OpenAPI)                          | như trên              | 157 suite, 2315 ca xanh  | —                                                                                                                                     |
| e2e `api-inventory`, `openapi`                                                                     | như trên              | 25 ca xanh, 207 thao tác | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5                                                                                         |
| `prisma migrate deploy` + `migrate diff --exit-code`                                               | CSDL tạm rỗng         | không drift              | —                                                                                                                                     |
| `tsc --noEmit`, `eslint`                                                                           | như trên              | sạch                     | Nhiều người trong một Request: `g5-group-requests`; thứ tự hiển thị bộ chuẩn: giao diện; Assignment hiệu lực trong tương lai: chưa có |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
