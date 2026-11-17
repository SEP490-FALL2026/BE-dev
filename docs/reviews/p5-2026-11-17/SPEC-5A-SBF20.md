# SPEC A1 (5a-1) — SBF-20: điều chỉnh thuê bao/kho theo luật mới (QĐ-103e/q/v, QĐ-104d/k, QĐ-106i, QĐ-111o/x)

> Prompt 5, chat code **A1** (Sonnet), nhánh `feat/p5-a1-sbf20` từ `dev`. Chạy **song song** với chat **A2** (`SPEC-5A-FIXES.md`); cả hai
> merge vào nhánh tích hợp `feat/p5` theo thứ tự A2 → A1 → C → B (`PLAN.md` §3). Mã task: `S20-T1…` (A2 dùng `FX-T1…`).
> Chỉ đọc khi viết: BE `dev` @ `94a8ee84`. Không push, không deploy. Skill Preflight của người viết:
> `agent-skills:spec-driven-development` + `agent-skills:planning-and-task-breakdown` (process), `superpowers:writing-plans` (khuôn plan),
> `agent-skills:api-and-interface-design` (contract route/lỗi), `superpowers:verification-before-completion` (kiểm trích dẫn trước khi giao).
> **Sửa 17/11 theo `REVIEW-SPECS.md`:** S20-1 (mốc là tham số `FR-8.2`, chờ Owner), S20-2 (IT khác ghi thay, không 403), S20-3 (điều kiện
> `CANCEL`), S20-4 (bàn giao câu thông báo §13), S20-5 (gói tháng có ngày kết thúc), S20-6 (catalog thôi đọc tham số cũ — đưa vào prompt 5),
> S20-11 (giờ), breaking FE (§5), dải timestamp migration (§6).
> **Review 2 (17/11, `REVIEW-SPECS-2-SBF20.md`):** Owner đã chốt S20-Q4 = A, Q1/Q2/Q3 = A. Sửa trực tiếp các chỗ ghi "Review 2:" — ca `DECIDED`
> cũ chặn ghi mới (R2-1), ghế kết thúc đúng ngày gia hạn không mang sang kỳ mới (R2-2), `checkOutcome` cho `INCREASE` (R2-3),
> `activeSeatsToday` khớp `assertAllTakenBack` (R2-4), route `adjustment` khai báo trước `:id` (R2-5), ánh xạ `notice_basis` (R2-6),
> `deciderRoleOf` (R2-7), cấp seat sau khi đã ghi kết quả (R2-8, §8.11), instant đọc tham số (R2-9), trạng thái Request mở (R2-10), bảng phủ
> `SBF-20` (§14).

## 0. Nguồn luật (QĐ mới nhất thắng)

| Mã | Nội dung dùng ở spec này |
| --- | --- |
| `QĐ-103e` | Kỳ cam kết 1/12 tháng tách chu kỳ trả; **một điểm điều chỉnh** mỗi kỳ (tháng: 7 ngày trước ngày thanh toán; năm: 30 ngày trước hạn chót báo hủy, thiếu thì ngày gia hạn); hệ thống tính số seat cần; IT gia hạn đúng số đó; Finance được báo; **không** trưởng phòng xác nhận, **không** Người duyệt chi; năm: 7 ngày trước hạn chót chưa có kết quả ⟹ cảnh báo đỏ IT + Finance; tháng: chưa ghi kết quả trước ngày thanh toán ⟹ coi như giữ nguyên, phần dư tính `KPI-4`, nhắc IT, không cảnh báo đỏ; qua ngày gia hạn còn quyền gán ⟹ *hết hạn chưa gia hạn* |
| `QĐ-103q` | Không seat đệm; seat dư chỉ khi nhà cung cấp buộc tối thiểu (kèm bằng chứng) |
| `QĐ-103v` | (2) công thức số seat cần; (3) một (ứng dụng, gói) một thuê bao; (4) **một IT Admin phụ trách** mỗi thuê bao; (5) gói tháng giữ nguyên; (9) *hết hạn chưa gia hạn* = quyền *tạm ngưng do nhà cung cấp*, cảnh báo IT + Finance, gia hạn trong ân hạn = *gia hạn trễ* |
| `QĐ-104d` | IT gia hạn **đúng số** hệ thống tính, không ghi được số lớn hơn, ngoại lệ duy nhất mức tối thiểu NCC kèm bằng chứng; **không có quyết định "không gia hạn"** khi còn quyền đang gán, về 0 thì hủy |
| `QĐ-104k` | Thuê bao trùng (ứng dụng, gói) chỉ ở bước khởi tạo; `KPI-4` không đếm `K1` |
| `QĐ-104l` | IT Admin phụ trách là người chịu trách nhiệm duy nhất; người đó nghỉ mà chưa chuyển ⟹ việc vào hàng việc IT chung |
| `QĐ-106i` | (1) thiếu hạn chót lẫn số ngày báo trước ⟹ ngày gia hạn là mốc + cảnh báo chất lượng dữ liệu; (2) không tính quyền kết thúc **đúng** ngày gia hạn; gói tháng: ngày gia hạn = ngày thanh toán kế tiếp; (3) kỳ mới ghi khi IT ghi kết quả, **Finance được báo lúc đó**; (4) đã ghi giảm/hủy mà NCC vẫn tự gia hạn ⟹ báo ngay Người duyệt chi + IT phụ trách + Finance |
| `QĐ-111o` | Chỉ nói về danh sách *gần hết hạn* (lọc theo điểm điều chỉnh). **Không** phải nguồn cho việc 7/30/7 là hằng số |
| BRD `FR-8.2` (bảng mặc định, bản 4.12), `FR-1.4`, `QĐ-103n`, `SBF-20.md` bước 2 | Điểm điều chỉnh gói tháng/gói năm (7/30 ngày) và cảnh báo đỏ gói năm (7 ngày) là **tham số `FR-8.2`** có mặc định 7/30/7 ⟹ xem §12 `S20-Q4` (chờ Owner) |
| `QĐ-106h` | Đổi giá trị tham số chỉ áp cho việc phát sinh sau lúc lưu; kỳ thuê bao giữ giá trị lúc bắt đầu |
| `QĐ-58b`, BRD dòng 361 và 678 | IT Admin khác được xử lý thay các thao tác ghi, có Audit Trail |
| `QĐ-111x` | Gói tháng **không có tác vụ gia hạn** |
| `QĐ-98e`, `QĐ-99i`, `QĐ-99h` | Hết hạn chưa gia hạn tối giản; **đóng thuê bao = xuất dữ liệu + chuyển owner/admin**, không gọi `SBF-18`; Người duyệt chi chỉ nhận thông báo khi có sự cố |
| BRD `FR-1.4`, `FR-1.12`(1)–(13), §5.10 dòng *Điều chỉnh thuê bao* và *Vận hành kho và thuê bao* | như trên; `FR-1.12`(9): `K1` không có kho, thu hồi = hủy gia hạn, **không có điểm điều chỉnh**; vĩnh viễn/nội bộ không có điểm điều chỉnh |
| Sơ đồ `SBF-20` v3.1 (12/11) | node `t_point` → `s_need` → `a_exec` *Set Seats Needed with Vendor; Record Outcome* (một bước) → `d_out` → `s_upd` *Record New Period; Notify Finance* / `s_close`; nhánh `t_red`/`d_rec`/`d_plan`/`s_red`/`s_keep` |

## 1. Mục tiêu

IT Admin phụ trách một thuê bao kho `K2` (gói tháng hoặc gói năm) làm **một** việc tại điểm điều chỉnh: thấy số seat hệ thống tính, làm với nhà cung
cấp, rồi **ghi kết quả một lần**; hệ thống ghi kỳ mới và báo Finance. Không còn đề xuất → trưởng phòng `CONFIRM`. Hệ thống tự nhắc tại điểm điều
chỉnh, cảnh báo đỏ gói năm, nhắc gói tháng giữ nguyên, ghi sự cố/hết hạn chưa gia hạn và báo đúng người.

Không nằm trong A1 (đưa sang **4b**, xem §9): `KPI-4` tính số; trạng thái *tạm ngưng do NCC* trên từng quyền; phát hiện tự gia hạn ngoài ý muốn
qua hóa đơn `SBF-19`; ghi trạng thái *đã đóng* trên thuê bao ở catalog; gỡ route `seat-ranking`. (Catalog thôi đọc
`RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` nay **trong** prompt 5 — `S20-T9`, theo review S20-6.)

## 2. Hiện trạng (file:dòng, `dev` @ `94a8ee84`)

| # | Lệch | Chỗ code |
| --- | --- | --- |
| H1 | Kho `K2`/`K4` (`ownerDepartmentId = null`) bị lọc khỏi mọi đọc của gia hạn ⟹ `subscriptionRenewalPropose`/`Get` trả 404 `SUBSCRIPTION_RENEWAL.NOT_FOUND`; kỳ mới của kho bị từ chối `NO_OWNER_DEPARTMENT` | `catalog/subscription/subscription-period.service.ts:35-40` (`isOwned`), `:266` (`withSuccessors` lọc), `:170` (`recordNext`); `catalog/public/subscription-period.types.ts:19` (`ownerDepartmentId: string`) |
| H2 | Luồng 3 bước: IT đề xuất → trưởng phòng phòng sở hữu `CONFIRM` → IT ghi kết quả; đề xuất báo trưởng phòng / Super Admin (`NO_HEAD`); `PROPOSER_IS_OWNER_HEAD` | `subscription-renewals.controller.ts:127-220`; `proposal/renewal-proposal.service.ts:51-107,128-146`; `decision/renewal-decision.service.ts:55-121`; `decision/renewal-decision.policy.ts:9-40` |
| H3 | Cho `CANCEL` khi còn ghế gán (chỉ cần `acknowledgeActiveUsers`) và mở thu hồi từng ghế (`SUBSCRIPTION_CANCELLATION`/`REDUCTION`); giảm phải chọn ghế thu hồi (`releasedAssignmentIds`) | `decision/renewal-decision.service.ts:149-195`; `proposal/renewal-proposal.service.ts:110-122` |
| H4 | Không có số seat cần: IT tự chọn `proposedQuantity` (chỉ cần `< purchased`), không có `INCREASE`, không ràng buộc mức tối thiểu NCC | `proposal/renewal-proposal.policy.ts:27-37`; `subscription-renewal.types.ts:4` |
| H5 | Người làm là "IT Admin bất kỳ" (`@RequireRoles('IT_ADMIN')`), không phải IT Admin phụ trách thuê bao | `subscription-renewals.controller.ts:128`; `subscription-renewal-parties.service.ts:41-56` (chỉ dùng để báo) |
| H6 | Cảnh báo theo `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` (15/7), gửi IT + Finance + Người duyệt chi (+ Super Admin mốc cuối) | `subscription-renewal-sweep.service.ts:47-52`; `alerts/renewal-alerts.policy.ts:20-72`; `operating-parameters/parameter-definitions.policy.ts:303` |
| H7 | Mốc qua mà chưa **quyết định** ⟹ `AUTO_RENEWAL_INCIDENT`/`EXPIRY_MARKED`, chỉ báo IT (+ Người duyệt chi khi sự cố), **không báo Finance**; không có cảnh báo đỏ gói năm, không có "gói tháng giữ nguyên" | `deadline/renewal-deadline.policy.ts:28-39`; `deadline/renewal-deadline.service.ts:84-134` (người nhận dòng 118-123) |
| H8 | Finance 403 ở `subscriptionDeadlineEventList` | `subscription-renewals.controller.ts:277` |
| H9 | Gói tháng thiếu hạn chót ⟹ `MISSING`, không có điểm (luồng gia hạn dùng `deriveNotice`, không dùng `adjustmentPointOf` đã có ở catalog) | `proposal/renewal-proposal.policy.ts:19-25`; đã có đúng luật ở `catalog/subscription/obligation/subscription-obligation.policy.ts:116-173` (`adjustmentPointOf`, QĐ-111o, QĐ-106i(1)(2)) |
| H10 | Một ca "sống" mỗi thuê bao (index một phần) — gói tháng giữ nguyên nhiều tháng trên **cùng** dòng nên ca tháng sau bị chặn nếu ca trước không nối kỳ | `prisma/migrations/20261108300100_licensing_renewal_stale_rules/migration.sql` (`subscription_renewals_one_live_per_subscription`); repo `subscription-renewal.repo.ts:114-128,145-157` |

Có sẵn để tái dùng: `adjustmentPointOf`/`expiryReading` (catalog, đúng 7/30, cuộn ngày thanh toán gói tháng, `RENEWAL_DATE` khi thiếu hạn chót);
`SubscriptionRenewalSeatRepo.notEndedBy` (`subscription-renewal-seat.repo.ts:36-64`, có nguồn thu hồi đang chạy); `RenewalHoldHook.pendingRenewalsOf`
(Request tiếp tục đang chờ theo ghế, `public/licensing.extension-points.ts:145-160`); `RenewalOutcomeService` (kỳ mới nối chuỗi + mang ghế, INV-01);
bảng `subscription_renewals` (đề xuất/quyết định/kết quả), `subscription_deadline_events`; mã thông báo `SUBSCRIPTION_RENEWAL_ALERT`,
`SUBSCRIPTION_AUTO_RENEWAL_INCIDENT`, `SUBSCRIPTION_EXPIRY_MARKED`, `SUBSCRIPTION_RENEWAL_DATA_QUALITY`.

## 3. Phương án đã chọn (ít sửa nhất mà đúng QĐ)

1. **Giữ bảng `subscription_renewals`**, đổi nghĩa: một dòng = **một lần IT ghi kết quả tại điểm điều chỉnh của một kỳ**. Route
   `POST /subscription-renewals` ghi **trong một transaction** cả ba khối đã có: đề xuất (= số hệ thống tính và lựa chọn), quyết định **tự ghi**
   (`deciderRole = IT_ADMIN_IN_CHARGE`, người quyết = chính IT ghi), và kết quả (tái dùng lõi `RenewalOutcomeService`). Trạng thái ghi xong luôn là
   `OUTCOME_RECORDED`. Như vậy "thôi tạo" bước CONFIRM (không có `PROPOSED` chờ ai) và "thôi đòi" (route `decision` gỡ). Trigger một chiều hiện có
   cho phép `PROPOSED → DECIDED → OUTCOME_RECORDED` trong cùng transaction nên **không** sửa trigger.
   *Phương án loại:* hai lời gọi (đề xuất tự quyết rồi ghi kết quả riêng) — ít code hơn ~20 phút nhưng để lại ca `DECIDED` treo, chặn kỳ tháng sau
   và thêm một bước không có trong `SBF-20` (`a_exec` là một node). Owner có thể đổi ở Q3.
2. **Đổi chủ thể từ phòng sang IT Admin phụ trách thuê bao**: catalog trả cả thuê bao kho (`ownerDepartmentId` nullable). IT Admin phụ
   trách (`responsibleItAdminEmployeeId`) là người chịu trách nhiệm và người nhận thông báo (`QĐ-104l`); **mọi IT Admin đều ghi được**
   (IT khác xử lý thay, `QĐ-58b`): khi người ghi khác người phụ trách còn dùng được ⟹ audit `substitute: true` +
   `responsibleItAdminEmployeeId`, người phụ trách vẫn được báo. Không có mã 403 riêng (review S20-2).
3. **Số seat cần do hệ thống tính** (policy thuần + một câu SQL + hook có sẵn); IT gửi `proposedQuantity` phải **bằng đúng** số mục tiêu.
4. **Điểm điều chỉnh** lấy từ `adjustmentPointOf` của catalog (đưa qua `RenewalPeriodFacts.adjustment`); licensing thôi đọc
   `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`. Số ngày 7/30/7 là **ba tham số `FR-8.2` mặc định 7/30/7** (khuyến nghị, **chờ Owner** `S20-Q4`;
   nếu Owner chọn B ⟹ giữ hằng số trong `subscription-obligation.policy.ts:62-63` + một hằng 7 cho cảnh báo đỏ, bỏ `S20-T9b`). Catalog
   (`alerts.dates`, cửa sổ `activeNotices`) cũng chuyển sang điểm điều chỉnh và tham số cũ được gỡ (`S20-T9a`, review S20-6).
5. **Kỳ mới vẫn nối chuỗi dòng thuê bao** như hiện nay cho cả gói tháng lẫn gói năm (giữ INV-01 an toàn, xem Q1). Gói tháng **không bắt buộc ghi**:
   số không đổi thì không làm gì (`QĐ-111x`).
6. Migration forward-only: hai file (giá trị enum riêng, rồi luật); dữ liệu cũ đọc được; ca `PROPOSED` cũ đóng thành `STALE`.

## 4. Hành vi đích

### 4.1 Thuê bao nào có điểm điều chỉnh

Thuê bao `kind = TERM`, `status = ACTIVE`, chưa có kỳ nối tiếp (`renewedById = null`), gói `provisioningType = K2` (kho; dòng `K2` cũ có phòng sở hữu
vẫn tính). Không có điểm: `K1` (`FR-1.12`(9)), `K4` (chỉ vĩnh viễn), `K5`/nội bộ, `PERPETUAL`, `DRAFT`, kỳ đã nối tiếp.

### 4.2 Mốc của kỳ (`adjustmentPointOf`, catalog — không viết lại)

- `commitment = MONTHLY` khi `commitmentTermMonths = 1` (hoặc null và trả tháng), còn lại `ANNUAL`.
- `deadline` (mốc): tháng = ngày thanh toán kế tiếp (cuộn theo tháng từ `renewalDate ?? endDate`); năm = hạn chót báo hủy (khai hoặc suy từ số ngày
  báo trước), thiếu ⟹ `endDate` nếu không tự gia hạn, ⟹ `renewalDate` nếu tự gia hạn (`QĐ-106i`(1)).
- `point` = `deadline − SUBSCRIPTION_ADJUSTMENT_DAYS_MONTHLY` (tháng, mặc định 7) / `deadline − SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL`
  (năm, mặc định 30); cảnh báo đỏ gói năm `redAlertOn = deadline − SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL` (mặc định 7). Giá trị đọc tại
  `startDate` của dòng thuê bao (`OperatingParametersApi.getValueAt`/`getValuesAt`, `QĐ-106h`: kỳ giữ giá trị lúc bắt đầu). `adjustmentPointOf`
  nhận thêm tham số `windows { monthlyDays, annualDays }` thay hai hằng `subscription-obligation.policy.ts:62-63` (policy vẫn thuần).
  (Owner chọn B ở `S20-Q4` ⟹ giữ hằng 7/30, thêm hằng 7 cho đỏ.) `end` = ngày gia hạn (năm: `renewalDate ?? endDate`; tháng: = `deadline`).
- `renewalOn` dùng cho số seat cần = `end` (tháng: ngày thanh toán kế tiếp — `QĐ-106i`(2)).
- `adjustment = null` ⟹ không có điểm (thiếu ngày) ⟹ cảnh báo chất lượng dữ liệu `NO_ALERT_ANCHOR`; năm với `kind = RENEWAL_DATE` ⟹ thêm cảnh báo
  `NO_NOTICE_DEADLINE` (một lần mỗi thuê bao).

### 4.3 Số seat cần cho kỳ sau (`QĐ-103e`, `QĐ-103v`(2), `QĐ-104d`(1), `QĐ-106i`(2))

```
seatsNeeded = heldPastRenewal + pendingContinuations + approvedAwaitingGrant
heldPastRenewal       = ghế của thuê bao, không failed/cancelled, KHÔNG có thu hồi đang chạy (liveRevocationSources rỗng),
                        ngày cuối > renewalOn  (ngày cuối = min(valid_until − 1, expected_end_date); null = không kết thúc ⟹ luôn tính)
pendingContinuations  = ghế không có thu hồi đang chạy, ngày cuối ≤ renewalOn, còn hiệu lực hôm nay, CÓ Request tiếp tục đang chờ
                        (RenewalHoldHook.pendingRenewalsOf)
approvedAwaitingGrant = assignment của cùng plan, subscription_id IS NULL, không failed/cancelled, có tác vụ GRANT đang mở
                        (OPEN_GRANT_TASK_STATUSES) — chỉ cộng cho thuê bao isPrimaryForPlan = true (tránh đếm hai lần khi gói có >1 thuê bao)
target = seatsNeeded = 0 ? 0 : max(seatsNeeded, vendorMinimumSeats ?? 0)
```

Không seat đệm. Ghế kết thúc **đúng** ngày gia hạn không tính. Quyền đã quyết thu hồi không tính. (Gợi ý: assignment theo gói có
`subscriptionId = null`: `licensing/assignment/assignment.repo.ts:220` là truy vấn ghế gắn gói chưa gắn thuê bao; Sonnet xác minh assignment của tác vụ GRANT đang mở có `subscription_id` NULL trước khi viết SQL, nếu không thì đếm theo task.)

### 4.4 IT Admin ghi kết quả (route `POST /subscription-renewals`, một lần mỗi kỳ)

Điều kiện, theo thứ tự (lỗi đầu tiên được trả):
1. Người gọi có vai `IT_ADMIN` (guard). Thuê bao tồn tại (404 `SUBSCRIPTION_RENEWAL.NOT_FOUND`).
2. Thuê bao có điểm điều chỉnh (§4.1) — 409 `NOT_RENEWABLE` `details.reason ∈ PERPETUAL | INTERNAL | NOT_POOL_TERM | NOT_ACTIVE | ALREADY_CONTINUED`;
   `adjustment = null` ⟹ 409 `CONTRACT_DATA_INCOMPLETE`.
3. **Không chặn theo người** (`QĐ-58b`): mọi IT Admin ghi được. `substitute = (responsible còn là IT Admin dùng được && responsible ≠
   actor.employeeId)` — ghi vào audit (bước 9) và quyết định ai được báo (§4.6). Không có mã `NOT_RESPONSIBLE_IT_ADMIN`.
4. Hôm nay ≥ `point` — 409 `SUBSCRIPTION_RENEWAL.BEFORE_ADJUSTMENT_POINT` `details { adjustmentPointOn, deadline }`. Ghi sau `end` vẫn được
   (*gia hạn trễ*, `QĐ-98e`).
5. Hình dạng lựa chọn: `CANCEL` không có `proposedQuantity`; còn lại bắt buộc; `RENEW` = `purchasedQuantity`, `REDUCE` < , `INCREASE` > — 422
   `QUANTITY_INVALID` (mã cũ).
6. Dưới khóa dòng thuê bao (`lockPeriod`), tính §4.3:
   - `CANCEL` chỉ được khi **cả ba**: `target = 0`; **không còn quyền đang gán còn hiệu lực hôm nay** của thuê bao (`activeSeatsToday = 0`:
     ghế không failed/cancelled, `valid_from ≤ hôm nay` và chưa kết thúc — kể cả ghế kết thúc trước ngày gia hạn và ghế đang có thu hồi chạy;
     **Review 2 (R2-4):** đếm đúng như `SubscriptionRenewalSeatRepo.notEndedBy(subscriptionId, today).length` — tức **cả ghế bắt đầu sau hôm nay**
     — để khớp `RenewalOutcomeService.assertAllTakenBack` (`renewal-outcome.service.ts:160-163`), nếu không `canCancel = true` mà ghi vẫn 409
     `EXCESS_NOT_REVOKED`);
     **không còn Request mở nào** của gói (`openRequests = 0`: Request chưa ở trạng thái cuối, kể cả đang ở bước nhu cầu/duyệt chi — đọc qua
     hook, xem dưới) (`QĐ-103e`, `QĐ-99i`, `FR-1.12`(4)(10), review S20-3). Vi phạm ⟹ 409 `SUBSCRIPTION_RENEWAL.CANCEL_NOT_ALLOWED`
     `details { seatsNeeded, heldPastRenewal, pendingContinuations, approvedAwaitingGrant, activeSeatsToday, openRequests }` (`QĐ-104d`(2)).
     IT xong thu hồi / chờ Request đóng rồi ghi lại (ghi sau ngày gia hạn vẫn được — *gia hạn trễ*/đóng trễ). `closure` vì vậy chỉ được
     xác nhận khi quyền đã về 0.
   - Hook: mở rộng `RenewalHold` (`licensing/public/licensing.extension-points.ts:145-160`) thêm
     `openRequestsOfPlan(planId: string, tx?: DbTx): Promise<number>`; cài ở `requests/renewal-request/renewal-hold.listener.ts` (đếm Request
     cá nhân/nhóm có dòng cho `planId`, trạng thái chưa cuối). Gói có > 1 thuê bao: đếm cho mọi thuê bao của gói (an toàn: chặn hủy).
     **Review 2 (R2-10):** "chưa cuối" = `access_requests.plan_id = planId` và `state NOT IN ('REJECTED','IT_REJECTED','COMPLETED','FAILED',
     'WITHDRAWN','CANCELLED','DRAFT')` (cùng danh sách `ENDED` của `requests/access-request/withdrawal.policy.ts:39` + `COMPLETED` + `DRAFT`);
     một câu `count` trong repo của `requests/access-request` (listener chỉ gọi repo, không SQL trong listener). Request tiếp tục sử dụng là
     `AccessRequest` có `plan_id` nên được đếm cùng.
   - `target = 0` mà lựa chọn khác `CANCEL` ⟹ 409 `QUANTITY_NOT_SEATS_NEEDED` như dòng dưới (kỳ sau 0 seat thì phải hủy).
   - lựa chọn khác `CANCEL`: `proposedQuantity ≠ target` ⟹ 409 `SUBSCRIPTION_RENEWAL.QUANTITY_NOT_SEATS_NEEDED`
     `details { seatsNeeded, vendorMinimumSeats, target, quantity }` (FE tải lại số rồi gửi lại).
   - `target > seatsNeeded` (mức tối thiểu NCC) mà thiếu `note` ⟹ 422 `SUBSCRIPTION_RENEWAL.VENDOR_MINIMUM_EVIDENCE_REQUIRED`
     `details { seatsNeeded, vendorMinimumSeats }`. `note` là bằng chứng (chữ; tệp đính kèm không làm).
7. Kỳ đã có ca sống cùng `(subscriptionId, deadline)` ⟹ 409 `ALREADY_PROPOSED` (mã cũ, nghĩa: kỳ này đã ghi kết quả).
   **Review 2 (R2-1, review 1 S20-10):** thuê bao còn **ca `DECIDED` cũ** (trước deploy, `notice_base_date` theo luật cũ ≠ `deadline`) cũng
   ⟹ 409 `ALREADY_PROPOSED` `details { renewalId }` — IT ghi kết quả ca cũ qua `POST /{id}/outcome` trước (index mới theo `(subscription,
   notice_base_date)` không chặn được ca này; nếu không chặn thì một thuê bao có hai ca sống, `CANCEL` mới đi song song ca cũ chưa có kết quả).
   Sweep §4.5 cũng coi ca `DECIDED` cũ là "ca của kỳ".
8. Kết quả (lõi `RenewalOutcomeService`, giữ luật cũ): `AS_DECIDED` + lựa chọn ≠ `CANCEL` cần `nextPeriod.purchasedQuantity = proposedQuantity`
   (422 `OUTCOME_MISMATCH`); `VENDOR_REFUSED`/`DIFFERENT` cần `outcomeNote`; `nextPeriod` nối chuỗi + mang ghế còn giữ ngày bắt đầu kỳ mới
   (409 `EXCESS_NOT_REVOKED` / `SEATS_HAVE_OPEN_TASKS` / `PERIOD_REFUSED` như cũ).
   **Review 2 (R2-3):** `checkOutcome` (`outcome/renewal-outcome.policy.ts:17-22`) hiện lấy số mong đợi = `decidedQuantity` chỉ khi `REDUCE`,
   còn lại = `purchasedQuantity` cũ ⟹ `INCREASE` + `AS_DECIDED` luôn 422. Sửa: `REDUCE`/`INCREASE` (và `RENEW` khi `decidedQuantity ≠ null`)
   so với `decidedQuantity`; ca cũ (`RENEW` không số) giữ `purchasedQuantity`.
   **Review 2 (R2-2):** ghế mang sang kỳ mới phải cùng luật với `heldPastRenewal`: `seatsToCarry` (`assignment/assignment.policy.ts:123-130`)
   mang cả ghế có ngày cuối **đúng** `startDate` (`expectedEndDate >= startDate`, `validUntil > startDate`), trong khi §4.3 không đếm ghế kết thúc
   đúng ngày gia hạn (`QĐ-106i`(2)) ⟹ `target` chính xác mà có một ghế như vậy là luôn 409 `EXCESS_NOT_REVOKED`. Ở đường ghi mới,
   `continueInto` nhận thêm `endingBy: renewalOn` và **bỏ** khỏi `carry` ghế có ngày cuối (`min(validUntil − 1, expectedEndDate)`) ≤ `renewalOn`
   (ghế đó ở lại kỳ cũ tới ngày cuối của nó). Không đổi `seatsToCarry` dùng chung (đường cấp `carryToNextPeriod` giữ nguyên); route `outcome`
   cũ gọi lõi không truyền `endingBy` (hành vi cũ). `CANCEL` + `AS_DECIDED`: không `nextPeriod`, **bắt buộc**
   `closure { dataExported: true, adminsTransferred: true }` (422 `VALIDATION_ERROR` khi thiếu — `QĐ-99i`); không mở thu hồi nào (không `SBF-18`).
9. Ghi: `insert` (đề xuất, `seats_needed`, `notice_basis`/`notice_base_date = deadline`) → `recordDecision` (tự, `IT_ADMIN_IN_CHARGE`,
   `decidedAfterDeadline = today > deadline`, `executionPoint = AS_PLANNED`, `activeSeatsAtDecision = heldPastRenewal`, snapshot `NOT_CONNECTED`)
   → lõi kết quả → audit `SUBSCRIPTION_RENEWAL.PROPOSED` (thêm `seatsNeeded` + 3 thành phần, `vendorMinimumApplied`, `substitute`,
   `responsibleItAdminEmployeeId`) và `SUBSCRIPTION_RENEWAL.OUTCOME_RECORDED` (thêm `closure`, `lateRenewal = today > end`, `substitute`)
   → thông báo (§4.6).
   **Review 2 (R2-6):** `notice_basis` theo `adjustment.kind`: `PAYMENT_DATE` → `BY_PAYMENT_DATE`, `RENEWAL_DATE` → `BY_RENEWAL_DATE`,
   `END_DATE` → `BY_END_DATE`, `NOTICE_DEADLINE` → `period.notice.source` (`DECLARED` | `INFERRED_UNCONFIRMED`; `AdjustmentPoint` không giữ
   phân biệt này, `RenewalPeriodFacts.notice` có). `closure` chỉ nhận khi `choice = CANCEL` (gửi kèm lựa chọn khác ⟹ 422 `VALIDATION_ERROR`).
10. Sự cố gia hạn ngoài ý muốn ghi được ngay lúc này (`QĐ-106i`(4)): lựa chọn `REDUCE`/`CANCEL` mà kết quả `VENDOR_REFUSED`/`DIFFERENT` có
    `nextPeriod.purchasedQuantity > proposedQuantity` (hủy: có `nextPeriod`) ⟹ báo `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT`. (Phát hiện qua hóa đơn: 4b.)

Không có bước trưởng phòng, Người duyệt chi; không tạo `BudgetCommitment` (giữ `QĐ-62s`). Ca `DECIDED` cũ (trước deploy) vẫn ghi kết quả qua
`POST /subscription-renewals/{id}/outcome` như cũ.

### 4.5 Quét định kỳ (job hằng giờ hiện có, `SubscriptionRenewalSweepService` viết lại)

Đối tượng: mọi thuê bao §4.1 (tối đa 500/lượt), `adjustment` tính với hôm nay; "ca của kỳ" = ca sống có `noticeBaseDate = adjustment.deadline`
(**Review 2 (R2-1):** hoặc một ca `DECIDED` cũ bất kỳ của thuê bao). **Review 2:** chỉ tính `seatsNeeded`/`target` (2 câu SQL + hook) cho thuê
bao có việc đến hạn ở bảng dưới (điểm, đỏ, giữ nguyên) — không tính cho cả 500 dòng mỗi giờ.

| Khi | Điều kiện | Ghi | Báo |
| --- | --- | --- | --- |
| Tới điểm | `point ≤ today ≤ end`, chưa có ca của kỳ | — | `SUBSCRIPTION_RENEWAL_ALERT` cho IT phụ trách (`itAdminOf`, có fallback) — params `subscriptionId, baseDate=deadline, renewalOn, seatsNeeded, commitment, renewalId=null`; eventKey `subscription-adjustment-point:<sub>:<deadline>` |
| Cảnh báo đỏ (năm) | `ANNUAL`, `today ≥ redAlertOn` (= `deadline − SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL`, mặc định 7), `today ≤ end`, chưa có ca của kỳ | — | `SUBSCRIPTION_RENEWAL_RED_ALERT` (mới) cho IT phụ trách + Finance; eventKey `subscription-renewal-red:<sub>:<deadline>` |
| Gói tháng giữ nguyên | `MONTHLY`, `today = deadline` (ngày thanh toán), chưa có ca của kỳ, `purchasedQuantity > target` | — (coi như giữ nguyên; `KPI-4`: 4b) | `SUBSCRIPTION_RENEWAL_KEPT` (mới) cho IT phụ trách — params `subscriptionId, renewalOn, purchasedQuantity, seatsNeeded`; eventKey `subscription-renewal-kept:<sub>:<deadline>` |
| Qua ngày gia hạn (mọi kỳ có `end` thật) | `end < today ≤ end + 60`, chưa có ca của kỳ, còn ghế giữ hôm nay. Áp cho **gói năm** và **gói tháng không tự gia hạn có `endDate`** (`monthly()` trả `deadline = end = endDate` khi `autoRenew = false` và `endDate` < ngày thanh toán kế tiếp, nên qua `endDate` thì `end < today`); gói tháng tự gia hạn luôn cuộn `end ≥ today` nên không bao giờ vào dòng này (review S20-5, `QĐ-103e`, `FR-1.12`(11)) | `subscription_deadline_events` (`noticeBaseDate = end`): `autoRenew` ⟹ `AUTO_RENEWAL_INCIDENT` (NCC tự gia hạn số cũ — lỡ điểm), không ⟹ `EXPIRY_MARKED` (*hết hạn chưa gia hạn*, quyền tạm ngưng do NCC) | sự cố: IT phụ trách + Finance + Người duyệt chi (`QĐ-99h`); hết hạn: IT phụ trách + Finance (`QĐ-98e`) |
| Dữ liệu thiếu | `adjustment = null` ⟹ `NO_ALERT_ANCHOR`; năm `kind = RENEWAL_DATE` ⟹ `NO_NOTICE_DEADLINE` | — | `SUBSCRIPTION_RENEWAL_DATA_QUALITY` cho IT phụ trách, một lần mỗi (thuê bao, problem) |

Bỏ: cảnh báo theo `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`, cờ trễ (`flagLateIfDue` — không còn ca `DECIDED` treo), sự cố theo "chưa quyết định",
gửi Super Admin/Người duyệt chi ở cảnh báo mốc.

### 4.6 Ai đọc, ai được báo

| Việc | Ai |
| --- | --- |
| Ghi kết quả (`POST /subscription-renewals`) | Mọi IT Admin; người phụ trách là người chịu trách nhiệm, người khác ghi thay có `substitute: true` trong audit (`QĐ-58b`) |
| Ghi kết quả ca cũ (`POST /{id}/outcome`) | IT Admin (như cũ) |
| Xem số seat cần (`GET /subscription-renewals/adjustment`) | IT Admin, Finance |
| Danh sách/chi tiết ca | IT Admin, Finance (chỉ đọc) — như cũ; trưởng phòng chỉ còn thấy ca của thuê bao cũ có phòng sở hữu |
| Sự cố/hết hạn (`GET /subscription-deadline-events`) | IT Admin, **Finance** (mới), Người duyệt chi, Super Admin |
| Được báo khi ghi kết quả (kỳ mới hoặc hủy) | **Finance** — `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED` (mới) params `renewalId, subscriptionId, choice, quantity, outcome, nextSubscriptionId, substitute` (`QĐ-106i`(3)); khi `substitute = true` thêm **IT Admin phụ trách**; Người duyệt chi **không** (`QĐ-99h`) |
| Sự cố gia hạn ngoài ý muốn (§4.4 bước 10, §4.5) | Người duyệt chi + IT phụ trách + Finance — `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` (thêm param `renewalId` cho phép null) |
| Thôi ghi | `SUBSCRIPTION_RENEWAL_PROPOSED`, `SUBSCRIPTION_RENEWAL_DECIDED`, `SUBSCRIPTION_RENEWAL_LATE`, `CONTROLLED_WAIT_ALERT` ngữ cảnh gia hạn (mã giữ trong danh sách để dòng cũ đọc được) |

## 5. Contract API

| Route | Giữ/đổi/bỏ | Ghi chú |
| --- | --- | --- |
| `POST /api/v1/subscription-renewals` (`subscriptionRenewalPropose`, giữ operationId) | **Đổi** (breaking) | Một lần ghi đủ; 201 `{ renewal }`, `state = OUTCOME_RECORDED`, message `SUBSCRIPTION_RENEWAL.OUTCOME_RECORDED` |
| `POST /api/v1/subscription-renewals/{id}/decision` (`subscriptionRenewalDecide`) | **Bỏ** | 404 route; xóa DTO/service/policy liên quan |
| `POST /api/v1/subscription-renewals/{id}/outcome` | Giữ | Chỉ cho ca `DECIDED` cũ; mô tả OpenAPI ghi "legacy" |
| `GET /api/v1/subscription-renewals`, `/{id}` | Giữ, đổi nhẹ | `subscription.ownerDepartmentId` nullable; `milestone.basis` thêm `BY_RENEWAL_DATE`, `BY_PAYMENT_DATE`; `proposedChoice`/`decidedChoice` thêm `INCREASE`; `decision.deciderRole` thêm `IT_ADMIN_IN_CHARGE`; `proposal.seatsNeeded: number \| null` (null ở ca cũ); `outcomeDetail.lateRenewal: boolean` |
| `GET /api/v1/subscription-renewals/{id}/seat-ranking` | Giữ (deprecated) | Không còn dùng để chọn ghế; gỡ ở 4b |
| `GET /api/v1/subscription-renewals/adjustment?subscriptionId=` (`subscriptionRenewalAdjustmentGet`) | **Mới** | Đọc trước khi ghi |
| `GET /api/v1/subscription-deadline-events` | Đổi quyền | thêm `FINANCE`; `subscription.ownerDepartmentId` nullable |

Body mới của `POST /subscription-renewals` (strict):

```json
{
  "subscriptionId": "uuid",
  "choice": "RENEW | REDUCE | INCREASE | CANCEL",
  "proposedQuantity": 8,
  "note": "bằng chứng mức tối thiểu NCC (bắt buộc khi target > seatsNeeded)",
  "outcome": "AS_DECIDED | VENDOR_REFUSED | DIFFERENT | UNCONFIRMED",
  "outcomeNote": "bắt buộc khi VENDOR_REFUSED | DIFFERENT",
  "nextPeriod": { "purchasedQuantity": 8, "unitPrice": { "amount": "120000", "currency": "VND" }, "billingCycle": "MONTHLY", "startDate": "2026-12-01", "renewalDate": "2027-01-01", "autoRenew": true, "allowsMidTermReduction": false },
  "closure": { "dataExported": true, "adminsTransferred": true }
}
```
`releasedAssignmentIds` bị bỏ (gửi lên ⟹ 422 `VALIDATION_ERROR` vì strict).

Response `GET /subscription-renewals/adjustment` (200, message `SUBSCRIPTION_RENEWAL.ADJUSTMENT_FOUND`):

```json
{ "adjustment": {
  "subscriptionId": "uuid", "commitment": "MONTHLY | ANNUAL",
  "deadlineKind": "PAYMENT_DATE | NOTICE_DEADLINE | RENEWAL_DATE | END_DATE",
  "deadline": "2026-12-01", "adjustmentPointOn": "2026-11-24", "renewalOn": "2026-12-01", "redAlertOn": null,
  "purchasedQuantity": 10, "vendorMinimumSeats": null,
  "seatsNeeded": { "total": 8, "heldPastRenewal": 6, "pendingContinuations": 1, "approvedAwaitingGrant": 1 },
  "target": 8, "suggestedChoice": "REDUCE",
  "canCancel": false, "activeSeatsToday": 7, "openRequests": 1,
  "responsibleItAdminEmployeeId": "uuid | null", "callerIsResponsible": true,
  "recordedRenewalId": null } }
```

`canCancel = target = 0 && activeSeatsToday = 0 && openRequests = 0`. `callerIsResponsible = false` ⟹ FE ghi "bạn đang ghi thay IT Admin phụ trách"
(không chặn).
Lỗi: 403 (vai), 404 `NOT_FOUND`, 409 `NOT_RENEWABLE`/`CONTRACT_DATA_INCOMPLETE`, 422 `VALIDATION_ERROR`.

Mã lỗi mới (`SUBSCRIPTION_RENEWAL.*`): `BEFORE_ADJUSTMENT_POINT` 409, `QUANTITY_NOT_SEATS_NEEDED` 409,
`CANCEL_NOT_ALLOWED` 409 (details thêm `activeSeatsToday`, `openRequests`), `VENDOR_MINIMUM_EVIDENCE_REQUIRED` 422; `NOT_RENEWABLE` thêm
`details.reason`. **Không** có `NOT_RESPONSIBLE_IT_ADMIN` (review S20-2). Bỏ khỏi route ghi: `NOT_DECIDER`,
`NOT_AWAITING_DECISION`, `ACTIVE_USERS_NOT_ACKNOWLEDGED`, `PROPOSAL_STALE`, `PROPOSER_IS_OWNER_HEAD`, `EXCESS_SELECTION_INVALID`,
`REVOCATION.TYPE_NOT_SUPPORTED` (giữ trong union nếu còn chỗ khác dùng; `message` vẫn tiếng Anh theo quyết định Owner 16/11).

**Breaking FE** (chat A1 chép mục này vào báo cáo cuối; chat điều phối đưa vào `changes/<ngày>-prompt5.md`):

1. Màn trưởng phòng xác nhận gia hạn bỏ; `POST /subscription-renewals/{id}/decision` 404.
2. Màn đề xuất + màn ghi kết quả gộp một form, gọi `adjustment` trước để hiện số; body mới strict (`releasedAssignmentIds` ⟹ 422).
3. Không chọn ghế thu hồi.
4. Enum thêm giá trị: `INCREASE`, `IT_ADMIN_IN_CHARGE`, `BY_RENEWAL_DATE`, `BY_PAYMENT_DATE`; `NOT_RENEWABLE` có `details.reason`.
5. `subscription.ownerDepartmentId` nullable ở `subscriptionRenewalList/Get`, `subscriptionDeadlineEventList`.
6. Thuê bao kho nay mở được trang gia hạn (trước 404).
7. **Ca `PROPOSED` cũ thành `STALE`** sau migration (danh sách ca không còn ca chờ trưởng phòng).
8. **`subscriptionDeadlineEventList` đổi nghĩa:** sự kiện theo **ngày gia hạn** của kỳ (`noticeBaseDate = end`, mỗi kỳ một sự kiện), không còn
   theo "mốc qua mà chưa quyết định"; Finance đọc được (trước 403).
9. **`SUBSCRIPTION_RENEWAL_ALERT` đổi params:** dòng mới có `subscriptionId, renewalId (null), baseDate (= hạn của điểm điều chỉnh),
   renewalOn, seatsNeeded, commitment`; **không còn** `milestoneDays, noticeBasis, audience, decisionRecorded, outcomeRecorded, usageData`
   (khóa cũ giữ trong `PARAM_KEYS_BY_CODE` để dòng cũ đọc được). Người nhận chỉ còn IT phụ trách (bỏ Finance/Người duyệt chi/Super Admin).
10. Thông báo: 3 mã mới (`SUBSCRIPTION_RENEWAL_RED_ALERT`, `SUBSCRIPTION_RENEWAL_KEPT`, `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED`);
    `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` thêm `renewalId` và Finance; `SUBSCRIPTION_EXPIRY_MARKED` thêm Finance; thôi phát
    `SUBSCRIPTION_RENEWAL_PROPOSED`, `_DECIDED`, `_LATE`, `CONTROLLED_WAIT_ALERT` ngữ cảnh gia hạn. Chi tiết §13.
11. **Catalog `alerts.dates`** (`subscriptionList/Get`): nay = `[adjustmentPointOn]` (+ `redAlertOn` với gói năm), không còn 15/7 ngày theo
    tham số; `alerts.baseDate` = hạn của điểm điều chỉnh. Cảnh báo `TERMS_REVIEW_DUE` (`reviewFrom`) tính từ điểm điều chỉnh.
12. **Tham số vận hành:** `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` bị gỡ khỏi `operatingParameterList`; thêm `SUBSCRIPTION_ADJUSTMENT_DAYS_MONTHLY`,
    `SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL`, `SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL` (nếu Owner chọn A ở `S20-Q4`).
13. `adjustment` không còn `callerMayRecord`; có `callerIsResponsible`, `activeSeatsToday`, `openRequests` (route mới, chưa FE nào dùng).
14. **Review 2:** thuê bao **không phải kho `K2`** (`K1` có phòng sở hữu, `K5`, dòng `TERM` cũ khác) thôi nhận cảnh báo gia hạn, sự kiện hết
    hạn/sự cố và không ghi được kết quả mới (409 `NOT_RENEWABLE` `reason = NOT_POOL_TERM`) — đúng `FR-1.12`(9); huy hiệu `expiry` của catalog
    vẫn hiện cho chúng. `POST /subscription-renewals` thêm 409 `ALREADY_PROPOSED` `details.renewalId` khi thuê bao còn ca `DECIDED` cũ.

## 6. Dữ liệu và migration (forward-only)

Tên theo `DB-15`. **Dải timestamp cấp trước cho A1: `20261117110000`–`20261117110900`** (A2 dùng `…100000`–`…100900`, C `…120000`,
B `…130000`+ nếu cần). Dải theo thứ tự merge A2 → A1 → C → B nên mọi migration của A1 lớn hơn của A2 và nhỏ hơn của C; nếu thứ tự merge đổi,
bên merge sau mà tên nhỏ hơn thì đổi tên trước khi merge (`PLAN.md` §3).

1. `20261117110000_licensing_renewal_adjustment_values` — chỉ giá trị enum (không hoàn tác được, `DB-05`):
   `ALTER TYPE "RenewalChoice" ADD VALUE 'INCREASE'; ALTER TYPE "RenewalNoticeBasis" ADD VALUE 'BY_RENEWAL_DATE'; ALTER TYPE "RenewalNoticeBasis" ADD VALUE 'BY_PAYMENT_DATE';`
2. `20261117110100_licensing_renewal_adjustment_rules`:
   - `ADD COLUMN "seats_needed" INTEGER` + CHECK `seats_needed IS NULL OR seats_needed >= 0` (null ở dòng cũ).
   - Thay `subscription_renewals_proposed_quantity_fits`: `(proposed_choice::text NOT IN ('REDUCE','INCREASE') OR proposed_quantity IS NOT NULL) AND (proposed_choice::text <> 'CANCEL' OR proposed_quantity IS NULL) AND (proposed_quantity IS NULL OR proposed_quantity >= 0)`; tương tự `decided_quantity_fits` (bọc `decided_choice IS NULL OR …`). So sánh `::text` để không đụng giá trị enum mới trong cùng transaction. Dòng cũ (RENEW null, REDUCE có số, CANCEL null) vẫn thỏa.
   - `subscription_renewals_decider_role`: thêm `'IT_ADMIN_IN_CHARGE'`.
   - `DROP INDEX "subscription_renewals_one_live_per_subscription"; CREATE UNIQUE INDEX "subscription_renewals_one_live_per_period" ON "subscription_renewals"("subscription_id","notice_base_date") WHERE "state" <> 'STALE';` (repo `insert` đổi `ON CONFLICT (subscription_id, notice_base_date) WHERE state <> 'STALE'`).
   - Dữ liệu: `UPDATE "subscription_renewals" SET "state" = 'STALE' WHERE "state" = 'PROPOSED';` (ca chờ trưởng phòng cũ không còn ai xác nhận; trigger cho `PROPOSED → STALE`; ghi số dòng bằng `RAISE NOTICE`). Ca `DECIDED`/`OUTCOME_RECORDED` giữ nguyên.
3. Prisma: `RenewalChoice` + `INCREASE`; `RenewalNoticeBasis` + 2 giá trị; `seatsNeeded Int? @map("seats_needed")`. Trigger bất biến **không** thêm `seats_needed` (chỉ ghi lúc insert; ghi chú ở comment model).
4. `20261117110200_retire_renewal_alert_days` (`S20-T9a`) — **chỉ dữ liệu**, theo tiền lệ
   `20261108500000_drop_fiscal_year_start_month`: `RAISE NOTICE` số giá trị khác mặc định, rồi
   `UPDATE "parameter_values" SET "valid_to" = GREATEST(CURRENT_TIMESTAMP, "valid_from") WHERE "key" = 'RENEWAL_ALERT_DAYS_BEFORE_DEADLINE' AND "valid_to" IS NULL;`
   (đóng, không xóa; chạy hai lần không lỗi). Ba tham số mới (`S20-T9b`) **không cần migration**: giá trị mặc định nằm ở
   `PARAMETER_DEFINITIONS`, `getValue`/`getValueAt` trả mặc định khi chưa có dòng (`operating-parameters.api.ts:52-68`).
5. Không bảng mới, không cột ở catalog.

## 7. Phân quyền / SoD

- SoD-3 cũ (người đề xuất ≠ người xác nhận) hết đối tượng vì không còn bước xác nhận (`QĐ-103e`). Việc ghi là thao tác kỹ thuật của IT phụ trách
  (giống ghi kết quả cấp/thu hồi); không tạo cam kết, không chi trước khi duyệt (`INCREASE` chỉ tới `target` gồm Request **đã duyệt**).
- Finance chỉ đọc. Trưởng phòng, Employee, Người duyệt chi không ghi. Người duyệt chi không được báo kết quả thường (`QĐ-99h`).

## 8. Ca biên

1. Mọi IT Admin ghi được. Thuê bao kho không có IT phụ trách hoặc người đó nghỉ/khóa ⟹ `substitute = false`; thông báo theo `itAdminOf` (người phụ trách → IT phụ trách phòng (nếu có) → IT Admin dùng được đầu tiên). Người phụ trách còn làm mà IT khác ghi ⟹ `substitute = true`, người phụ trách nhận `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED`.
1b. Ghế còn hiệu lực hôm nay nhưng kết thúc trước ngày gia hạn (không tính vào `seatsNeeded`) vẫn chặn `CANCEL`; Request chưa duyệt của gói (đang ở bước nhu cầu/duyệt chi) cũng chặn `CANCEL` (§4.4 bước 6).
1c. Gói tháng không tự gia hạn có `endDate` đã qua mà còn ghế ⟹ `EXPIRY_MARKED` như gói năm (§4.5).
2. Số cần thay đổi giữa lúc xem và lúc ghi (Request vừa duyệt) ⟹ 409 `QUANTITY_NOT_SEATS_NEEDED` kèm số mới.
3. Mức tối thiểu NCC > số cần ⟹ `target = vendorMinimumSeats`, bắt buộc `note`; số cần = 0 ⟹ chỉ `CANCEL` (về 0 thì hủy, không giữ mức tối thiểu).
4. Ghế kết thúc **đúng** ngày gia hạn không tính; ghế kết thúc trước có Request tiếp tục đang chờ thì tính; ghế đang có thu hồi (quyết định thu hồi) không tính.
5. Gói có > 1 thuê bao (chỉ từ khởi tạo): Request chờ cấp chỉ cộng vào thuê bao `isPrimaryForPlan`.
6. Ghế có thu hồi chưa xong vẫn còn giữ vào ngày bắt đầu kỳ mới ⟹ ghi kết quả `AS_DECIDED` bị 409 `EXCESS_NOT_REVOKED` (luật INV-01 cũ): IT xong thu hồi trước, hoặc ghi `DIFFERENT`.
7. Ghi trước điểm ⟹ 409; ghi sau ngày gia hạn ⟹ được, `lateRenewal = true`; sự kiện `EXPIRY_MARKED` đã ghi vẫn giữ (lịch sử).
8. Gói tháng số không đổi ⟹ không cần ghi; nếu IT vẫn ghi `RENEW` thì kỳ mới nối chuỗi (cho phép, FE nên ẩn nút).
9. `UNCONFIRMED`/`VENDOR_REFUSED` không `nextPeriod` ở gói tháng ⟹ kỳ sau (deadline khác) ghi được nhờ index mới theo `(subscription, deadline)`.
10. Hai IT ghi đồng thời cùng kỳ ⟹ một thắng, một 409 `ALREADY_PROPOSED` (index quyết).
11. Thuê bao kho nay hiện ở `getPeriods` ⟹ `AssignmentService.carryToNextPeriod` (`assignment.service.ts:397-430`) bắt đầu mang ghế sang kỳ kế tiếp của kho khi cấp — đúng ý, nhưng Sonnet chạy lại test cấp từ kho.
    **Review 2 (R2-8):** hệ quả chưa ghi: sau khi IT ghi kết quả ở điểm điều chỉnh (kỳ mới đã nối, mua **đúng** `target`), một Request duyệt
    **sau** đó được cấp trên kỳ cũ thì `carryToNextPeriod` cần một seat ở kỳ mới; kỳ mới đầy ⟹ 409 `NEXT_PERIOD_SEATS` (`assignment.service.ts:421-424`),
    dù kỳ cũ còn seat *Trống* — chặn cấp tới 30 ngày (gói năm) / 7 ngày (gói tháng). `addPoolSeat` chỉ mua trên kỳ đang cấp
    (`provisioning-grant-writer.service.ts:313`). Khuyến nghị (task `S20-T4c`, 0,3 h, chờ điều phối chốt): trong `carryToNextPeriod`, kỳ kế tiếp là
    kho (`ownerDepartmentId = null`) mà bắt `SEAT_CAPACITY` ⟹ `catalog.addPoolSeat(tx, actor, next.subscriptionId, requestId)` rồi mang lại (mua
    thêm cho kỳ mới, báo IT phụ trách theo `QĐ-110v`, `QĐ-103q` "người vào sau ⟹ IT mua thêm"). Không làm ⟹ ghi gap đã biết trong "Breaking FE"
    và http-spec khẳng định 409 `NEXT_PERIOD_SEATS`.
12. Ca `PROPOSED` cũ thành `STALE` qua migration; ca `DECIDED` cũ chỉ ghi kết quả qua route cũ.

## 9. Ngoài phạm vi A1 ⟹ prompt 4b

| Mã | Việc | Lý do cắt |
| --- | --- | --- |
| 4b-1 | `KPI-4` (seat-tháng dư do lỡ điểm, gồm gói tháng giữ nguyên) — cần bảng/sự kiện theo kỳ | Không có code KPI-4 nào hiện tại; cần thiết kế số liệu |
| 4b-2 | Trạng thái *tạm ngưng do NCC* hiển thị trên từng quyền khi `EXPIRY_MARKED` | Đọc liên module (my-software, assignment list) |
| 4b-3 | Phát hiện tự gia hạn ngoài ý muốn qua hóa đơn `SBF-19` (hóa đơn kỳ mới trên thuê bao đã ghi giảm/hủy) | Module requests/purchase-invoice |
| 4b-4 | Catalog ghi *đã đóng* (`autoRenew=false`, `endDate`) khi `CANCEL` | Hiện dùng `endingAmong` + audit `closure` |
| 4b-5 | Gỡ `seat-ranking`, ranking service, `released_seats` khỏi code | Dọn, không đổi hành vi |
| ~~4b-6~~ | ~~Catalog thôi đọc `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`~~ — **đưa vào prompt 5** (`S20-T9a`, ≈ 0,5 h, review S20-6). Chỉ quay lại 4b nếu cắt khi trễ (§11 danh sách cắt); khi đó ghi breaking FE "`alerts.dates` 15/7 lệch cảnh báo thật 7/30/7" | — |
| 4b-7 | Gói tháng cập nhật **cùng dòng** thay vì nối chuỗi — Owner đã chọn Q1 = A (nối dòng khi đổi số), lệch chữ "cùng dòng" của `QĐ-106i`(3)/`FR-1.12`(13) vì INV-01, Owner đã biết | Cần sức chứa theo thời gian (INV-01) |
| 4b-8 | **Review 2:** tỷ lệ chi phí seat *Trống* > 10 % ⟹ cảnh báo IT (`SBF-20` §5.1, `QĐ-103k`, tham số `FR-8.2`) — chưa có code, chưa có tham số | Hạng mục roadmap `qd103-seat-month-cost-pool-line` (`US-12-18`, "để sau"); không thuộc A1 |

## 10. Điều kiện xong (kiểm được)

1. `POST /subscription-renewals` với thuê bao kho `K2` (owner null) ⟹ 201, `state = OUTCOME_RECORDED`, `decision.deciderRole = IT_ADMIN_IN_CHARGE`, `proposal.seatsNeeded` đúng công thức; Finance có `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED`; không có thông báo cho trưởng phòng; không có tác vụ thu hồi mới.
2. `CANCEL` khi `seatsNeeded > 0`, hoặc `seatsNeeded = 0` mà còn ghế hiệu lực hôm nay (kết thúc trước ngày gia hạn), hoặc còn Request mở của gói ⟹ 409 `CANCEL_NOT_ALLOWED` + details (`activeSeatsToday`, `openRequests`); `CANCEL` khi cả ba bằng 0 và thiếu `closure` ⟹ 422.
3. `proposedQuantity` ≠ target ⟹ 409 `QUANTITY_NOT_SEATS_NEEDED`; vượt số cần do mức tối thiểu mà thiếu `note` ⟹ 422 `VENDOR_MINIMUM_EVIDENCE_REQUIRED`.
4. IT Admin khác người phụ trách (người phụ trách còn làm) ⟹ 201, audit có `substitute: true` + `responsibleItAdminEmployeeId`, người phụ trách nhận `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED`; người phụ trách bị khóa ⟹ IT khác ghi được, `substitute: false`.
4b. Catalog: `grep -rn RENEWAL_ALERT_DAYS_BEFORE_DEADLINE src` = 0; `subscriptionGet` gói năm có `alerts.dates = [adjustmentPointOn, redAlertOn]`; migration `…110200` đóng giá trị cũ. (`S20-Q4` = A) đổi `SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL` sau `startDate` của thuê bao không đổi điểm của thuê bao đó (`QĐ-106h`).
4c. Gói tháng `autoRenew = false`, `endDate` đã qua, còn ghế ⟹ sweep ghi `EXPIRY_MARKED`.
5. `POST /{id}/decision` ⟹ 404 route; OpenAPI không còn `subscriptionRenewalDecide`; có `subscriptionRenewalAdjustmentGet`.
6. Finance gọi `GET /subscription-deadline-events` ⟹ 200.
7. Sweep (unit theo policy thuần): điểm điều chỉnh báo IT một lần; gói năm tới `redAlertOn` không có ca ⟹ đỏ cho IT + Finance; gói tháng ngày thanh toán, dư ⟹ `KEPT` cho IT; kỳ có `end` thật (năm, tháng không tự gia hạn) qua `end` còn ghế ⟹ sự kiện + báo IT + Finance (+ Người duyệt chi khi tự gia hạn); không đọc `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` (grep `src` = 0).
8. Migration áp trên DB có dữ liệu cũ không lỗi; ca `PROPOSED` cũ thành `STALE`; `prisma migrate diff` không drift.
9. Quick check xanh: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm prisma:validate`, `pnpm openapi:export` (commit `openapi.json`), unit theo file, `pnpm test:http --maxWorkers=2` toàn bộ (hợp đồng FE).

---

## 11. PLAN cho chat A1 (Sonnet) — SBF-20

> Nhánh `feat/p5-a1-sbf20` từ `dev`, worktree `Code/be-p5-a1`, chạy song song chat A2. Làm tuần tự trong chat. Mỗi task: code + tự đọc diff +
> test theo file. Test cũ hỏng **không thuộc** file của task (flows MF-5, integration renewal) ⟹ ghi một dòng "Nợ test cho FIX-TEST", không sửa
> giữa chừng. Commit đứng tên Owner, không dòng đồng tác giả AI. Migration chỉ trong dải `20261117110000`–`20261117110900` (§6).

Lệnh dùng chung: `pnpm typecheck && pnpm lint && pnpm arch:check && pnpm rules:check`; unit: `pnpm jest <đường dẫn spec>`; http:
`pnpm test:http -- test/http/licensing/subscription-renewals.http-spec.ts`; integration (cần DB): `pnpm test:integration -- <file>`.

**Số đếm tham số vận hành (quy tắc chung, không ghi cứng số cuối):** task nào thêm/bớt định nghĩa trong `PARAMETER_DEFINITIONS` thì cập nhật
số đếm **theo nhánh của mình** ở 3 chỗ: `src/modules/operating-parameters/parameter-definitions.policy.spec.ts` (tiêu đề "pins the … keys" +
danh sách đếm, hiện `:160` "twenty-nine"), `test/integration/operating-parameters/operating-parameters-http.integration-spec.ts:428`
(`parameters.size`), `test/support/api-collection-registry-exceptions.ts:81` (`maxItems` — hiện 22, sai sẵn; đặt **bằng** số khóa thực).
Chat điều phối sửa lần cuối khi merge `feat/p5`.

### S20-T1 — Migration + Prisma + kiểu (S, 0,4 h)
- Mục tiêu: §6 bước 1–3; `RENEWAL_CHOICES` + `INCREASE`; `NoticeBasis` + `BY_RENEWAL_DATE`, `BY_PAYMENT_DATE`; `DeciderRole` + `IT_ADMIN_IN_CHARGE`; `RenewalRecord.seatsNeeded`; repo đọc/ghi `seats_needed`, đổi `ON CONFLICT`, `ofSubscriptions` trả mọi ca sống (Map → mảng theo thuê bao). **Review 2 (R2-7):** `deciderRoleOf` (`subscription-renewal.repo.ts:24-28`) đọc mọi giá trị lạ thành `SPENDING_APPROVER` ⟹ thêm nhánh `IT_ADMIN_IN_CHARGE`, nếu không ca mới hiện sai vai người quyết.
- File: `prisma/migrations/20261117110000_licensing_renewal_adjustment_values/migration.sql`, `prisma/migrations/20261117110100_licensing_renewal_adjustment_rules/migration.sql`, `prisma/models/licensing.prisma`, `src/modules/licensing/subscription-renewal/subscription-renewal.types.ts`, `subscription-renewal.repo.ts`.
- Test: `pnpm prisma:validate && pnpm prisma:generate`; integration `test/integration/licensing/subscription-renewal-outcome.integration-spec.ts` chạy được (migrate DB tạm).

### S20-T2 — Catalog: thuê bao kho vào facts + điểm điều chỉnh (M, 0,6 h)
- Mục tiêu: `RenewalPeriodFacts.ownerDepartmentId: string | null`; thêm `provisioningType`, `commitmentTermMonths`, `vendorMinimumSeats`, `isPrimaryForPlan`, `adjustment: { kind, deadline, point, end, redAlertOn, commitment } | null` (gọi `adjustmentPointOf` với `businessToday()`); bỏ lọc `isOwned` ở `withSuccessors`; `recordNext` cho kho (`ownerDepartmentId` null, giữ giá trị `NO_OWNER_DEPARTMENT` trong union); `SubscriptionPeriodApi.listAdjustmentSubjects()` = TERM/ACTIVE/K2/chưa nối tiếp (≤ 500), thay `listRenewalSubjects`.
- File: `src/modules/catalog/public/subscription-period.types.ts`, `catalog/public/subscription-period.api.ts`, `catalog/subscription/subscription-period.service.ts`, `catalog/subscription/subscription.repo.ts`, `catalog/subscription/obligation/subscription-obligation.policy.ts` (chỉ export kiểu nếu cần).
- Test: unit mới `subscription-period.service.spec.ts` hoặc mở rộng spec có sẵn: kho trả facts với owner null; `adjustment` tháng/năm/null. Typecheck sẽ chỉ ra chỗ licensing dùng `ownerDepartmentId: string` (sửa ở S20-T3/T4).
- Rủi ro: ca biên §8.11 — chạy `pnpm test:http` nhóm provisioning sau task.

### S20-T3 — Số seat cần + điều kiện hủy (M, 0,9 h)
- Mục tiêu: policy thuần `seats-needed/renewal-seats-needed.policy.ts` (`seatsNeededOf`, `targetOf`, `cancelProblem`, `choiceProblem`), repo `SubscriptionRenewalSeatRepo.seatsNeededFacts(subscriptionId, planId, renewalOn, countPlanWaiting, tx)` (một câu SQL cho held/ending/`activeSeatsToday`, một cho chờ cấp), service `RenewalSeatsNeededService` gọi hook `RenewalHoldHook.pendingRenewalsOf` cho ghế sắp hết và `openRequestsOfPlan` (mới, §4.4 bước 6).
- File: 3 file mới trong `src/modules/licensing/subscription-renewal/seats-needed/` + `subscription-renewal-seat.repo.ts` + `licensing/public/licensing.extension-points.ts` (thêm method vào `RenewalHold`) + `requests/renewal-request/renewal-hold.listener.ts` (cài) + `licensing.module.ts` (provider).
- Test: unit policy (ghế kết thúc đúng ngày gia hạn không tính; thu hồi đang chạy không tính; tiếp tục đang chờ tính; target với mức tối thiểu; `CANCEL` bị chặn khi còn ghế hiệu lực hôm nay kết thúc trước ngày gia hạn / khi còn Request mở; cả ba bằng 0 ⟹ chỉ CANCEL); unit listener `openRequestsOfPlan` (Request ở trạng thái cuối không đếm).
- Xung đột: `renewal-hold.listener.ts` chỉ A1 sửa.

### S20-T4 — Route ghi một lần + gỡ CONFIRM (L, 2,0 h, chia 2 commit)
- Mục tiêu: §4.4. `RenewalProposalService` viết lại thành `RenewalRecordService.record(actor, input)` (một transaction: `lockPeriod` → kiểm §4.4 1–7 → `insert` → `recordDecision` → `RenewalOutcomeService.recordIn(tx, …)` (tách lõi khỏi `record`, `record` cũ gọi lại lõi) → audit (`substitute`) → thông báo Finance (+ IT phụ trách khi `substitute`)/sự cố). Parties: `itAdminOf` nhận owner null, thêm `substituteOf(actor, period)`. DTO: body mới, `INCREASE`, nullable owner, `seatsNeeded`, `lateRenewal`, `deciderRole` mới. Errors + http-errors: 4 mã mới, `NOT_RENEWABLE.details.reason`, `CANCEL_NOT_ALLOWED.details` đủ 6 khóa. Controller: gỡ `decide`, mô tả `propose`/`outcome` mới. Xóa `decision/renewal-decision.service.ts`, `renewal-decision-trail.service.ts`, phần policy chỉ còn dùng cho confirm, `notifier.waitingForHead`.
- File: (a) `proposal/*` → `record/renewal-record.service.ts` + `.policy.ts`, `outcome/renewal-outcome.service.ts` (+ `endingBy` cho `continueInto`, R2-2), `outcome/renewal-outcome.policy.ts` + spec (`INCREASE`, R2-3), `subscription-renewal-parties.service.ts`; (b) `subscription-renewal.dto.ts`, `subscription-renewal.errors.ts`, `subscription-renewal.http-errors.ts`, `subscription-renewals.controller.ts`, `licensing.module.ts`; `notifications/public/notifications.types.ts` + `notifications/inbox/inbox.policy.ts` (mã `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED`, param `renewalId` của `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` — đúng §13).
- Test: unit `record/renewal-record.policy.spec.ts` (thứ tự lỗi §4.4); unit `renewal-outcome.policy.spec.ts` (`INCREASE` + `AS_DECIDED` đúng số ⟹ không lỗi); sửa `test/http/licensing/subscription-renewals.http-spec.ts` (IT khác ghi được + `substitute` trong audit, 409/422 mới, 404 route decision, body strict; **Review 2:** một ca có ghế `expected_end_date = renewalOn` + `AS_DECIDED` đúng `target` ⟹ 201 (R2-2); thuê bao có ca `DECIDED` cũ ⟹ 409 `ALREADY_PROPOSED` (R2-1); `INCREASE` ⟹ 201 (R2-3)); `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-route-codes-licensing.ts`; `pnpm openapi:export`.
- Xung đột: A2 cũng thêm mã vào `notifications.types.ts`/`inbox.policy.ts` (chỉ thêm dòng, merge thủ công ở `feat/p5`); B viết mẫu câu sau khi A1 merge.

### S20-T5 — Route xem số cần (S, 0,3 h)
- Mục tiêu: `GET /subscription-renewals/adjustment?subscriptionId=` (§5), IT Admin + Finance, tái dùng S20-T2/T3. **Review 2 (R2-5):** khai báo handler **trước** `@Get('subscription-renewals/:id')` (`subscription-renewals.controller.ts:86`) — Nest khớp route theo thứ tự khai báo, đặt sau thì `adjustment` rơi vào `:id` và trả 422 `VALIDATION_ERROR` (id không phải uuid); http-spec khẳng định 200 chứ không chỉ 4xx.
- File: `subscription-renewal-view.service.ts`, `subscription-renewal.dto.ts`, `subscription-renewals.controller.ts`, manifest test.
- Test: http-spec 200 (IT, Finance), 403 (Employee), 409 `NOT_RENEWABLE` cho `K1`.

### S20-T6 — Quét định kỳ theo điểm điều chỉnh (M, 1,3 h)
- Mục tiêu: §4.5. Policy thuần `alerts/renewal-adjustment-alerts.policy.ts` (`dueNotices(adjustment, today, hasCase, holdsSeats, purchased, target, autoRenew)` trả danh sách việc); viết lại `subscription-renewal-sweep.service.ts`, `alerts/renewal-alerts.service.ts`, `deadline/renewal-deadline.service.ts` (bỏ `flagLateIfDue`, sự cố/hết hạn theo `end` cho **mọi kỳ có `end` thật**, thêm Finance); xóa policy cũ `dueMilestone`/`finalAlertSkipped`/`lateFlagDue`; job log đổi nhãn. Thêm mã `SUBSCRIPTION_RENEWAL_RED_ALERT`, `SUBSCRIPTION_RENEWAL_KEPT` + params mới của `SUBSCRIPTION_RENEWAL_ALERT` (giữ khóa cũ trong `PARAM_KEYS_BY_CODE`); problem `NO_NOTICE_DEADLINE`.
- File: `alerts/*` (2), `deadline/*` (2), `subscription-renewal-sweep.service.ts`, `notifications/*` (2 — cùng file S20-T4).
- Test: unit policy mới (bảng §4.5, mỗi dòng 1 ca + ca biên "không có ca của kỳ" vs "có ca" + gói tháng `autoRenew=false` qua `endDate` ⟹ `EXPIRY_MARKED`); xóa spec policy cũ tương ứng; `grep -r RENEWAL_ALERT_DAYS_BEFORE_DEADLINE src/modules/licensing` = 0.

### S20-T7 — Quyền Finance + view nullable (XS, 0,15 h)
- Mục tiêu: `subscriptionDeadlineEventList` thêm `FINANCE`; mapper/view chịu `ownerDepartmentId` null (`scopeOf`, `waitingReason`).
- File: `subscription-renewals.controller.ts`, `subscription-renewal.mapper.ts`, `subscription-renewal-view.service.ts`.
- Test: http-spec Finance 200 ở deadline events.

### S20-T9a — Catalog thôi đọc tham số cũ + gỡ tham số (S, 0,5 h; làm được với cả A và B của `S20-Q4`)
- Mục tiêu (review S20-6): `subscription-view.service.ts:141,254,317-321` — `alerts.dates` = `[point]` (+ `redAlertOn` gói năm) lấy từ `adjustmentPointOf` đã tính ở `:102`; `alerts.baseDate` = `adjustment.deadline`. `subscription-notice.service.ts:37-60` (`activeNotices`, dùng cho `TERMS_REVIEW_DUE` của `plan-terms.service.ts:180`) — cửa sổ = số ngày điểm điều chỉnh gói năm, `firstAlertDate` = điểm. Gỡ `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` khỏi `PARAMETER_DEFINITIONS` (`parameter-definitions.policy.ts:302-312`) + migration `20261117110200_retire_renewal_alert_days` (§6 bước 4) + số đếm (quy tắc trên, −1).
- File: `catalog/subscription/subscription-view.service.ts`, `subscription-notice.service.ts`, `subscription.policy.ts` (`alertDates` theo điểm), `operating-parameters/parameter-definitions.policy.ts` (+ spec `:29,81-82,147,272`), migration; test sửa: `test/integration/catalog/catalog-subscription-read-model.integration-spec.ts:110`, `operating-parameters-http.integration-spec.ts:123,156`, `test/support/api-collection-registry-nested.ts:95,133`, `api-collection-registry-nested-first-half.ts:92,130` (đổi lời giải thích `int-list` dài nhất nếu không còn tham số `int-list`).
- Test: unit `subscription.policy.spec` (`alertDates` năm/tháng/null); integration read-model; `grep -rn RENEWAL_ALERT_DAYS_BEFORE_DEADLINE src` = 0.

### S20-T9b — Ba tham số điểm điều chỉnh (S, 0,5 h; **chỉ khi `S20-Q4` = A**)
- Mục tiêu: thêm `SUBSCRIPTION_ADJUSTMENT_DAYS_MONTHLY` (int 1–28, mặc định 7), `SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL` (int 1–180, mặc định 30), `SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL` (int 1–90, mặc định 7), nhóm `SUBSCRIPTION`, đơn vị `days`/"ngày", nguồn `FR-1.4, FR-8.2`. `adjustmentPointOf(input, today, windows)` thay hằng `:62-63`; người gọi (catalog view, filter `expiry`, `subscription-period.service.ts` cho licensing) đọc giá trị tại `startDate` của từng thuê bao bằng `getValuesAt` (`QĐ-106h`). Số đếm +3. **Review 2 (R2-9):** `getValuesAt` nhận `Date` (instant), không nhận `BusinessDate` (`operating-parameters.api.ts:74`). Instant của một kỳ = đầu ngày bắt đầu kỳ (`new Date(day + 'T00:00:00Z')`, ghi comment lệch múi giờ ≤ 1 ngày chấp nhận được): gói năm `day = startDate`; gói tháng `day = max(startDate, addMonths(deadline, −1))` (kỳ tháng là tháng đang chạy, dòng gói tháng không đổi số sống nhiều tháng — Q1 = A); `startDate = null` ⟹ `createdAt`. `deadline` không phụ thuộc số ngày cửa sổ nên tính trước, rồi mới đọc tham số. Một lời gọi `getValuesAt` cho cả trang/lượt quét (mỗi khóa một lời gọi).
- File: `parameter-definitions.policy.ts` (+ spec), `subscription-obligation.policy.ts` (+ spec), `subscription-view.service.ts`, `subscription-period.service.ts`, `subscription-notice.service.ts`.
- Test: unit `adjustmentPointOf` với cửa sổ khác mặc định; unit định nghĩa; integration operating-parameters (list có 3 khóa).
- Nếu `S20-Q4` = B: bỏ task này; thêm hằng `RED_ALERT_DAYS = 7` cạnh `:62-63`.

### S20-T8 — Tự rà diff + test FE contract (S, 0,4 h)
- `pnpm test:gates`, `pnpm test:http --maxWorkers=2` toàn bộ phải xanh; rà diff theo §10. Ghi "Nợ test cho FIX-TEST": `test/flows/mf5-rightsizing*.flow-spec.ts`, `test/flows/f0-auth-roles.flow-spec.ts` (đoạn renewal), `test/integration/licensing/subscription-renewal-{decision,owner-confirmation,sweep,outcome,pool-fields}.integration-spec.ts`, `machine-account-renewal`/`-successor`, `test/support/renewal-harness.ts`, seed demo nếu có bước gia hạn.
- Báo cáo cuối có ba mục bắt buộc: **"Thông báo mới/đổi cho 5b"** (chép §13, ghi lệch nếu code khác), **"Breaking FE"** (chép §5), **số đếm tham số trên nhánh**.

### Checkpoint
Sau S20-T4: route ghi chạy được trên DB local (một ca kho K2 tháng, một ca năm) trước khi làm S20-T6. Sau S20-T8: báo cáo "pnpm check và test toàn bộ CHƯA chạy".

### Ước lượng (đã chỉnh theo review S20-11)

| Task | Giờ Sonnet | Song song được? |
| --- | --- | --- |
| S20-T1 | 0,4 | Không (nền) |
| S20-T2 | 0,6 | Không (T3–T6 cần) |
| S20-T3 | 0,9 | Sau T2 |
| S20-T4 | 2,0 | Sau T3 |
| S20-T5 | 0,3 | Sau T3 (cùng file DTO/controller với T4 ⟹ tuần tự) |
| S20-T6 | 1,3 | Sau T2, T3 |
| S20-T7 | 0,15 | Bất kỳ lúc nào sau T2 |
| S20-T9a | 0,5 | Sau T2 |
| S20-T9b | 0,5 | Sau T9a (chỉ khi `S20-Q4` = A) |
| S20-T8 | 0,4 | Cuối |
| **Tổng** | **≈ 7,0 h** (lõi review ≈ 5,5 + S20-3 0,3 + S20-6 0,5 + S20-1 0,5 + chia lại giờ) | A1 không nằm trên đường dài nhất (B) |
| Review 2 | +0,4 (R2-1/2/3/5 trong T4/T5, R2-9 trong T9b) · `S20-T4c` +0,3 nếu điều phối chốt (R2-8) | **≈ 7,4–7,7 h** |

Cắt theo thứ tự nếu trễ (chuyển 4b): (1) S20-T9b — dùng phương án B của `S20-Q4` (hằng 7/30/7, ghi lệch luật `FR-8.2`) (−0,5 h);
(2) dòng *gói tháng giữ nguyên* của S20-T6 (−0,15 h); (3) S20-T5 route xem số cần (−0,3 h; FE tạm đọc số từ `details` của 409
`QUANTITY_NOT_SEATS_NEEDED`); (4) S20-T9a (−0,5 h; ghi breaking FE "`alerts.dates` lệch cảnh báo thật", 4b-6 mở lại); (5) thông báo sự cố ở
bước 10 §4.4 (−0,1 h). Không cắt S20-T1–T4, T7.

## 12. Câu hỏi Owner (chỉ chỗ chưa có nguồn đủ)

| Mã | Câu hỏi | A (khuyến nghị) | B |
| --- | --- | --- | --- |
| Q1 | `QĐ-106i`(3) nói gói tháng "chỉ cập nhật số seat và ngày kỳ trên cùng thuê bao". Hệ thống giữ số ghế mua là một số không theo ngày (INV-01), nên giảm tại điểm (7 ngày trước) khi ghế còn giữ tới ngày thanh toán sẽ vi phạm. | Nối chuỗi dòng kỳ mới như gói năm khi IT **đổi** số (giữ nguyên thì không ghi gì); kho vẫn đếm một kỳ (`QĐ-111n`); làm "cùng dòng" ở 4b-7 | Làm cùng dòng ngay: thêm số ghế theo ngày hiệu lực + đổi trigger INV-01 (+2 h, vượt A1) |
| Q2 | Đóng thuê bao (`QĐ-99i`): ghi gì trong hệ thống? | `CANCEL` bắt buộc hai ô xác nhận `dataExported`, `adminsTransferred` (lưu audit), chỉ được khi quyền và Request mở đã về 0 (§4.4 bước 6); thuê bao coi là đang đóng qua `endingAmong`; trạng thái *đã đóng* ở catalog để 4b-4 | Thêm trạng thái `CLOSED` ở catalog ngay (+0,5 h) |
| Q3 | Một lời gọi hay hai lời gọi? | Một lời gọi ghi đủ (đúng node `a_exec` của `SBF-20`, không ca treo) | Giữ đề xuất (tự quyết) + ghi kết quả riêng: ít code hơn ~20 phút, còn ca `DECIDED` treo chặn kỳ sau |
| **S20-Q4** (review S20-1) — **Owner chốt A 17/11** | Điểm điều chỉnh 7/30 và cảnh báo đỏ 7: hằng số hay tham số? BRD `FR-8.2` (bảng mặc định 4.12), `FR-1.4`, `QĐ-103n`, `SBF-20.md` bước 2 ghi là tham số `FR-8.2`; `QĐ-111o` chỉ nói về danh sách *gần hết hạn* | **A — tham số `FR-8.2`, mặc định 7/30/7:** `SUBSCRIPTION_ADJUSTMENT_DAYS_MONTHLY` = 7, `SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL` = 30, `SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL` = 7, đọc tại `startDate` (`QĐ-106h`); gỡ `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` + migration đóng giá trị (`…110200`). Thêm **+0,5 h** (`S20-T9b`); số tham số A1: +3 −1 | **B — hằng số 7/30/7** ở `subscription-obligation.policy.ts`, ghi lệch luật `FR-8.2`, mở hạng mục 4b thay bằng tham số. Nếu B thì: bỏ `S20-T9b`; §4.2/§4.5 đọc hằng; breaking FE mục 12 chỉ còn "gỡ `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`"; số tham số A1: −1 |

Spec viết theo **A**. Đã tự quyết (có nguồn, không hỏi): IT phụ trách chịu trách nhiệm, mọi IT Admin ghi được, ghi thay có `substitute`
(`QĐ-104l`, `QĐ-58b`); `K1` không có điểm điều chỉnh (`FR-1.12`(9)); `CANCEL` chỉ khi không còn quyền hiệu lực hôm nay và không còn Request mở
(`QĐ-103e`, `QĐ-99i`, `QĐ-104d`(2)); ca `PROPOSED` cũ đóng `STALE` (không còn người xác nhận).

## 13. Thông báo mới/đổi cho 5b (bàn giao câu, review S20-4)

Theo cột của `catalog/notifications.md`. Câu dùng cú pháp `catalog/README.md` (`{key:name}`, `{key:date}`, `{key:enum}`, `[ … ]`, biến thể
`by`). A1 thêm mã + khóa vào `IN_APP_NOTIFICATION_CODES`/`PARAM_KEYS_BY_CODE` (**giữ khóa cũ** của mã đổi params), **không** viết mẫu câu;
chat B chép bảng này vào N3b sau khi A1 merge. Subject của mọi dòng: `{ type: 'SUBSCRIPTION', id: subscriptionId }`.

| Mã | Mới/đổi | Khi phát sinh · eventKey | Người nhận | params | Bấm vào mở (`target`) |
| --- | --- | --- | --- | --- | --- |
| `SUBSCRIPTION_RENEWAL_ALERT` | **Đổi params + người nhận** | Tới điểm điều chỉnh, chưa có ca của kỳ (§4.5) · `subscription-adjustment-point:<sub>:<deadline>` | IT phụ trách (`itAdminOf`) | mới: `subscriptionId, renewalId` (null), `baseDate` (= hạn), `renewalOn`, `seatsNeeded`, `commitment` (`MONTHLY`\|`ANNUAL`); cũ giữ để đọc: `milestoneDays, noticeBasis, audience, decisionRecorded, outcomeRecorded, usageData` | `subscriptionGet` `{id: subject}` (route `adjustment` không có path param) |
| `SUBSCRIPTION_RENEWAL_RED_ALERT` | Mới | Gói năm tới `redAlertOn`, chưa có ca · `subscription-renewal-red:<sub>:<deadline>` | IT phụ trách + Finance | `subscriptionId, baseDate, renewalOn, seatsNeeded` | `subscriptionGet` |
| `SUBSCRIPTION_RENEWAL_KEPT` | Mới | Gói tháng ngày thanh toán, chưa ghi, dư seat · `subscription-renewal-kept:<sub>:<deadline>` | IT phụ trách | `subscriptionId, renewalOn, purchasedQuantity, seatsNeeded` | `subscriptionGet` |
| `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED` | Mới | IT ghi kết quả (`POST /subscription-renewals`) · `subscription-renewal-outcome:<renewalId>` | Finance; + IT phụ trách khi `substitute` | `renewalId, subscriptionId, choice` (`RENEW`\|`REDUCE`\|`INCREASE`\|`CANCEL`), `quantity` (number\|null), `outcome` (`AS_DECIDED`\|`VENDOR_REFUSED`\|`DIFFERENT`\|`UNCONFIRMED`), `nextSubscriptionId` (null), `substitute` (boolean) | `subscriptionRenewalGet` `{id: renewalId}` |
| `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` | **Đổi params + người nhận + nghĩa** | (a) sweep: qua `end` của kỳ tự gia hạn mà chưa ghi, còn ghế; (b) lúc ghi kết quả: đã chọn giảm/hủy mà NCC vẫn gia hạn (§4.4 bước 10) · (a) `subscription-incident:<sub>:<end>`, (b) `subscription-incident:<renewalId>` | IT phụ trách + Finance + Người duyệt chi | `subscriptionId, baseDate` (= `end`), **`renewalId`** (null ở (a)) | `subscriptionGet`; danh sách `subscriptionDeadlineEventList` |
| `SUBSCRIPTION_EXPIRY_MARKED` | **Đổi người nhận + nghĩa** | Qua `end` của kỳ không tự gia hạn (năm, hoặc tháng có `endDate`), chưa ghi, còn ghế ⟹ *hết hạn chưa gia hạn* · `subscription-expiry:<sub>:<end>` | IT phụ trách + Finance | không đổi: `subscriptionId, baseDate, endDate` | `subscriptionGet` |
| `SUBSCRIPTION_RENEWAL_DATA_QUALITY` | Thêm giá trị enum | `problem` thêm `NO_NOTICE_DEADLINE` | không đổi | không đổi | không đổi |

Câu VI / EN:

| Mã | Tiếng Việt (tiêu đề · nội dung) | English (title · body) |
| --- | --- | --- |
| `SUBSCRIPTION_RENEWAL_ALERT` | **Thuê bao tới điểm điều chỉnh** · biến thể `by: commitment`, `cases` `MONTHLY`/`ANNUAL` = "Thuê bao {subscriptionId:name} đã tới điểm điều chỉnh của kỳ {commitment:enum}: kỳ sau cần {seatsNeeded} seat, bắt đầu {renewalOn:date}. Vui lòng làm với nhà cung cấp và ghi kết quả trước {baseDate:date}."; `otherwise` (dòng cũ) = "Thuê bao {subscriptionId:name} sắp đến hạn {baseDate:date}.[ Còn {milestoneDays} ngày.]" | **Subscription at its adjustment point** · `MONTHLY`/`ANNUAL` = "Subscription {subscriptionId:name} reached the adjustment point of its {commitment:enum} period: the next period needs {seatsNeeded} seats from {renewalOn:date}. Please settle it with the vendor and record the outcome before {baseDate:date}."; `otherwise` = "Subscription {subscriptionId:name} is due on {baseDate:date}.[ {milestoneDays} days left.]" |
| `SUBSCRIPTION_RENEWAL_RED_ALERT` | **Cảnh báo đỏ: thuê bao chưa ghi kết quả điều chỉnh** · "Còn ít ngày tới hạn {baseDate:date} mà thuê bao {subscriptionId:name} chưa có kết quả điều chỉnh. Kỳ sau cần {seatsNeeded} seat, bắt đầu {renewalOn:date}." | **Red alert: subscription adjustment not recorded** · "Subscription {subscriptionId:name} has no adjustment outcome and its deadline {baseDate:date} is close. The next period needs {seatsNeeded} seats from {renewalOn:date}." |
| `SUBSCRIPTION_RENEWAL_KEPT` | **Thuê bao gói tháng giữ nguyên số seat** · "Thuê bao {subscriptionId:name} không được ghi điều chỉnh trước ngày thanh toán {renewalOn:date}, nên giữ nguyên {purchasedQuantity} seat trong khi chỉ cần {seatsNeeded}." | **Monthly subscription kept its seats** · "No adjustment was recorded for subscription {subscriptionId:name} before its payment day {renewalOn:date}, so it keeps {purchasedQuantity} seats while {seatsNeeded} are needed." |
| `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED` | **Đã ghi kết quả điều chỉnh thuê bao** · "Kết quả điều chỉnh thuê bao {subscriptionId:name}: {choice:enum}[ {quantity} seat], nhà cung cấp {outcome:enum}." + biến thể `by: substitute`, `cases.true` thêm " Một IT Admin khác đã ghi thay." | **Subscription adjustment recorded** · "Adjustment of subscription {subscriptionId:name}: {choice:enum}[ {quantity} seats], vendor {outcome:enum}." + `substitute` `true`: " Another IT Admin recorded it on your behalf." |
| `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` | **Sự cố gia hạn ngoài ý muốn** · "Thuê bao {subscriptionId:name} có thể đã được nhà cung cấp tự gia hạn vào {baseDate:date} ngoài ý muốn. Vui lòng kiểm tra với nhà cung cấp." | **Unintended renewal** · "Subscription {subscriptionId:name} may have been renewed by the vendor on {baseDate:date} unintentionally. Please check with the vendor." |
| `SUBSCRIPTION_EXPIRY_MARKED` | **Thuê bao hết hạn chưa gia hạn** · "Đã qua ngày gia hạn {baseDate:date} mà thuê bao {subscriptionId:name} chưa ghi kết quả và vẫn còn quyền đang gán. Quyền có thể bị nhà cung cấp tạm ngưng." | **Subscription expired without renewal** · "The renewal day {baseDate:date} of subscription {subscriptionId:name} has passed with no outcome recorded while seats are still assigned. The vendor may suspend them." |

Nhãn enum (VI / EN): `commitment` `MONTHLY` → "gói tháng" / "monthly", `ANNUAL` → "gói năm" / "annual"; `choice` `RENEW` → "gia hạn đúng số" /
"renew as is", `REDUCE` → "giảm" / "reduce", `INCREASE` → "tăng" / "increase", `CANCEL` → "hủy" / "cancel"; `outcome` `AS_DECIDED` → "đồng ý" /
"agreed", `VENDOR_REFUSED` → "từ chối" / "refused", `DIFFERENT` → "làm khác" / "did otherwise", `UNCONFIRMED` → "chưa xác nhận" / "not confirmed";
`problem` `NO_NOTICE_DEADLINE` → "thiếu hạn chót báo hủy" / "no cancellation deadline".

## 14. Review 2: bảng phủ `SBF-20` v3.1 (bước 1–7, §5.1, §5.2)

| `SBF-20` | Xử lý | Ở đâu |
| --- | --- | --- |
| Bước 1 khai báo (một thuê bao/(ứng dụng, gói), IT phụ trách, admin NCC ≥ 2, tài khoản sở hữu, kỳ cam kết, mức tối thiểu NCC) | Đã có, không đổi | catalog (`plan_workspace_admins`, `VENDOR_ADMINS_BELOW_MINIMUM`, `vendorMinimumSeats`, `commitmentTermMonths`) |
| Bước 2 điểm điều chỉnh 7/30, thiếu hạn chót ⟹ ngày gia hạn; danh sách *gần hết hạn* | A1 | §4.2, `S20-T2`, `S20-T9a/b` |
| Bước 3 số seat cần (giữ qua ngày gia hạn + tiếp tục chờ + đã duyệt chờ cấp, không gồm đã quyết thu hồi, không đệm) | A1 | §4.3, `S20-T3` |
| Bước 4 IT ghi đúng số; mức tối thiểu NCC kèm bằng chứng; không trưởng phòng/Người duyệt chi; gói tháng "cùng dòng" | A1 (gói tháng nối dòng khi đổi số — Q1 = A, lệch đã biết, 4b-7) | §4.4, `S20-T4` |
| Bước 5 tiếp tục/hủy — hủy chỉ khi 0 quyền và 0 Request | A1 | §4.4 bước 6 |
| Bước 6 ghi kỳ mới ngay, báo Finance; mốc đối chiếu hóa đơn; dòng *Chưa phân bổ — kho*; `KPI-4` | A1 (kỳ mới + Finance); mốc hóa đơn dùng `purchasedQuantity` kỳ mới (đã có ở `SBF-19`); dòng kho và `KPI-4` ⟹ 4b-1 / `US-12-18` | §4.4 bước 8–9, §4.6 |
| Bước 7 hóa đơn kỳ `SBF-19` song song | Đã có, không đổi (cờ *kỳ chưa có hóa đơn*: `missingInvoicePeriods`) | requests/purchase-invoice |
| §5.1 Gói năm chưa có kết quả 7 ngày trước hạn chót ⟹ đỏ IT + Finance | A1 | §4.5 |
| §5.1 Gói tháng chưa ghi tới ngày thanh toán ⟹ giữ nguyên, nhắc IT, `KPI-4` | A1 (nhắc khi dư); `KPI-4` ⟹ 4b-1 | §4.5 |
| §5.1 Tỷ lệ chi phí seat *Trống* > 10 % | **Không** trong A1 | 4b-8 (`US-12-18`) |
| §5.1 Kỳ chưa có hóa đơn; số seat tăng do mua thêm | Đã có (`missingInvoicePeriods`, `SUBSCRIPTION_SEATS_INCREASED`) | catalog, requests |
| §5.1 Hủy thuê bao (xuất dữ liệu, chuyển owner/admin, báo Finance, không `SBF-18`) | A1 (hai ô xác nhận — Q2 = A); trạng thái *đã đóng* ⟹ 4b-4 | §4.4 bước 6, 8 |
| §5.2 Gói năm thêm seat giữa kỳ | Đã có (`addPoolSeat` khi cấp); sau khi đã ghi kết quả xem R2-8 | §8.11 |
| §5.2 `K4` vĩnh viễn không có điểm; `K1` không có kho | A1 loại khỏi §4.1 (`NOT_POOL_TERM`/`PERPETUAL`) | §4.1 |
| §5.2 Seat thu hồi về kho, giảm ở điểm sau; quyền đã quyết thu hồi không tính | A1 | §4.3 (`liveRevocationSources`) |
| §5.2 Thiếu hạn chót và số ngày báo trước ⟹ ngày gia hạn + cảnh báo chất lượng dữ liệu | A1 | §4.2, §4.5 `NO_NOTICE_DEADLINE` |
| §5.2 Đã ghi giảm/hủy mà NCC vẫn tự gia hạn ⟹ báo Người duyệt chi + IT phụ trách + Finance | A1 lúc ghi kết quả; phát hiện qua hóa đơn ⟹ 4b-3 | §4.4 bước 10 |
| §5.2 Hết hạn chưa gia hạn; gia hạn trễ | A1 (sự kiện + báo IT + Finance; `lateRenewal`); *tạm ngưng do NCC* trên quyền ⟹ 4b-2 | §4.5, §4.4 bước 4 |
| §5.2 Credit tự động, đổi gói, tài khoản máy, giá ngoại tệ, lần mua gói năm đầu | Đã có hoặc ngoài `SBF-20` code (hóa đơn, Request mới, `isMachineAccount`, `PRICE_NOT_VND`, xem trước giá năm của Request) | — |
| IT khác ghi thay | A1 (`substitute`, `QĐ-58b`) | §4.4 bước 3 |
| Thuê bao kho không có phòng sở hữu | A1 (`ownerDepartmentId` nullable) | `S20-T2`, `S20-T7` |
