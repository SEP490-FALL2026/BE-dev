# Plan: đường yêu cầu không phí cho phần mềm nội bộ tới IT thực hiện thủ công

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`, scope map G5
- Depends on: `g5-manager-need-decision`
- Acceptance: spec đủ cổng, trạng thái, hướng phụ thuộc và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: hợp đồng cổng và bản đăng ký của `licensing`

- Files: `licensing.types.ts`, `refusing-grant-request-gate.service.ts`, `registered-grant-request-gate.service.ts`, `licensing.module.ts`, `licensing.service.ts`, `provisioning.service.ts`, `provisioning-decision.service.ts`, `architecture-structure.spec.ts`
- Depends on: Task 1
- Acceptance: cổng khóa Request trong transaction cấp; kết cục báo trong transaction của tác vụ; không đổi hành vi của G4
- Verify: `jest src/architecture`; suite cấp phát tích hợp (21 suite, 304 ca) và e2e `provisioning` xanh

### Task 3: trạng thái và cổng của `requests`

- Files: migration `20261023130000_requests_execution_states`, `requests.prisma`, `grant.policy.ts`, `access-request-grant.gate.ts`, repo, DTO, `requests.module.ts`
- Depends on: Task 2
- Acceptance: `grantAnswerFor` theo trạng thái; Request cấp một lần; `onModuleInit` đăng ký cổng
- Verify: `access-request-internal-path.integration-spec.ts` → 10 ca xanh

### Task 4: harness và e2e

- Files: `test/support/provisioning-harness.ts` (cổng giả có `claimForGrant`, `reportOutcome`), `request-harness.ts`, `test/http/licensing/provisioning.http-spec.ts`, `openapi.json`
- Depends on: Task 3
- Acceptance: test cũ giữ nguyên ý; harness của Request dùng cổng thật
- Verify: `pnpm test:e2e` các suite liên quan xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                              | Revision / môi trường           | Kết quả thực chạy                        | Giới hạn / việc còn lại                                                    |
| --------------------------------------------------------------- | ------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| `access-request-internal-path.integration-spec.ts`              | PostgreSQL 17 Docker, cổng thật | 10 ca xanh                               | —                                                                          |
| suite tích hợp cấp phát, Assignment, seat và `access-request-*` | như trên                        | 21 suite, 304 ca xanh                    | —                                                                          |
| `pnpm exec jest` toàn bộ unit                                   | như trên                        | xanh sau khi đăng ký hợp đồng nội module | —                                                                          |
| e2e `provisioning`, `api-inventory`, `openapi-export`           | như trên                        | 61 ca xanh                               | `pnpm check`, `test:integration`, `test:e2e` đầy đủ chạy ở mốc cuối của G5 |
| `prisma migrate diff --exit-code` trên mọi migration            | CSDL tạm                        | 0 (không drift)                          | —                                                                          |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
