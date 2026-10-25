# Plan: trưởng phòng xem yêu cầu kèm seat cùng nhóm chức năng và cờ ngoài bộ chuẩn

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`
- Depends on: `g5-manager-need-decision`
- Acceptance: spec đủ hợp đồng đọc, quyền và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: hợp đồng đọc của `catalog` và `licensing`

- Files: `plan.repo.ts`, `plan-lookup.service.ts`, `standard-toolset.service.ts`, `catalog.service.ts`, `assignment.repo.ts`, `assignment.service.ts`, `licensing.service.ts`
- Depends on: Task 1
- Acceptance: bộ chuẩn, gói tương tự và seat đang giữ của một người; không đổi hành vi cũ
- Verify: `pnpm exec tsc --noEmit`, gate kiến trúc xanh

### Task 3: cờ ngoài bộ chuẩn

- Files: migration `20261023120000_requests_outside_standard_flag`, `requests.prisma`, repo, `access-request.service.ts`, view, DTO
- Depends on: Task 2
- Acceptance: cờ chụp lúc gửi, hiện ở `GET`, không chặn duyệt
- Verify: `access-request-review-view.integration-spec.ts`

### Task 4: danh sách seat cùng nhóm cho trưởng phòng

- Files: `similar-seats.service.ts`, DTO, controller, `requests.module.ts` (import `LicensingModule`), manifest, `api-inventory.e2e-spec.ts` (150), `openapi.json`
- Depends on: Task 2
- Acceptance: collection phân trang, chỉ người giữ bước đọc, số câu lệnh không đổi theo số seat
- Verify: `access-request-review-view.integration-spec.ts` → 7 ca

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                              | Revision / môi trường                        | Kết quả thực chạy                           | Giới hạn / việc còn lại                                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| `access-request-review-view.integration-spec.ts`                                | PostgreSQL 17 Docker, ứng dụng qua `PgRelay` | 7 ca xanh (gồm đếm câu lệnh hai cỡ dữ liệu) | —                                                                          |
| `access-request-*` (4 suite tích hợp)                                           | như trên                                     | 88 ca xanh                                  | —                                                                          |
| `jest src/architecture src/module-graph`, e2e `api-inventory`, `openapi-export` | như trên                                     | 99 và 25 ca xanh, 150 operation             | `pnpm check`, `test:integration`, `test:e2e` đầy đủ chạy ở mốc cuối của G5 |
| `eslint` các file đổi                                                           | như trên                                     | sạch                                        | —                                                                          |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
