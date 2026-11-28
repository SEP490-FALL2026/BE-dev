# Gói C-LISTS — Tham chiếu phiếu trên 3 danh sách đọc (`W4-04`)

- **Trạng thái:** `xong-unit` (unit, gates, arch, rules, openapi, và 2 HTTP contract specs xanh; integration trên Postgres chạy trên CI ở cổng C)
- **Nhánh:** `feat/redesign-w4-c-lists`
- **Sha nền:** `9a303d84` (`feat/redesign-w4-wave-c`)
- **Skill đã đọc:** `superpowers:executing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `ponytail` (full), `.claude/skills/be-quick-check/SKILL.md`

## Kết quả bộ kiểm nhanh & Unit

- `pnpm prisma:generate` → exit 0 (Prisma Client `7.9.1`)
- `pnpm typecheck` → exit 0
- `pnpm exec eslint <21 file .ts đã sửa/thêm>` (với `NODE_OPTIONS='--max-old-space-size=6144'`) → exit 0
- `pnpm exec prettier --check <21 file .ts đã sửa/thêm>` → exit 0
- `pnpm arch:check` → exit 0 (`3233 modules, 17398 dependencies cruised`, 0 violations)
- `pnpm arch:capabilities --module requests` → exit 0 (`48 capabilities, 149 capability edges, cycles: none`)
- `pnpm rules:format` → exit 0
- `pnpm rules:check` → exit 0 (`BE: 565 files, 4243 links, 0 errors`)
- `pnpm test:gates` → exit 0 (`17 passed, 17 total`; `346 passed, 346 total`)
- `pnpm test:discovery` → exit 0 (`unit: 915`, `gates: 17`, `http: 123`, `integration-serial: 14`, `integration: 620`, `integration-timing: 8`, `e2e: 10`, `flows: 12`)
- `pnpm openapi:export` + `git diff --stat openapi.json` → exit 0 (`openapi.json | 44 ++++++----`, chỉ thêm `ticketRef` nullable trên 3 schema danh sách, 0 mã nội bộ)
- `$env:CI='true'; pnpm test -- src/modules/requests/my-requests src/modules/requests/need-decision-queue src/modules/requests/spend-approval-view src/modules/requests/request-ticket src/app` → exit 0 (`20 passed, 20 total`; `188 passed, 188 total`)
- Targeted HTTP contract: `pnpm test:http -- test/http/requests/my-requests.http-spec.ts test/http/requests/need-decision-queue.http-spec.ts` → exit 0 (`2 passed, 2 total`; `49 passed, 49 total`)
- Ghi chú theo `be-quick-check`: `pnpm check` và full `test:http` / `test:integration` / `test:e2e` CHƯA chạy trên máy — full suite chỉ chạy trên CI GitHub.

## Đối chiếu tiêu chí

| Ca SPEC (§ / ca)                                                             | Test (file · tên)                                                                                     | file:line code                                                                                            | Unit | HTTP/CI          | Ghi chú                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---- | ---------------- | -------------------------------------------------- |
| §7.4 `meAccessRequestList` DTO (`ticketRef: TicketRef \| null`, giữ `myRequestSummarySchema` cho history) | `my-requests.dto.spec.ts:59-104` · `adds nullable ticketRef to list items...`                         | `my-requests.dto.ts:69-126`                                                                               | PASS | `my-requests.http-spec.ts:39` (PASS) | `myRequestItemSchema` tách khỏi `myRequestSummarySchema` để không đổi `request-history` |
| §7.4 `toMyRequestSummary` (`null` vs `TicketRef`), `toSummary` không có `ticketRef` | `my-requests.mapper.spec.ts:46-63` · `maps a standalone request...`, `keeps toSummary without ticketRef` | `my-requests.mapper.ts:21,24-91`                                                                          | PASS | —                |                                                    |
| §7.4, DL-12 `MyRequestsService.list` gọi `refsOf` 1 lần/trang                | `my-requests.service.spec.ts:85-108` · `calls RequestTicketRepo.refsOf once per page...`              | `my-requests.service.ts:49-87`                                                                            | PASS | —                | Không `@Optional()`                                |
| §7.4 `needDecisionList` DTO & mapper (`ticketRef: null` vs `TicketRef`)      | `need-decision-queue.mapper.spec.ts:178-187` · `maps ticketRef as null for standalone...`             | `need-decision-queue.dto.ts:71`, `need-decision-queue.mapper.ts:21,78`                                    | PASS | `need-decision-queue.http-spec.ts:36` (PASS) |                                                    |
| §7.4, DL-12 `NeedDecisionQueueService.queue` gọi `refsOf` 1 lần/trang        | `need-decision-queue.service.spec.ts:88-114` · `calls RequestTicketRepo.refsOf once per page...`      | `need-decision-queue.service.ts:22-81`                                                                    | PASS | —                | Short-circuit khi `rows.length === 0`; không `@Optional()` |
| §7.4 `spendApprovalList` DTO & mapper (`ticketRef: null` vs `TicketRef`)     | `spend-approval-queue.mapper.spec.ts:46-57` · `maps ticketRef as null for standalone...`              | `spend-approval.dto.ts:172`, `spend-approval.mapper.ts:31,115`                                            | PASS | —                | Tách khỏi `spend-approval.mapper.spec.ts` để giữ `<= 400` dòng |
| §7.4, DL-12 `SpendApprovalQueueService.queue` gọi `refsOf` 1 lần/trang       | `spend-approval-queue.service.spec.ts:95-121` · `calls RequestTicketRepo.refsOf once per page...`     | `spend-approval-queue.service.ts:13-39`, `spend-approval-queue-facts.service.ts:16-64`, `requests.module.ts:131,325` | PASS | —                | Tách `SpendApprovalQueueFactsService` để giữ `max-params <= 8`; không `@Optional()` |
| §7.4, M-5 test đếm câu truy vấn cho 3 danh sách                              | `my-requests-read.integration-spec.ts:210-230`, `need-decision-queue.integration-spec.ts:366-398`     | `request-ticket.repo.ts:131-160`                                                                          | —    | CI               | Đều so **tương đối** (`many.length === few.length`, `large.length === small.length`), không khẳng định số tuyệt đối; `refsOf` không đọc cột tài chính |

## D-n & Bàn giao

- **D-n (kỹ thuật):**
  - `SpendApprovalQueueService` thêm `RequestTicketRepo` sẽ lên 9 tham số constructor (vượt `eslint` `max-params: 8`), nên phần nạp lookup của hàng đợi được tách sang `SpendApprovalQueueFactsService` (`spend-approval-view/spend-approval-queue-facts.service.ts`, đặt hậu tố `-facts.service.ts` theo quy tắc L4 của `module-layout.gate-spec.ts`), còn `SpendApprovalQueueService` nhận `(steps, facts)` và được nối trong `requests.module.ts`.
  - `spend-approval.mapper.spec.ts` vốn đã 391 dòng, thêm ca `ticketRef` vượt trần 400 dòng của `module-layout.gate-spec.ts` (`403` dòng). Ca test `ticketRef` của `approvalSummaryOf` được tách sang `spend-approval-queue.mapper.spec.ts`, giữ `spend-approval.mapper.spec.ts` ở 392 dòng (`ticketRefs: new Map()` trong `lookups()`).
  - Trong `my-requests.dto.ts`, `myRequestSummarySchema` giữ nguyên không có `ticketRef` để `request-history.dto.ts` (`accessRequestHistoryItemSchema`) không bị thêm trường ngoài SPEC, còn `myRequestItemSchema` mở rộng `myRequestSummarySchema` với `ticketRef: ticketRefSchema.nullable()` cho `meAccessRequestList`.
- **Bàn giao cho cổng C / Orchestrator:**
  - `pnpm arch:capabilities --module requests`: **`48 capabilities, 149 capability edges, cycles: none`** (cộng thêm các cạnh `my-requests -> request-ticket`, `need-decision-queue -> request-ticket`, `spend-approval-view -> request-ticket`; `request-ticket` (`L1`) hiện được 3 capability import). Orchestrator cập nhật `src/modules/requests/README.md` và `scripts/verify/capability-graph.test.mjs` khi đóng cổng C theo quy ước.
  - Mọi integration test của 3 danh sách (`my-requests-read.integration-spec.ts`, `need-decision-queue.integration-spec.ts`, `mobile-spend-approval.integration-spec.ts`, `requests-ai-source.integration-spec.ts`) không có khẳng định số SQL tuyệt đối hay `.toEqual(...)` nguyên bản ghi danh sách cần sửa trước; chạy kiểm tra thực tế trên CI cổng C.
