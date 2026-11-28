# Gói B-CORE — Core ticket capability & ticket on `AccessRequestRecord` (`W4-01, W4-04, W4-11`)

- **Trạng thái:** `xong-unit` (unit + bộ kiểm nhanh xanh; `test/integration/requests/request-ticket-repo.integration-spec.ts` **đã viết chưa chạy** — chạy trên CI ở cổng B)
- **Nhánh:** `feat/redesign-w4-b-core`
- **Sha nền:** `18c2c9ef7`
- **Skill đã đọc:** `superpowers:executing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `ponytail` (full), `.claude/skills/be-quick-check/SKILL.md`

## Kết quả bộ kiểm nhanh & Unit

- `pnpm typecheck` → exit 0
- `pnpm exec eslint src/modules/requests/request-ticket/*.ts src/modules/requests/access-request/access-request.repo.ts src/modules/requests/access-request/access-request.types.ts src/modules/requests/access-request/access-request-record.mapper.ts src/modules/requests/requests.module.ts src/modules/requests/spend-effects/spend-effects.service.spec.ts src/modules/requests/requests-work-facade.module.spec.ts src/modules/requests/request-view/access-request-query.service.ts test/integration/requests/request-ticket-repo.integration-spec.ts` → exit 0
- `pnpm exec prettier --check <same files>` → exit 0
- `pnpm arch:check` → exit 0
- `pnpm arch:capabilities --module requests` → exit 0 (`48 capabilities, 145 capability edges, cycles: none`; `access-request` L0, `request-reply` L0, `request-ticket` L1 imports 2)
- `pnpm rules:check` → exit 0 (`BE: 565 files, 4243 links, 0 errors`)
- `pnpm test:gates` → exit 0 (`17 passed, 17 total`; `346 passed, 346 total`)
- `$env:CI='true'; pnpm test -- src/modules/requests/request-ticket src/modules/requests/access-request src/modules/requests/spend-effects/spend-effects.service.spec.ts src/modules/requests/requests-work-facade.module.spec.ts` → exit 0 (`15 passed, 15 total`; `204 passed, 204 total`; riêng `src/modules/requests/request-ticket`: `4 passed, 4 total`, `37 passed, 37 total`)
- Integration (viết, chưa chạy): `test/integration/requests/request-ticket-repo.integration-spec.ts`

## Đối chiếu tiêu chí

| Ca SPEC (§ / ca)                                                             | Test (file · tên)                                                                                                  | file:line code                                                                              | Unit | CI           | Ghi chú                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---- | ------------ | -------------------------------------------------- |
| §8.1, §8.3 4 lỗi phiếu (`NOT_FOUND`, `NOT_REQUESTER`, `TOO_MANY_ITEMS`, `ITEMS_REFUSED`) | `request-ticket.http-errors.spec.ts:12-87` · `it.each` 4 lỗi 404/403/422/422 + fallback + examples                 | `request-ticket.errors.ts:1-34`, `request-ticket.http-errors.ts:14-60`                      | PASS | —            |                                                    |
| §7.2 `ticketSubmitBodySchema` (1..20, path `items.1.businessReason`, 0/21 lỗi) | `request-ticket.dto.spec.ts:34-61` · `accepts 1, 6, 7, and 20...`, `rejects 0 items and 21...`, `reports path...`  | `request-ticket.dto.ts:74-83`                                                               | PASS | —            |                                                    |
| Trọng tâm 4 `ticketDecideBodySchema` (`requestIds` rỗng / trùng / 7 id)      | `request-ticket.dto.spec.ts:63-97` · `it.each` (`empty`, `duplicate`, `7 requestIds`)                              | `request-ticket.dto.ts:85-95`                                                               | PASS | —            |                                                    |
| §8.3 `ticketItemReasonSchema` (16 giá trị + 7 `TermRefusal`) & enum #3/#4/#5 | `request-ticket.dto.spec.ts:108-181` · `contains exactly 16 closed values...`, `matches closed result outcome...`   | `request-ticket.dto.ts:15-41,101-161`                                                       | PASS | —            |                                                    |
| §7.4, §7.11, RB-11 `toTicketWire` (`position`, `status`, lọc mục ẩn, `latestReply`) | `request-ticket.mapper.spec.ts:122-149` · `orders items by position...`, `filters hidden items... (RB-11)`        | `request-ticket.mapper.ts:6-32`                                                             | PASS | —            |                                                    |
| §7.1 (4) `AccessRequestRecord.ticket` (`null` vs `TicketRef`)                | `request-ticket.mapper.spec.ts:151-167` · `maps standalone request to ticket = null and ticket item to TicketRef`  | `access-request.types.ts:94-98,132,235`, `access-request-record.mapper.ts:44-46,156-160,224`, `access-request.repo.ts:54-56,100` | PASS | — | Kiểm tra `access-request/` giữ đủ 25 file, ≤ 500 dòng |
| §7.1, §7.4, §7.11 `RequestTicketRepo` (`insert`, `view`, `itemsOf`, `refsOf`) | `request-ticket-repo.integration-spec.ts:99-165` · `reads standalone request with ticket === null...`               | `request-ticket.repo.ts:80-166`                                                             | —    | viết, chưa chạy | `view` dùng Prisma select (hằng số câu, không N+1); `refsOf` 1 câu SQL |

## Đột biến (SPEC §11.1 — chạy tay)

| Đột biến                                        | Ca phải đỏ   | Kết quả (lệnh · đỏ?)                                                                                                                               | Khôi phục + spec xanh lại                      |
| ----------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| bỏ một giá trị `TermRefusal` (`K1_ANNUAL_TERM_FIXED`) khỏi `ticketItemReasonSchema` | §7.2 N / dto | `$env:CI='true'; pnpm test -- src/modules/requests/request-ticket/request-ticket.dto.spec.ts` → **ĐỎ** (`1 failed, 9 passed`: length 15 thay vì 16) | đã khôi phục `'K1_ANNUAL_TERM_FIXED'`, PASS `10/10` (`204/204` bộ kiểm) |

## D-n & Bàn giao

- **D-n (kỹ thuật):**
  - `RequestTicketRepo.view` dùng Prisma ORM `tx.requestTicket.findUnique` (nested `select` cho `requester`, `department`, `items`, `plan`, `replies` `take: 1`) thay vì `$queryRaw` join `plans`/`employees`/`departments`, vì `test/gates/architecture-boundaries.gate-spec.ts:327` cấm `$queryRaw` trong `requests` đọc trực tiếp bảng thuộc `catalog`/`organization`. `refsOf` dùng `$queryRaw` 1 câu chỉ đọc bảng `access_requests` của `requests`. Trong `request-ticket-repo.integration-spec.ts`, số câu của `view` được khẳng định là hằng số giữa phiếu 1 mục và 3 mục (không N+1), còn `refsOf` khẳng định đúng 1 câu.
  - `ticketWithdrawBodySchema.reason` dùng `max(1000)` (`REASON_MAX_LENGTH`) để khớp với `withdrawBodySchema` trong `src/modules/requests/access-request/access-request.dto.ts:311` (thay vì `500`).
- **Bàn giao cho gói C-VIEW (Wave C):**
  - Vì `AccessRequestRecord.ticket: TicketRef | null` là bắt buộc trên interface, `AccessRequestView` (`src/modules/requests/request-view/access-request-query.service.ts:55-77`, vốn dùng `Omit<AccessRequestRecord, ...>`) cần `| 'ticket'` ở dòng 77 để `pnpm typecheck` ở Wave B xanh. Gói `C-VIEW` khi triển khai W4-04/W4-11 cho `accessRequestGet` sẽ bỏ `'ticket'` hoặc ánh xạ `ticketRef: record.ticket` từ `AccessRequestRecord`.
