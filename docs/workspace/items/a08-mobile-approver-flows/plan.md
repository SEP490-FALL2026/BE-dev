# Plan: A-08 — luồng duyệt trên Mobile (`US-16-02`, `US-16-03`)

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1` + cây chưa commit (A-01, A-02, A-03, A-05, A-09 đã tích hợp).
- Phụ trách: AI theo giao việc của điều phối (31/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của điều phối (31/10/2026).
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local, chưa commit, 31/10/2026; chỉ phần ghi ở bảng dưới; `US-16-02` AC-3, `US-16-03` AC-4, AC-5 blocked). PR: chưa có (không commit/push theo giao việc).

## Before coding

Đã đọc DEV-A.md (A-07→A-09), README audit, `EP-16`, spec/hợp đồng A-09, source `requests`: `need-decision` (policy, service,
controller, lỗi), `spend-approval(s)` (controller, DTO, mã lỗi), `finance-review` (budget-check), migration `approval_records` và
`spend_decisions` (trigger append-only, `step_id` unique), test có sẵn `spend-approval`, `spend-need-decision`,
`access-request-withdrawal`, `mobile-session-roles`. Xác minh gap: không có list bước nhu cầu theo người giữ (B-02);
`/spend-approvals` chỉ bước chi. Không sửa `requests`/`budgets`.

## Tasks

### Task 1: spec, plan, quyết định hàng đợi và yêu cầu contract B-02/B-10

- Files: `spec.md`, `plan.md`, `b02-b10-approval-queue-requirement.md`
- Depends on: none
- Acceptance: AC → test; AC blocked có lý do; quyết định hai list có lý do và điều kiện xem lại; không thêm endpoint
- Verify: `pnpm rules:check`, `pnpm rules:format`

### Task 2: integration trưởng phòng

- Files: `test/integration/requests/mobile-need-decision.integration-spec.ts`
- Depends on: Task 1
- Acceptance: `US-16-02` AC-1, AC-2, AC-4→AC-6, AC-8, AC-9 theo bảng test (màn cũ, đã rút, phòng khác, hết nhiệm kỳ, đồng thời)
- Verify: `pnpm exec jest --config ./test/config/jest.integration.cjs test/integration/requests/mobile-need-decision` → 11 test đạt

### Task 3: integration Người duyệt chi

- Files: `test/integration/requests/mobile-spend-approval.integration-spec.ts`
- Depends on: Task 1
- Acceptance: `US-16-03` AC-1→AC-3, AC-6, AC-7, AC-9; vế quyết định của AC-4 (chờ Finance, override, không ngân sách, SoD,
  màn cũ, đồng thời, đổi người giữ vai, không cam kết thứ hai)
- Verify: `pnpm exec jest --config ./test/config/jest.integration.cjs test/integration/requests/mobile-spend-approval` → 13 test đạt

### Task 4: E2E chuỗi duyệt trên Mobile

- Files: `test/e2e/mobile-approver-journey.e2e-spec.ts`
- Depends on: Task 2, Task 3
- Acceptance: Employee → trưởng phòng (mobile) → trình lô (web) → Người duyệt chi (mobile, từng mục) → cam kết → inbox; R9 hai quyết định
- Verify: `pnpm exec jest --config ./test/config/jest.e2e.cjs --runInBand test/e2e/mobile-approver` → 5 test đạt

### Task 5: hợp đồng Mobile, roadmap, index

- Files: `mobile-contract.md` của A-09 (mục 5, 6, 7, 8, 9), `docs/roadmap.md`, `docs/workspace/items/README.md`
- Depends on: Task 1→4
- Acceptance: bảng ánh xạ có trạng thái thật và bằng chứng; scope map G10 đủ 4 Story, 33 AC
- Verify: `pnpm rules:check`, `pnpm rules:format`

### Checkpoint

`pnpm typecheck`, `pnpm lint`, `pnpm test:gates`, `pnpm arch:check`, `pnpm test:http`, `pnpm test:discovery`, các jest ở trên
và hai suite của A-09; tự review diff theo bảng test.

## Verification and handoff

Chung cho A-07 và A-08 (cùng lượt, cùng cây). Môi trường: Windows, Node 24.0.2 (trừ dòng ghi Node 22.15.0); PostgreSQL 17
Docker `slm-test-db` (127.0.0.1:55432, role thường `ci_integration`), mỗi suite một database tạm, đã dọn (0 database
`slm_%_test` còn lại); HTTP thật qua supertest vào app Nest đầy đủ; không SMTP/storage thật. Cây: BE `6eb12d1` + diff chưa
commit (A-01, A-02, A-03, A-05, A-09 và A-07/A-08). Không đổi source, route, schema: không chạy drift migration, không export
OpenAPI.

| Lệnh / kiểm tra AC                                                                                                                                                                      | Kết quả thực chạy                                                                                                                                                          | Giới hạn / việc còn lại                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `jest --config test/config/jest.integration.cjs test/integration/requests/mobile- test/integration/identity-access/mobile-session test/integration/notifications/mobile-inbox`          | 5 suite, 64 test đạt (A-07 11, A-08 11 + 13, A-09 22 + 7)                                                                                                                  | Chưa chạy full integration (điều phối)   |
| `jest --config test/config/jest.e2e.cjs --runInBand test/e2e/mobile- test/e2e/paid-request-to-seat`                                                                                     | 3 suite, 18 test đạt (journey 5, smoke 6, paid 7)                                                                                                                          | Chỉ BE; không có app native              |
| `pnpm typecheck`; `pnpm lint`                                                                                                                                                           | đạt; đạt                                                                                                                                                                   | —                                        |
| `pnpm test:gates`                                                                                                                                                                       | 16 suite, 317 test đạt                                                                                                                                                     | —                                        |
| `pnpm arch:check`                                                                                                                                                                       | không vi phạm (1 446 module)                                                                                                                                               | —                                        |
| `pnpm test:http` (Node 24)                                                                                                                                                              | 52/53 suite, 1 321/1 323 test đạt; 2 lỗi ở `openapi-export.http-spec.ts`: tiến trình export con lỗi dưới Node 24 (môi trường đã biết của máy này)                          | Chạy lại dưới Node 22.15.0 ở dòng dưới   |
| `jest --config test/config/jest.http.cjs test/http/platform/openapi-export.http-spec.ts test/http/platform/api-inventory.http-spec.ts` dưới Node 22.15.0 (nvm, không đổi Node mặc định) | 2 suite, 13 test đạt: `openapi.json` đúng byte, inventory không đổi                                                                                                        | —                                        |
| `pnpm test:discovery`                                                                                                                                                                   | integration 281, e2e 10 spec đều thuộc đúng runner; lệnh exit 1 chỉ vì 827 file trong `.claude/worktrees/` (worktree của agent khác, không thuộc repo) mà runner unit thấy | Lỗi môi trường có sẵn, không do hạng mục |
| `pnpm rules:check`; `pnpm rules:format`                                                                                                                                                 | 354 file, 2 923 link, 1 lỗi có sẵn (đoạn dưới); format đạt                                                                                                                 | —                                        |

`pnpm rules:check` sau khi thêm hai hạng mục: chỉ còn lỗi `G8 map: owner a10-operational-dashboards is not a registered work
item` có sẵn từ trước (dòng của A-02 trỏ tới A-10 chưa có thư mục ở cây này; A-10 làm trong worktree riêng); không lỗi nào từ
A-07/A-08. `pnpm rules:format`: đạt.

- [x] AC trong scope có bằng chứng; AC blocked ghi lý do và yêu cầu contract.
- [x] Spec/plan phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; không runbook bị ảnh hưởng.
- [ ] Giao Owner review trên revision cụ thể; chưa ghi `merged-dev`, `accepted` hay `released`.
