# Spec: Rà soát sau điều chuyển — thu hồi mặc định, báo trước, tạm dừng khi thiếu trưởng phòng

- Phụ trách: AI theo giao việc Owner (05/11/2026).
- Thiết kế ban đầu bởi: AI (agent C-SPEC-TL) theo giao việc Owner (05/11/2026).
- Thiết kế: `draft`. Owner review: chưa review.
- **Mức FE-tonight: Phần A = `A`** (mục 1 + `needsNewRequest` K5 + mã cảnh báo Business Owner — chỉ DTO/mapper, **không migration**); **Phần B = `B`** (mục 2–8: mô hình hạn, job báo trước/áp mặc định/tạm dừng, wire `defaultRevocationAfter`, M10/M11). Hệ quả cho demo: MF-3 bước 3.8 (F19 P0) **chưa chạy** tối nay — quá hạn vẫn chỉ nhắc như hiện tại (`transfer-review-overdue.service.ts:15-60`); FE không hiện ngày áp mặc định.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-2.16`(2)(4)(7), `FR-8.2`; `US-03-07` AC-6, AC-7, AC-11, AC-12; `US-03-12` AC-5, AC-6, AC-11;
  `QĐ-50b`, `QĐ-62c`, `QĐ-87h`(3), `QĐ-89e`, `QĐ-94f`(4), `QĐ-94l`(2)(5), `QĐ-94m`(4)(10), `QĐ-99k`(c)), BE `3e4553b9`.
  Tracker: `docs/reviews/qd96-100-alignment-2026-11-05/` (nhật ký review đã xóa 11/11/2026 — xem git history) (L-502, L-503, L-506, L-507, L-508, L-510; S-13).
- Nhóm roadmap: G6 — chỉ là planning container; container giao việc là bó finding `qd96-100-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Quyền T1/T2/T3 mà trưởng phòng mới không quyết trong hạn thì bị **thu hồi mặc định** sau khi trưởng phòng mới và IT Admin
phụ trách được báo trước 2 ngày làm việc; phòng nhận chưa có trưởng phòng thì hạn **tạm dừng** (Super Admin được nhắc định kỳ),
có trưởng phòng thì hạn bắt đầu, tới trần thì áp mặc định. Rà soát sau khởi tạo (`POST_SETUP`) vẫn chỉ nhắc.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (Track T), Story thuộc G6.
- Mode: `technical-enabler`.
- Outcome and owner: mô hình hạn của rà soát sau điều chuyển và job áp mặc định — capability `personnel/transfer-review`.
- Boundaries: bảng `transfer_reviews`, `transfer_review_items` (+ trigger); job theo giờ đã có (`TransferReviewSweeper`);
  `licensing.openRevocation` (nguồn `TRANSFER_REVIEW`); thông báo; tham số. Wire `transferReviewDecide`, `transferReview*` (đọc).
- Not larger: Request cấp thay thế (`qd96-100-transfer-replacement-request`), nhãn T1–T4 và chồng lấn đầy đủ (H6) là outcome khác.
- Not smaller: báo trước, tạm dừng và áp mặc định cùng một mô hình hạn và một job; tách ra sẽ có giai đoạn áp mặc định không báo
  trước hoặc áp lên rà soát đang tạm dừng.
- Siblings: `qd96-100-transfer-replacement-request`, `qd96-100-transfer-labels-and-overlap` (hoãn), `g6-transfer-tool-review`.
- Scope map: [G6](../../../roadmap.md#work-item-decomposition-g6) — điều phối viên chuyển chủ các khóa ở bảng dưới khi đăng ký.

## Primary Story/AC

| Story | AC              | Coverage | Phần còn lại thuộc                                                                                                                                        |
| ----- | --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | Story `RETIRED` | n/a      | US-03-07, US-03-12 `RETIRED`; thay bởi `US-03-13` (chưa có hạng mục) — code rà soát sau điều chuyển gỡ ở đợt `MF-2`/`MF-3` cùng `g6-transfer-tool-review` |

_Re-pin 11/11/2026 ([C3](../../../reviews/mf2-mf3-2026-11-10/C3-SCOPE-MAP-REPIN.md)):_ bỏ khỏi bảng `US-03-07` AC-6, AC-7, AC-12 (partial); `US-03-12` AC-5, AC-6, AC-11 (partial) — Story `RETIRED` ở Docs `5bb2e6a` (`US-03-07` `QĐ-103h`, `US-03-12` `QĐ-103h`); code đã merge là lịch sử, khóa ở scope map là `not affected`. Không còn Story nào nên `Mode` đổi `technical-enabler` (dòng `n/a` nêu hạng mục thay thế).

## Supporting references

- `US-03-07` AC-5 (_cần công cụ mới_) bị thay theo S-13 (`FR-2.16(2)` BRD:544): bỏ `NEEDS_NEW_TOOL`; Docs cần sửa AC-5.
- `US-03-07` AC-11 (_còn cần_ nội bộ ⟹ giữ, không Request): sửa cờ `needsNewRequest` (L-506) — AC vẫn của `g6-transfer-tool-review`.
- `QĐ-99k`(c): điều chuyển Business Owner chỉ hỏi _giữ hay đổi_ (L-510). `QĐ-89e`: rà soát sau khởi tạo không tự thu hồi.

## Explicit out of scope

- Nhãn T1–T4, chồng lấn tính riêng cho _không còn cần_ (thu hồi ở mốc 5 ngày thay vì ngay), giữ chờ Cost Center, +10 ngày khi
  Request thay thế bị chặn ngân sách (L-501, L-504, L-509 → H6 `qd96-100-transfer-labels-and-overlap`). _Không còn cần_ vẫn mở
  thu hồi ngay ở Phần A (FE tối nay). **Phần B (D6):** sau facade `timing` của `qd96-100-revocation-deadline-and-withdraw` Task 2,
  `transfer-review-decision.service.ts:75` truyền `timing.notBefore = addWorkingDays(effectiveOn, 5)` (hết chồng lấn `QĐ-94f`(3)
  khi không có quyền thay thế) — IT `claim` sớm ⟹ 409 `NOT_BEFORE`; phần còn lại của chồng lấn vẫn H6.
- Tự tạo Request cấp thay thế, trường `reason` của quyết định (#17). Chuyển seat kèm chi phí (H2).
- Định nghĩa _điểm điều chỉnh_ của thuê bao linh hoạt (chat MF-5) — ở đây chỉ đọc mốc catalog đã suy ra (giả định G-2).

## Dependencies and blockers

- #1 `qd96-100-revocation-deadline-and-withdraw` (Track P) sở hữu cơ chế mở thu hồi với actor `SYSTEM`; hạng mục này chỉ tham
  chiếu. Task áp mặc định (plan Task 5) chờ #1 merge.
- Dữ liệu `NEEDS_NEW_TOOL` trên demo: #28 `qd96-100-seed-demo-v3` không còn sinh giá trị này.

## Ownership: module, data, API

- `personnel/transfer-review` (sở hữu). Đọc `organization/public` (trưởng phòng, IT Admin phụ trách, lịch), `catalog/public`
  `SubscriptionPeriodApi.getPeriods` (mốc trần), `operating-parameters/public`; ghi qua `licensing/public` `openRevocation`;
  `notifications/public`. Không thêm submodule Nest.
- API đổi: `transferReviewDecide` (bỏ `NEEDS_NEW_TOOL`, `newToolNote`); response `transferReviewList/Get/ItemList`
  (`dueOn` nullable, thêm `defaultRevocationAfter`, `decision` thêm `DEFAULT_REVOKED`, bỏ `newToolNote`, `needsNewRequest` chỉ
  cho quyền trả phí); `departmentTransferRecord` warning code `BUSINESS_OWNER_REPLACEMENT_NEEDED` → `BUSINESS_OWNER_KEEP_OR_CHANGE`.

## Behavior and design

1. **(Phần A) Quyết định của trưởng phòng**: chỉ `STILL_NEEDED | NOT_NEEDED`. `NEEDS_NEW_TOOL` bị DTO từ chối (422 `VALIDATION_ERROR`);
   `newToolNote` bỏ khỏi body (strict ⟹ 422); bỏ `refine`/`isNoteAllowed` (`transfer-review.dto.ts:26-36`). Body cuối do #17 Phần A chốt:
   `{ assignmentId, decision: 'STILL_NEEDED'|'NOT_NEEDED', reason }`. Giá trị enum giữ trong DB (Q-02 B), response `decision` vẫn có thể
   trả `NEEDS_NEW_TOOL` (đọc lịch sử) tới khi M11 (Phần B) đưa dòng `OPEN` về `PENDING`; test chặn ghi mới. Cùng Phần A: `needsNewRequest`
   chỉ `true` khi kiểu cấp khác K5 (L-506, mapper) và warning `BUSINESS_OWNER_KEEP_OR_CHANGE` (L-510) — mục 6 và bảng API vế này.
   Mục 2–8 dưới đây là **Phần B**.
2. **Hạn khi mở** (`openFor`, `PostSetupReviewService`): phòng nhận có trưởng phòng hôm nay ⟹ `dueOn` như hiện nay; không có ⟹
   `dueOn = null` (_tạm dừng_). Chụp `defaultNoticeWorkingDays` từ tham số mới `TRANSFER_REVIEW_DEFAULT_NOTICE_WORKING_DAYS`
   (mặc định 2, 1..10, nhóm `PERSONNEL`) — rà soát mở sau khi đổi tham số dùng giá trị mới (`US-03-12` AC-5).
3. **Job theo giờ** (thay `noticeOverdue` bằng `sweep`, mỗi bước một transaction, khóa rà soát `FOR UPDATE`, lô 200):
   - (a) _Bắt đầu hạn_: rà soát `OPEN`, `dueOn = null`, phòng có trưởng phòng hôm nay ⟹ `dueOn = reviewDueOn(today, N)`, báo
     trưởng phòng `TRANSFER_REVIEW_DUE` (eventKey `…:started`), Audit `TRANSFER_REVIEW.DEADLINE_STARTED`.
   - (b) _Báo trước_ (chỉ `origin = TRANSFER`, có trưởng phòng hôm nay, còn dòng `PENDING`, `defaultNoticedOn = null`,
     `today ≥ subtractWorkingDays(dueOn, n)`) ⟹ ghi `defaultNoticedOn = today`; thông báo mới `TRANSFER_REVIEW_DEFAULT_REVOCATION_NOTICE`
     tới trưởng phòng và IT Admin phụ trách (`getItAdminInCharge`, dự phòng IT Admin dùng được đầu tiên), params
     `employeeId, departmentId, pendingItems, revokeAfter`; Audit `TRANSFER_REVIEW.DEFAULT_NOTICED`.
   - (c) _Áp mặc định_ (`origin = TRANSFER`, có trưởng phòng hôm nay, `defaultNoticedOn ≠ null`,
     `today > max(dueOn, addWorkingDays(defaultNoticedOn, n))`): mỗi dòng `PENDING` ⟹ mở thu hồi bằng actor `SYSTEM` của #1
     (nguồn `TRANSFER_REVIEW`, `decidedRole` = hằng `DECIDED_ROLE_SYSTEM_*` do #1 export cho rà soát điều chuyển,
     `decidedByEmployeeId: null`, `reference = 'transfer-review-default:<reviewId>'` theo quy ước `'<job>:<id>'` của #1,
     `timing.dueOn = addWorkingDays(today, DEPARTURE_REVOCATION_WORKING_DAYS)` để sweeper quá hạn của #1 cảnh báo — R-22, R-23)
     rồi ghi `DEFAULT_REVOKED` + `revocationTaskId`;
     dòng bị gate từ chối (K3/K4 `TYPE_NOT_SUPPORTED`, seat đã đóng) giữ `PENDING`, Audit
     `TRANSFER_REVIEW.DEFAULT_NOT_APPLIED {assignmentId, problem}` một lần mỗi dòng. Hết dòng chờ ⟹ `COMPLETED`.
     Công thức `max(...)` bảo đảm luôn có ≥ n ngày làm việc báo trước, kể cả rà soát đã quá hạn lúc deploy.
   - (d) _Tạm dừng_ (`dueOn = null`, không trưởng phòng): nhắc Super Admin `TRANSFER_REVIEW_WAITING_FOR_HEAD` khi
     `noHeadAlertedOn = null` hoặc `today ≥ addWorkingDays(noHeadAlertedOn, k)`, `k` = tham số mới
     `TRANSFER_REVIEW_NO_HEAD_ALERT_WORKING_DAYS` (mặc định 5, 1..30); _trần_: dòng `PENDING` có `capOn ≤ today` ⟹ áp mặc
     định riêng dòng đó như (c) (không cần báo trước, `US-03-12` AC-11).
   - Ngày phòng **mất** trưởng phòng sau khi hạn đã chạy: hạn không đặt lại (`QĐ-62c`); (b)(c) chờ tới khi có trưởng phòng; trần áp.
   - `origin = POST_SETUP`: giữ hành vi nhắc quá hạn hiện tại (`overdueNoticedAt`), không (b)(c), không trần (`QĐ-89e`).
4. **Trần** `capOn` của dòng = `notice.baseDate` của thuê bao chứa seat cũ (`SubscriptionPeriodApi.getPeriods`, đọc theo lô);
   `null` (vĩnh viễn, K5, thiếu mốc) ⟹ không trần, chỉ nhắc. _Giả định G-2_, xem Open questions.
5. **Actor của thu hồi mặc định** (Owner chốt 05/11/2026): người mở tác vụ ghi là **Hệ thống** — actor `SYSTEM` trong Audit,
   không phải tài khoản đăng nhập được (đúng SoD-6), qua cơ chế do #1 định nghĩa; tác vụ vẫn giao IT Admin phụ trách phòng nhận
   thực hiện. Không tự đặt chuỗi `decidedRole`: dùng hằng của #1 (R-22).
6. **Wire đọc**: `dueOn: string | null`; `waitingReason` giữ `NO_HEAD`; thêm `defaultRevocationAfter: string | null`
   (= `max(dueOn, addWorkingDays(defaultNoticedOn ?? subtractWorkingDays(dueOn, n), n))`, null với `POST_SETUP`/tạm dừng/đã xong)
   — đáp `US-03-07` AC-12 (_ngày áp mặc định_); `overdue` với `dueOn = null` là `false`. `needsNewRequest` chỉ `true` khi kiểu
   cấp khác K5 (L-506). Danh sách thêm lọc `defaultPending=true` (có `defaultNoticedOn`, còn dòng chờ) cho IT Admin.
7. **Lỗi**: không mã mới cho route ghi. Thông báo mới: `TRANSFER_REVIEW_DEFAULT_REVOCATION_NOTICE`, `TRANSFER_REVIEW_WAITING_FOR_HEAD`
   (mã là chuỗi, không migration; khai `FIGURE_WORDS`/params ở `inbox.policy.ts`).
8. **Migration** — số toàn cục theo C-REVIEW mục 3 (sau M09 của #3, trước M12 của #11); timestamp đặt **lúc merge**, lớn hơn
   migration cuối trên branch (R-19):
   - **M10** `<ts>_transfer_review_decision_default`: `ALTER TYPE "TransferReviewDecision" ADD VALUE 'DEFAULT_REVOKED'` (DB-05:
     không hoàn tác — ngoại lệ theo Q-02 B).
   - **M11** `<ts+1>_transfer_review_defaults`: `due_on` DROP NOT NULL; thêm `default_notice_working_days SMALLINT NOT NULL DEFAULT 2`,
     `default_noticed_on DATE`, `no_head_alerted_on DATE`; `transfer_review_guard`: `due_on` chỉ được đổi từ NULL sang giá trị;
     check `revocation_for_not_needed` → `(decision IN ('NOT_NEEDED','DEFAULT_REVOKED')) = (revocation_task_id IS NOT NULL)`;
     check `decided_together` → `decided_at` theo `PENDING`, `decided_by` NULL khi `PENDING` hoặc `DEFAULT_REVOKED`; dữ liệu: dòng
     `NEEDS_NEW_TOOL` của rà soát `OPEN` về `PENDING` (tắt/bật trigger dòng trong migration, xóa `decided_*`, `new_tool_note`);
     rà soát `COMPLETED`/`SUPERSEDED` giữ nguyên làm lịch sử. Cột `new_tool_note` giữ, Prisma `@ignore`.
   - Rủi ro: ghi chú `newToolNote` của dòng đưa về `PENDING` bị xóa (Audit vẫn giữ sự kiện `DECIDED`). Owner chốt Q-R1: DB demo
     drop rồi seed lại `shared-demo-v3`, nên câu UPDATE chủ yếu bảo đảm migration hợp lệ trên dữ liệu bất kỳ.
   - Thứ tự rebase (R-21): `parameter-definitions.policy.ts` sau #1, #5; `notifications.types.ts` + `inbox.policy.ts` sau #1, #5,
     #2, #3 — chỉ thêm khối của #18, không sắp xếp lại; #11, #14, #21, #22 rebase trên #18.
9. Cập nhật `personnel/README.md` (bỏ bất biến _không gì bị thu hồi tự động_) và mô tả OpenAPI của route quyết định.

## Test matrix

| AC / rủi ro                      | Tình huống                                             | Cấp test                  | Kết quả mong đợi                                                                                  | Bằng chứng sau implement |
| -------------------------------- | ------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------ |
| `US-03-12` AC-5                  | due Thứ Sáu 23, n=2: sweep Thứ Tư 21                   | unit policy + integration | báo trưởng phòng + IT Admin một lần; chạy lại không báo lần hai                                   | planned                  |
| `US-03-07` AC-6                  | Thứ Bảy 24 còn Figma `PENDING`                         | integration               | `DEFAULT_REVOKED`, tác vụ thu hồi `TRANSFER_REVIEW`, rà soát `COMPLETED`; dòng đã quyết không đổi | planned                  |
| rủi ro deploy                    | rà soát quá hạn 10 ngày, chưa báo                      | unit + integration        | sweep đầu chỉ báo; áp sau n ngày làm việc                                                         | planned                  |
| `US-03-12` AC-5                  | đổi tham số n=1 sau khi mở rà soát A                   | integration               | A giữ n=2; rà soát mở sau dùng 1                                                                  | planned                  |
| `US-03-07` AC-7, `US-03-12` AC-6 | phòng nhận không trưởng phòng                          | integration               | `dueOn = null`, không báo trước/không áp; Super Admin nhận nhắc; lặp sau k ngày                   | planned                  |
| như trên                         | gán trưởng phòng ngày 20/10                            | integration               | `dueOn = 20/10 + 5 ngày làm việc`, trưởng phòng nhận thông báo                                    | planned                  |
| `US-03-12` AC-11                 | vẫn không trưởng phòng, tới `capOn` 01/12              | integration               | dòng Figma `DEFAULT_REVOKED`; dòng thuê bao không mốc vẫn chờ                                     | planned                  |
| `QĐ-89e`                         | rà soát `POST_SETUP` quá hạn                           | integration               | chỉ nhắc như cũ, không thu hồi                                                                    | planned                  |
| đồng thời                        | hai instance sweep; trưởng phòng quyết cùng lúc job áp | integration               | một thu hồi; quyết định thắng hoặc 409 `DECISION_ALREADY_RECORDED`                                | planned                  |
| L-507                            | gửi `NEEDS_NEW_TOOL` / `newToolNote`                   | HTTP                      | 422 `VALIDATION_ERROR`                                                                            | planned                  |
| L-507 migration                  | dòng `NEEDS_NEW_TOOL` của rà soát OPEN                 | integration (migration)   | thành `PENDING`; check/trigger vẫn giữ                                                            | planned                  |
| L-506                            | K5 `STILL_NEEDED`                                      | unit mapper               | `needsNewRequest = false`                                                                         | planned                  |
| `US-03-07` AC-12                 | IT Admin lọc `defaultPending=true`                     | HTTP                      | thấy nhân viên, phòng, `pendingItems`, `defaultRevocationAfter`                                   | planned                  |
| L-510                            | ghi điều chuyển Business Owner                         | HTTP                      | warning `BUSINESS_OWNER_KEEP_OR_CHANGE`                                                           | planned                  |
| K3/K4                            | dòng K4 quá hạn                                        | unit + integration        | giữ `PENDING`, Audit `DEFAULT_NOT_APPLIED` một lần                                                | planned                  |

## Definition of Done

- [ ] Mọi AC claim có test đỏ-trước/xanh-sau; AC `partial` ghi đúng vế.
- [ ] Quick gates xanh trên revision cuối; HTTP đổi ⟹ test HTTP + `pnpm openapi:export`.
- [ ] Spec/plan phản ánh implementation; contract đổi báo FE (L-984).
- [ ] Không tăng legacy ledger kiến trúc; README module cập nhật.

## Open questions

- G-1 đã đóng: Owner chốt 05/11/2026 — actor `SYSTEM` (cơ chế của #1), tác vụ giao IT Admin phụ trách.
- **G-2 (cần chat MF-5 xác nhận, không chặn)**: _điểm điều chỉnh kế tiếp_ = mốc catalog `notice.baseDate` (ND, hoặc ngày kết thúc
  khi không tự gia hạn). Phương án: (A, khuyến nghị) dùng mốc đó, null ⟹ không trần; (B) chờ MF-5 định nghĩa mốc cho thuê bao
  linh hoạt rồi đọc qua facade của họ. Chọn A ở lượt này, đổi nguồn khi MF-5 công bố.

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`). Chưa nghiệm thu.
- 05/11/2026: Owner chốt G-1 (actor `SYSTEM` do #1 sở hữu); G-2 giữ giả định (phụ thuộc chat MF-5).
- 05/11/2026: theo C-REVIEW — R-19 (M10, M11, timestamp lúc merge), R-21 (thứ tự rebase), R-22 (hằng `decidedRole` của #1),
  R-23 (truyền `timing.dueOn`).
- 05/11/2026 — chỉnh 05/11 theo review main flow (F17, F19 P0): tách Phần A (DTO bỏ `NEEDS_NEW_TOOL`/`newToolNote`, `needsNewRequest`
  K5, mã cảnh báo Business Owner; không migration) / Phần B (mô hình hạn + job + M10/M11). F19 ghi rõ là `B` cho demo, không giả là xong.
- 05/11/2026 (chỉnh 05/11 theo review main flow — vòng FIELDS): D6 không đưa vào Phần A — facade `timing`/`notBefore` **chưa có** ở `808318a4`
  (`licensing/public/licensing.types.ts:265-279` chỉ có `context.dueOn` không ai đọc; grep `notBefore` trong `licensing` = 0) nên
  không có "tối thiểu" nào không cần migration M01 của #1; ghi là Phần B. Phần A (Task 2) thuộc **Đợt 1** (Owner). Câu hỏi Owner
  chưa quyết (QT 3.4 _Hệ thống_ đóng Request trả phí khi điều chuyển vs `QĐ-90b` _IT đóng kèm lý do_; code theo `QĐ-90b`) ghi ở
  `fe-batch/DELTAS-APPLIED.md`, không đổi gì ở đây.
