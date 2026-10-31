# Plan: B-02 — hàng đợi bước nhu cầu theo người giữ hiện hành

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1` + cây chưa commit.
- Phụ trách: AI B-02 (31/10/2026) cho cả thiết kế, implementation, test và cập nhật plan. Thiết kế ban đầu bởi: AI A-08 (yêu cầu contract).
- Owner review: chưa review. Peer review: chưa.
- Triển khai: `in-progress` (đã implement và test cục bộ, chưa commit, chưa PR; chờ điều phối cập nhật registry chung). Chưa có `merged-dev`, `accepted`, `released`.

## Before coding

Đã đọc `docs/rules/api-contract.md`, `module-structure.md`, `database-business.md`, `work-item-sizing.md`, `huong-dan-dev-moi.md`; `need-decision/`, `spend-approval-view/`, `step-routing/`, `group-line-decisions/` và test `mobile-need-decision`, `mobile-spend-approval`. Đối chiếu với code ở BE `6eb12d1`: `need-decision.policy.ts` (`deciderRoleOf`, `checkNeedDecision`), `group-line-decision.policy.ts` (`checkLineNeedDecider`, `needStepOf`), `routing.policy.ts` (hàng 1–4, 8), `group-need-routing.policy.ts` (hàng 5, 9). Không blocker; không migration.

## Tasks

### Task 1: policy thuần và repo đọc bước

- Files: `src/modules/requests/need-decision-queue/need-decision-queue.policy.ts` (+ spec), `need-decision-queue.repo.ts`.
- Depends on: none.
- Acceptance: điều kiện đọc đúng người giữ hiện hành; loại Request của chính người gọi (Request thường theo người gửi và người thụ hưởng, Request nhóm theo người gửi và người trong dòng của chính bước); chỉ hàng định tuyến 1, 2, 3, 4, 5, 9; thứ tự `createdAt, id`; trang và tổng cùng snapshot `RepeatableRead`; `select` đúng cột, `_count` có điều kiện cho dòng nhóm còn chờ.
- Verify: `npx jest src/modules/requests/need-decision-queue` → 28 ca xanh (policy 10, mapper 18); integration ở Task 4.

### Task 2: DTO, mapper, service, controller và đăng ký

- Files: `need-decision-queue.dto.ts`, `need-decision-queue.mapper.ts` (+ spec), `need-decision-queue.service.ts`, `need-decision-queue.controller.ts`; ba `import` và bốn dòng trong `src/modules/requests/requests.module.ts`.
- Depends on: Task 1.
- Acceptance: `GET /api/v1/need-decisions` (`needDecisionList`), `@AuthenticatedOnly()`, 401/503 từ guard, 422 có ví dụ, không mã nội bộ trong mô tả OpenAPI; lookup theo lô (người, gói, phòng, đơn vị tiền, ngày hạn), không đọc từng dòng; không số liệu ngân sách.
- Verify: `npx jest --config ./test/config/jest.http.cjs test/http/requests/need-decision-queue` → 20 ca xanh.

### Task 3: B-10 — `stepKind` và `dueOn` cho `GET /spend-approvals`

- Files: `src/modules/requests/spend-approval-view/step-due-on.policy.ts` (+ spec), `step-due-on.service.ts`, và `spend-approval.dto.ts`, `spend-approval.mapper.ts` (+ spec), `spend-approval-queue.service.ts`; một dòng `StepDueOnService` ở `requests.module.ts`.
- Depends on: Task 2 (dùng chung service).
- Acceptance: hai list có cùng khóa `stepKind` và `dueOn`; không đổi thứ tự, quyền, trường cũ.
- Verify: unit `spend-approval.mapper.spec.ts` (11), `step-due-on.policy.spec.ts` (5); integration hiện có `spend-approval`, `mobile-spend-approval`, `mobile-need-decision` vẫn xanh.

### Task 4: integration trên PostgreSQL thật

- Files: `test/integration/requests/need-decision-queue.integration-spec.ts` (16 ca, relay đếm câu lệnh), `need-decision-queue-handover.integration-spec.ts` (4 ca, đổi trưởng phòng/Người duyệt chi/approver dự phòng nên có database riêng), `test/http/requests/need-decision-queue.http-spec.ts`.
- Depends on: Task 1–3.
- Acceptance: các dòng ở [test matrix](spec.md#test-matrix).
- Verify: lệnh ở bảng dưới.

### Checkpoint

Task 1–4: `tsc` chỉ còn lỗi của các hạng mục khác (`my-requests`, harness ngân sách); `eslint` và `prettier --check` sạch trên file của hạng mục; `pnpm arch:check` không vi phạm; gate `module-layout`, `capability-graph`, `test-size`, `test-support-structure` xanh.

## Verification and handoff

Chạy từ gốc BE, database test Docker `slm-test-db` (`127.0.0.1:55432`), một suite một lần, `--runInBand`; không chạy toàn bộ integration, không chạm DB dev, không `openapi:export`.

| Lệnh / kiểm tra AC                                                                                                             | Revision / môi trường               | Kết quả thực chạy                                                  | Giới hạn / việc còn lại                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `npx jest src/modules/requests/need-decision-queue src/modules/requests/spend-approval-view`                                   | BE `6eb12d1` + cây chưa commit      | 4 suite, 44 ca xanh (policy 10, mapper 18, due 5, spend mapper 11) | —                                                                                              |
| `jest --config test/config/jest.http.cjs test/http/requests/need-decision-queue`                                               | như trên                            | 1 suite, 20 ca xanh                                                | Service giả, chỉ chứng minh guard, query, envelope, serializer                                 |
| `jest --config test/config/jest.integration.cjs test/integration/requests/need-decision-queue.integration-spec.ts --runInBand` | PostgreSQL 17 Docker, DB dùng riêng | 1 suite, 16 ca xanh                                                | —                                                                                              |
| `… need-decision-queue-handover.integration-spec.ts --runInBand`                                                               | như trên                            | 1 suite, 4 ca xanh                                                 | —                                                                                              |
| `… mobile-spend-approval`, `spend-approval`, `mobile-need-decision` (hồi quy B-10)                                             | như trên                            | 13, 17, 11 ca xanh                                                 | Các suite khác của `requests`, e2e `mobile-approver-journey` chưa chạy                         |
| `pnpm arch:check`; `jest --config test/config/jest.gates.cjs module-layout capability-graph test-size test-support`            | như trên                            | không vi phạm; 4 suite, 88 ca xanh                                 | `module-graph` đỏ do `FiscalYearStartLockReader` của B-01, không thuộc hạng mục này            |
| `eslint`, `prettier --check` trên file của hạng mục; `tsc --noEmit`                                                            | như trên                            | sạch cho file của hạng mục                                         | `tsc` còn lỗi ở `my-requests.mapper.ts` và `fiscal-year-start-lock-harness.ts` (hạng mục khác) |
| `pnpm test:discovery`                                                                                                          | như trên                            | đỏ vì quét `.claude/worktrees/*`, không vì spec của hạng mục       | Chạy lại khi thư mục worktree đã dọn                                                           |

Việc còn lại cho điều phối (không thuộc file của hạng mục, chưa làm): `pnpm openapi:export` (thêm `needDecisionList`, đổi `spendApprovalList`), dòng `GET /api/v1/need-decisions` ở `test/support/api-coverage-manifest.ts`, `needDecisionList: 'NEED_DECISION.LISTED'` ở `test/support/openapi-example-manifest.ts` và mã lỗi route ở `openapi-example-route-codes-requests.ts`, `pnpm arch:routes` và `pnpm arch:graph`, kiểm kê (+1 operation), module card `requests/README.md` (capability thứ 37 và cạnh), roadmap, items index; sau đó chạy `pnpm check` và `pnpm test:http`.

- [x] AC trong scope có bằng chứng; không lỗi chưa xử lý.
- [x] Spec/plan phản ánh implementation cuối.
- [ ] Diff cuối được tự review lần hai bởi người khác; peer review chưa có.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chưa có sự kiện `merged-dev`, `accepted`, `released`.
