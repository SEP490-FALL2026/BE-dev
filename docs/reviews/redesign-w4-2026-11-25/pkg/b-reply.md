# Gói B-REPLY — Ghi chú trả lời khi người xin gửi lại (`W4-09`, Phá vỡ `accessRequestResubmit`)

- **Trạng thái:** `xong-unit` (unit + bộ kiểm nhanh xanh; integration/http đã viết chưa chạy — chạy trên CI ở cổng B)
- **Nhánh:** `feat/redesign-w4-b-reply`
- **Sha nền:** `18c2c9ef` (`feat/redesign-w4-wave-b`)
- **Skill đã đọc:** `superpowers:executing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `ponytail` (full), `.claude/skills/be-quick-check/SKILL.md`

## Kết quả bộ kiểm nhanh & Unit

- `pnpm typecheck` → exit 0
- `pnpm exec eslint <16 file .ts đã sửa/thêm>` → exit 0
- `pnpm exec prettier --check <16 file .ts đã sửa/thêm>` → exit 0
- `pnpm arch:check` → exit 0
- `pnpm arch:capabilities --module requests` → exit 0 (`48 capabilities, 145 capability edges, cycles: none`; `request-reply` `L0`, `request-intake` `L2`)
- `pnpm rules:check` → exit 0 (`BE: 565 files, 4243 links, 0 errors`)
- `pnpm test:gates` → exit 0 (`17 passed, 17 total`; `346 passed, 346 total`)
- `pnpm openapi:export && git --no-pager diff --stat openapi.json` → exit 0 (`openapi.json | 91 ++++++---`, chỉ đổi ở `accessRequestResubmit` + `ResubmitAccessRequestDto`, 0 mã nội bộ)
- `$env:CI='true'; pnpm test -- src/modules/requests/request-intake src/modules/requests/request-submission src/modules/requests/access-request src/modules/requests/request-reply` → exit 0 (`17 passed, 17 total`; `232 passed, 232 total`)
- Integration/http **chỉ viết, chưa chạy** (chạy trên CI ở cổng B):
  - Mới: `test/integration/requests/request-resubmission-reply.integration-spec.ts`
  - Cập nhật: `test/http/requests/one-step-resubmission.http-spec.ts`, `need-checklist.integration-spec.ts`, `assessment-checklist.integration-spec.ts`, `request-status-notifications.integration-spec.ts`, `requester-became-head.integration-spec.ts`

## Đối chiếu tiêu chí

| Ca SPEC (§ / ca) | Test (file · tên) | file:line code | Unit | CI | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| §7.9 (2)–(3) đòi ghi chú cho 3 loại trả về | `request-resubmission.service.spec.ts:226-240` · `throws AccessRequestReplyNoteRequiredError...` | `request-resubmission.service.ts:67-90`, `request-reply.repo.ts:103-130` | PASS | — | |
| §7.9 B lưu reply + `replyId` audit (NEED/IT) | `request-resubmission.service.spec.ts:242-260` · `inserts reply linked to %s returnedStepId...` | `request-resubmission.service.ts:81-89,113-126,162-177` | PASS | — | |
| §7.9 D/E không chờ + không ghi chú; ghi chú tự nguyện | `request-resubmission.service.spec.ts:262-278` · `proceeds without...` & `stores voluntary...` | `request-resubmission.service.ts:75-89` | PASS | — | |
| Trọng tâm 5 + DTO rỗng / `{}` / `"   "` / 1000 / 1001 | `access-requests.controller.spec.ts:84-143` · `AccessRequestsController.resubmit` | `request-resubmission.dto.ts:4-8`, `access-requests.controller.ts:178-190` | PASS | — | |
| HTTP contract + 422 `ACCESS_REQUEST.REPLY_NOTE_REQUIRED` | `one-step-resubmission.http-spec.ts:106-129` | `access-request.errors.ts:217-222`, `access-request.http-errors.ts:56-62,199` | — | viết, chưa chạy | |
| §7.9 A, B, D, E, F, G (20 vòng Barrier) | `request-resubmission-reply.integration-spec.ts:65-209` | `request-resubmission.service.ts:45-90`, `request-reply.repo.ts:35-159` | — | viết, chưa chạy | |
| §9 Test cũ gửi lại sau _Trả về của người_ | `need-checklist:182,361`, `assessment-checklist:252,290`, `request-status-notifications:386,410`, `requester-became-head:301` | — | — | viết, chưa chạy | Chỉ thêm `replyNote` ở ca trả về của người |

## Đột biến (SPEC §11.1 — chạy tay)

| Đột biến | Ca phải đỏ | Kết quả (lệnh · đỏ?) | Khôi phục + spec xanh lại |
| --- | --- | --- | --- |
| Đòi `replyNote` cả khi không có lần _Trả về của người_ (`request-resubmission.service.ts:79`) | §7.9 D, E | `$env:CI='true'; pnpm test -- src/modules/requests/request-intake/request-resubmission.service.spec.ts` → **ĐỎ** (`11 failed, 10 passed`: ca `proceeds without inserting a reply... (§7.9 D/E)` + 10 ca cũ `BR-MF1-02`/`PL-2.2`/`PL-2.4` đều nhận `AccessRequestReplyNoteRequiredError`) | đã khôi phục, PASS `21/21` (`232/232` cả 17 spec) |

## D-n & Bàn giao

- **D-n:** Không phát sinh.
- **Bàn giao:**
  - Theo D-2 (`OVERNIGHT-DECISIONS-biz.md`): `request-intake` nay import `request-reply`, nên `request-reply` chuyển từ `L0 (cô lập)` sang `L0` (`48 capabilities, 145 edges`). Orchestrator cập nhật `src/modules/requests/README.md` (`L0`) và `scripts/verify/capability-graph.test.mjs:436` (bỏ `'request-reply'` khỏi test `L0 (cô lập)`) ở Cổng B.
  - Ghi chú thực tế schema: `SpendDecisionRepo.recordReturn` (`spend-decision.repo.ts:82-101`) đóng bước `SPEND_APPROVAL` (`CLOSED`) và ghi `approval_records` (`decision = 'RETURNED'`), không ghi `spend_decisions`. `RequestReplyRepo.humanReturnsOf` và `spendReturnsAwaitingReply` kiểm cả `approval_records.decision = 'RETURNED'` lẫn `spend_decisions.decision = 'RETURNED'` trên bước `SPEND_APPROVAL` `CLOSED`.
