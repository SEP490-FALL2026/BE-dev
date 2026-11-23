# SPEC-B1 — Từ vựng, giá seat-tháng, dòng kho seat-ngày, cam kết theo tháng, chi phí không cam kết, tiết kiệm

Phần của [SPEC.md](SPEC.md). **Tự đứng được:** không cần bảng Workspace hay dòng thuê bao; mọi công thức dùng dữ liệu hiện có
(một kỳ thuê bao = một gói, số seat của kỳ = `subscriptions.purchased_quantity`). B3 thay nguồn số seat bằng sổ mà **không**
đổi công thức (W3-22). Migration: M1, M2, M3 ([SPEC §5](SPEC.md#5-mô-hình-dữ-liệu-mới-và-migration)).

Ví dụ dùng chung (công ty mẫu của `NOTE MD/giai-thich-kho-gia-han-chi-phi-ngan-sach.md`): Claude Team Standard **500.000 đ**,
Premium **2.500.000 đ** / seat-tháng, cam kết 12 tháng trả năm, kỳ 01/07/2026 → 30/06/2027, gia hạn **01/07/2027**, hạn chót báo
hủy **01/06/2027** (điểm điều chỉnh mở **02/05/2027**); Figma **375.000 đ**, cam kết 1 tháng, thanh toán ngày **15**; phòng Thiết
kế `CC-TK`, Kỹ thuật `CC-KT`.

---

## W3-01

**Từ vựng một nghĩa ở wire và tài liệu.**

- **Nguồn:** `QĐ-115b`, `KHO-01`.
- **Hiện trạng:** mô tả OpenAPI và module card dùng lẫn "pool", "perpetual subscription", "workspace profile of the plan";
  nhãn khóa `K4` "Lô khóa bản quyền của một lần mua K4" (`licensing/license-key/license-key-template.policy.ts:10`); trường
  `unallocated` của `seatMonthChargeList` mô tả "not allocated" như một dòng (`budgets/seat-month/seat-month.dto.ts:43`).
- **Hành vi đúng:** bảng [SPEC §4](SPEC.md#4-từ-vựng-w3-01-kho-01). **Không** đổi tên file/lớp/bảng đang có (`subscription-pool`,
  `seat-month-pool` giữ tên: đổi tên là refactor không giá trị). Chỉ đổi: `description`/`summary` OpenAPI chạm trong đợt, module
  card `catalog`, `licensing`, `budgets` (mục "Từ vựng"), message key mới.
- **Tiêu chí chấp nhận:**
  1. `openapi.json` không còn chuỗi `perpetual subscription`, `pool of the plan` ở operation đợt 3 chạm; mô tả `K4` nói
     `license lot`/`price of one license`.
  2. Ba module card có mục "Từ vựng" trỏ về một nơi (bảng SPEC §4 chép thành câu, không mã `QĐ`).

---

## W3-02

**Giá tháng là nguồn sự thật; kỳ cam kết định mua ở gói; một phép quy đổi duy nhất.**

- **Nguồn:** `QĐ-115e` (giá `K1`/`K2` luôn một seat một tháng, BE tự nhân theo chu kỳ; gói có _kỳ cam kết định mua_; `K1` luôn
  giá tham chiếu của gói), `QĐ-115o` (bỏ `QUARTERLY`/`OTHER` khỏi API, giữ cột), `KHO-03`, W1c §3.2 (`monthlyUnitPrice`,
  `referenceCommitmentMonths`).
- **Hiện trạng — sáu phép quy đổi khác nhau:**

  | Chỗ                         | Phép                                   | `file:line`                                                     |
  | --------------------------- | -------------------------------------- | --------------------------------------------------------------- |
  | seat-tháng, dòng kho        | `ceil(price / cycleMonths)`            | `catalog/subscription/price/subscription-price.policy.ts:47-58` |
  | ước tính số cơ sở ngân sách | làm tròn nửa (`(p*2+12)/24`)           | `budgets/cycle/baseline.policy.ts:9-17`                         |
  | số tiền Request             | `ceil(unit × months × people / cycle)` | `requests/access-request/pricing.policy.ts:166-168`             |
  | giá seat-tháng của cam kết  | `ceil(cost / (months × seats))`        | `requests/access-request/pricing.policy.ts:65-75`               |
  | tiềm năng                   | chia nguyên (sàn)                      | `optimization/usage-rules/potential-saving.policy.ts:29-30`     |
  | tránh được                  | `ceil`                                 | `licensing/shared-pool/shared-pool.policy.ts:84`                |

  Giá lưu theo chu kỳ trả (`subscriptions.unit_price_minor`, `prisma/models/catalog.prisma:351`); gói không có kỳ cam kết định mua
  (chỉ `subscriptions.commitment_term_months`, `catalog.prisma:365`).

- **Hành vi đúng:**
  1. **Dữ liệu (M1):** `subscriptions.monthly_unit_price_minor BIGINT NULL` (CHECK `>= 0`); CHECK
     `subscriptions_active_term_monthly_price`: `status <> 'ACTIVE' OR kind <> 'TERM' OR monthly_unit_price_minor IS NOT NULL`.
     `plans.reference_commitment_months SMALLINT NULL` CHECK `IN (1, 12)` và CHECK chỉ khi `provisioning_type IN ('K1','K2')`.
     Backfill: `monthly = (p * 2 + m) / (2 * m)` (làm tròn nửa lên, số nguyên dương) với `p = COALESCE(price_reporting_minor,
unit_price_minor)`, `m` = 1/3/12 theo `billing_cycle`; dòng `TERM` có giá khác `VND` ⟹ khối kiểm trước **dừng** (sau
     `QĐ-111an` không còn giá ngoại tệ; câu kiểm: `SELECT id FROM subscriptions WHERE kind='TERM' AND
COALESCE(price_reporting_currency, unit_price_currency) <> 'VND'`). Gói `K1` ⟹ `reference_commitment_months = 1`; gói `K2` ⟹
     `commitment_term_months` của thuê bao primary nếu có, không thì `NULL`.
  2. **Một phép quy đổi:** hàm thuần `monthlyPriceOf(record)` = `monthly_unit_price_minor` (đọc thẳng, không chia) ở
     `catalog/subscription/price/subscription-price.policy.ts`; `monthlyCostOf` gọi nó. Mọi nơi trong bảng hiện trạng đọc giá
     tháng qua `SubscriptionPeriodApi.getPurchaseFacts` / `CatalogApi.getSubscriptionPrice` (thêm trường `monthlyPriceMinor`), không
     tự chia. `K1` lấy giá tham chiếu của gói (đã là giá tháng — `subscription-price.policy.ts:78-100`).
  3. **Số tiền Request** `K1`/`K2` = `monthly × months × people` (không chia, không `ceil`); `seatMonthlyMinor` của cam kết =
     `monthly` (không chia ngược).
  4. **Ghi giá:** `subscriptionCreate`/`subscriptionUpdate` nhận `monthlyUnitPrice: { amount, currency: 'VND' }` (mới). Thân cũ
     chỉ gửi `unitPrice` ⟹ `monthly = round(unitPrice / cycleMonths)` như backfill. Gửi cả hai mà
     `unitPrice ≠ monthly × cycleMonths` ⟹ 422 `SUBSCRIPTION.PRICE_MISMATCH` (`details: { expectedUnitPrice }`). Sau khi ghi,
     `unit_price_minor` luôn được service viết lại = `monthly × cycleMonths` (cột dẫn xuất, giữ cho mã cũ đọc).
  5. **Kỳ cam kết định mua:** `planCreate`/`planUpdate` nhận `referenceCommitmentMonths` (1 \| 12) cho `K1`/`K2`; gói khác gửi ⟹ 422
     `PLAN.REFERENCE_COMMITMENT_NOT_APPLICABLE`. Khai thuê bao không gửi `commitmentTermMonths` ⟹ lấy của gói. Với `K2`, lần mua đầu
     (chưa có thuê bao) Request hiện _tiền phải trả nhà cung cấp cả năm_ khi gói = 12 (thay vì đọc chu kỳ của thuê bao —
     `pricing.policy.ts:91-103`).
- **Nơi tính / nơi ghi:** policy thuần ở `subscription-price.policy.ts`; ghi ở `subscription.service.ts` (khai), `subscription-change.service.ts` (sửa) trong tx đang có.
- **Tiêu chí chấp nhận:**

  | Ca                                             | Vào                                  | Ra                                                                         |
  | ---------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
  | Khai mới, giá tháng                            | `monthlyUnitPrice` 500.000, `ANNUAL` | lưu monthly 500.000, `unitPrice` 6.000.000                                 |
  | FE cũ gửi giá năm chia hết                     | `unitPrice` 6.000.000, `ANNUAL`      | monthly 500.000                                                            |
  | FE cũ gửi giá năm không chia hết               | `unitPrice` 1.000.001, `ANNUAL`      | monthly 83.333 ((1.000.001×2+12)/24 = 83.333), `unitPrice` trả **999.996** |
  | Gửi cả hai, lệch                               | monthly 500.000, unit 6.000.001      | 422 `SUBSCRIPTION.PRICE_MISMATCH`                                          |
  | Request `K2` _Dùng lâu dài_ gửi 11/2026        | monthly 500.000, 1 người             | số tiền 2026 = 2 × 500.000 = **1.000.000**; `seatMonthlyMinor` 500.000     |
  | Request `K1` tháng 3 tháng                     | giá tham chiếu 450.000               | 1.350.000                                                                  |
  | Ước tính số cơ sở (seat Trống, gia hạn cả năm) | 2 seat Trống, monthly 375.000        | 2 × 375.000 × 12 = **9.000.000** (không còn làm tròn riêng)                |
  | Gói `K4` gửi `referenceCommitmentMonths`       | 12                                   | 422 `PLAN.REFERENCE_COMMITMENT_NOT_APPLICABLE`                             |

  Migration (integration): dòng `ANNUAL` 6.000.000 ⟹ 500.000; `MONTHLY` 375.000 ⟹ 375.000; `QUARTERLY` 900.001 ⟹ 300.000;
  `PERPETUAL` ⟹ `NULL`; CHECK mới đứng sau backfill.

---

## W3-03

**Đổi số seat qua ô cũ (chuyển tiếp trước B3): báo người liên quan; dọn `increasesObligation`.**

- **Nguồn:** `QĐ-115f` (chuyển tiếp: chặn giảm, bắt lý do — đợt 1 W1-14), `KHO-27`, W1c §3.3 ("giảm số seat hiện không báo ai —
  thêm thông báo cùng lúc với `KHO-27`"; "`increasesObligation` không có nơi gọi: nối vào hoặc xóa").
- **Hiện trạng:** tăng số seat báo IT phụ trách qua `guard.tellSeatIncrease` (`catalog/subscription/subscription-change.service.ts:128-129`);
  giảm không báo ai; `increasesObligation` chỉ có spec gọi (`catalog/subscription/obligation/subscription-obligation.policy.ts:50`).
- **Hành vi đúng:** **chỉ làm sau khi đợt 1 P9 (W1-03, W1-14) đã ở `dev`.** Giảm `purchasedQuantity` của thuê bao `ACTIVE` `K2`
  qua `subscriptionUpdate` ⟹ thông báo hộp thư `SUBSCRIPTION_SEATS_REDUCED` cho IT Admin phụ trách thuê bao và Finance (params
  `{ subscriptionId, from, to }`, không số tiền), event key `subscriptionSeatsReduced:<subscriptionId>:<updatedAt ISO>` mỗi người
  nhận. **Tự chốt:** xóa `increasesObligation` và các ca của nó trong spec (không luật nào cần; sổ số seat B3 thay hẳn).
- **Tiêu chí chấp nhận:** giảm 12 → 11 ⟹ đúng 2 dòng thông báo (IT phụ trách, Finance); gọi lại cùng `expectedUpdatedAt` ⟹ 409
  `SUBSCRIPTION.STALE` (của đợt 1), không thêm thông báo; tăng giữ hành vi cũ; `grep increasesObligation src` = 0.

---

## W3-04

**Dòng _Chưa phân bổ — kho dùng chung_ tính theo seat-ngày, tách bốn dòng con, so Dự phòng.**

- **Nguồn:** `QĐ-115l`, `QĐ-116aj` (bốn dòng con, cả bốn so Dự phòng), `QĐ-116bf` (tên _Chi phí seat/khóa Trống_), `KHO-22`,
  `KHO-24`, W1c §3.3 (B1: "dòng kho tính theo ngày ở cả hai vế với dữ liệu hiện có").
- **Hiện trạng:**
  - `paid = purchasedQuantity × monthly` cả tháng, `unallocated = (paid ?? invoiced) − allocated`
    (`budgets/seat-month/seat-month-pool.policy.ts:25-43`); số seat lấy **hôm nay** cho mọi tháng
    (`budgets/seat-month/seat-month-pool.service.ts:109-127`).
  - module card ghi "hóa đơn kho − seat-tháng" (`budgets/README.md:170-171`), lệch code.
  - so Dự phòng một số (`budgets/review/budget-review.policy.ts:166-168`, `budgets/budget-view/budget-table-view.service.ts:79-110`).
- **Hành vi đúng (công thức):** với mỗi kỳ `K2` `P` (bản ghi `subscriptions`) và tháng `M` (`D` ngày):

  ```text
  daysPaid(P, M)   = số ngày của M nằm trong [startDate(P), endExclusive(P))
                     endExclusive = startDate(kỳ nối tiếp) nếu có, endDate(P)+1 nếu có, không thì hết tháng
  paidSeatDays     = q(P) × daysPaid(P, M)                      -- B1: q = purchased_quantity của kỳ
  heldSeatDays     = Σ seat của P: số ngày của M seat đang giữ  -- cùng khoảng giữ của seat-tháng (core/seat-month-cost.ts seatHeldRange)
  idleCost(P, M)   = roundHalfAway( max(0, paidSeatDays − heldSeatDays) × monthly(P) / D )
  invoiceVariance(M)    = Σ hóa đơn K2 Finance xác nhận trong M: W3-05
  deviceLotPurchases(M) = 0 (đợt 2 / W3-25)      replacementKeys(M) = 0 (W3-25)
  sharedPool(M)    = idleCost + invoiceVariance + deviceLotPurchases + replacementKeys   -- thay `unallocated`
  lũy kế năm       = Σ M từ tháng 1 tới tháng đã tính cuối      overReserve = lũy kế > Dự phòng kho của chu kỳ
  ```

  - Ngày seat giữ mà người giữ **không có phòng** vẫn là _đã giữ_ (không vào kho) — đó là việc của _Chưa phân bổ Cost Center_
    (`withoutCostCenter` giữ nguyên).
  - Kiểm đẳng thức (test): `Σ seat-tháng các phòng của P + Σ seat-tháng không phòng + idleCost(P) = paidSeatDays × monthly / D`
    (± làm tròn từng đoạn, ≤ số đoạn đồng).
  - **Giới hạn B1 có chủ đích:** `q(P)` là số đang lưu của kỳ; một lần `addSeat` giữa kỳ làm số seat tính từ đầu kỳ. B3 (W3-22) thay
    `q` bằng sổ theo ngày. Ảnh chụp tháng đã chốt không tính lại (`QĐ-62m`).

- **Nơi tính / ghi:** capability mới `budgets/shared-pool-line/`: `shared-pool-line.policy.ts` (thuần: `idleCostOf`,
  `poolLineOf`, `cumulativeOf`), `shared-pool-line-facts.service.ts` (đọc kỳ qua `SubscriptionPeriodApi.getPurchaseFacts` — thêm
  `startDate`, `endExclusive`, `monthlyPriceMinor`; seat qua `LicensingSeatMonthApi.getSeatsOfMonth`; phương sai từ `invoices` của
  budgets). `seat-month-pool.policy.ts` `paidMinor`/`poolLineMinor` **bỏ**, mọi nơi gọi chuyển sang facts mới; ảnh chụp rà soát
  (`review/budget-review-period-writer.service.ts:99-101`) ghi thêm bốn dòng con (cột M2:
  `budget_review_periods.shared_pool_idle_minor`, `shared_pool_variance_minor`, `shared_pool_variance_in_review_minor`,
  `shared_pool_device_lot_minor`, `shared_pool_replacement_minor`, cùng `NULL` cho bản cũ).
- **API:** `seatMonthChargeList` `poolLines[]` thêm `idleCost`, `idleCostByLabel` (W3-06), `invoiceVariance`,
  `invoiceVarianceInReview`, `deviceLotPurchases`, `replacementKeys`; `unallocated` giữ tên, **nghĩa đổi** = tổng bốn dòng con.
  `budgetSummary` thêm `sharedPoolLines { idleCost, invoiceVariance, invoiceVarianceInReview, deviceLotPurchases,
replacementKeys, total, reserve, overReserve }`; `sharedPoolUnallocated` = `total`.
- **Tiêu chí chấp nhận:**

  | Ca (một thuê bao Standard 500.000 đ)                                                                          | Số                                                                                          |
  | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
  | 11/2026 (30 ngày), 10 seat cả tháng; seat 1–4 Thiết kế, 5–7 Kỹ thuật, seat 8 cấp 16/11, 9–10 Trống (`KHO-22`) | trả 300, giữ 120+90+15 = 225 ⟹ **1.250.000 đ** (25 %)                                       |
  | 01/2027 (31 ngày), 12 seat; Hùng, Mai thu hồi 15/01 (giữ ngày 1–14)                                           | trả 372, giữ 310 + 28 = 338 ⟹ 34 × 500.000 / 31 = **548.387 đ**                             |
  | 02/2027 (28 ngày), 10 người giữ                                                                               | 56 seat-ngày Trống ⟹ **1.000.000 đ**                                                        |
  | Kỳ cũ kết thúc 30/06/2027, kỳ mới từ 01/07/2027 (11 seat)                                                     | tháng 7 chỉ đọc kỳ mới; tháng 6 chỉ kỳ cũ                                                   |
  | Kỳ không có giá tháng                                                                                         | `idleCost` `null`, dòng ghi cờ `NO_PRICE`, không đoán                                       |
  | Dự phòng 12.000.000; lũy kế tới 11: Trống 8.100.000 + chênh lệch 900.000                                      | 9.000.000 ⟹ không cảnh báo                                                                  |
  | như trên, chênh lệch 4.000.000                                                                                | 12.100.000 > 12.000.000 ⟹ một thông báo `BUDGET_SHARED_POOL_OVER_RESERVE` tháng 11 (key cũ) |

---

## W3-05

**Số kỳ vọng của hóa đơn `K2`, _Chênh lệch hóa đơn kho_, ngưỡng mở `SBF-11a`.**

- **Nguồn:** `QĐ-116av` (số kỳ vọng hóa đơn kỳ = Σ dòng số seat **theo sổ tại ngày đầu kỳ** × giá tháng × 1 hoặc 12), `KHO-09`
  (hóa đơn lần nâng), `QĐ-116ak` (ngưỡng tham số mặc định 5 %, Finance sửa), `QĐ-117l` (hai trường hợp độc lập mở `SBF-11a`; quá
  ngưỡng **bất kể nguyên nhân**; lý do đóng _Chênh tỷ giá/phí thẻ — đã cập nhật giá dòng_), `KHO-23` (ghi vào **tháng Finance
  xác nhận**).
- **Hiện trạng:** so khớp chỉ số lượng và đơn giá theo tiền gốc, không ngưỡng
  (`requests/purchase-invoice/purchase-invoice-match.policy.ts:32-45`); số kỳ vọng của link `SUBSCRIPTION` = `purchasedQuantity`
  (`purchase-invoice-plan.service.ts:220-226`); cờ `OVER_APPROVED` (`:333-350`); hóa đơn `K2` vào kho, không chạm cam kết
  (`confirmation/purchase-invoice-confirmation.service.ts:103-123`).
- **Hành vi đúng:**

  ```text
  actual        = net + nonDeductibleTax                          (đã có: purchase-invoice-recorder.service.ts:61)
  expected      =
    hóa đơn kỳ (link SUBSCRIPTION, nhãn RENEWAL/PERIOD):  q(P tại ngày đầu kỳ) × monthly(P) × (12 nếu billingCycle = ANNUAL, 1 nếu MONTHLY)
    hóa đơn lần nâng (link REQUEST, plan K2, tác vụ cấp có purchaseKind = POOL_TOP_UP):
        monthly × cover(from = ngày mua, to = ngày gia hạn của kỳ − 1)
        cover = Σ tháng lịch: số ngày được phủ / số ngày của tháng                  (KHO-09; gói tháng: ngày gia hạn = ngày thanh toán kế)
  variance      = actual − expected                                tháng = tháng (giờ tổ chức) Finance xác nhận
  quá ngưỡng    ⟺ |variance| × 100 > threshold × expected          threshold = K2_INVOICE_VARIANCE_THRESHOLD_PERCENT (mặc định 5)
  ```

  - Dưới/bằng ngưỡng ⟹ `invoiceVariance` của tháng xác nhận. Quá ngưỡng ⟹ mở (hoặc bổ sung) **một** hồ sơ `SBF-11a` cho hóa đơn,
    `mismatches` thêm `EXPECTED_AMOUNT`; số lệch vẫn ghi ở tháng xác nhận nhưng vào `invoiceVarianceInReview` cho tới khi hồ sơ
    đóng (tiền đã chi nên vẫn so Dự phòng); đóng hồ sơ ⟹ chuyển sang `invoiceVariance` (tháng giữ nguyên). **Tự chốt** — sổ QĐ nói
    "dưới ngưỡng vào dòng này" mà không nói phần quá ngưỡng nằm đâu; đẳng thức kho phải giữ.
  - Hai trường hợp độc lập: lệch số lượng/đơn giá (hiện có) **và** lệch số kỳ vọng — cùng một hồ sơ (`invoice_discrepancy_cases`
    unique theo hóa đơn), `mismatches` gộp.
  - Đóng hồ sơ thêm `outcome = EXCHANGE_RATE_LINE_PRICE_UPDATED` (M3): không đòi `differenceMinor > 0`; nhắc IT phụ trách thuê bao
    cập nhật giá tháng (thông báo `SUBSCRIPTION_PRICE_REVIEW`, không tự sửa giá).
  - Không có số kỳ vọng (kỳ thiếu giá/số seat) ⟹ `pool_expected_minor` `NULL`, toàn bộ `actual` vào `invoiceVariance` kèm cờ
    `NO_EXPECTED_AMOUNT`, không mở hồ sơ (**Tự chốt**: không đoán số).

- **Dữ liệu (M2):** `invoices.pool_expected_minor BIGINT NULL`, `pool_variance_minor BIGINT NULL`, `pool_variance_month DATE NULL`,
  `pool_variance_in_review BOOLEAN NOT NULL DEFAULT false`; CHECK ba cột cùng `NULL` hoặc cùng có (trừ `expected` khi cờ). Tham số
  `K2_INVOICE_VARIANCE_THRESHOLD_PERCENT` (int 1–50, mặc định 5, đơn vị %, nhóm `BUDGET`, `owner: 'FINANCE'`).
- **Nơi tính / ghi:** policy thuần `requests/purchase-invoice/pool-expectation/purchase-invoice-pool-expectation.policy.ts`
  (nhóm mới); ghi trong tx xác nhận hiện có (`purchase-invoice-confirmation.service.ts`) qua `BudgetsApi.recordPurchaseInvoice`
  (thêm trường). Ngày mua của lần nâng B1 = `provisioning_tasks.purchased_at` (đọc qua facade licensing có sẵn của tác vụ).
- **Tiêu chí chấp nhận:**

  | Ca                                                      | Kỳ vọng                                   | Thực chịu   | Lệch                | Kết quả                                                                                                |
  | ------------------------------------------------------- | ----------------------------------------- | ----------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
  | Hóa đơn kỳ Claude 01/07/2027 (11 Std + 2 Prem, trả năm) | 126.000.000                               | 130.500.000 | +4.500.000 (3,57 %) | `invoiceVariance` tháng xác nhận                                                                       |
  | như trên                                                | 126.000.000                               | 133.000.000 | +7.000.000 (5,56 %) | hồ sơ `EXPECTED_AMOUNT`, `invoiceVarianceInReview`                                                     |
  | Hóa đơn tháng 7 (cam kết 12, trả tháng)                 | 10.500.000                                | 11.025.000  | +525.000 (= 5,00 %) | **không** mở hồ sơ                                                                                     |
  | Finance đặt ngưỡng 3                                    | 126.000.000                               | 130.500.000 | 3,57 %              | mở hồ sơ                                                                                               |
  | Lần nâng 2 seat Standard 21/11/2026, gia hạn 01/07/2027 | 2 × 500.000 × (10/30 + 7) = **7.333.333** | 7.298.630   | −34.703             | `invoiceVariance`                                                                                      |
  | Lệch tỷ giá 8 % có số lượng đúng                        | —                                         | —           | 8 %                 | mở hồ sơ (bất kể nguyên nhân); đóng `EXCHANGE_RATE_LINE_PRICE_UPDATED` ⟹ chuyển sang `invoiceVariance` |
  | Hóa đơn `K1`/`K4` lệch tỷ giá                           | —                                         | —           | —                   | không mở hồ sơ theo ngưỡng                                                                             |

---

## W3-06

**Nhãn seat Trống (2)(3) và tỷ lệ chi phí seat/khóa Trống 10 %.**

- **Nguồn:** `QĐ-115k` (ba nhãn, nhãn trên thắng), `QĐ-116aq` (_Bị khóa tới dd/mm_ = ngày sớm nhất giảm được; nhãn theo sổ),
  `KHO-20`, `KHO-26`, `QĐ-115l` (ngưỡng 10 % báo IT Admin, không tính phần bị khóa ở mức tối thiểu/cỡ bậc).
- **Hiện trạng:** không có nhãn hay tỷ lệ (AUDIT-A §6 "Ba nhãn seat Trống — Chưa có"; "Tỷ lệ seat Trống 10 % — một phần").
- **Hành vi đúng (B1, theo kỳ):** mỗi seat-ngày Trống của ngày `d` trong kỳ _Mua cố định_ mang nhãn:
  - **(2) Giảm được — đang trong cửa sổ** nếu `d ≥` ngày mở điểm điều chỉnh của kỳ (`adjustmentPointOf`,
    `catalog/subscription/obligation/subscription-obligation.policy.ts:150-182`; gói tháng: điểm của ngày thanh toán kế tiếp sau `d`);
  - **(3) Bị khóa tới `R`** còn lại, `R` = ngày sớm nhất giảm được: cam kết 12 tháng ⟹ ngày gia hạn của kỳ; cam kết 1 tháng ⟹
    ngày thanh toán đầu tiên sau `d` (`KHO-14`).
  - Nhãn (1) _Lỡ điểm điều chỉnh_ cần mục tiêu đã chốt ⟹ W3-22 (B3). B1 trả `missedAdjustment: '0'`.
  - Tỷ lệ tháng = `(idleCost − idleAtMinimum) / (paidSeatDays × monthly / D)`; `idleAtMinimum` = seat-ngày Trống chỉ tồn tại vì
    `vendorMinimumSeats` (`max(0, min(vendorMinimum, q) − held)` mỗi ngày) quy ra tiền. Tỷ lệ > 10 % ⟹ thông báo
    `IDLE_SEAT_COST_RATIO_HIGH` cho IT Admin phụ trách thuê bao, key `idleCostRatio:<subscriptionId>:<YYYY-MM>`, chạy trong lượt giờ
    của `BudgetReviewSweeper` cho tháng vừa tính đủ.
- **Nơi tính:** `budgets/shared-pool-line/shared-pool-line-label.policy.ts` (thuần); ngày mở điểm điều chỉnh lấy qua
  `SubscriptionPeriodApi` (thêm `adjustmentWindowsOf(subscriptionIds, month)` dùng lại policy có sẵn, không viết lại).
- **Tiêu chí chấp nhận:**

  | Ca                                                             | Kết quả                                                                        |
  | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
  | 05/2027 Standard, 1 seat Trống cả tháng (điểm mở 02/05)        | 01/05: 16.129 _Bị khóa tới 01/07/2027_; 02–31/05: 483.871 _Giảm được_          |
  | Figma: Mai trả seat 20/01/2027, thanh toán ngày 15             | 20/01–07/02 _Bị khóa tới 15/02_; 08/02–14/02 _Giảm được_                       |
  | Tỷ lệ tháng 1/2/3/4 năm 2027 (bảng 4A file giải thích)         | 9,14 % / 16,67 % / 10,75 % / 8,33 % ⟹ thông báo tháng 2 và 3, không tháng 1, 4 |
  | Kỳ tối thiểu 5 seat, 4 người dùng (seat Trống ở mức tối thiểu) | không tính vào tỷ lệ; vẫn vào `idleCost`                                       |
  | Chạy lượt giờ hai lần trong tháng                              | một thông báo mỗi (thuê bao, tháng)                                            |

---

## W3-07

**Cam kết `K2` giữ theo tháng: tự giải phóng phần dư mỗi tháng, dọn phần dư năm cũ.**

- **Nguồn:** `QĐ-116ac` ("cuối mỗi tháng — hoặc khi quyền kết thúc — hệ thống tự giải phóng phần cam kết của tháng đó vượt
  seat-ngày thực; điều chuyển giữa tháng mỗi phòng chịu seat-ngày của mình; chốt tháng 12 tự dọn phần dư `K2` của năm cũ, hiện ở
  _điều chỉnh kỳ trước_"), A-1/A-2/A-4/A-18 của AUDIT-A, `QĐ-106c` (cam kết không tính lại khi giá đổi).
- **Hiện trạng:**
  - cam kết một số cho cả năm, áp seat-tháng `min(amount, held)` (`budgets/seat-month/seat-month.policy.ts:84-92`,
    `seat-month-plan.policy.ts:103-112`);
  - giải phóng theo ngày **chỉ** khi cấp muộn (`LATE_GRANT`), thu hồi (`REVOKED`), điều chuyển (`TRANSFER_EFFECTIVE`)
    (`requests/grant/seat-release.policy.ts:131-173`, `src/core/seat-month-cost.ts:32-53`); chỉ năm còn mở (`seat-release.policy.ts:111-122`);
  - **không** có giải phóng cuối tháng (grep `MONTH_END` = 0) ⟹ phần dư do giá dòng thấp hơn giá lúc duyệt, do làm tròn, do
    Request đã duyệt chưa cấp tới hết tháng, và mọi phần dư của năm đã đóng nằm mãi ở _Đang giữ_.
- **Hành vi đúng — sổ tháng của cam kết:**
  1. **Dữ liệu (M2):** bảng `budget_commitment_months` (budgets): `commitment_id` FK, `month DATE` (ngày 1), `seat_count INT ≥ 1`,
     `share_minor BIGINT ≥ 0`, `applied_minor BIGINT ≥ 0`, `released_minor BIGINT ≥ 0`, `settled_at TIMESTAMPTZ NULL`; PK
     (`commitment_id`, `month`); CHECK `applied_minor + released_minor <= share_minor`; trigger: không đổi `commitment_id`,
     `month`, `seat_count`, `share_minor` sau khi chèn. M3 thêm `CommitmentReleaseReason` `MONTH_END`, `YEAR_END_SEAT_MONTHS`.
  2. **Lúc giữ** (`SpendEffectsService.hold`, `requests/spend-effects/spend-effects.service.ts:40-88`; lượt 01/01
     `requests/year-start-commitments/*`): cam kết `K2` (giá seat-tháng `s` không `NULL`) ghi một dòng cho **mỗi tháng** mà số tiền
     Request của năm đó tính (các tháng `pricing.policy.ts` đếm, `QĐ-104k`): `share = s × seat_count`. Lượt 01/01 ghi theo từng seat
     (tháng 1 → tháng trước ngày kết thúc của seat; quyền không ngày kết thúc: 1 → 12) rồi gộp theo tháng. Dư làm tròn (cam kết cũ
     `ceil`) cộng vào dòng tháng cuối. `Σ share = amount_minor`. `K1`/`K4`: không có dòng tháng.
  3. **Áp seat-tháng:** mỗi dòng `seat_month_charges` của cam kết `C`, tháng `M`, **cùng Cost Center** ⟹
     `applied += min(amount, share − applied − released)` của dòng tháng (`C`, `M`); phần vượt không lấy từ tháng khác (là thực chi
     không cam kết — `QĐ-106c`). Cam kết không có dòng tháng (dữ liệu cũ) ⟹ luật cũ `min(amount, held)`. Đảo seat-tháng
     (`budget_commitment_seat_month_reversals`) trả lại vào đúng dòng tháng.
  4. **Giải phóng theo sự kiện** (`LATE_GRANT`, `REVOKED`, `TRANSFER_EFFECTIVE`, rút/hủy/thất bại): số tiền giữ nguyên công thức hiện
     có, nhưng **rải** vào dòng tháng: mỗi tháng `released += min(phần của tháng, share − applied − released)`; tháng có một phần
     ngày ⟹ phần ngày của chính tháng đó. Một seat của Request nhóm chỉ giải phóng `s` mỗi tháng của nó (không cả `share`).
  5. **Chốt tháng** (job, [SPEC §8](SPEC.md#8-job-việc-định-kỳ)): khi **mọi** thuê bao `K2` của tổ chức đã có `seat_month_runs` cho
     `M`: mỗi dòng tháng (`C`, `M`) chưa chốt, `C.state = HELD` ⟹ `release = max(0, share − applied − released)`, ghi
     `budget_commitment_releases` lý do `MONTH_END`, `settled_at = now()`. Tính lại tháng `M` theo yêu cầu (`QĐ-111ae`) làm `applied`
     giảm ⟹ lượt sau giải phóng thêm phần mới dư (dòng tháng chốt lại); không bao giờ "giữ lại" phần đã giải phóng.
  6. **Dọn năm cũ:** chốt xong tháng 12 của năm `Y` ⟹ mọi cam kết `K2` năm `Y` còn `held > 0` (kể cả cam kết cũ không có dòng tháng)
     ⟹ giải phóng hết, lý do `YEAR_END_SEAT_MONTHS`. Rà soát tháng 1 năm `Y+1` hiện cột `priorYearReleasedMinor` trên dòng Cost Center
     (M2: `budget_review_lines.prior_year_released_minor`) = Σ giải phóng `YEAR_END_SEAT_MONTHS` năm `Y` của Cost Center đó.
     Ngoại lệ cố ý so với `releasable` (chỉ năm mở — `seat-release.policy.ts:111-122`): job hệ thống được giải phóng năm đã đóng.
- **Nơi tính / ghi:** policy thuần `budgets/commitment/month/commitment-month.policy.ts` (`monthRowsOf`, `applyToMonth`,
  `spreadRelease`, `settlementOf`); service ghi `budgets/commitment/month/commitment-month-settlement.service.ts` (một tx mỗi cam
  kết); bước job trong `SeatMonthSweeper` sau `chargeEndedMonths` (`budgets/seat-month/seat-month.service.ts:38-48`). Thứ tự khóa:
  advisory `commitment-month:<org>:<month>` → `budget_commitments` FU → `budget_commitment_months` FU → CC-year watch (bỏ qua khi
  cam kết chưa gắn phiên bản — E1).
- **Tiêu chí chấp nhận (mỗi ca kiểm tổng `applied + released = amount` cuối năm):**

  | Ca  | Diễn biến                                                                                                       | Kết quả                                                                                                                             |
  | --- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
  | A   | Lan, Standard _Dùng lâu dài_, duyệt và cấp 21/11/2026; cam kết 2026 = 1.000.000, dòng 11 và 12 mỗi dòng 500.000 | lúc cấp `LATE_GRANT` dòng 11 = 333.333; seat-tháng 11 = 166.667; chốt 11: 0; còn giữ 500.000 cho tháng 12                           |
  | B   | Hùng, cam kết 2027 `YEAR_START` 6.000.000 (12 dòng × 500.000); thu hồi 15/01/2027                               | dòng 1: giải phóng 274.194, áp 225.806; dòng 2–12 giải phóng 500.000; tổng giải phóng **5.774.194**; chốt tháng 1: 0                |
  | C   | Duyệt 15/12/2026 (_Dùng lâu dài_), chưa cấp tới 31/12; dòng 12 = 500.000                                        | chốt tháng 12 (lượt đầu tháng 1): `MONTH_END` **500.000**; rà soát tháng 1/2027 `priorYearReleased` 0 (đã giải phóng ở `MONTH_END`) |
  | C'  | Tiếp ca C: `YEAR_START` 2027 6.000.000; cấp 10/01/2027                                                          | `LATE_GRANT` dòng 1 = 145.161; seat-tháng 1 = 354.839; chốt tháng 1: 0                                                              |
  | D   | Giá dòng giảm 500.000 → 450.000 từ 01/03/2027, seat giữ cả tháng 3                                              | chốt tháng 3: `MONTH_END` **50.000**                                                                                                |
  | E   | Giá dòng tăng lên 550.000 từ 01/07/2027                                                                         | tháng 7: áp 500.000, 50.000 là thực chi không cam kết; cả năm thực chi 6.300.000, áp 6.000.000                                      |
  | F   | Cam kết cũ 2026 (không dòng tháng) 1.000.000, áp 700.000                                                        | chốt tháng 12/2026 ⟹ `YEAR_END_SEAT_MONTHS` **300.000**; rà soát 1/2027 dòng Cost Center `priorYearReleased` 300.000                |
  | G   | Điều chuyển 26/03/2027 (31 ngày), seat 500.000                                                                  | phòng cũ áp 403.226 (ngày 1–25); `TRANSFER_EFFECTIVE` dòng 3 = 96.774 + dòng 4–12; chốt tháng 3: 0                                  |
  | H   | Chạy chốt tháng 3 hai lần / hai instance cùng lúc                                                               | một dòng `MONTH_END` mỗi (cam kết, tháng); integration có barrier, không `40P01`                                                    |
  | I   | Một thuê bao `K2` chưa có `seat_month_runs` tháng 3                                                             | không cam kết nào chốt tháng 3                                                                                                      |

---

## W3-08

**_Còn lại_ trừ chi phí đang chạy không có cam kết (`K2`).**

- **Nguồn:** `QĐ-116af` (_còn lại_ trừ thêm, _dự kiến cuối năm_ cộng thêm = seat đang gán không có Request × giá tháng × số tháng
  còn lại của năm; không tạo cam kết — giữ `QĐ-109a`), `QĐ-117i` (số tháng = các tháng chưa ghi seat-tháng, **gồm trọn tháng
  đang chạy**), A-14.
- **Hiện trạng:** `remainingBase = base − spent − held − pending` (`requests/spend/budget-check.policy.ts:140-141`); không có số hạng
  này ở kiểm tra ngân sách lẫn `budgetSummary`.
- **Hành vi đúng:**

  ```text
  runningUncommitted(CC, Y, today) =
    Σ seat K2 đang hiệu lực hôm nay, người giữ thuộc phòng có Cost Center hiện hành = CC, và
        (seat không có Request  — nguồn BASELINE / HANDOVER / MACHINE_ACCOUNT_CONVERSION / quyền theo vai,
         hoặc cam kết năm Y của Request đó không HELD, hoặc thuộc Cost Center khác CC)        -- ân hạn điều chuyển
    monthly(kỳ của seat) × monthsLeft
  monthsLeft = số tháng m của năm Y, từ tháng đầu tiên chưa có seat_month_runs của kỳ đó (≥ tháng hiện tại)
               tới tháng chứa ngày cuối seat còn giữ (ngày kết thúc − 1) hoặc tháng 12
  ```

  - _Còn lại_ (kiểm tra ngân sách khi gửi/duyệt, `budgetSummary`, đèn) trừ `runningUncommitted`; _dự kiến cuối năm_ cộng nó
    **không** nhân hệ số chênh (**Tự chốt**: hệ số chênh chỉ áp khoản đã khớp hóa đơn — `QĐ-116at`).
  - Quyền theo vai của Người duyệt chi (không Cost Center) không vào Cost Center nào.
  - `K1` không có seat-tháng ⟹ phần `K1` làm ở W3-23 (B3, cần ngày đã trả của quyền).

- **Nơi tính / ghi:** chỉ đọc. Policy thuần `budgets/budget/running-uncommitted.policy.ts`; facts
  `budgets/budget/running-uncommitted-facts.service.ts` (seat qua `LicensingSeatMonthApi.getSeatsInForceOn(day)` — mới: `assignmentId`,
  `subscriptionId`, `planId`, `requestId`, `source`, `departmentId` hôm nay, `endsOn`; giá qua `SubscriptionPeriodApi.getPurchaseFacts`;
  cam kết và `seat_month_runs` của budgets). `BudgetsApi` trả `runningUncommittedMinor` trong lát ngân sách mà
  `requests/spend/budget-check.policy.ts` đọc; policy kiểm trừ thêm.
- **Tiêu chí chấp nhận:**

  | Ngày                          | Dữ kiện                                                                                 | `runningUncommitted` `CC-TK`                                                         |
  | ----------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
  | 08/07/2027                    | 2 seat Figma nhập lúc khởi tạo (không Request), 375.000; seat-tháng đã tính tới tháng 6 | 2 × 375.000 × 6 (7→12) = **4.500.000**                                               |
  | 02/08/2027                    | như trên, tháng 7 đã tính ngày 01/08                                                    | 2 × 375.000 × 5 = **3.750.000** (tháng 7 đã thành thực chi 750.000, không đếm trùng) |
  | 08/07/2027                    | một seat trong đó có ngày kết thúc 15/10/2027                                           | 375.000 × 6 + 375.000 × 4 = **3.750.000**                                            |
  | 08/07/2027                    | seat của Request có cam kết 2027 `HELD` ở `CC-TK`                                       | không tính                                                                           |
  | 08/07/2027                    | seat trong ân hạn điều chuyển sang `CC-TK` (cam kết ở `CC-KT` đã giải phóng)            | tính                                                                                 |
  | Kiểm tra ngân sách ngày 08/07 | số cơ sở 132.000.000, thực chi 60.000.000, giữ 50.000.000, chờ 10.000.000               | còn lại = 132 − 60 − 50 − 10 − 4,5 = **7.500.000**                                   |

---

## W3-09

**Ba con số tiết kiệm: tiềm năng, tránh được, thực.**

- **Nguồn:** `QĐ-116as` (đơn vị của ba con số; _tránh được_ = phần năm nay của số tiền Request được cấp từ kho), `QĐ-117f`
  (_tiềm năng_ = số seat × giá tháng × **số tháng của một kỳ cam kết** (12 hoặc 1), **từ ngày sớm nhất giảm được**, hiện kèm ngày;
  `K1` tháng 1 tháng từ ngày trả kế, `K1` năm 12 tháng từ hết kỳ đã trả, theo thành viên 1 tháng từ ngày thanh toán kế, `K4`
  không), `QĐ-117g` (_thực_ = mốc − **số kỳ vọng** kỳ mới, chưa thuế; mốc = seat cuối kỳ cũ theo sổ × giá tháng cũ × độ dài kỳ,
  **từng dòng**, không bù trừ; ghi khi **Finance xác nhận** hóa đơn kỳ mới; hồ sơ `SBF-11a` mở ⟹ hoãn; giảm giữa kỳ không sinh _thực_),
  `QĐ-94h` (ba con số không bao giờ cộng).
- **Hiện trạng:**
  - tiềm năng: `monthly × 12` khi `billingCycle = ANNUAL` (sai trục — phải là kỳ cam kết), chia sàn, `realisableOn = null`
    (`optimization/usage-rules/potential-saving.policy.ts:17-40`);
  - tránh được: `ceil(unit / cycle) × (13 − tháng cấp)` (`licensing/shared-pool/shared-pool.policy.ts:63-87`), ghi ở licensing lúc
    cấp (`shared-pool.service.ts:202-236`);
  - thực: ghi lúc **IT ghi kết quả** gia hạn, so tổng cả thuê bao (`licensing/subscription-renewal/outcome/renewal-outcome.policy.ts:57-66`,
    `renewal-outcome.service.ts:73-77`).
- **Hành vi đúng:**
  1. **Tiềm năng** (`potentialSavingOf`): `amountAtPoint = seats × monthly × commitmentTermMonths` (12 \| 1) của kỳ; `monthly` từ
     W3-02; `realisableOn` = ngày sớm nhất giảm được (`SubscriptionPeriodApi.earliestReducibleOn(subscriptionId, today)` — mới, dùng
     `adjustmentPointOf`: cam kết 12 ⟹ ngày gia hạn; cam kết 1 ⟹ ngày thanh toán đầu tiên ≥ hôm nay mà điểm điều chỉnh của nó chưa
     qua); `realisableAt = 'ON_DATE'`. `K1`: B1 giữ `UNKNOWN` (cần ngày neo trả tiền của B3 — W3-17); `K4`: `NEVER` (giữ).
  2. **Tránh được:** khi tác vụ cấp hoàn tất **từ kho** (`fromPool`, `provisioning-grant-completion.service.ts:87-89`), số tiền =
     phần **năm cấp** của số tiền Request đã lưu (cam kết năm đó của Request; `K4`: số tiền Request). Ghi chuyển sang listener của
     requests (`requests/grant/access-request-grant.listener.ts`, đã xử lý `GRANTED_FROM_POOL`) gọi `LicensingApi.recordAvoidedCost(tx,
taskId, amount)` (mới); `avoidedCostOf` của licensing **bỏ** tính tiền (giữ `months`/`unitMinor` `NULL` cho dòng mới). Bảng
     `pool_grant_avoided_costs` giữ (dòng cũ không tính lại).
  3. **Thực:** bỏ ghi lúc IT ghi kết quả; ghi khi Finance xác nhận **hóa đơn kỳ đầu tiên của kỳ mới** (link `SUBSCRIPTION`, nhãn
     `RENEWAL`) qua `LicensingApi.recordRealisedSaving(tx, { newPeriodId, invoiceId })`:

     ```text
     mỗi dòng (B1: kỳ = một gói):  baseline = q_cuối_kỳ_cũ × monthly_cũ × kỳ_cam_kết_tháng
                                    expected = q_kỳ_mới    × monthly_mới × kỳ_cam_kết_tháng      (= số kỳ vọng W3-05)
                                    saving   = max(0, baseline − expected)
     thực = Σ saving các dòng; hóa đơn có hồ sơ SBF-11a mở ⟹ chưa ghi; hồ sơ đóng ⟹ ghi ở lúc đóng
     ```

     Cột M2: `subscription_renewals.realised_savings_recorded_at`, `realised_savings_invoice_id`; ca của kỳ ghi đúng một lần
     (`realised_savings_recorded_at IS NULL` dưới khóa kỳ).
- **Tiêu chí chấp nhận:**

  | Con số     | Ca                                                                         | Số                                                                 |
  | ---------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
  | Tiềm năng  | khuyến nghị Hùng + Mai 04/01/2027, Standard cam kết 12, gia hạn 01/07/2027 | mỗi seat **6.000.000 từ 2027-07-01**; 2 seat 12.000.000            |
  | Tiềm năng  | Figma (cam kết 1, thanh toán 15), khuyến nghị 20/01/2027                   | **375.000 từ 2027-02-15**                                          |
  | Tiềm năng  | Claude cam kết 12 **trả tháng**                                            | vẫn × 12 (trục là kỳ cam kết, không phải chu kỳ trả)               |
  | Tránh được | Quân, Standard _Dùng lâu dài_, duyệt 10/03/2027, cấp từ kho cùng ngày      | **5.000.000** (10 × 500.000)                                       |
  | Tránh được | duyệt 10/03, cấp từ kho 20/05                                              | **5.000.000** (số đã lưu của năm; công thức cũ cho 4.000.000)      |
  | Thực       | kỳ cũ 12 Std, kỳ mới 11 Std, Finance xác nhận hóa đơn 01/07/2027           | 72.000.000 − 66.000.000 = **6.000.000**; Premium 2 → 2: 0          |
  | Thực       | Standard 12 → 11 và Premium 2 → 3 (Request mới)                            | Standard 6.000.000; Premium max(0, 60 − 90 tr) = 0 ⟹ **6.000.000** |
  | Thực       | 100 seat × 150.000 → 88 seat × 180.000                                     | 180.000.000 < 190.080.000 ⟹ **0**                                  |
  | Thực       | hóa đơn kỳ mới mở `SBF-11a`                                                | chưa ghi; đóng hồ sơ ⟹ ghi 6.000.000                               |
  | Không cộng | báo cáo hiện ba số riêng                                                   | không trường "tổng tiết kiệm" nào                                  |
