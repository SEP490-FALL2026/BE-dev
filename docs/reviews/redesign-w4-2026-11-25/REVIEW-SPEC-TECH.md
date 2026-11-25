# REVIEW-SPEC-TECH — Đợt 4 (phiếu nhiều mục), góc kỹ thuật + kế hoạch

- **Người review:** Opus (ngữ cảnh mới, độc lập). Chỉ đọc; không sửa SPEC/PLAN/CODE-PROMPT, không commit, không chạy test/build/DB.
- **Đối tượng:** `SPEC.md`, `PLAN.md`, `CODE-PROMPT.md` bản 1 (commit `a2ddb572`, `f6aa4da7`, `d1219d63`) trên nền `origin/int/redesign-w3`
  `444e6fc3`. Mọi `file:line` dưới đây đọc trên worktree `D:\FPT\FALL2026\Code\BE-w4-spec` (= `444e6fc3` + 3 commit tài liệu).
- **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (5 trục, phân mức), `agent-skills:api-and-interface-design` (contract, lỗi,
  thêm-không-phá), `agent-skills:planning-and-task-breakdown` (cỡ gói, phụ thuộc, checkpoint), `superpowers:verification-before-completion`
  (mọi khẳng định có bằng chứng `file:line` đã mở; chỗ không kiểm được ghi rõ).
- **Rule repo đã đối chiếu:** `docs/rules/database-business.md` (_Thứ tự khóa chuẩn_ dòng 100–138, E1–E4), `docs/rules/module-structure.md`,
  `docs/rules/work-item-sizing.md`, `test/gates/api-collection-contract.gate-spec.ts`, `test/gates/migration-order.gate-spec.ts`,
  `.github/workflows/ci.yml`, mẫu `redesign-w3-2026-11-22/PLAN.md`, `CODE-PROMPT.md`, bài học `redesign-w2-2026-11-22/FIX-PLAN-W2.md`.

## Kết luận

**Chưa nên duyệt nguyên trạng.** Khung SPEC/PLAN tốt (B-gọn, kết quả theo từng mục, khuôn W1-16, hai làn, `xong-unit`/`xong`, fixture QĐ-118), phần lớn
`file:line` đúng. Nhưng có **3 lỗi High** phải sửa trước khi giao code: ràng buộc `access_request_replies.returned_step_id` (NOT NULL + unique) mâu thuẫn
với luồng gửi lại/trình lại thật (RT-1, RT-2), và lưới an toàn của refactor (T1 characterization) không phủ đúng chỗ refactor và không chặn được B2/B4
(RT-3). Thêm 10 Medium (khóa E5, thứ tự lỗi cấp phiếu, vị trí `NESTED_ARRAYS`, ranh giới làn/danh sách file, contract, drift Prisma, cỡ gói, test).

| Mức    | Số | Mã                                   |
| ------ | -- | ------------------------------------ |
| High   | 3  | RT-1, RT-2, RT-3                     |
| Medium | 10 | RT-4 → RT-13                         |
| Low    | 5  | RT-14 → RT-18                        |

---

## High

### RT-1 (High) — `returned_step_id NOT NULL` + unique làm hỏng gửi lại Request một bước bị chặn / thiếu giá / kiểm lại

- **Vị trí:** SPEC §5 M2 (dòng 141–154), §7.9 (dòng 386–394), §8.2 `accessRequestResubmit`.
- **Bằng chứng:**
  - Request một bước vào `AWAITING_REQUESTER_REVISION` **không qua quyết định _Trả về_ nào**: bị chặn ngân sách
    (`src/modules/requests/spend/spend-routing.service.ts:183-188`, state `AWAITING_REQUESTER_REVISION` khi không mở bước chi), thiếu giá
    (`spend-routing.service.ts:153-154`), kiểm lại lúc duyệt ra bị chặn (`spend-approval/spend-decision.service.ts:182-190` `sendBack`, `to: 'REQUESTER'`).
    Phiếu trưởng phòng W4-03 ca A, W4-06 ca E sinh đúng các trạng thái này.
  - Route gửi lại phục vụ chính các ca đó: `request-intake/request-resubmission.service.ts:49-50` (ONE_STEP ⟹ `spending.route`), và test hiện có
    "missing price survives repeated resubmission" (`test/integration/requests/one-step-request.integration-spec.ts:81-85`), "blocked recheck … resubmission
    succeeds" (`:68-79`), `one-step-supplement-rate.integration-spec.ts:22`.
  - Với thân bắt buộc + `returned_step_id NOT NULL`: ca chưa từng bị _Trả về_ **không có bước nào** để gắn ⟹ không chèn được (23502) hoặc phải chặn gửi lại.
  - Ca tuần tự hợp lệ: `C1` trả về (bước chi `S` đóng `RETURNED`) → người xin gửi lại kèm ghi chú (reply gắn `S`) → `route` ra **bị chặn** → vẫn
    `AWAITING_REQUESTER_REVISION`, không có bước mới → gửi lại lần hai ⟹ "bước mới nhất đóng `RETURNED`" vẫn là `S` ⟹ **23505** trên
    `access_request_replies_step_key` ⟹ 500. Unique không phải "lưới an toàn cho đua" mà chặn luồng thật; đua đã được khóa Request (4) + kiểm
    `NOT_AWAITING_REVISION` chặn (`request-resubmission.service.ts:43-46`).
- **Đề xuất:** đây là điểm **nghiệp vụ** (`QĐ-114q` nói "sau _Trả về_") ⟹ thêm **OQ-W4-5**: ghi chú bắt buộc (a) **mọi** lần gửi lại, hay (b) chỉ khi có một
  lần _Trả về_ của người chưa được trả lời. Kỹ thuật cho cả hai: `returned_step_id` **nullable**, **bỏ** unique (giữ index `(request_id, created_at)`);
  với (b) thân `replyNote` optional ở Zod và kiểm ở service bằng mã riêng (vd 422 `ACCESS_REQUEST.REPLY_NOTE_REQUIRED`) — **không** dùng `VALIDATION_ERROR`
  cho luật phụ thuộc trạng thái. Định nghĩa "lần _Trả về_ chưa trả lời" tường minh cho 3 loại bước (nhu cầu: `CLOSED` + approval `RETURNED`
  — `request-resubmission.service.ts:19-20`; đánh giá IT: bước `IT_ASSESSMENT` cuối `CLOSED` — `access-request/access-request.repo.ts:160-167`;
  chi: `spend_decisions` `RETURNED` qua `spend-effects/spend-effects.service.ts:216`). Thêm test: gửi lại hai lần sau khi bị chặn lại; gửi lại Request
  chỉ bị chặn (chưa từng trả về).

### RT-2 (High) — W4-10: reply chèn trong tx lô rồi mục `STOPPED` ⟹ lần trình sau đòi ghi chú lại và vỡ unique

- **Vị trí:** SPEC §7.10 (dòng 402–409), PLAN B5.
- **Bằng chứng:** điều kiện "bước chi mới nhất đóng bằng `RETURNED` của Người duyệt chi" vẫn đúng cho tới khi có bước chi **mới**. Trình lô có ghi chú ⟹
  reply `HEAD_RESUBMISSION` chèn "trong tx của lô"; nếu `sendOn` cho mục đó ra bị chặn (STOPPED, ở lại hàng đợi — `spend-submission/spend-batch.service.ts`
  không mở bước chi; vòng `sendOn` ở dòng 101–105) thì reply vẫn commit cùng lô. Lần trình sau: luật lại đòi ghi chú, và chèn reply thứ hai gắn cùng bước ⟹ 23505 ⟹ **cả lô** rollback/500.
- **Đề xuất:** (1) chỉ chèn reply khi mục **thực sự đi tiếp** (`SENT_TO_APPROVER`), hoặc (2) coi lần _Trả về_ đã có reply là "đã trả lời" (không đòi lại).
  Đi cùng RT-1 (bỏ unique). Thêm ca (E) vào §7.10: trình kèm ghi chú → bị chặn → trình lại ⟹ không 500, hành vi theo lựa chọn.

### RT-3 (High) — Lưới an toàn của refactor không phủ đúng chỗ refactor và không chặn được B2/B4

- **Vị trí:** PLAN T1 (dòng 208–215), bảng _Gói_ (B2 phụ thuộc chỉ B1), _Rủi ro_ dòng 262; CODE-PROMPT LUẬT CỨNG 2, §2.
- **Bằng chứng:**
  - **Không có** unit spec cho ba service bị refactor: `request-intake/` chỉ có `access-request-submission.mapper.spec.ts`,
    `access-request-term.http-errors.spec.ts`, `request-resubmission.service.spec.ts`; `need-decision/` chỉ có `need-decision-effects.service.spec.ts`;
    `spend-approval/` không có `spend-decision.service.spec.ts`. PLAN B3 "Kiểm: `need-decision.service` test cũ xanh không đổi kỳ vọng" trỏ vào file **không tồn tại**.
    ⟹ "test cũ xanh không đổi kỳ vọng" (LUẬT CỨNG 2) chỉ kiểm được bằng integration/http — làn `biz` không chạy được.
  - T1 characterization gồm "gửi lại, rút, trình lô theo thân, quyết nhu cầu lẻ": **thiếu gửi Request đơn** (đích refactor B2 `submitWithin`) và **thiếu kết quả
    quyết lô chi** (đích refactor B4 `SpendBatchDecisionService` — `spend-batch-decision.service.ts:82-158`); hai mục có mặt (gửi lại, lô theo thân) là chỗ
    đợt 4 **cố ý đổi**, không phải refactor.
  - Không có cạnh phụ thuộc "T1 xanh" trước B2/B3/B4; `biz` B2 bắt đầu ≈ 1 M, cùng lúc T1.
- **Đề xuất:** T1 thêm: gửi Request đơn (mọi mã từ chối: `ALREADY_HOLDS_ACCESS`, `TERM_*`, `OPEN_REQUEST_EXISTS`, `OPEN_LIMIT_REACHED`, `PLAN_BOUND_TO_DEVICE`,
  `NO_DEPARTMENT`, `FINANCE.SETUP_INCOMPLETE`; Request một bước trưởng phòng ba kết cục ngân sách) và quyết lô chi (`RETRYABLE`, `ALREADY_DECIDED`,
  `NO_SPEND_STEP`, `RECHECKED_RETURNED_TO_HEAD`, `GROUP_NEEDS_LINES`, `COMMITMENT_NOT_HOLDABLE`). Ghi vào PLAN/CODE-PROMPT: **B2, B3, B4 chỉ commit phần refactor
  sau khi T1 xanh trên Docker ở `int`** (hoặc tách B2a/B3a/B4a — RT-12 — và đặt phụ thuộc "T1 ở int"). Phương án rẻ hơn nếu không muốn chờ: `biz` viết unit
  characterization (mock repo) cho `submitWithin`/`decide`/`decideOne` **trước** khi refactor, commit riêng.

---

## Medium

### RT-4 (Medium) — Lập luận E5 chưa đủ: sau CC-year của mục _k_ còn khóa ngầm trên dòng đã commit

- **Vị trí:** SPEC §6.2 dòng 187, 194–195; CODE-PROMPT LUẬT CỨNG 11.
- **Bằng chứng:** E5 chỉ xét Request (4) của mục _k+1_. Nhưng ở luồng gửi phiếu, sau CC-year (10) của mục _k_ còn: (a) `repo.insert` mục _k+1_ — FK của
  `access_requests`/bước nhu cầu lấy `FOR KEY SHARE` ngầm trên dòng **đã commit** (`plans` tầng 7, `cost_centers`, `departments`…); `FOR KEY SHARE` xung đột
  `FOR UPDATE` (`catalog/plan/plan.repo.ts:116,124` khóa `plans FOR UPDATE`); (b) `route` mục _k+1_ gọi `priceOn → repricing.reprice` **sau** CC-year, trong khi
  Request đơn reprice **trước** CC-year (`spend/budget-check.service.ts:98-103`). Trên `444e6fc3` reprice không khóa dòng (grep không thấy `FOR SHARE/UPDATE`),
  nhưng đợt 3 B3 thêm lô/sổ seat (`license-lot-lock.service.ts` trong PLAN đợt 3 dòng 395) — có thể đổi.
- **Đề xuất:** ghi theo hai pha trong cùng tx: **(1)** chèn mọi mục (Request + bước nhu cầu + audit) theo `position`; **(2)** rồi `SpendRoutingService.start`
  từng mục theo `position`. Như vậy mọi khóa FK lấy trước CC-year; E5 phát biểu lại: "sau CC-year đầu tiên, tx chỉ làm đúng các thao tác của
  `SpendRoutingService.route` một Request (reprice, ghi dòng của chính Request vừa chèn, `budget_checks`, bước chi, grant `FOR SHARE`)". Thêm dòng
  bắt buộc vào `DELTA-W3-FINAL.md`: xác nhận `RepricingService.reprice`/`priceFor` sau đợt 3 **không** khóa dòng nào; có ⟹ dừng.

### RT-5 (Medium) — Thứ tự lỗi cấp phiếu / lỗi mục không xác định khi nhiều lỗi cùng lúc

- **Vị trí:** SPEC §7.2 bước 2–3, ca K; PLAN B2 "lỗi phụ thuộc người/phòng ⟹ lỗi cấp phiếu, lỗi phụ thuộc gói ⟹ vi phạm của mục".
- **Bằng chứng:** `assess` kiểm theo thứ tự: đơn vị đã bắt đầu (`NOT_STARTED`/`NO_DEPARTMENT`) → gói (`PLAN_NOT_FOUND`, `APPLICATION_RETIRED`,
  `PLAN_BOUND_TO_DEVICE`) → Cost Center (`FINANCE.SETUP_INCOMPLETE`) → khóa phòng (`access-request/request-facts.service.ts` khoảng 162–175). Phiếu [gói K4, Figma]
  trong phòng không có Cost Center: mục 1 ném `PLAN_BOUND_TO_DEVICE` (vi phạm mục), mục 2 ném `FINANCE.SETUP_INCOMPLETE` (cấp phiếu) ⟹ kết quả phụ thuộc
  cách cài.
- **Đề xuất:** SPEC chốt "lỗi cấp phiếu luôn thắng": kiểm một lần **trước** vòng mục (`mayRequest`, `lockEligible`, đơn vị đã bắt đầu, Cost Center, khóa phòng),
  vòng mục chỉ bắt **danh sách lớp lỗi của gói** (liệt kê tên lớp), lớp khác ⟹ ném lên. Thêm ca test kết hợp.

### RT-6 (Medium) — `NESTED_ARRAYS`: sai file, sai key, thiếu sự kiện sổ

- **Vị trí:** SPEC §7.4 dòng 295–296; PLAN dòng 41–42, T2 dòng 223; CODE-PROMPT LUẬT CỨNG 4, §5.4.
- **Bằng chứng:** registry nằm ở `test/support/api-collection-registry-nested*.ts` (`api-collection-contract.gate-spec.ts:17` chỉ import); thêm khóa ngoài
  `INITIAL_NESTED_ARRAYS` mà không có sự kiện sổ ⟹ đỏ "silent rewrite" (`gate-spec.ts:284-286`). Tiền lệ đợt 3: `api-collection-registry-nested-w3.ts` +
  `api-collection-registry-events-w3.ts` (`registry: 'nested', change: 'added', to: 'bounded', bound…, item…`). Key có tiền tố đường dẫn dưới `data`
  (`accessRequestGet#request.spend.blockedReasons`) ⟹ của phiếu là **`requestTicketGet#ticket.items`**, không phải `requestTicketGet#items`; gate đọc
  `maxItems` từ schema ⟹ Zod phải `.max(6)`.
- **Đề xuất:** sửa ba tài liệu: file `api-collection-registry-nested-w4.ts` + `-events-w4.ts` (nối vào `api-collection-registry-nested.ts`/`-events.ts`),
  `classification: 'bounded'`, `businessMaximum.source` = CHECK `access_requests_ticket_position_range` + `MAX_TICKET_ITEMS`; đưa hai file vào danh sách
  file chung/T2.

### RT-7 (Medium) — B2 cần dạng `ticket` mà PLAN giao cho T2 trong capability có controller

- **Vị trí:** SPEC §7.2 bước 6 ("201 `{ ticket }` dạng của `requestTicketGet`"), §6.1; PLAN B1/B2/T2.
- **Bằng chứng:** schema + mapper + câu đọc phiếu đặt ở `request-ticket-view/` (T2, có controller). `request-ticket-submission/` (B2, có controller) **không được**
  import capability có controller (`docs/rules/module-structure.md` dòng 86); T2 chạy song song với B2 ⟹ B2 hoặc chờ `tech`, hoặc tự dựng bản trùng.
- **Đề xuất:** B1 đặt `ticketSchema` + câu đọc (`RequestTicketRepo.view(ticketId)` một câu, join gói) trong `request-ticket/`; T2 chỉ thêm controller GET, lọc
  mục theo `canViewRequest`, `status`. Hoặc B2 trả dạng tối giản `{ ticket: { id, items: [{ position, requestId, state }] } }` và SPEC ghi rõ.

### RT-8 (Medium) — Danh sách file của gói thiếu ⟹ agent sẽ dừng (CODE-PROMPT §2 "chỉ sửa file trong danh sách")

- **Bằng chứng / chỗ thiếu:**
  - B1: `ticket` trên `AccessRequestRecord` cần `access-request/access-request-record.mapper.ts` (`SELECT_REQUEST` dòng 10, `toRecord` dòng 150) — không nằm ở
    B1 hay danh sách làn `biz`.
  - T2: `itemCount` "đọc trong cùng câu" cho `accessRequestGet` cũng phải sửa `SELECT_REQUEST` (file `biz`) ⟹ chồng làn. Gợi ý: B1 thêm `itemCount` vào
    record (`_count` qua quan hệ phiếu) để T2 chỉ đọc.
  - B2: `request-intake/access-request-submission.mapper.ts` (`newRequestOf` — truyền `ticket`) + spec của nó.
  - B3: "thêm phương thức vào repo sẵn có của capability" — `need-decision/` **không có repo** (6 file: controller, service, effects, similar-seats).
  - B4: thứ tự khi chuyển một bước cần `ticket` trong `ReassignableRequest`, đọc ở `step-routing/step-reassignment.repo.ts:251-254` — thư mục `step-routing/`
    không thuộc làn nào trong PLAN _Hai làn_.
  - B5: `request-submission/access-requests.controller.spec.ts` (đổi chữ ký resubmit).
  - T5: seed "mục ba trả về rồi gửi lại kèm ghi chú" cần **B5** ở `int`, PLAN chỉ ghi B2, B3.
- **Đề xuất:** bổ sung các file trên vào gói + bảng _Tự kiểm chéo_; thêm `step-routing/**` vào làn `biz`.

### RT-9 (Medium) — W4-07 đổi thứ tự xử lý lô làm lệch audit `spend batch submitted`

- **Vị trí:** SPEC §7.7, §8.2 `spendBatchSubmit`.
- **Bằng chứng:** `spend-batch.service.ts` gọi `recorder.submitted(tx, actor, { requestIds, outcomes: results.map(...), openedFor: sent.map(...) })` (dòng
  130–136): `requestIds` là **thứ tự thân**, `outcomes`/`openedFor` theo **thứ tự vòng lặp**. Đổi vòng lặp sang thứ tự phiếu mà giữ `requestIds` của thân ⟹
  audit ghép sai Request ↔ kết quả.
- **Đề xuất:** SPEC ghi "mọi mảng song song (audit, `batches.create.items`, `results`) dùng **thứ tự xử lý**"; thêm khẳng định audit vào integration
  `spend-batch-ticket-order`.

### RT-10 (Medium) — Contract chưa liệt kê đủ enum `reason`; ánh xạ dùng chung có chỗ trống

- **Vị trí:** SPEC §7.2 bước 4, §7.5 bước 4, §7.6 bước 4, §8.1, §8.3.
- **Bằng chứng / chỗ trống:**
  - `ITEMS_REFUSED.details.items[].reason` và `results[].reason` của #3/#4/#5 không có danh sách đóng. #4 thực tế cần: `NOT_IN_TICKET`, `USE_BATCH`,
    `OWN_REQUEST`, `NOT_THE_ASSIGNEE`, `STEP_NOT_PENDING`, `NO_SPEND_STEP`, `NOT_CHECKABLE`, `RECHECKED_RETURNED_TO_REQUESTER`, `COMMITMENT_NOT_HOLDABLE`,
    `TRANSIENT_FAILURE`, `ALREADY_DECIDED` (so `spend-approval-view/spend-approval.dto.ts:253-268`).
  - `RECHECKED_RETURNED_TO_REQUESTER` là mã **mới**; lô hiện luôn trả `RECHECKED_RETURNED_TO_HEAD` (`spend-batch-decision.service.ts:104`) dù `BOUNCED` có
    `to: 'REQUESTER' | 'HEAD'` (`spend-decision.service.ts:185-187`). Policy dùng chung phải ánh xạ theo `result.to` và chứng minh lô không đổi.
  - #3: mục **của phiếu** mà người gọi không xem được ⟹ `decide` ném `AccessRequestNotFoundError` (`need-decision.service.ts:88`) — chưa có `reason`.
  - Từ vựng lệch tiền lệ: GH-1 ở dòng nhóm là `HAS_OPEN_REQUEST` (`group-request/group-request.dto.ts:45`), ở lỗi Request đơn `details.requestId`
    (`access-request/access-request.http-errors.ts:120`); SPEC dùng `OPEN_REQUEST_EXISTS` + `openRequestId`.
  - Vị trí kết quả cho id `NOT_IN_TICKET` trong mảng "theo `position`" chưa định (đầu/cuối).
- **Đề xuất:** thêm bảng enum đóng cho từng operation + Zod schema `details`; chọn một từ vựng (khuyến nghị theo dòng nhóm hoặc theo mã lỗi đơn, ghi rõ);
  `NOT_FOUND` mục ⟹ `SKIPPED NOT_IN_TICKET` (không lộ tồn tại).

### RT-11 (Medium) — SQL phác thảo sẽ drift với Prisma; không có bước tự kiểm drift trước CI

- **Vị trí:** SPEC §5 (dòng 116–155), §1 tiêu chí "`prisma migrate diff` không drift"; PLAN B1/B5.
- **Bằng chứng:** quy ước repo: FK `"<bảng>_<cột>_fkey" … ON DELETE RESTRICT ON UPDATE CASCADE` (vd `prisma/migrations/2026112*/migration.sql`), quan hệ
  `onDelete: Restrict` (`prisma/models/requests.prisma:244-248`). SPEC viết `REFERENCES x(id)` (NO ACTION/NO ACTION), `DEFAULT gen_random_uuid()`
  (Prisma `@default(uuid())` không sinh default DB), `timestamptz` (repo dùng `Timestamptz(3)`). CI chạy `prisma migrate diff … --exit-code` (`ci.yml:164`).
- **Đề xuất:** ghi trong SPEC/PLAN: sinh phần bảng/cột/FK/index bằng `pnpm exec prisma migrate diff --from-schema <schema trước> --to-schema prisma --script`
  (không cần DB), rồi **thêm tay** CHECK/trigger. Unique `(ticket_id, ticket_position)` dùng `@@unique` thường là đủ (NULL khác nhau trong PostgreSQL) — bỏ
  partial index. `RUNTIME_TABLE_EXCEPTIONS`: ghi **chắc chắn** `access_request_replies: ['INSERT','SELECT']` theo tiền lệ bảng chỉ ghi thêm
  (`src/infrastructure/database/database-role-judgement.ts:14-40`), cân nhắc cùng cho `request_tickets` (+ trigger chặn UPDATE/DELETE) — bỏ chữ "nếu gate H7 đòi".

### RT-12 (Medium) — B2, B4, B5 quá cỡ M và trộn refactor với tính năng

- **Vị trí:** PLAN bảng _Gói_, chi tiết B2/B4/B5.
- **Bằng chứng:** B2 ≈ 11 file (refactor `submitWithin` + capability mới có controller + 2 service + mapper + 2 integration + 1 http + manifest); B4 ≈ 13 file qua
  **3 capability** (`spend-approval`, `spend-submission`, `reassignment`) + 4 integration; B5 ≈ 14 file + migration + hai luồng khác nhau (W4-09, W4-10).
  `work-item-sizing.md` quy tắc 4–5 và skill planning (≥ 8 file = XL; tách refactor khỏi tính năng).
- **Đề xuất:** B2a (refactor kiểm/ghi — technical enabler, chờ T1, RT-3) / B2b (gửi phiếu + W4-03); B4a (W4-06 + `spend-item-outcome.policy`) / B4b (W4-07 lô +
  chuyển một bước); B5a (M2 + W4-09) / B5b (W4-10). Ước lượng `biz` tăng ≈ 1 M nhưng mỗi gói rollback/review được riêng.

### RT-13 (Medium) — Ma trận test thiếu ca và chưa giao ca đồng thời cho file/gói

- **Vị trí:** SPEC §11.1, §11.3; PLAN T4.
- **Thiếu:** (a) 4 ca đồng thời §11.3 không gắn file spec/gói (`biz` viết ở đâu, T4 chỉ "chạy"); (b) gửi lại hai lần sau khi bị chặn lại, gửi lại Request chỉ bị
  chặn (RT-1), trình lại sau reply + bị chặn (RT-2); (c) trigger chỉ-ghi-thêm của `access_request_replies` (UPDATE/DELETE bị từ chối) — W4-01 có cho M1, M2 không
  có; (d) lỗi cấp phiếu thắng lỗi mục (RT-5); (e) audit lô khớp thứ tự (RT-9); (f) gọi lại rút cả phiếu (idempotent — xem RT-17); (g) Request đơn gửi không đổi
  (RT-3).
- **Đề xuất:** thêm cột "file spec + gói" cho từng ca §11.3 (gợi ý: (1) ở `request-ticket-submit` B2b, (2) `request-ticket-need-decision` B3, (3)
  `request-ticket-spend-decision` B4a, (4) `request-ticket-head` B2b) và các ca (b)–(g) vào bảng.

---

## Low

### RT-14 (Low) — Điều kiện bắt đầu 2 dễ dừng nhầm

- **Vị trí:** PLAN dòng 13; CODE-PROMPT §1 dòng 84.
- **Bằng chứng:** `git diff --stat origin/dev origin/int/redesign-w3 -- src prisma` **rỗng** chỉ đúng khi `dev` không có commit nào khác sau squash và `int/redesign-w3`
  không có commit sau merge.
- **Đề xuất:** kiểm commit squash đợt 3 có trên `dev` (`git log origin/dev --grep`), cộng ba file `ls-tree`; lệch còn lại ghi vào `DELTA-W3-FINAL.md` thay vì dừng.

### RT-15 (Low) — W4-12 nêu trạng thái thay vì giai đoạn chi

- **Vị trí:** SPEC §7.12.
- **Bằng chứng:** `HEAD_MAY_WITHDRAW_AT` là `SpendStage[]` (`access-request/withdrawal.policy.ts:23`); giá trị có: `NOT_SUBMITTED`, `RETURNED_TO_REQUESTER`,
  `RESERVE_CONFIRMATION`, `BLOCKED`, `WAITING_SPEND_DECISION`, `REFUSED` (`access-request/access-request.types.ts:293-301`).
- **Đề xuất:** ghi rõ thêm `NOT_SUBMITTED` (và cách Request bị `C1` trả về được phân giai đoạn) thay cho "`AWAITING_SPEND_SUBMISSION`".

### RT-16 (Low) — Kiểm nhanh thiếu phần CI `quality` hay đỏ

- **Bằng chứng:** CI `quality` chạy `pnpm check` (`ci.yml:147`) gồm `format:check`, `arch:docs:check`; bộ kiểm nhanh không có; `docs/generated/*` chỉ T6 sinh ⟹ CI
  trên `int` trước T6 đỏ `arch:docs:check` mỗi khi `biz` thêm route. Đợt 2 từng đỏ prettier (`FIX-PLAN-W2.md` §4).
- **Đề xuất:** thêm `pnpm exec prettier --check <file đã sửa>`; coi `docs/generated/*` như `openapi.json` (người thêm route sinh lại cùng commit).

### RT-17 (Low) — Đơn giản hóa và tên

- `NeedDecisionService`: thay `decideJudged(tx…)` bằng `decide(actor, id, input, judged?)` giống `SpendDecisionService.decide` (`spend-decision.service.ts:53-58`) —
  ít khái niệm hơn, khớp khuôn lô.
- `spend-item-outcome.policy.ts` giữ **thuần** (lỗi → kết quả); `withoutOpenStep` (đọc DB) và `returnGroup` (ghi) ở lại service (`spend-batch-decision.service.ts:126-158`).
- Rút cả phiếu gọi lại ⟹ mục vừa rút thành `SKIPPED ALREADY_ENDED`, trái khuôn idempotent của #3/#4 (`ALREADY_DECIDED`); cân nhắc `WITHDRAWN` + `ALREADY_DECIDED`
  khi chính người gọi đã rút (ca 7.8 B cần sửa theo).
- `ticket` trùng nghĩa với phiếu thao tác của Super Admin (`operator.ticketId/ticketRef`, `step-routing/step-audit-event.mapper.ts:32`) và cùng tên cho hai dạng
  (`ticket` tham chiếu `{ id, position, itemCount }` vs `ticket` đầy đủ) — cân nhắc `requestTicket`/`ticketRef`.

### RT-18 (Low) — Hai mã cho cùng điều kiện "quá nhiều mục"

- **Vị trí:** SPEC §7.2 bước 1–2: 7–20 mục ⟹ `REQUEST_TICKET.TOO_MANY_ITEMS`, > 20 ⟹ `VALIDATION_ERROR`. Chấp nhận được; ghi rõ trong mô tả OpenAPI hoặc
  dùng một ngưỡng.

---

## Đối chiếu yêu cầu kiểm (1)–(7)

| #   | Nội dung                                  | Kết quả                                                                                                                                                                                                                       |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (1) | Mô hình dữ liệu + migration               | M1 an toàn dữ liệu cũ (nullable, CHECK cặp/khoảng/loại, unique, trigger bất biến) — đúng ý; `branch`/`type` không có code `UPDATE` (grep) nên CHECK loại không vướng. M2 sai ràng buộc (RT-1, RT-2). Drift (RT-11).            |
| (2) | Thứ tự khóa, E5, race, idempotent         | Quyết/rút mỗi mục một tx đúng khuôn lô; race phiếu ‖ lô chi không vòng (lô khóa Request rồi CC-year, phiếu chỉ khóa Request tự chèn). E5 thiếu khóa ngầm (RT-4). `ALREADY_DECIDED` cho nhu cầu dựng được từ `needSteps`.    |
| (3) | Contract API                              | Route mới hợp lý, chỉ thêm trường ngoài **Phá vỡ** `accessRequestResubmit` (đúng: controller hiện không có `@Body`, `access-requests.controller.ts:147-180`). Thiếu enum (RT-10), sai `NESTED_ARRAYS` (RT-6), dạng 201 (RT-7). |
| (4) | `file:line`/helper/operationId            | Đúng: các dòng ở §7.1–7.12, §11.2 (đã mở từng file). Sai/thiếu: file `NESTED_ARRAYS` (RT-6); "test cũ `need-decision.service`" và "repo sẵn có" của `need-decision` không tồn tại (RT-3, RT-8); `OPEN_REQUEST_EXISTS`/`openRequestId` lệch tiền lệ, `RECHECKED_RETURNED_TO_REQUESTER` là mã mới (RT-10); `meAccessRequestList` ở `request-history/request-history-mine.controller.ts` (dùng DTO/service `my-requests/` — PLAN đúng vì controller không đổi); `test/http/requests/access-request-get.http-spec.ts` chưa có (PLAN đã ghi). |
| (5) | PLAN: cỡ, phụ thuộc, làn, dải, điều kiện  | Dải `20261210…` đúng (`migration-order.gate-spec.ts`). Ba điều kiện bắt đầu đủ (RT-14 nhỏ). Làn có chỗ chồng/thiếu (RT-7, RT-8). Cỡ gói (RT-12). T1 không chặn refactor (RT-3).                                               |
| (6) | CODE-PROMPT LUẬT CỨNG                     | Đủ khung đợt 3 + bài học đợt 2: LUẬT 1–12, fixture QĐ-118 (LUẬT 10), `xong-unit`/`xong` + bảng đối chiếu (LUẬT 6, §8), không nới gate, không commit đỏ. Cần thêm: cổng T1 trước refactor (RT-3), tự kiểm drift (RT-11), đúng file `NESTED_ARRAYS` (RT-6), prettier (RT-16), E5 sửa theo RT-4. |
| (7) | Test bắt buộc cho luật mới                | Bảng ca W4-02/03/05/06/07/08 đầy đủ và có ca diệt đột biến tốt. Thiếu các ca ở RT-13.                                                                                                                                      |

## Không kiểm được (ghi trung thực)

- Không chạy test/gate/`prisma migrate diff`; nhận định drift (RT-11) dựa trên quy ước migration hiện có, chưa sinh SQL thật.
- Đợt 3 B2/B3 chưa vào nền đọc; RT-4 (reprice sau đợt 3) và mọi `file:line` cần xác nhận lại qua `DELTA-W3-FINAL.md`.
- Không đọc sổ QĐ/User Stories (góc nghiệp vụ thuộc reviewer khác); RT-1 nêu điểm nghiệp vụ thành câu hỏi Owner, không tự chốt.
