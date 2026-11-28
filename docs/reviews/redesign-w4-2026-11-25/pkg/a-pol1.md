# Gói A-POL1 — Pure policies (`W4-01/02/04/07/09`)

- **Trạng thái:** `xong-unit` (chỉ pure policies + types + unit specs; không có integration/http trong gói A-POL1)
- **Nhánh:** `feat/redesign-w4-a-pol1`
- **Sha nền:** `ef4ceeb7d`
- **Skill đã đọc:** `superpowers:executing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `ponytail` (full), `.claude/skills/be-quick-check/SKILL.md`

## Kết quả bộ kiểm nhanh & Unit

- `pnpm typecheck` → exit 0
- `pnpm exec eslint <7 file .ts đã tạo>` → exit 0
- `pnpm exec prettier --check <7 file .ts đã tạo>` → exit 0
- `pnpm arch:check` → exit 0 (`no dependency violations found (3212 modules, 17289 dependencies cruised)`)
- `pnpm arch:capabilities --module requests` → exit 0 (`48 capabilities, 144 capability edges, cycles: none`; `request-reply` L0, `request-ticket` L1, `spend-submission` L3)
- `pnpm rules:check` → exit 0 (`BE: 565 files, 4243 links, 0 errors`)
- `pnpm test:gates` → exit 0 (`17 passed, 17 total`; `346 passed, 346 total`)
- `$env:CI='true'; pnpm test -- src/modules/requests/request-ticket/request-ticket.policy.spec.ts src/modules/requests/request-reply/request-reply.policy.spec.ts src/modules/requests/spend-submission/spend-batch-order.policy.spec.ts` → exit 0 (`3 passed, 3 total`; `31 passed, 31 total`)

## Đối chiếu tiêu chí

| Ca SPEC (§ / ca)                                       | Test (file · tên)                                                                                                                                     | file:line code                                               | Unit | CI  | Ghi chú     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---- | --- | ----------- |
| §7.2 `MAX_TICKET_ITEMS = 6`                            | `request-ticket.policy.spec.ts:11-13` · `defines MAX_TICKET_ITEMS as 6`                                                                               | `request-ticket.policy.ts:3`                                 | PASS | —   |             |
| §7.2 bước 3 `findDuplicates` (E, F, O)                 | `request-ticket.policy.spec.ts:31-62` · `flags a later item...`, `allows different plans... (L-1)`, `sorts duplicate findings...`                     | `request-ticket.policy.ts:13-29`                             | PASS | —   | OQ-W4-5 = A |
| §7.2 bước 3 `openLimitRefusals` (G, H, Trọng tâm 3)    | `request-ticket.policy.spec.ts:64-139` · `refuses item 2... (§7.2 H)`, `does not count or refuse... (§7.2 G)`, `refuses item 1...`, `skips exempt...` | `request-ticket.policy.ts:32-50`                             | PASS | —   |             |
| §7.4 `ticketStatusOf` (`ENDED_STATES`)                 | `request-ticket.policy.spec.ts:15-29` · `it.each(ENDED_STATES)`, `returns IN_PROGRESS...`, `returns DONE for an empty state list`                     | `request-ticket.policy.ts:53-55`                             | PASS | —   |             |
| `orderByPosition` (không mutate)                       | `request-ticket.policy.spec.ts:141-160` · `returns a new array ordered by position without mutating the input`                                        | `request-ticket.policy.ts:8-10`                              | PASS | —   |             |
| §7.9 bước 2 `pendingHumanReturn` (`NEED`/`IT`/`SPEND`) | `request-reply.policy.spec.ts:5-72` · `it.each(['NEED','IT_ASSESSMENT','SPEND'])`, `returns null when there are no...`, `...without falling back...`  | `request-reply.policy.ts:7-21`, `request-reply.types.ts:1-5` | PASS | —   |             |
| §7.7 `processingOrder`, `restoreBodyOrder`             | `spend-batch-order.policy.spec.ts:34-49` · `it.each(cases)` (`[R3,X,R1]`, `[A,B,C]`, không phiếu)                                                     | `spend-batch-order.policy.ts:5-43`                           | PASS | —   |             |

## Đột biến (SPEC §11.1 — chạy tay)

| Đột biến                         | Ca phải đỏ | Kết quả (lệnh · đỏ?)                                                                                                                                         | Khôi phục + spec xanh lại                      |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| GH-2 `>=` → `>`                  | §7.2 H     | `$env:CI='true'; pnpm test -- src/modules/requests/request-ticket/request-ticket.policy.spec.ts` → **ĐỎ** (`3 failed, 15 passed`: H, 10/1, `[exempt,ok,ok]`) | đã khôi phục, PASS `18/18` (`31/31` cả 3 spec) |
| đếm mục `refused: true` vào GH-2 | §7.2 G     | `$env:CI='true'; pnpm test -- src/modules/requests/request-ticket/request-ticket.policy.spec.ts` → **ĐỎ** (`1 failed, 17 passed`: G nhận `[3]` thay `[]`)    | đã khôi phục, PASS `18/18` (`31/31` cả 3 spec) |

## D-n & Bàn giao

- **D-n:** Không phát sinh.
- **Bàn giao:** Không có. (`src/modules/requests/README.md` giữ cho gói `D-DOCS` theo PLAN mục 3.1.)
