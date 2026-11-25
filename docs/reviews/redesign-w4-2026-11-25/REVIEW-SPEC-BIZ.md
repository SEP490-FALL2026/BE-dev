# REVIEW SPEC đợt 4 — góc nghiệp vụ (25/11/2026)

- **Reviewer:** Opus, ngữ cảnh mới, độc lập; chỉ đọc. Không sửa SPEC/PLAN/CODE-PROMPT, không commit, không chạy test.
- **Đối tượng:** `SPEC.md` bản 1 (`a2ddb572`), `PLAN.md` (`f6aa4da7`), `CODE-PROMPT.md` (`d1219d63`) trên worktree `BE-w4-spec`.
- **Nguồn đối chiếu (đã đọc đúng chữ):** sổ QĐ `Docs/Decisions/project-decisions.md` (`QĐ-61b`, `QĐ-82j`, `QĐ-82l(16)`, `QĐ-104b`, `QĐ-106g`,
  `QĐ-110i`, `QĐ-111aq`, `QĐ-113d`, `QĐ-114b`, `QĐ-114q`, `QĐ-115aa`→`QĐ-115ad`, `QĐ-115aj`, `QĐ-116a`→`QĐ-116f`, `QĐ-116ab`, `QĐ-116az`, `QĐ-117k`,
  `QĐ-118a`, `QĐ-118c`, `QĐ-118o`); `DECISIONS.md` (W3, P-1, W1-Q3, CUT-5, CUT-7); `V3-verify-W4b-W3.md` §7.3–7.4; `AUDIT-B` B-09; _Quy trình…_ dòng
  176, 179, 207, 208, 224; BRD (dòng 149, 312, 386, 750, 1085, 1379, 1431, 1455); User Stories `EP-05` (`US-05-02` AC-14/15/24, `US-05-04` AC-23/26,
  `US-05-08` AC-13/14/15, `US-05-22` AC-13, `US-05-25` toàn bộ), `EP-06` (`US-06-01` AC-26/35/36, `US-06-14` AC-14/23/24); code
  `request-intake/request-resubmission.service.ts`, `request-intake/access-request.service.ts`, `spend/spend-routing.service.ts`,
  `spend-effects/spend-effects.service.ts:200-240`, `access-request/withdrawal.policy.ts`, `assessment-decision/assessment-return.service.ts`,
  `test/support/api-collection-registry-*.ts`.

## 0. Skill đã dùng

| Skill | Mục đích |
| --- | --- |
| `superpowers:verification-before-completion` (process + verify) | Mỗi phát hiện có trích nguồn hoặc `file:line` đã đọc lại; không kết luận từ trí nhớ |
| `agent-skills:spec-driven-development` (domain) | Đo SPEC theo tiêu chí kiểm được, ranh giới, câu hỏi mở |
| `agent-skills:doubt-driven-development` (review) | Tự phản biện các phát hiện High/Medium. **Bản rút gọn:** chạy trong subagent nên không gọi được reviewer ngữ cảnh mới thứ hai; bỏ qua cross-model vì không tương tác được với Owner |

## 1. Kết luận

SPEC bám nguồn tốt: mọi luật chính (B-gọn, trần 6, chỉ gói trả phí trong danh mục, GH-1 trong phiếu, GH-2 theo mục, có vi phạm ⟹ không gửi mục nào, bị chặn ≠
vi phạm, kiểm ngân sách theo thứ tự, chỉ mục qua mới trừ, một checklist mỗi lần quyết, rút cả phiếu/từng mục, ranh giới đợt 5) đều có căn cứ đúng chữ; các
**Tự chốt** T-W4-1…9 hợp lý, không chế luật mới. Có **1 High**: luật _ghi chú trả lời bắt buộc_ cùng khóa `returned_step_id NOT NULL UNIQUE` vỡ ở
Request **bị hệ thống chặn** (chính ca test 7.3 A, 7.6 E của SPEC). Phần còn lại: 4 Medium, 6 Low. Bốn OQ: đồng ý khuyến nghị cả bốn; `NESTED_ARRAYS`
nên duyệt (có tiền lệ).

## 2. Phát hiện

| Mã | Mức | Vị trí SPEC | Phát hiện | Căn cứ | Đề xuất |
| --- | --- | --- | --- | --- | --- |
| RB-1 | **High** | §5 M2; §7.9; §7.10; §8.2 dòng `accessRequestResubmit` | SPEC bắt ghi chú cho **mọi** lần gửi lại và khóa ghi chú vào "bước mới nhất đóng `RETURNED`" (`returned_step_id NOT NULL`, unique). Ba đường vỡ: **(a)** Request một bước **bị chặn ngay khi gửi / thiếu giá** về `AWAITING_REQUESTER_REVISION` **không mở bước nào** (`spend-routing.service.ts:182-187`, `:153-154`) ⟹ không có bước `RETURNED` để gắn ⟹ người xin **không gửi lại được** — đúng ca 7.3 A mục 2 (phiếu trưởng phòng) mà `QĐ-116e`/`US-05-25` AC-6 nói "`H1` sửa hoặc rút"; ca kiểm lại lúc duyệt ra bị chặn (7.6 E, `US-06-01` AC-26 "bước đóng không kèm quyết định") và ca chuyển một bước bị chặn (`QĐ-116c`) cũng vậy. **(b)** Request đã gửi lại kèm ghi chú (reply gắn bước S1) rồi bị hệ thống chặn lại ⟹ lần gửi lại sau vẫn thấy S1 là bước `RETURNED` mới nhất ⟹ đòi ghi chú lần nữa và chèn trùng ⟹ **23505**. **(c)** W4-10: lô có ghi chú nhưng mục `STOPPED` vì bị chặn (vẫn ở hàng đợi trình) — SPEC không nói chỉ chèn reply khi mục **đi tiếp**, lần trình sau gặp lại (b). **(d)** Bước đánh giá IT trả về đóng `CLOSED`, được nhận ra bằng trạng thái (`access-request.repo.ts:160-167`), SPEC giả định có "quyết định `RETURNED`" | `QĐ-114q` "Gửi lại Request **bị _Trả về_**"; `QĐ-116az`(3) mỗi mục bị _Trả về_ một ghi chú; `QĐ-116c` "kiểm lại ra _bị chặn_ ⟹ như Request một bước bị chặn (về người yêu cầu sửa hoặc rút)"; chính SPEC §7.10 đã miễn ghi chú cho ca hệ thống kiểm lại (`RECHECKED_RETURNED_TO_HEAD`) — §7.9 thiếu vế tương ứng | Đổi luật SPEC thành: **bắt buộc** ghi chú khi lần trả về gần nhất là _Trả về_ **của người** (bước nhu cầu / đánh giá IT / chi một bước) **và** bước đó chưa có reply; ngoài ra (bị chặn, thiếu giá, kiểm lại ra bị chặn) ghi chú **không bắt buộc**, không lưu — đúng chữ `QĐ-114q`, cân với §7.10. W4-10: chỉ chèn reply khi mục `SENT_TO_APPROVER`. Ghi rõ cách định danh bước đánh giá IT bị trả về. Thêm test: 7.3 A mục 2 gửi lại không ghi chú ⟹ 200; một bước trả về → gửi lại có ghi chú → bị chặn → gửi lại lần hai không ghi chú ⟹ 200, không 23505; lô `STOPPED` có ghi chú → trình lại. Nếu Owner muốn bắt ghi chú cả ca bị chặn ⟹ thành `OQ-W4-5`, và khi đó `returned_step_id` phải nullable, bỏ unique |
| RB-2 | Medium | §7.9; §8.2 `accessRequestResubmit` (**Phá vỡ**) | Phá contract là **cần** (`QĐ-114q` "bắt buộc"), nhưng SPEC phá rộng hơn mức cần: Zod bắt `{ replyNote }` cho mọi lần gửi lại ⟹ FE gửi lại Request bị chặn cũng hỏng, và lỗi chỉ là `VALIDATION_ERROR` chung | `QĐ-114q`; `docs/rules/api-contract.md` (mỗi luật một mã) | Thân `{ replyNote?: string 1…1000 }` (optional ở Zod); thiếu khi luật RB-1 đòi ⟹ 422 mã riêng (vd `ACCESS_REQUEST.REPLY_NOTE_REQUIRED`) để FE hiện đúng ô. Vẫn ghi **Phá vỡ** (hành vi), nhưng chỉ ở ca `QĐ-114q` đòi; route không thân cũ vẫn chạy cho Request bị chặn |
| RB-3 | Medium | §7.7 "Kết quả trả theo **thứ tự xử lý**"; §8.2 `spendBatchSubmit` | Đổi thứ tự `results` của lô là phá contract **không có căn cứ**: `QĐ-117k`(3) chỉ đòi **xử lý** (kiểm ngân sách) theo thứ tự phiếu, không đòi đổi thứ tự trả về. FE đang khớp theo chỉ số sẽ sai lặng lẽ | `QĐ-117k`(3); §1 SPEC "Request đơn lẻ, Request nhóm, lô chi không đổi hành vi" | Xử lý theo `spend-batch-order.policy.ts`, **trả `results` theo thứ tự thân** như cũ; bỏ dòng "khớp kết quả theo `requestId`" khỏi việc FE |
| RB-4 | Medium | §7.3 tiêu chí (dự phòng `CC-DES` = 0); §7.7 integration (dự phòng 0) | Không ca nào chứng minh hai vế dự phòng của `QĐ-117k`(1): mục **dùng dự phòng đã sang Người duyệt chi** (phiếu trưởng phòng) **được trừ** cho mục sau; mục **cần dự phòng mà trưởng phòng chưa xác nhận** (`RESERVE_CONFIRMATION`, phiếu nhân viên trong lô) **không trừ**. Đợt 4 không sửa `budget-check` nên đây là test giữ hành vi, nhưng là câu chữ QĐ nêu thẳng | `QĐ-117k`(1); `US-05-25` AC-9; _Quy trình_ dòng 207 | Thêm 7.3 ca F (dự phòng > 0: mục 1 qua số cơ sở, mục 2 dùng dự phòng → `AWAITING_SPEND_DECISION` kèm cờ, mục 3 bị chặn vì mục 2 đã trừ) và 7.7 ca lô (mục #1 ra `RESERVE_CONFIRMATION`, mục #2 kiểm **không** tính mục #1) |
| RB-5 | Medium | §7.4 (4 operation thêm `ticket`); §7.10 | Hàng đợi trình của trưởng phòng `spendQueueList` (và `spendBatchItemList`) **không** mang `ticket` ⟹ trưởng phòng không thấy mục nào cùng phiếu khi lập lô (thứ tự phiếu ảnh hưởng ai được ngân sách — `QĐ-117k`(3)), cũng không biết mục nào **cần ghi chú trả lời** (W4-10) trước khi bị `STOPPED REPLY_NOTE_REQUIRED` | `QĐ-117k`(3); `QĐ-116f`; `US-06-14` AC-24; BRD dòng 1085 (hàng đợi gồm "các mục của phiếu nhiều mục") | Thêm `ticket` vào mục của `spendQueueList`, `spendBatchItemList`; thêm cờ `replyNoteRequired` (theo luật RB-1) ở mục `spendQueueList` |
| RB-6 | Low | §7.11, T-W4-7 | `US-05-25` AC-10: "người duyệt thấy ghi chú **cạnh đúng mục**". Hộp quyết nhiều mục mở từ `requestTicketGet`, nhưng `latestReply` chỉ ở `accessRequestGet` ⟹ FE phải gọi N chi tiết | `US-05-25` AC-10; `QĐ-114q` | Thêm `latestReply` (hoặc tối thiểu `note`) vào `requestTicketGet.items` (≤ 6, một câu join) |
| RB-7 | Low | §7.8 tiêu chí | Thiếu ca: mục **đã bị _Trả về_ cho người xin** (đã có một quyết định) vẫn rút được qua rút cả phiếu ⟹ `WITHDRAWN`, không `SKIPPED WITHDRAWAL_AFTER_DECISION`. Đây là ca dễ đột biến nhất khi ai đó viết lại điều kiện "chưa có quyết định" ở service phiếu | `QĐ-113d` "đang _Trả về bổ sung_ … ở bất kỳ bước nào"; `QĐ-116b` vế cuối; `withdrawal.policy.ts:55` | Thêm 7.8 ca F |
| RB-8 | Low | §7.12 (W4-12) | "Thêm giai đoạn _ở hàng đợi trình_" chưa chỉ rõ giá trị `SpendStage` (`access-request.types.ts:293-301`: `NOT_SUBMITTED`, `RETURNED_TO_REQUESTER`, …). Nếu người code thêm nhầm `RETURNED_TO_REQUESTER` thì trưởng phòng rút được Request đang chờ **người xin** sửa — vượt `QĐ-116b` | `QĐ-116b` "mọi Request trong **hàng đợi trình** của mình" | Ghi rõ: thêm đúng giai đoạn của `AWAITING_SPEND_SUBMISSION` chưa trình (gồm Request hai bước bị `C1` trả về); **không** thêm `RETURNED_TO_REQUESTER`; thêm ca test âm tương ứng |
| RB-9 | Low | §7.7 integration chuyển một bước | Chỉ có ca hai mục cùng _đứng chờ_. `QĐ-116c` liệt kê bốn chỗ (chờ bước nhu cầu, đứng chờ, hàng đợi trình, chờ xác nhận dự phòng); thứ tự phải theo `position`, không theo loại trạng thái mục tình cờ được duyệt trước | `QĐ-116c`; `US-05-04` AC-26 (R11 đứng chờ, R12 ở hàng đợi trình) | Đổi ca thành R11 (#2, đứng chờ) + R12 (#1, hàng đợi trình) ⟹ R12 được kiểm trước |
| RB-10 | Low | §7.2 bước 1–2 | Zod 1…20 + `TOO_MANY_ITEMS` cho 7…20 ⟹ 21+ mục nhận `VALIDATION_ERROR` — hai mã cho cùng luật "tối đa 6" (`US-05-25` AC-5 đòi lỗi nêu _tối đa 6 mục_) | `QĐ-116e`; tiền lệ B-N2 "hai mã một luật" (W1 SPEC §2.2) | Chấp nhận được (biên kỹ thuật), nhưng ghi rõ ở mô tả OpenAPI; hoặc nâng biên Zod lên giá trị không đạt tới qua FE |
| RB-11 | Low | §7.4 | `status` và `itemCount` tính trên **mọi** mục trong khi `items` lọc theo `canViewRequest` ⟹ người chỉ xem được một phần vẫn biết số mục/tiến độ mục họ không được xem. Rủi ro nhỏ (cùng người xin, cùng phòng) | `US-05-25` _Phạm vi quyền_ | Ghi một dòng chấp nhận trong SPEC, hoặc tính `status`/`itemCount` trên mục xem được |

## 3. Kiểm theo đề bài

### 3.1. Mỗi luật SPEC có căn cứ đúng chữ (1)

Đúng chữ, không tự chế: trần 6 (`QĐ-115aa`, `QĐ-116e`, AC-5) · chỉ gói trả phí trong danh mục, `K5` ra ngoài ⟹ `NOT_PAID_IN_CATALOG` (`QĐ-115aa`,
`QĐ-115ad`, AC-3) · `DUPLICATE_IN_TICKET`, khác loại seat thì cho (`QĐ-116az`(1), AC-8) · GH-2 theo mục, cộng dồn mục đứng trước, ca G/H đúng số
`US-05-22` AC-13 (8+2=10 rồi chặn; 9+1 chặn) · có vi phạm ⟹ không gửi mục nào, trả mọi mục (`QĐ-115ac`, `QĐ-106g`) · bị chặn ≠ vi phạm (`QĐ-115ac`,
`QĐ-116e`, AC-6) · thứ tự kiểm + chỉ mục qua mới trừ + không kiểm lại (`QĐ-116az`(2), `QĐ-117k`(1)(2)(3)) · một checklist mỗi lần quyết, _Không_ chỉ áp mục đã
chọn (`QĐ-115ab`, `US-05-04` AC-23) · 1.7 theo phiếu **chỉ cho Request một bước**, hai bước giữ lô (`QĐ-115ab` "1.6/1.7 checklist vẫn theo lô", `US-05-25`
_Out of scope_, `US-06-01` AC-36) · _Trả về_ một bước về thẳng người xin (`QĐ-116f`) · rút cả phiếu từng mục độc lập (`QĐ-115ac`, `US-05-08` AC-14, V3 #10) ·
`FINANCE.SETUP_INCOMPLETE` cấp phiếu, không phiếu nháp (single route ném cùng lỗi; V3 #3) · `EMPLOYEE.NOT_STARTED`/`NO_DEPARTMENT` cấp phiếu (`US-05-02`
AC-14) · `PLAN_BOUND_TO_DEVICE` là vi phạm mục. Tự chốt T-W4-1…9 hợp lý; T-W4-9 (ân hạn điều chuyển vào phiếu) khớp `QĐ-104b` + danh sách loại trừ của
`QĐ-115aa`. Ngoại lệ duy nhất: §7.9 "bắt buộc **mọi** lần gửi lại" rộng hơn chữ `QĐ-114q` (RB-1).

### 3.2. Luật QĐ/BRD đòi mà SPEC thiếu (2)

| Luật | SPEC |
| --- | --- |
| Tối đa 6 mục | Có (W4-02) |
| Checklist theo lần quyết các mục được chọn | Có (W4-05, W4-06) |
| Xác nhận lần hai — ranh giới đợt 5 | Đúng: `QĐ-118a` giữ `QĐ-115aj`/`QĐ-116a` trong đợt 5; §7.13 giữ kết quả theo mục để đợt 5 thêm cặp (Request, câu) |
| Ghi chú khi gửi lại | Có, nhưng phạm vi sai ở ca bị chặn (RB-1, RB-2) |
| Rút trước quyết định đầu tiên | Có; thiếu ca test mục đã bị trả về (RB-7) |
| Người xin vừa thành trưởng phòng — mọi Request trả phí còn mở thành một bước | Có (W4-07, W4-14); test nên trộn trạng thái (RB-9); không tách dòng Request nhóm (`QĐ-118c`, `QĐ-118o`) đúng |
| Phòng không có trưởng phòng — Request đứng chờ | Có (ca L, rút được ca D) |
| Người duyệt chi Duyệt / Từ chối / Trả về (_Hỏi người xin_ với một bước) | Có (#4, ca D); _Hỏi trưởng phòng_ + trình lại kèm ghi chú (W4-10) — thiếu `ticket`/cờ ở hàng đợi trình (RB-5) |
| Mobile 4 tác vụ | Đúng `QĐ-61b`, `QĐ-82l(16)`, `QĐ-116ab`: mobile chỉ từng mục, gửi lại ở web |
| `QĐ-118` bước IT | Có (W4-14, IT1 200 / IT2 403) |
| Trưởng phòng rút ở hàng đợi trình (`QĐ-116b`) | Có ở W4-12 (chờ OQ-W4-2); cần ghi rõ giai đoạn (RB-8) |

### 3.3. Ca biên (3)

- Một mục bị từ chối, mục khác vẫn đi: có (7.4 tiêu chí 1, 7.5 C, 7.6 D–E; 7.3 E không kiểm lại).
- Tiền theo thứ tự mục: có cho số cơ sở; thiếu hai vế dự phòng (RB-4).
- `K4`/gói gắn máy: `DEVICE_KEY` là vi phạm mục (ca M) — đúng; gói `K4` `ACCOUNT` đi đường `assess` như Request đơn.
- `NOT_STARTED`: lỗi cấp phiếu — đúng (người xin chung cho mọi mục).
- `K5` nội bộ miễn phí: **không** vào phiếu — đúng `QĐ-115ad`; là vi phạm mục (liệt kê cùng lỗi khác) hợp với `QĐ-115ac` "trả lỗi từng mục".
- Request một bước bị chặn rồi gửi lại: **vỡ** (RB-1).

### 3.4. Bốn câu OQ và `NESTED_ARRAYS` (4)

| Câu | Đánh giá | Căn cứ đã kiểm |
| --- | --- | --- |
| OQ-W4-1 → A (1–6) | **Đồng ý** | `US-05-22` AC-13 (`EP-05.md:934`) có "gửi phiếu một mục" ở trạng thái BASELINED; sổ QĐ chỉ nêu trần; V3 #5 (≥ 2) chỉ là đề xuất |
| OQ-W4-2 → A (làm W4-12) | **Đồng ý**; thực chất chỉ là xếp đợt — luật đã chốt ở `QĐ-116b` | grep `116b` trong SPEC đợt 1/2/3 và handoff 22/11: **không** đợt nào nhận; `US-05-08` AC-14 dẫn tới AC-15; cùng code rút |
| OQ-W4-3 → A (không mã) | **Đồng ý** | Không QĐ nào đòi; V3 #12 chỉ nêu câu hỏi; tiền lệ Owner bỏ trường chỉ để hiện |
| OQ-W4-4 → A (thông báo từng mục) | **Đồng ý** | Không QĐ; V3 #8 chỉ đề xuất. Lưu ý thêm cho Owner: với `QĐ-110i` Super Admin cũng nhận N thông báo "phòng thiếu trưởng phòng" — chấp nhận được |
| `NESTED_ARRAYS` `requestTicketGet#items` | **Nên duyệt** | Có tiền lệ thêm mục có biên bằng sự kiện `added` (`test/support/api-collection-registry-events-w2.ts:8…`, `-w3.ts:26`); biên nghiệp vụ `QĐ-116e` + CHECK M1; schema khai `maxItems: 6`, `businessMaximum.source` dẫn hằng số trần |

### 3.5. Tương thích (5)

- Request đơn cũ: an toàn — cột nullable, CHECK chỉ áp khi `ticket_id` có giá trị, không backfill, mọi route đơn giữ hành vi.
- `accessRequestResubmit` bắt buộc `replyNote`: **cần** phá (chữ `QĐ-114q`, `US-05-02` AC-24), nhưng nên thu hẹp như RB-2 và sửa luật như RB-1.
- `spendBatchSubmit`: thêm `replyNotes?` là thêm trường (ổn); đổi thứ tự `results` là phá không cần (RB-3).
