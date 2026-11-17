# REVIEW-SPECS-2-SBF20 — review/verify lần 2 `SPEC-5A-SBF20.md` (17/11/2026)

Chỉ đọc code BE `dev` @ `94a8ee84` (đã kiểm `git rev-parse HEAD`), không sửa code, không lệnh ghi git. Sửa trực tiếp spec ở các chỗ ghi
"Review 2:". Owner đã chốt: `S20-Q4` = A (3 tham số `FR-8.2` 7/30/7), `5A-SBF20-Q1` = A (nối dòng khi đổi số, lệch chữ "cùng dòng" của
`QĐ-106i`(3) — Owner đã biết), Q2 = A, Q3 = A.

**Skill đã đọc/dùng:**
- `agent-skills:code-review-and-quality` (process + review): khung 5 trục, phân mức Critical / Required / Optional / FYI, đề xuất sửa cụ thể.
- `superpowers:verification-before-completion` (verification): mọi phát hiện dưới đây có dòng code hoặc nguồn đã đọc trong lượt này; không
  chạy test (chỉ đọc, theo brief và quy ước Owner "không chạy test khi chưa hỏi").
- Mapping: không có skill riêng cho "review spec nghiệp vụ"; dùng `code-review-and-quality` làm process lẫn review (ghi rõ).

Nguồn đã đọc: `SBF-20-software-stock-subscription-management.md` v3.1 (toàn bộ), sổ QĐ (`103d/e/j/k/n/q/v`, `104c/d/k/l`, `106h/i`,
`110k/u/v`, `111o/r/x`, thêm `58b`, `98e`, `99h`, `99i`), BRD `FR-1.4`, `FR-1.12`(1)–(13), `FR-8.2`, `KPI-4`; `docs/rules/database-business.md`;
code licensing/catalog/requests/operating-parameters/notifications và 3 migration của `subscription_renewals`.

## 1. Kiểm trích dẫn của spec (lượt 2, 24 mẫu)

Đúng 23/24: `subscription-period.service.ts:35-40,170,266`, `subscription-period.types.ts:19`, controller `:86,:128,:277`,
`adjustmentPointOf :116-173`, hằng `:62-63`, repo `:24-28,114-128,145-157`, seat repo `:36-64`, `RenewalHold` `:145-160`,
`assignment.service.ts:397-430`, `parameter-definitions.policy.ts:303`, `operating-parameters.api.ts:52-74`, `subscription-view.service.ts:102,254,318`,
`subscription-notice.service.ts:37-38`, 3 chỗ đếm tham số (`spec :160` "twenty-nine", `integration :428` `toBe(29)`, `registry :81` `maxItems: 22`),
trigger một chiều `20261108300100` (cho `PROPOSED → DECIDED → OUTCOME_RECORDED` và `PROPOSED → STALE`), tiền lệ `20261108500000`.
Lệch nhỏ: `assignment.repo.ts:220` (`existingOf`) là truy vấn của **gói nội bộ** không có thuê bao, không phải "ghế chờ cấp của kho" — spec đã
để Sonnet xác minh, giữ nguyên.

## 2. Bảng phát hiện

| ID | Trục | Mức | Vấn đề (file:dòng) | Đã sửa trong spec |
| --- | --- | --- | --- | --- |
| R2-1 | Logic | Required | Index mới `(subscription_id, notice_base_date) WHERE state <> 'STALE'` không chặn ca `DECIDED` cũ (trước deploy, `notice_base_date` theo luật cũ). IT ghi mới ⟹ một thuê bao có hai ca sống; `CANCEL` mới chạy song song ca cũ chưa kết quả; sweep có thể báo đỏ cho kỳ đã có ca (review 1 S20-10 chưa được áp). | §4.4 bước 7: ca `DECIDED` cũ ⟹ 409 `ALREADY_PROPOSED` `details.renewalId`; §4.5 coi ca `DECIDED` cũ là "ca của kỳ"; test T4; breaking FE 14 |
| R2-2 | Logic | **Critical** (chặn ghi đúng số) | `seatsToCarry` (`assignment.policy.ts:123-130`) mang ghế có ngày cuối **đúng** `startDate` (`expectedEndDate >= startDate`, `validUntil > startDate`), còn §4.3 không đếm ghế kết thúc đúng ngày gia hạn (`QĐ-106i`(2)). Có một ghế như vậy là `AS_DECIDED` với `target` chính xác luôn 409 `EXCESS_NOT_REVOKED` (`renewal-outcome.service.ts:176-181`). | §4.4 bước 8: `continueInto` nhận `endingBy = renewalOn`, bỏ ghế có ngày cuối ≤ `renewalOn` khỏi `carry` ở đường ghi mới; không đổi `seatsToCarry` dùng chung; test http |
| R2-3 | Logic | Required | `checkOutcome` (`renewal-outcome.policy.ts:17-22`) so `nextQuantity` với `purchasedQuantity` cũ cho mọi lựa chọn trừ `REDUCE` ⟹ `INCREASE` + `AS_DECIDED` luôn 422 `OUTCOME_MISMATCH`. File không có trong danh sách T4. | §4.4 bước 8 + T4 thêm `renewal-outcome.policy.ts` + spec |
| R2-4 | Logic | Required | `activeSeatsToday` định nghĩa `valid_from ≤ hôm nay`, còn `assertAllTakenBack` dùng `notEndedBy(today)` (gồm ghế bắt đầu sau hôm nay, `subscription-renewal-seat.repo.ts:51`). `canCancel = true` mà ghi vẫn 409. | §4.4 bước 6: `activeSeatsToday = notEndedBy(today).length` |
| R2-5 | Kiến trúc/API | Required | Route mới `GET subscription-renewals/adjustment` nếu khai báo sau `GET subscription-renewals/:id` (`controller.ts:86`, `@Param() SubscriptionRenewalIdParamDto`) sẽ bị `:id` bắt ⟹ 422 `VALIDATION_ERROR`. | T5: khai báo trước `:id`, http-spec khẳng định 200 |
| R2-6 | Logic | Required | Spec không nói `notice_basis` ghi gì. `AdjustmentPoint.kind` (`PAYMENT_DATE`/`NOTICE_DEADLINE`/`RENEWAL_DATE`/`END_DATE`) không trùng enum `RenewalNoticeBasis` và mất phân biệt `DECLARED`/`INFERRED_UNCONFIRMED`. | §4.4 bước 9: bảng ánh xạ; `closure` chỉ nhận với `CANCEL` |
| R2-7 | Logic | Required | `deciderRoleOf` (`subscription-renewal.repo.ts:24-28`) đọc giá trị lạ thành `SPENDING_APPROVER` ⟹ ca mới `IT_ADMIN_IN_CHARGE` hiện sai vai. | T1 |
| R2-8 | Nghiệp vụ/Logic | Required (chờ điều phối) | Kho nay có trong `getPeriods` ⟹ sau khi IT ghi kết quả ở điểm (kỳ mới mua **đúng** `target`), Request duyệt **sau** đó cấp trên kỳ cũ cần seat ở kỳ mới; kỳ mới đầy ⟹ 409 `NEXT_PERIOD_SEATS` (`assignment.service.ts:421-424`) dù kỳ cũ còn seat *Trống*; `addPoolSeat` chỉ mua trên kỳ đang cấp (`provisioning-grant-writer.service.ts:313`). Chặn cấp tới 30 ngày (năm) / 7 ngày (tháng). Spec ghi "đúng ý". | §8.11 viết lại; khuyến nghị `S20-T4c` (+0,3 h): kỳ kế tiếp là kho mà `SEAT_CAPACITY` ⟹ `addPoolSeat(next)` rồi mang lại (`QĐ-110v`, `QĐ-103q`); không làm ⟹ gap đã biết + test khẳng định 409 |
| R2-9 | Logic | Required | `getValuesAt` nhận `Date` (`operating-parameters.api.ts:74`), spec nói "đọc tại `startDate`" (BusinessDate). Dòng gói tháng không đổi số sống nhiều tháng (Q1 = A) ⟹ đọc tại `startDate` của dòng làm kỳ tháng hiện tại giữ giá trị của nhiều tháng trước, trái "kỳ giữ giá trị lúc bắt đầu" (`QĐ-106h`). | T9b: instant = đầu ngày bắt đầu kỳ (năm: `startDate`; tháng: `max(startDate, addMonths(deadline, −1))`; null ⟹ `createdAt`); một lời gọi mỗi khóa mỗi trang |
| R2-10 | Logic | Required | "Request chưa ở trạng thái cuối" chưa có danh sách; `openRequestsOfPlan` đặt ở listener nhưng cần repo của `requests/access-request`. | §4.4 bước 6: danh sách trạng thái cuối (`REJECTED, IT_REJECTED, COMPLETED, FAILED, WITHDRAWN, CANCELLED, DRAFT`), câu `count` ở repo |
| R2-11 | Logic | Optional | Trigger `subscription_renewals_guard` không bảo vệ `seats_needed` (spec chủ ý). Cột là bằng chứng mốc đối chiếu hóa đơn (`QĐ-104d`(1)); thêm vào bộ "proposal is final" chỉ là `CREATE OR REPLACE FUNCTION` trong migration `…110100`. | Không sửa (để chat A1 quyết, ≈ 5 phút) |
| R2-12 | Hiệu năng | Optional | Sweep hằng giờ tối đa 500 thuê bao; tính `seatsNeeded` (2 SQL + hook) cho mọi dòng là thừa. Danh sách ≤ 500 không có thứ tự/cursor ⟹ >500 kho thì phần sau không bao giờ được quét (thực tế số kho nhỏ). | §4.5: chỉ tính khi có việc đến hạn; giới hạn 500 giữ, ghi rủi ro |
| R2-13 | Nghiệp vụ | Required (phủ luồng) | `SBF-20` §5.1 *tỷ lệ chi phí seat Trống > 10 %* (`QĐ-103k`) không có trong spec (không xử lý, không dời). Code chưa có tham số lẫn cảnh báo. | §9 thêm 4b-8 (`US-12-18`); §14 bảng phủ toàn bộ bước 1–7, §5.1, §5.2 |
| R2-14 | Nghiệp vụ | FYI | Thuê bao không phải kho `K2` (K1 có phòng, K5, dòng cũ) mất cảnh báo/sự kiện gia hạn — đúng `FR-1.12`(9) nhưng chưa ghi breaking. | §5 breaking FE 14 |
| R2-15 | Nghiệp vụ | Optional | *Gói tháng giữ nguyên* chỉ nhắc khi `purchased > target`; `QĐ-103v`(5) nói "nhắc IT" không điều kiện (ca thiếu seat thì Request đã duyệt sẽ mua thêm lúc cấp). Review 1 S20-7 (cửa sổ `deadline … deadline+2`) và S20-9 (`END_DATE` không hạn chót) vẫn để mở. | Không sửa |

Đã khớp, không cần sửa: điều kiện hủy (0 quyền, 0 Request, hai ô xác nhận) đúng `QĐ-99i`/`FR-1.12`(10); cảnh báo đỏ chỉ gói năm, IT + Finance, không
Người duyệt chi (`FR-1.4`); sự cố tự gia hạn báo Người duyệt chi đúng `QĐ-99h` (nên review 1 S20-8 đã có nguồn); IT khác ghi thay đúng `QĐ-58b`;
Finance đọc `deadline-events` + được báo kết quả (`QĐ-106i`(3)); `K4` vĩnh viễn/`K1` không có điểm; thuê bao kho owner null; trigger một chiều cho
một transaction 3 bước; CHECK mới so `::text` + `_values` tách file đúng `DB-05`/`DB-15`; dải migration `20261117110000`–`110900` > `20261113102700`
và > dải A2; migration `…110200` theo đúng tiền lệ `20261108500000`; số đếm tham số theo quy tắc PLAN §2 (A1: −1 +3); `subscription_deadline_events`
unique theo `subscription_id` vẫn đúng "mỗi kỳ một sự kiện" vì mỗi kỳ là một dòng thuê bao (gói tháng tự gia hạn không bao giờ vào nhánh này).
Kiến trúc: licensing → catalog/operating-parameters/notifications/identity qua facade public đã có; `RenewalHoldHook` đã dùng ở các job
expiry nên gate `extension-wiring` không cần ngoại lệ mới; requests → licensing (listener) đúng chiều; không model mới ⟹ không đổi `PRISMA_MODEL_OWNER`.

## 3. Khả năng code thẳng qua đêm

Đủ để Sonnet code thẳng sau khi áp Review 2: mỗi task có file, test, lệnh; thứ tự T1 → T2 → T3 → T4 → (T5, T7, T9a) → T9b → T6 → T8. Ước lượng
≈ 7,4 h (+0,3 h nếu `S20-T4c`), A1 không nằm trên đường dài nhất. T4 (≈ 12 file) và T6 (7 file) vượt "≤ ~5 file/task" của brief — đã chia 2 commit ở
T4; chấp nhận.

## 4. Rủi ro khi code

1. **T4 lớn nhất** (viết lại propose, xóa 4 file, tách lõi `recordIn`): dễ sót chỗ dùng `ownerDepartmentId: string` (typecheck bắt) và mapper
   `deciderRole`. Checkpoint DB local sau T4 (spec §11) là bắt buộc, gồm ca R2-2 (ghế kết thúc đúng ngày gia hạn) và `INCREASE`.
2. **Test cũ hỏng hàng loạt** (flows MF-5 rightsizing ×3, `f0-auth-roles`, 5 integration renewal, `machine-account-renewal/-successor`,
   `renewal-harness.ts`): đúng chính sách "nợ test cho FIX-TEST", nhưng `test:http` toàn bộ phải xanh trước khi merge `feat/p5`.
3. **R2-8 chưa chốt**: nếu bỏ `S20-T4c`, FE sẽ gặp 409 `NEXT_PERIOD_SEATS` khi cấp từ kho trong cửa sổ sau khi ghi kết quả — cần ghi vào
   "Breaking FE"/gap đã biết.
4. **Merge với A2**: `licensing.module.ts`, `notifications.types.ts`, `inbox.policy.ts`, `parameter-definitions.policy.ts` + 3 chỗ đếm — chỉ thêm
   dòng; điều phối tính lại số đếm sau merge.
5. **Đọc tham số theo kỳ (R2-9)**: catalog view, filter `expiry`, sweep và route `adjustment` phải dùng **cùng** hàm chọn instant, nếu không huy hiệu
   `expiry` và cảnh báo lệch nhau một ngày khi Super Admin đổi tham số — đặt hàm ở `subscription-obligation.policy.ts` (thuần) và dùng lại.
6. `ALTER TYPE … ADD VALUE` không hoàn tác (`DB-05`) — spec đã ghi.
