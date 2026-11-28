# Gói A-DB — W4-01, W4-09 (M1, M2)

- Trạng thái: `xong-unit` (unit + bộ kiểm nhanh đã chạy xanh trừ 1 gate ở mục Bàn giao; integration `viết, chưa chạy`)
- Nhánh: `feat/redesign-w4-a-db`
- Nền (`feat/redesign-w4-wave-a`): `ef4ceeb7d`
- Commit M1: `5e6a78ee` — `feat(requests): request ticket tables and ticket columns (redesign W4 A-DB M1)`

## Đối chiếu tiêu chí (SPEC §5, §7.1, §7.9)

| Ca SPEC | Test | file:line (test) | file:line (schema / migration / code) | Trạng thái |
| --- | --- | --- | --- | --- |
| §5 M1 `RUNTIME_TABLE_EXCEPTIONS.request_tickets` | `compares the effective table privileges...` | `src/infrastructure/database/database-role-judgement.spec.ts:114-128` | `src/infrastructure/database/database-role-judgement.ts:46` | xanh |
| §5 M2 `RUNTIME_TABLE_EXCEPTIONS.access_request_replies` | `compares the effective table privileges...` | `src/infrastructure/database/database-role-judgement.spec.ts:114-128` | `src/infrastructure/database/database-role-judgement.ts:48` | xanh |
| §7.1 (1) CHECK `ticket_pair` (23514) | `enforces access_requests_ticket_pair (23514)` | `test/integration/requests/request-ticket-schema.integration-spec.ts:108-116` | `prisma/migrations/20261210000000_w4_request_tickets/migration.sql:56` | viết, chưa chạy |
| §7.1 (1) CHECK `ticket_position_range` (23514) | `enforces access_requests_ticket_position_range (23514)` | `test/integration/requests/request-ticket-schema.integration-spec.ts:118-126` | `prisma/migrations/20261210000000_w4_request_tickets/migration.sql:57` | viết, chưa chạy |
| §7.1 (1) CHECK `ticket_kind` (23514) | `enforces access_requests_ticket_kind (23514)` | `test/integration/requests/request-ticket-schema.integration-spec.ts:128-151` | `prisma/migrations/20261210000000_w4_request_tickets/migration.sql:58` | viết, chưa chạy |
| §7.1 (2) Unique `(ticket_id, ticket_position)` (23505) | `enforces unique (ticket_id, ticket_position) (23505)` | `test/integration/requests/request-ticket-schema.integration-spec.ts:153-159` | `prisma/models/requests.prisma:281`, `migration.sql:41` | viết, chưa chạy |
| §7.1 (3) Trigger bất biến `access_requests.ticket_*` | `rejects changing ticket_id or ticket_position via trigger...` | `test/integration/requests/request-ticket-schema.integration-spec.ts:161-180` | `prisma/migrations/20261210000000_w4_request_tickets/migration.sql:61-74` | viết, chưa chạy |
| §7.1 (3) Trigger append-only `request_tickets` | `rejects UPDATE and DELETE on request_tickets...` | `test/integration/requests/request-ticket-schema.integration-spec.ts:182-191` | `prisma/migrations/20261210000000_w4_request_tickets/migration.sql:77-86` | viết, chưa chạy |
| §5 M2 CHECK `note` `'   '` và 1001 ký tự (23514) | `rejects blank note and note longer than 1000 characters (23514)` | `test/integration/requests/request-reply-schema.integration-spec.ts:100-108` | `prisma/migrations/20261210000100_w4_access_request_replies/migration.sql:46-47` | viết, chưa chạy |
| §5 M2 `returned_step_id` nullable & không unique | `accepts returned_step_id = null...`; `allows multiple replies...` | `test/integration/requests/request-reply-schema.integration-spec.ts:110-117` | `prisma/models/requests.prisma:324,335`, `migration.sql:18,30` | viết, chưa chạy |
| §5 M2 Trigger append-only `access_request_replies` | `rejects UPDATE and DELETE on access_request_replies...` | `test/integration/requests/request-reply-schema.integration-spec.ts:119-129` | `prisma/migrations/20261210000100_w4_access_request_replies/migration.sql:50-59` | viết, chưa chạy |

## Kiểm nhanh đã chạy (sau sửa cuối M2)

- `pnpm prisma:validate` -> `The schemas at prisma are valid` (exit 0)
- `pnpm prisma:generate` -> Generated Prisma Client 7.9.1 (exit 0)
- `$env:CI='true'; pnpm test -- src/infrastructure/database/database-role-judgement.spec.ts` -> 36 passed, 0 failed
- `pnpm exec prettier --check src/infrastructure/database/database-role-judgement.ts src/infrastructure/database/database-role-judgement.spec.ts test/integration/requests/request-ticket-schema.integration-spec.ts test/integration/requests/request-reply-schema.integration-spec.ts` -> exit 0
- `pnpm typecheck` -> exit 0
- `pnpm exec eslint ...` (4 file `.ts` của gói) -> exit 0
- `pnpm arch:check` -> 0 violations (exit 0)
- `pnpm arch:capabilities --module requests` -> 46 capabilities, 143 edges, cycles: none (exit 0)
- `pnpm rules:check` -> 565 files, 4243 links, 0 errors (exit 0)
- `pnpm openapi:export && git --no-pager diff --stat openapi.json` -> exit 0, 0 diff
- `pnpm test:gates` -> 16/17 suites pass (345/346 tests pass); 1 fail dự kiến ở `test/gates/architecture-boundaries.gate-spec.ts:288` (`PRISMA_MODEL_OWNER` thiếu `RequestTicket`, `AccessRequestReply` — xem Bàn giao).

## D-n

- Không có.

## Bàn giao

- `test/gates/architecture-boundaries.gate-spec.ts:32-224` (`PRISMA_MODEL_OWNER`): thêm `RequestTicket: 'requests'` và `AccessRequestReply: 'requests'` ở cổng A trước khi chạy CI cổng (`test/gates/architecture-boundaries.gate-spec.ts` nằm ngoài danh sách file được sửa của gói A-DB theo LUẬT CỨNG 4/22).
