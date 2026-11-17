# AUDIT B — Phase E (lỗi) — review chỉ đọc

- Repo `Code/be-p5-b`, nhánh `feat/p5-b-messages`, HEAD `3d76752b`. Phạm vi: 10 commit `89a9e64f`…`3d76752b` (E2a/E2b, E3a/b/c, E8a i–iii, E8b i–iii).
- Cách đọc: `git show`, `git diff 5993bf39 3d76752b`, `git grep` ở `3d76752b`. Không sửa, không checkout, không chạy pnpm/jest/docker. CI run 44005266892 xanh (theo đề bài, không kiểm lại).
- Đối chiếu: `SPEC-5B-MESSAGES.md` Phần B (B0–B6), C, D2/D3; `B-DONE.md` (D-E*); `catalog/errors.md` (FE).

## Skill đã đọc / dùng

| Skill | Vai trò | Mục đích |
| --- | --- | --- |
| `agent-skills:code-review-and-quality` | process + review | review 5 trục, nhãn Critical/Required/Optional/Nit |
| `superpowers:verification-before-completion` | verification | mọi kết luận có dòng code thật làm chứng; không tuyên bố "xanh" ngoài CI đã cho |

## Kết luận nhanh

- **Không đổi status, không đổi tên mã, không xóa mã** ở logic: diff `HttpStatus.` của Phase E chỉ là tái cấu trúc `refuse(...)` → `new ApiException(...)` cùng status (B6.4 đạt).
- `assignmentExpiryStartRevocation` 409 ⟹ 403: **chỉ sửa mô tả**. Ví dụ `PROVISIONING.ANOTHER_IT_ADMIN_NEEDED` đã nằm ở khối 403 và manifest đã ghi `'403'` từ trước (`5993bf39:test/support/openapi-example-route-codes-licensing.ts:13-14`); code trả 403 (`provisioning.http-errors.ts:169-170`, `expiry.http-errors.ts:33`). Khớp hành vi, không đổi contract.
- 15 mã B3: đúng tên field, vắng thì vắng hẳn (không `null`), status giữ; mapper spec bắt được việc bỏ `details` (riêng `SEAT_MONTHS_NOT_READY` bắt bằng integration).
- `RENEWAL_REQUEST.ALREADY_REQUESTED` / `RETURN_REQUEST.RENEWAL_PENDING` đổi truy vấn `hasOpenFor`/`hasPendingRenewal` sang `pendingOf`/`pendingRenewalsOf`: cùng bộ lọc `ENDED_STATES` (`renewal-request.repo.ts:45-72`, `renewal-hold.listener.ts:26-32`) ⟹ không đổi logic.
- OpenAPI: không có mã `QĐ-` trong `openapi.json` (đếm = 0). Mẫu kiểm các mã E8a đã khai đều có nơi ném thật qua route (xem §Đã kiểm).
- **Hỏng:** `details.path` sai ở 2 nhóm nơi gọi có object tiền lồng trong body (R-1, R-2). Đây chính là điều B2 yêu cầu ("đúng đường dẫn field của body thật cho mọi nơi gọi").

**Phase E: CHƯA đạt — còn 2 Required (R-1, R-2).** Cả hai sửa nhỏ, cục bộ, không đổi status/mã.

---

## Required

### R-1 — `details.path` của lỗi tiền ở quote thẩm định thiếu tiền tố `quote.` / `spend.quote.`

- **Mức:** Required.
- **Vị trí (`3d76752b`):**
  - `src/modules/requests/assessment/quote.service.ts:27-32`: `parseMoney(input.unitPrice, 'unitPrice')`, `MoneyOutOfRangeError('unitPrice')`, `'originalPrice'`.
  - Ví dụ OpenAPI `src/modules/requests/assessment/assessment.http-errors.ts:186-188`.
  - Test chốt cái sai: `src/modules/requests/assessment/quote.service.spec.ts:58` (`path: 'unitPrice'`).
- **Căn cứ:**
  - Body thật: `assessmentPatchSchema.quote` (`assessment.dto.ts:119`) ⟹ `accessRequestAssessmentSave` có đường dẫn `quote.unitPrice` / `quote.originalPrice`.
  - `internalRegistrationBodySchema.spend.quote` (`assessment.dto.ts:198`, gọi qua `internal-registration.service.ts:59` → `assessment-pricing.service.ts:70`) ⟹ `accessRequestInternalRegister` có `spend.quote.unitPrice`.
  - `moneyInput` (`assessment.dto.ts:76`) chỉ kiểm `max(40)` và currency, nên chuỗi hỏng, sai số lẻ và âm đều tới `parseMoney`.
- **Kịch bản lỗi:** IT Admin lưu thẩm định với `quote.unitPrice = { amount: "1.5", currency: "VND" }`. BE trả `MONEY_SCALE_EXCEEDED { allowedDecimals: 0, path: "unitPrice" }`. Chuỗi hỏng trả `issues[0].path = "unitPrice.amount"`. Cả hai đều trỏ vào field không có trong form ⟹ FE không gắn lỗi vào ô giá. Kết quả trái mục tiêu B2, và trái quy ước `issues[].path` của `zod-validation.pipe.ts:13` (`issue.path.join('.')` ⟹ `quote.unitPrice.amount`).
- **Cách sửa:**
  - `QuoteService.read(input, at: string)`; dùng `${at}.unitPrice` / `${at}.originalPrice` ở `parseMoney` và `MoneyOutOfRangeError`.
  - `assessment-patch.service.ts:30` truyền `'quote'`; `assessment-pricing.service.ts:70` truyền `'spend.quote'`.
  - Sửa ví dụ `ASSESSMENT_ERROR_EXAMPLES` thành `quote.unitPrice` / `quote.originalPrice`.
- **Test:**
  - Sửa `quote.service.spec.ts:58-63` theo tham số `at`.
  - Thêm một integration/http cho `accessRequestAssessmentSave` (`quote.unitPrice.amount = "1.5"` VND ⟹ 422 `{ allowedDecimals: 0, path: "quote.unitPrice" }`; `"abc"` ⟹ `issues[0].path = "quote.unitPrice.amount"`).
  - Thêm một ca cho `accessRequestInternalRegister` ⟹ `spend.quote.unitPrice`.

### R-2 — `details.path` của giá kỳ mới khi ghi kết quả gia hạn là `unitPrice`, body thật là `nextPeriod.unitPrice`

- **Mức:** Required.
- **Vị trí (`3d76752b`):**
  - `src/modules/catalog/subscription/subscription-pricing.service.ts:26-27` (path cứng `'unitPrice'`), được gọi từ `subscription-period.service.ts:190` (`recordNext`).
  - Đường gọi: `subscription-period.api.ts:62-63` ← `licensing/subscription-renewal/outcome/renewal-outcome.service.ts:187`.
  - Ví dụ OpenAPI `src/modules/licensing/subscription-renewal/subscription-renewal.http-errors.ts:122-123` (`'unitPrice'`), dùng ở `subscription-renewals.controller.ts:257-258` (`subscriptionRenewalRecordOutcome`).
- **Căn cứ:** `recordOutcomeBodySchema.nextPeriod` (`subscription-renewal.dto.ts:63-67`) chứa `unitPrice: money` (`:47-49`). Đường dẫn đúng là `nextPeriod.unitPrice`.
- **Kịch bản lỗi:** IT Admin ghi `VENDOR_RENEWED` với `nextPeriod.unitPrice.amount = "1.5"`. BE trả `MONEY_SCALE_EXCEEDED.details.path = "unitPrice"`, là field không có ở cấp gốc body này, nên FE không trỏ được vào ô. Với `subscriptionCreate`/`subscriptionUpdate` thì `unitPrice` vẫn đúng (`subscription.dto.ts:39,60`).
- **Cách sửa:**
  - Cho `SubscriptionPricingService.read(price, path = 'unitPrice')`.
  - `SubscriptionPeriodService.recordNext` nhận đường dẫn qua `NextPeriodInput` (ví dụ `pricePath`), hoặc gọi `read(input.unitPrice, 'nextPeriod.unitPrice')`. Vì `recordNext` hiện chỉ có một nơi gọi (renewal outcome), có thể cố định chuỗi này.
  - Sửa ví dụ `RENEWAL_ERROR_EXAMPLES` thành `nextPeriod.unitPrice`.
  - File thuộc vùng A1 (SBF-20): phối hợp khi A1 merge.
- **Test:**
  - `subscription-pricing.service.spec.ts`: thêm ca có path truyền vào.
  - Integration `subscriptionRenewalRecordOutcome` với giá `"1.5"` VND ⟹ `details.path = "nextPeriod.unitPrice"`.

---

## Optional

### O-1 — Query phẳng `netAmount` (D-E2-1): chuỗi hỏng trỏ `netAmount.amount` (không tồn tại)

- **Vị trí:**
  - `src/infrastructure/http/errors/money-errors.ts:125` (luôn nối `.amount`).
  - `src/modules/catalog/vendor/vendor-tax.service.ts:78`.
  - Query `vendor.dto.ts:31-32` (`netAmount: z.string()`, phẳng).
  - Test chốt: `test/integration/catalog/vendor-tax-profile-http.integration-spec.ts:217-219`.
- **Kịch bản:** `GET …/tax-estimate?netAmount=abc&currency=USD` ⟹ `issues[0].path = "netAmount.amount"`. Một VALIDATION_ERROR thường của query này có `path = "netAmount"`. FE map theo path sẽ không tìm thấy ô, nên rơi về lỗi chung. Các mã `MONEY_*` (`path = "netAmount"`) thì đúng.
- **Đánh giá:** chỉ một route GET ước tính và đã ghi D-n, nên rủi ro thấp. Tuy vậy, đây là lệch quy ước "cùng cách viết với `issues[].path`".
- **Cách sửa:** cho `MoneyMalformedError` mang `amountPath` riêng (mặc định `${path}.amount`), hoặc thêm cờ `flat` ở `parseMoney`. `vendor-tax.service.ts:78` dùng `amountPath = 'netAmount'`.
- **Test:** sửa kỳ vọng ở integration `:218` thành `path: 'netAmount'`, và thêm một ca trong `money-errors.spec.ts`.

### O-2 — Siết DTO `taxType.max(100)` đếm chuỗi thô; policy đếm sau NFC + trim + gộp khoảng trắng

- **Vị trí:**
  - `src/modules/catalog/vendor/vendor.dto.ts:17`.
  - Policy `src/modules/finance/tax-profile/tax-profile.policy.ts:44-46`, dựa trên `normalizeDisplayName` ở `src/core/display-name.ts:14-16`.
- **Kịch bản (request hợp lệ trước đây nay bị 422):**
  - Tên thuế 98 ký tự cộng 3 dấu cách thừa ở cuối hoặc giữa (thô 101). Trước đây policy chuẩn hóa còn 98 nên được nhận; nay ra `VALIDATION_ERROR lines.0.taxType`.
  - Tương tự với tiếng Việt dạng NFD, ví dụ "Thuế thu nhập doanh nghiệp…" dán từ nguồn decomposed: mỗi chữ có dấu tốn 2–3 code unit.
  - `lines.max(20)` khớp đúng policy, không có vấn đề.
- **Đánh giá:**
  - Hiếm gặp, và FE `maxLength=100` cũng đếm chuỗi thô nên khớp DTO.
  - Nhưng "khớp policy" (mục tiêu R2 §3.4) chỉ gần đúng.
  - Breaking FE ghi "≤ 100 ký tự", chưa nói là đếm thô.
- **Cách sửa (chọn một):**
  - (a) Ghi rõ trong Breaking FE / mô tả DTO là "100 code unit, tính cả khoảng trắng".
  - (b) Để DTO rộng hơn (ví dụ 300) và giữ `TAX_TYPE_INVALID` cho tên quá dài sau chuẩn hóa. Cách này đi ngược ý định spec nên cần Owner chọn.
- **Test:** integration với tên `'A'.repeat(98) + '   '` ghi rõ hành vi đã chọn.

### O-3 — `FINANCE.SETUP_INCOMPLETE.details.departmentId` trên route Request đảo một khẳng định cũ

- **Vị trí:**
  - `src/modules/requests/access-request/access-request.http-errors.ts:67-73`.
  - Test cũ "with no department id in the answer" đổi thành `finance-setup-incomplete.http-errors.spec.ts:22`.
- **Căn cứ:** id là phòng sở hữu của người thụ hưởng hoặc người gửi (`department-record.service.ts:155`, qua placement). Người gọi vốn biết phòng của mình nên **không lộ ngoài quyền**. Việc đổi đúng B3 dòng 6.
- **Đề nghị:** Owner xác nhận D-E3-4 vì trước đây đã chủ động giữ kín. Nếu giữ, ghi vào `catalog/errors.md` (dòng 495 đang ghi `details` = "—").

### O-4 — Mô tả 422 của `budgetAdjustmentCreate` nói số tiền "không lớn hơn 0" ⟹ `MONEY_OUT_OF_RANGE`

- **Vị trí:** `src/modules/budgets/adjustment/budget-adjustment.controller.ts:88`.
- **Căn cứ:**
  - `facts.money` chỉ chặn số âm (`budget-facts.service.ts:345`).
  - Số 0 đi tới `shapeRefusalOf` ⟹ `AMOUNT_NOT_POSITIVE` (`budget-adjustment.policy.ts:11`), rồi mapper trả 422 `BUDGET_ADJUSTMENT.INVALID_SHAPE` (`budget.http-errors.ts:84`).
- **Kịch bản:** FE đọc mô tả rồi chờ `MONEY_OUT_OF_RANGE` khi nhập 0, nhưng nhận `INVALID_SHAPE`.
- **Cách sửa:** "is below nothing or too large (MONEY_OUT_OF_RANGE); zero is BUDGET_ADJUSTMENT.INVALID_SHAPE".
- **Test:** `openapi-read-wording` không cần; nếu muốn, thêm integration `amount: "0"` ⟹ `INVALID_SHAPE`.

### O-5 — `BUDGET.COST_CENTER_REQUIRED.details.costCenterIds` gồm cả Cost Center không còn dùng

- **Vị trí:** `src/modules/budgets/budget/budget-facts.service.ts:223-226`; chú thích `budget.errors.ts:37` ghi "(in use)".
- **Căn cứ:** `headedUnitsFor` giữ `costCenter` kèm `inUse: false` (`:186-187`), còn filter chỉ bỏ `costCenter === null`.
- **Kịch bản:** trưởng phòng đứng tên hai phòng, một phòng có CC đã retire. Bộ chọn FE hiện CC đã ngừng; chọn CC đó thì nhận tiếp `FINANCE.SETUP_INCOMPLETE`.
- **Cách sửa:** lọc `unit.costCenter?.inUse`, hoặc sửa chú thích và ghi trong catalog "có thể gồm CC đã ngừng".
- **Test:** unit `budget-facts` với một unit `inUse: false`.

---

## Nit

- **N-1 — Code chết sau E3a:**
  - `LicensingRenewalApi.hasPendingRenewal` (`src/modules/licensing/public/licensing-renewal.api.ts:91`), `RenewalHoldHook.hasPendingRenewal` (`licensing.extension-points.ts:146`) và `RenewalRequestRepo.hasOpenFor` không còn nơi gọi ngoài chuỗi hook.
  - README licensing `:38` vẫn liệt kê `hasPendingRenewal`.
  - `BudgetFactsService.positiveMoney` (`budget-facts.service.ts:351`) không có nơi gọi; chết từ trước, nhưng E2 vẫn đổi chữ ký của nó.
  - Hỏi Owner trước khi xóa.
- **N-2 — Chú thích mâu thuẫn ví dụ:** `provisioning-tasks.controller.ts:89` ghi "The plan and the beneficiary … always exist …: not shown", nhưng E8a thêm ví dụ `EMPLOYEE.NOT_FOUND` (`provisioning.http-errors.ts:277`). Đường ném có thật (`provisioning-holder.service.ts:79`, `lockEmployeeForShare`) nên giữ ví dụ, sửa chú thích.
- **N-3 — `DEPARTMENT_TRANSFER.PENDING_EVENT_EXISTS` không có `eventId` ở nhánh đua unique index:** `transfer-recorder.service.ts:172`. Hợp lệ ("vắng khi không biết") nhưng D-E3-2 chỉ ghi nhánh `OFFBOARDING`; bổ sung vào ghi chú catalog.
- **N-4 — Breaking FE ghi "OpenAPI sửa 409 ⟹ 403" cho `assignmentExpiryStartRevocation`:** thực tế ví dụ và manifest đã là 403; chỉ câu mô tả 409 nhắc nhầm. Ghi lại thành "sửa mô tả, không đổi contract" để FE khỏi tìm thay đổi không có.
- **N-5 — `LICENSE_ASSIGNMENT.OVERLAP`/`IDENTIFIER_IN_USE.details.conflictingAssignmentId` hiện luôn vắng:** D-E3-3; nơi ném chưa cấp id. Catalog FE nên ghi "hiện chưa trả" để FE không dựng nút mở.
- **N-6 — Quy ước mô tả:** E8b-i dùng `.describe(...)` (`access-request.dto.ts`, `need-decision-queue.dto.ts`, `spend-submission.dto.ts`…), trong khi repo đa số dùng `.meta({ description })` (477 so với 21 chỗ).

---

## Đã kiểm, không có vấn đề (bằng chứng)

| Hạng mục | Kết luận | Căn cứ |
| --- | --- | --- |
| Lõi `withMoneyPath` / `toMoneyApiException` | Đúng: path null ⟹ như cũ; `MONEY_SCALE_EXCEEDED` giữ `allowedDecimals`; `CURRENCY_NOT_SUPPORTED` giữ `currency`; 422 giữ | `core/money/money-path.ts`, `money-errors.ts:105-143`, `money-errors.spec.ts` |
| Path các nơi gọi khác | Đúng theo DTO | `requestedAmount` (`budget.dto.ts:28,35,43`); `base`/`reserve` (`:66-70,93-124`); `annualCeiling`/`sharedPoolReserve` (`cycle.dto.ts:15-27`); `knownNeedsToYearEnd.amount` (`budget-review-explanation.dto.ts:47-49`); `amount` adjustment (`budget-adjustment.dto.ts:29`); `differenceAmount` (`invoice-discrepancy.dto.ts:28`); `netAmount`/`deductibleTax`/`nonDeductibleTax`/`unitPriceOriginal` top-level (`purchase-invoice.dto.ts:59-70`); `amount` out-of-process (`vendor-account-review.dto.ts:62`); `unitPrice`/`originalPrice` subscription (`subscription.dto.ts:39-61`) |
| `TERM_MONTHS_OUT_OF_RANGE` | `maxMonths` theo `termRuleOf(kind)`; proposal không biết loại ⟹ K2 = 12, khớp cách xét (`request-facts.service.ts:237-238`); `provisioningType` vắng khi không biết | `access-request.http-errors.ts:37-44`; nơi ném `access-request.service.ts:106`, `renewal-request-writer.service.ts:72`, `group-request.service.ts:198`, `proposal.service.ts:25` |
| `RENEWAL/RETURN_REQUEST.*` `requestId` | Lấy trong cùng transaction, cùng bộ lọc cũ; người gọi là chủ ghế hoặc trưởng phòng của chủ ghế | `renewal-request.service.ts:66-67`, `return-request.service.ts:62-65` |
| `SPEND.NOT_IN_QUEUE.requestId` | Luôn có (`requestId: string`), là id do chính người gọi gửi trong lô | `spend.errors.ts:18-23`, `spend-batch.service.ts:158` |
| `BUDGET.VERSION_IN_FLIGHT`/`CURRENT_EXISTS`/`PROPOSAL_ALREADY_OPEN` | id từ bản ghi đọc dưới year-lock; nhánh đua unique index không có id ⟹ vắng | `version-creation.service.ts:62-65`, `version-baseline-creation.service.ts:52-55`, `proposal-sender.service.ts:78-83`, `budget.http-errors.ts:234-269` |
| `BUDGET_REVIEW.SEAT_MONTHS_NOT_READY` | `chargeMonth` chỉ một nơi gọi; bọc `SeatMonthChargeError` không làm đổi đường lỗi khác | `budget-review-snapshot.service.ts:82-84`, `seat-month.service.ts:55-58` |
| `*.PENDING_EVENT_EXISTS.eventId` | Route chỉ cho `SUPER_ADMIN` (và IT Admin ở route bước), nên `eventId` của điều chuyển người khác (`HEAD_HANDOVER`) không lộ ngoài quyền | `offboarding.controller.ts:99,199,220`, `transfer.policy.ts:110-126` |
| E8a, mẫu đã kiểm nơi ném | Có thật qua route | `DOCUMENT.PURPOSE_FORBIDDEN` (`contract.http-errors.ts:86`); `POLICY.VERSION_NOT_FOUND` (`policy-reading-query.service.ts:48`); `GHOST_SEAT.NOT_DECIDER/NOT_DECIDABLE/SEAT_NOT_REVOCABLE/EXEMPTION_REQUIRED` (`decision.http-errors.ts:14-22`, `decision.service.ts:164-174`, `decision.policy.ts:16`); `USAGE_SOURCE.APPLICATION_*` 422 (`vendor-source.http-errors.ts:10-13`); `DEPARTMENT.CODE_INVALID` (`department.service.ts:79`, DTO không regex); `PROVISIONING_TASK.NOT_MANUAL` (`provisioning.policy.ts:182`); `BUDGET.NOT_SPENDING_APPROVER`/`CONFLICT_OF_INTEREST`/`ADJUSTMENT_REASON_REQUIRED` (`budget-adjustment-decision.service.ts:42-62`); `SPEND.STEP_NOT_PENDING`/`NO_SPEND_STEP` (`spend-decision.service.ts:146-154`); `PURCHASE_INVOICE.NO_PLACE` (`purchase-invoice-plan.service.ts:188`, `purchase-invoice-confirmation.service.ts:129,142`) |
| E8a, mã cố ý không khai (D-E8a-1) | Hợp lý | `BUDGET.COMMITMENT_REASON_REQUIRED` bị `releaseBodySchema` `trim().min(1)` chặn trước (`commitment.dto.ts:77`); 404 `spendApprovalDecide` đúng là `ACCESS_REQUEST.NOT_FOUND` (`spend-decision.service.ts:131,142`) |
| E8b enum response | Không bỏ giá trị nào, chỉ thêm mô tả "chỉ ở bản ghi cũ" | `git show c53f0856 -- '*.dto.ts'` |
| `applicationList.emptyState` | Code chỉ sinh `NO_APPLICATIONS`/`APPLICATIONS`, tính lúc đọc (không lưu DB) ⟹ thu enum an toàn; `subscriptionList` vẫn giữ 2 giá trị kia | `application.service.ts:72-76`, `subscription.service.ts:151-154` |
| Test nới assertion | Không nới; chỉ đổi kỳ vọng theo quyết định (tax-profile, FINANCE id). Mapper spec mới khẳng định cả status lẫn `details`, kể cả ca vắng | `budget-conflict-details.http-errors.spec.ts`, `pending-event-details.http-errors.spec.ts`, `money-errors.spec.ts` |

## Ghi chú cho Phần C (Docs)

- `errors.md:67` (`MONEY_OUT_OF_RANGE` "BE không nói ô nào") cần đổi theo B2. Chỉ nên viết sau khi sửa R-1/R-2, nếu không catalog sẽ dạy FE dùng path sai.
- `errors.md:451` cần thêm `maxMonths`/`provisioningType`; `:495` cần thêm `departmentId`; `:230`/`:326` cần thêm `eventId` (có thể vắng).
