# Plan: Người duyệt chi hỏi Finance thông tin ngân sách và Finance trả lời

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Scope map đổi chủ `US-06-02` AC-3 (nhắc Finance theo SLA) sang `g5-step-sla-and-alerts` vì repo chưa có tác vụ SLA; vế đóng câu hỏi khi rút làm ở đây bằng `closeOpen` để hạng mục rút gọi. Một mảng lồng mới không được thêm vào hợp đồng (registry chỉ co lại), nên bảng của Người duyệt chi chỉ hiện câu hỏi gần nhất.

## Tasks

### Task 1: thiết kế `ready`, scope map

- Files: `spec.md`, `plan.md`, `roadmap.md` (`US-06-02` AC-3 chuyển chủ), spec của `g5-step-sla-and-alerts` (size exception)
- Depends on: hạng mục phụ thuộc
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test; mỗi AC một chủ
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu

- Files: migration `20261024000000`, `requests.prisma`, `organization.prisma`, `architecture-boundaries.spec.ts`
- Depends on: Task 1
- Acceptance: trạng thái, câu trả lời, một câu hỏi mở mỗi bước, bất biến sau khi kết thúc
- Verify: 17 ca tích hợp (nhóm _what the database keeps_) xanh; `migrate diff --exit-code` = 0

### Task 3: quy tắc thuần

- Files: `budget-information.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: ai hỏi, ai trả lời, `SoD-8`
- Verify: 14 ca chính sách xanh

### Task 4: hỏi, trả lời, đóng

- Files: `budget-information.service.ts`, `budget-information.repo.ts`, `spend-decision.service.ts`, `spend.errors.ts`, `spend.http-errors.ts`
- Depends on: Task 2, Task 3
- Acceptance: không chặn bước, không đổi snapshot, khóa Request trước câu hỏi, đóng khi bước quay về
- Verify: `spend-finance-information` (17) xanh

### Task 5: đọc, API, bảng của Người duyệt chi

- Files: `budget-information.controller.ts`, `budget-information-view.service.ts`, `budget-information.dto.ts`, `spend-approval.dto.ts`, `spend-approval-view.service.ts`, `requests.module.ts`, `spend-harness.ts`, `api-coverage-manifest.ts`, `openapi.json`
- Depends on: Task 4
- Acceptance: 4 thao tác mới, `latestBudgetInformation`
- Verify: e2e kiểm kê và OpenAPI xanh; `jest src` xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                     | Revision / môi trường | Kết quả thực chạy        | Giới hạn / việc còn lại                                                                                                     |
| ---------------------------------------------------------------------- | --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `spend-finance-information`                                            | PostgreSQL 17 Docker  | 17 ca xanh               | —                                                                                                                           |
| `budget-information.policy.spec.ts`                                    | như trên              | 14 ca xanh               | —                                                                                                                           |
| `test/integration/access-request-*`, `budget-*`, `spend-*` sau khi đổi | như trên              | 31 suite, 673 ca xanh    | —                                                                                                                           |
| `pnpm exec jest` (unit, gồm kiến trúc, hợp đồng danh sách và OpenAPI)  | như trên              | 155 suite, 2284 ca xanh  | —                                                                                                                           |
| e2e `api-inventory`, `openapi`                                         | như trên              | 25 ca xanh, 203 thao tác | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5                                                                               |
| `prisma migrate deploy` + `migrate diff --exit-code`                   | CSDL tạm rỗng         | không drift              | —                                                                                                                           |
| `tsc --noEmit`, `eslint`                                               | như trên              | sạch                     | Nhắc theo SLA: `g5-step-sla-and-alerts`; gọi `closeOpen` khi rút: `g5-request-withdrawal`; kênh mobile không kiểm được ở BE |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
