# Spec: qd103-request-amount-and-term — số tiền theo tháng còn lại của năm, tính lại ở mọi lần kiểm ngân sách; quyền mặc định không có ngày kết thúc

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (subagent thiết kế W3), đợt W3 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `draft` (sửa theo audit thiết kế W3, chờ cổng thiết kế). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-3.2` _Số tiền của Request_, _Thời hạn và năm_, `FR-3.20` _Số tiền được kiểm_ (dòng 686:
  _lúc trình tạm tính theo ngày trình, lúc duyệt tính lại theo ngày duyệt chi_), `FR-3.21`, `FR-3.22`(1), `FR-2.8`, `BR-MF1-06`,
  `BR-MF1-07`; `QĐ-103f`(1)(3), `QĐ-104a`, `QĐ-104k`(1)(6), `QĐ-106a`, `QĐ-106b`, `QĐ-106d`; QT v1.7 mục 1.1, 1.5, A.4; L1 MF-1 bước 9),
  BE `1cd81101`. Ledger: L2-10, L2-11, L2-12, L2-38; luật R-B01, R-B02, R-B03, R-D01. Câu chọn: Q-23 (ngày kết thúc thay số
  tháng — theo nguồn), Q-29 (Request tiếp tục có kỳ mới ở năm sau — TẠM CHỌN).
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (scope map chưa re-pin, xem tracker §5).
- [Kế hoạch](plan.md).

## Business outcome

Người gửi Request trả phí không chọn số tháng: Request mặc định **không có ngày kết thúc**, số tiền = **giá tháng × số tháng
còn lại của năm** (tháng gốc tính đủ) × số người — `K4` = giá mua khóa; người xin chọn _có thời hạn_ bằng **ngày kết thúc**
(≤ 12 tháng), nhà thầu/freelancer/thực tập bắt buộc có — kể cả trong Request nhóm. Số tiền **tạm tính lúc gửi** và **tính lại ở
mọi lần kiểm ngân sách** theo ngày kiểm: trưởng phòng trình lô, kiểm khi gửi của Request một bước, xác nhận dự phòng, duyệt chi
(gửi 15/12, trình 05/01 ⟹ năm mới). Request tiếp tục chỉ tính phần thuộc năm hiện hành; phần năm sau do khoản 01/01. Trưởng
phòng lập hồ sơ bổ sung **giảm thời hạn**. Không còn lịch thanh toán, ngày dự kiến chi, thuế ước tính trong số tiền.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W3), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: lõi `requests/access-request` (`pricing.policy.ts`, `request-facts.service.ts`) sở hữu số tiền và thời hạn;
  `requests/spend` tính lại trong mọi lần kiểm (nhóm `spend/repricing/`); `catalog/subscription` trả giá một lần của `K4`;
  `licensing/provisioning` đặt ngày kết thúc theo ngày Request mang (trần 12 tháng từ ngày cấp xong).
- Boundaries: 1 migration (`access_requests`, `request_supplements`); DTO của 9 operation; một service tính lại gọi trong
  `BudgetCheckService.run`; không đổi bảng ngân sách, không đổi luật ba kết quả (sibling).
- Not larger: ba kết quả kiểm tra + số cơ sở/dự phòng ở `qd103-budget-check-three-outcomes`; một khoản cam kết năm hiện hành ở
  `qd103-commitment-current-year`; nguồn giá từ kho dùng chung/thuê bao chính (L2-27) ở W4; drop cột `term_months`,
  `expected_spend_on`, `payment_schedule` ở đợt dọn (W9 hoặc Owner).
- Not smaller: số tiền lúc gửi, lúc kiểm, lúc bổ sung và ngày kết thúc lúc cấp phải dùng **một** hàm; tách ra thì giữa hai task hệ
  thống tính hai kiểu số tiền.
- Siblings: `qd103-budget-check-three-outcomes`, `qd103-commitment-current-year`, `qd103-renewal-request-window`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                         | Coverage | Phần còn lại thuộc                                                                                                 |
| ----- | -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| —     | L2-10, L2-11, L2-12, L2-38 | n/a      | gỡ chặn `qd103-budget-check-three-outcomes`, `qd103-commitment-current-year`, W4 `qd103-new-year-auto-commitments` |

## Supporting references

`US-05-23` AC-1→AC-10; `US-05-02` AC-1, AC-11, AC-17; `US-06-01` AC-14, AC-21, AC-25, AC-29; `US-06-12` AC-11, AC-27; `US-06-14`
AC-13; `US-05-14` AC-3 (số tiền Request tiếp tục). Ví dụ chuẩn `FR-3.20`: 10 người × 200 × 7 (06 → 12) = 14 000; `US-05-23` AC-6:
01/07→30/09 × 200 = 600. Spec cũ `qd96-100-request-term-limit`, `-request-year-without-spend-date`, `-approved-end-date` chỉ đọc
tham khảo (còn dùng: bỏ ngày dự kiến chi, trần 12 tháng; bỏ: `termMonths` bắt buộc, lịch trả nhiều năm).

## Explicit out of scope

- Giá từ **kho dùng chung** / thuê bao chính (Q-04) — W4 `qd103-grant-from-shared-pool`; ở đây vẫn đọc giá qua
  `CatalogApi.getPlanPrice(planId, departmentId)` (`catalog/subscription/subscription-facts.service.ts:17-36`).
- Cam kết 01/01 cho phần năm sau (cả Assignment kế tiếp của Request tiếp tục, Q-29) — W4 `qd103-new-year-auto-commitments`.
- Đổi `extensionMonths` của Request tiếp tục sang ngày kết thúc mới (QT 1.1 ghi _ngày kết thúc mới_) — giữ số tháng (Q-23).
- Xem trước thuế (`costEstimateSchema`, `access-request.dto.ts:79-89`) giữ làm thông tin; **không** cộng vào số tiền kiểm.
- Drop cột thừa (`term_months`, `expected_spend_on`, `payment_schedule`, cột báo giá) — expand/contract, đợt dọn sau.

## Dependencies and blockers

W1 `qd103-calendar-fiscal-year` (năm dương lịch, `fiscalYearOf`). Không chờ hạng mục W3 nào: là hạng mục **đầu tiên** của W3.

## Ownership: module, data, API

- Migration `<ts>_request_amount_and_term`:
  - `access_requests.term_months` → `NULL` được; Request mới không ghi (thời hạn nằm ở `expected_end_date` đã có,
    `prisma/models/requests.prisma:179-180` — sửa chú thích: _ngày kết thúc người xin chọn, mọi người thụ hưởng_).
  - `access_requests.amount_months smallint NULL CHECK (amount_months BETWEEN 0 AND 12)` (0 chỉ ở Request tiếp tục có kỳ mới
    bắt đầu năm sau — Q-29; null với `K4`, nội bộ, chưa có giá); `price_kind text NULL CHECK (price_kind IN ('RECURRING','ONE_TIME'))`.
  - `request_supplements`: `before_expected_spend_on`, `after_expected_spend_on` → `NULL` được; thêm `before_expected_end_date`,
    `after_expected_end_date date NULL`.
  - Không backfill. Request **đang mở chưa duyệt chi** có `price_kind` null được tính lại ở lần kiểm đầu (mục 5, DA3-05).
- File chính: `access-request/pricing.policy.ts` (thay `priceRequest`), `access-request/request-facts.service.ts` (`priceFor`,
  `assess` bỏ `expectedSpendOn`), `access-request/access-request.dto.ts`, `assessment/quote-pricing.policy.ts`,
  `assessment/assessment.dto.ts`, `group-request/group-request.dto.ts` + `group-request.policy.ts`, `request-draft/request-draft.repo.ts`,
  `renewal-request/renewal-request-writer.service.ts` + `renewal-request.service.ts` (`redirect`),
  `service-account-request/service-account-request.dto.ts` + service, `spend/repricing/spend-repricing.service.ts` (mới — nhóm
  của `spend`, điểm vào đúng mẫu `<capability>-<nhóm>.service.ts`, chỉ `spend/budget-check.service.ts` gọi), `spend/budget-check.service.ts`
  (một năm, bỏ `costs()` cộng thuế dòng 182-198), `spend-submission/supplement-*.ts`, `grant/grant.policy.ts:54`,
  `licensing/provisioning/tasks/provisioning-grant-writer.service.ts:113-128`, `catalog/subscription/subscription-facts.service.ts`.
- Operation đổi: `accessRequestSubmit`, `accessRequestPreview`, `accessRequestDraftSave`, `accessRequestDraftSubmit`,
  `accessRequestPropose`, `groupRequestSubmit`, `groupRequestCheck`, `accessRequestServiceAccountSubmit`,
  `accessRequestSupplementAdd`; response của mọi operation trả `requestSchema`; `accessRequestAssessmentSave` bỏ 3 trường báo giá.

## Behavior and design

1. **Hàm duy nhất** `requestAmountOf({ price, from, endDate, beneficiaries, checkDate })` (pure, `pricing.policy.ts`):
   `Y = year(checkDate)`; `start = max(from, checkDate)` (`from` = `checkDate` với Request cấp mới; = ngày bắt đầu kỳ mới với
   Request tiếp tục). `year(start) > Y` ⟹ `months = 0` (Q-29). Còn lại `months` = số tháng lịch từ tháng của `start` tới tháng
   của `min(endDate ?? 31/12/Y, 31/12/Y)`, tính cả hai đầu (`QĐ-104k`(1)); `endDate < start` ⟹ 1 (Q-23).
   - `RECURRING` ⟹ `amount = ceil(unitPrice × months × beneficiaries / cycleMonths)`, `cycleMonths` = `MONTHLY` 1 · `QUARTERLY` 3
     · `ANNUAL` 12 (`K2` gói năm = giá năm ÷ 12); làm tròn lên **một lần** ở minor.
   - `ONE_TIME` (`K4`, `QĐ-106d`) ⟹ `amount = unitPrice × beneficiaries`, `months = null`.
   - `OTHER` ⟹ `MISSING CYCLE_UNKNOWN`; không có giá/giá ≤ 0 ⟹ `MISSING NO_PRICED_SUBSCRIPTION`; vượt `MAX_AMOUNT_MINOR` ⟹
     `MISSING AMOUNT_TOO_LARGE`. `budgetYear = Y`. Không còn `periods`/`binding`.
   - Ví dụ: gửi 25/10 không thời hạn `K1` 20 ⟹ 60; gửi 10/07 kết thúc 19/10 ⟹ 4 tháng; Request tiếp tục 01/07→30/09 gửi 05/06 ⟹ 3.
2. **Khi nào tính (DA3-01):** (a) lúc gửi/xem trước/gửi bản nháp/đề xuất/nhóm/tài khoản dịch vụ/tiếp tục: `checkDate =
businessToday` — **tạm tính**; (b) **mọi lần chạy kiểm ngân sách** (`BudgetCheckService.run`, mọi trigger: trình lô `SUBMISSION`;
   kiểm khi gửi, gửi lại, chuyển một bước của Request một bước; `RESERVE_CONFIRMATION`; `SPEND_DECISION`) tính lại theo ngày
   kiểm — BRD dòng 686; (c) hồ sơ bổ sung tính theo ngày bổ sung. Ví dụ: gửi 15/12/2026, trình lô 05/01/2027 ⟹ kiểm 2027, 12 tháng.
3. **Thời hạn (Q-23):** body nhận `expectedEndDate` (ngày, tùy chọn; vắng = không có ngày kết thúc) thay `termMonths`. Ngoài
   `[hôm nay, hôm nay + 12 tháng − 1 ngày]` ⟹ 422 `ACCESS_REQUEST.END_DATE_OUT_OF_RANGE` (`details.maxEndDate`; `US-05-23` AC-9).
   Người thụ hưởng `employmentType ∈ {CONTRACTOR, FREELANCER, INTERN}` mà vắng ⟹ 422 `ACCESS_REQUEST.TERM_REQUIRED` (cá nhân, đề
   xuất, bản nháp khi gửi). **Request nhóm (DA3-03):** `groupBodySchema.termMonths` → `expectedEndDate?` chung; writer chép vào
   `access_request_lines.expected_end_date` của từng dòng; dòng không phải nhân viên chính thức mà vắng ⟹ lý do dòng
   `TERM_REQUIRED` trong 422 `GROUP_REQUEST.LINES_REFUSED` (không gửi một phần, `QĐ-106g`); `groupRequestCheck` bỏ
   `termLimit`/`termBeyondLimit`, báo `TERM_REQUIRED`. Preview trả `termRequired: boolean`, `maxEndDate`.
4. **Nhánh khác (DA3-04):** tài khoản dịch vụ: body bỏ `termMonths`, không ngày kết thúc (seat `SERVICE` giữ `termBound:false`), số
   tiền tới 31/12. Request tiếp tục giữ `extensionMonths` 1–12; writer truyền `from = renewalStartOf(...)`, `endDate = newEnd` thay
   `expectedSpendOn`. Gửi muộn (`redirect`, `renewal-request.service.ts:90-131`) ⟹ Request cấp mới `expectedEndDate = hôm nay +
extensionMonths − 1 ngày` (trần mục 3).
5. **Tính lại** `SpendRepricingService.reprice(tx, request, checkDate)`: gọi **đầu** `BudgetCheckService.run`; caller đã khóa
   hàng Request `FOR UPDATE` (thứ tự: Request → tính lại → khóa năm, README `requests`). Dùng giá chốt lúc gửi (`unit_price_minor`,
   `billing_cycle`, `price_kind`), đổi `amount_months`/`amount_minor`/`budget_year`; đổi thì audit `ACCESS_REQUEST.REPRICED`
   (trước/sau, ngày kiểm, trigger). **Dữ liệu cũ (DA3-05):** `price_kind` null ⟹ đọc giá hiện hành qua `CatalogApi` (kiểu, đơn giá,
   chu kỳ) và ghi đủ cột giá; thiếu ⟹ `NOT_CHECKABLE` như Request mới. Nhóm: tính trên số dòng còn được xét (`scaledPricing`
   `line-allocation.policy.ts:69` chia `amount`, bỏ `scaleSchedule`).
6. **Kiểm ngân sách đọc một năm:** `budget-check.service.ts` bỏ `bindingYears`/`schedule`, lấy `{ year: request.budgetYear,
costMinor: amount }` quy đổi tiền báo cáo; **bỏ** thuế ước tính (`FR-3.2` giá gốc chưa thuế).
7. **Cấp (R-D01):** `grant.policy.ts:54` `termBound = expectedEndDate !== null` (mọi nhánh cá nhân, cả `K5`); ngày kết thúc =
   `min(expectedEndDate, effectiveEndOf({ start: ngày cấp xong, months: 12 }))` (`QĐ-106b`); null ⟹ không ngày kết thúc. Request
   cũ (`term_months` có, `expected_end_date` null) giữ cách cũ. Ngày kết thúc đã qua lúc cấp: không nhánh riêng (hàng đợi quá hạn).
8. **Hồ sơ bổ sung giảm thời hạn (L2-38):** body `{ dropEmployeeIds?, expectedEndDate?, reason }` — ít nhất một; ngày mới phải
   **sớm hơn** hiện tại (null = vô hạn) và trong khoảng mục 3 ⟹ ngược lại 409 `SPEND.SUPPLEMENT_TERM_NOT_REDUCED`; cả hai vắng ⟹ 422
   `VALIDATION_ERROR`; ngoài hàng đợi ⟹ 409 `SPEND.SUPPLEMENT_NOT_IN_QUEUE` (giữ); tính lại bằng hàm (1) theo ngày bổ sung; ghi
   `before/after_expected_end_date`, `before/after_amount_minor`. Actor: trưởng phòng của hàng đợi; người yêu cầu của Request một
   bước thêm ở `qd103-request-single-step-routing`.
9. **Wire:** `pricing` bỏ `periodCount`, `bindingPeriodCount`, `firstDueOn`, `lastDueOn`; thêm `kind`, `months` (int|null),
   `monthlyPrice` (money|null, chỉ hiển thị). `requestSchema.termMonths` nullable (Request cũ), `expectedEndDate` giữ. Báo giá
   (`assessment.dto.ts:51-53,121-123`) bỏ `commitmentMonths`, `paymentFrequency`, `firstPaymentOn`; báo giá `LICENSED` không chu kỳ ⟹ `ONE_TIME`.
10. **Dữ liệu cũ/seed:** Request đã duyệt giữ số tiền/lịch cũ (codec `payment_schedule` chỉ đọc). Seed: fixture đang dùng
    `termMonths` ⟹ đổi sang `expectedEndDate` tương ứng (cùng tháng kết thúc), kịch bản không đổi.

## Test matrix

| AC / rủi ro       | Tình huống (gồm từ chối, edge case)                                                            | Cấp test                  | Kết quả mong đợi                                                                      | Bằng chứng sau implement |
| ----------------- | ---------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------- | ------------------------ |
| R-B01             | `K1` 20, không thời hạn, gốc 10/11                                                             | unit                      | months 2, amount 40, năm 2026                                                         |                          |
| R-B01             | `K2` gói năm 2 400 × 10, gốc 15/06; gói năm 1 000 × 1, gốc 01/12                               | unit                      | 7 tháng, 14 000; ceil(1 000/12) = 84                                                  |                          |
| R-B01             | `QUARTERLY` 300 gốc 01/10; `OTHER`; giá 0; vượt trần                                           | unit                      | 300 / `CYCLE_UNKNOWN` / `NO_PRICED_SUBSCRIPTION` / `AMOUNT_TOO_LARGE`                 |                          |
| QĐ-106d           | `K4` 2 khóa × 500                                                                              | unit + integration        | 1 000, months null, `ONE_TIME`                                                        |                          |
| Q-23              | gốc 10/07 kết thúc 19/10; gốc 01/10 kết thúc 31/03 năm sau; kết thúc trước ngày gốc            | unit                      | 4; 3 (10–12); 1                                                                       |                          |
| AC-9              | kết thúc hôm qua; hôm nay + 12 tháng                                                           | http                      | 422 `END_DATE_OUT_OF_RANGE`                                                           |                          |
| R-D01             | gửi không ngày kết thúc                                                                        | http + integration        | 201, `expectedEndDate` null, cấp xong không ngày kết thúc                             |                          |
| FR-2.8            | thực tập gửi không ngày kết thúc                                                               | http                      | 422 `TERM_REQUIRED`                                                                   |                          |
| FR-2.8 nhóm       | nhóm 3 người có 1 thực tập, không ngày kết thúc; nhóm nhân viên chính thức không ngày kết thúc | integration               | 422 `LINES_REFUSED` `TERM_REQUIRED` (không tạo gì); 201, cấp xong không ngày kết thúc |                          |
| QĐ-106a           | gửi 25/10 (60), duyệt 03/11                                                                    | integration (đồng hồ giả) | kiểm 40, `REPRICED` trước/sau                                                         |                          |
| DA3-01            | gửi 15/12/2026, trưởng phòng trình lô 05/01/2027                                               | integration               | kiểm `SUBMISSION` năm 2027, 12 tháng, `REPRICED`                                      |                          |
| DA3-01            | trình 28/11 (`USES_RESERVE`), xác nhận dự phòng 02/12 (sau sibling)                            | integration               | kiểm `RESERVE_CONFIRMATION` 1 tháng                                                   |                          |
| QĐ-106a           | gửi 15/12, duyệt 05/01                                                                         | integration               | 240, `budget_year` 2027                                                               |                          |
| R-D01             | cấp xong Request kết thúc 19/02 năm sau, ngày cấp 20/11                                        | integration               | `expectedEndDate` 19/02 năm sau, không cắt 31/12                                      |                          |
| QĐ-106b           | Request kết thúc 30/09/2027, cấp xong 15/11/2026                                               | integration               | ngày kết thúc 14/11/2027 (trần 12 tháng)                                              |                          |
| tiếp tục          | kết thúc 30/06, tiếp tục 3 tháng, gửi 05/06 (`US-05-23` AC-6)                                  | integration               | 3 tháng × 200 = 600                                                                   |                          |
| Q-29              | kết thúc 31/12/2026, tiếp tục 3 tháng, gửi 10/12; duyệt 05/01/2027                             | integration               | `amount_months` 0, năm 2026; tính lại 3 tháng năm 2027                                |                          |
| tài khoản dịch vụ | gửi 01/10 không thời hạn                                                                       | integration               | 3 tháng (10–12), seat không ngày kết thúc                                             |                          |
| FR-3.2            | phần mềm có hồ sơ thuế                                                                         | integration               | số kiểm = giá gốc                                                                     |                          |
| L2-38             | bổ sung null → 30/09; 30/09 → 31/12; không trường nào                                          | http + integration        | 201 + số mới; 409 `SUPPLEMENT_TERM_NOT_REDUCED`; 422                                  |                          |
| L2-38             | bổ sung Request không ở hàng đợi                                                               | integration               | 409 `SUPPLEMENT_NOT_IN_QUEUE`                                                         |                          |
| L2-12             | `accessRequestGet`, `accessRequestAssessmentSave`                                              | http + `openapi:export`   | không còn 4 trường lịch, 3 trường báo giá                                             |                          |
| nhóm              | Request nhóm 3 người, duyệt 2 dòng khác tháng gửi                                              | integration               | tính lại × 2 người theo tháng duyệt                                                   |                          |
| DA3-05            | Request `K4` mở trước migration (`price_kind` null), trình sau                                 | integration               | đọc giá hiện hành, số = giá mua × người                                               |                          |
| dữ liệu cũ        | Request đã duyệt có `payment_schedule` cũ                                                      | integration               | đọc được, số tiền không đổi                                                           |                          |
| seed              | `ops:seed` DB sạch, chạy lại                                                                   | integration               | xanh, lần hai không đổi                                                               |                          |

## Definition of Done

- [ ] Test matrix xanh; `openapi.json` đổi đúng các trường trên; `api-coverage-manifest.ts` không đổi số operation.
- [ ] README `requests` (bảng sở hữu, nhóm `spend/repricing/`, codec `payment_schedule` chỉ đọc), README `catalog` (giá `ONE_TIME`).
- [ ] Test hiện có liệt kê ở plan sửa theo luật mới, không nới khẳng định ngoài phần luật đổi.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

08/11/2026: tạo ở W3 (bản nháp trong scratch, chờ cổng thiết kế). Chưa nghiệm thu.
08/11/2026: sửa theo audit thiết kế W3 (`design-audit-w3.md`): tính lại ở mọi lần kiểm (DA3-01), Q-29 đổi sang phần năm hiện hành
(DA3-02), Request nhóm bắt buộc ngày kết thúc cho người không chính thức (DA3-03), Request tiếp tục/tài khoản dịch vụ (DA3-04), dữ
liệu cũ `price_kind` null (DA3-05), nhóm `spend/repricing/` đúng luật nhóm (DA3-07), Q-23 đổi sang ngày kết thúc. Chưa nghiệm thu.
