# Plan: trưởng phòng duyệt hoặc từ chối bước nhu cầu và bản ghi phê duyệt điện tử

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`, scope map G5
- Depends on: `g5-request-submission-and-routing`
- Acceptance: spec đủ contract, dữ liệu, quyền, lỗi và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: hai migration và model

- Files: `prisma/models/requests.prisma`, `20261023110000_requests_need_decision_states`, `20261023110100_requests_approval_records`
- Depends on: Task 1
- Acceptance: giá trị enum mới; `approval_records` bất biến ở CSDL; CHECK của bước đã quyết
- Verify: áp vào CSDL rỗng rồi `prisma migrate diff --exit-code` → 0; `access-request-constraints` → 36 ca

### Task 3: chính sách quyết định thuần (test trước)

- Files: `need-decision.policy.ts` (+ spec)
- Depends on: none
- Acceptance: quyền quyết, bước còn chờ, xác nhận thời hạn dài, nơi đến, vai tại thời điểm
- Verify: `jest src/modules/requests` → 12 ca của chính sách

### Task 4: use case quyết, API và hiển thị

- Files: `need-decision.service.ts`, repo, DTO, lỗi, controller, view, `requests.module.ts`, `architecture-boundaries.spec.ts`, manifest, `api-inventory.e2e-spec.ts` (149), `openapi.json`
- Depends on: Task 2, 3
- Acceptance: AC của bảng Primary; một transaction ghi bước, Request, bản ghi và audit
- Verify: `access-request-need-decision.integration-spec.ts` → 15 ca xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                            | Revision / môi trường         | Kết quả thực chạy                                             | Giới hạn / việc còn lại                                                       |
| ------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `jest src/modules/requests src/architecture src/module-graph` | cây chưa commit, BE `7920ee5` | xanh (chính sách 12 ca; gate kiến trúc 99 ca)                 | —                                                                             |
| `access-request-need-decision.integration-spec.ts`            | PostgreSQL 17 Docker          | 15 ca xanh                                                    | mock chỉ ở audit (ca nguyên tử)                                               |
| `access-request-constraints.integration-spec.ts`              | như trên                      | 36 ca xanh (14 ca mới của bản ghi phê duyệt và bước đã quyết) | —                                                                             |
| `pnpm exec jest` e2e `api-inventory`, `openapi-export`        | như trên                      | 25 ca xanh, 149 operation                                     | toàn bộ `pnpm check`, `test:integration` và `test:e2e` chạy ở mốc cuối của G5 |
| `prisma migrate diff --exit-code`                             | CSDL tạm                      | 0 (không drift)                                               | —                                                                             |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
