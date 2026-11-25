# PLAN — Đợt 4 thiết kế lại: phiếu nhiều mục (25/11/2026, bản 2.2)

> **Bản 2.2 (25/11):** rà theo khuôn `superpowers:writing-plans` — thêm _Đầu kế hoạch_ (mục tiêu, kiến trúc, công nghệ, ràng buộc chung, trọng tâm review),
> _Khuôn bước của một gói_ (test đỏ → chạy đỏ → code → chạy xanh → commit, lệnh + kết quả mong đợi), mỗi gói thêm **Interfaces**, **Test trước**, **Commit**;
> _Tự rà_ cuối file. **Không** đổi luật, thứ tự làn, cửa C0/C1/C2, quyết định Owner. Vị trí giữ ở `docs/reviews/<đợt>/PLAN.md` (quy trình BE, không
> `docs/superpowers/`).

> **Bản 2.1 (25/11):** **Owner đã chốt:** OQ-W4-1 = A (1–6 mục) · OQ-W4-2 = A (`QĐ-116b` ở đợt 4, gói B6) · OQ-W4-3 = A (không mã) ·
> OQ-W4-4 = A (thông báo từng mục) · `NESTED_ARRAYS` `requestTicketSubmit#ticket.items`, `requestTicketGet#ticket.items` = duyệt
> ([OWNER-ANSWERS.md](OWNER-ANSWERS.md)).

> **Bản 2 (25/11):** áp REVIEW-SPEC-BIZ / REVIEW-SPEC-TECH (SPEC §15). Đổi: T1 viết spec đặc tả hành vi hiện có (unit + integration) cho ba service bị
> refactor, **B2a/B3/B4a chỉ bắt đầu khi T1 ở `int`**; tách B2 → B2a/B2b, B4 → B4a/B4b, B5 → B5a/B5b; `biz` làm B1 → B5a → B6 trước để không chờ T1;
> `step-routing/` và hàng đợi trình thuộc `biz`; registry collection đúng file w4; bộ kiểm nhanh thêm prettier, `arch:routes`/`arch:docs:check`, tự kiểm drift.

Spec: [SPEC.md](SPEC.md). Trạng thái: **Owner đã duyệt — bản 2.1** (bản 2.2 chỉ bổ sung khuôn bước, không đổi nội dung đã duyệt); chỉ code sau khi đợt 3 vào `dev` + có `DELTA-W3-FINAL.md`. Quy trình: [`docs/guides/quy-trinh-code-ai.md`](../../guides/quy-trinh-code-ai.md). Đường dẫn tính từ gốc repo; `src/modules/` viết tắt `m/`. Mỗi file
`*.ts` có logic mới kèm spec **cùng thư mục, cùng tên** — ghi `(+spec)`. `*` = file chung, chỉ thêm dòng.

## Đầu kế hoạch (khuôn `superpowers:writing-plans`)

> **Cho agent code:** skill bắt buộc (CODE-PROMPT §0, theo bước của `docs/guides/quy-trinh-code-ai.md`): **Implement** `superpowers:executing-plans` +
> `superpowers:test-driven-development`; **Verify** `superpowers:verification-before-completion` trước mọi `xong-unit`/`xong`/commit; repo skill
> `.claude/skills/be-quick-check/SKILL.md` (bộ kiểm nhanh) và `.claude/skills/create-migration/SKILL.md` (B1, B5a). Thực thi **tuần tự từng gói trong làn**,
> không worktree, không `subagent-driven-development` song song (quy trình BE); Neon giao mỗi gói một subagent tuần tự (CODE-PROMPT §8). Bước có checkbox
> `- [ ]` — theo dõi ở `PROGRESS-<làn>.md`, không sửa PLAN khi chạy.

- **Mục tiêu:** người xin gửi **một phiếu 1–6 mục** (mỗi mục một Request hiện có); trưởng phòng / Người duyệt chi quyết nhiều mục cùng phiếu một lần; rút cả
  phiếu; ghi chú trả lời khi gửi lại / trình lại sau _Trả về của người_ — Request đơn, nhóm, lô chi giữ hành vi (trừ **Phá vỡ** SPEC §8.2).
- **Kiến trúc:** phiếu là vỏ bọc (`request_tickets` + `access_requests.ticket_id`/`ticket_position`); mọi luật tiền/duyệt/cấp chạy **theo từng Request** qua
  service lẻ hiện có. Hai capability lõi không controller (`request-ticket/`, `request-reply/`) + capability route mới; route nhiều mục chấm checklist một lần rồi
  **mỗi mục một tx**. Refactor ba service lẻ chỉ sau khi spec đặc tả T1 xanh (C0).
- **Công nghệ:** NestJS 11, Prisma (+ SQL tay cho CHECK/trigger), PostgreSQL, Zod strict → OpenAPI, Jest (unit `*.spec.ts` cạnh file; integration/http trên
  Docker làn `tech` hoặc CI GitHub), pnpm.
- **Spec:** [SPEC.md](SPEC.md) bản 2.1 + [OWNER-ANSWERS.md](OWNER-ANSWERS.md) + `DELTA-W3-FINAL.md` (khi có). Người code đọc **cả** SPEC và PLAN.

### Ràng buộc chung (mọi gói ngầm gồm mục này — giá trị chép từ SPEC)

- Phiếu: `MAX_TICKET_ITEMS = 6`; Zod `items` 1…20; 7…20 mục ⟹ 422 `REQUEST_TICKET.TOO_MANY_ITEMS` `details: { max: 6, count }`; 0 hoặc > 20 ⟹ 422
  `VALIDATION_ERROR`; không có lỗi tối thiểu (OQ-W4-1 = A) — SPEC §7.2 bước 1–2.
- Ghi chú trả lời: chữ thuần, `trim` 1…1000 (DB `CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000)`); chỉ bắt buộc khi có _Trả về của người_ **chưa** có
  reply — SPEC §4, §7.9, §7.10.
- Migration dải `20261210…`, chỉ `biz`: M1 `20261210000000_w4_request_tickets`, M2 `20261210000100_w4_access_request_replies`; FK `ON DELETE RESTRICT ON UPDATE
  CASCADE`, `@db.Timestamptz(3)`, id `@default(uuid())`; không nêu tên vai DB; không down migration; `RUNTIME_TABLE_EXCEPTIONS` thêm `request_tickets`,
  `access_request_replies`: `['INSERT', 'SELECT']` — SPEC §5.
- 5 operation mới `requestTicketSubmit`, `requestTicketGet`, `requestTicketNeedDecide`, `requestTicketSpendDecide`, `requestTicketWithdraw` (`@AuthenticatedOnly`);
  6 mã lỗi mới, 5 message thành công, enum `reason` đóng — đúng SPEC §8.3; operation cũ chỉ thêm trường trừ **Phá vỡ** `accessRequestResubmit`.
- Thứ tự khóa SPEC §6.2, không thêm tầng; E5 chỉ ở gửi phiếu pha 2. Comment đầu mỗi service mới ghi thứ tự khóa.
- Trần 500 dòng/file, 25 file/thư mục (`access-request/`, `group-request/`, `spend/`, `assessment/` đã đủ — chỉ sửa), `complexity` 12, hàm 60 dòng, 8 tham số.
- OpenAPI không mã nội bộ; comment `src` không mã `W4-xx`. Không sửa luật tiền/kho đợt 3 (SPEC §9).
- Commit bằng identity người làm, không co-author AI; message `feat(requests): … (redesign W4 <gói>)`, gói chỉ test `test(requests): …`, gói chỉ docs
  `docs(<phạm vi>): …`; thân: W4-xx, `Test chính:`, `Kiểm giữ:` (gói refactor), `D-n`.

### Trọng tâm review (đầu vào SPEC ngụ ý mà bảng ca chưa phủ — mỗi dòng có test ở gói sở hữu)

1. **Request đơn có cả lỗi người/phòng lẫn lỗi gói** (vd phòng không Cost Center + gói `DEVICE_KEY`): sau B2a vẫn trả **đúng mã như trước** (không bị đổi thứ tự
   vì tách _kiểm cấp người/phòng_) — ca đặc tả ở **T1**, B2a giữ xanh.
2. **Biên số mục:** 6 mục ⟹ 201; 20 ⟹ `TOO_MANY_ITEMS` `{max:6,count:20}`; 21 và `[]` ⟹ `VALIDATION_ERROR`, 0 Request — **B2b**.
3. **Mục miễn GH-2** (`TRANSFER_GRACE`, `ROLE_ENDED`) không đếm và không bị nêu `OPEN_LIMIT_REACHED` khi tuần đã đủ — **B1** (`openLimitRefusals`).
4. **`requestIds` trùng / rỗng / 7 id** ở #3, #4 ⟹ 422 `VALIDATION_ERROR`, không ghi — **B3** (schema dùng chung, B4a dùng lại).
5. **Ghi chú biên:** `"   "` ⟹ 422 `VALIDATION_ERROR` (sau `trim` rỗng — không phải `REPLY_NOTE_REQUIRED`), 1000 ký tự nhận, 1001 ⟹ 422 — `replyNote` (**B5a**),
   `replyNotes[].note` (**B5b**).

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

Theo repo skill `be-quick-check` (7 bước gốc) **cộng** phần đợt 4 thêm (prettier, `arch:capabilities`, `arch:routes`/`arch:docs:check`, prisma, drift). Mong đợi
mỗi lệnh: exit 0; `openapi.json` chỉ đổi ở operation của gói; `arch:docs:check` không báo lệch; jest `0 failed`.

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

Mỗi gói: **File**, **Làm**, **Kiểm** (ngoài bộ kiểm nhanh), **Xong khi**, **Interfaces** (Dùng / Tạo — tên, tham số, kiểu mà gói khác dựa vào), **Test trước**
(tên + khẳng định), **Commit**. Mọi gói đổi contract: `openapi.json` + manifest (`*`) + `docs/generated/*`; mô tả OpenAPI không mã nội bộ. Chữ ký dưới đây đọc
trên code `dev` hiện tại; sau đợt 3 lệch tên/tham số **không đổi luật** ⟹ theo code thật, ghi `D-n` tự chốt và sửa nơi dùng trong cùng gói.

### Khuôn bước của một gói (áp mọi gói; mục gói chỉ ghi phần riêng)

`<repo>` = `D:/FPT/FALL2026/Code/BE-dev-software-license-management`. Jest: Git Bash `CI=true pnpm test -- <file…>`; PowerShell `$env:CI='true'; pnpm test -- <file…>`.

- [ ] **0. Chuẩn bị** — `biz`: `git -C <repo> pull --ff-only`; `tech`: `git -C <repo> fetch origin && git -C <repo> merge origin/int/redesign-w4`. Kiểm _Phụ
      thuộc_ "… ở int": `git -C <repo> --no-pager log --oneline origin/int/redesign-w4 --grep "redesign W4 <gói>"` — mong đợi ≥ 1 dòng; không có ⟹ việc lấp
      (bảng _Cửa_). `pnpm prisma:generate`. Ghi `đang làm` ở PROGRESS. Mở `file:line` SPEC của gói, đối chiếu `DELTA-W3-FINAL.md`.
- [ ] **1. Viết test đỏ** — đúng các test ở **Test trước** của gói (tên + khẳng định, mã lỗi + status, `it.each` một bảng ca SPEC).
- [ ] **2. Chạy, thấy đỏ đúng lý do** — `CI=true pnpm test -- <spec của gói>`. Mong đợi: FAIL vì `Cannot find module` / `is not a function` / assertion trên mã
      hoặc kết quả mới — **không** vì lỗi cú pháp, import sai hay fixture. Gói refactor (B2a; phần lô của B3, B4a, B4b) thêm bước **2r**: trước khi sửa, chạy spec
      đặc tả T1 + spec cũ của đoạn refactor — mong đợi PASS; ghi danh sách `Kiểm giữ:`.
- [ ] **3. Code tối thiểu** — đúng chữ ký ở **Interfaces**, chỉ file ở **File**.
- [ ] **4. Chạy lại, thấy xanh** — cùng lệnh bước 2 + spec cũ gói liệt kê. Mong đợi: `Tests: N passed` và `0 failed` (ghi N vào PROGRESS); spec T1/spec cũ:
      `git -C <repo> --no-pager diff <sha đầu gói> -- <spec cũ>` chỉ có dòng **thêm**.
- [ ] **5. Integration/http** — `biz`: viết đúng file ở **File** (≤ 800 dòng, fixture SPEC §11.2), PROGRESS `viết, chưa chạy`; `tech`:
      `pnpm test:integration -- <file>` / `pnpm test:http -- <file>` trên Docker, mong đợi `0 failed`.
- [ ] **6. Bộ kiểm nhanh** (mục trên, skill `be-quick-check`) — mọi lệnh exit 0. Gói có migration: thêm bước **M** ở dưới.
- [ ] **7. Tự đối chiếu** (LUẬT CỨNG 6, skill `verification-before-completion`) — `git -C <repo> --no-pager diff <sha đầu gói>..HEAD -- <file của gói>`; bảng ca
      SPEC → test → `file:line` vào PROGRESS; ca chưa có test ⟹ chưa `xong`.
- [ ] **8. Commit + đẩy** — `git -C <repo> add <đúng file của gói>`; `git -C <repo> commit` với message ở **Commit** của gói; `biz`: `git -C <repo> push origin
      int/redesign-w4`; `tech`: `git -C <repo> push -u origin feat/redesign-w4-tech`, ghi "sẵn để đẩy". PROGRESS: sha, lệnh + số pass, FIX-TEST, D-n.

**Bước M (B1, B5a — đọc `.claude/skills/create-migration/SKILL.md`; skill gọi tay nên agent đọc file):** quy ước tên/thứ tự/roll-forward/không GRANT của skill
áp nguyên; **thay** bước `pnpm db:migrate:dev` của skill bằng `prisma migrate diff` (làn `biz` không chạy DB — PLAN _Nền và nhánh_ thắng skill). Không thêm dòng
vào `scripts/verify/merged-migrations.txt` trong đợt (chỉ khi phát hành).

- [ ] M1. `git -C <repo> archive HEAD prisma | tar -x -C <tmp>/w4-before` (schema trước khi sửa).
- [ ] M2. Sửa `prisma/models/*.prisma`; `pnpm prisma:validate` — mong đợi `The schema at prisma is valid`.
- [ ] M3. `pnpm exec prisma migrate diff --from-schema <tmp>/w4-before/prisma --to-schema prisma --script > <tmp>/gen.sql`; dán vào `migration.sql` đúng tên
      SPEC §5; thêm tay CHECK/trigger/comment SQL đảo ở cuối file.
- [ ] M4. Sinh lại `<tmp>/gen2.sql` cùng lệnh; `diff <tmp>/gen2.sql prisma/migrations/<tên>/migration.sql` — mong đợi chỉ khác ở dòng thêm tay.
      `grep -nE "GRANT|REVOKE|OWNER TO" prisma/migrations/<tên>/migration.sql` — mong đợi rỗng. `pnpm prisma:generate` exit 0.

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
- **Interfaces** — Dùng: —. Tạo (B5a, B2b, B3, B4a, B4b, B6, T2, T3 dựa vào):
  - `request-ticket.policy.ts`: `MAX_TICKET_ITEMS = 6`; `findDuplicates(items: readonly { position: number; planId: string }[]): { position: number;
    duplicateOfPosition: number }[]`; `openLimitRefusals(input: { sentThisWeek: number; weeklyLimit: number; items: readonly { position: number; refused: boolean;
    exempt: boolean }[] }): number[]` (vị trí bị nêu GH-2); `ticketStatusOf(states: readonly AccessRequestState[]): 'IN_PROGRESS' | 'DONE'`;
    `orderByPosition<T extends { position: number }>(items: readonly T[]): T[]`.
  - `request-ticket.types.ts`: `TicketRef = { id: string; position: number; itemCount: number }`; `RequestTicketView` (dạng `ticket` SPEC §8.1, `latestReply: null`
    tới B5a).
  - `RequestTicketRepo`: `insert(tx: DbTx, input: { organizationId: string; requesterEmployeeId: string; departmentId: string; submittedAt: Date }): Promise<{ id:
    string }>`; `view(tx: DbTx, ticketId: string): Promise<RequestTicketView | null>`; `itemsOf(tx: DbTx, ticketId: string): Promise<{ requestId: string; position:
    number }[]>`.
  - `request-ticket.errors.ts`: `RequestTicketNotFoundError`, `RequestTicketNotRequesterError`, `RequestTicketTooManyItemsError(count: number)`,
    `RequestTicketItemsRefusedError(items: TicketItemRefusal[])` + `REQUEST_TICKET_ERROR_EXAMPLES`.
  - `request-ticket.dto.ts`: `ticketSchema`, `ticketRefSchema`, `ticketItemReasonSchema` + `ticketItemRefusalSchema` (enum §8.3 dòng 1), `ticketNeedResultSchema`,
    `ticketSpendResultSchema`, `ticketWithdrawResultSchema` (enum §8.3 dòng #3, #4, #5).
  - `AccessRequestRecord.ticket: TicketRef | null`; `NewAccessRequest.ticket?: { id: string; position: number }` (`AccessRequestRepo.insert` ghi hai cột).
- **Test trước:**
  - `request-ticket.policy.spec.ts` — `it.each` `ticketStatusOf`: mỗi state của `ENDED_STATES` riêng ⟹ `'DONE'`; `[COMPLETED, REJECTED, AWAITING_SPEND_DECISION]` ⟹
    `'IN_PROGRESS'`; `[COMPLETED, REJECTED, REJECTED]` ⟹ `'DONE'`. `findDuplicates`: cùng `planId` ở 1, 2 ⟹ `[{ position: 2, duplicateOfPosition: 1 }]`; cùng ứng
    dụng khác gói ⟹ `[]`. `it.each` `openLimitRefusals` (`weeklyLimit: 10`): đã gửi 9, hai mục ⟹ `[2]` (ca H); đã gửi 8, mục 3 `refused` ⟹ `[]` (ca G); đã gửi 10,
    một mục ⟹ `[1]` (ca G đuôi); đã gửi 10, một mục `exempt` ⟹ `[]` và đã gửi 9, `[exempt, ok, ok]` ⟹ `[3]` (Trọng tâm 3). `orderByPosition` sắp tăng.
  - `request-ticket.http-errors.spec.ts` — `it.each` 4 lỗi ⟹ status 404 / 403 / 422 / 422 + `code` đúng; `TOO_MANY_ITEMS` có `details: { max: 6, count: 7 }`.
  - `request-ticket.mapper.spec.ts` — view → wire: `items` theo `position`, `status` qua `ticketStatusOf`.
  - Tiêu chí §7.1 (4) `ticket: null`: `access-request/` đã đủ 25 file nên **không** thêm `access-request-record.mapper.spec.ts`; kiểm ở
    `request-ticket-schema.integration-spec.ts` (đọc Request đơn qua `AccessRequestRepo` ⟹ `ticket === null`) và T2 (`ticketRef: null`) — chỗ đặt test, không đổi
    luật; ghi `D-n` tự chốt.
- **Bước:** khuôn + bước **M** (M1).
- **Commit:** `feat(requests): request ticket model, core ticket capability and ticket on access request record (redesign W4 B1)`.

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
- **Interfaces** — Dùng (B1): `RequestTicketRepo.view`, `RequestTicketView`. Tạo (B5b, T3 dựa vào):
  - `request-reply.types.ts`: `HumanReturn = { kind: 'NEED' | 'IT_ASSESSMENT' | 'SPEND'; stepId: string; closedAt: Date }`; `LatestReply = { kind:
    AccessRequestReplyKind; note: string; author: { id: string; name: string }; createdAt: Date }` (dạng người theo `requester` của `ticketSchema`).
  - `request-reply.policy.ts`: `pendingHumanReturn(input: { returns: readonly HumanReturn[]; repliedStepIds: ReadonlySet<string> }): HumanReturn | null` — lấy
    lần mới nhất theo `closedAt`; đã có reply ⟹ `null` (không lùi về lần cũ hơn).
  - `RequestReplyRepo`: `insert(tx: DbTx, input: { organizationId: string; requestId: string; kind: AccessRequestReplyKind; returnedStepId: string | null; note:
    string; authorEmployeeId: string }): Promise<{ id: string }>`; `latestOf(tx: DbTx, requestId: string): Promise<LatestReply | null>`; `latestOfMany(tx: DbTx,
    requestIds: readonly string[]): Promise<Map<string, LatestReply>>`; `repliedStepIds(tx: DbTx, requestId: string): Promise<Set<string>>`.
  - `AccessRequestReplyNoteRequiredError(returnedStepId: string)` ⟹ 422 `ACCESS_REQUEST.REPLY_NOTE_REQUIRED` `details: { returnedStepId }`.
  - `request-resubmission.dto.ts`: `resubmitBodySchema = { replyNote?: string trim 1…1000 }` strict; `RequestResubmissionService.resubmit(actor:
    AuthenticatedPrincipal, id: string, input: { replyNote?: string } = {}): Promise<…như cũ>`.
- **Test trước:**
  - `request-reply.policy.spec.ts` — `it.each`: một lần `NEED` / `IT_ASSESSMENT` / `SPEND` chưa reply ⟹ trả đúng lần đó; không lần nào ⟹ `null`; lần mới nhất đã
    reply ⟹ `null` (ca E); lần cũ chưa reply + lần mới đã reply ⟹ `null`.
  - `request-resubmission.service.spec.ts` (có — thêm ca) — có lần chờ, thiếu ghi chú ⟹ ném mã `ACCESS_REQUEST.REPLY_NOTE_REQUIRED`, `details.returnedStepId` đúng,
    không gọi ghi; có ghi chú ⟹ `replies.insert` với `kind: 'REQUESTER_RESUBMISSION'`, `returnedStepId` đúng, audit có `replyId`; không lần chờ + không ghi chú ⟹ như
    cũ, không `insert`; không lần chờ + có ghi chú ⟹ `insert` với `returnedStepId: null`. Ca cũ (Request chỉ bị chặn) **không đổi kỳ vọng**.
  - `access-requests.controller.spec.ts` (có — thêm ca) — thân `{}` / không thân hợp lệ; `replyNote: "   "` và 1001 ký tự ⟹ 422 `VALIDATION_ERROR`; 1000 ký tự ⟹
    qua (Trọng tâm 5).
- **Bước:** khuôn + bước **M** (M2).
- **Commit:** `feat(requests): reply note required after a human return on resubmission (redesign W4 B5a)` — thân ghi `Phá vỡ: accessRequestResubmit` + tên test
  cũ đổi kỳ vọng (nếu có) kèm SPEC §7.9.

### B6 — biz · S

- **File:** **mới** `m/requests/withdraw/ticket-withdrawals.controller.ts`, `ticket-withdrawal.service.ts` (+spec); `m/requests/access-request/withdrawal.policy.ts` (+spec); `m/requests/requests.module.ts`\*; manifest\*;
  `test/integration/requests/request-ticket-withdrawal.integration-spec.ts`, `head-withdraw-submission-queue.integration-spec.ts`.
- **Làm:** SPEC §7.8 (A–G), §7.12 (đúng `NOT_SUBMITTED`, ca âm). OQ-W4-2 = A (Owner chốt).
- **Xong khi:** ca §7.8 và §7.12 có test.
- **Interfaces** — Dùng (B1): `RequestTicketRepo.itemsOf`, `orderByPosition`, `RequestTicketNotFoundError`, `RequestTicketNotRequesterError`,
  `ticketWithdrawResultSchema`; hiện có: `WithdrawalService.withdraw(actor, requestId, input: { reason?: string })`. Tạo: `TicketWithdrawalService.withdraw(actor:
  AuthenticatedPrincipal, ticketId: string, input: { reason?: string }): Promise<TicketWithdrawResult[]>`; `HEAD_MAY_WITHDRAW_AT` thêm đúng `'NOT_SUBMITTED'`.
- **Test trước:**
  - `withdrawal.policy.spec.ts` (có — thêm ca) — `it.each` `headMayWithdraw`: `NOT_SUBMITTED`, `BLOCKED`, `RESERVE_CONFIRMATION` ⟹ `true`;
    `RETURNED_TO_REQUESTER` (ca âm), `WAITING_SPEND_DECISION`, `null` ⟹ `false`.
  - `ticket-withdrawal.service.spec.ts` — người xem được mà không phải người xin ⟹ mã `REQUEST_TICKET.NOT_REQUESTER`; không xem được ⟹ `REQUEST_TICKET.NOT_FOUND`;
    gọi `WithdrawalService` theo `position`; mục đã `WITHDRAWN` do chính người gọi ⟹ `{ outcome: 'WITHDRAWN', reason: 'ALREADY_WITHDRAWN' }`, không gọi rút; lỗi
    `WITHDRAWAL_AFTER_DECISION` ⟹ `SKIPPED` cùng `reason`; lỗi DB tạm thời ⟹ `RETRYABLE`; mọi mục đã kết thúc ⟹ mọi mục `SKIPPED ALREADY_ENDED`.
- **Commit:** `feat(requests): withdraw a whole ticket; head withdraws from the submission queue (redesign W4 B6)`.

### B2a — biz · S (sau C0)

- **File:** `m/requests/request-intake/access-request.service.ts`, `access-request.service.spec.ts` (của T1 — chỉ thêm ca), `access-request-submission.mapper.ts` (+spec).
- **Làm:** liệt kê mọi lần kiểm/throw của `submit`/`submitWithin` (`mayRequest`, `lockDraft`, `lockEligible`, `limits.lock`, `assess` — tách phần người/phòng,
  `requireNotHeld`, `termRefusal`, `limits.requireForOne`, `repo.insert`, `auditSubmitted`, `spendRouting.start`) vào `Kiểm giữ:`; tách bốn phần (SPEC §7.2
  _Refactor_); `newRequestOf` nhận `ticket?`. Không đổi hành vi.
- **Xong khi:** spec đặc tả T1 (unit) xanh **không đổi kỳ vọng**; T4 chạy lại integration đặc tả xanh trên Docker sau khi B2a ở `int`.
- **Interfaces** — Dùng (B1): `NewAccessRequest.ticket?`. Tạo (B2b dựa vào), trong `AccessRequestService`: `checkPartyWithin(tx: DbTx, actor:
  AuthenticatedPrincipal, settings: RequestSettings, options: SubmitOptions): Promise<PartyCheck>` (người/phòng: Super Admin, bên bị loại, đơn vị đã bắt đầu, Cost
  Center, khóa phòng); `checkItemWithin(tx: DbTx, party: PartyCheck, body: SubmitBodyDto, options: SubmitOptions): Promise<ItemCheck>` với `ItemCheck = { ok:
  true; facts: ItemFacts } | { ok: false; error: ItemRefusalError }` (`ItemRefusalError` = đúng 6 lớp ở SPEC §7.2 bước 3); `writeWithin(tx: DbTx, actor:
  AuthenticatedPrincipal, party: PartyCheck, item: ItemFacts, ticket?: { id: string; position: number }): Promise<{ id: string }>`; `routeWithin(tx: DbTx, actor:
  AuthenticatedPrincipal, requestId: string, now: Date): Promise<void>`. `submit`/`submitWithin` **giữ chữ ký**; `submitWithin` gọi các phần sao cho lỗi đầu tiên
  **như cũ** (kể cả ca Trọng tâm 1). `newRequestOf(…, ticket?)` trong `access-request-submission.mapper.ts`.
- **Test trước:** bước **2r** (spec T1 + `access-request-submission.mapper.spec.ts` PASS trước khi sửa); thêm ca `newRequestOf` có `ticket` ⟹ bản ghi có
  `ticketId`, `ticketPosition`; không `ticket` ⟹ cả hai `null`. Không thêm ca đổi kỳ vọng.
- **Commit:** `refactor(requests): split single submit into party check, item check, write, route (redesign W4 B2a)` — thân `Kiểm giữ:` đủ danh sách ở **Làm**.

### B2b — biz · M

- **File:** **mới** `m/requests/request-ticket-submission/request-tickets.controller.ts`, `request-ticket-submission.service.ts` (+spec),
  `request-ticket-precheck.service.ts` (+spec); `m/requests/requests.module.ts`\*; manifest\*; **mới** `test/support/api-collection-registry-nested-w4.ts`,
  `api-collection-registry-events-w4.ts` (+ nối `api-collection-registry-nested.ts`, `-events.ts`); `test/integration/requests/request-ticket-submit.integration-spec.ts`,
  `request-ticket-head.integration-spec.ts`; `test/http/requests/request-tickets.http-spec.ts`.
- **Làm:** SPEC §7.2, §7.3. Lỗi cấp phiếu một lần trước vòng mục; vòng mục chỉ bắt danh sách lớp lỗi của gói; hai pha ghi; comment đầu service ghi thứ tự khóa (§6.2,
  E5). Key registry `requestTicketSubmit#ticket.items`. OQ-W4-1 = A (1–6 mục, không lỗi tối thiểu).
- **Kiểm:** `it.each` precheck ca A–M, K2 (phần không cần DB).
- **Xong khi:** 14 ca §7.2 + 7 ca §7.3 + ca đồng thời §11.3 #1, #4 có test (viết).
- **Interfaces** — Dùng: B1 (`MAX_TICKET_ITEMS`, `findDuplicates`, `openLimitRefusals`, `RequestTicketRepo.insert`/`view`, lỗi, `ticketSchema`), B2a
  (`checkPartyWithin`, `checkItemWithin`, `writeWithin`, `routeWithin`). Tạo: `ticketSubmitBodySchema` (thêm vào `request-ticket.dto.ts`: `items` 1…20, mỗi mục
  như `submitBodySchema`); `RequestTicketPrecheckService.precheck(tx: DbTx, party: PartyCheck, items: readonly TicketItemBody[]): Promise<TicketItemRefusal[]>`
  (rỗng ⟹ gửi được; thứ tự lý do SPEC §7.2 bước 3); `RequestTicketSubmissionService.submit(actor: AuthenticatedPrincipal, body: TicketSubmitBody):
  Promise<RequestTicketView>`.
- **Test trước:**
  - `request-ticket-precheck.service.spec.ts` — `it.each` ca A, D, E, F, G, H, I, M (mock `checkItemWithin`, giới hạn tuần): đúng `[{ position, reason, … }]` như
    bảng §7.2, sắp `position`; mục lỗi lớp ngoài danh sách 6 lớp ⟹ ném lên.
  - `request-ticket-submission.service.spec.ts` — `ticketSubmitBodySchema.safeParse` `it.each`: 6 mục hợp lệ; 0 và 21 mục ⟹ lỗi; mục 2 `businessReason: "  "` ⟹ path
    `items.1.businessReason` (ca C). 7 và 20 mục ⟹ ném `REQUEST_TICKET.TOO_MANY_ITEMS` `{ max: 6, count }` (ca B, Trọng tâm 2). `checkPartyWithin` ném
    `FINANCE.SETUP_INCOMPLETE` ⟹ `precheck` không được gọi (ca K, K2). Precheck có mục bị nêu ⟹ ném `REQUEST_TICKET.ITEMS_REFUSED`, không gọi
    `RequestTicketRepo.insert`/`writeWithin`. Hợp lệ ⟹ thứ tự gọi: `insert` phiếu → `writeWithin` mọi mục theo `position` → `routeWithin` mọi mục theo `position`
    (mọi ghi trước mọi định tuyến — hai pha); audit `REQUEST_TICKET.SUBMITTED` `after: { requestIds, planIds }`.
- **Commit:** `feat(requests): submit a request ticket of up to six items (redesign W4 B2b)`.

### B3 — biz · M

- **File:** `m/requests/need-decision/need-decision.service.ts` (tham số `judged?`), `need-decision.service.spec.ts` (của T1 — chỉ thêm ca); **mới**
  `ticket-need-decisions.controller.ts`, `ticket-need-decision.service.ts` (+spec); `m/requests/requests.module.ts`\*; manifest\*;
  `test/integration/requests/request-ticket-need-decision.integration-spec.ts`.
- **Làm:** SPEC §7.5. `ALREADY_DECIDED` dựng từ `needSteps` của record (không repo mới). Giữ mọi lần kiểm (`lockDecidable`: `NOT_FOUND`, `GROUP_USES_LINES`,
  `checkNeedDecision`).
- **Xong khi:** 8 ca §7.5 + ca đồng thời §11.3 #2 có test; spec T1 xanh không đổi kỳ vọng; đột biến "bỏ sắp position" đỏ.
- **Interfaces** — Dùng (B1): `RequestTicketRepo.itemsOf`, `orderByPosition`, `RequestTicketNotFoundError`, `ticketNeedResultSchema`. Tạo:
  `NeedDecisionService.decide(actor: AuthenticatedPrincipal, requestId: string, input: DecisionInput & { checklist: ChecklistBody }, judged?: JudgedNeedChecklist):
  Promise<AccessRequestRecord>` (`JudgedNeedChecklist` export cùng file, khuôn `JudgedSpendChecklist`); `ticketDecideBodySchema` (thêm vào `request-ticket.dto.ts`:
  `requestIds` uuid 1…6 không trùng, `decision`, `reason?`, `checklist` — B4a dùng lại); `TicketNeedDecisionService.decide(actor: AuthenticatedPrincipal,
  ticketId: string, body: TicketDecideBody): Promise<TicketNeedResult[]>`.
- **Test trước:**
  - `need-decision.service.spec.ts` (của T1 — chỉ thêm) — có `judged` ⟹ không gọi chấm checklist, ghi checklist với bộ đã chấm; không `judged` ⟹ chấm một lần như cũ.
  - `ticket-need-decision.service.spec.ts` — `it.each` ca A–H §7.5 (mock `NeedDecisionService`): `outcome`/`reason` từng mục; ca B ném `POLICY.CHECKLIST_HAS_NO`,
    không gọi `decide`; ca H thứ tự gọi `R1` trước `R2`; ca F id ngoài phiếu đứng sau. `ticketDecideBodySchema.safeParse` `it.each`: `requestIds` trùng, `[]`, 7 id ⟹
    lỗi (Trọng tâm 4).
- **Bước:** khuôn (có **2r** cho `need-decision.service.ts`); sau bước 4 chạy tay đột biến "bỏ sắp position" ⟹ ca H đỏ, hoàn tác, ghi PROGRESS.
- **Commit:** `feat(requests): head decides several items of a ticket with one checklist (redesign W4 B3)` — thân `Kiểm giữ:` (`lockDecidable`: `NOT_FOUND`,
  `GROUP_USES_LINES`, `checkNeedDecision`).

### B4a — biz · M

- **File:** **mới** `m/requests/spend-approval/spend-item-outcome.policy.ts` (+spec), `ticket-spend-decisions.controller.ts`, `ticket-spend-decision.service.ts` (+spec);
  `spend-batch-decision.service.ts`; `spend-decision.service.spec.ts` (của T1 — chỉ thêm ca); `m/requests/requests.module.ts`\*; manifest\*;
  `test/integration/requests/request-ticket-spend-decision.integration-spec.ts`, `request-ticket-grant-in-charge.integration-spec.ts`.
- **Làm:** SPEC §7.6, §7.14 (IT). Liệt kê mọi nhánh `catch` của `decideOne` (`TransientDatabaseError`, `AccessRequestNotFoundError`, `AccessRequestGroupUsesLinesError`,
  `NO_SPEND_STEP`, `SpendDecisionRefusedError`, `BudgetCommitment*`) và cách `BOUNCED` ra `RECHECKED_RETURNED_TO_HEAD` vào `Kiểm giữ:`; policy thuần, lô giữ.
- **Xong khi:** 7 ca §7.6 + ca đồng thời §11.3 #3 + ca IT1/IT2 có test; `spend-batch-decision.service.spec.ts` xanh **không đổi kỳ vọng**.
- **Interfaces** — Dùng: B1 (`itemsOf`, `orderByPosition`, `ticketSpendResultSchema`), B3 (`ticketDecideBodySchema`), hiện có `SpendDecisionService.decide(actor,
  requestId, input, judged?: JudgedSpendChecklist)`. Tạo: `spendItemOutcome(input: { context: 'BATCH' | 'TICKET'; result?: SpendDecisionResult; error?: unknown }):
  { outcome: string; reason: string | null } | null` (thuần; `null` ⟹ người gọi ném lại lỗi); `TicketSpendDecisionService.decide(actor: AuthenticatedPrincipal,
  ticketId: string, body: TicketDecideBody): Promise<TicketSpendResult[]>`.
- **Test trước:**
  - `spend-item-outcome.policy.spec.ts` — `it.each` mỗi nhánh `catch` ở `Kiểm giữ:` ⟹ đúng `{ outcome, reason }` như lô hiện có; `BOUNCED` `to: 'REQUESTER'`,
    `TICKET` ⟹ `RECHECKED_RETURNED_TO_REQUESTER`; `BOUNCED` bất kỳ `to`, `BATCH` ⟹ `RECHECKED_RETURNED_TO_HEAD` (giữ dòng 104); `new Error('x')` ⟹ `null`.
  - `ticket-spend-decision.service.spec.ts` — ca A–F §7.6 (mock `SpendDecisionService`): mục hai bước ⟹ `SKIPPED USE_BATCH`, không gọi `decide`; `RETURN` chỉ gọi
    mục đã chọn (ca D); `judged` truyền giống nhau cho mọi mục, chấm một lần.
  - `spend-decision.service.spec.ts` (T1 — chỉ thêm, nếu cần), `spend-batch-decision.service.spec.ts` (có) — PASS không đổi kỳ vọng (ca G).
- **Bước:** khuôn (có **2r** cho `spend-batch-decision.service.ts`).
- **Commit:** `feat(requests): spend approver decides several one-step items of a ticket (redesign W4 B4a)` — thân `Kiểm giữ:` (các nhánh `catch` của `decideOne`).

### B4b — biz · S

- **File:** **mới** `m/requests/spend-submission/spend-batch-order.policy.ts` (+spec); `spend-batch.service.ts`; `m/requests/step-routing/step-reassignment.repo.ts`
  (đọc `ticket` vào `ReassignableRequest`); `m/requests/reassignment/step-reassignment.service.ts` và/hoặc `one-step-conversion.service.ts`;
  `test/integration/requests/spend-batch-ticket-order.integration-spec.ts`, `request-ticket-head-conversion.integration-spec.ts`.
- **Làm:** SPEC §7.7: thứ tự xử lý theo phiếu; **mọi mảng** (`results`, `batches.create.items`, `recorder.submitted`) sắp lại về thứ tự thân.
- **Xong khi:** `it.each` thứ tự; integration (a) gồm khẳng định audit khớp cặp, (b), chuyển một bước R11/R12 (viết); test lô cũ xanh không đổi kỳ vọng.
- **Interfaces** — Dùng (B1): `AccessRequestRecord.ticket`. Tạo: `processingOrder(items: readonly { requestId: string; ticket: { id: string; position: number } |
  null }[]): string[]`; `restoreBodyOrder<T extends { requestId: string }>(bodyIds: readonly string[], rows: readonly T[]): T[]` (cùng file policy);
  `ReassignableRequest.ticket: { id: string; position: number } | null`.
- **Test trước:** `spend-batch-order.policy.spec.ts` — `it.each` §7.7: [`R3`(PH1#3), `X`, `R1`(PH1#1)] ⟹ [`R1`, `X`, `R3`]; [`A`(PH1#2), `B`(PH2#1), `C`(PH1#1)] ⟹
  [`C`, `B`, `A`]; không phiếu ⟹ giữ nguyên; `restoreBodyOrder` trả đúng thứ tự thân cho cả ba ca. Spec cũ của `spend-submission/`, `reassignment/` PASS không đổi kỳ
  vọng (bước **2r**).
- **Commit:** `feat(requests): items of one ticket keep ticket order in batches and one-step conversion (redesign W4 B4b)` — thân `Kiểm giữ:` (`lockAll` theo id
  không đổi).

### B5b — biz · S

- **File:** `m/requests/spend-submission/spend-batch.service.ts`, `spend-queue.service.ts`, `spend-batch-view.service.ts` (mục lô); `m/requests/spend/spend-submission.dto.ts`
  (thân `replyNotes`, `stopReason`, mục hàng đợi `ticketRef`/`replyNoteRequired`, mục lô `ticketRef`), `spend.errors.ts`\*, `spend.http-errors.ts`\*; manifest\*;
  `test/integration/requests/spend-batch-reply-note.integration-spec.ts`.
- **Làm:** SPEC §7.10 (chỉ lưu khi mục đi tiếp), §7.4 dòng hàng đợi trình (RB-5). Dùng `request-reply.policy.ts` của B5a.
- **Xong khi:** 5 ca §7.10 có test.
- **Interfaces** — Dùng: B5a (`pendingHumanReturn`, `RequestReplyRepo.insert`/`repliedStepIds`), B1 (`ticketRefSchema`), B4b (`processingOrder`,
  `restoreBodyOrder`). Tạo: `SpendBatchService.submit(actor, requestIds, confirmations = [], checklist?, replyNotes: readonly { requestId: string; note: string }[] =
  [])`; `SpendReplyNoteNotInBatchError(requestIds: string[])` ⟹ 422 `SPEND.REPLY_NOTE_NOT_IN_BATCH`; `stopReason` thêm `REPLY_NOTE_REQUIRED`; mục hàng đợi thêm
  `ticketRef`, `replyNoteRequired: boolean`; mục lô thêm `ticketRef`.
- **Test trước:** **mới** `spend-batch.service.spec.ts` (`spend-submission/` < 25 file) — `it.each` ca A–E §7.10: (A) lần trả về của `C1` chờ + không ghi chú ⟹
  `STOPPED` `REPLY_NOTE_REQUIRED`, mục khác đi tiếp; (B) có ghi chú ⟹ `SENT_TO_APPROVER`, `insert` một lần `kind: 'HEAD_RESUBMISSION'`; (C) ghi chú cho id ngoài lô ⟹
  ném `SPEND.REPLY_NOTE_NOT_IN_BATCH`, không tạo lô; (D) chỉ kiểm lại của hệ thống ⟹ không đòi; (E) có ghi chú nhưng ngân sách `STOPPED` ⟹ không `insert`. Schema
  `replyNotes[].note`: `"   "`, 1001 ký tự ⟹ lỗi; 1000 ⟹ nhận (Trọng tâm 5).
- **Commit:** `feat(requests): head resubmits a returned item with a reply note; ticket reference in queue and batch items (redesign W4 B5b)`.

### B7 — biz · S

- **File:** `docs/rules/database-business.md` (ngoại lệ E5 dưới E4, viết trên bảng đợt 3 đã gộp — SPEC §6.2); `docs/reviews/redesign-w4-2026-11-25/FIX-TEST-biz.md`.
- **Xong khi:** `pnpm rules:format && pnpm rules:check` xanh; CI full trên `int/redesign-w4` ghi `PROGRESS-biz.md`; rồi C2.
- **Bước:**
  - [ ] Viết E5 (nội dung SPEC §6.2 _Ngoại lệ E5_) dưới E4; chạy `pnpm rules:format && pnpm rules:check` — mong đợi exit 0.
  - [ ] Gom `FIX-TEST-biz.md` (`| Gói | File test | Ca | Lý do |`) từ PROGRESS.
  - [ ] Commit `docs(rules): lock-order exception for ticket submission; wave-4 biz fix-test list (redesign W4 B7)`; push `int/redesign-w4`.
  - [ ] `gh workflow run ci.yml --ref int/redesign-w4`; `gh run list --workflow ci.yml --branch int/redesign-w4` — mong đợi mọi job `success`, trừ ca đã có dòng
        `FIX-TEST-*.md`; đỏ ⟹ `gh run view <id> --log-failed`, xử theo CODE-PROMPT §7.3. Ghi link + kết quả từng job vào `PROGRESS-biz.md`.

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
- **Interfaces** — Dùng: code `dev` hiện tại (không sửa `src`). Tạo (B2a, B3, B4a, T4 dựa vào): `request-ticket-harness.ts` export hàm dựng tổ chức SPEC §11.2
  (phòng `P-DES` + `H1` + `IT1` phụ trách, phòng khác giao `IT2`, `CC-DES` + ngân sách có số, `C1`, nhân viên đủ `employment_type`) — tên hàm do T1 đặt, ghi vào
  _Bàn giao_ ở PROGRESS để `biz` import.
- **Test trước** (đặc tả — viết theo hành vi **thật** của `dev`): ba spec unit + integration ở **File**; thêm ca **Trọng tâm 1**: Request đơn, phòng không Cost
  Center + gói `DEVICE_KEY` ⟹ khẳng định đúng mã code hiện có trả (đọc từ lần chạy thật). Mỗi ca khẳng định mã + status.
- **Bước** (thay bước 1–4 của khuôn): viết spec → `CI=true pnpm test -- <ba spec unit>` — mong đợi **PASS** (đặc tả; đỏ ⟹ sửa test cho đúng hành vi thật, không
  sửa `src`) → `pnpm test:integration -- test/integration/requests/request-single-characterization.integration-spec.ts` trên Docker — mong đợi `0 failed` → bộ kiểm
  nhanh → commit → push → báo Owner/Bảo merge (C0).
- **Commit:** `test(requests): characterization specs for single submit, need decision and spend decision (redesign W4 T1)`.

### T2 — tech · M (sau khi kéo B1)

- **File:** **mới** `m/requests/request-ticket-view/request-ticket-view.controller.ts`, `request-ticket-view.service.ts` (+spec); `m/requests/access-request/access-request.dto.ts`;
  `m/requests/request-view/access-request.mapper.ts`, `access-request-query.service.ts`; `m/requests/my-requests/my-requests.dto.ts`, `my-requests.mapper.ts`,
  `my-requests.repo.ts`; `m/requests/need-decision-queue/need-decision-queue.dto.ts`, `.mapper.ts`, `.repo.ts`; `m/requests/spend-approval-view/spend-approval.dto.ts`,
  `spend-approval.mapper.ts`, `spend-approval-queue.service.ts`; `m/requests/requests.module.ts`\*; manifest\*; registry w4\* (`requestTicketGet#ticket.items`);
  `test/integration/requests/request-ticket-view.integration-spec.ts`, `test/http/requests/request-ticket-get.http-spec.ts`.
- **Làm:** SPEC §7.4 (route GET dùng `RequestTicketRepo.view` + `ticketSchema` của B1; `ticketRef` đọc từ `record.ticket`, không câu riêng).
- **Xong khi:** 4 tiêu chí §7.4 xanh trên Docker; gate collection xanh hoặc dừng hỏi.
- **Interfaces** — Dùng (B1): `RequestTicketRepo.view`, `ticketStatusOf`, `ticketSchema`, `ticketRefSchema`, `RequestTicketNotFoundError`,
  `AccessRequestRecord.ticket`. Tạo: `RequestTicketViewService.get(actor: AuthenticatedPrincipal, ticketId: string): Promise<RequestTicketView>` (lọc mục theo
  `canViewRequest`; `status`, `itemCount` tính trên **mọi** mục); `ticketRef: TicketRef | null` trên 4 dạng đọc.
- **Test trước:** `request-ticket-view.service.spec.ts` — không xem được mục nào ⟹ mã `REQUEST_TICKET.NOT_FOUND`; xem được 1/3 ⟹ `items` 1 mục, `status`/`itemCount`
  của cả 3 (RB-11); `[COMPLETED, REJECTED, AWAITING_SPEND_DECISION]` ⟹ `IN_PROGRESS`. Spec mapper có sẵn (`my-requests.dto.spec.ts`,
  `need-decision-queue.mapper.spec.ts`, `spend-approval.mapper.spec.ts`) thêm ca: Request đơn ⟹ `ticketRef: null`; mục phiếu ⟹ `{ id, position, itemCount }`;
  `request-view/access-request.mapper.ts` chưa có spec ⟹ tạo `access-request.mapper.spec.ts` (thư mục < 25).
- **Commit:** `feat(requests): view a request ticket; ticket reference on request reads (redesign W4 T2)`.

### T3 — tech · S (sau khi kéo B5a)

- **File:** `m/requests/access-request/access-request.dto.ts`, `m/requests/request-view/access-request.mapper.ts`, `access-request-query.service.ts`;
  `test/http/requests/access-request-get.http-spec.ts` (có từ đợt 3 P16b; chưa có ⟹ tạo).
- **Làm:** SPEC §7.11 qua `RequestReplyRepo.latestOf`.
- **Xong khi:** tiêu chí §7.11 phần `accessRequestGet` xanh trên Docker.
- **Interfaces** — Dùng (B5a): `RequestReplyRepo.latestOf(tx, requestId): Promise<LatestReply | null>`, `LatestReply`. Tạo: `latestReply: LatestReply | null` trên
  dạng `accessRequestGet`.
- **Test trước:** `request-view/access-request.mapper.spec.ts` (T2 tạo) — có reply ⟹ `latestReply.note` đúng, `createdAt` ISO; không ⟹ `null`. Http
  `access-request-get.http-spec.ts`: sau §7.9 (B) ⟹ `latestReply.note === "dùng cho dự án X, 3 tháng"`.
- **Commit:** `feat(requests): latest reply note on request detail (redesign W4 T3)`.

### T4 — tech · M (lặp theo gói `biz`)

- **File:** spec integration/http của gói `biz` đã ở `int` (chỉ test/fixture); 4 spec mobile (SPEC §7.14); `docs/reviews/redesign-w4-2026-11-25/FIX-TEST-tech.md`.
- **Làm:** mỗi gói `biz` vào `int` ⟹ kéo về, chạy đúng spec của gói (gồm lại spec đặc tả T1 sau B2a/B3/B4a); đỏ vì fixture ⟹ sửa test/fixture; đỏ vì **logic** ⟹ không
  sửa `src`, ghi _Bàn giao_ + báo `biz`. Ca đồng thời §11.3 chạy lặp 20.
- **Xong khi:** mọi spec của B1–B5b xanh trên Docker hoặc có dòng _Bàn giao_ logic; mobile 4 ca xanh.
- **Bước (mỗi vòng, một gói `biz` vừa vào `int`):**
  - [ ] `git -C <repo> fetch origin && git -C <repo> merge origin/int/redesign-w4`; `pnpm prisma:generate`.
  - [ ] `pnpm test:integration -- <file integration của gói>` và `pnpm test:http -- <file http của gói>` (sau B2a/B3/B4a thêm
        `request-single-characterization.integration-spec.ts`) — mong đợi `0 failed`.
  - [ ] Đỏ vì fixture ⟹ sửa test/fixture, chạy lại; đỏ vì logic ⟹ không sửa `src`, ghi _Bàn giao_ + báo `biz`.
  - [ ] Ca đồng thời §11.3: chạy 20 lần (`for i in $(seq 20); do pnpm test:integration -- <file> -t "<tên ca>" || break; done`) — mong đợi 20/20, không `40P01`.
  - [ ] Commit `test(requests): run and fix fixtures for <gói> on Docker (redesign W4 T4)`; ghi PROGRESS gói `biz` ⟹ `xong` (cho `biz` cập nhật trạng thái).
  - [ ] Một lần: 4 spec mobile (§7.14) — `pnpm test:integration -- test/integration/requests/mobile-employee-requests.integration-spec.ts
        …/mobile-need-decision… …/mobile-spend-approval… test/integration/identity-access/mobile-session-roles.integration-spec.ts` — mong đợi `0 failed`.

### T5 — tech · S

- **File:** `src/cli/seed/steps/request-actions.ts` (hoặc step mới `request-tickets.steps.ts` (+spec)), `src/cli/seed/fixture/shared-demo-v4/requests.ts`, `docs/guides/seed.md`.
- **Làm:** qua API: phiếu `E1` Figma + Miro + Notion, `H1` duyệt hai mục một lần, mục ba trả về rồi gửi lại kèm ghi chú; phiếu `H1` ba mục, một mục bị chặn ngân sách
  (ghi số ngân sách seed vào `seed.md`).
- **Xong khi:** spec unit seed xanh; `seed check` liệt kê bước mới (Docker).
- **Interfaces** — Dùng: route #1, #3, `accessRequestResubmit` (thân `replyNote`) qua API (B2b, B3, B5a ở `int`). Tạo: bước seed mới trong danh sách step.
- **Test trước:** `request-actions.spec.ts` (có) hoặc `request-tickets.steps.spec.ts` (mới) — bước gửi phiếu gọi `POST /request-tickets` với 3 mục theo thứ tự
  Figma, Miro, Notion; bước gửi lại gửi `replyNote` khác rỗng.
- **Commit:** `feat(seed): demo request tickets (redesign W4 T5)`.

### T6 — tech · S

- **File:** `pnpm arch:graph`, `pnpm arch:routes`, `pnpm openapi:export` (sinh `docs/generated/*`, `openapi.json`); `m/requests/README.md` (mục phiếu, ghi chú trả
  lời, theo _Bàn giao_ của `biz`); `docs/reviews/redesign-w4-2026-11-25/FIX-TEST-tech.md`.
- **Xong khi:** CI full trên `feat/redesign-w4-tech` đã merge vào `int` ghi `PROGRESS-tech.md`; rồi C2.
- **Bước:**
  - [ ] `pnpm arch:graph && pnpm arch:routes && pnpm openapi:export`; `pnpm arch:docs:check` — mong đợi exit 0, không lệch.
  - [ ] Sửa `m/requests/README.md`; `pnpm rules:format && pnpm rules:check` — mong đợi exit 0.
  - [ ] Commit `docs(requests): wave-4 generated docs, module card, tech fix-test list (redesign W4 T6)`; push; báo merge vào `int`.
  - [ ] `gh workflow run ci.yml --ref feat/redesign-w4-tech`; `gh run list --workflow ci.yml --branch feat/redesign-w4-tech` — mong đợi mọi job `success` trừ ca có
        dòng `FIX-TEST-*.md`; ghi link + kết quả vào `PROGRESS-tech.md`.

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

## Tự rà theo `superpowers:writing-plans` (bản 2.2)

- **Phủ SPEC:** W4-01 B1 · W4-02 B2a, B2b · W4-03 B2b · W4-04 T2, B5b · W4-05 B3 · W4-06 B4a · W4-07 B4b · W4-08 B6 · W4-09 B5a · W4-10 B5b · W4-11 B5a (mục
  phiếu), T3 · W4-12 B6 · W4-13 T4 · W4-14 B4a (IT), B4b, T4 · W4-15 T5 · W4-16 B7, T6; §11.1 dòng _nền_ T1; §11.3 #1, #4 B2b · #2 B3 · #3 B4a. Không mục
  SPEC nào thiếu gói.
- **Bước:** mọi gói theo _Khuôn bước_ (test đỏ → chạy đỏ → code → chạy xanh → kiểm nhanh → đối chiếu → commit); gói refactor có **2r**; gói migration có **M**;
  T1, T4, B7, T6 có bước riêng (đặc tả / Docker / CI). Không còn dòng "TODO", "xử lý biên" chung chung.
- **Kiểu nhất quán:** `TicketRef`, `RequestTicketView`, `LatestReply`, `HumanReturn`, `PartyCheck`/`ItemCheck`, `ticketDecideBodySchema`, `processingOrder`/
  `restoreBodyOrder`, `pendingHumanReturn` — định nghĩa ở gói tạo, gói sau chỉ **Dùng** đúng tên. Schema kết quả #3/#4/#5 đều ở `request-ticket.dto.ts` (B1).
- **Trọng tâm review:** 5 dòng ở _Đầu kế hoạch_, mỗi dòng có test ở T1 / B1 / B2b / B3 / B5a + B5b.
- **Cân đối:** PLAN chỉ ghi chữ ký, tên test, khẳng định, lệnh; không chép thân hàm. Lệch so với chữ SPEC: tiêu chí §7.1 (4) "unit mapper" kiểm ở integration +
  T2 vì `access-request/` đã đủ 25 file (chỗ đặt test, không đổi luật — `D-n` tự chốt ở B1).
