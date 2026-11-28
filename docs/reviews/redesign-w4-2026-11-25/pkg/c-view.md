# Gói C-VIEW — Xem phiếu & `ticketRef` / `latestReply` trên chi tiết Request (`W4-04, W4-11`)

- **Trạng thái:** `xong-unit` (unit + bộ kiểm nhanh xanh; `test/integration/requests/request-ticket-view.integration-spec.ts`, `test/http/requests/request-ticket-get.http-spec.ts` và phần mới ở `test/http/requests/access-request-get.http-spec.ts` **đã viết chưa chạy** — chạy trên CI ở cổng C)
- **Nhánh:** `feat/redesign-w4-c-view`
- **Sha nền:** `9a303d84`
- **Skill đã đọc:** `superpowers:executing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `ponytail` (full), `.claude/skills/be-quick-check/SKILL.md`

## Kết quả bộ kiểm nhanh & Unit

- `pnpm prisma:generate` → exit 0
- `pnpm typecheck` → exit 0
- `pnpm exec eslint <23 file .ts chạm>` (`$env:NODE_OPTIONS='--max-old-space-size=6144'`) → exit 0
- `pnpm exec prettier --check <23 file .ts chạm>` → exit 0
- `pnpm arch:check` → exit 0 (`3232 modules, 17396 dependencies cruised`, 0 violations)
- `pnpm arch:capabilities --module requests` → exit 0 (`49 capabilities, 150 capability edges, cycles: none`; thêm L3 `request-ticket-view` imports 3)
- `pnpm rules:check` → exit 0 (`BE: 565 files, 4243 links, 0 errors`)
- `pnpm rules:format` → exit 0
- `pnpm test:gates` → exit 0 (`17 passed, 17 total`; `346 passed, 346 total`; `capability-graph.gate-spec.ts` PASS)
- `pnpm test:discovery` → exit 0
- `pnpm openapi:export` → exit 0 (`openapi.json` +459 dòng; kiểm 0 mã nội bộ `US-/AC-/QD-/QĐ-/W4-/BR-/RB-/RT-/DL-/OQ-`)
- `$env:CI='true'; pnpm test -- src/modules/requests/request-ticket-view src/modules/requests/request-view src/modules/requests/request-ticket src/modules/requests/access-request src/app` → exit 0 (`20 passed, 20 total`; `225 passed, 225 total`; `request-ticket-view`: `1 passed, 4/4`; `request-view`: `4 passed`)
- Integration / HTTP (viết, chưa chạy trên máy): `test/integration/requests/request-ticket-view.integration-spec.ts`, `test/http/requests/request-ticket-get.http-spec.ts`, `test/http/requests/access-request-get.http-spec.ts` (`pnpm check` và `test:http`/`test:integration` chưa chạy trên máy — chỉ chạy trên CI GitHub)

## Đối chiếu tiêu chí

| Ca SPEC (§ / ca) | Test (file · tên) | file:line code | Unit | CI | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| §7.4 `GET /request-tickets/{id}` không tồn tại / 0 mục xem được → 404 | `request-ticket-view.service.spec.ts:136-151` · `throws RequestTicketNotFoundError when...`; `request-ticket-get.http-spec.ts:86-95`; `request-ticket-view.integration-spec.ts:173-183` | `request-ticket-view.service.ts:25-42`, `request-ticket-view.controller.ts:25-54` | PASS | viết, chưa chạy | |
| §7.4 (1)-(3) xem 1/3 mục giữ `status` `IN_PROGRESS`/`DONE` trên mọi mục, `H1` thấy đủ 3 mục theo `position` | `request-ticket-view.service.spec.ts:153-186` · `filters items to the 1 of 3 visible...`, `returns status DONE...`; `request-ticket-view.integration-spec.ts:135-171,208-235` | `request-ticket-view.service.ts:29-44`, `request-ticket.mapper.ts:6-32` | PASS | viết, chưa chạy | |
| §7.4 (4), §7.11 `accessRequestGet` có `ticketRef` (`null` cho đơn), `latestReply` (ISO `createdAt`, non-tx `Promise.all`) | `access-request-query.service.spec.ts:137-176` · `returns ticketRef from record.ticket and latestReply...`; `access-request.mapper.spec.ts:74-104`; `access-request-get.http-spec.ts:202-242`; `request-ticket-view.integration-spec.ts:185-206` | `access-request-query.service.ts:62-84,119-123,217-231,282-283`, `access-request.mapper.ts:7-8`, `access-request.dto.ts:279-293` | PASS | viết, chưa chạy | Gỡ `'ticket'` khỏi `Omit<AccessRequestRecord, ...>` (bàn giao `B-CORE`); giữ `access-request/` 25 file |
| §7.4 registry `requestTicketGet#ticket.items`, manifest & ví dụ OpenAPI | `test/gates/api-collection-contract.gate-spec.ts`, `test/gates/test-support-structure.gate-spec.ts` | `api-collection-registry-{nested,events}-w4-c-view.ts`, `api-coverage-manifest-w4-c-view.ts`, `openapi-example-{messages,route-codes}-w4-c-view.ts` | PASS (`test:gates`) | viết (`api-inventory`/`openapi-response-examples`) | `owner`/`item` = `b03-my-requests` (`DL-20`) |

## D-n & Bàn giao

- **D-n (kỹ thuật):**
  - `AccessRequestQueryService` đã có sẵn 8 tham số constructor (trần `eslint` `max-params: 8`, và `lint-debt.gate-spec.ts:200-230` cấm `eslint-disable max-params` trong `src/`). Vì vậy giữ `@Inject(RequestReplyRepo) private readonly replies!: RequestReplyRepo;` (DI bắt buộc của NestJS, không `@Optional()`, đã kiểm qua `app.module.spec.ts` và `access-request-query.service.spec.ts`).
  - `test/support/api-coverage-manifest.ts` (400 dòng) và `test/support/openapi-example-manifest.ts` (399 dòng) đang chạm trần 400 dòng của `test-support-structure.gate-spec.ts:173`. Đã hoàn tác mọi sửa ở file `purchase` (`api-coverage-manifest-purchase.ts`, `openapi-example-messages-purchase-invoice.ts`) và dời 4 dòng route `access-requests` hiện có sang `api-coverage-manifest-w4-c-view.ts` (398 dòng ở file chính) cùng 4 dòng message `accessRequest*` sang `openapi-example-messages-w4-c-view.ts` (397 dòng ở file chính) để nối đúng manifest chính mà vẫn ≤ 400 dòng.
  - `access-request.dto.ts` khai báo `ticketRef` và `latestReply` inline thay vì import từ `request-ticket/`, vì `access-request` là capability `L0` (`arch:capabilities` sẽ báo vòng nếu `L0` import `L1`).
  - `request-ticket-view.integration-spec.ts` dùng `outsider` (`OUT-1` ở `P-OTHER`) thay `IT2` cho ca 0 mục xem được → 404, vì `canReadRequest` (`access-request.policy.ts:184`) cho mọi `IT_ADMIN` đọc request; ca 1/3 mục dùng `c1` (`SPENDING_APPROVER`).
- **Bàn giao cho orchestrator (Cổng C, theo `D-2`):**
  - `pnpm arch:capabilities --module requests` báo **`49 capabilities, 150 capability edges, cycles: none`** (tăng 1 capability L3 `request-ticket-view` imports 3: `access-request`, `request-ticket`, `request-view`; +4 edges so với 48/146 của cổng B). Gói giữ nguyên `src/modules/requests/README.md` và `scripts/verify/capability-graph.test.mjs` để orchestrator cập nhật ở cổng C (`D-2`).
  - Khi thêm route mới ở cổng C, chạy `pnpm arch:graph && pnpm arch:routes` để cập nhật `docs/generated/{module-graph,routes}.md`.
