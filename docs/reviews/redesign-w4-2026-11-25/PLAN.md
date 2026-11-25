# PLAN — Đợt 4 thiết kế lại: phiếu nhiều mục (25/11/2026, bản 2.1)

> **Bản 2.1 (25/11):** **Owner đã chốt:** OQ-W4-1 = A (1–6 mục) · OQ-W4-2 = A (`QĐ-116b` ở đợt 4, gói B6) · OQ-W4-3 = A (không mã) ·
> OQ-W4-4 = A (thông báo từng mục) · `NESTED_ARRAYS` `requestTicketSubmit#ticket.items`, `requestTicketGet#ticket.items` = duyệt
> ([OWNER-ANSWERS.md](OWNER-ANSWERS.md)).

> **Bản 2 (25/11):** áp REVIEW-SPEC-BIZ / REVIEW-SPEC-TECH (SPEC §15). Đổi: T1 viết spec đặc tả hành vi hiện có (unit + integration) cho ba service bị
> refactor, **B2a/B3/B4a chỉ bắt đầu khi T1 ở `int`**; tách B2 → B2a/B2b, B4 → B4a/B4b, B5 → B5a/B5b; `biz` làm B1 → B5a → B6 trước để không chờ T1;
> `step-routing/` và hàng đợi trình thuộc `biz`; registry collection đúng file w4; bộ kiểm nhanh thêm prettier, `arch:routes`/`arch:docs:check`, tự kiểm drift.

Spec: [SPEC.md](SPEC.md). Trạng thái: **Owner đã duyệt — bản 2.1**; chỉ code sau khi đợt 3 vào `dev` + có `DELTA-W3-FINAL.md`. Quy trình: [`docs/guides/quy-trinh-code-ai.md`](../../guides/quy-trinh-code-ai.md). Đường dẫn tính từ gốc repo; `src/modules/` viết tắt `m/`. Mỗi file
`*.ts` có logic mới kèm spec **cùng thư mục, cùng tên** — ghi `(+spec)`. `*` = file chung, chỉ thêm dòng.

## Nền và nhánh

- **Điều kiện bắt đầu — cả ba phải đúng, thiếu ⟹ không tách nhánh, báo Owner:**
  1. Đợt 1, 2 ở `dev` (như CODE-PROMPT đợt 3 §1).
  2. **Đợt 3 ở `dev`** (squash ⟹ kiểm commit + file, RT-14): `git -C <repo> --no-pager log --oneline origin/dev --grep "redesign W3\|redesign-w3" | head` có commit
     squash B2 và B3 của đợt 3; **và** `git -C <repo> --no-pager ls-tree --name-only origin/dev src/modules/catalog/public/license-lot.api.ts
     src/modules/catalog/public/seat-ledger.api.ts` in đủ 2 dòng; **và** `ls-tree origin/dev prisma/migrations/ | tail -3` có migration `202612030…` cuối của đợt 3
     (tên có thể đổi lúc merge). Lệch còn lại giữa `int/redesign-w3` và `dev` ghi vào `DELTA-W3-FINAL.md`, **không** dừng.
  3. `DELTA-W3-FINAL.md` (SPEC §10, gồm dòng bắt buộc về reprice/E5) đã viết và đã vào `dev` cùng SPEC/PLAN bản đã duyệt. Người viết: điều phối (Opus).
- **Làn `biz` (Owner, agent Neon):** làm **thẳng trên** `int/redesign-w4` (Owner tạo từ `dev`); `git pull --ff-only` trước mỗi gói; **push ngay sau mỗi
  commit** (bị từ chối ⟹ `git pull --rebase`, chỉ commit chưa push của chính mình).
- **Làn `tech` (Bảo, có Docker):** nhánh `feat/redesign-w4-tech` tách từ `origin/dev`. **Kéo xuống** `git fetch origin && git merge origin/int/redesign-w4`
  trước mỗi gói và bắt buộc trước gói có _Phụ thuộc_ "… ở int".
- **Đẩy lên:** gói `tech` xong và xanh ⟹ Owner **hoặc** Bảo merge commit cuối gói vào `int/redesign-w4` ngay (đợt 4 là **một** PR). **T1 đẩy sớm nhất có thể**
  — B2a/B3/B4a của `biz` chờ nó.
- **Trong một làn:** tuần tự từng gói, không song song, không worktree.
- **Migration:** dải **`20261210…`**, **chỉ làn `biz`** (M1 ở B1, M2 ở B5a). SQL sinh bằng `prisma migrate diff` (SPEC §5 _Cách viết_) rồi thêm tay CHECK/trigger.
  Không sửa migration đã đẩy lên `int`; bắt buộc sửa ⟹ migration mới số cao hơn, idempotent.
- **Hai làn chạy song song, không chờ:** `biz` B1 → B5a → B6 (không cần T1), `tech` T1 ngay. Chỗ một làn cần việc của làn kia chỉ ở cột _Phụ thuộc_; chưa có ⟹ việc
  lấp (bảng _Cửa_).

## Hai làn không sửa chung file

- **Làn `biz`:** mọi luật và mọi ghi: `prisma/**`, migration, `src/infrastructure/database/database-role-judgement.ts`, `m/requests/request-ticket/**`,
  `m/requests/request-reply/**`, `m/requests/request-ticket-submission/**`, `m/requests/request-intake/**` (trừ spec T1 tạo — bàn giao), `m/requests/need-decision/**`
  (như trên), `m/requests/spend-approval/**` (như trên), `m/requests/spend-submission/**` (gồm `spend-queue`), `m/requests/spend/spend-submission.dto.ts`,
  `spend.errors.ts`\*, `spend.http-errors.ts`\*, `m/requests/withdraw/**`, `m/requests/access-request/access-request.repo.ts`, `access-request.types.ts`,
  `access-request-record.mapper.ts`, `access-request.errors.ts`\*, `access-request.http-errors.ts`\*, `withdrawal.policy.ts`, `m/requests/reassignment/**`,
  `m/requests/step-routing/**`, `m/requests/request-submission/access-requests.controller.ts` (+spec), `docs/rules/database-business.md`; integration/http spec
  của gói mình (viết).
- **Làn `tech`:** mọi đường **đọc/hiện** còn lại: `m/requests/request-ticket-view/**`, `m/requests/access-request/access-request.dto.ts`, `m/requests/request-view/**`,
  `m/requests/my-requests/**`, `m/requests/need-decision-queue/**`, `m/requests/spend-approval-view/**`; harness `test/support/request-ticket-harness.ts`; spec đặc tả
  T1; spec mobile `test/integration/requests/mobile-*.integration-spec.ts`, `test/integration/identity-access/mobile-session-roles.integration-spec.ts`; seed
  `src/cli/seed/**`, `docs/guides/seed.md`; `m/requests/README.md`; chạy integration/http trên Docker và **chỉ sửa test/fixture** (`FIX-TEST-tech.md`).
- **File chung, chỉ thêm dòng, gộp tay khi merge:** `openapi.json`, `docs/generated/*` (sinh lại sau merge, không sửa tay), `test/support/openapi-example-manifest.ts`,
  `openapi-example-route-codes-requests.ts`, `…-requests-spend.ts`, `api-coverage-manifest.ts`, `m/requests/requests.module.ts`,
  `test/support/api-collection-registry-nested-w4.ts`, `api-collection-registry-events-w4.ts` (B2b tạo, nối vào `api-collection-registry-nested.ts`/`-events.ts`;
  T2 thêm key — Owner **đã duyệt**; gate vẫn từ chối ⟹ dừng hỏi), `prisma/models/organization.prisma` (chỉ quan hệ ngược, chỉ `biz`).
- Mọi file khác: **một làn tại một thời điểm**; đổi làn chỉ theo bảng _Tự kiểm chéo_. Gói cần file của làn kia ngoài bảng ⟹ dừng, ghi _Bàn giao_ ở PROGRESS.

### Tự kiểm chéo (file xuất hiện ở nhiều gói)

| File (`m/` = `src/modules/`)                                                                                      | Gói                          | Làn                                         |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------- |
| **mới** `m/requests/request-intake/access-request.service.spec.ts`, `m/requests/need-decision/need-decision.service.spec.ts`, `m/requests/spend-approval/spend-decision.service.spec.ts` | T1 → B2a, B3, B4a | **tech T1 → biz** (đổi tay một lần, sau khi T1 ở `int`; `biz` chỉ **thêm** ca, không đổi kỳ vọng cũ) |
| `prisma/models/requests.prisma`, `organization.prisma`\*, `database-role-judgement.ts`                              | B1, B5a                      | biz                                         |
| `m/requests/requests.module.ts`\*                                                                                   | B2b, B3, B4a, B6, T2         | chung, chỉ thêm dòng                        |
| manifest OpenAPI\*, registry collection w4\*                                                                         | B2b–B6, T2, T3               | chung, chỉ thêm dòng                        |
| `m/requests/access-request/access-request.repo.ts`, `.types.ts`, `access-request-record.mapper.ts`                 | B1                           | biz (T2/T3 chỉ **đọc** `ticket`)            |
| `m/requests/request-ticket/request-ticket.repo.ts`, `.dto.ts`, `.mapper.ts`                                        | B1 → B5a, B2b, B3, B4a, B6   | biz (T2 chỉ gọi `view`)                     |
| `m/requests/request-ticket/request-ticket.policy.ts` (+spec), `.errors.ts`, `.http-errors.ts`                      | B1 → B2b, B4b                | biz                                         |
| `m/requests/request-reply/**`                                                                                      | B5a → B5b                    | biz (T3 chỉ gọi `latestOf`)                 |
| `m/requests/request-intake/access-request.service.ts`, `access-request-submission.mapper.ts` (+spec)               | B2a → B2b                    | biz                                         |
| `m/requests/request-intake/request-resubmission.service.ts`, `request-resubmission.dto.ts`; `request-submission/access-requests.controller.ts` (+spec) | B5a | biz                          |
| `m/requests/spend-submission/spend-batch.service.ts`, `m/requests/spend/spend-submission.dto.ts`                   | B4b → B5b                    | biz                                         |
| `m/requests/spend-approval/spend-batch-decision.service.ts`                                                        | B4a                          | biz                                         |
| `m/requests/access-request/access-request.dto.ts`, `request-view/access-request.mapper.ts`, `access-request-query.service.ts` | T2 → T3            | tech                                        |
| `m/requests/spend-approval-view/spend-approval.dto.ts`, `spend-approval.mapper.ts`, `spend-approval-queue.service.ts` | T2                         | tech                                        |
| integration/http spec do `biz` viết (`test/integration/requests/request-ticket-*`, `request-resubmission-reply`, `spend-batch-*`, …) | B1–B6 → T4 | biz Bx → tech T4 (chỉ sửa test/fixture) |
| `test/support/request-ticket-harness.ts`                                                                           | T1 → (B2b+ dùng)             | tech (biz chỉ import sau khi T1 ở int)      |

Kiểm: không file nào bị hai làn sửa **cùng lúc**. Hai chiều đổi tay: `tech T1 → biz` (spec đặc tả, một lần, sớm) và `biz Bx → tech T4` (spec test, sau khi Bx ở
`int`). Làn `tech` **không** sửa `m/requests/spend-submission/**`, `step-routing/**`, `reassignment/**`.

## Cửa giữa hai làn

| Cửa | Khi                                      | Làm                                                                                                                  |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| C0  | T1 ở `int` (spec đặc tả xanh trên Docker) | `biz` được bắt đầu B2a, B3, B4a (refactor). Chưa có ⟹ `biz` làm B1, B5a, B6                                          |
| C1  | `biz` xong B2b (gửi phiếu ở `int`)       | `tech` chạy Docker cho spec B1–B2b, B5a, B6 (T4), seed phần gửi phiếu (T5); từ đây mỗi gói `biz` ở `int` ⟹ T4 chạy ngay |
| C2  | cả hai làn xong B7, T6                   | Owner cắt `pr/redesign-w4` tại `int`, mở **PR → `dev`** (CI full xanh + review Opus)                                  |

**Ước lượng chặn và việc lấp** (L ≈ 2 M, S ≈ ½ M; `biz` ≈ 7 M, `tech` ≈ 4,5 M):

| Có thể bị chặn                  | Khi nào                                    | Khả năng       | Việc lấp                                                                              |
| ------------------------------- | ------------------------------------------ | -------------- | ------------------------------------------------------------------------------------- |
| `biz` B2a chờ T1 ở `int` (C0)   | sau B1 + B5a + B6 (≈ 2,5 M), T1 ≈ 1,5 M    | thấp           | —                                                                                     |
| `tech` T2 chờ B1 ở `int`        | sau T1 (≈ 1,5 M), B1 ≈ 1 M                 | rất thấp       | —                                                                                     |
| `tech` T3 chờ B5a ở `int`       | sau T2 (≈ 2,5 M), B5a xong ≈ 2 M           | rất thấp       | —                                                                                     |
| `tech` T4 chờ B2b ở `int` (C1)  | `tech` ≈ 3 M, B2b xong ≈ 4 M               | trung bình     | T4 cho B1, B5a, B6 phần không cần route phiếu; chạy lại integration đợt 3 trên Docker |

Thứ tự trong làn: **biz** B1 → B5a → B6 → (C0) B2a → B2b → B3 → B4a → B4b → B5b → B7; **tech** T1 → T2 → T3 → T4 (lặp theo gói biz) → T5 → T6.

## Bộ kiểm nhanh (mỗi gói, mỗi commit)

```text
pnpm typecheck
pnpm lint                      # chậm: pnpm exec eslint <file…>
pnpm exec prettier --check <mọi file đã sửa>
pnpm arch:check
pnpm arch:capabilities --module requests
pnpm rules:check               # + pnpm rules:format khi sửa docs/rules, README module
pnpm test:gates
pnpm openapi:export && git --no-pager diff --stat openapi.json
pnpm arch:routes && pnpm arch:docs:check   # commit thêm/đổi route: docs/generated/* sinh lại cùng commit
CI=true pnpm test -- <mọi *.spec.ts đã chạm/thêm>
pnpm prisma:validate && pnpm prisma:generate   # gói có prisma/
# gói có migration: sinh lại `pnpm exec prisma migrate diff --from-schema <schema trước> --to-schema prisma --script`, so với phần sinh trong migration —
# chỉ được khác ở CHECK/trigger/comment thêm tay (CI `prisma migrate diff --exit-code` là kiểm cuối)
```

- Không chạy `pnpm check`, `test:http`, `test:integration`, `test:e2e`, seed, Docker, migration ở máy — **trừ** làn `tech` (Docker, gói T1/T4, chỉ sửa test/fixture).
  Integration/http mới **viết** ở gói `biz`, trạng thái `viết, chưa chạy` tới khi T4 chạy xanh.
- Luật mới: unit đỏ trước, rồi xanh. Mỗi bảng ca của SPEC ⟹ một `it.each`; ca diệt đột biến SPEC §11.1 chạy tay một lần, ghi PROGRESS.
- Test cũ khẳng định hành vi cũ (gửi lại sau _Trả về của người_ không thân): unit của chính luật sửa ngay (ghi tên test + mục SPEC); http/integration ⟹ `FIX-TEST-<làn>.md`.
- Trần: 500 dòng/file, 25 file/thư mục (`access-request/`, `group-request/`, `spend/`, `assessment/` đã đủ — chỉ sửa), `complexity` 12, hàm 60 dòng.

## Gói

| #   | Gói                                                                                                   | Mục SPEC                     | Cỡ | Làn  | Phụ thuộc                                  |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------------- | -- | ---- | ------------------------------------------ |
| B1  | M1, model, lõi `request-ticket/` (repo + `view`, policy, lỗi, dto, mapper), `ticket` trên `AccessRequestRecord` | W4-01, phần luật W4-02/W4-04 | M  | biz  | điều kiện                         |
| B5a | M2, `request-reply/`, gửi lại: ghi chú bắt buộc sau _Trả về của người_; `latestReply` trong `view`    | W4-09, W4-11 (phần repo)     | M  | biz  | B1                                         |
| B6  | Rút cả phiếu; trưởng phòng rút ở hàng đợi trình                                       | W4-08, W4-12                 | S  | biz  | B5a                                        |
| B2a | Refactor gửi Request đơn: kiểm cấp người/phòng / kiểm mục / ghi / định tuyến (enabler, giữ hành vi)   | W4-02 (enabler)              | S  | biz  | B6 + **T1 ở int (C0)**                     |
| B2b | Route gửi phiếu, kiểm trước từng mục, hai pha, phiếu trưởng phòng theo thứ tự, registry w4            | W4-02, W4-03                 | M  | biz  | B2a                                        |
| B3  | Quyết nhu cầu nhiều mục (`decide(…, judged?)`, route, kết quả từng mục)                               | W4-05                        | M  | biz  | B2b + **T1 ở int**                         |
| B4a | Quyết chi nhiều mục cùng phiếu; `spend-item-outcome.policy` dùng chung với lô; IT phụ trách (test)     | W4-06, W4-14 (IT)            | M  | biz  | B3 + **T1 ở int**                          |
| B4b | Thứ tự mục cùng phiếu ở lô (mảng trả về theo thân) và khi chuyển một bước                              | W4-07, W4-14 (thứ tự)        | S  | biz  | B4a                                        |
| B5b | Trình lại kèm ghi chú; `ticketRef`/`replyNoteRequired` ở hàng đợi trình và mục lô                      | W4-10, W4-04 (hàng đợi)      | S  | biz  | B4b                                        |
| B7  | Chốt `biz`: E5 vào bảng khóa, `FIX-TEST-biz.md`, CI                                                   | W4-16                        | S  | biz  | B5b ⟹ **C2**                               |
| T1  | Harness phiếu + spec đặc tả hành vi hiện có (unit 3 service + integration Request đơn, lô chi) chạy Docker | SPEC §11.1 dòng _nền_, LUẬT CỨNG 2 | M | tech | điều kiện ⟹ **C0**                  |
| T2  | Route xem phiếu, `ticketRef` trên 4 operation đọc, key registry `requestTicketGet#ticket.items`        | W4-04                        | M  | tech | T1 + **B1 ở int**                          |
| T3  | `latestReply` trên `accessRequestGet`                                                                 | W4-11                        | S  | tech | T2 + **B5a ở int**                         |
| T4  | Docker: chạy integration/http của từng gói `biz`, sửa test/fixture; mobile 4 spec; ca đồng thời       | W4-13, SPEC §11              | M  | tech | lặp theo gói `biz` ở int (đủ khi **C1**)   |
| T5  | Seed phiếu demo                                                                                       | W4-15                        | S  | tech | **B2b, B3, B5a ở int**                     |
| T6  | Chốt `tech`: generator, module card, `FIX-TEST-tech.md`, CI                                           | W4-16                        | S  | tech | T3, T4, T5 + B5b ở int ⟹ **C2**            |

Migration: M1 (B1), M2 (B5a) — làn `biz`.

---

## Chi tiết gói

Mỗi gói: **File**, **Làm**, **Kiểm** (ngoài bộ kiểm nhanh), **Xong khi**. Mọi gói đổi contract: `openapi.json` + manifest (`*`) + `docs/generated/*`; mô tả
OpenAPI không mã nội bộ.

### B1 — biz · M

- **File:** `prisma/models/requests.prisma`, `prisma/models/organization.prisma`\*; `prisma/migrations/20261210000000_w4_request_tickets/migration.sql`;
  `src/infrastructure/database/database-role-judgement.ts` (`request_tickets`); **mới** `m/requests/request-ticket/request-ticket.repo.ts`, `request-ticket.types.ts`,
  `request-ticket.policy.ts` (+spec), `request-ticket.errors.ts`, `request-ticket.http-errors.ts` (+spec), `request-ticket.dto.ts`, `request-ticket.mapper.ts` (+spec);
  `m/requests/access-request/access-request.repo.ts`, `access-request.types.ts`, `access-request-record.mapper.ts` (+spec nếu có);
  `test/integration/requests/request-ticket-schema.integration-spec.ts`.
- **Làm:** SPEC §5 M1 + §7.1. Policy (thuần): `MAX_TICKET_ITEMS = 6`, `findDuplicates`, GH-2 cộng dồn, `ticketStatusOf` (`ENDED_STATES`), `orderByPosition`. Lớp lỗi
  + ánh xạ HTTP + `*_ERROR_EXAMPLES`. DTO: `ticketSchema` (`items` `.max(6)`), `ticketRefSchema`, kết quả từng mục + enum `reason` đóng (SPEC §8.3). `view(ticketId)`
  một câu (chưa có `latestReply` — thêm ở B5a).
- **Kiểm:** `it.each` trạng thái suy ra, trùng, GH-2 cộng dồn (SPEC §7.2 ca G, H), thứ tự; tự kiểm drift.
- **Xong khi:** tiêu chí §7.1 có integration (viết); unit xanh; Request đơn đọc ra `ticket: null`.

### B5a — biz · M

- **File:** `prisma/models/requests.prisma`, `organization.prisma`\*; `prisma/migrations/20261210000100_w4_access_request_replies/migration.sql`;
  `database-role-judgement.ts` (`access_request_replies`); **mới** `m/requests/request-reply/request-reply.repo.ts`, `request-reply.policy.ts` (+spec),
  `request-reply.types.ts`; `m/requests/request-intake/request-resubmission.service.ts` (+spec), **mới** `request-resubmission.dto.ts`;
  `m/requests/request-submission/access-requests.controller.ts` (+spec); `m/requests/access-request/access-request.errors.ts`\*, `access-request.http-errors.ts`\*
  (`REPLY_NOTE_REQUIRED`); `m/requests/request-ticket/request-ticket.repo.ts` (`latestReply` trong `view`); manifest\*;
  `test/integration/requests/request-resubmission-reply.integration-spec.ts`, `request-reply-schema.integration-spec.ts`;
  `test/http/requests/one-step-resubmission.http-spec.ts`.
- **Làm:** SPEC §5 M2, §7.9, §7.11 (phần repo). `request-reply.policy.ts`: bước _Trả về của người_ đang chờ trả lời (ba loại bước). `request-reply.repo.ts`: `insert`,
  `latestOf`, `latestOfMany`. Summary `accessRequestResubmit` bỏ "one-step".
- **Kiểm:** `it.each` policy ba loại bước + ca "đã trả lời rồi bị chặn lại" (SPEC §7.9 ca E); unit gửi lại (thiếu ghi chú khi có lần chờ ⟹ 422 mã riêng; không có lần
  chờ ⟹ như cũ). Test gửi lại Request chỉ bị chặn **không đổi kỳ vọng**.
- **Xong khi:** 7 ca §7.9 có test.

### B6 — biz · S

- **File:** **mới** `m/requests/withdraw/ticket-withdrawals.controller.ts`, `ticket-withdrawal.service.ts` (+spec); `m/requests/access-request/withdrawal.policy.ts` (+spec); `m/requests/requests.module.ts`\*; manifest\*;
  `test/integration/requests/request-ticket-withdrawal.integration-spec.ts`, `head-withdraw-submission-queue.integration-spec.ts`.
- **Làm:** SPEC §7.8 (A–G), §7.12 (đúng `NOT_SUBMITTED`, ca âm). OQ-W4-2 = A (Owner chốt).
- **Xong khi:** ca §7.8 và §7.12 có test.

### B2a — biz · S (sau C0)

- **File:** `m/requests/request-intake/access-request.service.ts`, `access-request.service.spec.ts` (của T1 — chỉ thêm ca), `access-request-submission.mapper.ts` (+spec).
- **Làm:** liệt kê mọi lần kiểm/throw của `submit`/`submitWithin` (`mayRequest`, `lockDraft`, `lockEligible`, `limits.lock`, `assess` — tách phần người/phòng,
  `requireNotHeld`, `termRefusal`, `limits.requireForOne`, `repo.insert`, `auditSubmitted`, `spendRouting.start`) vào `Kiểm giữ:`; tách bốn phần (SPEC §7.2
  _Refactor_); `newRequestOf` nhận `ticket?`. Không đổi hành vi.
- **Xong khi:** spec đặc tả T1 (unit) xanh **không đổi kỳ vọng**; T4 chạy lại integration đặc tả xanh trên Docker sau khi B2a ở `int`.

### B2b — biz · M

- **File:** **mới** `m/requests/request-ticket-submission/request-tickets.controller.ts`, `request-ticket-submission.service.ts` (+spec),
  `request-ticket-precheck.service.ts` (+spec); `m/requests/requests.module.ts`\*; manifest\*; **mới** `test/support/api-collection-registry-nested-w4.ts`,
  `api-collection-registry-events-w4.ts` (+ nối `api-collection-registry-nested.ts`, `-events.ts`); `test/integration/requests/request-ticket-submit.integration-spec.ts`,
  `request-ticket-head.integration-spec.ts`; `test/http/requests/request-tickets.http-spec.ts`.
- **Làm:** SPEC §7.2, §7.3. Lỗi cấp phiếu một lần trước vòng mục; vòng mục chỉ bắt danh sách lớp lỗi của gói; hai pha ghi; comment đầu service ghi thứ tự khóa (§6.2,
  E5). Key registry `requestTicketSubmit#ticket.items`. OQ-W4-1 = A (1–6 mục, không lỗi tối thiểu).
- **Kiểm:** `it.each` precheck ca A–M, K2 (phần không cần DB).
- **Xong khi:** 14 ca §7.2 + 7 ca §7.3 + ca đồng thời §11.3 #1, #4 có test (viết).

### B3 — biz · M

- **File:** `m/requests/need-decision/need-decision.service.ts` (tham số `judged?`), `need-decision.service.spec.ts` (của T1 — chỉ thêm ca); **mới**
  `ticket-need-decisions.controller.ts`, `ticket-need-decision.service.ts` (+spec); `m/requests/requests.module.ts`\*; manifest\*;
  `test/integration/requests/request-ticket-need-decision.integration-spec.ts`.
- **Làm:** SPEC §7.5. `ALREADY_DECIDED` dựng từ `needSteps` của record (không repo mới). Giữ mọi lần kiểm (`lockDecidable`: `NOT_FOUND`, `GROUP_USES_LINES`,
  `checkNeedDecision`).
- **Xong khi:** 8 ca §7.5 + ca đồng thời §11.3 #2 có test; spec T1 xanh không đổi kỳ vọng; đột biến "bỏ sắp position" đỏ.

### B4a — biz · M

- **File:** **mới** `m/requests/spend-approval/spend-item-outcome.policy.ts` (+spec), `ticket-spend-decisions.controller.ts`, `ticket-spend-decision.service.ts` (+spec);
  `spend-batch-decision.service.ts`; `spend-decision.service.spec.ts` (của T1 — chỉ thêm ca); `m/requests/requests.module.ts`\*; manifest\*;
  `test/integration/requests/request-ticket-spend-decision.integration-spec.ts`, `request-ticket-grant-in-charge.integration-spec.ts`.
- **Làm:** SPEC §7.6, §7.14 (IT). Liệt kê mọi nhánh `catch` của `decideOne` (`TransientDatabaseError`, `AccessRequestNotFoundError`, `AccessRequestGroupUsesLinesError`,
  `NO_SPEND_STEP`, `SpendDecisionRefusedError`, `BudgetCommitment*`) và cách `BOUNCED` ra `RECHECKED_RETURNED_TO_HEAD` vào `Kiểm giữ:`; policy thuần, lô giữ.
- **Xong khi:** 7 ca §7.6 + ca đồng thời §11.3 #3 + ca IT1/IT2 có test; `spend-batch-decision.service.spec.ts` xanh **không đổi kỳ vọng**.

### B4b — biz · S

- **File:** **mới** `m/requests/spend-submission/spend-batch-order.policy.ts` (+spec); `spend-batch.service.ts`; `m/requests/step-routing/step-reassignment.repo.ts`
  (đọc `ticket` vào `ReassignableRequest`); `m/requests/reassignment/step-reassignment.service.ts` và/hoặc `one-step-conversion.service.ts`;
  `test/integration/requests/spend-batch-ticket-order.integration-spec.ts`, `request-ticket-head-conversion.integration-spec.ts`.
- **Làm:** SPEC §7.7: thứ tự xử lý theo phiếu; **mọi mảng** (`results`, `batches.create.items`, `recorder.submitted`) sắp lại về thứ tự thân.
- **Xong khi:** `it.each` thứ tự; integration (a) gồm khẳng định audit khớp cặp, (b), chuyển một bước R11/R12 (viết); test lô cũ xanh không đổi kỳ vọng.

### B5b — biz · S

- **File:** `m/requests/spend-submission/spend-batch.service.ts`, `spend-queue.service.ts`, `spend-batch-view.service.ts` (mục lô); `m/requests/spend/spend-submission.dto.ts`
  (thân `replyNotes`, `stopReason`, mục hàng đợi `ticketRef`/`replyNoteRequired`, mục lô `ticketRef`), `spend.errors.ts`\*, `spend.http-errors.ts`\*; manifest\*;
  `test/integration/requests/spend-batch-reply-note.integration-spec.ts`.
- **Làm:** SPEC §7.10 (chỉ lưu khi mục đi tiếp), §7.4 dòng hàng đợi trình (RB-5). Dùng `request-reply.policy.ts` của B5a.
- **Xong khi:** 5 ca §7.10 có test.

### B7 — biz · S

- **File:** `docs/rules/database-business.md` (ngoại lệ E5 dưới E4, viết trên bảng đợt 3 đã gộp — SPEC §6.2); `docs/reviews/redesign-w4-2026-11-25/FIX-TEST-biz.md`.
- **Xong khi:** `pnpm rules:format && pnpm rules:check` xanh; CI full trên `int/redesign-w4` ghi `PROGRESS-biz.md`; rồi C2.

### T1 — tech · M (bắt đầu ngay; đẩy sớm — C0)

- **File:** **mới** `test/support/request-ticket-harness.ts` (tổ chức đủ QĐ-118 — SPEC §11.2); **mới** spec đặc tả (unit, mock repo, khẳng định hành vi **hiện có**):
  `m/requests/request-intake/access-request.service.spec.ts` (gửi Request đơn: mọi mã từ chối `ALREADY_HOLDS_ACCESS`, `TERM_*`, `OPEN_REQUEST_EXISTS`,
  `OPEN_LIMIT_REACHED`, `PLAN_BOUND_TO_DEVICE`, `NO_DEPARTMENT`, `FINANCE.SETUP_INCOMPLETE`, `SUPER_ADMIN_CANNOT_REQUEST`; thứ tự gọi lock/assess/insert/route),
  `m/requests/need-decision/need-decision.service.spec.ts` (`NOT_FOUND`, `GROUP_USES_LINES`, `OWN_REQUEST`, `NOT_THE_ASSIGNEE`, `STEP_NOT_PENDING`, chấm rồi ghi
  checklist một bản), `m/requests/spend-approval/spend-decision.service.spec.ts` (`DECIDED`, `BOUNCED` `to` HEAD/REQUESTER, `NO_SPEND_STEP`); **mới**
  `test/integration/requests/request-single-characterization.integration-spec.ts` (gửi Request đơn mọi mã trên; Request một bước trưởng phòng ba kết cục ngân sách;
  quyết lô chi `RETRYABLE`, `ALREADY_DECIDED`, `NO_SPEND_STEP`, `RECHECKED_RETURNED_TO_HEAD`, `GROUP_NEEDS_LINES`, `COMMITMENT_NOT_HOLDABLE`; gửi lại Request chỉ bị chặn).
- **Làm:** unit xanh bằng bộ kiểm nhanh; integration xanh trên Docker trên `dev` hiện tại. Không chạm `src` ngoài file spec mới.
- **Xong khi:** unit + integration xanh (ghi lệnh + số pass vào `PROGRESS-tech.md`); đã merge vào `int` (C0).

### T2 — tech · M (sau khi kéo B1)

- **File:** **mới** `m/requests/request-ticket-view/request-ticket-view.controller.ts`, `request-ticket-view.service.ts` (+spec); `m/requests/access-request/access-request.dto.ts`;
  `m/requests/request-view/access-request.mapper.ts`, `access-request-query.service.ts`; `m/requests/my-requests/my-requests.dto.ts`, `my-requests.mapper.ts`,
  `my-requests.repo.ts`; `m/requests/need-decision-queue/need-decision-queue.dto.ts`, `.mapper.ts`, `.repo.ts`; `m/requests/spend-approval-view/spend-approval.dto.ts`,
  `spend-approval.mapper.ts`, `spend-approval-queue.service.ts`; `m/requests/requests.module.ts`\*; manifest\*; registry w4\* (`requestTicketGet#ticket.items`);
  `test/integration/requests/request-ticket-view.integration-spec.ts`, `test/http/requests/request-ticket-get.http-spec.ts`.
- **Làm:** SPEC §7.4 (route GET dùng `RequestTicketRepo.view` + `ticketSchema` của B1; `ticketRef` đọc từ `record.ticket`, không câu riêng).
- **Xong khi:** 4 tiêu chí §7.4 xanh trên Docker; gate collection xanh hoặc dừng hỏi.

### T3 — tech · S (sau khi kéo B5a)

- **File:** `m/requests/access-request/access-request.dto.ts`, `m/requests/request-view/access-request.mapper.ts`, `access-request-query.service.ts`;
  `test/http/requests/access-request-get.http-spec.ts` (có từ đợt 3 P16b; chưa có ⟹ tạo).
- **Làm:** SPEC §7.11 qua `RequestReplyRepo.latestOf`.
- **Xong khi:** tiêu chí §7.11 phần `accessRequestGet` xanh trên Docker.

### T4 — tech · M (lặp theo gói `biz`)

- **File:** spec integration/http của gói `biz` đã ở `int` (chỉ test/fixture); 4 spec mobile (SPEC §7.14); `docs/reviews/redesign-w4-2026-11-25/FIX-TEST-tech.md`.
- **Làm:** mỗi gói `biz` vào `int` ⟹ kéo về, chạy đúng spec của gói (gồm lại spec đặc tả T1 sau B2a/B3/B4a); đỏ vì fixture ⟹ sửa test/fixture; đỏ vì **logic** ⟹ không
  sửa `src`, ghi _Bàn giao_ + báo `biz`. Ca đồng thời §11.3 chạy lặp 20.
- **Xong khi:** mọi spec của B1–B5b xanh trên Docker hoặc có dòng _Bàn giao_ logic; mobile 4 ca xanh.

### T5 — tech · S

- **File:** `src/cli/seed/steps/request-actions.ts` (hoặc step mới `request-tickets.steps.ts` (+spec)), `src/cli/seed/fixture/shared-demo-v4/requests.ts`, `docs/guides/seed.md`.
- **Làm:** qua API: phiếu `E1` Figma + Miro + Notion, `H1` duyệt hai mục một lần, mục ba trả về rồi gửi lại kèm ghi chú; phiếu `H1` ba mục, một mục bị chặn ngân sách
  (ghi số ngân sách seed vào `seed.md`).
- **Xong khi:** spec unit seed xanh; `seed check` liệt kê bước mới (Docker).

### T6 — tech · S

- **File:** `pnpm arch:graph`, `pnpm arch:routes`, `pnpm openapi:export` (sinh `docs/generated/*`, `openapi.json`); `m/requests/README.md` (mục phiếu, ghi chú trả
  lời, theo _Bàn giao_ của `biz`); `docs/reviews/redesign-w4-2026-11-25/FIX-TEST-tech.md`.
- **Xong khi:** CI full trên `feat/redesign-w4-tech` đã merge vào `int` ghi `PROGRESS-tech.md`; rồi C2.

## Rủi ro

| Rủi ro                                                                       | Giảm                                                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Refactor `submitWithin`/`NeedDecisionService`/ánh xạ lô làm mất một lần kiểm | T1 viết spec đặc tả **trước** (C0 chặn B2a/B3/B4a); LUẬT CỨNG 2 (`Kiểm giữ:`); spec không đổi kỳ vọng                |
| Ghi chú trả lời chặn luồng gửi lại thật (bị chặn, kiểm lại)                  | luật chỉ sau _Trả về của người_ chưa trả lời; không unique DB; ca §7.9 D/E, §7.10 E                                    |
| Đợt 3 đổi file đợt 4 chạm (DTO đọc, `requests.prisma`, bảng khóa, reprice)   | không tách nhánh trước khi đợt 3 vào `dev`; `DELTA-W3-FINAL.md` bắt buộc (gồm dòng reprice/E5); lệch đổi luật ⟹ dừng   |
| Integration viết mù đỏ hàng loạt ở CI (bài học đợt 2)                        | `tech` chạy Docker từng gói; `biz` ghi `xong-unit` tới khi T4 xanh                                                    |
| Fixture thiếu IT phụ trách / Cost Center ⟹ 403/`undefined`                   | harness T1; SPEC §11.2 là checklist review                                                                            |
| Drift Prisma ↔ migration viết tay                                            | sinh bằng `prisma migrate diff`, tự so trước commit; CI `--exit-code`                                                 |
| CI `quality` đỏ vì prettier / `docs/generated` cũ                            | `prettier --check` + `arch:routes`/`arch:docs:check` trong bộ kiểm nhanh, sinh cùng commit thêm route                 |
| Gate collection từ chối mục `NESTED_ARRAYS` w4                               | dừng hỏi Owner; phương án subresource                                                                                 |
| Tracker ghi `xong` quá tay                                                   | LUẬT CỨNG 6: bảng ca → test → `file:line` trong PROGRESS trước khi ghi `xong`                                         |
