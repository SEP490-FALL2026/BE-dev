# AUDIT-A1-fix-verify — verify FIX đợt 2 của SBF-20 (17/11/2026)

> Reviewer chỉ đọc. Repo `Code/be-p5-a1`, nhánh `feat/p5-a1-sbf20`, phạm vi `41c34c05..2846f91d` (10 commit). Mọi trích dẫn file:dòng ở
> `2846f91d`, đọc bằng `git show`/`git diff`. Không sửa, không checkout/stash/reset, không chạy pnpm/jest/docker.
> CI: `gh run view 44028374679` (chỉ đọc) ⟹ `headSha = 2846f91d`, mọi job `success`, Deploy `skipped`.

**Skill đã đọc/dùng**
- `agent-skills:code-review-and-quality` (process + review): khung 5 trục, phân mức Critical/Required/Optional/Nit, mỗi finding kèm cách sửa.
- `superpowers:verification-before-completion` (verification): mỗi kết luận ĐẠT/CHƯA và mỗi finding mới dựa trên dòng code đã đọc ở `2846f91d`.
  Không tự chạy test. Các ca "test có còn đỏ khi bỏ fix không" là suy luận từ code, không phải kết quả đã chạy.
- Mapping: không có skill riêng cho "verify FIX nghiệp vụ"; dùng `code-review-and-quality` cho cả process lẫn domain review.

**Nguồn đối chiếu:** `AUDIT-A1-core-review.md`, `AUDIT-A1-sweep-review.md`, `A1-DONE.md` mục "FIX ĐỢT 2", `SPEC-5A-SBF20.md` §4.2–§4.5, §5, §8;
`SBF-20` v3.1; sổ QĐ (`QĐ-103e`, `QĐ-103q`, `QĐ-104d`, `QĐ-106i`, `QĐ-110m`, `QĐ-110v`).

## 0. Kết luận

**Chưa merge được vào `feat/p5`.**
- 10/10 finding cần verify đã sửa đúng gốc.
- FIX sinh hoặc để sót **3 Required mới** (V-1, V-2, V-3), 0 Critical:
  - V-1 là lỗi hồi quy do R-1: lưới ngày thanh toán tính cả `startDate`.
  - V-2 là phần sót của A1C-03: `CANCEL` có kết quả khác `AS_DECIDED`.
  - V-3 là D-22 lệch spec R2-1. Owner có thể duyệt D-22 và hạ V-3 xuống Optional.
- Sửa V-1 và V-2 hết khoảng 1 giờ, mỗi cái kèm test.

## 1. Bảng finding → commit → kết quả

| Finding | Commit | Kết quả | Bằng chứng (`2846f91d`) | Test đỏ-trước / dựng bằng luồng thật |
| --- | --- | --- | --- | --- |
| A1C-01 `approvedAwaitingGrant` = 0 với kho K2 | `9de0533e` | **ĐẠT** | Hook `RenewalHold.approvedAwaitingGrantOfPlan` (`licensing/public/licensing.extension-points.ts:162`) cài ở `renewal-hold.listener.ts:42`, gọi repo `access-request.repo.ts:380` (GRANT/SERVICE_ACCOUNT `AWAITING_EXECUTION` + dòng `APPROVED` của `GROUP_GRANT`, khớp `grant-queue.repo.ts:119,135`). Licensing chỉ gọi hook (`renewal-seats-needed.service.ts:42`), không SQL chéo bảng requests. Câu `awaitingGrant` cũ đã xóa khỏi `subscription-renewal-seat.repo.ts`. | Có. Ca chèn tay `subscription_id NULL` đã xóa. 4 ca mới đi qua route thật: head → sendOn → spend (`seats-needed.integration-spec.ts:225`). Khi IT cấp (`:268`) thì `approvedAwaitingGrant` 1→0 và `heldPastRenewal` 0→1, không đếm hai lần. Request tiếp tục chỉ nằm ở `pendingContinuations`. `GROUP_GRANT` chỉ có unit test. |
| A1C-02 CANCEL xong thuê bao vẫn sống | `1c51a459` | **ĐẠT** (kèm V-3, V-4, V-5) | Ghi: `renewal-record.service.ts:125` → `renewal-record.policy.ts:35` (`CANCELLED`). GET adjustment: `subscription-renewal-view.service.ts:101`. Sweep bỏ qua cả thuê bao: `subscription-renewal-sweep.service.ts:81,105`. Đường cấp: `shared-pool.service.ts:61,82,125` + `provisioning-grant-writer.service.ts:282`. Định nghĩa dùng chung: `shared-pool-capacity.repo.ts:18`. | Có. `subscription-renewal-cancelled.integration-spec.ts` có 5 ca đi qua route thật. Sau R-1, ca sweep (`:76-85`) không còn ghim fix (V-4). Unit sweep `:192` vẫn ghim. |
| A1C-03 ngõ cụt khi không có kỳ mới | `d0b02e0c` | **ĐẠT** theo phương án A cho RENEW/REDUCE/INCREASE (sót CANCEL, xem V-2) | DTO bỏ `UNCONFIRMED` (`subscription-renewal.dto.ts:62,76`). `nextPeriodProblem` ở `renewal-record.policy.ts:144-154` được gọi tại `renewal-record.service.ts:145`, trả 422 `NEXT_PERIOD_REQUIRED` (http-errors). Route legacy `/outcome` vẫn nhận `UNCONFIRMED`. | Có. Unit (policy spec) + http-spec 422. Integration `record.integration-spec.ts:145,174` (năm: 3 outcome đều 422, không ghi dòng nào; tháng `VENDOR_REFUSED` ⟹ 201). |
| A1C-04 `nextPeriod.startDate` không ràng | `e65fec67` | **ĐẠT** | `nextStartProblem` (`renewal-record.policy.ts:162`): năm nhận `end` hoặc `end+1`, tháng nhận `end`; gọi tại `renewal-record.service.ts:152`; trả 409 `PERIOD_REFUSED` `{reason: NOT_ON_RENEWAL_DAY, renewalOn}`. | Có. Unit 4 nhóm biên. Integration `record.integration-spec.ts:203`: ngày +1/63/66 ⟹ 409, không thêm dòng `subscriptions`/`subscription_renewals`, không mở thu hồi; ngày 64 ⟹ 201. |
| R-1 gói tháng không có `renewalDate` | `56856684` | **ĐẠT** ca của finding (kèm **V-1** do chính fix gây ra) | `firstGridOffsetFrom` ở `src/core/fiscal-year.ts:33`; `monthly()` ở `subscription-obligation.policy.ts:198-202`. | Có. Unit `subscription-obligation-payment-day.policy.spec.ts` và `fiscal-year.spec.ts`, integration sweep. Thiếu ca `startDate` rơi đúng lưới (V-1). |
| R-2 flow phụ thuộc lịch | `157662f7` | **ĐẠT** | `mf5-rightsizing-edges.flow-spec.ts:170`: đặt `renewal_date = hôm nay + 20` và `end_date = NULL`, rồi khẳng định `deadline` và `point = deadline − 7`. | Chỉ có số liệu do A1 báo (đồng hồ giả 26/12: bản cũ 1/7, bản mới 7/7), reviewer không chạy lại. Theo code thì hạn chót luôn là hôm nay + 20 vì `startDate` của Jira ở quá khứ. |
| O-2 một thuê bao lỗi dừng cả lượt quét | `ddf1fd03` | **ĐẠT** | `try/catch` theo từng thuê bao, đếm `failed` và log id + `describeForOperator` (`subscription-renewal-sweep.service.ts:83-97`); job `warn` khi `failed > 0` (`subscription-renewal.job.ts:49`); thêm vào `security-jobs.md`. | Có. Unit `sweep.service.spec.ts:215`: thuê bao 2 vẫn được báo, log không lộ email. |
| O-7 khôi phục integration định tuyến | `3f89fe76` | **ĐẠT** | `subscription-renewal-sweep-routing.integration-spec.ts:39-116` có 3 ca: IT phụ trách thuê bao, khóa/nghỉ thì rơi về IT phòng, kho không phòng. `:118-176`: hạn chót suy ra từ `noticePeriodDays`, kiểm cả điểm, đỏ và eventKey. | Dựng bằng route và sweep thật; thay đổi người phụ trách và trạng thái khóa bằng SQL. |
| A1C-05 (Opt) sự cố khi mua nhiều hơn số đếm | `b3fb3797` | **ĐẠT** | `unintendedRenewalOf` (`renewal-record.policy.ts:196-206`): mọi lựa chọn khác CANCEL có `nextQuantity > quantity` ⟹ sự cố. | Có. Integration `record.integration-spec.ts:283` ghim đủ tập người nhận {Người duyệt chi, IT, Finance}. |
| A1C-06 (Opt) T4c mang/mua ghế hết đúng ngày gia hạn | `2846f91d` | **ĐẠT** (kèm V-6) | `assignment.service.ts:422` dùng `carriedPast` (chuyển sang `assignment.policy.ts:151`); chỉ áp cho kho. | Có. 2 ca integration `shared-pool-next-period.integration-spec.ts:345,356`. |

**Hồi quy theo câu hỏi của điều phối**
- **R-1, cờ *kỳ chưa có hóa đơn*: không đổi hành vi.**
  - Bản cũ bắt đầu từ `at = 0`, lùi khi `grid(at−1) ≥ from`, rồi tiến khi `grid(at) < from`.
  - Bản mới bắt đầu từ `floor(Δtháng / step)` rồi chạy hai vòng lặp y như cũ.
  - `addMonths(anchor, k·step)` tăng ngặt theo `k`, nên cả hai bản đều trả **k nhỏ nhất có `grid(k) ≥ from`**. Kết quả trùng nhau; bản mới chỉ ít vòng lặp hơn.
  - Neo vẫn là `renewalDate ?? endDate ?? startDate` (`purchase-invoice-missing-periods.policy.ts:105,108`).
- **A1C-02, có hỏng thu hồi, báo cáo chi phí hay danh sách kho không:**
  - Thu hồi không đọc `grantableOf` nên không đổi.
  - Chi phí tránh được (`recordAvoided`) đọc theo task nên không đổi.
  - Danh sách kho (`grant-queue` → `stockOfPlans`) không còn đếm seat Trống của thuê bao đã hủy. Đây là hành vi đúng: hủy chỉ được khi `activeSeatsToday = 0`.
  - Còn hai chỗ đọc catalog chưa lọc (V-5, Optional).
- **A1C-03: 422 `NEXT_PERIOD_REQUIRED` đã có trong http-errors, OpenAPI và example.** `UNCONFIRMED` gửi tới route ghi một lần ⟹ 422 `VALIDATION_ERROR`; route legacy vẫn nhận. Phần sót: V-2.
- **A1C-04: 409 `PERIOD_REFUSED` tái dùng mã có sẵn.** `details.reason` là chuỗi tự do (D-24) và đã ghi trong mô tả 409 của OpenAPI. Không thấy lỗi mới.

## 2. Finding mới

### V-1 — Required — R-1 tính cả `startDate` là một ngày thanh toán, nên kỳ mới vừa ghi và thuê bao vừa khai mở ngay điểm điều chỉnh

**Chỗ:** `src/modules/catalog/subscription/obligation/subscription-obligation.policy.ts:201-202`
```ts
const from = input.startDate !== null && input.startDate > today ? input.startDate : today;
const next = addMonths(stored, firstGridOffsetFrom(stored, 1, from));   // ngày lưới đầu tiên >= from
```
Khi `startDate` nằm đúng trên lưới của `renewalDate ?? endDate` (hình dạng chuẩn: `startDate = P`, `renewalDate = P + 1 tháng`, như ví dụ body ở spec §5)
và `startDate ≥ today`, thì `next = startDate`. Ngày bắt đầu kỳ là ngày mua, không phải ngày gia hạn. Bản cũ chỉ cuộn tới từ `stored`, nên ra
`P + 1 tháng` và không bị lỗi này. Lỗi do chính FIX gây ra; ca unit "never counts a payment day from before the plan starts"
(`subscription-obligation-payment-day.policy.spec.ts:38`) dùng `startDate` lệch lưới (2/12 với lưới ngày 20) nên không bắt được.

**Kịch bản 1 (đường chính, mọi lần ghi gói tháng có kỳ mới):**
1. Gói tháng kho, ngày thanh toán P = 01/12. Ngày 25/11 IT ghi `REDUCE 8` + `AS_DECIDED`, `nextPeriod { startDate: 01/12, renewalDate: 01/01 }`.
   `startDate = 01/12` là bắt buộc theo A1C-04.
2. Dòng mới ở trạng thái `ACTIVE`, `renewedById = null`, `K2` (`subscription-period.service.ts:225`), nên nằm trong danh sách quét
   (`subscription-period.repo.ts:15`).
3. Với dòng mới: `from = startDate = 01/12`, nên `deadline = 01/12` và `point = 24/11 ≤ hôm nay`.
4. Lượt quét kế tiếp gửi `SUBSCRIPTION_RENEWAL_ALERT` cho IT ("kỳ sau cần N seat", hạn 01/12) về **kỳ vừa ghi xong**
   (`renewal-adjustment-alerts.policy.ts:36`). eventKey theo id dòng mới nên không bị khử trùng với dòng cũ.
5. Huy hiệu `expiry` và `alerts.dates` của dòng mới hiện điểm đã mở. `GET adjustment` cho phép ghi.
6. Nếu IT ghi lần nữa, `nextPeriod.startDate` phải bằng 01/12, nhưng catalog từ chối `STARTS_TOO_EARLY`
   (`subscription-period.service.ts:200`) ⟹ 409 `PERIOD_REFUSED`. Điểm điều chỉnh mở mà không ghi được.

**Kịch bản 2:**
- Gói tháng kho mới khai hôm nay, `startDate = hôm nay`, `renewalDate = hôm nay + 1 tháng`, 10 seat, chưa ai giữ ⟹ `deadline = hôm nay`.
- Ngày đầu tiên đã nhận ALERT và cả `SUBSCRIPTION_RENEWAL_KEPT` "giữ nguyên 10 seat" (`:38`, 10 > target 0).
- Khai trước ngày bắt đầu thì nhận ALERT từ 7 ngày trước khi kỳ bắt đầu.

**Cách sửa (1 dòng):** ngày thanh toán phải **sau** ngày bắt đầu kỳ.
```ts
const from = input.startDate !== null && input.startDate >= today ? addDays(input.startDate, 1) : today;
```
Cờ hóa đơn giữ `≥ startDate`, vì kỳ đầu cũng là một kỳ phải trả; không đổi `subscriptionPaymentPeriods`.
Sửa luôn chú thích D-25 thành "cận dưới **ngặt**".

**Test:**
- Unit: `monthly({ startDate: '2026-12-15', renewalDate: '2027-01-15', endDate: null })` với today = 10/12 và today = 15/12 ⟹ `deadline = 2027-01-15`.
- Integration: ghi `REDUCE` gói tháng có `nextPeriod` ⟹ `sweepOn(hôm nay)` không có `SUBSCRIPTION_RENEWAL_ALERT` với `subject_id` của dòng mới,
  và `GET adjustment` của dòng mới có `adjustmentPointOn > hôm nay`.
- Mutation `>=` → `>` hoặc bỏ `addDays` ⟹ ca đỏ.

### V-2 — Required — `CANCEL` có kết quả `VENDOR_REFUSED`/`DIFFERENT` mà không có `nextPeriod`: vẫn ngõ cụt với gói năm và không báo sự cố

**Chỗ:** `renewal-record.policy.ts:150` (`input.choice === 'CANCEL'` ⟹ không bắt `nextPeriod`); `unintendedRenewalOf` `:203`
(`nextQuantity === null` ⟹ không có sự cố).

**Kịch bản:**
1. Gói năm kho đã về 0 ghế, không còn Request mở. IT ghi `CANCEL` + `VENDOR_REFUSED` ("NCC không cho hủy, đã tự gia hạn") và bỏ trống `nextPeriod`
   ⟹ 201 `OUTCOME_RECORDED`.
2. Hệ quả:
   - Ca có `outcome ≠ AS_DECIDED` nên không thuộc `endingAmong`; thuê bao vẫn "sống".
   - Kỳ mới không bao giờ ghi được: lần ghi sau gặp 409 `ALREADY_PROPOSED` (cùng `deadline`).
   - Sweep thấy `hasCase` nên không cảnh báo đỏ, không `EXPIRY_MARKED`, không sự cố.
   - **Không ai được báo sự cố**, trái `QĐ-106i`(4): "IT đã ghi giảm/**hủy** mà nhà cung cấp vẫn tự gia hạn ⟹ báo ngay Người duyệt chi, IT phụ trách,
     Finance".
3. Gói tháng cùng ca thì không ngõ cụt nhưng cũng mất sự cố.
4. Đây đúng là lớp lỗi của A1C-03 (Required). D-23 viết "gói năm giờ luôn nối kỳ", điều này sai với ca CANCEL.

**Cách sửa:**
- `nextPeriodProblem`: lựa chọn `CANCEL` chỉ được thiếu `nextPeriod` khi `outcome = AS_DECIDED`. `CANCEL` + `VENDOR_REFUSED` ⟹ 422
  `NEXT_PERIOD_REQUIRED` cho cả hai loại kỳ (NCC đã tự gia hạn nên có kỳ mới để ghi). Sự cố sẽ phát qua nhánh `choice === 'CANCEL'` có sẵn.
- `CANCEL` + `DIFFERENT` không có kỳ mới (NCC đóng theo cách khác): đề xuất cũng bắt `nextPeriod` với gói năm. Nếu Owner muốn cho phép thì cần một
  câu trả lời rõ, vì hiện ca này để thuê bao ở trạng thái "đang sống" mãi.

**Test:**
- Unit `nextPeriodProblem` cho `CANCEL` × {`VENDOR_REFUSED`, `DIFFERENT`} × {`MONTHLY`, `ANNUAL`}.
- Integration: `CANCEL` + `VENDOR_REFUSED` gói năm không `nextPeriod` ⟹ 422, không ghi dòng nào. Có `nextPeriod` ⟹ 201 và sự cố tới đủ 3 người.

### V-3 — Required (hoặc Owner duyệt D-22 thì hạ Optional) — ca `DECIDED CANCEL` cũ nay trả `NOT_RENEWABLE/CANCELLED` thay vì `ALREADY_PROPOSED {renewalId}`

**Chỗ:** `renewal-record.service.ts:125` kiểm `ending` trong `preflightOf`, trước `existingCaseOf` (`:143`). `endingAmongOf`
(`shared-pool-capacity.repo.ts:18`) tính cả ca `state = DECIDED`, `decidedChoice = CANCEL`.

**Lệch:** spec §4.4 bước 7 (R2-1) quy định thuê bao còn ca `DECIDED` cũ ⟹ 409 `ALREADY_PROPOSED` `details.renewalId`, để IT biết phải ghi
`/outcome` cho ca đó trước. D-22 đổi riêng ca `DECIDED CANCEL` thành `CANCELLED`, không có `renewalId`. GET adjustment cũng trả 409. Sweep vẫn
bỏ qua như trước.

**Ảnh hưởng:** chỉ dữ liệu trước deploy, và A1-DONE §5 dự kiến seed lại VPS ⟹ rủi ro thấp. Nhưng đây là lệch spec có chủ ý và chưa được Owner duyệt.

**Cách sửa:**
- (a) Trong `check`/`adjustmentOf`: nếu `ending` và thuê bao có ca `DECIDED` ⟹ ném `ALREADY_PROPOSED { renewalId }` trước.
- (b) Hoặc Owner duyệt D-22 như đang có.

**Test:** integration chèn ca `DECIDED CANCEL` cũ ⟹ POST và GET đều 409 `ALREADY_PROPOSED` với `details.renewalId`.

### V-4 — Optional — Ca sweep của A1C-02 không còn ghim fix sau R-1

**Chỗ:** `test/integration/licensing/subscription-renewal-cancelled.integration-spec.ts:76-85`.

**Vì sao:**
- Catalog tính `adjustment` theo ngày thật (`businessToday(new Date())`, O-1 còn mở).
- Sau R-1, `renewal_date = hôm nay + 5 + 1 tháng` cuộn **lùi** về hôm nay + 5, đúng `deadline` của ca đã ghi.
- Vì vậy `hasCase = true` và sweep im lặng **kể cả khi bỏ** dòng `world.ending.has` (`sweep.service.ts:105`).
- Hành vi vẫn được ghim ở unit (`sweep.service.spec.ts:192`) và ở hai route (ca 2).

**Cách sửa:** đặt `renewal_date = hôm nay + 12` (lệch lưới của ca cũ) rồi `sweepOn(hôm nay + 5)`. Không có fix thì có ALERT, có fix thì 0.
Hoặc sửa O-1 (truyền ngày của sweep xuống catalog).

### V-5 — Optional — Hai chỗ đọc thuê bao "cấp được" chưa loại thuê bao đã hủy

**Chỗ:**
- `requests/purchase-invoice/purchase-invoice-plan.service.ts:187` (`poolSubscriptionOfPlan`): hóa đơn của Request K2 ghi vào thuê bao kho đã hủy.
- `requests/spend-approval-view/spend-approval-snapshot.service.ts:108` (`annualVendorAmountOf`): gói chỉ còn thuê bao đã hủy vẫn bị coi là
  "đã có kho", nên Người duyệt chi không thấy *tiền trả NCC cả năm* (`QĐ-104d`(1)).

**Ngoài ra:** đã ghi CANCEL thì không có đường "hủy việc hủy". Cả hai đều hết khi làm 4b-4 (catalog ghi *đã đóng*).

**Cách sửa:** tạm thời qua facade licensing `grantableOf`, hoặc ghi vào nợ 4b-4 trong A1-DONE.

### V-6 — Optional — A1C-06 lệch một ngày khi kỳ năm mới bắt đầu `end + 1`

**Chỗ:** `assignment.service.ts:422` dùng `carriedPast(carried, startDate)`.

**Vì sao:**
- A1C-04 cho gói năm nhận `startDate = end + 1` (khai theo `endDate`).
- Số đếm (`renewalOn = end`) **tính** ghế có ngày cuối = `end + 1`, nhưng T4c lại **không** mang và không mua seat cho ghế đó ở kỳ kế.
- Kết quả: ghế cấp sau điểm, hết đúng ngày đầu kỳ mới, thì ngày đó không có seat ở kỳ mới.
- Hiếm; với kỳ khai theo `renewalDate` (`startDate = end`) thì đúng.

**Cách sửa:** truyền ngày gia hạn của kỳ cũ (`renewalDate ?? endDate` của thuê bao đang cấp) làm `endingBy` thay `startDate`.

### V-7 — Nit

- **D-21 vẫn đếm Request `SERVICE_ACCOUNT`** (`access-request.repo.ts:384`). `QĐ-110m` đã bỏ loại này, nên chỉ còn ảnh hưởng dòng cũ. Vô hại;
  có thể gỡ khi dọn `QĐ-110m`. Nhánh `GROUP_GRANT` chỉ có unit test, chưa có integration.
- **Ca sweep "tells nothing once the IT Admin has recorded the period"** (`sweep.integration-spec.ts`) nay ghi kèm `nextPeriod`, nên dòng cũ đã nối
  kỳ và rơi khỏi danh sách quét. Ca này không còn chạm nhánh `hasCase` của gói năm. Nhánh đó chỉ còn được phủ ở unit
  (`renewal-adjustment-alerts.policy.spec`).

## 3. D-21…D-27

| D | Kết luận | Ghi chú |
| --- | --- | --- |
| D-21 | Đúng `QĐ-103e`/`QĐ-103q`/`QĐ-104d` ("+ Request đã duyệt chờ cấp") | Nit V-7 |
| D-22 | **Lệch spec §4.4 bước 7 (R2-1)** ở ca `DECIDED CANCEL` cũ | V-3: Required nếu Owner không duyệt |
| D-23 | Đúng phương án A của A1C-03 (audit ghi "cần Owner chốt"); đổi chữ spec §5 body và §8.9 | Cần Owner duyệt. Câu "gói năm giờ luôn nối kỳ" sai với ca CANCEL (V-2) |
| D-24 | Đúng; mã có sẵn, `details.reason` đã ghi trong OpenAPI | — |
| D-25 | Đúng spec §4.2: neo `renewalDate ?? endDate`; chỉ có `startDate` ⟹ `NO_ALERT_ANCHOR` | Cận dưới phải **ngặt** (`> startDate`), xem V-1. Lệch có chủ ý với cờ hóa đơn (vẫn neo `startDate`) là chấp nhận được |
| D-26 | Đúng `QĐ-106i`(2) (ngày thanh toán kế tiếp) | — |
| D-27 | Đúng phạm vi brief | V-6 (Optional) |

## 4. Việc cần làm để merge

1. **V-1:** sửa `monthly()` thành cận dưới ngặt, kèm unit và integration (kỳ mới vừa ghi không bị ALERT).
2. **V-2:** `CANCEL` + `outcome ≠ AS_DECIDED` ⟹ bắt `nextPeriod`, kèm unit và integration (sự cố tới đủ 3 người).
3. **V-3:** sửa thứ tự lỗi, **hoặc** Owner duyệt D-22.
4. Optional V-4…V-7 đưa vào FIX-TEST/4b. Sau khi sửa: CI đầy đủ trên commit cuối.
