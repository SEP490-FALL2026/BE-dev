# AUDIT-A1-core-review — SBF-20 vùng lõi (T1, T3, T4a, T4b+T7, T4c, T5, migration `20261117110*`)

> Reviewer chỉ đọc, 17/11/2026. Repo `Code/be-p5-a1`, nhánh `feat/p5-a1-sbf20`, phạm vi `94a8ee84..41c34c05`. Mọi trích dẫn file:dòng ở
> `41c34c05` (đọc bằng `git show 41c34c05:<path>` / `git diff`). Không sửa file, không checkout, không chạy pnpm/jest/docker.

**Skill đã đọc/dùng:**
- `agent-skills:code-review-and-quality` — process + review: khung 5 trục, phân mức Critical/Required/Optional/Nit, đề xuất sửa cụ thể.
- `superpowers:verification-before-completion` — verification: mỗi kết luận Critical/Required dưới đây có dòng code đã đọc trong lượt này; không
  khẳng định test xanh/đỏ (không chạy test theo brief).
- Mapping: không có skill riêng "review nghiệp vụ backend"; dùng `code-review-and-quality` cho cả process lẫn domain review.

**Nguồn đã đọc:** `SPEC-5A-SBF20.md` (toàn bộ), `REVIEW-SPECS-2-SBF20.md`, `A1-DONE.md`; code: `record/*`, `seats-needed/*`,
`outcome/*`, `subscription-renewal-seat.repo.ts`, `subscription-renewal.repo.ts`, `-parties`, `-view`, `-mapper`, `-dto`, `-http-errors`,
controller, `assignment.service.ts` + `assignment-carry.repo.ts` (T4c), `provisioning-grant-writer.service.ts`, `renewal-hold.listener.ts`,
`access-request.repo.ts`, `renewal-request.repo.ts`, catalog `subscription-period.service.ts` + `subscription-obligation.policy.ts` (chỉ phần
`recordNext`/`monthly`/`annual`), 3 migration mới + 3 migration cũ của `subscription_renewals` và `parameter_values`; test: seats-needed
integration, record integration, outcome integration (race), shared-pool-next-period, http-spec renewals, policy specs.

## 0. Kết luận

**Chưa merge được** vùng này: 0 Critical, **4 Required** (2 sai công thức/nghiệp vụ, 2 ngõ cụt/thiếu chặn sau khi ghi), 6 Optional, 2 Nit.
Phần còn lại đúng spec và chắc: một transaction dưới khóa dòng thuê bao, R2-1/R2-2/R2-3/R2-4/R2-5/R2-6/R2-7 đã áp và có test bắt mutation,
migration an toàn với dữ liệu cũ, phân quyền route đúng §4.6, kiến trúc qua `public/`/hook đúng chiều.

| Mã | Mức | Tóm tắt | File:dòng (`41c34c05`) |
| --- | --- | --- | --- |
| A1C-01 | Required | `approvedAwaitingGrant` luôn = 0 với kho `K2`: Request đã duyệt chờ cấp (`AWAITING_EXECUTION`) không được đếm | `subscription-renewal-seat.repo.ts:120-131` |
| A1C-02 | Required | Ghi `CANCEL` xong thuê bao vẫn sống: gói tháng bị nhắc/ghi lại mỗi tháng, vẫn cấp seat được từ thuê bao đã hủy | `record/renewal-record.policy.ts:24-31,133-139`; `subscription-renewal.repo.ts:172-185` |
| A1C-03 | Required | Gói năm ghi `UNCONFIRMED`/`VENDOR_REFUSED`/`DIFFERENT` không `nextPeriod` ⟹ không bao giờ ghi được kỳ mới, sweep im lặng | `subscription-renewal.dto.ts:63-98`; `record/renewal-record.policy.ts:133-139` |
| A1C-04 | Required | `nextPeriod.startDate` không bị ràng với ngày gia hạn ⟹ gói năm giảm giữa kỳ được; số đếm và số mang sang lệch ngày | `record/renewal-record.service.ts:83-98`; `outcome/renewal-outcome.service.ts:231-235` |
| A1C-05 | Optional | `RENEW`/`INCREASE` + `DIFFERENT`/`VENDOR_REFUSED` với kỳ mới nhiều seat hơn số cần không bị báo (lối vòng `QĐ-103q`/`QĐ-104d`) | `record/renewal-record.policy.ts:154-165` |
| A1C-06 | Optional | T4c mang (và mua thêm) seat kết thúc đúng ngày gia hạn — lệch luật R2-2 của đường ghi | `assignment/assignment.service.ts:410-414,440-446` |
| A1C-07 | Optional | `seats_needed` không nằm trong trigger "proposal is final" (R2-11 còn mở) | migration `20261117110100` (không có `CREATE OR REPLACE FUNCTION`) |
| A1C-08 | Optional | `openRequests` đọc không khóa ⟹ cửa sổ race `CANCEL` với Request mới gửi | `seats-needed/renewal-seats-needed.service.ts:58` |
| A1C-09 | Optional | Test sự cố `QĐ-106i`(4) assert yếu (`>= 2`), không ghim người nhận | `test/integration/licensing/subscription-renewal-record.integration-spec.ts:186` |
| A1C-10 | Optional | `lateRenewal` của ca legacy tính theo luật mới + ngày hiện tại của dòng thuê bao | `subscription-renewal-view.service.ts:134-136` |
| A1C-11 | Nit | `ALREADY_PROPOSED` kiểm sau số đếm: kỳ đã ghi có thể trả `QUANTITY_NOT_SEATS_NEEDED` trước | `record/renewal-record.service.ts:131-135` |
| A1C-12 | Nit | Comment cũ "the one who confirms must be able to read" | `subscription-renewal-parties.service.ts:93` |

## 1. Findings Required

### A1C-01 — Required — `approvedAwaitingGrant` không bao giờ đếm được Request đã duyệt của kho `K2`

**Chỗ code.** `subscription-renewal-seat.repo.ts:120-131`:
```sql
WHERE a.plan_id = $planId AND a.subscription_id IS NULL AND a.failed_at IS NULL AND a.cancelled_at IS NULL
  AND EXISTS (SELECT 1 FROM provisioning_tasks t WHERE t.assignment_id = a.id AND t.kind = 'GRANT' AND t.status IN OPEN_GRANT_TASK_STATUSES)
```
**Vì sao luôn 0.** Với `K2`, assignment và tác vụ `GRANT` được tạo **cùng lúc** khi IT bấm cấp (`provisioning-grant-writer.service.ts:61-95`),
và assignment lấy `subscriptionId: input.target.subscriptionId` (`assignment/assignment.service.ts:226`) — `subscriptionOf` luôn chọn một thuê bao
cho K2 (`provisioning-grant-writer.service.ts:257-271`, chỉ `K5` trả `undefined`). Vậy không có assignment K2 nào "`subscription_id IS NULL` + tác
vụ GRANT mở". Assignment đang cấp (task mở) đã có `subscription_id` nên rơi vào `heldPastRenewal` — còn **Request đã duyệt mà IT chưa tạo tác vụ**
(state `AWAITING_EXECUTION`, xem `access-request.types.ts:22`, README requests dòng 22/291) thì **không có assignment nào**, không được đếm ở đâu.
Spec §4.3 đã yêu cầu "Sonnet xác minh assignment của tác vụ GRANT đang mở có `subscription_id` NULL trước khi viết SQL, nếu không thì đếm theo
task" — chưa làm. Test integration (`subscription-renewal-seats-needed.integration-spec.ts:167-183`) chèn thô assignment `subscription_id = NULL`
cho gói K2 — trạng thái luồng thật không sinh ra, nên test xanh mà công thức sai.

**Kịch bản.** Kho K2 gói năm 10 seat, 8 quyền giữ qua ngày gia hạn, 2 Request đã duyệt chi chờ IT cấp (`AWAITING_EXECUTION`). `adjustment` trả
`seatsNeeded.total = 8`, `approvedAwaitingGrant = 0`; IT buộc ghi `REDUCE 8` (số khác ⟹ 409 `QUANTITY_NOT_SEATS_NEEDED`). Sai `QĐ-103e`/`QĐ-103v`(2)
("+ Request đã duyệt chờ cấp"). Hậu quả được T4c che một phần (cấp sau đó tự mua thêm seat kỳ kế), nhưng con số nhà cung cấp/Finance nhận lúc
ghi là sai, và nếu IT cấp sau khi kỳ mới đã chạy thì gặp `SEAT_CAPACITY` (phải `purchase`). `CANCEL` vẫn bị chặn đúng nhờ `openRequests`.

**Cách sửa.** Đếm theo Request, không theo assignment:
- Thêm vào `RenewalHold` (`licensing/public/licensing.extension-points.ts`) `approvedAwaitingGrantOfPlan(planId, tx)`; cài ở
  `renewal-hold.listener.ts` gọi repo `requests/access-request` đếm **số người hưởng** (dòng của Request nhóm) của Request `plan_id = planId`,
  `state = 'AWAITING_EXECUTION'`, **không** phải Request tiếp tục sử dụng (Request tiếp tục đã duyệt nằm ở `pendingRenewalsOf` qua
  `endingAssignmentIds`, tránh đếm hai lần — `renewal-request.repo.ts:57-70` trả cả ca `approved`).
- Cộng thêm (giữ) phần assignment K2 có task GRANT mở thì đã ở `heldPastRenewal`; bỏ câu `awaitingGrant` hiện tại hoặc giữ cho K5 (không áp dụng).
- Chỉ cộng khi `isPrimaryForPlan` như cũ.

**Test.** Integration mới: tạo Request K2 thật đi qua route tới `AWAITING_EXECUTION` (không chèn thô assignment), `countFor` ⟹
`approvedAwaitingGrant = 1`; tạo tác vụ cấp cho nó ⟹ `approvedAwaitingGrant = 0`, `heldPastRenewal + 1` (không đếm hai lần); Request tiếp tục
đã duyệt ⟹ chỉ ở `pendingContinuations`. Xóa/viết lại ca `subscription_id NULL` ở `seats-needed.integration-spec.ts:167-183`.
Mutation cần bắt: bỏ hạng tử này khỏi `seatsNeededOf` ⟹ ca trên đỏ.

### A1C-02 — Required — Ghi `CANCEL` xong, hệ thống vẫn coi thuê bao đang chạy

**Chỗ code.** Đường ghi `CANCEL` + `AS_DECIDED` chỉ kiểm hết ghế (`outcome/renewal-outcome.service.ts:194-196`) rồi ghi ca `OUTCOME_RECORDED`;
catalog không đổi (`4b-4` để sau). Spec §9 nói "hiện dùng `endingAmong` + audit `closure`", nhưng `endingAmong`
(`subscription-renewal.repo.ts:172-185`) chỉ được dùng ở `budgets/cycle/baseline.service.ts:254` (`git grep getSubscriptionIdsToEnd`). Không chỗ
nào của licensing đọc nó:
- `notRenewableReason` (`record/renewal-record.policy.ts:24-31`) không có lý do "đã hủy";
- `existingCaseOf` (`record/renewal-record.policy.ts:133-139`) chỉ khớp cùng `deadline` hoặc ca `DECIDED`;
- sweep dùng đúng `existingCaseOf` theo `adjustment.deadline` (`subscription-renewal-sweep.service.ts:88-89`);
- cấp seat (`SharedPoolService.chooseSubscription`, `requireGrantable`) không loại thuê bao đã quyết hủy.

**Kịch bản.** (a) Kho K2 gói tháng tự gia hạn, ghi `CANCEL` cho kỳ trả ngày 01/12. Sang 02/12 `monthly()` cuộn `deadline = 01/01`
(`subscription-obligation.policy.ts:194-214`) ⟹ không có ca cho kỳ mới ⟹ 25/12 IT nhận lại `SUBSCRIPTION_RENEWAL_ALERT` "kỳ sau cần 0 seat", ngày
01/01 nhận `SUBSCRIPTION_RENEWAL_KEPT` "giữ nguyên 10 seat" (purchased 10 > target 0), `GET adjustment` cho phép ghi `CANCEL` lần nữa — lặp mỗi
tháng. (b) Sau `CANCEL`, Request mới của gói được duyệt: `chooseSubscription` vẫn chọn thuê bao này (10 seat Trống) và cấp thành công trên
thuê bao đã hủy với nhà cung cấp. Trái `QĐ-99i`/`QĐ-104d`(2) và `SBF-20` bước 5.

**Cách sửa (tối thiểu trong licensing, không đợi 4b-4).**
1. `notRenewableReason` thêm lý do `CANCELLED` khi thuê bao có ca `CANCEL` + `AS_DECIDED` (đọc `endingAmong` trong `lockPeriod`/`adjustmentOf`, hoặc
   cho `existingCaseOf` trả ca đó bất kể `deadline`) ⟹ `POST`/`GET adjustment` 409 `NOT_RENEWABLE` `reason = CANCELLED`, sweep bỏ qua (dòng
   `hasCase`).
2. Đường cấp: `requireGrantable`/`chooseSubscription` loại thuê bao trong `getSubscriptionIdsToEnd` (một câu, đã có API) ⟹ 422
   `SUBSCRIPTION_NOT_GRANTABLE`.
3. Nếu Owner muốn đúng hơn: kéo `4b-4` (catalog `autoRenew=false` + `endDate = end`) vào prompt 5.

**Test.** Integration: ghi `CANCEL` gói tháng ⟹ chạy sweep với `today = deadline + 25 ngày` ⟹ 0 thông báo; `GET adjustment` ⟹ 409
`NOT_RENEWABLE/CANCELLED`; grant Request mới của gói ⟹ không chọn thuê bao đã hủy. Mutation: bỏ nhánh `CANCELLED` ⟹ ca sweep đỏ.

### A1C-03 — Required (cần Owner chốt) — Ca kết quả không có kỳ mới là ngõ cụt với gói năm

**Chỗ code.** Body cho phép mọi `outcome` ≠ `AS_DECIDED` mà không có `nextPeriod` (`subscription-renewal.dto.ts:63-98`; chỉ bắt buộc
`outcomeNote`). Ca được ghi thẳng `OUTCOME_RECORDED` (trigger `subscription_renewals_outcome_is_final` cấm đổi `next_subscription_id`,
migration `20261108300100:67-77`). Index `subscription_renewals_one_live_per_period (subscription_id, notice_base_date)` (migration
`20261117110100:36-37`) + `existingCaseOf` (`renewal-record.policy.ts:133-139`) chặn ca thứ hai cùng `deadline`; route legacy `/outcome` chỉ nhận ca
`DECIDED` (`renewal-outcome.service.ts:207`). `recordNext` chỉ được gọi từ `continueInto` (`git grep recordNextPeriod`).

**Kịch bản.** Gói năm, ngày điểm điều chỉnh IT liên hệ NCC, NCC chưa trả lời ⟹ IT ghi `REDUCE 8` + `UNCONFIRMED` (hợp lệ, `vendorFollowUpOpen =
true`). Hai tuần sau NCC xác nhận kỳ mới 8 seat: `POST /subscription-renewals` ⟹ 409 `ALREADY_PROPOSED` (cùng `deadline`), `/outcome` ⟹ 409
`NOT_AWAITING_OUTCOME`. Kỳ mới **không bao giờ** ghi được, Finance không được báo kỳ mới (`QĐ-106i`(3)), seat không mang sang; qua ngày gia hạn sweep
thấy `hasCase = true` ⟹ không `EXPIRY_MARKED`/sự cố, không cảnh báo đỏ. Ở luồng cũ ngõ cụt này cũng có, nhưng luồng một lần ghi đặt lựa chọn
`UNCONFIRMED` ngay tại điểm (7–30 ngày trước hạn) nên khả năng xảy ra cao hơn nhiều. Gói tháng không bị (kỳ sau đổi `deadline`, spec §8.9).

**Cách sửa (Owner chọn).**
- **A (khuyến nghị, ít code):** ở route mới, `choice ≠ CANCEL` ⟹ bắt buộc `nextPeriod` trừ `outcome = VENDOR_REFUSED` của gói tháng; `UNCONFIRMED`
  không nhận ở route một lần ghi (IT ghi khi NCC đã xác nhận — đúng nghĩa node `a_exec` "Record Outcome"). 422 `VALIDATION_ERROR` hoặc mã mới
  `NEXT_PERIOD_REQUIRED`.
- **B:** cho ca `OUTCOME_RECORDED` có `vendorFollowUpOpen = true` và `next_subscription_id IS NULL` nhận một lần "ghi kỳ mới" (route
  `POST /{id}/next-period`, sửa trigger cho phép đặt `next_subscription_id` từ NULL một lần).
**Test.** http-spec 422 cho body `REDUCE` + `UNCONFIRMED` không `nextPeriod` (A); integration ca năm `UNCONFIRMED` rồi ghi lại (B).

### A1C-04 — Required — Ngày bắt đầu kỳ mới không bị ràng với ngày gia hạn (gói năm giảm giữa kỳ được)

**Chỗ code.** `record/renewal-record.service.ts:83-98` chuyển nguyên `input.nextPeriod` vào lõi; số đếm dùng `renewalOn = adjustment.end`
(`:126`), còn mang ghế dùng `nextPeriod.startDate` (`outcome/renewal-outcome.service.ts:231-235`: `notEndedBy(…, startDate)` +
`seatsToCarry(…, startDate)`) rồi mới lọc `carriedPast(endingBy = end)`. Catalog chỉ từ chối `startDate <= previous.startDate`
(`catalog/subscription/period/subscription-period.service.ts:199-201`). `MID_TERM_NOT_ALLOWED` (luật cũ) đã gỡ và vốn không được ném ở đâu.

**Kịch bản.** Gói năm 01/01–31/12, ngày gia hạn 01/01 năm sau, điểm = 30 ngày trước hạn chót. IT ghi `REDUCE 6` + `AS_DECIDED` với
`nextPeriod.startDate = <ngày mai>` ⟹ 201: kỳ mới 6 seat chạy từ ngày mai, ghế giữ được mang sang ngay, kỳ cũ bị "nối" giữa kỳ ⟹ giảm giữa kỳ, trái
luật "gói năm chỉ giảm ở kỳ gia hạn" (`QĐ-103v`, `SBF-20` bước 4) và làm `lateRenewal`/`EXPIRY_MARKED` (theo `end`) lệch với kỳ thật. Ngược lại
`startDate` sau `end` vài tuần ⟹ ghế đếm theo `end` nhưng mang theo `startDate`, kỳ cũ giữ người tới `startDate` trong khi đã nối.

**Cách sửa.** Trong `RenewalRecordService.check` (sau `preflightOf`): khi có `nextPeriod`, đòi `nextPeriod.startDate` ∈ {`end`, `end + 1`} (năm:
`end` là `renewalDate` (ngày bắt đầu kỳ sau) hoặc `endDate` (ngày cuối kỳ cũ) — chấp nhận cả hai cách khai; tháng: = `end` = ngày thanh toán);
khác ⟹ 409 `PERIOD_REFUSED` `details.reason = NOT_ON_RENEWAL_DAY` (thêm giá trị vào `PeriodRefusal`/mô tả OpenAPI). Truyền `endingBy` giữ
nguyên.
**Test.** Unit `renewal-record.policy.spec` (hàm thuần `nextStartProblem(adjustment, startDate)`): trước `end`, đúng `end`, `end+1`, sau `end+1`;
integration: `REDUCE` gói năm `startDate = ngày mai` ⟹ 409, không dòng `subscriptions` mới. Mutation bỏ kiểm ⟹ ca integration đỏ.

## 2. Optional

- **A1C-05 Optional** — `unintendedRenewalOf` (`renewal-record.policy.ts:154-165`) chỉ xét `REDUCE`/`CANCEL`. `RENEW 8` hoặc `INCREASE 12` +
  `DIFFERENT` + `nextPeriod.purchasedQuantity = 20` ⟹ 201, không ai được báo — lối vòng ghi số lớn hơn số hệ thống tính (`QĐ-104d`: "không ghi được số
  lớn hơn", `QĐ-103q`: không seat đệm). Sửa: sự cố khi `outcome ∈ {VENDOR_REFUSED, DIFFERENT}` và `nextQuantity > (quantity ?? 0)` với **mọi** lựa
  chọn ≠ `CANCEL`. Test: unit 2 ca `RENEW`/`INCREASE`.
- **A1C-06 Optional** — T4c dùng `seatsToCarry` (mang ghế có ngày cuối = `startDate`) ở `assignment.service.ts:410-414`, rồi mua thêm seat kỳ kế khi
  đầy (`:440-446`). Ghế cấp sau điểm điều chỉnh có `expectedEndDate = ngày gia hạn` ⟹ mua 1 seat cho kỳ mới mà người đó không dùng (đường ghi kết quả
  thì không mang ghế này — R2-2). Spec cho giữ `seatsToCarry`, nhưng spec viết trước T4c; khi có mua thêm thì nên lọc `carriedPast(…, startDate)` cho kỳ
  kế của kho. Test: integration grant ghế hết đúng `startDate` ⟹ không mua.
- **A1C-07 Optional** — `seats_needed` không được trigger bảo vệ (R2-11; comment `licensing.prisma` ghi rõ). Là bằng chứng đối chiếu hóa đơn
  (`QĐ-104d`(1)); thêm cột vào bộ "proposal is final" bằng `CREATE OR REPLACE FUNCTION` trong một migration `20261117110300`. Test integration
  `UPDATE seats_needed` ⟹ lỗi `subscription_renewals_proposal_is_final`.
- **A1C-08 Optional** — `openRequestsOfPlan` (`renewal-seats-needed.service.ts:58`) đọc không khóa; Request gửi mới đồng thời với `CANCEL` có thể lọt
  (cửa sổ vài ms; Request mới vẫn bị chặn cấp nếu A1C-02 sửa bước 2). Chấp nhận được; ghi rủi ro.
- **A1C-09 Optional** — `subscription-renewal-record.integration-spec.ts:186` `expect(incident.length).toBeGreaterThanOrEqual(2)`: không ghim
  Người duyệt chi + IT + Finance. Sửa: so tập `recipient_employee_id` = {approver, it, finance}.
- **A1C-10 Optional** — `detailOf` (`subscription-renewal-view.service.ts:134-136`) tính `lateRenewal` cho cả ca legacy bằng luật mới và ngày
  hiện tại của dòng thuê bao (đọc lại, không lưu — D-11). Ca cũ `DECLARED` có thể hiện `lateRenewal = true` sai nghĩa; catalog sửa `renewalDate` sau
  khi ghi làm đổi giá trị đã báo. Sửa: chỉ tính cho ca `deciderRole = IT_ADMIN_IN_CHARGE`, ca cũ trả `false`; hoặc lưu cờ vào audit và đọc từ đó.

## 3. Nit

- **A1C-11 Nit** — `record/renewal-record.service.ts:131-135`: kiểm `ALREADY_PROPOSED` sau số đếm (đúng thứ tự §4.4 bước 6→7), nên kỳ đã ghi mà số
  đếm đổi trả `QUANTITY_NOT_SEATS_NEEDED` thay vì "đã ghi". FE đọc `recordedRenewalId` trước nên ít gặp; cân nhắc đưa bước 7 lên trước bước 6.
- **A1C-12 Nit** — `subscription-renewal-parties.service.ts:93` còn câu "the one who confirms must be able to read" (bước xác nhận đã gỡ).

## 4. Kiểm theo 5 trục (phần đúng, có bằng chứng)

**Nghiệp vụ.**
- Công thức `heldPastRenewal`: `LEAST(valid_until - 1, expected_end_date) > renewalOn`, loại ghế có thu hồi đang chạy
  (`subscription-renewal-seat.repo.ts:96-110`) — ghế kết thúc **đúng** ngày gia hạn không tính (R2-2 phía đếm); `carriedPast` cùng luật
  (`outcome/renewal-outcome.policy.ts:74-93`, `renewal-outcome.service.ts:235`). Không seat đệm (`targetOf` chỉ nâng lên `vendorMinimumSeats`,
  `renewal-seats-needed.policy.ts:36-37`). Thiếu sót duy nhất: A1C-01.
- Ghi đúng số: `choiceProblem` buộc `quantity = target`, vượt số cần chỉ khi mức tối thiểu NCC kèm `note` (`renewal-seats-needed.policy.ts:74-80`).
- Hủy: `target = 0 && activeSeatsToday = 0 && openRequests = 0` (`:55-61`); `activeSeatsToday` = `notEndedBy(today)` (R2-4,
  `seat.repo.ts:109` khớp `:52`); trạng thái cuối của Request = `DRAFT + ENDED_STATES` (R2-10, `access-request.repo.ts:370-372`, unit ghim danh sách).
- Một ca sống mỗi kỳ: index `(subscription_id, notice_base_date) WHERE state <> 'STALE'` + `existingCaseOf` chặn ca `DECIDED` cũ (R2-1).
- Không trưởng phòng/Người duyệt chi: route `decision` gỡ (404, http-spec), quyết định tự ghi `IT_ADMIN_IN_CHARGE`; Người duyệt chi chỉ nhận sự cố.
- Finance được báo `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED` trong transaction ghi (`record/renewal-record-trail.service.ts:70-95`), + IT phụ trách khi
  ghi thay (`QĐ-58b`).

**Đúng đắn.**
- Một transaction: `lockPeriod` (FOR UPDATE dòng thuê bao) → đếm → insert → decision → lõi kết quả → audit → thông báo
  (`renewal-record.service.ts:75-106`). Hai IT ghi cùng lúc tuần tự hóa qua khóa; người sau nhận `NOT_RENEWABLE/ALREADY_CONTINUED` hoặc
  `ALREADY_PROPOSED`, index là chốt cuối (`:166`); integration race ghim `[201, 409]` + 1 dòng kỳ mới + 1 ca.
- Ghi điều chỉnh vs cấp seat đồng thời (T4c): cả hai khóa **dòng thuê bao cũ** trước (`lockPeriod` / `lockSeatTarget` trong grant writer), cùng thứ
  tự, không deadlock; cấp trước ⟹ được đếm; cấp sau ⟹ `carryToNextPeriod` đọc `renewedById` đã commit, mang ghế, kỳ kế đầy thì `addPoolSeat` sau
  SAVEPOINT (`assignment-carry.repo.ts` `carryBehindSavepoint`), kỳ kế của phòng giữ 422 `NEXT_PERIOD_SEATS`.
- INV-01: không vật chất hóa seat; T4c chỉ tăng `purchased_quantity` qua `addPoolSeat`. Tiền: `PRICE_NOT_VND` do catalog. Ngày: `businessToday(now, tx)`.
- Không 500 ở đường chính: mọi từ chối là `RenewalError` có ánh xạ (`subscription-renewal.http-errors.ts:9-66`); `throw new Error` chỉ ở ca chưa cài đặt.

**Kiến trúc.** licensing → catalog qua `catalog/public/*`; licensing → requests qua `RenewalHoldHook` (hook đã có, thêm method); câu `count`
nằm ở repo `requests/access-request` (listener không SQL); SQL của seat repo chỉ chạm bảng licensing. Thư mục capability `record/`,
`seats-needed/` đúng `ARCHITECTURE.md`.

**Migration và quyền.**
- `110000` chỉ `ADD VALUE` (DB-05); `110100` CHECK so `::text`, dữ liệu cũ (RENEW null, REDUCE có số, CANCEL null) thỏa CHECK mới; index cũ ≤ 1 ca
  sống/thuê bao nên index mới chắc chắn tạo được; `PROPOSED → STALE` được trigger cho phép và thỏa `decision_whole`; `110200` theo tiền lệ
  `20261108500000`, `GREATEST(now, valid_from)` thỏa `parameter_values_period_check (>=)`, chạy lại vô hại. Thứ tự `110000 < 110100 < 110200`,
  > A2 `100000`, < C `120000`. Không bảng mới, không grant cột riêng ⟹ H7 không đổi.
- Route: ghi `@RequireRoles('IT_ADMIN')`; `adjustment` IT Admin + Finance, khai báo trước `:id` (R2-5, http-spec ghim 200 + `caseGet` không gọi);
  `deadline-events` thêm Finance. Mọi IT Admin ghi được (spec S20-2/`QĐ-58b`, khác chữ "chỉ IT phụ trách" của brief — spec thắng, audit
  `substitute`).

**Test.**
- Không thấy nới assertion ở vùng này ngoài A1C-09; race đổi kỳ vọng từ `NOT_AWAITING_OUTCOME` sang `ALREADY_PROPOSED|NOT_RENEWABLE` là đúng luồng mới.
- Test bị xóa (`subscription-renewal-decision`, `-owner-confirmation`, spec policy `proposal`/`decision`) chỉ phủ luồng CONFIRM đã gỡ — hợp lý (D-20).
- Mutation bị bắt: bỏ `openRequests`/`activeSeatsToday` khỏi `cancelProblem` (unit `:56,:62`); đổi `>` thành `>=` ở `heldPastRenewal` hoặc bỏ
  `endingBy` (integration R2-2 `:189-213` ⟹ 409); bỏ nhánh `DECIDED` của `existingCaseOf` (integration R2-1 `:326`); bỏ `addPoolSeat` hoặc điều
  kiện `ownerDepartmentId` ở T4c (`shared-pool-next-period` hai ca). **Không** bắt: A1C-01 (test chèn trạng thái giả), A1C-04, A1C-05.

## 5. Rà `D-n` của A1-DONE trong vùng

D-3, D-4, D-5, D-6, D-7, D-8, D-9, D-10, D-11, D-12, D-13, D-19, D-20: đồng ý, trừ — D-9 xem A1C-05; D-11 xem A1C-10; D-12 (422 thay 409) đúng code thật,
chỉ là brief ghi sai. Ghi chú thêm: §9 của spec giả định `endingAmong` "đang đóng" thuê bao — sai, xem A1C-02.
