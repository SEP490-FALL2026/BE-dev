# Gói C-WITHDRAW — Rút cả phiếu (`W4-08`)

- **Trạng thái:** `xong-unit` (unit + bộ kiểm nhanh xanh; `test/integration/requests/request-ticket-withdrawal.integration-spec.ts` và `test/http/requests/request-ticket-withdraw.http-spec.ts` **đã viết chưa chạy** — chạy trên CI ở cổng C)
- **Nhánh:** `feat/redesign-w4-c-withdraw`
- **Sha nền:** `9a303d84` (`feat/redesign-w4-wave-c`)
- **Skill đã đọc:** `superpowers:executing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `ponytail` (full), `.claude/skills/be-quick-check/SKILL.md`

## Kết quả bộ kiểm nhanh & Unit

- `pnpm prisma:generate` → exit 0
- `pnpm typecheck` → exit 0
- `pnpm exec eslint` (13 file `.ts` chạm/thêm) → exit 0 (0 errors, 0 warnings)
- `pnpm exec prettier --check` (13 file `.ts` chạm/thêm) → exit 0
- `pnpm arch:check` → exit 0 (`3230 modules, 17379 dependencies cruised, 0 violations`)
- `pnpm arch:capabilities --module requests` → exit 0 (`48 capabilities, 147 capability edges, cycles: none`)
- `pnpm rules:check` → exit 0 (`BE: 565 files, 4243 links, 0 errors`)
- `pnpm rules:format` → exit 0
- `pnpm test:gates` → exit 0 (`17 passed, 17 total`; `346 passed, 346 total`; `api-collection-contract.gate-spec.ts` xanh, không đòi `NESTED_ARRAYS` cho `POST /request-tickets/{id}/withdrawal`)
- `pnpm test:discovery` → exit 0 (`911 unit, 17 gates, 124 http, 621 integration`)
- `pnpm openapi:export` → exit 0 (`openapi.json`: +292 lines; 0 mã nội bộ trong diff)
- `pnpm arch:routes && pnpm arch:docs:check` → exit 0 (`docs/generated/routes.md: 473 operations`)
- `$env:CI='true'; pnpm test -- src/modules/requests/withdraw src/modules/requests/request-ticket src/app` → exit 0 (`8 passed, 8 total`; `56 passed, 56 total`; riêng `ticket-withdrawal.service.spec.ts`: `14 passed, 14 total`)
- Integration & HTTP (viết, chưa chạy): `test/integration/requests/request-ticket-withdrawal.integration-spec.ts`, `test/http/requests/request-ticket-withdraw.http-spec.ts`

## Đối chiếu tiêu chí

| Ca SPEC (§ / ca) | Test (file · tên) | file:line code | Unit | CI | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| §7.8, §8.1 Không tồn tại / không xem được → 404 (không lộ 403) | `ticket-withdrawal.service.spec.ts:108-123` · `throws RequestTicketNotFoundError when...`; `request-ticket-withdrawal.integration-spec.ts:146-149`; `request-ticket-withdraw.http-spec.ts:80-85` | `ticket-withdrawal.service.ts:70-85`, `ticket-withdrawals.controller.ts:47-51,63-67` | PASS | viết, chưa chạy | |
| §7.8 (C), §8.1 Xem được, không phải người xin → 403 `NOT_REQUESTER` | `ticket-withdrawal.service.spec.ts:125-138`; `request-ticket-withdrawal.integration-spec.ts:143-145`; `request-ticket-withdraw.http-spec.ts:73-78` | `ticket-withdrawal.service.ts:86-88`, `ticket-withdrawals.controller.ts:42-46,63-67` | PASS | viết, chưa chạy | |
| §7.8 (B) Rút từng mục theo `position`, mỗi mục 1 tx | `ticket-withdrawal.service.spec.ts:140-167` · `withdraws items in ascending ticket position order...`; `request-ticket-withdrawal.integration-spec.ts:151-161` | `ticket-withdrawal.service.ts:50-68,90-93` | PASS | viết, chưa chạy | |
| §7.8 (A), (B), (G) Đã rút bởi chính người gọi → `WITHDRAWN ALREADY_WITHDRAWN`, không ghi thêm | `ticket-withdrawal.service.spec.ts:169-199`; `request-ticket-withdrawal.integration-spec.ts:136-176` | `ticket-withdrawal.service.ts:58-63` | PASS | viết, chưa chạy | Dùng `existing.withdrawal?.requestedByEmployeeId === actor.employeeId` |
| §7.8, §8.3 Lý do từ chối rút → `SKIPPED` (`WITHDRAWAL_AFTER_DECISION`, `ALREADY_ENDED`, `WITHDRAWAL_PENDING`, `GRANT_RUNNING`, `GRANT_COMPLETED`) + mọi mục `ENDED_STATES` | `ticket-withdrawal.service.spec.ts:201-272` · `it.each` 5 mã + `handles tickets where all items have ended...`; `request-ticket-withdrawal.integration-spec.ts:224-239` | `ticket-withdrawal.service.ts:18-31,112-115` | PASS | viết, chưa chạy | |
| §7.8, §8.3 Lỗi DB tạm → `RETRYABLE TRANSIENT_FAILURE`; `AccessRequestNotFoundError` → `SKIPPED NOT_IN_TICKET` | `ticket-withdrawal.service.spec.ts:274-307` | `ticket-withdrawal.service.ts:106-111` | PASS | — | |
| §7.8 (D) Mục `WAITING_CONTROLLED` rút được | `request-ticket-withdrawal.integration-spec.ts:179-206` · `§7.8 D: withdraws an item in WAITING_CONTROLLED` | `ticket-withdrawal.service.ts:102` → `WithdrawalService.withdraw` | — | viết, chưa chạy | |
| §7.8 (E) GH-2 vẫn đếm mục đã rút | `request-ticket-withdrawal.integration-spec.ts:267-282` · `§7.8 E: GH-2 still counts withdrawn ticket items...` | `WithdrawalService.withdraw` (`request-limits.repo.ts`) | — | viết, chưa chạy | |
| §7.8 (F) Mục `AWAITING_REQUESTER_REVISION` rút được | `request-ticket-withdrawal.integration-spec.ts:208-222` · `§7.8 F: withdraws an item returned by the head...` | `ticket-withdrawal.service.ts:102` → `WithdrawalService.withdraw` | — | viết, chưa chạy | |
| Đồng thời `Barrier(2)` | `request-ticket-withdrawal.integration-spec.ts:241-265` · `Barrier(2) concurrency: two concurrent ticket withdrawals...` | `ticket-withdrawal.service.ts:50-68` | — | viết, chưa chạy | 10 vòng `Barrier(2)` |
| §8.1, §8.3 HTTP contract #5 (`POST /request-tickets/{id}/withdrawal`, `REQUEST_TICKET.WITHDRAWN`) | `request-ticket-withdraw.http-spec.ts:44-102` (401, 200, 403, 404, 422 `VALIDATION_ERROR`) | `ticket-withdrawals.controller.ts:29-69`, `requests-http.module.ts:45`, `requests.module.ts:274,484` | — | viết, chưa chạy | |

## D-n & Bàn giao

- **D-n (tự chốt kỹ thuật):**
  - | D-5 | C-WITHDRAW | `test/support/api-coverage-manifest-purchase.ts:2`, `openapi-example-messages-purchase-invoice.ts:2`, `openapi-example-route-codes-requests-spend.ts:2` | Gộp entry OpenAPI/coverage của C-WITHDRAW vào đâu khi `api-coverage-manifest.ts` (400 dòng) và `openapi-example-manifest.ts` (399 dòng) chạm trần 400 dòng của `test-support-structure.gate-spec.ts`? | A: Thêm thẳng vào 2 file gốc (đỏ gate); B: Tạo 3 file mảnh `-w4-c-withdraw.ts` và spread vào sub-manifest (`api-coverage-manifest-purchase.ts`, `openapi-example-messages-purchase-invoice.ts`, `openapi-example-route-codes-requests-spend.ts`) theo tiền lệ `*-wave3-tech.ts` | Chọn B (tiền lệ DL-20, PLAN §3.2, `test:gates` 17/17 xanh) | Dời 2 dòng spread nếu gom manifest ở Wave D | tự chốt |
- **Bàn giao cho orchestrator ở cổng C:**
  - `withdraw/` import `request-ticket/` thêm 1 cạnh trong module `requests` (`146 → 147` cạnh). `src/modules/requests/README.md` và `scripts/verify/capability-graph.test.mjs` không nằm trong file gói `C-WITHDRAW`, nên cần orchestrator cập nhật số cạnh ở cổng C (tương tự cổng B cho `B-REPLY`).
