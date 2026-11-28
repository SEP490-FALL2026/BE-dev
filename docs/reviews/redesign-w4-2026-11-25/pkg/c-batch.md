# Gói C-BATCH — Thứ tự phiếu trong lô chi, ghi chú trình lại & `ticketRef`/`replyNoteRequired` (`W4-07` lô, `W4-10`, `W4-04`)

- **Trạng thái:** `xong-unit` (unit + bộ kiểm nhanh + gates + openapi xanh; integration đã viết chưa chạy — chạy trên CI ở cổng C)
- **Nhánh:** `feat/redesign-w4-c-batch`
- **Sha nền:** `9a303d84` (`feat/redesign-w4-wave-c`)
- **Skill đã đọc:** `superpowers:executing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `ponytail` (full), `.claude/skills/be-quick-check/SKILL.md`

## Kết quả bộ kiểm nhanh & Unit

- `pnpm prisma:generate` → exit 0
- `pnpm typecheck` → exit 0
- `$env:NODE_OPTIONS='--max-old-space-size=6144'; pnpm exec eslint <17 file .ts đã sửa/thêm>` → exit 0
- `pnpm exec prettier --check <17 file .ts đã sửa/thêm>` → exit 0
- `pnpm arch:check` → exit 0 (`3232 modules, 17403 dependencies cruised`, 0 violations)
- `pnpm arch:capabilities --module requests` → exit 0 (`48 capabilities, 149 capability edges, cycles: none`; `spend-submission` L3 imports 8)
- `pnpm rules:check` → exit 0 (`BE: 565 files, 4243 links, 0 errors`)
- `pnpm rules:format` → exit 0
- `pnpm test:gates` → exit 0 (`17 passed, 17 total`; `346 passed, 346 total`; gồm `lint-debt.gate-spec` và `module-layout.gate-spec`)
- `pnpm test:discovery` → exit 0 (`unit 913, gates 17, http 123, integration-serial 14, integration 622, integration-timing 8, e2e 10, flows 12`)
- `pnpm openapi:export && git --no-pager diff --stat openapi.json` → exit 0 (`openapi.json | 75 +++++++++++++--`, chỉ đổi ở `spendQueueList`, `spendBatchSubmit`, `spendBatchItemList` và schema liên quan; 0 mã nội bộ)
- `$env:CI='true'; pnpm test -- src/modules/requests/spend-submission src/modules/requests/spend src/modules/requests/request-reply src/modules/requests/request-ticket` → exit 0 (`25 passed, 25 total`; `211 passed, 211 total`)
- Integration **chỉ viết, chưa chạy** (chạy trên CI ở cổng C):
  - `test/integration/requests/spend-batch-ticket-order.integration-spec.ts`
  - `test/integration/requests/spend-batch-reply-note.integration-spec.ts`
- **Lưu ý:** `pnpm check`, `test:http`, `test:integration`, `test:e2e`, Docker, seed, migration **CHƯA chạy** trên máy.

## Đối chiếu tiêu chí

| Ca SPEC (§ / ca) | Test (file · tên) | file:line code | Unit | CI | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| §7.7 Lô: khóa theo id, xử lý `processingOrder`, trả `results`/`items`/`recorder` theo thân | `spend-batch.service.spec.ts:321-365` · `locks by sorted id, processes in processingOrder...` | `spend-batch.service.ts:113-156` | PASS | — | |
| §7.7 (a), (b) Lô nhiều mục cùng phiếu + audit `requestIds[i]`/`outcomes[i]` | `spend-batch-ticket-order.integration-spec.ts:86-259` | `spend-batch.service.ts:113-145`, `spend-batch-writer.service.ts:51-73` | — | viết, chưa chạy | |
| §7.10 A, B, D, E & `AWAITING_RESERVE_CONFIRMATION` (chỉ `insert` khi không `STOPPED`) | `spend-batch.service.spec.ts:189-280` · `it.each` §7.10 | `spend-batch.service.ts:172-205`, `spend-ticket-reply.service.ts:25-43` | PASS | — | |
| §7.10 C ghi chú cho id ngoài lô → 422 `SPEND.REPLY_NOTE_NOT_IN_BATCH` | `spend-batch.service.spec.ts:282-301` · `throws SpendReplyNoteNotInBatchError...` | `spend-batch.service.ts:268-271`, `spend.errors.ts:81-86`, `spend.http-errors.ts:50-56,123` | PASS | — | `ROUTE_ERROR_CODES_REQUESTS_SPEND` đã cập nhật |
| §7.10 đã trả lời lần `SPEND` gần nhất → không đòi lại | `spend-batch.service.spec.ts:303-317` | `spend-ticket-reply.service.ts:25-30` | PASS | — | |
| §7.10 A–E (real PostgreSQL) | `spend-batch-reply-note.integration-spec.ts:153-404` | `spend-batch.service.ts:172-205`, `spend-submission.controller.ts:124-147` | — | viết, chưa chạy | |
| Trọng tâm 5 & §8.3 `replyNotes[].note` `"   "` / 1001 / 1000 & enum `REPLY_NOTE_REQUIRED` | `spend-submission-dto.spec.ts:13-83` | `spend-submission.dto.ts:50-56,142-144,160,192,204` | PASS | — | |
| §7.4, §7.10 `spendQueueList` thêm `ticketRef`, `replyNoteRequired` (1 batch query mỗi loại, không tăng complexity hàm `page`) | `spend-queue.service.spec.ts:30-109` | `spend-queue.service.ts:44-58,95,104-113` | PASS | — | DL-13 giữ nguyên `eslint-suppressions.json:308` |
| §7.4 `spendBatchItemList` thêm `ticketRef` qua `refsOf` | `spend-batch-view.service.spec.ts:102-133` | `spend-batch-view.service.ts:60,71` | PASS | — | DL-12 không sửa `spend/*.repo.ts` |

## Đột biến (SPEC §11.1 — chạy tay)

| Đột biến | Ca phải đỏ | Kết quả (lệnh · đỏ?) | Khôi phục + spec xanh lại |
| --- | --- | --- | --- |
| Chèn reply `HEAD_RESUBMISSION` ngay cả khi mục ra `STOPPED` (`spend-batch.service.ts:194`, bỏ `&& sent.result.outcome !== 'STOPPED'`) | §7.10 E | `$env:CI='true'; pnpm test -- src/modules/requests/spend-submission/spend-batch.service.spec.ts` → **ĐỎ** (`1 failed, 7 passed`: `E: pending C1 return with note but budget check returns BLOCKED -> STOPPED, MUST NOT insert reply`) | đã khôi phục, PASS `8/8` (`211/211` cả 25 spec) |
| Bỏ sắp `processingOrder` trong lô (`spend-batch.service.ts:113`, dùng thẳng `requestIds`) | §7.7 | `$env:CI='true'; pnpm test -- src/modules/requests/spend-submission/spend-batch.service.spec.ts` → **ĐỎ** (`1 failed, 7 passed`: `locks by sorted id, processes in processingOrder...` — `routeCalls` nhận `[REQ_3, REQ_4, REQ_1]` thay vì `[REQ_1, REQ_4, REQ_3]`) | đã khôi phục, PASS `8/8` (`211/211` cả 25 spec) |

## D-n & Bàn giao

- **D-n (kỹ thuật):**
  - Tách `SpendTicketReplyService` (`spend-submission/spend-ticket-reply.service.ts`) và `SpendBatchWriterService` (`spend-submission/spend-batch-writer.service.ts`) khỏi `SpendBatchService`/`SpendQueueService` để mỗi class giữ đúng trách nhiệm gọn và không đụng ngưỡng độ phức tạp/tham số/số dòng (`DL-13`: hàm `SpendQueueService.page` tách helper `queueTicketAndReplyFields` ngoài `page` nên không làm đổi count suppression tại `eslint-suppressions.json:308`).
  - Rút gọn helper fixture trong `spend-batch.service.spec.ts` (xuống 366 dòng) để đạt trần 400 dòng của `module-layout.gate-spec.ts` mà giữ nguyên mọi assertion.
  - Kiểm `test/integration/requests/spend-batches.integration-spec.ts` theo M-5: không có assertion đếm số query tuyệt đối trên `spendQueueList` / `spendBatchItemList`, nên giữ nguyên.
- **Bàn giao:** Không phát sinh thay đổi ngoài phạm vi gói (`requests.module.ts` và `openapi.json` là file gộp của cổng C; `spend-submission` hiện 22/25 file).
