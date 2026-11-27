# PLAN — Đợt 4 thiết kế lại: phiếu nhiều mục (27/11/2026, bản 3.1 — chạy song song)

> **Bản 3.1 (27/11):** Owner chốt OQ-W4-5 = A (chặn trùng trong phiếu theo gói; năm/tháng `L-1` không chặn; OQ-W4-8 đóng),
> OQ-W4-6 = A (ngoại lệ song song riêng đợt 4: worktree, orchestrator gộp vào `feat/redesign-w4*`), OQ-W4-7 = A (CI tay mỗi cổng). Áp review độc lập:
> I-1 (`submitWithin` không gọi `assessParty`), I-2 (giá/`termMonths` số nguyên), I-3 (fixture `ticket: null`), I-4, I-5, I-6 (cổng 0), M-1 (wave B chia
> B1/B2), M-2 (gói vá **G-HTTP** ở cổng A), M-3…M-10. Danh sách ở SPEC §16.4.

> **Bản 3.0 (27/11):** Owner 27/11: **Neon code toàn bộ đợt 4**, dùng **nhiều subagent song song** thay vì hai làn tuần tự. Viết lại PLAN theo
> [SPEC.md](SPEC.md) bản 3.0 và [DELTA-W3-FOR-W4.md](DELTA-W3-FOR-W4.md): **20 gói**, chia theo **ranh giới file không giao nhau**, **4 wave song song**
> (A → D) nối bằng **cổng** 0/A/B/C/D; migration một gói duy nhất; integration/http chạy trên CI GitHub ở mỗi cổng (không Docker, bỏ làn `tech`). Luật
> nghiệp vụ và quyết định Owner **không đổi** (OQ-W4-1…4 = A, `NESTED_ARRAYS`); OQ-W4-5…7 Owner chốt 27/11; OQ-W4-8 đóng (SPEC §12). Bản 2.2 → 3.0:
> bảng gói cũ → mới ở SPEC §16.2.

> **Cho agent code (orchestrator + subagent):** REQUIRED SUB-SKILL — orchestrator: `superpowers:dispatching-parallel-agents` +
> `superpowers:subagent-driven-development`; subagent: `superpowers:executing-plans` + `superpowers:test-driven-development` + repo skill
> `.claude/skills/be-quick-check/SKILL.md` (gói A-DB thêm `.claude/skills/create-migration/SKILL.md`); mọi người: `superpowers:verification-before-completion`
> trước mọi `xong`/commit/báo cáo. Bước có checkbox `- [ ]`, theo dõi ở [PROGRESS-biz.md](PROGRESS-biz.md) (orchestrator) và `pkg/<gói>.md` (subagent).

- **Mục tiêu:** người xin gửi **một phiếu 1–6 mục** (mỗi mục một Request hiện có); trưởng phòng / Người duyệt chi quyết nhiều mục cùng phiếu một lần; rút cả
  phiếu; ghi chú trả lời khi gửi lại / trình lại sau _Trả về của người_ — Request đơn, nhóm, lô chi giữ hành vi (trừ **Phá vỡ** SPEC §8.2).
- **Kiến trúc:** phiếu là vỏ bọc (`request_tickets` + `access_requests.ticket_id`/`ticket_position`); mọi luật tiền/duyệt/cấp chạy **theo từng Request** qua
  service lẻ hiện có. Hai capability lõi không controller (`request-ticket/`, `request-reply/`) + capability route mới; route nhiều mục chấm checklist một lần rồi
  **mỗi mục một tx**. Refactor ba service lẻ chỉ sau khi spec đặc tả A-T1 xanh trên CI (cổng A = C0).
- **Công nghệ:** NestJS 11, Prisma (+ SQL tay cho CHECK/trigger), PostgreSQL, Zod strict → OpenAPI, Jest (unit `*.spec.ts` cạnh file; integration/http trên CI
  GitHub), pnpm, git worktree.
- **Spec:** [SPEC.md](SPEC.md) bản 3.0 + [OWNER-ANSWERS.md](OWNER-ANSWERS.md) + [DELTA-W3-FOR-W4.md](DELTA-W3-FOR-W4.md). Subagent đọc **mục SPEC của gói** +
  mục gói trong PLAN + dòng DELTA gói dẫn; orchestrator đọc cả ba trọn.

## Ràng buộc chung (mọi gói ngầm gồm mục này — giá trị chép từ SPEC)

- Phiếu: `MAX_TICKET_ITEMS = 6`; Zod `items` 1…20; 7…20 mục ⟹ 422 `REQUEST_TICKET.TOO_MANY_ITEMS` `details: { max: 6, count }`; 0 hoặc > 20 ⟹ 422
  `VALIDATION_ERROR`; không có lỗi tối thiểu (OQ-W4-1 = A, `QĐ-120p`) — SPEC §7.2.
- Trùng trong phiếu (`DUPLICATE_IN_TICKET`): cùng **`planId`** (OQ-W4-5 = A; gói năm/tháng `L-1` không chặn — ngoại lệ Owner chấp nhận);
  thứ tự lỗi: Zod → `TOO_MANY_ITEMS` → người/phòng → mục (T-W4-17); `assessParty` chỉ route phiếu gọi (I-1).
- Enum `reason` của `ITEMS_REFUSED`: **16** giá trị (SPEC §8.3), 7 giá trị thời hạn = đúng `TermRefusal` (`src/core/term-limit.ts:45-52`, gồm `K1_ANNUAL_*`).
- Ghi chú trả lời: chữ thuần, `trim` 1…1000 (DB `CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000)`); chỉ bắt buộc khi có _Trả về của người_ **chưa** có
  reply — SPEC §4, §7.9, §7.10.
- Migration: dải `20261210…`, **chỉ gói A-DB**: M1 `20261210000000_w4_request_tickets`, M2 `20261210000100_w4_access_request_replies`; FK `ON DELETE RESTRICT ON
UPDATE CASCADE`, `@db.Timestamptz(3)`, id `@default(uuid())`; không nêu tên vai DB; không down migration; `RUNTIME_TABLE_EXCEPTIONS` thêm `request_tickets`,
  `access_request_replies`: `['INSERT', 'SELECT']` — SPEC §5. Migration cuối của đợt 3: `20261204000500`.
- 5 operation mới `requestTicketSubmit`, `requestTicketGet`, `requestTicketNeedDecide`, `requestTicketSpendDecide`, `requestTicketWithdraw` (`@AuthenticatedOnly`);
  6 mã lỗi mới, 5 message thành công — SPEC §8.3; operation cũ chỉ thêm trường trừ **Phá vỡ** `accessRequestResubmit`.
- Thứ tự khóa SPEC §6.2 (bảng gộp đợt 3, tầng 1, 2, 3a, 4, 10 + grant FS); E5 chỉ ở gửi phiếu pha 2. Comment đầu mỗi service mới ghi thứ tự khóa (số tầng mới).
- DI bắt buộc (DL-10): không `@Optional()`, không phụ thuộc `?`, không fallback; không thêm phụ thuộc vào provider của `requests-work-facade.module.ts` /
  `requests-routing-facade.module.ts`.
- Trần 500 dòng code/file, 25 file/thư mục (`access-request/`, `group-request/`, `spend/`, `assessment/` đã đủ — chỉ sửa), `complexity` 12, hàm 60 dòng,
  8 tham số; không thêm `eslint-suppressions.json`; hàm đã bị suppress (`spend-queue.service.ts`, DL-13) không thêm nhánh.
- Không sửa luật tiền/kho đợt 3 (SPEC §9 danh sách file). Mục phiếu đi đúng đường Request đơn (giá tháng lưu lúc gửi — DL-2).
- OpenAPI không mã nội bộ; comment `src` không mã `W4-xx`. Commit bằng identity Owner, không co-author AI.

## Trọng tâm review (đầu vào SPEC ngụ ý mà bảng ca chưa phủ — mỗi dòng có test ở gói sở hữu)

1. **Request đơn có cả lỗi người/phòng lẫn lỗi gói** (phòng không Cost Center + gói `DEVICE_KEY`): sau B-SUBMIT-R vẫn trả **`PLAN_BOUND_TO_DEVICE`** như trước
   (gói kiểm trước Cost Center ở `assess` — DL-6) — ca đặc tả ở **A-T1**, B-SUBMIT-R giữ xanh; phiếu cùng dữ liệu ⟹ `FINANCE.SETUP_INCOMPLETE` (C-SUBMIT ca K2).
2. **Biên số mục:** 6 mục ⟹ 201; 20 ⟹ `TOO_MANY_ITEMS` `{max:6,count:20}`; 21 và `[]` ⟹ `VALIDATION_ERROR`, 0 Request — schema ở **B-CORE**, route ở **C-SUBMIT**.
3. **Mục miễn GH-2** (`TRANSFER_GRACE`, `ROLE_ENDED`) không đếm và không bị nêu `OPEN_LIMIT_REACHED` khi tuần đã đủ — **A-POL1** (`openLimitRefusals`).
4. **`requestIds` trùng / rỗng / 7 id** ở #3, #4 ⟹ 422 `VALIDATION_ERROR`, không ghi — `ticketDecideBodySchema` ở **B-CORE** (C-NEED, C-SPEND dùng lại).
5. **Ghi chú biên:** `"   "` ⟹ 422 `VALIDATION_ERROR` (sau `trim` rỗng — không phải `REPLY_NOTE_REQUIRED`), 1000 ký tự nhận, 1001 ⟹ 422 — `replyNote`
   (**B-REPLY**), `replyNotes[].note` (**C-BATCH**).

---

## 1. Nhánh, worktree và cổng

`<R>` = `D:/FPT/FALL2026/Code/BE-dev-software-license-management`. Mọi lệnh `git` dùng `--no-pager`; jest dùng `CI=true` (PowerShell: `$env:CI='true'`).

| Thứ              | Tên                                                                         | Ai tạo / ai ghi                                                                                                           |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Nhánh đợt        | `feat/redesign-w4` (từ `origin/dev` **sau khi đợt 3 vào `dev`**)            | orchestrator; chỉ nhận merge `--ff-only` từ nhánh làn sau khi cổng xanh                                                   |
| Nhánh làn (wave) | `feat/redesign-w4-wave-a` … `-wave-d` (từ `feat/redesign-w4` lúc mở wave)   | orchestrator; chỉ nhận merge `--no-ff` các nhánh gói của wave đó + commit cổng                                            |
| Nhánh gói        | `feat/redesign-w4-<gói>` (vd `feat/redesign-w4-a-db`) từ nhánh làn của wave | **một** subagent; chỉ file của gói (+ dòng thêm ở file gộp)                                                               |
| Worktree gói     | `D:/FPT/FALL2026/Code/w4-<gói>`                                             | `git -C <R> worktree add -b feat/redesign-w4-<gói> D:/FPT/FALL2026/Code/w4-<gói> feat/redesign-w4-wave-<x>`; xóa sau cổng |
| Báo cáo gói      | `docs/reviews/redesign-w4-2026-11-25/pkg/<gói>.md`                          | subagent của gói (file riêng ⟹ không xung đột); orchestrator chép vào PROGRESS                                            |
| Tracker          | `PROGRESS-biz.md`, `OVERNIGHT-DECISIONS-biz.md`, `FIX-TEST-w4.md`           | **chỉ orchestrator**                                                                                                      |
| Worktree cổng    | `D:/FPT/FALL2026/Code/w4-gate` (checkout nhánh làn đang gộp)                | **chỉ orchestrator** gộp, sinh lại, chạy kiểm ở đây — không gộp trong thư mục repo chính `<R>` (M-8)                      |

- Push được: `feat/redesign-w4*`. **Không** merge vào `int/*`, `dev`, `main`; không mở PR; Owner mở PR `feat/redesign-w4` → `dev` sau cổng D + review Opus.
- **Ngoại lệ quy trình của đợt 4 (OQ-W4-6 = A):** được dùng worktree, nhiều subagent song song, orchestrator được gộp vào `feat/redesign-w4*` (khác
  `docs/guides/quy-trinh-code-ai.md:31`); guide sửa sau khi đánh giá đợt 4.
- Tối đa **4 subagent chạy cùng lúc**; wave B có 5 gói ⟹ đợt **B1** (B-CORE, B-REPLY, B-SUBMIT-R, B-NEED-R) rồi **B2** (B-SPEND-R), cùng nền `wave-b` (M-1); wave C có 8 gói ⟹ hai đợt C1 (C-SUBMIT, C-NEED, C-SPEND, C-WITHDRAW) rồi C2 (C-BATCH, C-CONV, C-VIEW, C-LISTS), cùng
  nền `wave-c`, gộp chung ở cổng C.
- Worktree mới: `pnpm install --frozen-lockfile --prefer-offline` rồi `pnpm prisma:generate` (store pnpm dùng chung). Không sửa `package.json`/`pnpm-lock.yaml`.

### Cổng

| Cổng | Khi                                                  | Điều kiện qua                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | trước wave A                                         | `origin/dev` có SPEC **bản 3.x** (`git show origin/dev:docs/reviews/redesign-w4-2026-11-25/SPEC.md \| head -1`) và `DELTA-W3-FOR-W4.md` (I-6); đợt 3 ở `origin/dev` (CODE-PROMPT §1); DELTA mục 4 chạy lại, `DL-24…` (nếu có) đã ghi; **run CI nền chạy tay** `gh workflow run ci.yml --ref dev` (không lấy run do push) — id của run đó là mốc phân loại nợ (I-5) |
| A    | mọi gói wave A xong (pkg report + diff đã đối chiếu) | gộp + bộ kiểm nhanh xanh trên `wave-a`; **gói vá G-HTTP** (mục 7) xong; **CI tay**: `request-single-characterization` (**C0**), `request-ticket-schema`, `request-reply-schema`, `head-withdraw-submission-queue` xanh; spec đỏ khác đều đỏ cả trên run nền                                                                                                        |
| B    | wave B xong                                          | như A + spec đặc tả A-T1 (unit + integration) **vẫn xanh, không đổi kỳ vọng** sau B-SUBMIT-R/B-NEED-R/B-SPEND-R; `request-resubmission-reply`, `request-ticket-repo`, `one-step-resubmission` xanh; test cũ B-REPLY sửa xanh                                                                                                                                       |
| C    | wave C (C1 + C2) xong                                | như A + mọi integration/http của wave C xanh; ca đồng thời §11.3 lặp 20 trên CI (biến `REPEAT=20` hoặc vòng trong spec) không `40P01`                                                                                                                                                                                                                              |
| D    | wave D xong                                          | CI full: mọi spec mới xanh; spec đỏ còn lại **cũng đỏ trên run nền** + dòng `FIX-TEST-w4.md` theo **từng test**; đột biến SPEC §11.1 đã chạy; báo Owner                                                                                                                                                                                                            |

OQ-W4-7 = A (Owner 27/11): CI đầy đủ chạy tay ở **mỗi** cổng.

## 2. Đồ thị phụ thuộc và làn song song

```text
Cổng 0 ──► WAVE A (song song) ───────────────► Cổng A (C0) ──► WAVE B (song song) ──────────────► Cổng B ──► WAVE C (C1 ‖ C2) ──────────► Cổng C ──► WAVE D ─────► Cổng D
           A-DB      (M1+M2, migration)                         B-CORE   ◄─ A-DB, A-POL1                       C-SUBMIT   ◄─ B-CORE, B-SUBMIT-R          D-MOBILE ◄─ C-*
           A-T1      (đặc tả, chỉ test)                         B-REPLY  ◄─ A-DB, A-POL1                       C-NEED     ◄─ B-CORE, B-NEED-R, B-REPLY   D-SEED   ◄─ C-SUBMIT, C-NEED, B-REPLY
           A-POL1    (policy thuần)                             B-SUBMIT-R ◄─ A-T1 (C0)                        C-SPEND    ◄─ B-CORE, B-SPEND-R           D-DOCS   ◄─ mọi gói
           A-POL2    (policy thuần + W4-12)                     B-NEED-R   ◄─ A-T1 (C0)                        C-WITHDRAW ◄─ B-CORE
                                                                B-SPEND-R  ◄─ A-T1 (C0), A-POL2                C-BATCH    ◄─ B-CORE, B-REPLY, A-POL1
                                                                                                               C-CONV     ◄─ A-DB, A-POL1
                                                                                                               C-VIEW     ◄─ B-CORE, B-REPLY
                                                                                                               C-LISTS    ◄─ B-CORE
```

- Trong một wave, các gói **không phụ thuộc nhau** (chỉ phụ thuộc wave trước) và **không chung file** (trừ file gộp — mục 3.2).
- Integration của một gói được gọi route của gói **cùng wave hoặc wave trước** (chạy ở CI của cổng, sau khi cả wave đã gộp) — không gọi route của wave sau.

### 2.1. Gói KHÔNG được song song — và vì sao

| Cặp / nhóm                             | Lý do                                                                                                                                 | Cách xếp                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Mọi việc chạm `prisma/**`              | migration phải tuần tự (số thứ tự, drift `prisma migrate diff`, client sinh lại); hai gói sửa `requests.prisma` là xung đột chắc chắn | **một** gói A-DB làm M1 rồi M2; gói khác cần migration ⟹ dừng |
| A-T1 → B-SUBMIT-R, B-NEED-R, B-SPEND-R | refactor chỉ an toàn khi spec đặc tả đã **xanh trên CI** (LUẬT CỨNG 2, C0) — unit xanh trên máy chưa đủ vì integration đặc tả cần DB  | wave B sau cổng A                                             |
| A-DB → mọi gói dùng model mới          | Prisma client phải có `RequestTicket`, `AccessRequestReply`, `ticketId` mới typecheck                                                 | wave B, C sau cổng A                                          |
| B-SUBMIT-R → C-SUBMIT                  | cùng file `request-intake/access-request.service.ts` (tách bốn phần rồi mới thêm `ticket`)                                            | hai wave                                                      |
| B-NEED-R → C-NEED; B-SPEND-R → C-SPEND | route nhiều mục dùng chữ ký `decide(…, judged?)` / `spendItemOutcome` vừa tách                                                        | hai wave                                                      |
| B-CORE → mọi gói C                     | `request-ticket.dto.ts` (mọi schema), `RequestTicketRepo`, `AccessRequestRecord.ticket`                                               | wave C sau cổng B                                             |
| W4-07 lô + W4-10 (C-BATCH một gói)     | cùng `spend-submission/spend-batch.service.ts` (thứ tự xử lý và ghi chú trình lại cùng vòng lặp)                                      | gộp thành một gói, không tách                                 |
| D-* sau C                              | mobile, seed gọi route phiếu (#1, #3) và gửi lại có ghi chú                                                                           | wave D                                                        |
| Hai subagent cùng một file gộp         | xung đột dòng thêm (module, aggregator) — chấp nhận, **orchestrator** gộp ở cổng                                                      | mục 3.2                                                       |

## 3. Bảng file → gói

Mỗi file thuộc **đúng một** gói (cột _Gói_), trừ file gộp (mục 3.2). Đường dẫn: `m/` = `src/modules/requests/`, `ti/` = `test/integration/requests/`, `th/` =
`test/http/requests/`, `ts/` = `test/support/`. `(+spec)` = spec cùng tên cạnh file.

### 3.1. File của gói

| File                                                                                                                                                                                                                                                      | Gói                                              | Wave   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| `prisma/models/requests.prisma`, `prisma/models/organization.prisma`                                                                                                                                                                                      | A-DB                                             | A      |
| `prisma/migrations/20261210000000_w4_request_tickets/migration.sql`, `…/20261210000100_w4_access_request_replies/migration.sql`                                                                                                                           | A-DB                                             | A      |
| `src/infrastructure/database/database-role-judgement.ts` (+spec)                                                                                                                                                                                          | A-DB                                             | A      |
| `ti/request-ticket-schema.integration-spec.ts`, `ti/request-reply-schema.integration-spec.ts`                                                                                                                                                             | A-DB                                             | A      |
| **mới** `ts/request-ticket-harness.ts`                                                                                                                                                                                                                    | A-T1                                             | A      |
| **mới** `m/request-intake/access-request.service.spec.ts`, `m/need-decision/need-decision.service.spec.ts`, `m/spend-approval/spend-decision.service.spec.ts`                                                                                             | A-T1 → (thêm ca) B-SUBMIT-R, B-NEED-R, B-SPEND-R | A → B  |
| **mới** `ti/request-single-characterization.integration-spec.ts`                                                                                                                                                                                          | A-T1                                             | A      |
| `m/spend-approval/spend-batch-decision.service.spec.ts` (chỉ **thêm** ca `RETRYABLE`, `COMMITMENT_NOT_HOLDABLE` nếu chưa có — I-4)                                                                                                                        | A-T1 → B-SPEND-R                                 | A → B  |
| **mới** `m/request-ticket/request-ticket.policy.ts` (+spec)                                                                                                                                                                                               | A-POL1                                           | A      |
| **mới** `m/request-reply/request-reply.types.ts`, `m/request-reply/request-reply.policy.ts` (+spec)                                                                                                                                                       | A-POL1                                           | A      |
| **mới** `m/spend-submission/spend-batch-order.policy.ts` (+spec)                                                                                                                                                                                          | A-POL1                                           | A      |
| `m/access-request/withdrawal.policy.ts` (+spec có sẵn)                                                                                                                                                                                                    | A-POL2                                           | A      |
| **mới** `m/spend-approval/spend-item-outcome.policy.ts` (+spec)                                                                                                                                                                                           | A-POL2                                           | A      |
| **mới** `ti/head-withdraw-submission-queue.integration-spec.ts`                                                                                                                                                                                           | A-POL2                                           | A      |
| **mới** `m/request-ticket/request-ticket.repo.ts`, `.types.ts`, `.errors.ts`, `.http-errors.ts` (+spec), `.dto.ts` (+spec), `.mapper.ts` (+spec)                                                                                                          | B-CORE                                           | B      |
| `m/access-request/access-request.repo.ts`, `access-request.types.ts`, `access-request-record.mapper.ts`                                                                                                                                                   | B-CORE                                           | B      |
| `m/spend-effects/spend-effects.service.spec.ts` (`baseRequest` `:66-98`), `m/requests-work-facade.module.spec.ts` (`:257`) — **chỉ fixture test**: thêm `ticket: null` vì `AccessRequestRecord.ticket` bắt buộc (I-3; ngoại lệ của danh sách cấm SPEC §9) | B-CORE                                           | B      |
| **mới** `ti/request-ticket-repo.integration-spec.ts`                                                                                                                                                                                                      | B-CORE                                           | B      |
| **mới** `m/request-reply/request-reply.repo.ts`                                                                                                                                                                                                           | B-REPLY                                          | B      |
| `m/request-intake/request-resubmission.service.ts` (+spec có sẵn), **mới** `m/request-intake/request-resubmission.dto.ts`                                                                                                                                 | B-REPLY                                          | B      |
| `m/request-submission/access-requests.controller.ts` (+spec có sẵn)                                                                                                                                                                                       | B-REPLY                                          | B      |
| `m/access-request/access-request.errors.ts`, `access-request.http-errors.ts`                                                                                                                                                                              | B-REPLY                                          | B      |
| **mới** `ti/request-resubmission-reply.integration-spec.ts`; `th/one-step-resubmission.http-spec.ts`                                                                                                                                                      | B-REPLY                                          | B      |
| `ti/need-checklist…`, `ti/assessment-checklist…`, `ti/request-status-notifications…`, `ti/requester-became-head….integration-spec.ts` (chỉ ca gửi lại sau _Trả về của người_)                                                                             | B-REPLY                                          | B      |
| `m/request-intake/access-request.service.ts` (tách bốn phần)                                                                                                                                                                                              | B-SUBMIT-R → C-SUBMIT                            | B → C  |
| `m/access-request/request-facts.service.ts` (**chỉ thêm** `assessParty`); **mới** `m/request-intake/request-facts-party.service.spec.ts`                                                                                                                  | B-SUBMIT-R                                       | B      |
| `m/need-decision/need-decision.service.ts` (`judged?`)                                                                                                                                                                                                    | B-NEED-R                                         | B      |
| `m/spend-approval/spend-batch-decision.service.ts` (+spec có sẵn — không đổi kỳ vọng)                                                                                                                                                                     | B-SPEND-R                                        | B      |
| **mới** `m/request-ticket-submission/request-tickets.controller.ts`, `request-ticket-submission.service.ts` (+spec), `request-ticket-precheck.service.ts` (+spec)                                                                                         | C-SUBMIT                                         | C      |
| `m/request-intake/access-request-submission.mapper.ts` (+spec có sẵn)                                                                                                                                                                                     | C-SUBMIT                                         | C      |
| **mới** `ti/request-ticket-submit…`, `ti/request-ticket-head….integration-spec.ts`; **mới** `th/request-tickets.http-spec.ts`                                                                                                                             | C-SUBMIT                                         | C      |
| **mới** `m/need-decision/ticket-need-decisions.controller.ts`, `ticket-need-decision.service.ts` (+spec)                                                                                                                                                  | C-NEED                                           | C      |
| **mới** `ti/request-ticket-need-decision.integration-spec.ts`                                                                                                                                                                                             | C-NEED                                           | C      |
| **mới** `m/spend-approval/ticket-spend-decisions.controller.ts`, `ticket-spend-decision.service.ts` (+spec)                                                                                                                                               | C-SPEND                                          | C      |
| **mới** `ti/request-ticket-spend-decision…`, `ti/request-ticket-grant-in-charge….integration-spec.ts`                                                                                                                                                     | C-SPEND                                          | C      |
| **mới** `m/withdraw/ticket-withdrawals.controller.ts`, `ticket-withdrawal.service.ts` (+spec)                                                                                                                                                             | C-WITHDRAW                                       | C      |
| **mới** `ti/request-ticket-withdrawal.integration-spec.ts`                                                                                                                                                                                                | C-WITHDRAW                                       | C      |
| `m/spend-submission/spend-batch.service.ts` (**mới** +spec), `spend-queue.service.ts`, `spend-batch-view.service.ts`                                                                                                                                      | C-BATCH                                          | C      |
| `m/spend/spend-submission.dto.ts`, `m/spend/spend.errors.ts`, `m/spend/spend.http-errors.ts`                                                                                                                                                              | C-BATCH                                          | C      |
| **mới** `ti/spend-batch-ticket-order…`, `ti/spend-batch-reply-note….integration-spec.ts`; `ti/spend-batches.integration-spec.ts` (chỉ ca trình lại sau _Trả về_ của `C1`, nếu có)                                                                         | C-BATCH                                          | C      |
| \1, `m/reassignment/step-reassignment.service.spec.ts` (có — thêm ca)                                                                                                                                                                                     | C-CONV                                           | C      |
| **mới** `ti/request-ticket-head-conversion.integration-spec.ts`                                                                                                                                                                                           | C-CONV                                           | C      |
| **mới** `m/request-ticket-view/request-ticket-view.controller.ts`, `request-ticket-view.service.ts` (+spec)                                                                                                                                               | C-VIEW                                           | C      |
| `m/access-request/access-request.dto.ts`; `m/request-view/access-request.mapper.ts` (**mới** +spec), `access-request-query.service.ts`                                                                                                                    | C-VIEW                                           | C      |
| **mới** `ti/request-ticket-view.integration-spec.ts`, `th/request-ticket-get.http-spec.ts`; `th/access-request-get.http-spec.ts` (có ⟹ thêm ca, chưa có ⟹ tạo)                                                                                            | C-VIEW                                           | C      |
| `m/my-requests/my-requests.service.ts`, `my-requests.dto.ts` (+spec), `my-requests.mapper.ts`                                                                                                                                                             | C-LISTS                                          | C      |
| `m/need-decision-queue/need-decision-queue.service.ts`, `.dto.ts`, `.mapper.ts` (+spec)                                                                                                                                                                   | C-LISTS                                          | C      |
| `m/spend-approval-view/spend-approval-queue.service.ts`, `spend-approval.dto.ts`, `spend-approval.mapper.ts` (+spec)                                                                                                                                      | C-LISTS                                          | C      |
| `ti/mobile-employee-requests…`, `ti/mobile-need-decision…`, `ti/mobile-spend-approval….integration-spec.ts`, `test/integration/identity-access/mobile-session-roles.integration-spec.ts`                                                                  | D-MOBILE                                         | D      |
| `src/cli/seed/steps/request-tickets.steps.ts` (**mới** +spec) hoặc `request-actions.ts` (+spec), danh sách bước seed, `src/cli/seed/fixture/shared-demo-v4/requests.ts`, `docs/guides/seed.md`                                                            | D-SEED                                           | D      |
| `docs/rules/database-business.md` (E5), `m/README.md` (`FIX-TEST-w4.md` **chỉ orchestrator** ghi — M-7)                                                                                                                                                   | D-DOCS                                           | D      |
| `m/requests.module.ts` (bỏ `controllers`, thêm `exports`), **mới** `m/requests-http.module.ts`, `src/app/app.module.ts`, `src/app/app.module.spec.ts`                                                                                                     | **G-HTTP** (gói vá của orchestrator)             | cổng A |

### 3.2. File gộp (orchestrator giữ)

Gói **chỉ thêm dòng** (import, provider, spread một mảng mảnh) trong nhánh của mình để bộ kiểm nhanh xanh; ở cổng **orchestrator** giải xung đột (giữ mọi dòng
thêm của mọi gói) và **sinh lại** file sinh:

| File                                                                                                                                 | Gói thêm gì                                                                                                                                                  | Cổng làm gì                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `openapi.json`                                                                                                                       | `pnpm openapi:export` trong nhánh gói                                                                                                                        | xung đột ⟹ lấy một bên rồi `pnpm openapi:export` lại; `git diff --stat` chỉ ở operation của wave |
| `docs/generated/module-graph.md`, `docs/generated/routes.md`                                                                         | `pnpm arch:graph`/`arch:routes` khi thêm route                                                                                                               | sinh lại `pnpm arch:graph && pnpm arch:routes`; `pnpm arch:docs:check` exit 0                    |
| `m/requests.module.ts` (provider, `exports`), `m/requests-http.module.ts` (controller) — sau G-HTTP                                  | dòng import + provider (module) / controller (http module) của gói                                                                                           | giữ mọi dòng; `pnpm arch:routes` không mất route                                                 |
| `ts/api-collection-registry-nested.ts`, `ts/api-collection-registry-events.ts`                                                       | import + spread mảng của file mảnh `ts/api-collection-registry-nested-w4-<gói>.ts` và `ts/api-collection-registry-events-w4-<gói>.ts`                        | giữ mọi dòng                                                                                     |
| `ts/openapi-example-manifest.ts`, `ts/api-coverage-manifest.ts`, `ts/openapi-example-route-codes-requests.ts`, `…-requests-spend.ts` | import + spread file mảnh `ts/openapi-example-{route-codes,messages}-w4-<gói>.ts`, `ts/api-coverage-manifest-w4-<gói>.ts` (tiền lệ `*-wave3-tech.ts`, DL-20) | giữ mọi dòng                                                                                     |
| `package.json`, `pnpm-lock.yaml`                                                                                                     | **không** sửa                                                                                                                                                | cần dependency ⟹ dừng (CODE-PROMPT §5)                                                           |
| `PROGRESS-biz.md`, `OVERNIGHT-DECISIONS-biz.md`, `FIX-TEST-w4.md`                                                                    | **không** sửa (ghi ở `pkg/<gói>.md`)                                                                                                                         | chép từ `pkg/<gói>.md`                                                                           |
| `ts/request-ticket-harness.ts` sau cổng A                                                                                            | **không** sửa (cần ⟹ _Bàn giao_)                                                                                                                             | "gói vá" tuần tự giữa hai wave, commit `test(requests): …harness… (redesign W4 gate <x>)`        |

## 4. Bộ kiểm nhanh (mỗi gói, mỗi commit — trong worktree của gói)

Theo repo skill `be-quick-check` + phần đợt 4. Mong đợi mỗi lệnh exit 0; jest `0 failed`; `openapi.json` chỉ đổi ở operation của gói.

```text
pnpm typecheck
pnpm exec eslint <mọi file .ts đã sửa/thêm>          # nhanh hơn pnpm lint; cổng chạy pnpm lint đủ
pnpm exec prettier --check <mọi file đã sửa/thêm>
pnpm arch:check
pnpm arch:capabilities --module requests
pnpm rules:check                                     # + pnpm rules:format khi sửa docs/rules, README module
pnpm test:gates
pnpm openapi:export && git --no-pager diff --stat openapi.json
pnpm arch:routes && pnpm arch:docs:check             # gói thêm/đổi route
CI=true pnpm test -- <mọi *.spec.ts đã chạm/thêm của gói>
pnpm prisma:validate && pnpm prisma:generate         # chỉ A-DB
```

- Không chạy `pnpm check`, `test:http`, `test:integration`, `test:e2e`, seed, Docker, migration ở máy. Integration/http **viết** ở gói, trạng thái `viết, chưa
chạy` tới khi CI của cổng xanh.
- Luật mới: unit đỏ trước rồi xanh. Mỗi bảng ca SPEC ⟹ một `it.each`. Ca diệt đột biến SPEC §11.1 chạy tay một lần trong gói sở hữu, ghi `pkg/<gói>.md`; chạy xong **phải** `git restore <file>` rồi chạy lại spec xanh trước
  commit.

## 5. Khuôn bước của một gói (subagent — áp mọi gói; mục gói chỉ ghi phần riêng)

- [ ] **0. Chuẩn bị** — trong worktree `D:/FPT/FALL2026/Code/w4-<gói>`: `git --no-pager status --short` sạch; `git --no-pager log --oneline -1` = nền wave;
      `pnpm install --frozen-lockfile --prefer-offline`; `pnpm prisma:generate`. Đọc SPEC § của gói, mục gói ở PLAN, dòng DELTA được dẫn. Mở
      `docs/reviews/redesign-w4-2026-11-25/pkg/<gói>.md` (mẫu ở cuối PROGRESS-biz.md), ghi `đang làm`, sha nền.
- [ ] **1. Viết test đỏ** — đúng **Test trước** của gói (tên + khẳng định, mã lỗi + status, `it.each` một bảng ca). Test **đi qua code thật** của gói: unit
      gọi service/policy thật, chỉ mock **biên** (repo, API module khác), không mock chính thứ đang kiểm; không tự dựng kỳ vọng bằng chính công thức.
- [ ] **2. Chạy, thấy đỏ đúng lý do** — `CI=true pnpm test -- <spec của gói>`: FAIL vì `Cannot find module`/`is not a function`/assertion trên mã mới — không vì
      cú pháp/import/fixture. Gói refactor (B-SUBMIT-R, B-NEED-R, B-SPEND-R, C-BATCH phần lô, C-CONV): **2r** — trước khi sửa, chạy spec đặc tả A-T1 + spec cũ
      của đoạn refactor ⟹ PASS; liệt kê mọi lần kiểm/guard/throw/`catch` của đoạn cũ vào `pkg/<gói>.md` mục `Kiểm giữ:`.
- [ ] **3. Code tối thiểu** — đúng chữ ký **Interfaces**, chỉ file của gói (+ dòng thêm ở file gộp). Cần sửa file của gói khác ⟹ **dừng phần đó**, ghi _Bàn giao_.
- [ ] **4. Chạy lại, thấy xanh** — cùng lệnh bước 2 + spec cũ gói liệt kê: `Tests: N passed`, `0 failed`. Spec cũ/đặc tả:
      `git --no-pager diff <sha nền> -- <spec cũ>` chỉ có dòng **thêm** (không đổi kỳ vọng, không xóa ca).
- [ ] **5. Integration/http** — viết đúng file ở bảng 3.1 (≤ 800 dòng, fixture SPEC §11.2 gồm phần _sau đợt 3_); đồng thời: 2 connection, barrier, lặp 20 —
      gọi **service/route thật** ở cả hai bên, không tự viết `SELECT … FOR UPDATE`. Ghi `viết, chưa chạy`.
- [ ] **6. Bộ kiểm nhanh** (mục 4) — mọi lệnh exit 0. A-DB thêm bước **M**.
- [ ] **7. Tự đối chiếu** — `git --no-pager diff <sha nền>..HEAD`; bảng **ca SPEC → test → file:line** vào `pkg/<gói>.md`; ca chưa có test ⟹ chưa `xong-unit`.
- [ ] **8. Commit + đẩy** — `git add <đúng file của gói + dòng gộp + pkg/<gói>.md>`; commit message ở **Commit** của gói (thân: W4-xx, `Test chính:`, `Kiểm giữ:`
      với gói refactor — liệt kê guard thật, không liệt kê lệnh; `D-n` nếu có); `git push -u origin feat/redesign-w4-<gói>`. **Không** merge. Trả lời
      orchestrator ≤ 30 dòng: sha, lệnh + số pass, bảng ca, D-n, _Bàn giao_.

**Bước M (A-DB — đọc `.claude/skills/create-migration/SKILL.md`):** quy ước tên/thứ tự/roll-forward/không GRANT áp nguyên; **thay** `pnpm db:migrate:dev` bằng
`prisma migrate diff` (không chạy DB). Không thêm dòng vào `scripts/verify/merged-migrations.txt`.

- [ ] M1. `git archive HEAD prisma | tar -x -C <tmp>/w4-before` (schema trước khi sửa).
- [ ] M2. Sửa `prisma/models/*.prisma`; `pnpm prisma:validate` — `The schema at prisma is valid`.
- [ ] M3. `pnpm exec prisma migrate diff --from-schema <tmp>/w4-before/prisma --to-schema prisma --script > <tmp>/gen.sql`; dán vào `migration.sql` đúng tên; thêm
      tay CHECK/trigger/comment SQL đảo ở cuối.
- [ ] M4. Sinh lại `<tmp>/gen2.sql`; `diff` với migration — chỉ khác ở dòng thêm tay; `grep -nE "GRANT|REVOKE|OWNER TO" <migration>` rỗng; `pnpm prisma:generate`.
- [ ] M5. Làm M1 trọn (commit) **rồi** mới M2 (commit thứ hai) — hai migration tuần tự trong cùng gói.

## 6. Khuôn cổng (orchestrator — áp mọi cổng A, B, C, D)

- [ ] **G1. Nhận gói** — mỗi gói của wave có trả lời + `pkg/<gói>.md` + nhánh đã push. Gói `dừng hỏi` ⟹ cổng chờ hoặc gói đó lùi sang wave sau (chỉ khi
      không gói nào của wave sau phụ thuộc nó — đồ thị mục 2).
- [ ] **G2. Tự đọc diff từng gói** (không tin báo cáo): `git --no-pager diff feat/redesign-w4-wave-<x>...feat/redesign-w4-<gói>`; đối chiếu **từng** ca SPEC của gói
      (ca → test → file:line); kiểm: chỉ file của gói (bảng 3.1) + dòng gộp; không `@Optional`/`?` phụ thuộc; không `skip`/`only`/xóa test; spec cũ chỉ thêm
      dòng; `Kiểm giữ:` khớp guard thật; OpenAPI không mã nội bộ. Thiếu ⟹ trả gói về subagent (cùng nhánh), không ghi `xong-unit`.
- [ ] **G3. Gộp** — trong worktree cổng `D:/FPT/FALL2026/Code/w4-gate` (`git -C <R> worktree add D:/FPT/FALL2026/Code/w4-gate feat/redesign-w4-wave-<x>`
      lần đầu, sau đó `git checkout feat/redesign-w4-wave-<x>`): `git merge --no-ff feat/redesign-w4-<gói>` theo **thứ tự gộp** của wave (mục 7); xung đột chỉ
      ở file gộp (mục 3.2) ⟹ giữ mọi dòng thêm; xung đột ở file khác ⟹ **dừng** (bảng 3.1 bị vi phạm).
- [ ] **G4. Sinh lại + kiểm nhanh trên nhánh làn** — `pnpm prisma:generate`; `pnpm openapi:export`; `pnpm arch:graph && pnpm arch:routes`; bộ kiểm nhanh **đầy
      đủ** (`pnpm lint` thay `eslint <file>`; `CI=true pnpm test -- src/modules/requests` cho unit của module); đếm dòng `requests.module.ts`. Commit
      `chore(requests): gate <x> merge — regenerated contract and docs (redesign W4 gate <x>)`.
- [ ] **G5. CI tay** — `git push origin feat/redesign-w4-wave-<x>`; `gh workflow run ci.yml --ref feat/redesign-w4-wave-<x>`; `gh run list`
      (nhánh `feat/redesign-w4-wave-<x>`); đỏ ⟹ `gh run view <id> --log-failed`. Phân loại **theo từng test** so với run nền (cổng 0): (a) test mới của wave đỏ ⟹ trả gói
      sở hữu sửa (logic: sửa `src`; fixture: sửa test) rồi gộp lại; (b) test cũ xanh trên nền mà đỏ ⟹ hồi quy, gói gây ra sửa; (c) test cũ đỏ cả trên nền ⟹ nợ (chỉ orchestrator ghi `FIX-TEST-w4.md`),
      ghi `FIX-TEST-w4.md` (tên test, run nền, lý do thật). Commit "fix CI" **không** thêm luật nghiệp vụ.
- [ ] **G6. Đóng cổng** — điều kiện qua (bảng _Cổng_) đủ ⟹ `git checkout feat/redesign-w4 && git merge --ff-only feat/redesign-w4-wave-<x> && git push`; gói đạt ⟹
      `xong` trong PROGRESS (chỉ khi integration/http của gói xanh trên CI); `git worktree remove D:/FPT/FALL2026/Code/w4-<gói>`; mở wave kế từ
      `feat/redesign-w4` mới.

## 7. Chi tiết gói

Mỗi gói: **Wave/Phụ thuộc**, **File** (bảng 3.1), **SPEC**, **Interfaces** (Dùng / Tạo), **Test trước**, **Kiểm riêng**, **Dừng khi**, **Commit**. Thứ tự gộp ở
cổng ghi đầu mỗi wave. Chữ ký đọc trên `20ae45ee`; lệch tên/tham số **không đổi luật** ⟹ theo code thật, ghi `D-n` tự chốt.

### Wave A — thứ tự gộp: A-DB → A-T1 → A-POL1 → A-POL2

#### A-DB — M (migration, tuần tự trong gói)

- **Phụ thuộc:** cổng 0. **SPEC:** §5 (M1, M2), §7.1 tiêu chí (1)–(3), §7.9 phần bảng.
- **Interfaces** — Tạo (mọi gói sau dựa vào, qua Prisma client): model `RequestTicket` (`request_tickets`: `id`, `organizationId`, `requesterEmployeeId`,
  `departmentId`, `submittedAt`, `createdAt`; quan hệ `items AccessRequest[]`), `AccessRequest.ticketId String?`, `ticketPosition Int? @db.SmallInt`, `ticket
RequestTicket?`, `@@unique([ticketId, ticketPosition])`, `@@index([ticketId])`; enum `AccessRequestReplyKind { REQUESTER_RESUBMISSION HEAD_RESUBMISSION }`;
  model `AccessRequestReply` (`access_request_replies`: `id`, `organizationId`, `requestId`, `kind`, `returnedStepId String?`, `note`, `authorEmployeeId`,
  `createdAt`; `@@index([requestId, createdAt(sort: Desc), id])`, `@@index([returnedStepId])`); quan hệ ngược ở `organization.prisma`.
- **Test trước:** `database-role-judgement.spec.ts` — `RUNTIME_TABLE_EXCEPTIONS.request_tickets` và `.access_request_replies` = `['INSERT', 'SELECT']` (đỏ trước).
  Integration (viết): `request-ticket-schema` — chèn qua SQL (có `monthly_price_minor` cho `PRICED` `RECURRING`): `ticket_id` có, `ticket_position` null ⟹
  23514 `access_requests_ticket_pair`; position 7 ⟹ 23514 `…_ticket_position_range`; Request `GROUP_GRANT` có `ticket_id` ⟹ 23514 `…_ticket_kind`; hai mục cùng
  `(ticket_id, position)` ⟹ 23505; `UPDATE access_requests SET ticket_id = …` ⟹ lỗi trigger; `UPDATE`/`DELETE request_tickets` ⟹ lỗi trigger.
  `request-reply-schema` — `note` `'   '` và 1001 ký tự ⟹ 23514; `UPDATE`/`DELETE access_request_replies` ⟹ lỗi trigger; `returned_step_id` null chèn được; hai
  reply cùng `returned_step_id` chèn được (không unique).
- **Kiểm riêng:** bước M (M1 → M5); `pnpm prisma:validate && pnpm prisma:generate`.
- **Dừng khi:** drift không giải được; cần đổi migration đợt 3; SQL có GRANT.
- **Commit:** `feat(requests): request ticket tables and ticket columns (redesign W4 A-DB M1)`; `feat(requests): append-only reply notes table (redesign W4 A-DB
M2)`.

#### A-T1 — M (đặc tả, **không sửa `src`** ngoài file spec mới)

- **Phụ thuộc:** cổng 0. **SPEC:** §11.1 dòng _nền_, §11.2, Trọng tâm 1.
- **Interfaces** — Tạo: `ts/request-ticket-harness.ts` export `buildTicketWorld(h: RequestHarness, opts?: { withoutHead?: boolean; withoutCostCenter?: boolean;
budget?: { baseMinor: bigint; reserveMinor: bigint } }): Promise<TicketWorld>`; `TicketWorld = { pDes; other; e1; h1; c1; it1; it2; ccDes; plans: { figmaFull;
figmaDev; miro; notion; slack; k4DeviceKey; k1Annual; k5Internal }; today: '2026-06-01' }` — tổ chức đủ QĐ-118 (SPEC §11.2), gói `K2` có workspace + dòng giá
  tháng (một dòng sống mỗi gói), `K4` qua `POST /license-lots`, ngày cố định, `runningUncommittedMinor` của `CC-DES` = 0.
- **Test trước** (đặc tả — khẳng định hành vi **thật** của `dev` sau đợt 3, mong đợi **PASS** ngay; đỏ ⟹ sửa test cho đúng hành vi thật, không sửa `src`):
  - `access-request.service.spec.ts` (mock repo/API biên, service thật): mọi mã từ chối gửi Request đơn — `SUPER_ADMIN_CANNOT_REQUEST`, `ALREADY_HOLDS_ACCESS`,
    7 `TermRefusal` (gồm `K1_ANNUAL_*`), `OPEN_REQUEST_EXISTS`, `OPEN_LIMIT_REACHED`, `PLAN_BOUND_TO_DEVICE`, `NO_DEPARTMENT`, `EMPLOYEE.NOT_STARTED`,
    `FINANCE.SETUP_INCOMPLETE`; thứ tự gọi `lockEligible` → `limits.lock` → `assess` → `insert` → `auditSubmitted` → `spendRouting.start`; **Trọng tâm 1**:
    không Cost Center + gói `DEVICE_KEY` ⟹ `PLAN_BOUND_TO_DEVICE`; **I-1**: gói `K5` nội bộ, phòng không Cost Center ⟹ gửi được (không
    `FINANCE.SETUP_INCOMPLETE` — `request-facts.service.ts:177-180`, `QĐ-87g`(2)).
  - `need-decision.service.spec.ts`: `NOT_FOUND`, `GROUP_USES_LINES`, `OWN_REQUEST`, `NOT_THE_ASSIGNEE`, `STEP_NOT_PENDING`; chấm checklist một lần rồi ghi một bản.
  - `spend-decision.service.spec.ts`: `DECIDED`; `BOUNCED` `to: 'HEAD'` (hai bước) / `'REQUESTER'` (một bước); `NO_SPEND_STEP`.
  - `request-single-characterization.integration-spec.ts` (route thật): gửi Request đơn mọi mã trên + status; Request một bước trưởng phòng ba kết cục ngân sách
    (qua, dự phòng, bị chặn); quyết lô chi `ALREADY_DECIDED`, `NO_SPEND_STEP`, `RECHECKED_RETURNED_TO_HEAD`, `GROUP_NEEDS_LINES` (chỉ mã route thật
    trả được — I-4; `RETRYABLE`, `COMMITMENT_NOT_HOLDABLE` khẳng định ở unit `spend-batch-decision.service.spec.ts`); `K5` nội bộ ở phòng không Cost Center ⟹ 201; gửi lại Request chỉ bị chặn ⟹ 200; Request mới có `monthly_price_minor` = giá tháng của dòng.
- **Kiểm riêng:** `CI=true pnpm test -- <ba spec unit>` PASS; integration ghi `viết, chạy ở cổng A`.
- **Dừng khi:** hành vi thật khác SPEC theo cách đổi luật (ghi `D-n` _cần Owner_, đặc tả theo hành vi thật).
- **Commit:** `test(requests): characterization specs for single submit, need decision and spend decision (redesign W4 A-T1)`.

#### A-POL1 — S (policy thuần, không dùng model mới)

- **Phụ thuộc:** cổng 0. **SPEC:** §7.2 bước 3 (GH-2, trùng), §7.4 `status`, §7.7 thứ tự, §7.9 bước 2.
- **Interfaces** — Tạo:
  - `request-ticket.policy.ts`: `MAX_TICKET_ITEMS = 6`; `findDuplicates(items: readonly { position: number; planId: string }[]): { position: number;
duplicateOfPosition: number }[]` (trùng = cùng `planId` — OQ-W4-5 = A); `openLimitRefusals(input: { sentThisWeek: number; weeklyLimit: number; items: readonly { position: number; refused:
boolean; exempt: boolean }[] }): number[]`; `ticketStatusOf(states: readonly AccessRequestState[]): 'IN_PROGRESS' | 'DONE'` (theo `ENDED_STATES`);
    `orderByPosition<T extends { position: number }>(items: readonly T[]): T[]`.
  - `request-reply.types.ts`: `ReplyKind = 'REQUESTER_RESUBMISSION' | 'HEAD_RESUBMISSION'`; `HumanReturn = { kind: 'NEED' | 'IT_ASSESSMENT' | 'SPEND'; stepId:
string; closedAt: Date }`; `LatestReply = { kind: ReplyKind; note: string; author: { id: string; name: string }; createdAt: Date }`.
  - `request-reply.policy.ts`: `pendingHumanReturn(input: { returns: readonly HumanReturn[]; repliedStepIds: ReadonlySet<string> }): HumanReturn | null` (lần mới
    nhất theo `closedAt`; đã có reply ⟹ `null`, không lùi về lần cũ).
  - `spend-batch-order.policy.ts`: `processingOrder(items: readonly { requestId: string; ticket: { id: string; position: number } | null }[]): string[]`;
    `restoreBodyOrder<T extends { requestId: string }>(bodyIds: readonly string[], rows: readonly T[]): T[]`.
- **Test trước:** `request-ticket.policy.spec.ts` — `it.each` `ticketStatusOf` (mỗi state `ENDED_STATES` ⟹ `DONE`; `[COMPLETED, REJECTED,
AWAITING_SPEND_DECISION]` ⟹ `IN_PROGRESS`); `findDuplicates` (cùng `planId` ở 1, 2 ⟹ `[{position:2,duplicateOfPosition:1}]`; cùng ứng dụng khác gói — kể cả
  _— năm_ / _— tháng_ `L-1` ⟹ `[]`); `openLimitRefusals` (`weeklyLimit: 10`): đã gửi 9, hai mục ⟹ `[2]`; đã gửi 8, mục 3 `refused` ⟹ `[]`; đã gửi 10, một mục ⟹ `[1]`; đã gửi 10, một
  mục `exempt` ⟹ `[]`; đã gửi 9, `[exempt, ok, ok]` ⟹ `[3]` (Trọng tâm 3); đột biến `≥`→`>` làm ca "đã gửi 9, hai mục" đỏ. `request-reply.policy.spec.ts` —
  `it.each` một lần `NEED`/`IT_ASSESSMENT`/`SPEND` chưa reply ⟹ đúng lần đó; không lần nào ⟹ `null`; mới nhất đã reply ⟹ `null`; cũ chưa reply + mới đã reply ⟹
  `null`. `spend-batch-order.policy.spec.ts` — [`R3`(PH1#3), `X`, `R1`(PH1#1)] ⟹ [`R1`, `X`, `R3`]; [`A`(PH1#2), `B`(PH2#1), `C`(PH1#1)] ⟹ [`C`, `B`, `A`];
  không phiếu ⟹ giữ; `restoreBodyOrder` trả đúng thứ tự thân cả ba ca.
- **Dừng khi:** cần model mới (sai wave) — dùng kiểu chuỗi như trên.
- **Commit:** `feat(requests): pure ticket, reply and batch-order policies (redesign W4 A-POL1)`.

#### A-POL2 — S (W4-12 trọn + policy kết quả chi)

- **Phụ thuộc:** cổng 0. **SPEC:** §7.12 (OQ-W4-2 = A), §7.6 bước 4.
- **Interfaces** — Tạo: `HEAD_MAY_WITHDRAW_AT` thêm đúng `'NOT_SUBMITTED'`; `spendItemOutcome(input: { context: 'BATCH' | 'TICKET'; decision: 'APPROVE' | 'REJECT'
| 'RETURN'; result?: SpendDecisionResult; error?: unknown }): SpendItemOutcome | null` với `SpendItemOutcome = { kind: 'RESULT'; outcome: 'APPROVED' |
'REJECTED' | 'RETURNED' | 'SKIPPED' | 'RETRYABLE'; reason: string | null } | { kind: 'NO_OPEN_STEP' } | { kind: 'GROUP_USES_LINES' }` (thuần; `null` ⟹
  người gọi ném lại — gồm `AccessRequestNotPriceableError`, DL-4).
- **Test trước:** `withdrawal.policy.spec.ts` (có — thêm) — `it.each` trưởng phòng rút: `NOT_SUBMITTED`, `BLOCKED`, `RESERVE_CONFIRMATION` ⟹ được;
  `RETURNED_TO_REQUESTER` (ca âm), `WAITING_SPEND_DECISION`, `null` ⟹ không. `spend-item-outcome.policy.spec.ts` — `it.each` mỗi nhánh `catch` của
  `decideOne` (`spend-batch-decision.service.ts:95-121`): `TransientDatabaseError` ⟹ `RETRYABLE TRANSIENT_FAILURE`; `AccessRequestNotFoundError` ⟹ `SKIPPED
NO_SPEND_STEP`; `AccessRequestGroupUsesLinesError` ⟹ `{kind:'GROUP_USES_LINES'}`; lỗi không còn bước ⟹ `{kind:'NO_OPEN_STEP'}`; `SpendDecisionRefusedError`
  ⟹ `SKIPPED` + `reason` của lỗi; `BudgetCommitmentNotHoldableError`/`…ExistsError` ⟹ `SKIPPED COMMITMENT_NOT_HOLDABLE`; `BOUNCED` + `BATCH` (mọi `to`) ⟹ `SKIPPED
RECHECKED_RETURNED_TO_HEAD`; `BOUNCED` `to: 'REQUESTER'` + `TICKET` ⟹ `SKIPPED RECHECKED_RETURNED_TO_REQUESTER`; `DECIDED` ⟹ `RESULT` với `decision`; `new
Error('x')` và `AccessRequestNotPriceableError` ⟹ `null`. Integration (viết): `head-withdraw-submission-queue` — `R4` (đã duyệt nhu cầu, chưa trình), `R5` (bị
  `C1` trả về); `H1` rút không lý do ⟹ mã `REASON_REQUIRED` hiện có; có lý do ⟹ cả hai `WITHDRAWN`, không khoản cam kết, người xin có thông báo rút; ca âm
  `RETURNED_TO_REQUESTER` ⟹ từ chối như hiện có.
- **Commit:** `feat(requests): head withdraws from the submission queue; pure spend item outcome (redesign W4 A-POL2)`.

### Cổng A (C0) — mục 6; CI phải có `request-single-characterization` xanh

### Cổng A — gói vá G-HTTP (orchestrator, tuần tự, sau gộp wave A, trước CI cổng A)

- **Vì sao:** `requests.module.ts` 460/500 dòng code; wave B–C thêm ~13 provider/controller (DL-11). Tách **một lần** trước khi các gói song song chạm
  file này (M-2).
- **File:** `m/requests.module.ts`, **mới** `m/requests-http.module.ts` (tên chuẩn `<m>-http.module.ts`, `docs/rules/module-structure.md:165`),
  `src/app/app.module.ts` (import `RequestsHttpModule`), `src/app/app.module.spec.ts`, `docs/generated/*` (sinh lại).
- **Làm:** chuyển **toàn bộ 28 controller** (`requests.module.ts:254-…`) sang `RequestsHttpModule` (`imports: [RequestsModule, …]`); `RequestsModule` thêm
  vào `exports` đúng các provider mà controller inject; worker (`src/worker/*`) không đổi.
- **Kiểm giữ:** `pnpm arch:routes` + `git --no-pager diff docs/generated/routes.md` **rỗng** (không mất/thêm route); `pnpm openapi:export` diff rỗng;
  `pnpm arch:check`, `pnpm arch:graph && pnpm arch:docs:check`, `pnpm test:gates`, `CI=true pnpm test -- src/app src/worker src/modules/requests` xanh.
- **Commit:** `refactor(requests): move request controllers to an http module (redesign W4 gate A G-HTTP)`.

### Wave B — B1: B-CORE, B-REPLY, B-SUBMIT-R, B-NEED-R; B2: B-SPEND-R (M-1) — thứ tự gộp: B-CORE → B-REPLY → B-SUBMIT-R → B-NEED-R → B-SPEND-R

#### B-CORE — M

- **Phụ thuộc:** cổng A (A-DB, A-POL1). **SPEC:** §7.1, §7.4 (dạng đọc, `refsOf`), §7.11 (mục phiếu), §8.1, §8.3.
- **Interfaces** — Dùng: model A-DB; `ticketStatusOf`, `orderByPosition`, `LatestReply` (A-POL1). Tạo:
  - `RequestTicketRepo`: `insert(tx: DbTx, input: { organizationId: string; requesterEmployeeId: string; departmentId: string; submittedAt: Date }): Promise<{ id:
string }>`; `view(tx: DbTx, ticketId: string): Promise<RequestTicketView | null>` (một câu: phiếu + mục sắp `ticket_position` + gói + `latestReply` đọc thẳng
    `access_request_replies`); `itemsOf(tx: DbTx, ticketId: string): Promise<{ requestId: string; position: number }[]>`; `refsOf(requestIds: readonly string[],
tx?: DbTx): Promise<Map<string, TicketRef>>` (một câu).
  - `request-ticket.types.ts`: `TicketRef = { id: string; position: number; itemCount: number }`; `RequestTicketView` (dạng `ticket` SPEC §8.1).
  - `request-ticket.errors.ts`: `RequestTicketNotFoundError`, `RequestTicketNotRequesterError`, `RequestTicketTooManyItemsError(count: number)`,
    `RequestTicketItemsRefusedError(items: TicketItemRefusal[])` + `REQUEST_TICKET_ERROR_EXAMPLES`; `.http-errors.ts` ánh xạ 404/403/422/422.
  - `request-ticket.dto.ts`: `ticketSchema` (`items` `.max(6)`), `ticketRefSchema`, `ticketItemReasonSchema` (16 giá trị) + `ticketItemRefusalSchema`,
    `ticketSubmitBodySchema` (`items` 1…20, mỗi mục như `submitBodySchema` `access-request.dto.ts:33`), `ticketDecideBodySchema` (`requestIds` uuid 1…6 không trùng,
    `decision`, `reason?`, `checklist`), `ticketWithdrawBodySchema` (`reason?`), `ticketNeedResultSchema`, `ticketSpendResultSchema`, `ticketWithdrawResultSchema`
    (enum SPEC §8.3).
  - `request-ticket.mapper.ts`: `toTicketWire(view: RequestTicketView, visibleRequestIds?: ReadonlySet<string>): TicketWire`.
  - `AccessRequestRecord.ticket: TicketRef | null`; `NewAccessRequest.ticket?: { id: string; position: number }` (`AccessRequestRepo.insert` ghi hai cột);
    `SELECT_REQUEST` thêm `ticket` (id, `_count` mục), `toRecord` (`:151`) ánh xạ.
- **Test trước:** `request-ticket.http-errors.spec.ts` — `it.each` 4 lỗi ⟹ 404/403/422/422 + `code`; `TOO_MANY_ITEMS` `details: { max: 6, count: 7 }`.
  `request-ticket.dto.spec.ts` — `ticketSubmitBodySchema` 6 mục hợp lệ; 0 và 21 ⟹ lỗi; mục 2 `businessReason: "  "` ⟹ path `items.1.businessReason`; 7 và 20
  qua schema (lỗi riêng ở service); `ticketDecideBodySchema` `requestIds` trùng / `[]` / 7 id ⟹ lỗi (Trọng tâm 4); `ticketItemReasonSchema.options` gồm đúng 16
  giá trị và chứa mọi `TermRefusal` (đột biến bỏ một ⟹ đỏ). `request-ticket.mapper.spec.ts` — `items` theo `position`, `status` qua `ticketStatusOf`, lọc mục
  không xem được giữ `status`/`itemCount` của cả phiếu (RB-11). Integration (viết) `request-ticket-repo` — qua `RequestTicketRepo`/`AccessRequestRepo` thật:
  Request đơn đọc ra `ticket === null` (§7.1 (4)); phiếu 3 mục ⟹ `view` một câu (`query-count` helper) sắp `position`; `refsOf` 3 id ⟹ 3 ref cùng `itemCount: 3`.
- **Dừng khi:** `access-request-record.mapper.ts` > 500 dòng code (không tách file trong `access-request/` — đủ 25).
- **Fixture (I-3):** `AccessRequestRecord.ticket` bắt buộc ⟹ thêm `ticket: null` vào literal ở `spend-effects.service.spec.ts:66-98` và
  `requests-work-facade.module.spec.ts:257` (fixture dùng `as unknown as AccessRequestRecord` không cần) — chỉ dòng thêm, không đổi khẳng định; `pnpm typecheck` là
  lệnh tìm sót.
- **Commit:** `feat(requests): core ticket capability and ticket on access request record (redesign W4 B-CORE)`.

#### B-REPLY — M

- **Phụ thuộc:** cổng A (A-DB, A-POL1). **SPEC:** §7.9 (ca A, B, D–G), §8.2 `accessRequestResubmit`, §9 test cũ.
- **Interfaces** — Dùng: `pendingHumanReturn`, `HumanReturn`, `LatestReply` (A-POL1). Tạo:
  - `RequestReplyRepo`: `insert(tx: DbTx, input: { organizationId: string; requestId: string; kind: ReplyKind; returnedStepId: string | null; note: string;
authorEmployeeId: string }): Promise<{ id: string }>`; `latestOf(requestId: string, tx?: DbTx): Promise<LatestReply | null>`; `latestOfMany(requestIds: readonly
string[], tx?: DbTx): Promise<Map<string, LatestReply>>`; `repliedStepIds(tx: DbTx, requestId: string): Promise<Set<string>>`; `humanReturnsOf(tx: DbTx,
requestId: string): Promise<HumanReturn[]>` (bước nhu cầu `CLOSED` + approval `RETURNED`; bước `IT_ASSESSMENT` cuối đóng vì trả về; `spend_decisions`
    `RETURNED`); `spendReturnsAwaitingReply(requestIds: readonly string[], tx?: DbTx): Promise<Set<string>>` (một câu — cho C-BATCH).
  - `AccessRequestReplyNoteRequiredError(returnedStepId: string)` ⟹ 422 `ACCESS_REQUEST.REPLY_NOTE_REQUIRED` `details: { returnedStepId }` + example.
  - `request-resubmission.dto.ts`: `resubmitBodySchema = z.strictObject({ replyNote: z.string().trim().min(1).max(1000).optional() })`;
    `RequestResubmissionService.resubmit(actor: AuthenticatedPrincipal, id: string, input: { replyNote?: string } = {})`.
- **Test trước:** `request-resubmission.service.spec.ts` (có — thêm): có lần chờ, thiếu ghi chú ⟹ `ACCESS_REQUEST.REPLY_NOTE_REQUIRED`, `details.returnedStepId`
  đúng, không ghi; có ghi chú ⟹ `replies.insert` `kind: 'REQUESTER_RESUBMISSION'`, `returnedStepId` đúng, audit có `replyId`; không lần chờ + không ghi chú ⟹ như
  cũ, không `insert`; không lần chờ + có ghi chú ⟹ `insert` `returnedStepId: null`; ca cũ (chỉ bị chặn) **không đổi kỳ vọng**. `access-requests.controller.spec.ts`
  (có — thêm): thân `{}`/không thân hợp lệ; `replyNote: "   "` và 1001 ký tự ⟹ 422 `VALIDATION_ERROR`; 1000 ⟹ qua (Trọng tâm 5). Integration (viết)
  `request-resubmission-reply` ca A, B, D, E, F, G (Request đơn, route thật; G hai connection barrier lặp 20). Http `one-step-resubmission` thêm thân tùy chọn +
  422 mã riêng. Test cũ: ca gửi lại sau _Trả về của người_ ở `need-checklist`, `assessment-checklist`, `request-status-notifications`, `requester-became-head`
  thêm `replyNote` (commit dẫn SPEC §7.9; không đổi khẳng định khác); `one-step-request`, `one-step-supplement-rate` không đổi.
- **Dừng khi:** luật đòi ghi chú ở ca SPEC §7.9 bước 4 miễn (bị chặn, thiếu giá, kiểm lại).
- **Commit:** `feat(requests): reply note required after a human return on resubmission (redesign W4 B-REPLY)` — thân `Phá vỡ: accessRequestResubmit` + tên
  test cũ sửa kèm SPEC §7.9.

#### B-SUBMIT-R — S (refactor, sau C0)

- **Phụ thuộc:** cổng A (A-T1 xanh trên CI). **SPEC:** §7.2 _Refactor_, Trọng tâm 1.
- **Interfaces** — Tạo trong `AccessRequestService`: `lockSenderWithin(tx: DbTx, actor: AuthenticatedPrincipal, options: SubmitOptions):
Promise<SenderLock>` (Super Admin, bên bị loại, khóa employee, `limits.lock` — dùng chung); `checkPartyWithin(tx: DbTx, actor: AuthenticatedPrincipal,
settings: RequestSettings, options: SubmitOptions): Promise<PartyCheck>` = `lockSenderWithin` + `RequestFactsService.assessParty` — **chỉ route phiếu gọi**
  (I-1); `checkItemWithin(tx: DbTx,
party: PartyCheck, body: SubmitBodyDto, options: SubmitOptions): Promise<ItemCheck>` với `ItemCheck = { ok: true; facts: ItemFacts } | { ok: false; error:
ItemRefusalError }` (6 lớp SPEC §7.2 bước 3; `assess` giữ nguyên khối); `writeWithin(tx: DbTx, actor: AuthenticatedPrincipal, party: PartyCheck, item:
ItemFacts): Promise<{ id: string }>`; `routeWithin(tx: DbTx, actor: AuthenticatedPrincipal, requestId: string, now: Date): Promise<void>`. `submit`/`submitWithin`
  **giữ chữ ký**, gọi `lockSenderWithin` → `checkItemWithin` → `writeWithin` → `routeWithin` sao cho lỗi đầu tiên **như cũ**; **không** gọi `assessParty`. `RequestFactsService.assessParty(tx: DbTx, input: { employeeId: string; now: Date;
lockDepartment: boolean }): Promise<PartyFacts>` — **chỉ thêm**, dùng lại `requireStartedOwningUnit` + `requireUnitCostCenter` + `lockDepartmentShared`.
- **Test trước:** **2r** (spec A-T1 + `access-request-submission.mapper.spec.ts` PASS trước khi sửa); `request-facts-party.service.spec.ts` (mới, theo tiền lệ
  `request-intake/request-facts-k1-annual.service.spec.ts` vì `access-request/` đủ 25 — `D-n` tự chốt): chưa xếp phòng ⟹ `NO_DEPARTMENT`; chỉ xếp tương lai ⟹
  `EMPLOYEE.NOT_STARTED`; phòng không Cost Center ⟹ `FINANCE.SETUP_INCOMPLETE`; đủ ⟹ khóa phòng `FOR SHARE` một lần. Không thêm ca đổi kỳ vọng ở spec A-T1; ca A-T1 "`K5` nội bộ, phòng không Cost Center ⟹ gửi được" và Trọng tâm 1 phải xanh (spy: `submitWithin` không gọi
  `assessParty`).
- **Dừng khi:** một lần kiểm cũ không giữ được; spec A-T1 chỉ xanh khi đổi kỳ vọng.
- **Commit:** `refactor(requests): split single submit into party check, item check, write, route (redesign W4 B-SUBMIT-R)` — thân `Kiểm giữ:` `mayRequest`
  (`:68`, `:87`), `lockDraft` (`:88`), `lockEligible` (`:91`), `limits.lock` (`:93`), `assess` (`:96`), `requireNotHeld` (`:104`), `termRefusal` (`:105`),
  `limits.requireForOne` (`:112`), `insert(newRequestOf)` (`:128`), `auditSubmitted` (`:129`), `spendRouting.start` (`:130`).

#### B-NEED-R — S (refactor, sau C0)

- **Phụ thuộc:** cổng A. **SPEC:** §7.5 bước 3.
- **Interfaces** — Tạo: `NeedDecisionService.decide(actor: AuthenticatedPrincipal, requestId: string, input: DecisionInput & { checklist: ChecklistBody }, judged?:
JudgedNeedChecklist): Promise<AccessRequestRecord>` (`JudgedNeedChecklist` export cùng file, khuôn `JudgedSpendChecklist`; tham số tùy chọn là **đầu vào**, không
  phải phụ thuộc DI).
- **Test trước:** **2r**; `need-decision.service.spec.ts` (A-T1 — chỉ thêm): có `judged` ⟹ không gọi chấm checklist, ghi checklist với bộ đã chấm; không `judged` ⟹
  chấm một lần như cũ.
- **Commit:** `refactor(requests): need decision takes a checklist judged once (redesign W4 B-NEED-R)` — `Kiểm giữ:` `lockDecidable` (`NOT_FOUND`,
  `GROUP_USES_LINES`), `checkNeedDecision`.

#### B-SPEND-R — S (refactor, sau C0)

- **Phụ thuộc:** cổng A (A-T1, A-POL2). **SPEC:** §7.6 bước 4, ca G.
- **Interfaces** — Dùng: `spendItemOutcome` (A-POL2). `SpendBatchDecisionService.decideOne` gọi `spendItemOutcome({ context: 'BATCH', … })`; `withoutOpenStep`,
  `returnGroup` ở lại; `null` ⟹ `throw error`.
- **Test trước:** **2r**; `spend-batch-decision.service.spec.ts` PASS **không đổi kỳ vọng** (ca G); `spend-decision.service.spec.ts` (A-T1) không đổi.
- **Commit:** `refactor(requests): batch spend decision maps outcomes through a pure policy (redesign W4 B-SPEND-R)` — `Kiểm giữ:` mọi nhánh `catch`
  (`spend-batch-decision.service.ts:95-121`) + `RECHECKED_RETURNED_TO_HEAD` (`:104`) + ném lại lỗi khác (`:121`, gồm `NOT_PRICEABLE` — DL-4).

### Cổng B — mục 6; đặc tả A-T1 vẫn xanh sau ba refactor

### Wave C — C1: C-SUBMIT, C-NEED, C-SPEND, C-WITHDRAW; C2: C-BATCH, C-CONV, C-VIEW, C-LISTS — thứ tự gộp: C-SUBMIT → C-NEED → C-SPEND → C-WITHDRAW → C-BATCH → C-CONV → C-VIEW → C-LISTS

#### C-SUBMIT — M

- **Phụ thuộc:** cổng B (B-CORE, B-SUBMIT-R). **SPEC:** §7.2 (ca A–N, K2), §7.3 (ca A–G), §11.3 #1, #4, §7.4 registry `requestTicketSubmit#ticket.items`.
- **Interfaces** — Dùng: `checkPartyWithin`, `checkItemWithin`, `writeWithin`, `routeWithin` (B-SUBMIT-R); `MAX_TICKET_ITEMS`, `findDuplicates`,
  `openLimitRefusals` (A-POL1); `RequestTicketRepo.insert`/`view`, lỗi, `ticketSubmitBodySchema`, `ticketSchema` (B-CORE). Tạo: `writeWithin(…, ticket?: { id:
string; position: number })`, `newRequestOf(…, ticket?)`; `RequestTicketPrecheckService.precheck(tx: DbTx, party: PartyCheck, items: readonly TicketItemBody[]):
Promise<TicketItemRefusal[]>`; `RequestTicketSubmissionService.submit(actor: AuthenticatedPrincipal, body: TicketSubmitBody): Promise<RequestTicketView>`;
  route `POST /request-tickets` (201, message `REQUEST_TICKET.SUBMITTED`); comment đầu service ghi thứ tự khóa (§6.2, E5, số tầng mới).
- **Test trước:** `request-ticket-precheck.service.spec.ts` — `it.each` ca A, D, E, F, G, H, I, M, N, O (ca N khẳng định `details` mang `maxMonths`/
  `contractEndDate` như Request đơn — M-4) (mock `checkItemWithin`, giới hạn tuần): đúng `[{ position,
reason, … }]` sắp `position`; lỗi lớp ngoài 6 lớp ⟹ ném lên. `request-ticket-submission.service.spec.ts` — 7 và 20 mục ⟹ `REQUEST_TICKET.TOO_MANY_ITEMS` `{
max: 6, count }` (Trọng tâm 2); Super Admin gửi 7 mục ⟹ `TOO_MANY_ITEMS` (thứ tự M-3, T-W4-17); `checkPartyWithin` ném `FINANCE.SETUP_INCOMPLETE` ⟹ `precheck` không được gọi (ca K, K2); có mục bị nêu ⟹ `ITEMS_REFUSED`, không
  gọi `insert`/`writeWithin`; hợp lệ ⟹ thứ tự gọi `insert` phiếu → `writeWithin` mọi mục theo `position` → `routeWithin` mọi mục theo `position` (hai pha);
  audit `REQUEST_TICKET.SUBMITTED` `after: { requestIds, planIds }`. `access-request-submission.mapper.spec.ts` (có — thêm): `newRequestOf` có `ticket` ⟹
  `ticketId`/`ticketPosition`; không ⟹ `null`. Integration (viết) `request-ticket-submit` (A–N, K2; ca A khẳng định `monthly_price_minor` mỗi mục; #1 đồng thời),
  `request-ticket-head` (A–G theo fixture sau đợt 3; #4 đồng thời); http `request-tickets` (201, 422×3, 403, 401). Registry:
  `ts/api-collection-registry-{nested,events}-w4-c-submit.ts` key `requestTicketSubmit#ticket.items` (`bounded`, max 6, source CHECK `access_requests_ticket_position_range` +
  `MAX_TICKET_ITEMS`, `owner`/`item` thư mục có sẵn — DL-20). Đột biến: bỏ sắp `position` ở pha 2 ⟹ ca §7.3 B đỏ.
- **Dừng khi:** gate registry từ chối mục đã duyệt; đường khóa thật trái §6.2.
- **Commit:** `feat(requests): submit a request ticket of up to six items (redesign W4 C-SUBMIT)`.

#### C-NEED — M

- **Phụ thuộc:** cổng B (B-CORE, B-NEED-R, B-REPLY). **SPEC:** §7.5 (ca A–H), §11.3 #2, §7.9 ca C.
- **Interfaces** — Dùng: `NeedDecisionService.decide(…, judged)`, `RequestTicketRepo.itemsOf`, `orderByPosition`, `ticketDecideBodySchema`,
  `ticketNeedResultSchema`. Tạo: `TicketNeedDecisionService.decide(actor: AuthenticatedPrincipal, ticketId: string, body: TicketDecideBody):
Promise<TicketNeedResult[]>`; route `POST /request-tickets/{id}/need-decisions` (200, `REQUEST_TICKET.NEED_DECIDED`).
- **Test trước:** `ticket-need-decision.service.spec.ts` — `it.each` ca A–H (mock `NeedDecisionService`): `outcome`/`reason` từng mục; ca B
  `POLICY.CHECKLIST_HAS_NO`, không gọi `decide`; ca H gọi `R1` trước `R2`; ca F id ngoài phiếu đứng sau; mục không xem được ⟹ `NOT_IN_TICKET`; `ALREADY_DECIDED`
  dựng từ `needSteps`. Integration (viết) `request-ticket-need-decision` (A–H; #2 đồng thời với rút mục; **ca C của §7.9**: hai mục `RETURNED`, gửi lại mỗi mục một
  ghi chú ⟹ 2 reply đúng `request_id`). Đột biến "bỏ sắp position" ⟹ ca H đỏ.
- **Commit:** `feat(requests): head decides several items of a ticket with one checklist (redesign W4 C-NEED)`.

#### C-SPEND — M

- **Phụ thuộc:** cổng B (B-CORE, B-SPEND-R). **SPEC:** §7.6 (A–G), §11.3 #3, §7.14 IT.
- **Interfaces** — Dùng: `SpendDecisionService.decide(actor, requestId, input, judged?)`, `spendItemOutcome({ context: 'TICKET' })`, `itemsOf`,
  `ticketDecideBodySchema`, `ticketSpendResultSchema`. Tạo: `TicketSpendDecisionService.decide(actor: AuthenticatedPrincipal, ticketId: string, body:
TicketDecideBody): Promise<TicketSpendResult[]>`; route `POST /request-tickets/{id}/spend-decisions`.
- **Test trước:** `ticket-spend-decision.service.spec.ts` — ca A–F (mock `SpendDecisionService`): mục hai bước ⟹ `SKIPPED USE_BATCH`, không gọi `decide`; `RETURN`
  chỉ gọi mục đã chọn (ca D; đột biến "mọi mục" đỏ); `BOUNCED` `REQUESTER` ⟹ `RECHECKED_RETURNED_TO_REQUESTER`; `judged` giống nhau mọi mục, chấm một lần.
  Integration (viết) `request-ticket-spend-decision` (A–G; #3 đồng thời), `request-ticket-grant-in-charge` (`IT2` ⟹ 403 `PROVISIONING.NOT_IN_CHARGE`; `IT1` ⟹ 200).
- **Commit:** `feat(requests): spend approver decides several one-step items of a ticket (redesign W4 C-SPEND)`.

#### C-WITHDRAW — S

- **Phụ thuộc:** cổng B (B-CORE). **SPEC:** §7.8 (A–G).
- **Interfaces** — Dùng: `itemsOf`, `orderByPosition`, lỗi phiếu, `ticketWithdrawBodySchema`, `ticketWithdrawResultSchema`; `WithdrawalService.withdraw(actor,
requestId, input)`, `AccessRequestRecord.withdrawal`. Tạo: `TicketWithdrawalService.withdraw(actor: AuthenticatedPrincipal, ticketId: string, input: { reason?:
string }): Promise<TicketWithdrawResult[]>`; route `POST /request-tickets/{id}/withdrawal`.
- **Test trước:** `ticket-withdrawal.service.spec.ts` — người xem được, không phải người xin ⟹ `REQUEST_TICKET.NOT_REQUESTER`; không xem được ⟹
  `REQUEST_TICKET.NOT_FOUND`; gọi rút theo `position`; mục `WITHDRAWN` do chính người gọi ⟹ `WITHDRAWN ALREADY_WITHDRAWN`, không gọi rút; lỗi
  `WITHDRAWAL_AFTER_DECISION` ⟹ `SKIPPED` cùng `reason`; lỗi DB tạm ⟹ `RETRYABLE`; mọi mục đã kết thúc ⟹ `SKIPPED ALREADY_ENDED`. Integration (viết)
  `request-ticket-withdrawal` (A–G).
- **Commit:** `feat(requests): withdraw a whole request ticket (redesign W4 C-WITHDRAW)`.

#### C-BATCH — M (lô: thứ tự phiếu + ghi chú trình lại; một gói vì cùng `spend-batch.service.ts`)

- **Phụ thuộc:** cổng B (B-CORE, B-REPLY; A-POL1). **SPEC:** §7.7 lô (a)(b), §7.10 (A–E), §7.4 `spendQueueList`/`spendBatchItemList`.
- **Interfaces** — Dùng: `processingOrder`, `restoreBodyOrder`, `pendingHumanReturn` (A-POL1); `RequestReplyRepo.insert`/`humanReturnsOf`/`repliedStepIds`/
  `spendReturnsAwaitingReply` (B-REPLY); `RequestTicketRepo.refsOf`, `ticketRefSchema`, `AccessRequestRecord.ticket` (B-CORE). Tạo:
  `SpendBatchService.submit(actor, requestIds, confirmations = [], checklist?, replyNotes: readonly { requestId: string; note: string }[] = [])`;
  `SpendReplyNoteNotInBatchError(requestIds: string[])` ⟹ 422 `SPEND.REPLY_NOTE_NOT_IN_BATCH`; `stopReason` thêm `REPLY_NOTE_REQUIRED`; mục hàng đợi thêm
  `ticketRef`, `replyNoteRequired`; mục lô thêm `ticketRef` (logic mới ở hàm riêng, không vào hàm có suppression — DL-13).
- **Test trước:** **2r** (spec cũ `spend-submission/`); `spend-batch.service.spec.ts` (mới) — `it.each` §7.10 A–E: (A) lần trả về của `C1` chờ + không ghi chú ⟹
  `STOPPED REPLY_NOTE_REQUIRED`, mục khác đi tiếp; (B) có ghi chú ⟹ `SENT_TO_APPROVER`, `insert` một lần `HEAD_RESUBMISSION`; (C) ghi chú cho id ngoài lô ⟹
  `SPEND.REPLY_NOTE_NOT_IN_BATCH`, không tạo lô; (D) chỉ kiểm lại của hệ thống ⟹ không đòi; (E) có ghi chú nhưng `STOPPED` ⟹ không `insert` (đột biến đỏ); thứ tự:
  `lockAll` theo id không đổi, xử lý theo `processingOrder`, `results`/`batches.create.items`/`recorder.submitted` theo thân (khẳng định `requestIds[i]` khớp
  `outcomes[i]`). Schema `replyNotes[].note` `"   "`, 1001 ⟹ lỗi; 1000 ⟹ nhận (Trọng tâm 5). Integration (viết) `spend-batch-ticket-order` (a), (b),
  `spend-batch-reply-note` (A–E).
- **Commit:** `feat(requests): ticket order in spend batches; head resubmits a returned item with a reply note (redesign W4 C-BATCH)`.

#### C-CONV — S (chuyển một bước khi người xin thành trưởng phòng)

- **Phụ thuộc:** cổng B (A-DB, A-POL1). **SPEC:** §7.7 chuyển một bước, §7.14.
- **Interfaces** — Dùng: `processingOrder` (hàm thuần, import trực tiếp — **không** thêm provider vào `requests-work-facade.module.ts`, DL-10). Tạo:
  `ReassignableRequest.ticket: { id: string; position: number } | null` (đọc ở `step-reassignment.repo.ts` trong câu hiện có); kiểm ngân sách các mục cùng phiếu
  theo `position` (khóa giữ như cũ).
- **Test trước:** **2r** (spec cũ của `reassignment/`, `step-routing/` PASS); `step-reassignment.service.spec.ts` (có — fixture thêm `ticket` cho
  `ReassignableRequest`, thêm ca): hai mục cùng phiếu, thân/id lộn ⟹ thứ tự kiểm theo `position`.
  Integration (viết) `request-ticket-head-conversion` (RB-9: `R12` #1 hàng đợi trình qua, `R11` #2 đứng chờ bị chặn).
- **Dừng khi:** cần provider mới trong facade worker (sửa facade là file ngoài gói ⟹ _Bàn giao_).
- **Commit:** `feat(requests): ticket items keep ticket order on one-step conversion (redesign W4 C-CONV)`.

#### C-VIEW — M

- **Phụ thuộc:** cổng B (B-CORE, B-REPLY). **SPEC:** §7.4 (route, tiêu chí 1–4 phần `accessRequestGet`), §7.11, registry `requestTicketGet#ticket.items`.
- **Interfaces** — Dùng: `RequestTicketRepo.view`, `toTicketWire`, `RequestTicketNotFoundError`, `AccessRequestRecord.ticket`; `RequestReplyRepo.latestOf`. Tạo:
  `RequestTicketViewService.get(actor: AuthenticatedPrincipal, ticketId: string): Promise<TicketWire>` (lọc mục theo `canViewRequest`; `status`, `itemCount` trên
  mọi mục); route `GET /request-tickets/{id}`; `accessRequestGet` thêm `ticketRef`, `latestReply` (thêm vào `Promise.all` `access-request-query.service.ts:202`).
- **Test trước:** `request-ticket-view.service.spec.ts` — không xem được mục nào ⟹ `REQUEST_TICKET.NOT_FOUND`; xem 1/3 ⟹ `items` 1 mục, `status`/`itemCount` của 3.
  `request-view/access-request.mapper.spec.ts` (mới) — có reply ⟹ `latestReply.note`, `createdAt` ISO; không ⟹ `null`; Request đơn ⟹ `ticketRef: null`.
  Integration (viết) `request-ticket-view`; http `request-ticket-get` (200, 404), `access-request-get` (`latestReply.note === "dùng cho dự án X, 3 tháng"`). Registry
  file mảnh `…-w4-c-view.ts`.
- **Commit:** `feat(requests): view a request ticket; ticket reference and latest reply on request detail (redesign W4 C-VIEW)`.

#### C-LISTS — M (ba danh sách đọc; có thể giao hai subagent theo thư mục nếu orchestrator muốn — file rời nhau)

- **Phụ thuộc:** cổng B (B-CORE). **SPEC:** §7.4 (`meAccessRequestList`, `needDecisionList`, `spendApprovalList`).
- **Interfaces** — Dùng: `RequestTicketRepo.refsOf(requestIds)` (một câu mỗi trang), `ticketRefSchema`. Tạo: `ticketRef: TicketRef | null` trên mục của ba danh sách.
- **Test trước:** `my-requests.dto.spec.ts`, `need-decision-queue.mapper.spec.ts`, `spend-approval.mapper.spec.ts` (có — thêm): Request đơn ⟹ `ticketRef: null`; mục
  phiếu ⟹ `{ id, position, itemCount }`; service gọi `refsOf` **một lần** với mọi id của trang. **+1 câu mỗi trang là chủ ý (M-5):** test đếm truy vấn tương đối giữ; test khẳng định số tuyệt đối
  cho route này ⟹ sửa thành số mới đúng kèm căn cứ (không `>=`).
- **Commit:** `feat(requests): ticket reference on request lists (redesign W4 C-LISTS)`.

### Cổng C — mục 6; ca đồng thời lặp 20 trên CI

### Wave D — thứ tự gộp: D-MOBILE → D-SEED → D-DOCS

#### D-MOBILE — S (chỉ test)

- **Phụ thuộc:** cổng C. **SPEC:** §7.14 mobile (4 ca). **Test:** mở rộng 4 spec mobile: `E1` thấy `ticketRef`, rút một mục; `H1` quyết một mục qua
  `accessRequestNeedDecide`; `C1` quyết một mục phiếu `H1` qua `spendApprovalDecide`; hộp thư nhận thông báo từng mục.
- **Commit:** `test(requests): mobile acts on single ticket items (redesign W4 D-MOBILE)`.

#### D-SEED — S

- **Phụ thuộc:** cổng C. **SPEC:** W4-15. **Làm:** qua API: phiếu `E1` Figma + Miro + Notion, `H1` duyệt hai mục một lần, mục ba trả về rồi gửi lại kèm ghi chú;
  phiếu `H1` ba mục, một mục bị chặn ngân sách (ghi số ngân sách seed vào `seed.md`). Seed sau đợt 3 phải **chạy hết** (bài học H-2: không kẹt
  `AWAITING_SPEND_SUBMISSION/BLOCKED`), không thổi phồng `runningUncommitted`.
- **Test trước:** spec unit của step (mới hoặc `request-actions.spec.ts`): bước gửi phiếu gọi `POST /request-tickets` 3 mục theo thứ tự Figma, Miro, Notion; bước
  gửi lại gửi `replyNote` khác rỗng. CI cổng D: 5 spec seed (`_serial/seed-check-runtime`, `installation/seed`, `seed-bootstrap`, `seed-calendar`, `seed-rerun`) xanh.
- **Commit:** `feat(seed): demo request tickets (redesign W4 D-SEED)`.

#### D-DOCS — S

- **Phụ thuộc:** cổng C. **Làm:** E5 dưới E4 ở `docs/rules/database-business.md` (`:141-146`, số tầng mới — SPEC §6.2); `m/README.md` (phiếu, ghi chú trả lời,
  `refsOf`, thứ tự khóa). `FIX-TEST-w4.md` do **orchestrator** ghi ở mỗi cổng (M-7), D-DOCS không sửa. `pnpm rules:format && pnpm rules:check` exit 0.
- **Commit:** `docs(requests): lock-order exception for ticket submission; module card (redesign W4 D-DOCS)`.

### Cổng D — mục 6 + CI full; báo Owner mở PR

## 8. Rủi ro song song

| Rủi ro                                                              | Giảm                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Hai gói ngầm sửa cùng file (bảng 3.1 thiếu một file)                | G3: xung đột ngoài file gộp ⟹ dừng; subagent gặp file ngoài gói ⟹ _Bàn giao_, không sửa                             |
| Gói wave sau dựa trên chữ ký sai của wave trước                     | **Interfaces** cố định tên/kiểu; G2 đối chiếu chữ ký trước khi đóng cổng; lệch ⟹ sửa ở gói tạo, không vá ở gói dùng |
| Refactor làm mất một lần kiểm                                       | C0 (A-T1 xanh trên CI) trước wave B; `Kiểm giữ:`; spec đặc tả chỉ thêm dòng; CI cổng B chạy lại đặc tả              |
| Integration viết mù đỏ hàng loạt (đợt 2–3)                          | CI ở mỗi cổng (OQ-W4-7 = A); phân loại từng test với run nền; fixture sau đợt 3 (SPEC §11.2)                        |
| `requests.module.ts` vượt 500 dòng khi gộp                          | tách trước ở cổng A (G-HTTP, M-2); G4 vẫn đếm dòng                                                                  |
| Gate registry/manifest đỏ vì thiếu dòng gộp                         | file mảnh theo gói + 1 dòng import; G4 chạy `test:gates` sau gộp                                                    |
| Subagent báo `xong` khi chưa đủ ca                                  | orchestrator tự đọc diff (G2); `xong` chỉ khi integration xanh trên CI (G6)                                         |
| Commit "fix CI" thêm luật ngoài SPEC                                | LUẬT CỨNG 15; G2 đọc diff commit sửa                                                                                |
| DI thiếu provider ở facade worker (lỗi chỉ lộ khi khởi động worker) | không thêm phụ thuộc vào provider facade (DL-10); `worker.module.spec.ts` trong unit cổng                           |
| Worktree lệch nền (gói tạo từ nhánh cũ)                             | bước 0 so `git log -1` với nền wave; G3 chỉ gộp nhánh tạo từ `wave-<x>` hiện tại                                    |
| Đợt 3 vào `dev` khác `20ae45ee`                                     | cổng 0 chạy lại DELTA mục 4; `DL-24…` trước khi mở wave A                                                           |

## 9. Tự rà theo `superpowers:writing-plans` (bản 3.0)

- **Phủ SPEC:** W4-01 A-DB, A-POL1, B-CORE · W4-02 B-SUBMIT-R, C-SUBMIT · W4-03 C-SUBMIT · W4-04 B-CORE, C-VIEW, C-LISTS, C-BATCH · W4-05 B-NEED-R, C-NEED ·
  W4-06 A-POL2, B-SPEND-R, C-SPEND · W4-07 A-POL1, C-BATCH, C-CONV · W4-08 C-WITHDRAW · W4-09 A-DB, A-POL1, B-REPLY, C-NEED (ca C) · W4-10 C-BATCH · W4-11
  B-CORE, C-VIEW · W4-12 A-POL2 · W4-13 D-MOBILE · W4-14 C-SUBMIT (ca L), C-SPEND (IT), C-CONV · W4-15 D-SEED · W4-16 D-DOCS + cổng; §11.1 _nền_ A-T1; §11.3
  #1, #4 C-SUBMIT · #2 C-NEED · #3 C-SPEND. Không mục SPEC nào thiếu gói.
- **File:** mỗi file một gói (bảng 3.1); file dùng ở hai wave (`access-request.service.ts`, ba spec đặc tả) chỉ ở wave **khác nhau**; file gộp do orchestrator.
- **Kiểu nhất quán:** `TicketRef`, `RequestTicketView`, `TicketWire`, `LatestReply`, `HumanReturn`, `ReplyKind`, `PartyCheck`/`ItemCheck`, `SpendItemOutcome`,
  `ticketDecideBodySchema`, `processingOrder`/`restoreBodyOrder`, `pendingHumanReturn`, `refsOf`, `spendReturnsAwaitingReply` — định nghĩa ở gói tạo, gói sau chỉ
  **Dùng**.
- **Trọng tâm review:** 5 dòng, mỗi dòng có test ở A-T1/C-SUBMIT, B-CORE/C-SUBMIT, A-POL1, B-CORE, B-REPLY/C-BATCH.
- **Cân đối:** PLAN ghi chữ ký, tên test, khẳng định, lệnh; không chép thân hàm. Lệch so với chữ SPEC: không (chỗ đặt test của §7.1 (4) ở B-CORE integration; ca
  §7.9 C ở C-NEED — đã ghi ở SPEC 3.0).
