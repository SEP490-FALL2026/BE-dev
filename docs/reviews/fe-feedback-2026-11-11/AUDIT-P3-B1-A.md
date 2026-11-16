# AUDIT-P3-B1-A — FX-1, FX-2, XY-1 (tiền VND, bỏ tỷ giá, qua năm 01/01)

> Review chỉ đọc, phạm vi commit `dc879586..a4e31ff5` (nhánh `feat/fe-feedback`), vùng A: `src/modules/budgets`, `finance`, `catalog` phần giá,
> `requests/year-start-commitments`, `requests/spend-approval-view` (`nextYearBudget`), migration `20261113002800`, `20261113002900`.
> Đọc qua `git show a4e31ff5:<path>` / `git diff`; **không** chạy pnpm/jest/docker. Mọi kết luận "CI đỏ" là **theo đọc code**, chưa chạy.
>
> Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (khung 5 trục, mức Critical/Required/Optional/Nit),
> `superpowers:verification-before-completion` (chỉ khẳng định điều có bằng chứng; ghi rõ cái gì chưa chạy). Process skill: dùng chính quy trình
> review của `code-review-and-quality` (bước 1–5) thay process skill riêng.
>
> Căn cứ: `QĐ-111ak`, `QĐ-111al`, `QĐ-111am`, `QĐ-111an`, `QĐ-104a`, `QĐ-30b` (Docs `Decisions/project-decisions.md`); OWNER-REVIEW B-4, R-15,
> R-44, R-46, S-1; SPEC v2.1 §4 D2, §5 FX-1/FX-2/XY-1, §6, §8 (bất biến, T-RQ2, T-XY1); OVERNIGHT-DECISIONS D-1…D-12, D-29…D-31.

## Tóm tắt

| Mức      | Số | Mã                                                    |
| -------- | -- | ----------------------------------------------------- |
| Critical | 0  | —                                                     |
| Required | 4  | B1A-01, B1A-02, B1A-03, B1A-04                        |
| Optional | 9  | B1A-05 … B1A-13                                       |
| Nit      | 5  | B1A-14 … B1A-18                                       |

Kết luận ngắn: luồng mới (giá nhập VND, snapshot đồng nhất, bỏ route tỷ giá, kiểm ngân sách không quy đổi, khoản 01/01 theo số đã lưu, cảnh báo
mềm năm sau, nhắc 01/12) đúng hướng QĐ và có test số đúng T-RQ2/T-XY1. Lỗ hổng chính nằm ở **dữ liệu cũ bằng ngoại tệ** mà migration cố ý để
nguyên (Request đã duyệt chi, thuê bao không có tỷ giá): code mới đọc chúng như đồng hoặc vẫn cho chúng định giá luồng mới. Seed demo còn gọi
route tỷ giá đã xóa ⟹ các suite seed sẽ đỏ trên CI.

---

## Required

### B1A-01 — Required — Số năm sau của Request cũ đã duyệt chi bằng ngoại tệ bị đọc như đồng (khoản 01/01 và `nextYearBudget`)

**Vị trí (a4e31ff5):**
- `src/modules/requests/year-start-commitments/year-start-commitments-batch.service.ts:211` — `return request.budgetYear === year - 1 ? request.nextYearAmountMinor : null;` không xét tiền tệ.
- `src/modules/requests/year-start-commitments/year-start-commitments.repo.ts:159-181` — `lockBatch` không đọc `amount_currency`.
- `src/modules/requests/year-start-commitments/year-start-commitments.policy.ts:85-91,117-121` — `keptAmountOf` cộng thẳng `savedMinor`; chỉ giá gói được kiểm `DONG` (`isRecurringPriceInDong`, dòng 60-62).
- `src/modules/requests/spend-approval-view/next-year-budget.repo.ts:24-35` — `groupBy` cộng `nextYearAmountMinor` mọi tiền tệ.
- `src/modules/requests/spend-approval-view/next-year-budget.service.ts:65,68` — `thisMinor` lấy số của Request bất kể `currency`.
- Nguồn dữ liệu: `prisma/migrations/20261113002900_fx_prices_to_vnd/migration.sql:142-144` cố ý **không** quy Request đã có cam kết / quyết định `APPROVED`
  (đúng SPEC "dòng đã quy đổi trước không đụng"), nên `access_requests.amount_currency/next_year_amount_minor` của chúng vẫn là USD. Test
  `test/integration/catalog/fx-prices-to-vnd-migration.integration-spec.ts:306` khẳng định chính trạng thái này tồn tại sau migration.

**Kịch bản lỗi:** Request `K1` gói Cursor 20 USD/tháng, duyệt chi 15/11/2026 ở bản cũ, `budget_year = 2026`, `next_year_amount_minor = 14000`
(7 tháng × 2000 cent), `amount_currency = 'USD'`. Sau migration giá gói đã là 508.000 đ. Lượt 01/01/2027: giá gói qua `isRecurringPriceInDong`,
seat `termLimited` (có `expected_end_date`) ⟹ `keptAmountOf` trả `14000` ⟹ khoản `YEAR_START` = **14.000 đ** thay vì ≈ 3.556.000 đ (sai ~254 lần,
im lặng, không audit). Cùng gốc: `GET /spend-approvals`, `GET …/spend-approval`, `GET …/budget-check` trừ 14.000 "đồng" khỏi ngân sách 2027 của Cost
Center ⟹ `remaining` sai.

**Căn cứ:** `QĐ-111an` (tiền ghi VND, không quy đổi trong luồng), `QĐ-111ak` (khoản 01/01 = số năm sau đã lưu **bằng VND**), SPEC §8 bất biến
"không còn số tiền ngoại tệ trong luồng mới"; D-8 đã chọn "ngoại tệ = thiếu giá" cho kiểm ngân sách nhưng chưa áp cho số đã lưu.

**Cách sửa (đủ để làm ngay):**
1. `year-start-commitments.repo.ts`: thêm `r."amount_currency"` vào `SELECT` của `lockBatch`, `CandidateRow.amount_currency: string | null`,
   `YearStartCandidate.amountCurrency`.
2. `year-start-commitments-batch.service.ts#keptNumbersOf`: với Request cá nhân trả số đã lưu chỉ khi `request.amountCurrency === DONG`; khác ⟹
   `null` (rơi về cách tính theo tháng × giá VND ngày 01/01 của D-29(b) — không quy đổi, không bịa). Với Request nhóm lọc `currency: 'VND'` ở
   `keptNextYearOfLines` (`accessRequestLineAmount.findMany` where).
3. `next-year-budget.repo.ts#keptByCostCenter`: thêm `amountCurrency: DONG` vào `where`.
4. `next-year-budget.service.ts`: trong `keeping` lọc thêm `subject.currency === DONG` (Request ngoại tệ ⟹ `nextYearBudget: null`); thay literal `'VND'` dòng 68 bằng `DONG`.

**Test nên thêm:** integration `year-start-commitments-kept`: Request đã duyệt chi, SQL đặt `amount_currency='USD'`, `next_year_amount_minor=14000`,
`expected_end_date` 7 tháng sang năm sau, giá gói 508.000 đ ⟹ khoản 01/01 = số tính theo tháng × 508.000, **khác** 14000. Integration
`spend-approval-next-year-budget`: một Request khác đã duyệt bằng USD cùng Cost Center ⟹ `remaining` không đổi. Đột biến: bỏ điều kiện tiền tệ ở
`keptOf` / `keptByCostCenter` ⟹ hai ca đỏ.

---

### B1A-02 — Required — Seed demo còn gọi route tỷ giá đã xóa và khai thuê bao USD ⟹ các suite seed sẽ đỏ trên CI

**Vị trí:**
- `src/cli/seed/steps/finance.steps.ts:47-70,171-174` — bước `finance.exchange-rates` gọi `GET /exchange-rates` và `POST /exchange-rates` (route xóa ở `d5b6ec29`, D-10).
- `src/cli/seed/fixture/shared-demo-v4/catalog.ts:148-149,212` — Cursor Pro `unitPrice: { amount: '20', currency: 'USD' }` ⟹ `POST /subscriptions` 422 `SUBSCRIPTION.PRICE_NOT_VND`; `exchangeRates: [{ USD, 25400 }]`.
- (ngoài vùng A, cùng hệ quả) `src/cli/seed/steps/request.steps.ts:37-39`, `extras.steps.ts:18` còn gửi `expectedEndDate` mà RQ-2 đã bỏ khỏi body strict ⟹ 422.

**Kịch bản lỗi:** `ops:seed apply` với fixture `shared-demo-v4` dừng ở bước tỷ giá (404) hoặc bước thuê bao Cursor (422). Các suite chạy seed
thật trên API + PostgreSQL nằm trong job CI `integration` và `integration-serial`:
`test/integration/installation/seed.integration-spec.ts`, `seed-rerun.integration-spec.ts`, `seed-calendar.integration-spec.ts`,
`seed-bootstrap.integration-spec.ts`, `test/integration/_serial/seed-check-runtime.integration-spec.ts` ⟹ **đỏ** (theo đọc code; HANDOFF-CODE
không ghi các suite này đã chạy sau FX-2). Flow `mf4-budget`, `mf5-ghost-seat` (nightly) cũng phụ thuộc dataset này.

**Căn cứ:** PLAN Z2 dời việc dọn tỷ giá/giá của seed về pha cuối, nhưng memory Owner "Full CI before done" và brief "không để CI đỏ"; D1
(route xóa luôn) làm seed hỏng ngay ở FX-2 chứ không phải ở Z2.

**Cách sửa:** (A, khuyến nghị) sửa tối thiểu ngay: xóa bước `exchangeRates` khỏi `finance.steps.ts` + trường `exchangeRates` khỏi
`DemoFixture`/`CATALOG`; Cursor đổi sang `unitPrice: { amount: '508000', currency: 'VND' }` + `originalPrice: { amount: '20', currency: 'USD' }`
(thêm `originalPrice?` vào `DemoSubscription` và truyền ở `catalog.steps.ts:202`/`subscriptionTerms`); sửa dòng Cursor trong
`shared-demo-v4/README.md:94`. Phần `expectedEndDate` ⟹ `termMonths` giao reviewer RQ-2. (B) giữ cho Z2 nhưng ghi rõ trong HANDOFF-CODE danh
sách suite đỏ đã biết và không merge trước Z2.
**Test:** chạy `seed.integration-spec.ts` (một file) sau khi sửa; kiểm thuê bao Cursor `originalPrice` đọc lại `20.00 USD`.

---

### B1A-03 — Required — Thuê bao `ACTIVE` cũ còn ở ngoại tệ (không có tỷ giá lúc migration) vẫn định giá luồng mới

**Vị trí:**
- `src/modules/catalog/subscription/subscription-priced.repo.ts:13-24` (`livePricedOf`) và `:30-44` (`pricedOn`) — chỉ đòi `unitPriceCurrency not null`, không đòi `VND`.
- Không có chặn tiền tệ ở `requests/access-request/pricing.policy.ts`, `request-facts.service.ts`, `request-intake/*` (grep `DONG|'VND'` rỗng).
- `src/modules/catalog/subscription/subscription-change.service.ts:114-115` — `subscriptionStatusOf` với giá ngoại tệ ⟹ `DRAFT`.

**Kịch bản lỗi:** migration để nguyên thuê bao USD không có tỷ giá (NOTICE, D-3(3)); nó vẫn `ACTIVE`. (1) `getPlanPrice` trả giá USD ⟹ Request
mới gửi, preview, draft được định giá và **lưu** `amount_currency = 'USD'` — trái bất biến SPEC §8 "không còn số tiền ngoại tệ trong luồng mới";
lỗi chỉ lộ muộn ở kiểm ngân sách (`PRICE_MISSING`, D-8) sau khi người gửi và trưởng phòng đã làm việc. (2) Màn thuê bao hiện `ACTIVE` mà
`missing: ['UNIT_PRICE']` (view dùng `isPricedInDong`). (3) PATCH bất kỳ (đổi người phụ trách, số lượng) lặng lẽ hạ `ACTIVE` ⟹ `DRAFT` (code cũ
từng chặn bằng `SubscriptionStillDraftError(['EXCHANGE_RATE'])`, nay đã gỡ) — thuê bao biến khỏi nguồn giá và cấp phát mà IT không chủ ý.

**Căn cứ:** `QĐ-111an`, SPEC §8 bất biến, D-5 (bản nháp ngoại tệ = thiếu giá) — cùng luật nên áp cho cả nguồn giá.

**Cách sửa:** thêm `unitPriceCurrency: DONG` vào cả `livePricedOf` và `pricedOn` (một chỗ, mọi đường đọc giá đi qua đây; gói chỉ có thuê bao USD ⟹
"không có giá" như gói chưa định giá). Ở `SubscriptionChangeService.changeIn`: nếu `current.status === 'ACTIVE'` và state mới thành `DRAFT` chỉ vì
`UNIT_PRICE` (giá cũ ngoại tệ, body không gửi giá mới) ⟹ ném `SubscriptionStillDraftError(['UNIT_PRICE'])` (422, buộc nhập lại giá VND), thay vì
hạ trạng thái im lặng.
**Test:** integration catalog: thuê bao `ACTIVE` SQL đặt USD ⟹ `GET /requestable-plans`/preview không có giá (hoặc `PRICE_MISSING`), `POST
/access-requests` không lưu `amount_currency='USD'`; PATCH `responsibleItAdminEmployeeId` trên thuê bao đó ⟹ 422 `STILL_DRAFT` `missing:
['UNIT_PRICE']`, trạng thái vẫn `ACTIVE`. Đột biến: bỏ điều kiện `VND` ⟹ ca đỏ.

---

### B1A-04 — Required — D-29(2): seat đóng trong năm mới trước hạn được tính lại theo **giá 01/01**, trái `QĐ-111ak`

**Vị trí:** `src/modules/requests/year-start-commitments/year-start-commitments.policy.ts:85-91` (`keptAmountOf` trả `null` khi `closesBeforeTerm`)
và `:123-139` (rơi vào `requestAmountOf` với `price.unitPrice` = giá ngày 01/01).

**Kịch bản lỗi:** `K1` 600.000 đ, 7 tháng năm sau đã lưu 4.200.000 (T-RQ2). Ngày 01/01 giá lên 650.000. Seat có `valid_until` = 10/07/2027 còn
`expected_end_date` = 14/07/2027 (kỳ thuê bao đóng sớm vài ngày) ⟹ `closesBeforeTerm` ⟹ tính lại 7 tháng × 650.000 = **4.550.000** > số đã lưu.
Quyền vẫn "còn hiệu lực sau 31/12" nên M-13 không áp; `QĐ-111ak` nói Request có thời hạn = **đúng số năm sau đã lưu**, giá hiện hành chỉ cho _Dùng
lâu dài_. SPEC §8 bất biến "khoản 01/01 = số đã lưu của dòng còn hiệu lực" cũng bị phá.

**Căn cứ:** `QĐ-111ak`, R-46, SPEC §8; quy tắc brief: D-n trái QĐ ⟹ Required. (D-29(1) — Request không có số lưu — không trái QĐ, giữ.)

**Cách sửa (chọn một, khuyến nghị A):**
- (A) Seat đóng trước hạn: tính số tháng tới ngày đóng nhưng ở **giá tháng lúc duyệt** (giá của Request: `request.unitPrice` + `billingCycle` ⟹
  `monthlyPriceOf`), rồi lấy `min(số đó, savedMinor)`. Thêm `approvalUnitPrice: Money | null` vào `YearStartSeat` (đọc `unit_price_minor`,
  `billing_cycle` ở `lockBatch`), `keptAmountOf` trả số đã cắt thay vì `null`.
- (B) Giữ nguyên số đã lưu khi seat còn hiệu lực sau 31/12 (chữ QĐ), chỉ seat đã đóng ≤ 31/12 mới bỏ (đã có ở `seatCountsOn`).
**Test:** unit `year-start-commitments.policy.spec`: ca trên ⟹ 4.200.000 (A hoặc B), và ca đóng tháng 4 ⟹ 4 × 600.000 = 2.400.000 (A). Đột biến:
đổi về giá 01/01 ⟹ đỏ. Ghi lại D-29 trong OVERNIGHT-DECISIONS.

---

## Optional

### B1A-05 — Optional — D-4: giá kỳ gia hạn ngoại tệ trả 409 `PERIOD_REFUSED` còn POST/PATCH thuê bao trả 422 `PRICE_NOT_VND`
`src/modules/catalog/subscription/subscription-period.service.ts:145-148`. Hai mã/status cho cùng một luật nhập giá. **A (khuyến nghị):** giữ
(không đổi contract licensing, có test). **B:** ánh xạ 422 `SUBSCRIPTION.PRICE_NOT_VND` ở licensing cho đồng bộ với FE.

### B1A-06 — Optional — Kỳ gia hạn bỏ mất giá gốc ngoại tệ
`subscription-period.service.ts:166` `originalPrice: null`; body kết quả gia hạn không nhận `originalPrice`. `QĐ-111an` cho "ghi chú giá gốc ngoại
tệ tùy chọn" ở mọi chỗ nhập giá gói; R-44/PI-1 so khớp hóa đơn theo `subscriptions.original_*` ⟹ kỳ gia hạn rơi về so VND, sẽ mở `SBF-11a` vì
chênh tỷ giá — đúng điều R-44 cấm. IT vẫn PATCH được sau. Sửa: thêm `originalPrice?` vào body outcome và `recordNextPeriod` (đọc bằng
`pricing.readOriginal`); hoặc chép `previous.originalPrice` khi `unitPrice` kỳ mới bằng kỳ cũ. Test: renewal outcome có `originalPrice` ⟹ đọc lại.

### B1A-07 — Optional — `originalPrice` cũ treo lại khi đổi giá VND; nhận cả `originalPrice` bằng VND
`subscription-change.service.ts:114` giữ `current.originalPrice` khi PATCH đổi `unitPrice` mà không gửi `originalPrice` ⟹ giá gốc không còn ứng
với giá VND mới (R-44 so sai). `subscription-pricing.service.ts:33-38` và `assessment/quote.service.ts:29` nhận `originalPrice.currency = 'VND'`
(vô nghĩa). Sửa: đổi `unitPrice` mà body vắng `originalPrice` ⟹ xóa giá gốc (hoặc A: giữ nhưng ghi rõ trong mô tả OpenAPI); `readOriginal` từ chối
`VND` bằng 422 `VALIDATION_ERROR` `originalPrice.currency`. Test HTTP hai ca.

### B1A-08 — Optional — D-9: `held.refused` ném `Error` ⟹ một phiên bản ngân sách lệch tiền chặn **toàn bộ** lượt 01/01 mỗi giờ
`year-start-commitments-batch.service.ts:92-96`. Sau D-12 + `RAISE` của migration thì gần như không xảy ra. **A (khuyến nghị):** giữ, nhưng ghi
`logger.error` kèm `requestId`/`costCenterId` để vận hành biết lô nào. **B:** bỏ qua khoản đó với audit `YEAR_START_SKIPPED` lý do mới, cho lô khác chạy.

### B1A-09 — Optional — D-31: nhắc mỗi Cost Center × mỗi người × mỗi Thứ Hai, quanh năm
`budgets/year-end/next-year-reminder.policy.ts:12-19`, `next-year-reminder.service.ts:50-74`. Đúng chữ B-4/`QĐ-111am` và khóa SPEC, nhưng B-4
ghi "đủ nhắc, không spam": 10 Cost Center thiếu ⟹ 20 thông báo mỗi Thứ Hai; tổ chức cài giữa năm chưa có ngân sách nhận nhắc ngay từ Thứ Hai
đầu (chuỗi "từ 01/12" chưa từng bắt đầu). **A:** giữ. **B (khuyến nghị nếu Owner thấy nhiều):** một thông báo gộp mỗi người mỗi ngày
(`params: { year, costCenterCount }`, khóa `nextYearBudget:<year>:<ngày>`). Hỏi Owner.

### B1A-10 — Optional — D-30: Finance đọc `nextYearBudget` ở `GET …/budget-check`, không ở hai route SPEC ghi
SPEC XY-1 ghi FINANCE cho `GET …/spend-approval`, `GET /spend-approvals`; D-30 cho Finance đọc qua `budgetCheckGet`. S-3 vẫn đúng (trưởng phòng,
người gửi 404). **A (khuyến nghị):** chấp nhận, sửa SPEC/API docs cho FE biết đọc ở đâu.

### B1A-11 — Optional — D-5 bỏ cả `priceSnapshot` ⟹ mất `recordedOn` (ngày ghi giá) trên dây
`subscription.dto.ts` (schema response). Ngày ghi giá vẫn có nghĩa với IT/Finance (giá cập nhật lúc nào). Sửa: thêm `unitPriceRecordedOn` (string
date, nullable) từ `record.unitPrice.recordedOn`. Hoặc A: giữ, ghi changelog.

### B1A-12 — Optional — Số tiết kiệm tránh được / thực bằng ngoại tệ không được migration quy
`pool_grant_avoided_costs.currency`, `subscription_renewals.realised_savings_currency` (prisma `licensing.prisma:651,719`) có thể còn USD từ bản cũ;
migration FX không đụng (SPEC không liệt kê). Kiểm báo cáo tiết kiệm có cộng lẫn tiền tệ không; nếu có, lọc `VND` hoặc liệt kê NOTICE trong
migration bổ sung (không sửa migration đã ghi).

### B1A-13 — Optional — Test lượt 01/01 của Request tiếp tục bị nới assertion
`test/integration/requests/year-start-commitments-renewal.integration-spec.ts` (diff dòng 57-97): từ số tháng cụ thể sang "`kept` khác null, chia
hết `MONTH`, khoản = `kept`". Phần "khoản = số đã lưu" là đúng chủ đích, nhưng số đã lưu không còn bị ghim (comment nói 9 tháng). Số năm sau của
Request tiếp tục có ghim ở `renewal-term-end.integration-spec.ts:149,265,284`, nên rủi ro thấp. Sửa: `expect(kept).toBe(String(9n * MONTH))`.

---

## Nit

- **B1A-14** — `src/modules/budgets/README.md:149` còn "trả `refused` `CURRENCY_MISMATCH` (số tiền do job quy về tiền tệ báo cáo)": job không còn quy
  đổi; sửa câu theo D-9.
- **B1A-15** — `prisma/migrations/20261113002900_fx_prices_to_vnd/migration.sql:51` `rate_date <= CURRENT_DATE` theo múi giờ phiên DB (UTC), không
  theo `Asia/Ho_Chi_Minh`: tỷ giá ghi "hôm nay" chạy migration 00:00–07:00 giờ VN bị bỏ. Migration chưa chạy thật ⟹ sửa tại chỗ được:
  `(now() AT TIME ZONE o.time_zone)::date` join `organizations`.
- **B1A-16** — `year-start-commitments.policy.ts:31,97` và `batch.service.ts:41,177` nói "Request bản cũ không lưu gì"; thực tế Request từ
  `20261109130000` đã có `next_year_amount_minor` và đang được dùng làm số đã lưu. Sửa comment cho đúng (hành vi chấp nhận được theo `QĐ-111ak`).
- **B1A-17** — `ReportingCurrencyNotSupportedError` (`core/money/money.errors.ts:61`) và ánh xạ `infrastructure/http/errors/money-errors.ts:33`
  không còn nơi ném (D-11 đã ghi) — dọn cùng tài liệu API.
- **B1A-18** — `next-year-budget.service.ts:68` literal `'VND'`; dùng `DONG` như nơi khác.

---

## Rà các D-n thuộc vùng A

| D-n  | Kết luận                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| D-1  | Đồng ý (ADR-0007: tiền trên dây là chuỗi đơn vị lớn). Sửa chữ SPEC `amountMinor` ⟹ `amount`.                                               |
| D-2  | Đồng ý (expand, CHECK cùng có/cùng vắng, FK `currencies`).                                                                               |
| D-3  | Đồng ý phạm vi; hệ quả "Request đã duyệt chi giữ ngoại tệ" cần chặn ở code đọc — xem **B1A-01**. Múi giờ — B1A-15.                       |
| D-4  | Thiết kế ⟹ B1A-05 (A).                                                                                                                   |
| D-5  | Đúng hướng; cần áp cùng luật cho nguồn giá — **B1A-03**; mất `recordedOn` — B1A-11.                                                     |
| D-6  | Đồng ý (DROP/ADD `NOT VALID` cùng giao dịch, trigger tắt/bật trong cùng giao dịch).                                                     |
| D-7  | Đồng ý (`currentMissingReasonOf`, có test đột biến).                                                                                      |
| D-8  | Đồng ý cho kiểm ngân sách; chưa áp cho số năm sau đã lưu — **B1A-01**.                                                                  |
| D-9  | Thiết kế ⟹ B1A-08 (A).                                                                                                                   |
| D-10 | Đồng ý; nhưng seed còn gọi route đã xóa — **B1A-02**.                                                                                    |
| D-11 | Đồng ý; dọn mã chết — B1A-17.                                                                                                             |
| D-12 | Đồng ý (R-4, D2).                                                                                                                         |
| D-29 | (1)(3)(4) đồng ý; (2) trái `QĐ-111ak` — **B1A-04**.                                                                                      |
| D-30 | Thiết kế ⟹ B1A-10 (A). Công thức (d) đúng R-15; không N+1 (một `groupBy` + một `findMany`, formatter cache theo tiền tệ).              |
| D-31 | Thiết kế ⟹ B1A-09 (hỏi Owner). Khóa, mỗi Cost Center một giao dịch, `security-jobs.md`, `PARAM_KEYS_BY_CODE` đủ theo D12.            |

## Đã kiểm, không có vấn đề

- Migration `20261113002800`: expand-only, CHECK + FK, không drop. `20261113002900`: `RAISE` khi tổ chức không VND, làm tròn `round(numeric)` nửa
  ra xa 0 (ADR-0007/`QĐ-42a`), công thức chữ số nhỏ đúng (10 USD × 25.400 = 254.000), snapshot đồng nhất thỏa CHECK, audit `SYSTEM` mỗi dòng, chạy
  lại không ghi thêm; thứ tự migration sau `20261113002700` của base.
- `snapshotMoney` chỉ trả snapshot cùng tiền tệ, khác ⟹ `Error`; không còn nơi gọi trong `src`.
- Kiến trúc: `requests` → `budgets/public/budgets-read.api` (`approvedBudgetsOfYear`); `NextYearBudgetRepo` chỉ đọc bảng của `requests`;
  `NextYearReminderService` dùng repo của `budgets` + facade `organization`/`notifications`. Không thấy query bảng module khác.
- Phân quyền/S-3: `nextYearBudget` chỉ ở chi tiết/hàng đợi duyệt chi và `budgetCheckGet` (Finance + người giữ bước); preview, Request của người
  gửi/trưởng phòng không có (test HTTP `next-year-budget.http-spec.ts`, integration `spend-approval-next-year-budget`). Mô tả OpenAPI mới thêm
  không chứa mã `QĐ` (các mã `BR-MF…` trong `openapi.json` có từ trước, ngoài vùng A).
- Test số: T-RQ2 (K1 4.200.000 giữ khi giá lên 650.000; K2 _Dùng lâu dài_ 4.800.000) và T-XY1 (12.600.000; một người nghỉ ⟹ 8.400.000) có trong
  `year-start-commitments-kept.integration-spec.ts:140-203`.
