# PLAN — Đợt 4 thiết kế lại: phiếu nhiều mục (25/11/2026, bản 1)

Spec: [SPEC.md](SPEC.md). Trạng thái: Proposed bản 1 — chờ Owner trả lời OQ-W4-1 → OQ-W4-4 ([SPEC §12](SPEC.md#12-câu-hỏi-owner-oq-w4-n)) và duyệt.
Quy trình: [`docs/guides/quy-trinh-code-ai.md`](../../guides/quy-trinh-code-ai.md). Đường dẫn tính từ gốc repo; `src/modules/` viết tắt `m/`. Mỗi file
`*.ts` có logic mới kèm spec **cùng thư mục, cùng tên** (`<tên>.spec.ts`) — ghi `(+spec)`. `*` = file chung, chỉ thêm dòng.

## Nền và nhánh

- **Điều kiện bắt đầu — cả ba phải đúng, thiếu ⟹ không tách nhánh, báo Owner:**
  1. Đợt 1, 2 ở `dev` (như CODE-PROMPT đợt 3 §1).
  2. **Đợt 3 trọn vẹn ở `dev`** (squash ⟹ kiểm file): `git -C <repo> --no-pager ls-tree --name-only origin/dev
     prisma/migrations/20261203000300_w3_personal_rights_allocations/migration.sql src/modules/catalog/public/license-lot.api.ts
     src/modules/catalog/public/seat-ledger.api.ts` in đủ 3 dòng; **và** `git -C <repo> --no-pager diff --stat origin/dev origin/int/redesign-w3 -- src prisma`
     **rỗng**. Tên migration cuối của đợt 3 có thể đổi lúc merge — đối chiếu `ls-tree origin/dev prisma/migrations/ | tail -3`.
  3. `DELTA-W3-FINAL.md` (SPEC §10) đã viết và đã vào `dev` cùng SPEC/PLAN bản đã duyệt. Người viết: điều phối (Opus), không phải agent code.
- **Làn `biz` (Owner, agent Neon):** làm **thẳng trên** `int/redesign-w4` (Owner tạo từ `dev` sau điều kiện 1–3); `git pull --ff-only` trước mỗi gói;
  **push ngay sau mỗi commit** (`int` có hai người đẩy: bị từ chối ⟹ `git pull --rebase`, chỉ commit chưa push của chính mình).
- **Làn `tech` (Bảo, có Docker):** nhánh `feat/redesign-w4-tech` tách từ `origin/dev`. **Kéo xuống** `git fetch origin && git merge origin/int/redesign-w4`
  (merge, không rebase) trước mỗi gói và bắt buộc trước gói có _Phụ thuộc_ "… ở int".
- **Đẩy lên:** gói `tech` xong và xanh ⟹ Owner **hoặc** Bảo merge commit cuối gói của `feat/redesign-w4-tech` vào `int/redesign-w4` ngay (đợt 4 là
  **một** PR, không có nhánh chụp từng phần) — làn `tech` giữ thứ tự gói tuyến tính.
- **Trong một làn:** tuần tự từng gói, không song song, không worktree.
- **Migration:** dải **`20261210…`**, **chỉ làn `biz`** (M1 ở B1, M2 ở B5). Không migration sửa sau; bắt buộc có (theo review) ⟹ số cao hơn migration cuối
  trên `int`, idempotent, ghi trong PR; không sửa migration đã đẩy lên `int`.
- **Hai làn chạy song song, không chờ:** `biz` bắt đầu bằng B1, `tech` bắt đầu bằng T1 (không cần schema mới). Chỗ một làn cần việc của làn kia chỉ ở cột
  _Phụ thuộc_; chưa có ⟹ làm việc lấp (bảng _Cửa_), không ngồi chờ.

## Hai làn không sửa chung file

- **Làn `biz`:** mọi luật và mọi ghi: `prisma/**`, migration, `m/requests/request-ticket/**`, `m/requests/request-reply/**`,
  `m/requests/request-ticket-submission/**`, `m/requests/request-intake/**`, `m/requests/need-decision/**`, `m/requests/spend-approval/**`,
  `m/requests/spend-submission/**`, `m/requests/spend/spend-submission.dto.ts`, `m/requests/withdraw/**`, `m/requests/access-request/access-request.repo.ts`,
  `access-request.types.ts`, `withdrawal.policy.ts`, `m/requests/reassignment/**`, `m/requests/request-submission/access-requests.controller.ts`,
  `docs/rules/database-business.md`; integration/http spec của gói mình (viết).
- **Làn `tech`:** mọi đường **đọc/hiện**: `m/requests/request-ticket-view/**`, `m/requests/access-request/access-request.dto.ts`, `m/requests/request-view/**`,
  `m/requests/my-requests/**`, `m/requests/need-decision-queue/**`, `m/requests/spend-approval-view/**`; harness `test/support/request-ticket-harness.ts`;
  spec mobile `test/integration/requests/mobile-*.integration-spec.ts`; seed `src/cli/seed/**`; `m/requests/README.md`; `docs/generated/*` (sinh);
  chạy integration/http trên Docker và **chỉ sửa test/fixture** (`FIX-TEST-tech.md`).
- **File chung, chỉ thêm dòng, gộp tay khi merge:** `openapi.json` (sinh lại sau merge, không sửa tay), `test/support/openapi-example-manifest.ts`,
  `test/support/openapi-example-route-codes-requests.ts`, `…-requests-spend.ts`, `test/support/api-coverage-manifest.ts`, `m/requests/requests.module.ts`,
  `prisma/models/organization.prisma` (chỉ quan hệ ngược, chỉ `biz`), `test/gates/api-collection-contract.gate-spec.ts` (mục `NESTED_ARRAYS`
  `requestTicketGet#items` — **Owner duyệt**; gate từ chối ⟹ dừng hỏi).
- Mọi file khác: **một làn tại một thời điểm**; đổi làn chỉ theo bảng _Tự kiểm chéo_. Gói cần file của làn kia ngoài bảng ⟹ dừng, ghi _Bàn giao_ ở PROGRESS.

### Tự kiểm chéo (file xuất hiện ở nhiều gói)

| File (`m/` = `src/modules/`)                                                                                      | Gói                    | Làn                                         |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------- |
| `prisma/models/requests.prisma`, `prisma/models/organization.prisma`*                                              | B1, B5                 | biz                                         |
| `m/requests/requests.module.ts`*                                                                                   | B2, B3, B4, B6, T2     | chung, chỉ thêm dòng                        |
| manifest OpenAPI `test/support/openapi-example-*.ts`*, `api-coverage-manifest.ts`*                                 | B2–B6, T2, T3          | chung, chỉ thêm dòng                        |
| `m/requests/access-request/access-request.repo.ts`, `access-request.types.ts`                                      | B1                     | biz (T2/T3 chỉ **đọc** `ticket`)            |
| `m/requests/request-ticket/request-ticket.repo.ts`, `.types.ts`, `.dto.ts`                                         | B1 → B2, B3, B4, B6    | biz (T2 chỉ gọi `findById`/`itemsOf`)       |
| `m/requests/request-ticket/request-ticket.policy.ts` (+spec), `.errors.ts`, `.http-errors.ts`                      | B1 → B2, B4            | biz                                         |
| `m/requests/request-reply/request-reply.repo.ts`, `.types.ts`                                                      | B5                     | biz (T3 chỉ gọi `latestOf`)                 |
| `m/requests/request-intake/access-request.service.ts`                                                              | B2                     | biz                                         |
| `m/requests/request-intake/request-resubmission.service.ts`, `request-resubmission.dto.ts`                         | B5                     | biz                                         |
| `m/requests/request-submission/access-requests.controller.ts`                                                      | B5                     | biz                                         |
| `m/requests/spend-submission/spend-batch.service.ts`, `m/requests/spend/spend-submission.dto.ts`                   | B4 → B5                | biz                                         |
| `m/requests/access-request/access-request.dto.ts`                                                                  | T2 → T3                | tech                                        |
| `m/requests/request-view/access-request.mapper.ts`, `access-request-query.service.ts`                              | T2 → T3                | tech                                        |
| `m/requests/spend-approval-view/spend-approval.dto.ts`, `spend-approval.mapper.ts`, `spend-approval-queue.service.ts` | T2                  | tech                                        |
| integration/http spec do `biz` viết (`test/integration/requests/request-ticket-*.integration-spec.ts`, …)          | B2–B6 → T4             | biz Bx → tech T4 (chỉ sửa test/fixture)     |
| `test/support/request-ticket-harness.ts`                                                                           | T1 → (B2+ dùng)        | tech (biz chỉ import sau khi T1 ở int)      |

Kiểm: không file nào bị hai làn sửa **cùng lúc**; chiều đổi tay duy nhất là `biz Bx → tech T4` cho spec test (sau khi Bx ở `int`). Làn `tech` **không** sửa
`m/requests/spend-submission/**` (kể cả `spend-queue`) — tránh đụng B4/B5.

## Cửa giữa hai làn

| Cửa | Khi                                   | Làm                                                                                                                       |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| C1  | `biz` xong B2 (gửi phiếu ở `int`)     | `tech` bắt đầu chạy Docker cho spec của B1–B2 (T4 đợt 1), seed phần gửi phiếu (T5); từ đây mỗi gói `biz` ở `int` ⟹ T4 chạy ngay |
| C2  | cả hai làn xong B7, T6                | Owner cắt `pr/redesign-w4` tại `int`, mở **PR → `dev`** (CI full xanh + review Opus)                                       |

**Ước lượng chặn và việc lấp** (L ≈ 2 M, S ≈ ½ M; `biz` ≈ 6 M, `tech` ≈ 4 M):

| Có thể bị chặn                  | Khi nào                           | Khả năng          | Việc lấp                                                                                      |
| ------------------------------- | --------------------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| `tech` T2 chờ B1 ở `int`        | sau T1 (≈ 1 M), B1 ≈ 1 M          | thấp              | T1 thêm characterization cho Request đơn (gửi lại, rút, lô) trên Docker                        |
| `tech` T4 chờ B2 ở `int` (C1)   | sau T2 (≈ 2 M), B2 xong ≈ 2 M     | thấp              | chạy lại integration Request đơn của đợt 3 trên Docker (`FIX-TEST-tech.md`)                   |
| `tech` T3 chờ B5 ở `int`        | `tech` ≈ 3 M, B5 xong ≈ 5 M       | **trung bình**    | T4 cho B3/B4 vừa vào `int`; T5 seed; mobile spec phần không cần ghi chú                        |
| `biz` chờ `tech`                | không có                          | —                 | `biz` không phụ thuộc `tech` (harness T1 là tùy chọn)                                         |

Thứ tự trong làn: **biz** B1 → B2 → B3 → B4 → B5 → B6 → B7; **tech** T1 → T2 → T4 (lặp theo gói biz) → T3 → T5 → T6.

## Bộ kiểm nhanh (mỗi gói, mỗi commit)

```text
pnpm typecheck
pnpm lint                      # chậm: pnpm exec eslint <file…>
pnpm arch:check
pnpm arch:capabilities --module requests
pnpm rules:check               # + pnpm rules:format khi sửa docs/rules, README module
pnpm test:gates
pnpm openapi:export && git --no-pager diff --stat openapi.json
CI=true pnpm test -- <mọi *.spec.ts đã chạm/thêm>
pnpm prisma:validate && pnpm prisma:generate   # gói có prisma/
```

- Không chạy `pnpm check`, `test:http`, `test:integration`, `test:e2e`, seed, Docker, migration ở máy — **trừ** làn `tech` (Docker của Bảo, gói T1/T4, chỉ
  sửa test/fixture). Integration/http mới **viết** ở gói `biz`, trạng thái `viết, chưa chạy` tới khi T4 chạy xanh (không ghi `xong` trọn gói trước đó).
- Luật mới: unit đỏ trước, rồi xanh. Mỗi bảng ca của SPEC ⟹ một `it.each`; ca diệt đột biến SPEC §11.1 chạy tay một lần, ghi PROGRESS.
- Test cũ khẳng định hành vi cũ (vd gửi lại không thân): unit của chính luật sửa ngay (ghi tên test + mục SPEC vào commit); http/integration ⟹ `FIX-TEST-<làn>.md`.
- Trần: 500 dòng/file, 25 file/thư mục (`access-request/`, `group-request/`, `spend/`, `assessment/` đã đủ — không thêm file), `complexity` 12, hàm 60 dòng.

## Gói

| #  | Gói                                                                                                   | Mục SPEC                     | Cỡ | Làn  | Phụ thuộc                                  |
| -- | ----------------------------------------------------------------------------------------------------- | ---------------------------- | -- | ---- | ------------------------------------------ |
| B1 | M1, model, lõi `request-ticket/` (repo, policy, lỗi, dto), `ticket` trên `AccessRequestRecord`         | W4-01, phần luật W4-02/W4-04 | M  | biz  | điều kiện                                  |
| B2 | Refactor gửi Request (kiểm/ghi), route gửi phiếu, kiểm trước từng mục, phiếu trưởng phòng theo thứ tự | W4-02, W4-03                 | M  | biz  | B1                                         |
| B3 | Quyết nhu cầu nhiều mục (`decideJudged`, route, kết quả từng mục)                                     | W4-05                        | M  | biz  | B2                                         |
| B4 | Quyết chi nhiều mục cùng phiếu; ánh xạ kết quả dùng chung với lô; thứ tự mục ở lô và khi chuyển một bước | W4-06, W4-07, W4-14 (thứ tự) | M  | biz  | B3                                         |
| B5 | M2, `request-reply/`, gửi lại bắt buộc ghi chú, trình lại kèm ghi chú                                 | W4-09, W4-10                 | M  | biz  | B4                                         |
| B6 | Rút cả phiếu; _(OQ-W4-2 = A)_ trưởng phòng rút ở hàng đợi trình                                       | W4-08, W4-12                 | S  | biz  | B5                                         |
| B7 | Chốt `biz`: E5 vào bảng khóa, `FIX-TEST-biz.md`, CI                                                   | W4-16                        | S  | biz  | B6 ⟹ **C2**                                |
| T1 | Harness phiếu + characterization Request đơn (gửi lại, rút, lô, quyết nhu cầu) chạy Docker             | §11.2, LUẬT CỨNG 2           | S  | tech | điều kiện                                  |
| T2 | Route xem phiếu, `ticket` trên 4 operation đọc, `NESTED_ARRAYS`                                       | W4-04                        | M  | tech | T1 + **B1 ở int**                          |
| T4 | Docker: chạy integration/http của từng gói `biz`, sửa test/fixture; mobile 4 spec; IT phụ trách       | W4-13, W4-14, §11            | M  | tech | **C1** (B2 ở int), lặp theo B3…B6 ở int    |
| T3 | `latestReply` trên `accessRequestGet`                                                                 | W4-11                        | S  | tech | T2 + **B5 ở int**                          |
| T5 | Seed phiếu demo                                                                                       | W4-15                        | S  | tech | **B2, B3 ở int**                           |
| T6 | Chốt `tech`: generator, module card, `FIX-TEST-tech.md`, CI                                           | W4-16                        | S  | tech | T3, T4, T5 + B6 ở int ⟹ **C2**             |

Migration: M1 (B1), M2 (B5) — làn `biz`.

---

## Chi tiết gói

Mỗi gói: **File**, **Làm**, **Kiểm** (ngoài bộ kiểm nhanh), **Xong khi**. Mọi gói đổi contract: `openapi.json` + manifest (`*`); mô tả OpenAPI không mã nội bộ.

### B1 — biz · M

- **File:** `prisma/models/requests.prisma`, `prisma/models/organization.prisma`*; `prisma/migrations/20261210000000_w4_request_tickets/migration.sql`;
  **mới** `m/requests/request-ticket/request-ticket.repo.ts`, `request-ticket.types.ts`, `request-ticket.policy.ts` (+spec), `request-ticket.errors.ts`,
  `request-ticket.http-errors.ts` (+spec), `request-ticket.dto.ts`; `m/requests/access-request/access-request.repo.ts`, `access-request.types.ts`;
  `test/integration/requests/request-ticket-schema.integration-spec.ts`.
- **Làm:** SPEC §5 M1 + §7.1. `request-ticket.policy.ts` (thuần): `MAX_TICKET_ITEMS = 6`, `findDuplicates(items)`, `countTowardsWeeklyLimit(...)` (GH-2 cộng
  dồn), `ticketStatusOf(states)` (`ENDED_STATES`), `orderByPosition(...)`; chưa dùng ở route. Lớp lỗi `RequestTicketNotFoundError`, `…NotRequesterError`,
  `…TooManyItemsError`, `…ItemsRefusedError` + ánh xạ HTTP + `*_ERROR_EXAMPLES`. DTO kết quả từng mục (`ticketItemResultSchema`).
- **Kiểm:** `pnpm prisma:validate`, `pnpm prisma:generate`; `it.each` trạng thái suy ra, trùng, GH-2 cộng dồn (SPEC §7.2 ca G, H), thứ tự.
- **Xong khi:** bốn tiêu chí §7.1 có integration (viết); unit policy xanh; Request đơn đọc ra `ticket: null` (unit repo/mapper).

### B2 — biz · M

- **File:** `m/requests/request-intake/access-request.service.ts` (+spec mới nếu chưa có — kiểm giữ); **mới** `m/requests/request-ticket-submission/`
  `request-tickets.controller.ts`, `request-ticket-submission.service.ts` (+spec), `request-ticket-precheck.service.ts` (+spec),
  `request-ticket-submission.mapper.ts`; `m/requests/requests.module.ts`*; manifest*; `test/integration/requests/request-ticket-submit.integration-spec.ts`,
  `request-ticket-head.integration-spec.ts`; `test/http/requests/request-tickets.http-spec.ts`.
- **Làm:** SPEC §7.2, §7.3. Trước khi sửa `submitWithin`: liệt kê mọi lần kiểm/throw (`mayRequest`, `lockDraft`, `lockEligible`, `limits.lock`, `assess`,
  `requireNotHeld`, `termRefusal`, `limits.requireForOne`) vào commit (`Kiểm giữ:`); tách `judgeWithin`/`writeWithin`, `submitWithin` hành vi cũ. Precheck
  dùng `judgeWithin` cho từng mục + policy B1; lỗi phụ thuộc người/phòng ⟹ lỗi cấp phiếu, lỗi phụ thuộc gói ⟹ vi phạm của mục. Ghi theo `position`.
  Comment đầu service ghi thứ tự khóa (SPEC §6.2, E5). OQ-W4-1 chưa trả lời ⟹ làm A (1–6) và ghi D-n.
- **Kiểm:** unit precheck `it.each` ca A–M (phần không cần DB); test cũ `access-request.service`/`request-intake` xanh không đổi kỳ vọng.
- **Xong khi:** 13 ca §7.2 + 5 ca §7.3 có test (unit/integration viết); `Kiểm giữ:` đủ trong commit.

### B3 — biz · M

- **File:** `m/requests/need-decision/need-decision.service.ts` (`decideJudged`), **mới** `ticket-need-decisions.controller.ts`,
  `ticket-need-decision.service.ts` (+spec); `m/requests/request-ticket/request-ticket.repo.ts` (nếu cần đọc thêm); repo đọc quyết định nhu cầu mới nhất
  của người gọi (thêm phương thức vào repo sẵn có của capability, không file mới ở `access-request/`); `m/requests/requests.module.ts`*; manifest*;
  `test/integration/requests/request-ticket-need-decision.integration-spec.ts`.
- **Làm:** SPEC §7.5. Refactor `decide` = chấm + `decideJudged`; giữ mọi lần kiểm (`lockDecidable`: `NOT_FOUND`, `GROUP_USES_LINES`, `checkNeedDecision`).
- **Kiểm:** `need-decision.service` test cũ xanh không đổi kỳ vọng; `it.each` ca A–H.
- **Xong khi:** 8 ca §7.5 có test; ca diệt đột biến "bỏ sắp position" đỏ.

### B4 — biz · M

- **File:** **mới** `m/requests/spend-approval/spend-item-outcome.policy.ts` (+spec), `ticket-spend-decisions.controller.ts`,
  `ticket-spend-decision.service.ts` (+spec); `m/requests/spend-approval/spend-batch-decision.service.ts` (dùng policy chung); **mới**
  `m/requests/spend-submission/spend-batch-order.policy.ts` (+spec); `m/requests/spend-submission/spend-batch.service.ts`;
  `m/requests/reassignment/step-reassignment.service.ts` và/hoặc `one-step-conversion.service.ts` (thứ tự kiểm); `m/requests/requests.module.ts`*; manifest*;
  `test/integration/requests/request-ticket-spend-decision.integration-spec.ts`, `spend-batch-ticket-order.integration-spec.ts`,
  `request-ticket-head-conversion.integration-spec.ts`, `request-ticket-grant-in-charge.integration-spec.ts`.
- **Làm:** SPEC §7.6, §7.7, §7.14 (IT phụ trách — chỉ test). Tách ánh xạ kết quả `decideOne`/`returnGroup`/`withoutOpenStep` của lô vào policy chung:
  liệt kê mọi nhánh `catch` cũ (`TransientDatabaseError`, `AccessRequestNotFoundError`, `AccessRequestGroupUsesLinesError`, `NO_SPEND_STEP`,
  `SpendDecisionRefusedError`, `BudgetCommitment*`) vào `Kiểm giữ:`.
- **Kiểm:** `spend-batch-decision.service.spec.ts` xanh **không đổi kỳ vọng**; `it.each` thứ tự lô; ca A–F §7.6.
- **Xong khi:** 6 ca §7.6, các ca §7.7, ca IT1/IT2 có test.

### B5 — biz · M

- **File:** `prisma/models/requests.prisma`, `organization.prisma`*; `prisma/migrations/20261210000100_w4_access_request_replies/migration.sql`;
  `src/infrastructure/database/database-role-judgement.ts` (nếu gate H7 đòi); **mới** `m/requests/request-reply/request-reply.repo.ts`,
  `request-reply.types.ts`; `m/requests/request-intake/request-resubmission.service.ts` (+spec), **mới** `request-resubmission.dto.ts`;
  `m/requests/request-submission/access-requests.controller.ts`; `m/requests/spend-submission/spend-batch.service.ts`, `m/requests/spend/spend-submission.dto.ts`,
  `m/requests/spend/spend.errors.ts`*, `spend.http-errors.ts`*; manifest*; `test/integration/requests/request-resubmission-reply.integration-spec.ts`,
  `spend-batch-reply-note.integration-spec.ts`; `test/http/requests/one-step-resubmission.http-spec.ts`.
- **Làm:** SPEC §5 M2, §7.9, §7.10. `request-reply.repo.ts`: `insert`, `latestOf(requestId)` (cho T3). Summary `accessRequestResubmit` bỏ "one-step".
- **Kiểm:** unit gửi lại (thiếu ghi chú ⟹ 422 ở DTO; có ⟹ chèn reply đúng `returned_step_id`); unit lô (`REPLY_NOTE_REQUIRED`, `REPLY_NOTE_NOT_IN_BATCH`).
- **Xong khi:** 5 ca §7.9, 4 ca §7.10 có test; test cũ gửi lại không thân ghi `FIX-TEST-biz.md` (http/integration) hoặc sửa kỳ vọng (unit, ghi commit).

### B6 — biz · S

- **File:** **mới** `m/requests/withdraw/ticket-withdrawals.controller.ts`, `ticket-withdrawal.service.ts` (+spec); _(OQ-W4-2 = A)_
  `m/requests/access-request/withdrawal.policy.ts` (+spec); `m/requests/requests.module.ts`*; manifest*;
  `test/integration/requests/request-ticket-withdrawal.integration-spec.ts`, `head-withdraw-submission-queue.integration-spec.ts`.
- **Làm:** SPEC §7.8, §7.12. OQ-W4-2 chưa trả lời ⟹ chỉ §7.8, ghi D-n.
- **Xong khi:** 5 ca §7.8 (và ca §7.12 nếu A) có test.

### B7 — biz · S

- **File:** `docs/rules/database-business.md` (ngoại lệ E5 dưới E4, viết trên bảng đợt 3 đã gộp); `docs/reviews/redesign-w4-2026-11-25/FIX-TEST-biz.md`.
- **Xong khi:** `pnpm rules:format && pnpm rules:check` xanh; CI full trên `int/redesign-w4` (`gh workflow run ci.yml --ref int/redesign-w4`) ghi
  `PROGRESS-biz.md`; rồi C2.

### T1 — tech · S (bắt đầu ngay)

- **File:** **mới** `test/support/request-ticket-harness.ts` (dựng tổ chức đủ QĐ-118: `P-DES` có `H1`, `IT1` qua `setItAdminInCharge`, phòng khác
  `IT2` qua `handOthersToSecondItAdmin`, Cost Center + ngân sách năm có số cơ sở/dự phòng truyền vào, `C1` có vai, nhân viên đủ `employment_type` và lần xếp
  phòng hợp lệ); **mới** `test/integration/requests/request-single-characterization.integration-spec.ts` (gửi lại, rút trước quyết định đầu tiên, trình lô theo
  thân, quyết nhu cầu lẻ — khẳng định hành vi **hiện có**).
- **Làm:** chạy trên Docker **trước** khi B2/B3/B4 refactor; xanh trên `dev` hiện tại. Ca gửi lại không thân sẽ đỏ sau B5 đúng luật — đánh dấu trong file.
- **Xong khi:** spec chạy xanh trên Docker (ghi lệnh + số pass vào `PROGRESS-tech.md`).

### T2 — tech · M (sau khi kéo B1)

- **File:** **mới** `m/requests/request-ticket-view/request-ticket-view.controller.ts`, `request-ticket-view.service.ts` (+spec),
  `request-ticket-view.mapper.ts`, `request-ticket-view.dto.ts`; `m/requests/access-request/access-request.dto.ts`; `m/requests/request-view/access-request.mapper.ts`,
  `access-request-query.service.ts`; `m/requests/my-requests/my-requests.dto.ts`, `my-requests.mapper.ts`, `my-requests.repo.ts`;
  `m/requests/need-decision-queue/need-decision-queue.dto.ts`, `.mapper.ts`, `.repo.ts`; `m/requests/spend-approval-view/spend-approval.dto.ts`,
  `spend-approval.mapper.ts`, `spend-approval-queue.service.ts`; `m/requests/requests.module.ts`*; manifest*; `test/gates/api-collection-contract.gate-spec.ts`*;
  `test/integration/requests/request-ticket-view.integration-spec.ts`, `test/http/requests/request-ticket-get.http-spec.ts`.
- **Làm:** SPEC §7.4. `itemCount` đọc trong cùng câu (không N+1).
- **Xong khi:** 4 tiêu chí §7.4 xanh trên Docker; gate collection xanh hoặc dừng hỏi.

### T4 — tech · M (từ C1, lặp)

- **File:** spec integration/http của gói `biz` đã ở `int` (chỉ test/fixture); `test/integration/requests/mobile-employee-requests.integration-spec.ts`,
  `mobile-need-decision.integration-spec.ts`, `mobile-spend-approval.integration-spec.ts`, `test/integration/identity-access/mobile-session-roles.integration-spec.ts`;
  `docs/reviews/redesign-w4-2026-11-25/FIX-TEST-tech.md`.
- **Làm:** mỗi gói `biz` vào `int` ⟹ kéo về, chạy đúng spec của gói trên Docker; đỏ vì fixture ⟹ sửa test/fixture; đỏ vì **logic** ⟹ không sửa `src`, ghi
  `PROGRESS-tech.md` _Bàn giao_ + báo `biz`. SPEC §7.14 mobile (4 ca), ca đồng thời §11.3 (chạy, lặp 20).
- **Xong khi:** mọi spec của B1–B6 xanh trên Docker hoặc có dòng _Bàn giao_ logic; mobile 4 ca xanh.

### T3 — tech · S (sau khi kéo B5)

- **File:** `m/requests/access-request/access-request.dto.ts`, `m/requests/request-view/access-request.mapper.ts`, `access-request-query.service.ts`;
  `test/http/requests/access-request-get.http-spec.ts` (có từ đợt 3 P16b; chưa có ⟹ tạo).
- **Làm:** SPEC §7.11 qua `RequestReplyRepo.latestOf`.
- **Xong khi:** 2 tiêu chí §7.11 xanh trên Docker.

### T5 — tech · S

- **File:** `src/cli/seed/steps/request-actions.ts` (hoặc step mới `request-tickets.steps.ts` (+spec)), `src/cli/seed/fixture/shared-demo-v4/requests.ts`,
  `docs/guides/seed.md`.
- **Làm:** qua API: phiếu `E1` (`P-DES`) Figma + Miro + Notion, `H1` duyệt hai mục một lần, mục ba trả về rồi gửi lại kèm ghi chú; phiếu `H1` ba mục, một mục
  bị chặn ngân sách (cần ngân sách seed đủ để tái hiện — ghi số vào `seed.md`).
- **Xong khi:** spec unit seed xanh; `seed check` liệt kê bước mới (Docker).

### T6 — tech · S

- **File:** `pnpm arch:graph`, `pnpm arch:routes`, `pnpm openapi:export` (sinh `docs/generated/*`, `openapi.json`); `m/requests/README.md` (mục phiếu, ghi chú
  trả lời, theo _Bàn giao_ của `biz`); `docs/reviews/redesign-w4-2026-11-25/FIX-TEST-tech.md`.
- **Xong khi:** CI full trên `feat/redesign-w4-tech` đã merge vào `int` ghi `PROGRESS-tech.md`; rồi C2.

## Rủi ro

| Rủi ro                                                                       | Giảm                                                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Refactor `submitWithin`/`NeedDecisionService`/ánh xạ lô làm mất một lần kiểm | LUẬT CỨNG 2 (`Kiểm giữ:`); T1 characterization chạy trước; test cũ không đổi kỳ vọng                                  |
| Đợt 3 đổi file đợt 4 chạm (DTO đọc, `requests.prisma`, bảng khóa)            | không tách nhánh trước khi đợt 3 vào `dev`; `DELTA-W3-FINAL.md` bắt buộc; lệch đổi luật ⟹ dừng hỏi                   |
| Integration viết mù đỏ hàng loạt ở CI (bài học đợt 2)                        | `tech` chạy Docker từng gói từ C1; `biz` không ghi `xong` trọn gói khi integration chưa chạy                          |
| Fixture thiếu IT phụ trách / Cost Center ⟹ 403/`undefined`                   | harness T1 dựng tổ chức đủ; SPEC §11.2 là checklist review                                                            |
| `accessRequestResubmit` phá contract FE                                      | ghi **Phá vỡ** ở SPEC §8.2 và mô tả PR; FE nhận bàn giao sau đợt                                                      |
| Gate collection từ chối `requestTicketGet#items`                             | dừng hỏi Owner; phương án subresource                                                                                 |
| Hai làn cùng sửa `requests.module.ts`, manifest                              | chỉ thêm dòng; gộp hợp khi merge; `openapi.json` sinh lại sau merge                                                   |
| Tracker ghi `xong` quá tay (bài học đợt 2)                                   | LUẬT CỨNG 6: bảng đối chiếu tiêu chí → test → `file:line` trong PROGRESS trước khi ghi `xong`                         |
