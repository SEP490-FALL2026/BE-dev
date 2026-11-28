# SPEC-B1 — Từ vựng, giá seat-tháng, dòng kho seat-ngày, cam kết theo tháng, chi phí không cam kết, tiết kiệm (bản 2, 24/11/2026)

Phần của [SPEC.md](SPEC.md). **Tự đứng được:** không cần bảng Workspace hay dòng thuê bao; mọi công thức dùng dữ liệu hiện có
(một kỳ thuê bao = một gói, số seat của kỳ = `subscriptions.purchased_quantity`). B3 thay nguồn số seat bằng sổ mà **không**
đổi công thức (W3-22). Migration: M1, M2, M3 ([SPEC §5](SPEC.md#5-mô-hình-dữ-liệu-mới-và-migration)). `file:line` tính từ
`src/modules/`, đọc trên `int/redesign-w2` `8a4c8b70`, đối chiếu lại `origin/dev` `70543271` ở [DELTA-W2-FINAL.md](DELTA-W2-FINAL.md) (= `origin/dev` `b7a7cc80` + đợt 2; đợt 2 vào `dev` trước khi tách nhánh).

Ví dụ dùng chung (công ty mẫu của `Docs/Requiments/giai-thich-kho-gia-han-chi-phi-ngan-sach.md`): Claude Team Standard **500.000 đ**,
Premium **2.500.000 đ** / seat-tháng, cam kết 12 tháng trả năm, kỳ 01/07/2026 → 30/06/2027, gia hạn **01/07/2027**, hạn chót báo
hủy **01/06/2027** (điểm điều chỉnh mở **02/05/2027**); Figma **375.000 đ**, cam kết 1 tháng, thanh toán ngày **15** (điểm điều chỉnh
mở 7 ngày trước: ngày **08**); phòng Thiết kế `CC-TK`, Kỹ thuật `CC-KT`. Trong B1 **một kỳ = một gói**: Claude Standard và Claude
Premium là **hai** thuê bao, mỗi hóa đơn kỳ gắn một thuê bao (`PurchaseInvoice` một liên kết — `prisma/models/requests.prisma:1205-1215`).

**Luật làm tròn chung (SPEC §2.3):** mọi phép chia ra đồng dùng `roundHalfAway` (nửa lên xa 0); một chuỗi đoạn thì phần dư dồn
đoạn cuối. Mỗi luật tiền dưới đây có **một ca biên** và **một ca diệt đột biến** (đổi `roundHalfAway` ⟷ `ceil`/`floor`, `>` ⟷ `>=`,
bỏ `max(0, …)`/`min`) — test phải đỏ khi đột biến.

---

## W3-01

**Từ vựng một nghĩa ở wire và tài liệu.**

- **Nguồn:** `QĐ-115b`, `KHO-01`.
- **Hiện trạng:** mô tả OpenAPI và module card dùng lẫn "pool", "perpetual subscription", "workspace profile of the plan"; nhãn khóa
  `K4` "Lô khóa bản quyền của một lần mua K4" (`licensing/license-key/license-key-template.policy.ts:10`); trường `unallocated` của
  `seatMonthChargeList` mô tả "not allocated" như một dòng (`budgets/seat-month/seat-month.dto.ts:43`).
- **Hành vi đúng:** bảng [SPEC §4](SPEC.md#4-từ-vựng-w3-01-kho-01). **Không** đổi tên file/lớp/bảng (`subscription-pool`,
  `seat-month-pool` giữ tên). Chỉ đổi: `description`/`summary` OpenAPI chạm trong đợt, module card `catalog`, `licensing`, `budgets`
  (mục "Từ vựng"), message key mới. Mô tả `unallocated` đổi ở P5 (file của làn `biz`), phần còn lại ở P1.
- **Tiêu chí chấp nhận:**
  1. `openapi.json` không còn chuỗi `perpetual subscription`, `pool of the plan` ở operation đợt 3 chạm; mô tả `K4` nói
     `license lot`/`price of one license`.
  2. Ba module card có mục "Từ vựng" (bảng SPEC §4 chép thành câu, không mã `QĐ`).
- **Test:** gate OpenAPI hiện có (`pnpm test:gates`) + `grep -c "perpetual subscription" openapi.json` ghi vào PROGRESS.

---

## W3-02

**Giá tháng là nguồn sự thật; kỳ cam kết định mua ở gói; một phép quy đổi duy nhất; tháng là tháng lịch.**

- **Nguồn:** `QĐ-115e` (giá `K1`/`K2` luôn một seat một tháng, BE tự nhân; gói có _kỳ cam kết định mua_; `K1` luôn giá tham chiếu
  của gói), `QĐ-115o` (bỏ `QUARTERLY`/`OTHER` khỏi API, giữ cột), `QĐ-104k`(1) (tháng là tháng lịch; số tiền Request làm tròn lên
  theo tháng), `QĐ-116an` (kỳ tháng của `K1` bắc qua 31/12 thuộc tháng chứa ngày bắt đầu), `KHO-03`, W1c §3.2.
- **Hiện trạng — sáu phép quy đổi khác nhau:**

  | Chỗ                         | Phép                                   | `file:line`                                                     |
  | --------------------------- | -------------------------------------- | --------------------------------------------------------------- |
  | seat-tháng, dòng kho        | `ceil(price / cycleMonths)`            | `catalog/subscription/price/subscription-price.policy.ts:47-58` |
  | ước tính số cơ sở ngân sách | làm tròn nửa (`(p*2+12)/24`)           | `budgets/cycle/baseline.policy.ts:9-17`                         |
  | số tiền Request             | `ceil(unit × months × people / cycle)` | `requests/access-request/pricing.policy.ts:166-168`             |
  | giá seat-tháng của cam kết  | `ceil(cost / (months × seats))`        | `requests/access-request/pricing.policy.ts:65-75`               |
  | tiềm năng                   | chia nguyên (sàn)                      | `optimization/usage-rules/potential-saving.policy.ts:29-30`     |
  | tránh được                  | `ceil`                                 | `licensing/shared-pool/shared-pool.policy.ts:63-87`             |

  Giá lưu theo chu kỳ trả (`subscriptions.unit_price_minor`, `prisma/models/catalog.prisma:351`); gói không có kỳ cam kết định mua.
  Số tháng của Request đếm **tháng cuốn** từ ngày bắt đầu (`src/core/term-limit.ts:183-191` `monthsBeginningIn`), lệch `QĐ-104k`(1)
  với `K2` khi seat bắt đầu giữa tháng và có ngày cuối.

- **Hành vi đúng:**
  1. **Dữ liệu (M1):** `subscriptions.monthly_unit_price_minor BIGINT NULL` (CHECK `>= 0`); CHECK
     `subscriptions_active_term_monthly_price`: `status <> 'ACTIVE' OR kind <> 'TERM' OR monthly_unit_price_minor IS NOT NULL`.
     `plans.reference_commitment_months SMALLINT NULL` CHECK `IN (1, 12)` và chỉ khi `provisioning_type IN ('K1','K2')`.
     **Khối kiểm trước** (`DO $$ … RAISE EXCEPTION … $$`), dừng nếu có dòng:
     - `TERM` có giá khác `VND`: `SELECT id FROM subscriptions WHERE kind = 'TERM' AND COALESCE(price_reporting_currency, unit_price_currency) <> 'VND';`
     - `ACTIVE` `TERM` có `billing_cycle = 'OTHER'` (không biết số tháng để chia — B1-R9):
       `SELECT id FROM subscriptions WHERE status = 'ACTIVE' AND kind = 'TERM' AND billing_cycle = 'OTHER';`
     - `ACTIVE` `TERM` không có giá: `SELECT id FROM subscriptions WHERE status = 'ACTIVE' AND kind = 'TERM' AND COALESCE(price_reporting_minor, unit_price_minor) IS NULL;`

     Backfill: `monthly = (p * 2 + m) / (2 * m)` (số nguyên — làm tròn nửa lên) với `p = COALESCE(price_reporting_minor,
unit_price_minor)`, `m` = 1/3/12 theo `MONTHLY`/`QUARTERLY`/`ANNUAL`; `DRAFT`/`PERPETUAL` không giá ⟹ `NULL`. Gói `K1` ⟹
     `reference_commitment_months = 1`; gói `K2` ⟹ `commitment_term_months` của thuê bao primary nếu có, không thì `NULL`.

  2. **Một phép quy đổi:** hàm thuần `monthlyPriceOf(record)` = `monthly_unit_price_minor` (đọc thẳng) ở
     `catalog/subscription/price/subscription-price.policy.ts`; `monthlyCostOf` gọi nó. Mọi chỗ của bảng hiện trạng đọc giá tháng qua
     `SubscriptionPeriodApi.getPurchaseFacts` / `CatalogApi.getSubscriptionPrice` (thêm `monthlyPriceMinor`), không tự chia. `K1` lấy giá
     tham chiếu của gói (`subscription-price.policy.ts:78-100`, giữ).
  3. **Số tiền Request** `K1`/`K2` = `monthly × months × people` (không chia, không `ceil`); `seatMonthlyMinor` của cam kết = `monthly`.
     **`months` của `K2`** = số **tháng lịch** của năm có ít nhất một ngày seat còn giữ, từ tháng chứa ngày bắt đầu tới tháng chứa
     ngày cuối còn giữ (không ngày cuối: tháng 12) — `QĐ-104k`(1). **`K1`** giữ tháng cuốn theo kỳ trả (`monthsBeginningIn`,
     `QĐ-116an`). Hàm mới `calendarMonthsIn({ start, lastHeldOn, year })` ở `src/core/term-limit.ts`, chỉ `K2` gọi.
  4. **Ghi giá:** `subscriptionCreate`/`subscriptionUpdate` nhận `monthlyUnitPrice: { amount, currency: 'VND' }` (mới). Thân cũ chỉ
     gửi `unitPrice` ⟹ `monthly` theo công thức backfill. Gửi cả hai mà `unitPrice ≠ monthly × cycleMonths` ⟹ 422
     `SUBSCRIPTION.PRICE_MISMATCH` (`details.expectedUnitPrice`). Sau khi ghi, service viết lại `unit_price_minor = monthly × cycleMonths`
     (cột dẫn xuất cho mã cũ). `billingCycle` `QUARTERLY`/`OTHER` ở ghi mới ⟹ 422 `VALIDATION_ERROR` (enum của DTO ghi chỉ còn
     `MONTHLY`, `ANNUAL`; đọc vẫn trả giá trị cũ).
  5. **Kỳ cam kết định mua:** `planCreate`/`planUpdate` nhận `referenceCommitmentMonths` (1 \| 12) cho `K1`/`K2`; gói khác gửi ⟹ 422
     `PLAN.REFERENCE_COMMITMENT_NOT_APPLICABLE`. Khai thuê bao không gửi `commitmentTermMonths` ⟹ lấy của gói. Gói `K2` có
     `reference_commitment_months` **`NULL`** ⟹ đọc như **12** (B1-R19; gói năm là mặc định — `subscription-obligation.policy.ts:132-134`
     `isByTheMonth`). Lần mua đầu `K2` (chưa thuê bao) hiện _tiền phải trả nhà cung cấp cả năm_ khi gói = 12
     (thay `pricing.policy.ts:91-103` đọc chu kỳ của thuê bao).
- **Nơi tính / ghi:** policy thuần `subscription-price.policy.ts`, `src/core/term-limit.ts`; ghi ở `subscription.service.ts` (khai),
  `subscription-change.service.ts` (sửa) trong tx đang có.
- **Tiêu chí chấp nhận:**

  | Ca                                                  | Vào                                               | Ra                                                                              |
  | --------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
  | Khai mới, giá tháng                                 | `monthlyUnitPrice` 500.000, `ANNUAL`              | lưu monthly 500.000, `unitPrice` 6.000.000                                      |
  | FE cũ gửi giá năm chia hết                          | `unitPrice` 6.000.000, `ANNUAL`                   | monthly 500.000                                                                 |
  | FE cũ gửi giá năm không chia hết (diệt `ceil`)      | `unitPrice` 1.000.001, `ANNUAL`                   | monthly **83.333** (`ceil` cho 83.334); `unitPrice` trả **999.996**             |
  | Đúng nửa (biên; diệt `floor`)                       | `unitPrice` 1.000.002, `ANNUAL`                   | monthly **83.334** (83.333,5 ⟹ lên; `floor` cho 83.333)                         |
  | Gửi cả hai, lệch                                    | monthly 500.000, unit 6.000.001                   | 422 `SUBSCRIPTION.PRICE_MISMATCH`, `expectedUnitPrice` 6.000.000                |
  | Ghi mới `QUARTERLY`                                 | `billingCycle` `QUARTERLY`                        | 422 `VALIDATION_ERROR`                                                          |
  | Request `K2` _Dùng lâu dài_ gửi 21/11/2026          | monthly 500.000, 1 người                          | 2026 = tháng 11, 12 = **1.000.000**; `seatMonthlyMinor` 500.000                 |
  | Request `K2` seat 31/01/2027 → ngày cuối 15/03/2027 | monthly 500.000, 1 người                          | tháng lịch 1, 2, 3 ⟹ **1.500.000** (tháng cuốn cũ cho 1.000.000)                |
  | Request `K1` 3 tháng từ 15/01/2027                  | giá tham chiếu 450.000                            | tháng cuốn ⟹ **1.350.000** (không thành 4 tháng lịch)                           |
  | Ước tính số cơ sở (seat Trống, gia hạn cả năm)      | 2 seat Trống, monthly 375.000                     | 2 × 375.000 × 12 = **9.000.000**                                                |
  | Gói `K4` gửi `referenceCommitmentMonths`            | 12                                                | 422 `PLAN.REFERENCE_COMMITMENT_NOT_APPLICABLE`                                  |
  | Gói `K2` `referenceCommitmentMonths` `NULL`         | lần mua đầu, monthly 500.000, 1 người, 21/11/2026 | _tiền phải trả nhà cung cấp cả năm_ = 500.000 × 12 = **6.000.000** (như gói 12) |

  Migration (integration, `test/integration/catalog/subscription-monthly-price-migration.integration-spec.ts`): `ANNUAL` 6.000.000 ⟹
  500.000; `MONTHLY` 375.000 ⟹ 375.000; `QUARTERLY` 900.001 ⟹ 300.000; `PERPETUAL` ⟹ `NULL`; `ACTIVE` `OTHER` ⟹ migration dừng
  (`RAISE`, thông điệp nêu id); CHECK mới đứng sau backfill.

- **Test:** unit `subscription-price.policy.spec.ts`, `term-limit.spec.ts` (`calendarMonthsIn`: biên 31/01 → 15/03 = 3; 01/03 → 31/03 = 1;
  21/11 không ngày cuối, năm 2026 = 2), `pricing.policy.spec.ts`, `baseline.policy.spec.ts`, `plan.service.spec.ts`; http
  `test/http/catalog/subscriptions.http-spec.ts` (PRICE_MISMATCH, QUARTERLY).

---

## W3-03

**Đổi số seat qua ô cũ (chuyển tiếp trước B3): báo người liên quan; dọn `increasesObligation`.**

- **Nguồn:** `QĐ-115f` (chuyển tiếp: chặn giảm, bắt lý do — đợt 1 W1-14, đã ở `dev`), `KHO-27`, W1c §3.3, `QĐ-118f` (người nhận việc
  của thuê bao là IT phụ trách; không dùng được ⟹ Super Admin).
- **Hiện trạng:** tăng số seat báo IT phụ trách qua `guard.tellSeatIncrease` (`catalog/subscription/subscription-change.service.ts:136`
  → `subscription-change-guard.service.ts:27` → `seat-increase/subscription-seat-increase.service.ts:48-65`, người nhận theo
  `seatIncreaseRecipients`); giảm không báo ai; `increasesObligation` chỉ có spec gọi
  (`catalog/subscription/obligation/subscription-obligation.policy.ts:50`).
- **Hành vi đúng:** giảm `purchasedQuantity` của thuê bao `ACTIVE` `K2` qua `subscriptionUpdate` (đường W1-14 đã có) ⟹ thông báo
  `SUBSCRIPTION_SEATS_REDUCED` theo **luật người nhận R1** ([SPEC §8.1](SPEC.md#81-luật-người-nhận-thông-báo)): IT phụ trách thuê bao
  (nếu dùng được và **không** phải người thao tác), không dùng được ⟹ Super Admin dùng được; **cộng** Finance (tài khoản `FINANCE`
  dùng được). Params, đích, câu chữ: [SPEC §8.2](SPEC.md#82-mã-thông-báo-mới). Event key
  `SUBSCRIPTION_SEATS_REDUCED:<subscriptionId>:<updatedAt ISO>` cho mỗi người nhận. **Tự chốt:** xóa `increasesObligation` và ca của nó
  (không luật nào cần; sổ B3 thay hẳn) — ở P10 (file của làn `biz`).
- **Tiêu chí chấp nhận:**

  | Ca                                              | Kết quả                                                        |
  | ----------------------------------------------- | -------------------------------------------------------------- |
  | Nam (IT) giảm 12 → 11, Khoa phụ trách dùng được | 2 thông báo: Khoa, Finance                                     |
  | Khoa (phụ trách) tự giảm 12 → 11                | 1 thông báo: Finance (không báo chính người thao tác)          |
  | Khoa bị khóa tài khoản, Nam giảm                | 2 thông báo: Super Admin, Finance                              |
  | Gọi lại cùng `expectedUpdatedAt`                | 409 `SUBSCRIPTION.STALE` (đợt 1), không thêm thông báo         |
  | Tăng 11 → 12                                    | hành vi cũ (`SUBSCRIPTION_SEATS_INCREASED`), không `…_REDUCED` |
  | `grep -rn increasesObligation src` (sau P10)    | 0                                                              |

- **Test:** unit `subscription-seat-increase.policy.spec.ts` (người nhận giảm, ba ca đầu), `subscription-change.service.spec.ts`;
  http `test/http/catalog/subscriptions.http-spec.ts` (ca 409 không thêm thông báo).

---

## W3-04

**Dòng _Chưa phân bổ — kho dùng chung_ tính theo seat-ngày, tách bốn dòng con, so Dự phòng.**

- **Nguồn:** `QĐ-115l`, `QĐ-116aj` (bốn dòng con, cả bốn so Dự phòng), `QĐ-116bf` (_Chi phí seat/khóa Trống_), `KHO-22`, `KHO-24`,
  W1c §3.3.
- **Hiện trạng:**
  - `paid = purchasedQuantity × monthly` cả tháng, `unallocated = (paid ?? invoiced) − allocated`
    (`budgets/seat-month/seat-month-pool.policy.ts:25-43`); số seat lấy **hôm nay** cho mọi tháng
    (`budgets/seat-month/seat-month-pool.service.ts:109-127`); module card lệch code (`budgets/README.md:170-171`).
  - so Dự phòng một số (`budgets/review/budget-review.policy.ts:166-168`, `budgets/budget-view/budget-table-view.service.ts:79-110`).
- **Tập kỳ của tháng `M` (B1-R5, B1-R13):** đúng tập lượt seat-tháng của `M` duyệt — kỳ có seat trong `M`
  (`LicensingSeatMonthApi.getSeatsOfMonth`) ∪ kỳ đã có dòng seat-tháng của `M` (`SeatMonthRepo.subscriptionIdsOfMonth`)
  (`budgets/seat-month/seat-month.service.ts:60-72`), lọc `K2` `TERM`. Kỳ `DRAFT`, kỳ không seat nào trong `M` ⟹ không có dòng.
- **Hành vi đúng (công thức):** với mỗi kỳ `P` của tập và tháng `M` (`D` ngày):

  ```text
  daysPaid(P, M)   = số ngày của M nằm trong [startDate(P), endExclusive(P))
                     endExclusive = startDate(kỳ nối tiếp) nếu có, endDate(P)+1 nếu có, không thì hết tháng
  paidSeatDays     = q(P) × daysPaid(P, M)                      -- B1: q = purchased_quantity của kỳ; NULL ⟹ cờ NO_QUANTITY, idleCost null
  heldSeatDays     = Σ seat của P: số ngày của M seat đang giữ  -- cùng khoảng giữ của seat-tháng (src/core/seat-month-cost.ts seatHeldRange)
  idleCost(P, M)   = roundHalfAway( max(0, paidSeatDays − heldSeatDays) × monthly(P) / D )
  invoiceVariance(M)    = Σ hóa đơn K2 Finance xác nhận trong M: W3-05
  deviceLotPurchases(M) = 0 ở B1 (B3 W3-25: Σ phân bổ POOL_DEVICE_LOT)   replacementKeys(M) = 0 ở B1 (B3: POOL_REPLACEMENT)
  sharedPool(M)    = idleCost + invoiceVariance + invoiceVarianceInReview + deviceLotPurchases + replacementKeys   -- thay `unallocated`
  lũy kế năm       = Σ M từ tháng 1 tới tháng đã tính cuối      overReserve ⟺ lũy kế > Dự phòng kho của chu kỳ (bằng ⟹ không)
  ```

  - Ngày seat giữ mà người giữ **không có phòng** vẫn là _đã giữ_ (việc của _Chưa phân bổ Cost Center_, `withoutCostCenter` giữ).
  - Đẳng thức (test): `Σ seat-tháng các phòng của P + Σ seat-tháng không phòng + idleCost(P) = paidSeatDays × monthly / D`
    (± làm tròn từng đoạn, ≤ số đoạn đồng).
  - **Giới hạn B1 có chủ đích:** `q(P)` là số đang lưu của kỳ; một lần mua thêm giữa kỳ làm số seat tính từ đầu kỳ. B3 (W3-22) thay
    `q` bằng sổ theo ngày. Ảnh chụp tháng đã chốt không tính lại (`QĐ-62m`).
  - Chạy lại: số liệu tính khi đọc/khi chốt rà soát cho mọi tháng `endedMonthsOf(today)` (`budgets/seat-month/seat-month.policy.ts:98`);
    không có bảng riêng phải chạy lại.

- **Nơi tính / ghi:** capability mới `budgets/shared-pool-line/`: `shared-pool-line.policy.ts` (thuần: `idleCostOf`, `poolLineOf`,
  `cumulativeOf`), `shared-pool-line-facts.service.ts` (kỳ qua `SubscriptionPeriodApi.getPurchaseFacts` — thêm `startDate`,
  `endExclusive`, `monthlyPriceMinor`; seat qua `LicensingSeatMonthApi.getSeatsOfMonth`; phương sai từ `invoices` của budgets qua
  `shared-pool-line.repo.ts`). `seat-month-pool.policy.ts` `paidMinor`/`poolLineMinor` **bỏ**, nơi gọi chuyển sang facts mới; ảnh chụp
  rà soát (`budgets/review/budget-review-period-writer.service.ts:99-101`) ghi thêm bốn dòng con (cột M2:
  `budget_review_periods.shared_pool_idle_minor`, `shared_pool_variance_minor`, `shared_pool_variance_in_review_minor`,
  `shared_pool_device_lot_minor`, `shared_pool_replacement_minor`, `NULL` cho bản cũ).
- **API:** `seatMonthChargeList` `poolLines[]` thêm `idleCost`, `idleCostByLabel` (W3-06), `invoiceVariance`,
  `invoiceVarianceInReview`, `deviceLotPurchases`, `replacementKeys`, `flags[]` (`NO_PRICE`, `NO_QUANTITY`); `unallocated` giữ tên,
  **nghĩa đổi** = `sharedPool(M)`. `budgetSummary` thêm `sharedPoolLines { idleCost, invoiceVariance, invoiceVarianceInReview,
deviceLotPurchases, replacementKeys, total, reserve, overReserve }`; `sharedPoolUnallocated` = `total`.
- **Tiêu chí chấp nhận:**

  | Ca (một thuê bao Standard 500.000 đ)                                                                          | Số                                                                                          |
  | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
  | 11/2026 (30 ngày), 10 seat cả tháng; seat 1–4 Thiết kế, 5–7 Kỹ thuật, seat 8 cấp 16/11, 9–10 Trống (`KHO-22`) | trả 300, giữ 120 + 90 + 15 = 225 ⟹ **1.250.000 đ** (25 %)                                   |
  | 01/2027 (31 ngày), 12 seat; Hùng, Mai thu hồi 15/01 (giữ ngày 1–14) — diệt `ceil`                             | trả 372, giữ 310 + 28 = 338 ⟹ 34 × 500.000 / 31 = **548.387 đ** (`ceil` cho 548.388)        |
  | 02/2027 (28 ngày), 12 seat, 10 người giữ                                                                      | 56 seat-ngày Trống ⟹ **1.000.000 đ**                                                        |
  | 02/2027, `q` = 10 nhưng 11 người giữ cả tháng (dữ liệu lệch) — diệt bỏ `max(0)`                               | `max(0, 280 − 308)` ⟹ **0** (không âm)                                                      |
  | Kỳ cũ kết thúc 30/06/2027, kỳ mới từ 01/07/2027 (11 seat)                                                     | tháng 7 chỉ đọc kỳ mới; tháng 6 chỉ kỳ cũ                                                   |
  | Kỳ không có giá tháng                                                                                         | `idleCost` `null`, cờ `NO_PRICE`, không đoán                                                |
  | Kỳ `purchased_quantity` `NULL`                                                                                | `idleCost` `null`, cờ `NO_QUANTITY`                                                         |
  | Kỳ `DRAFT` / kỳ không có seat nào trong tháng                                                                 | không có dòng                                                                               |
  | Dự phòng 12.000.000; lũy kế tới 11: Trống 8.100.000 + chênh lệch 900.000                                      | 9.000.000 ⟹ không cảnh báo                                                                  |
  | như trên, chênh lệch 3.900.000 (biên — diệt `>=`)                                                             | đúng 12.000.000 ⟹ **không** cảnh báo                                                        |
  | như trên, chênh lệch 4.000.000                                                                                | 12.100.000 > 12.000.000 ⟹ một thông báo `BUDGET_SHARED_POOL_OVER_RESERVE` tháng 11 (key cũ) |

- **Test:** unit `budgets/shared-pool-line/shared-pool-line.policy.spec.ts` (`it.each` bảng trên), `shared-pool-line-facts.service.spec.ts`
  (tập kỳ); integration `test/integration/budgets/shared-pool-line-identity.integration-spec.ts` (đẳng thức kho trên ca 11/2026);
  http `test/http/budgets/seat-month-charges.http-spec.ts` (trường mới).

---

## W3-05

**Số kỳ vọng của hóa đơn `K2`, _Chênh lệch hóa đơn kho_, ngưỡng mở `SBF-11a`.**

- **Nguồn:** `QĐ-116av` (số kỳ vọng hóa đơn kỳ = số seat theo sổ tại ngày đầu kỳ × giá tháng × 1 hoặc 12), `KHO-09` (hóa đơn lần nâng),
  `QĐ-116ak` (ngưỡng tham số mặc định 5 %, Finance sửa), `QĐ-117l` (hai trường hợp độc lập mở `SBF-11a`; quá ngưỡng **bất kể nguyên
  nhân**; lý do đóng _Chênh tỷ giá/phí thẻ — đã cập nhật giá dòng_), `KHO-23` (ghi vào **tháng Finance xác nhận**); Owner Q-E (so
  **tiền hàng chưa thuế**; thuế không khấu trừ vẫn vào _Chênh lệch hóa đơn kho_ nhưng không tính ngưỡng).
- **Hiện trạng:** so khớp chỉ số lượng và đơn giá theo tiền gốc, không ngưỡng
  (`requests/purchase-invoice/purchase-invoice-match.policy.ts:32-45`); số kỳ vọng của link `SUBSCRIPTION` = `purchasedQuantity`
  (`purchase-invoice-plan.service.ts:220-226`); cờ `OVER_APPROVED` (`:333-350`); hóa đơn `K2` vào kho, không chạm cam kết
  (`confirmation/purchase-invoice-confirmation.service.ts:103-123`); thực chịu = `net + nonDeductibleTax`
  (`budgets/invoice/purchase-invoice-recorder.service.ts:61`).
- **Hành vi đúng:**

  ```text
  net           = tiền hàng chưa thuế của hóa đơn (VND)          actual = net + nonDeductibleTax
  expected      =
    hóa đơn kỳ (link SUBSCRIPTION, nhãn RENEWAL/PERIOD): q(P) × monthly(P) × (12 nếu billingCycle = ANNUAL, 3 nếu QUARTERLY — N8, 1 nếu MONTHLY)
        B1: q(P) = purchased_quantity hiện tại của kỳ (giới hạn: gồm cả seat mua thêm sau ngày đầu kỳ; B3 đọc sổ tại ngày đầu kỳ)
    hóa đơn lần nâng (link REQUEST, gói K2, tác vụ cấp purchaseKind = POOL_TOP_UP của Request):
        nhóm tác vụ theo ngày mua d (provisioning_tasks.purchased_at, ngày tổ chức); với mỗi nhóm n_d tác vụ:
          e_d = roundHalfAway( n_d × monthly × cover(d, R − 1) )        -- làm tròn một lần cho mỗi nhóm (= một lần mua ở B3)
        expected = Σ_d e_d
        R = billingCycle MONTHLY ⟹ ngày thanh toán kế (bất kể kỳ cam kết 1 hay 12 — N4: hãng thu theo chu kỳ trả);
            ANNUAL ⟹ renewalDate của kỳ, không có ⟹ endDate + 1; QUARTERLY ⟹ ngày thanh toán quý kế
        cover(a, b) = Σ tháng lịch giữa a và b: số ngày được phủ / số ngày của tháng (KHO-09)
  variance      = actual − expected                        tháng = tháng (giờ tổ chức) Finance xác nhận
  quá ngưỡng    ⟺ |net − expected| × 100 > threshold × expected        (so TIỀN HÀNG; bằng ⟹ không quá)
  threshold     = K2_INVOICE_VARIANCE_THRESHOLD_PERCENT (mặc định 5)
  ```

  - Không quá ngưỡng ⟹ `variance` vào `invoiceVariance` của tháng xác nhận. Quá ngưỡng ⟹ mở (hoặc bổ sung) **một** hồ sơ `SBF-11a`,
    `mismatches` thêm `EXPECTED_AMOUNT`; `variance` vẫn ghi tháng xác nhận nhưng vào `invoiceVarianceInReview` tới khi hồ sơ đóng; đóng
    hồ sơ ⟹ chuyển sang `invoiceVariance` (tháng giữ nguyên). **Tự chốt** — đẳng thức kho phải giữ.
  - Hai trường hợp độc lập (lệch số lượng/đơn giá hiện có **và** lệch số kỳ vọng) cùng một hồ sơ (`invoice_discrepancy_cases` unique
    theo hóa đơn), `mismatches` gộp.
  - Đóng hồ sơ thêm `outcome = EXCHANGE_RATE_LINE_PRICE_UPDATED` (M3): không đòi `differenceMinor > 0`; thông báo
    `SUBSCRIPTION_PRICE_REVIEW` cho IT phụ trách thuê bao theo luật R1 (không tự sửa giá).
  - Không có số kỳ vọng (kỳ thiếu giá/số seat, hoặc không tìm được ngày mua) ⟹ `pool_expected_minor` `NULL`, `variance = actual`,
    `pool_variance_in_review = false`, cờ `NO_EXPECTED_AMOUNT` ở response, **không** mở hồ sơ (**Tự chốt**: không đoán số).
  - Hóa đơn `K1`/`K4` không xét ngưỡng này.

- **Dữ liệu (M2):** `invoices.pool_expected_minor BIGINT NULL`, `pool_variance_minor BIGINT NULL`, `pool_variance_month DATE NULL`,
  `pool_variance_in_review BOOLEAN NOT NULL DEFAULT false`. CHECK `invoices_pool_figures`: (`pool_variance_minor IS NULL` ⟺
  `pool_variance_month IS NULL`) **và** (`pool_expected_minor IS NULL` ⟹ `pool_variance_in_review = false`) **và**
  (`pool_variance_minor IS NULL` ⟹ `pool_expected_minor IS NULL AND pool_variance_in_review = false`). Tham số
  `K2_INVOICE_VARIANCE_THRESHOLD_PERCENT` (int 1–50, mặc định 5, `%`, nhóm `BUDGET`, `owner: 'FINANCE'`). M3: `mismatches` nhận
  `EXPECTED_AMOUNT` (sửa CHECK chữ của cột nếu có).
- **Nơi tính / ghi:** policy thuần `requests/purchase-invoice/pool-expectation/purchase-invoice-pool-expectation.policy.ts`; ghi trong tx
  xác nhận (`purchase-invoice-confirmation.service.ts`) qua `BudgetsApi.recordPurchaseInvoice` (thêm trường).
- **Tiêu chí chấp nhận:**

  | Ca                                                                                    | Kỳ vọng                                                                 | Tiền hàng / thực chịu   | Tỷ lệ so tiền hàng | Kết quả                                                                          |
  | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------- | ------------------ | -------------------------------------------------------------------------------- |
  | Hóa đơn kỳ **Standard** 01/07/2027 (11 seat, trả năm)                                 | 11 × 500.000 × 12 = **66.000.000**                                      | 68.000.000 / 68.000.000 | +3,03 %            | `invoiceVariance` +2.000.000                                                     |
  | như trên, tiền hàng 69.500.000                                                        | 66.000.000                                                              | 69.500.000 / 69.500.000 | +5,30 %            | hồ sơ `EXPECTED_AMOUNT`; +3.500.000 vào `invoiceVarianceInReview`                |
  | như trên, tiền hàng 69.300.000 (biên — diệt `>=`)                                     | 66.000.000                                                              | 69.300.000              | đúng 5,00 %        | **không** mở; `invoiceVariance` +3.300.000                                       |
  | Hóa đơn kỳ **Premium** 01/07/2027 (2 seat), VAT 10 % không khấu trừ (Q-E)             | 2 × 2.500.000 × 12 = **60.000.000**                                     | 60.000.000 / 66.000.000 | 0 %                | không mở; `invoiceVariance` **+6.000.000** (thuế)                                |
  | Premium, tiền hàng 63.600.000 + thuế 6.360.000                                        | 60.000.000                                                              | 63.600.000 / 69.960.000 | +6,00 %            | mở hồ sơ; **+9.960.000** vào `invoiceVarianceInReview`                           |
  | Finance đặt ngưỡng 3; Standard tiền hàng 68.000.000                                   | 66.000.000                                                              | 68.000.000              | 3,03 % > 3         | mở hồ sơ                                                                         |
  | Hóa đơn tháng 7/2027 Standard cam kết 12 **trả tháng** (11 seat), tiền hàng 5.775.000 | 11 × 500.000 = **5.500.000**                                            | 5.775.000               | đúng 5,00 %        | không mở                                                                         |
  | như trên, tiền hàng 5.775.001                                                         | 5.500.000                                                               | 5.775.001               | 5,00002 %          | mở hồ sơ                                                                         |
  | Lần nâng 2 tác vụ Standard cùng ngày mua 21/11/2026, gia hạn 01/07/2027               | 2 × 500.000 × (10/30 + 7) = **7.333.333** (một lần tròn)                | 7.298.630               | −0,47 %            | `invoiceVariance` −34.703                                                        |
  | Lần nâng 2 tác vụ khác ngày: 21/11/2026 và 01/12/2026                                 | 3.666.667 + 3.500.000 = **7.166.667**                                   | —                       | —                  | số kỳ vọng như cột 2                                                             |
  | N4: lần nâng 1 seat Standard 21/11/2026, cam kết 12 **trả tháng**, thanh toán ngày 01 | `R` = 01/12/2026 ⟹ 500.000 × 10/30 = **166.667** (không phải 3.666.667) | —                       | —                  | số kỳ vọng như cột 2                                                             |
  | N8: hóa đơn kỳ trả **quý**, 4 seat × 300.000                                          | 4 × 300.000 × 3 = **3.600.000**                                         | —                       | —                  | số kỳ vọng như cột 2                                                             |
  | Kỳ không `renewalDate`, `endDate` 30/06/2027; lần nâng 21/11/2026, 1 seat             | `R` = 01/07/2027 ⟹ **3.666.667**                                        | —                       | —                  | —                                                                                |
  | Hóa đơn kỳ của thuê bao thiếu giá tháng                                               | `NULL`                                                                  | 10.000.000              | —                  | `variance` = 10.000.000, `in_review` false, cờ `NO_EXPECTED_AMOUNT`, không hồ sơ |
  | Lệch tỷ giá 8 % có số lượng đúng                                                      | —                                                                       | —                       | 8 %                | mở; đóng `EXCHANGE_RATE_LINE_PRICE_UPDATED` ⟹ chuyển sang `invoiceVariance`      |
  | Hóa đơn `K1`/`K4` lệch tỷ giá                                                         | —                                                                       | —                       | —                  | không mở hồ sơ theo ngưỡng                                                       |

- **Test:** unit `purchase-invoice-pool-expectation.policy.spec.ts` (`it.each` bảng; ca diệt `>=`, `ceil`), `invoice-discrepancy-closure.policy.spec.ts`
  (outcome mới), `purchase-invoice-confirmation.service.spec.ts` (gộp `mismatches`); http
  `test/http/requests/purchase-invoice-confirmation.http-spec.ts` (`poolExpected`, `poolVariance`, mở hồ sơ); integration
  `test/integration/requests/purchase-invoice-pool-variance.integration-spec.ts` (CHECK `invoices_pool_figures`).

---

## W3-06

**Nhãn seat Trống (2)(3) và tỷ lệ chi phí seat/khóa Trống 10 %.**

- **Nguồn:** `QĐ-115k` (ba nhãn, nhãn trên thắng), `QĐ-116aq` (_Bị khóa tới dd/mm_ = ngày sớm nhất giảm được), `KHO-20`, `KHO-26`,
  `QĐ-115l` (ngưỡng 10 % báo IT Admin, không tính phần bị khóa ở mức tối thiểu/cỡ bậc), Owner Q-F (sau hạn chót báo hủy ⟹ _Bị khóa tới_
  ngày gia hạn **kỳ sau**).
- **Hiện trạng:** không có nhãn hay tỷ lệ. Điểm điều chỉnh: `adjustmentPointOf(input, today)` trả `{ point, deadline, end }`
  (`catalog/subscription/obligation/subscription-obligation.policy.ts:150-163`); gói năm: `deadline` = hạn chót báo hủy, `point` = `deadline`
  − 30 ngày; gói tháng: `deadline` = ngày thanh toán kế ≥ hôm nay, `point` = `deadline` − 7 ngày (`:210-224`).
- **Hành vi đúng (B1, theo kỳ, kỳ _Mua cố định_):** mỗi seat-ngày Trống của ngày `d` mang nhãn, với `a = adjustmentPointOf(kỳ, d, windows)` (`windows` = tham số `monthlyDays`/`annualDays` của kỳ, đọc như
  `adjustmentPeriodInstantOf` — `subscription-obligation.policy.ts:150-163, :187-200`):
  - **(2) Giảm được** ⟺ `a.point ≤ d ≤ a.deadline` (hạn chót **chưa qua** — B1-R3; ngày hạn chót còn trong cửa sổ).
  - **(3) Bị khóa tới `R`** còn lại, `R` = **ngày sớm nhất giảm được** (`earliestReducibleOn(kỳ, d)`, hàm dùng chung với W3-09):
    - cam kết 12: `d ≤ a.deadline` ⟹ ngày gia hạn của kỳ (`a.end`); `d > a.deadline` (sau hạn chót, trước ngày gia hạn) ⟹ tách theo
      số đã ghi cho kỳ sau `q_next` (ca gia hạn; chưa ghi ⟹ `q_next` = số seat kỳ cũ — R-LATE): seat Trống thuộc **phần đã ghi giảm**
      (`min(idle(d), seats(d) − q_next)`) ⟹ _Bị khóa tới_ **ngày gia hạn kỳ này** (sẽ bỏ ở kỳ sau); seat Trống còn nằm trong `q_next` ⟹ _Bị khóa tới_
      **ngày gia hạn kỳ sau** = ngày gia hạn + 12 tháng (Q-F, Owner làm rõ 24/11);
    - cam kết 1: `a.deadline` (ngày thanh toán kế ≥ `d`).
  - Nhãn (1) _Lỡ điểm điều chỉnh_ cần mục tiêu đã chốt ⟹ W3-22 (B3). B1 trả `missedAdjustment: '0'`.
  - Tiền của nhãn trong tháng: chia seat-ngày Trống theo đoạn ngày liền nhãn, mỗi đoạn `roundHalfAway(seatDays × monthly / D)`, đoạn
    cuối nhận phần dư để Σ nhãn = `idleCost`.
  - **Tỷ lệ tháng** = `(idleCost − idleAtMinimum) / (paidSeatDays × monthly / D)`; `idleAtMinimum` = seat-ngày Trống chỉ tồn tại vì
    `vendorMinimumSeats` (`max(0, min(vendorMinimum, q) − held)` mỗi ngày) quy ra tiền. Tỷ lệ **> 10 %** (bằng ⟹ không) ⟹ thông báo
    `IDLE_SEAT_COST_RATIO_HIGH` theo luật R1 (IT phụ trách thuê bao; không dùng được ⟹ Super Admin), key
    `IDLE_SEAT_COST_RATIO_HIGH:<subscriptionId>:<YYYY-MM>`, trong lượt giờ của `BudgetReviewSweeper` cho tháng vừa tính đủ.
- **Nơi tính:** `budgets/shared-pool-line/shared-pool-line-label.policy.ts` (thuần); điểm điều chỉnh qua `SubscriptionPeriodApi`
  (thêm `adjustmentWindowsOf(subscriptionIds, month)` và `earliestReducibleOn(subscriptionId, day)` dùng lại policy có sẵn).
- **Tiêu chí chấp nhận:**

  | Ca                                                                                            | Kết quả                                                                                                                                                                                                       |
  | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 05/2027 Standard, 1 seat Trống cả tháng (điểm mở 02/05, hạn chót 01/06)                       | 01/05: **16.129** _Bị khóa tới 01/07/2027_; 02–31/05: **483.871** _Giảm được_                                                                                                                                 |
  | 06/2027 Standard, 1 seat Trống cả tháng, chưa ghi kết quả (Q-F, R-LATE: `q_next` = 12)        | 01/06: **16.667** _Giảm được_; 02–30/06: **483.333** _Bị khóa tới 01/07/2028_                                                                                                                                 |
  | 06/2027 Standard 12 seat, 2 seat Trống cả tháng; Khoa đã ghi 28/05 kỳ sau **11** (Q-F làm rõ) | 01/06: **33.333** _Giảm được_ (2 seat-ngày); 02–30/06: **483.333** _Bị khóa tới 01/07/2027_ (1 seat, phần đã ghi giảm) + **483.334** _Bị khóa tới 01/07/2028_ (1 seat, đoạn cuối nhận phần dư); Σ = 1.000.000 |
  | Figma: Mai trả seat 20/01/2027, thanh toán ngày 15, seat Trống tới 20/02                      | 20/01–07/02 _Bị khóa tới 15/02_; 08/02–15/02 _Giảm được_; 16/02–20/02 _Bị khóa tới 15/03_                                                                                                                     |
  | Tỷ lệ tháng 1/2/3/4 năm 2027 (bảng 4A file giải thích)                                        | 9,14 % / 16,67 % / 10,75 % / 8,33 % ⟹ thông báo tháng 2 và 3, không tháng 1, 4                                                                                                                                |
  | Biên 10 %: 10 seat × 30 ngày, 30 seat-ngày Trống (diệt `>=`)                                  | đúng 10,00 % ⟹ **không** thông báo; 31 seat-ngày ⟹ 10,33 % ⟹ thông báo                                                                                                                                        |
  | Kỳ tối thiểu 5 seat, 4 người dùng (seat Trống ở mức tối thiểu)                                | không tính vào tỷ lệ; vẫn vào `idleCost`                                                                                                                                                                      |
  | IT phụ trách bị khóa                                                                          | thông báo tới Super Admin                                                                                                                                                                                     |
  | Chạy lượt giờ hai lần trong tháng                                                             | một thông báo mỗi (thuê bao, tháng)                                                                                                                                                                           |

- **Test:** unit `shared-pool-line-label.policy.spec.ts` (`it.each` bảng), `subscription-obligation.policy.spec.ts` (`earliestReducibleOn`);
  unit `budget-review-reminder.service.spec.ts` (một lần mỗi tháng).

---

## W3-07

**Cam kết `K2` giữ theo tháng: tự giải phóng phần dư mỗi tháng, dọn phần dư năm cũ.**

- **Nguồn:** `QĐ-116ac` (cuối mỗi tháng — hoặc khi quyền kết thúc — tự giải phóng phần cam kết của tháng vượt seat-ngày thực; điều chuyển
  giữa tháng mỗi phòng chịu seat-ngày của mình; chốt tháng 12 tự dọn phần dư `K2` của năm cũ, hiện ở _điều chỉnh kỳ trước_), A-1/A-2/A-4/
  A-18 của AUDIT-A, `QĐ-106c` (cam kết không tính lại khi giá đổi), `QĐ-104k`(1) (tháng lịch), Owner Q-G (`priorYearReleased` gồm lượt
  `MONTH_END` tháng 12 chạy trong tháng 1).
- **Hiện trạng:**
  - cam kết một số cho cả năm, áp seat-tháng `min(amount, held)` (`budgets/seat-month/seat-month.policy.ts:84-92`,
    `seat-month-plan.policy.ts:103-112`);
  - giải phóng theo ngày **chỉ** khi cấp muộn (`LATE_GRANT`), thu hồi (`REVOKED`), điều chuyển (`TRANSFER_EFFECTIVE`)
    (`requests/grant/seat-release.policy.ts:131-173`, `src/core/seat-month-cost.ts:32-53`); chỉ năm còn mở (`seat-release.policy.ts:111-122`);
  - **không** giải phóng cuối tháng ⟹ phần dư nằm mãi ở _Đang giữ_. Trạng thái cam kết `HELD`/`RELEASED`/`EXPENSED`
    (`prisma/models/budgets.prisma:271-275`).
- **Hành vi đúng — sổ tháng của cam kết:**
  1. **Dữ liệu (M2):** bảng `budget_commitment_months` (budgets): `commitment_id` FK, `month DATE` (ngày 1), `seat_count INT ≥ 1`,
     `share_minor BIGINT ≥ 0`, `applied_minor BIGINT ≥ 0`, `released_minor BIGINT ≥ 0`, `settled_at TIMESTAMPTZ NULL`; PK
     (`commitment_id`, `month`); CHECK `applied_minor + released_minor <= share_minor`; trigger: không đổi `commitment_id`, `month`,
     `seat_count`, `share_minor` sau khi chèn. M3 thêm `CommitmentReleaseReason` `MONTH_END`, `YEAR_END_SEAT_MONTHS`.
  2. **Lúc giữ** (`requests/spend-effects/spend-effects.service.ts:40-88`; lượt 01/01
     `requests/year-start-commitments/year-start-commitments-batch.service.ts`): cam kết `K2` (giá seat-tháng `s` không `NULL`) ghi một
     dòng cho **mỗi tháng lịch** của năm mà số tiền Request tính (W3-02 mục 3, cùng hàm `calendarMonthsIn`): `share = s × seat_count`.
     Lượt 01/01 ghi theo từng seat (tháng 1 → tháng chứa ngày cuối còn giữ; không ngày cuối: 1 → 12) rồi gộp theo tháng. Dư làm tròn
     (cam kết cũ `ceil`) cộng vào dòng tháng cuối. `Σ share = amount_minor`. `K1`/`K4`: không có dòng tháng.
  3. **Áp seat-tháng:** mỗi dòng `seat_month_charges` của cam kết `C`, tháng `M`, **cùng Cost Center** ⟹
     `applied += min(amount, share − applied − released)` của dòng (`C`, `M`); phần vượt không lấy tháng khác (thực chi không cam kết —
     `QĐ-106c`). Cam kết không dòng tháng (dữ liệu cũ) ⟹ luật cũ `min(amount, held)`.
  4. **Giá mới (B1-R14):** một cột giá, không ngày hiệu lực ⟹ giá mới áp **mọi tháng chưa có `seat_month_runs`** của kỳ (tháng đã tính giữ
     ảnh chụp). Cam kết không đổi (`QĐ-106c`).
  5. **Giải phóng theo sự kiện** (`LATE_GRANT`, `REVOKED`, `TRANSFER_EFFECTIVE`, rút/hủy/thất bại): số tiền giữ công thức hiện có, nhưng
     **rải** vào dòng tháng: mỗi tháng `released += min(phần của tháng, share − applied − released)`; tháng có một phần ngày ⟹ phần
     ngày của chính tháng đó. Một seat của Request nhóm chỉ giải phóng `s` mỗi tháng của nó. **Giải phóng tay `REMAINDER`** của Finance
     (`budgets/commitment/commitment.service.ts:119`) rải từ **tháng cuối ngược về** (12, 11, …), mỗi tháng tối đa phần còn giữ (**Tự
     chốt** — tháng đang chạy giữ phần cần nhất).
     **F1:** số ghi vào `budget_commitment_releases` = Σ phần các dòng tháng **thực nhận** (không phải số công thức của `lateGrantShare`/
     `seat-release.policy.ts`); `applied`/`released` của cam kết luôn = Σ dòng tháng. **F2:** với `K2`, tháng đầu/cuối của khoảng giải phóng lấy
     từ chính dòng tháng (min/max `month` của cam kết), **không** qua `SeatCoverage` (`firstMonthOf`/`lastMonthBeginsOn` tháng cuốn).
     **F15 (chấp nhận):** làm tròn từng đoạn có thể vượt `share` 1 đ ⟹ `min` cắt 1 đ thành thực chi không cam kết; Σ dòng vẫn = `share`.
  6. **Đảo seat-tháng** (`budget_commitment_seat_month_reversals`): trả lại `applied` vào đúng dòng tháng; nếu dòng đã chốt ⟹
     `settled_at = NULL` (lượt chốt sau tính lại — B1-R10).
     Đảo làm `held > 0` ⟹ trạng thái về `HELD` (F3, khớp `giveBackApplied`).
  7. **Trạng thái cam kết:** `held = amount − Σ applied − Σ released` (dòng tháng) ⟹ `held > 0` ⟹ `HELD`; `held = 0` ⟹ `EXPENSED` nếu
     `Σ applied > 0`, ngược lại `RELEASED` (**Tự chốt** — khớp nghĩa hiện có của hai trạng thái). Chỉ đổi khi `held` về 0.
     **F3:** trạng thái tính lại sau **mọi** thay đổi dòng tháng (áp, giải phóng, đảo), không chỉ khi `held` về 0.
  8. **Chốt tháng** (job, [SPEC §8](SPEC.md#8-job-và-thông-báo)): tháng `M` thuộc `endedMonthsOf(today)` (tháng của năm nay trước tháng
     hiện tại; trong tháng 1: tháng 12 năm trước — `seat-month.policy.ts:98-104`) và **mọi** kỳ của **tập `M`** (W3-04: kỳ có seat trong
     `M` ∪ kỳ đã có dòng seat-tháng của `M`) đã có `seat_month_runs` cho `M` ⟹ mỗi dòng (`C`, `M`) chưa chốt, `C.state = HELD`:
     `release = max(0, share − applied − released)`, ghi `budget_commitment_releases` lý do `MONTH_END`, `settled_at = now()`. Không bao giờ
     "giữ lại" phần đã giải phóng.
     **F3, F6(b):** idempotent **chỉ** bằng `settled_at` + khóa dòng (9b) — không khử trùng theo (lý do, tham chiếu); một dòng tháng có thể có
     nhiều dòng `MONTH_END` qua các lượt (đảo rồi chốt lại); `release = 0` ⟹ chỉ đặt `settled_at`, **không** ghi dòng 0 đ.
  9. **Dọn năm cũ:** chốt xong tháng 12 năm `Y` (chạy trong tháng 1 năm `Y+1`) ⟹ mọi cam kết `K2` năm `Y` còn `held > 0` (kể cả cam kết
     cũ không dòng tháng) ⟹ giải phóng hết, lý do `YEAR_END_SEAT_MONTHS`. Rà soát tháng 1 năm `Y+1` hiện `priorYearReleasedMinor` trên dòng
     Cost Center (M2: `budget_review_lines.prior_year_released_minor`) = Σ giải phóng của cam kết năm `Y` của Cost Center đó có lý do
     `YEAR_END_SEAT_MONTHS` **hoặc** `MONTH_END` của dòng tháng 12 (Q-G). Ngoại lệ cố ý so với `releasable` (chỉ năm mở —
     `seat-release.policy.ts:111-122`): job hệ thống được giải phóng năm đã đóng.
     **F6(a, c):** tháng 12 năm `Y` được chốt và năm `Y` được dọn khi mọi kỳ của tập đã có dấu tháng 12 **hoặc** hôm nay ≥ 01/02 năm `Y+1`
     (tháng 12 đã rời `endedMonthsOf` — seat-tháng của nó sẽ không bao giờ được tính tự động nữa); mỗi lượt dọn **mọi năm < năm nay** còn dòng
     tháng chưa chốt hoặc cam kết `K2` còn giữ. `YEAR_END_SEAT_MONTHS` **rải** vào các dòng tháng chưa chốt (mỗi dòng phần còn giữ, đặt
     `settled_at`); phần không thuộc dòng nào (cam kết cũ không dòng tháng) ghi ở mức cam kết.
- **Nơi tính / ghi:** policy thuần `budgets/commitment/month/commitment-month.policy.ts` (`monthRowsOf`, `applyToMonth`, `spreadRelease`,
  `spreadRemainder`, `settlementOf`, `stateOf`); service `budgets/commitment/month/commitment-month-settlement.service.ts` (một tx mỗi cam
  kết); bước job trong `SeatMonthSweeper` sau `chargeEndedMonths` (`budgets/seat-month/seat-month.service.ts:37-46`, job
  `seat-month.job.ts:49`). Thứ tự khóa: advisory `commitment-month:<org>:<month>` (0) → `budget_commitments` FU (9) →
  `budget_commitment_months` FU (9b) → CC-year (10) chỉ khi cam kết đã gắn phiên bản (E1).
- **Tiêu chí chấp nhận (mỗi ca kiểm `Σ applied + Σ released = amount` cuối năm):**

  | Ca  | Diễn biến                                                                                                                                                                     | Kết quả                                                                                                                                                  |
  | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | A   | Lan, Standard _Dùng lâu dài_, duyệt và cấp 21/11/2026; cam kết 2026 = 1.000.000, dòng 11 và 12 mỗi dòng 500.000                                                               | lúc cấp `LATE_GRANT` dòng 11 = **333.333**; seat-tháng 11 = **166.667**; chốt 11: 0; còn giữ 500.000 cho tháng 12                                        |
  | B   | Hùng, cam kết 2027 `YEAR_START` 6.000.000 (12 × 500.000); thu hồi 15/01/2027                                                                                                  | dòng 1: giải phóng **274.194**, áp **225.806**; dòng 2–12 giải phóng 500.000; tổng giải phóng **5.774.194**; chốt tháng 1: 0; `EXPENSED`                 |
  | C   | Duyệt 15/12/2026 (_Dùng lâu dài_), chưa cấp tới 31/12; dòng 12 = 500.000                                                                                                      | chốt tháng 12 (lượt tháng 1/2027): `MONTH_END` **500.000**; rà soát 1/2027 `priorYearReleased` **500.000** (Q-G); `RELEASED`                             |
  | C'  | Tiếp ca C: `YEAR_START` 2027 6.000.000; cấp 10/01/2027                                                                                                                        | `LATE_GRANT` dòng 1 = **145.161**; seat-tháng 1 = **354.839**; chốt tháng 1: 0                                                                           |
  | D   | Giá giảm 500.000 → 450.000, sửa ngày 15/03/2027 (trước lượt tính tháng 3 ngày 01/04); seat giữ cả tháng 3                                                                     | seat-tháng 3 = 450.000 ⟹ chốt tháng 3: `MONTH_END` **50.000**; tháng 2 (tính 01/03) giữ 500.000                                                          |
  | D2  | Như D nhưng sửa giá ngày 02/04/2027 (tháng 3 đã tính) — biên                                                                                                                  | tháng 3 giữ 500.000, `MONTH_END` 0; tháng 4 = 450.000 ⟹ `MONTH_END` 50.000                                                                               |
  | E   | Giá tăng lên 550.000, sửa 10/07/2027 (trước lượt tháng 7) — diệt bỏ `min` ở `applyToMonth`                                                                                    | tháng 7: áp **500.000**, 50.000 là thực chi không cam kết; cả năm thực chi 6.300.000, áp 6.000.000                                                       |
  | F   | Cam kết cũ 2026 (không dòng tháng) 1.000.000, áp 700.000                                                                                                                      | chốt tháng 12/2026 ⟹ `YEAR_END_SEAT_MONTHS` **300.000**; rà soát 1/2027 `priorYearReleased` 300.000                                                      |
  | F'  | Một Cost Center có cả ca C và ca F                                                                                                                                            | `priorYearReleased` = 500.000 + 300.000 = **800.000**                                                                                                    |
  | G   | Điều chuyển 26/03/2027 (31 ngày), seat 500.000                                                                                                                                | phòng cũ áp **403.226** (ngày 1–25); `TRANSFER_EFFECTIVE` dòng 3 = **96.774** + dòng 4–12; chốt tháng 3: 0                                               |
  | H   | Chạy chốt tháng 3 hai lần / hai instance cùng lúc (F3)                                                                                                                        | không dòng trùng trong **một** lượt (khóa 9b + `settled_at`); integration có barrier, không `40P01`                                                      |
  | I   | Một kỳ `K2` có seat tháng 3 mà chưa có `seat_month_runs` tháng 3                                                                                                              | không cam kết nào chốt tháng 3; kỳ `DRAFT`/kỳ không seat tháng 3 **không** chặn                                                                          |
  | J   | Seat cấp 31/01/2027 → ngày cuối 15/03/2027, cam kết 1.500.000 (3 dòng × 500.000) — B1-R4, F5                                                                                  | lúc cấp `LATE_GRANT` dòng 1 = **483.871**; seat-tháng 1/2/3 = **16.129** / 500.000 / **241.935**; `MONTH_END` 1/2/3 = 0 / 0 / **258.065**; Σ = 1.500.000 |
  | K   | Tính lại tháng 3 sau khi chốt (đảo 100.000 của ca D)                                                                                                                          | dòng tháng 3 `settled_at = NULL`; lượt sau `MONTH_END` thêm **100.000**                                                                                  |
  | L   | Request của Hùng đã kết thúc (thu hồi 30/10/2027), còn 1.000.000 ở dòng 11, 12; Finance giải phóng `REMAINDER` (F4 — API lấy **toàn bộ** `held`, chỉ khi Request đã kết thúc) | dòng 12: +500.000, dòng 11: +500.000; `held` 0 ⟹ `EXPENSED`                                                                                              |
  | M   | Chạy lượt ngày 01/02/2027, tháng 12/2026 đã chốt trong tháng 1                                                                                                                | không ghi thêm; không lỗi                                                                                                                                |
  | F1  | `YEAR_START` 2027 6.000.000; chốt tháng 1, 2 (`MONTH_END` 2 × 500.000); cấp 10/03/2027                                                                                        | `LATE_GRANT` **145.161** (chỉ dòng 3 nhận; không phải 1.145.161); seat-tháng 3 = **354.839**; chốt tháng 3 = 0; Σ giải phóng tháng 1–3 = **1.145.161**   |
  | F2  | `K2` 15/03 → 14/06/2027 (4 dòng 3–6, 2.000.000), thu hồi 10/04/2027                                                                                                           | `REVOKED` tháng 4 = **350.000**, tháng 5 = 500.000, tháng 6 = 500.000 ngay lúc thu hồi; áp tháng 4 = **150.000**; không dòng nào treo `HELD` tới 01/07   |
  | F3  | Sau ca K chạy lượt thứ ba                                                                                                                                                     | không thêm dòng; Σ `MONTH_END` tháng 3 = **150.000**                                                                                                     |
  | F3' | Ca B (Hùng thu hồi 15/01, `EXPENSED`) rồi đảo seat-tháng 1 (225.806)                                                                                                          | `HELD`; lượt sau `MONTH_END` dòng 1 = **225.806**; về `RELEASED` (Σ áp = 0)                                                                              |
  | F6  | Một kỳ thiếu dấu tháng 12/2026 tới 05/02/2027                                                                                                                                 | lượt 05/02 vẫn chốt tháng 12 và dọn năm 2026; `priorYearReleased` đủ                                                                                     |
  | F15 | Cấp 05/02/2027, thu hồi 09/02/2027 (tháng 28 ngày, dòng 2 = 500.000)                                                                                                          | `LATE_GRANT` 71.429 + `REVOKED` 357.143 ⟹ áp **71.428**, 1 đ thực chi không cam kết; Σ dòng = 500.000                                                    |

- **Test:** unit `commitment-month.policy.spec.ts` (`it.each` A–M phần số), `commitment-month-settlement.service.spec.ts`; integration
  `test/integration/budgets/commitment-month-settlement.integration-spec.ts` (A–L; H hai connection có barrier, lặp 20 lần).

---

## W3-08

**_Còn lại_ trừ chi phí đang chạy không có cam kết (`K2`).**

- **Nguồn:** `QĐ-116af` (_còn lại_ trừ thêm, _dự kiến cuối năm_ cộng thêm = seat đang gán không có Request × giá tháng × số tháng còn lại
  của năm; không tạo cam kết — giữ `QĐ-109a`), `QĐ-117i` (số tháng = các tháng chưa ghi seat-tháng, **gồm trọn tháng đang chạy**), A-14.
- **Hiện trạng:** `remainingBase = base − spent − held − pending` (`requests/spend/budget-check.policy.ts:140-141`); không có số hạng
  này ở kiểm tra ngân sách lẫn `budgetSummary`.
- **Hành vi đúng:**

  ```text
  runningUncommitted(CC, Y, today) =
    Σ seat K2 đang hiệu lực hôm nay, người giữ thuộc phòng có Cost Center hiện hành = CC, và
        (seat không có Request — nguồn BASELINE / HANDOVER / MACHINE_ACCOUNT_CONVERSION,
         hoặc cam kết năm Y của Request đó không HELD, hoặc thuộc Cost Center khác CC)        -- ân hạn điều chuyển
    monthly(kỳ của seat) × monthsLeft
  monthsLeft = số tháng m của năm Y, từ tháng seat BẮT ĐẦU GIỮ (trong năm Y, theo kỳ đang phục vụ) mà kỳ đó CHƯA có seat_month_runs của m   (F7)
               tới tháng chứa ngày cuối seat còn giữ (seatHeldRange của src/core/seat-month-cost.ts) hoặc tháng 12
  ```

  Không còn ràng buộc "≥ tháng hiện tại" (B1-R12): tháng trước chưa tính (lượt seat-tháng chưa chạy) vẫn là chi phí sắp ghi.
  - _Còn lại_ (kiểm tra ngân sách khi gửi/duyệt, `budgetSummary`, đèn) trừ `runningUncommitted`; _dự kiến cuối năm_ cộng nó **không** nhân
    hệ số chênh (**Tự chốt**: hệ số chênh chỉ áp khoản đã khớp hóa đơn — `QĐ-116at`).
  - `K1` ⟹ W3-23 (B3).

- **Nơi tính / ghi:** chỉ đọc. Policy thuần `budgets/budget/running-uncommitted.policy.ts`; facts
  `budgets/budget/running-uncommitted-facts.service.ts` (seat qua `LicensingSeatMonthApi.getSeatsInForceOn(day)` — mới: `assignmentId`,
  `subscriptionId`, `planId`, `requestId`, `source`, `departmentId` hôm nay, `heldUntil`; giá qua `SubscriptionPeriodApi.getPurchaseFacts`;
  cam kết và `seat_month_runs` của budgets). `BudgetsApi` trả `runningUncommittedMinor` trong lát ngân sách mà
  `requests/spend/budget-check.policy.ts` đọc.
- **Tiêu chí chấp nhận:**

  | Ngày                                             | Dữ kiện                                                                                 | `runningUncommitted` `CC-TK`                                                                                                                                    |
  | ------------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 08/07/2027                                       | 2 seat Figma nhập lúc khởi tạo (không Request), 375.000; seat-tháng đã tính tới tháng 6 | 2 × 375.000 × 6 (7→12) = **4.500.000**                                                                                                                          |
  | 01/08/2027, lượt tháng 7 chưa chạy (biên B1-R12) | như trên                                                                                | tháng 7 chưa tính ⟹ vẫn 6 tháng = **4.500.000**                                                                                                                 |
  | 02/08/2027                                       | như trên, tháng 7 đã tính ngày 01/08                                                    | 2 × 375.000 × 5 = **3.750.000** (tháng 7 đã thành thực chi 750.000)                                                                                             |
  | 08/07/2027                                       | một seat trong đó có ngày cuối còn giữ 15/10/2027                                       | 375.000 × 6 + 375.000 × 4 = **3.750.000**                                                                                                                       |
  | 08/07/2027                                       | một seat có ngày cuối còn giữ **01/11/2027** (biên: một ngày của tháng 11)              | 375.000 × 6 + 375.000 × 5 = **4.125.000**                                                                                                                       |
  | 01/01/2028 (năm 2028)                            | 2 seat Figma, chưa tháng nào của 2028 tính                                              | 2 × 375.000 × 12 = **9.000.000**                                                                                                                                |
  | 10/09/2027 (F7)                                  | thuê bao mới từ 01/09/2027, 2 seat `HANDOVER` 375.000                                   | 2 × 375.000 × 4 (9→12) = **3.000.000** (không phải 9.000.000)                                                                                                   |
  | 08/07/2027 (F7)                                  | kỳ nối tiếp từ 01/07/2027, 2 seat                                                       | 2 × 375.000 × 6 = **4.500.000**                                                                                                                                 |
  | 08/07/2027 (F7)                                  | không seat tháng 2–3, seat lại từ 01/04, tháng 4–6 đã tính                              | 6 tháng (7→12)                                                                                                                                                  |
  | 26/03/2027 (F15b — chấp nhận)                    | seat điều chuyển sang `CC-TK` 26/03 (phòng cũ còn giữ 1–25/03 = 403.226)                | phòng mới tính trọn tháng 3 (500.000) — trùng tạm thời theo `QĐ-117i`; giá tăng lên 550.000 khi cam kết `HELD`: 50.000/tháng **không** vào `runningUncommitted` |
  | 08/07/2027                                       | seat của Request có cam kết 2027 `HELD` ở `CC-TK`                                       | không tính                                                                                                                                                      |
  | 08/07/2027                                       | seat trong ân hạn điều chuyển sang `CC-TK` (cam kết ở `CC-KT` đã giải phóng)            | tính                                                                                                                                                            |
  | Kiểm tra ngân sách ngày 08/07                    | số cơ sở 132.000.000, thực chi 60.000.000, giữ 50.000.000, chờ 10.000.000               | còn lại = 132 − 60 − 50 − 10 − 4,5 = **7.500.000**                                                                                                              |

- **Test:** unit `running-uncommitted.policy.spec.ts` (`it.each`), `budget-check.policy.spec.ts` (trừ thêm, gửi và duyệt cùng số); http
  `test/http/budgets/budget-summary.http-spec.ts` (trường mới).

---

## W3-09

**Ba con số tiết kiệm: tiềm năng, tránh được, thực.**

- **Nguồn:** `QĐ-116as`, `QĐ-117f` (_tiềm năng_ = số seat × giá tháng × **số tháng của một kỳ cam kết** (12 hoặc 1), **từ ngày sớm nhất
  giảm được**, kèm ngày; `K1` tháng 1 tháng từ ngày trả kế, `K1` năm 12 tháng từ hết kỳ đã trả, theo thành viên 1 tháng, `K4` không),
  `QĐ-117g` (_thực_ = mốc − **số kỳ vọng** kỳ mới, chưa thuế; mốc = seat cuối kỳ cũ × giá tháng cũ × độ dài kỳ, **từng dòng**, không bù
  trừ; ghi khi **Finance xác nhận** hóa đơn kỳ mới; hồ sơ `SBF-11a` mở ⟹ hoãn), `QĐ-94h` (ba con số không cộng), Owner Q-G (_tránh được_
  của Request nhóm = phần **một người**; _thực_ của gói cam kết 12 trả tháng ghi ở **hóa đơn đầu tiên** của kỳ mới, mốc và số so đều × 12).
- **Hiện trạng:**
  - tiềm năng: `monthly × 12` khi `billingCycle = ANNUAL` (sai trục), chia sàn, `realisableOn = null`
    (`optimization/usage-rules/potential-saving.policy.ts:17-40`); enum `realisableAt` có `RENEWAL`, `ADJUSTMENT_POINT`, `NEXT_BILLING`,
    `UNKNOWN`, `NEVER` (`optimization/board/board.dto.ts:110`, `ghost-seat/ghost-seat-evidence.json.ts:46`);
  - tránh được: `ceil(unit / cycle) × (13 − tháng cấp)` (`licensing/shared-pool/shared-pool.policy.ts:63-87`), ghi ở licensing lúc cấp
    (`shared-pool.service.ts:220`);
  - thực: ghi lúc **IT ghi kết quả** gia hạn, so tổng (`licensing/subscription-renewal/outcome/renewal-outcome.policy.ts:57-66`,
    `renewal-outcome.service.ts:73-77`).
- **Hành vi đúng:**
  1. **Tiềm năng** (`potentialSavingOf`): `amountAtPoint = seats × monthly × T`, `T` = `commitmentTermMonths` của kỳ (12 \| 1);
     `realisableOn = earliestReducibleOn(kỳ, today)` (W3-06, cùng hàm): cam kết 12 ⟹ ngày gia hạn nếu hạn chót chưa qua, ngày gia hạn kỳ
     sau nếu đã qua; cam kết 1 ⟹ ngày thanh toán kế ≥ hôm nay (`deadline` của `adjustmentPointOf` — hạn chót chưa qua, B1-R3).
     `realisableAt` dùng **giá trị có sẵn** (B1-R16, không đổi enum): cam kết 12 ⟹ `RENEWAL`; cam kết 1 ⟹ `NEXT_BILLING`. `K1`: B1 giữ
     `UNKNOWN` (B3 W3-17); `K4`: `NEVER`.
  2. **Tránh được:** khi tác vụ cấp hoàn tất **từ kho** (`fromPool`, `provisioning-grant-completion.service.ts:87-89`), số tiền =
     `roundHalfAway(cam kết năm cấp của Request ÷ seat_count của cam kết)` — phần **một người** (B1-R8, Q-G); `K4`: số tiền Request ÷ số
     người. Ghi chuyển sang listener của requests (`requests/grant/access-request-grant.listener.ts`, đã xử lý `GRANTED_FROM_POOL`) gọi
     `LicensingApi.recordAvoidedCost(tx, taskId, amount)` (mới); `avoidedCostOf` của licensing **bỏ** tính tiền (dòng mới `months`/`unitMinor`
     `NULL`). Bảng `pool_grant_avoided_costs` giữ (dòng cũ không tính lại).
  3. **Thực:** bỏ ghi lúc IT ghi kết quả; ghi khi Finance xác nhận **hóa đơn đầu tiên của kỳ mới** (link `SUBSCRIPTION`, nhãn `RENEWAL`
     hoặc `PERIOD`, tháng dịch vụ = tháng bắt đầu kỳ mới) qua `LicensingApi.recordRealisedSaving(tx, { newPeriodId, invoiceId })`:

     ```text
     T = kỳ cam kết (tháng) của kỳ cũ; mỗi dòng (B1: kỳ = một gói)
       baseline = q_cuối_kỳ_cũ × monthly_cũ × T
       compared = q_kỳ_mới    × monthly_mới × T          -- KHÔNG phải số kỳ vọng W3-05 (W3-05 nhân theo chu kỳ trả)
       saving   = max(0, baseline − compared)
     thực = Σ saving các dòng; hóa đơn có hồ sơ SBF-11a mở ⟹ chưa ghi; hồ sơ đóng ⟹ ghi lúc đóng
     ```

     B1: `q_cuối_kỳ_cũ` = `purchased_quantity` của kỳ cũ, `q_kỳ_mới` = `purchased_quantity` của kỳ mới lúc ghi. Cột M2:
     `subscription_renewals.realised_savings_recorded_at`, `realised_savings_invoice_id`; ghi đúng một lần (`realised_savings_recorded_at
IS NULL` dưới khóa kỳ). **Giới hạn B1:** kỳ tự gia hạn không có ca `subscription_renewals` ⟹ không ghi _thực_ (B3 W3-21 tạo ca hệ thống).
- **Tiêu chí chấp nhận:**

  | Con số     | Ca                                                                                     | Số                                                                               |
  | ---------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
  | Tiềm năng  | khuyến nghị Hùng + Mai 04/01/2027, Standard cam kết 12, gia hạn 01/07/2027             | mỗi seat **6.000.000 từ 2027-07-01**, `RENEWAL`; 2 seat 12.000.000               |
  | Tiềm năng  | Standard, khuyến nghị **02/06/2027** (sau hạn chót 01/06 — Q-F)                        | **6.000.000 từ 2028-07-01**                                                      |
  | Tiềm năng  | Figma (cam kết 1, thanh toán 15), khuyến nghị 20/01/2027                               | **375.000 từ 2027-02-15**, `NEXT_BILLING`                                        |
  | Tiềm năng  | Figma, khuyến nghị **10/02/2027** (qua điểm mở 08/02, chưa qua hạn chót 15/02 — B1-R3) | **từ 2027-02-15** (không phải 15/03)                                             |
  | Tiềm năng  | Figma, khuyến nghị 16/02/2027                                                          | từ 2027-03-15                                                                    |
  | Tiềm năng  | Claude cam kết 12 **trả tháng**                                                        | vẫn × 12                                                                         |
  | Tránh được | Quân, Standard _Dùng lâu dài_, duyệt 10/03/2027, cấp từ kho cùng ngày                  | **5.000.000** (10 × 500.000)                                                     |
  | Tránh được | duyệt 10/03, cấp từ kho 20/05                                                          | **5.000.000** (công thức cũ cho 4.000.000)                                       |
  | Tránh được | Request **nhóm 3 người**, cam kết 2027 = 15.000.000, một người cấp từ kho (B1-R8)      | **5.000.000** (không phải 15.000.000)                                            |
  | Tránh được | Request nhóm 3 người, cam kết 1.000.000 (biên làm tròn)                                | **333.333**                                                                      |
  | Thực       | kỳ cũ 12 Std, kỳ mới 11 Std (trả năm), Finance xác nhận hóa đơn 01/07/2027             | 72.000.000 − 66.000.000 = **6.000.000**                                          |
  | Thực       | Standard cam kết 12 **trả tháng**, 12 → 11; xác nhận hóa đơn tháng 7/2027 (B1-R2)      | **6.000.000** ở hóa đơn tháng 7 (không phải 66.500.000); tháng 8: không ghi thêm |
  | Thực       | hai kỳ (B1 một gói mỗi kỳ): Standard 12 → 11; Premium 2 → 3                            | Standard 6.000.000; Premium max(0, 60 − 90 tr) = **0**                           |
  | Thực       | 100 seat × 150.000 → 88 seat × 180.000 (diệt bỏ `max(0)`)                              | 180.000.000 < 190.080.000 ⟹ **0**                                                |
  | Thực       | hóa đơn kỳ mới mở `SBF-11a`                                                            | chưa ghi; đóng hồ sơ ⟹ ghi 6.000.000                                             |
  | Thực       | kỳ tự gia hạn, không có ca gia hạn (B1)                                                | không ghi                                                                        |
  | Không cộng | báo cáo hiện ba số riêng                                                               | không trường "tổng tiết kiệm" nào                                                |

- **Test:** unit `potential-saving.policy.spec.ts`, `renewal-savings.service.spec.ts` (thực, `it.each`), `access-request-grant.listener.spec.ts`
  (tránh được nhóm); integration `test/integration/licensing/realised-saving-on-invoice.integration-spec.ts` (ghi một lần, hoãn khi hồ sơ mở).
