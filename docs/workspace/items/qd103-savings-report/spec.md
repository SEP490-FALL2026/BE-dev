# Spec: qd103-savings-report — báo cáo tiết kiệm ba con số tách riêng (tiềm năng, tránh được, thực) + căn cứ; tiết kiệm thực của gói `K1`

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: subagent số 2 của chat review (`SEP-Start 114`), đợt W8 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `blocked` (chờ Owner chọn gói W8b — Q-160). Đã sửa theo cổng thiết kế W8 ngày 09/11/2026 (DA8-06, DA8-07, DA8-13, DA8-21,
  DA8-22). Owner review: chưa review. **Không giao code** tới khi Owner mở gói.
- Gói: **W8b** (chỉ giữ thiết kế).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-4.15`, `FR-5.9`, 5.5.3 bảng _Ai xem báo cáo nào_; `QĐ-24`, `QĐ-66w`, `QĐ-94h`, `QĐ-99h`, `QĐ-103j`, `QĐ-103t`(3),
  `QĐ-106e`; BRD dòng 904, QT v1.7 dòng 1051 — _`K1` có thực khi kỳ sau không còn bị trừ tiền_), BE `bc10bd1c` (đọc ở `46b6a94e`). ID nguồn:
  gap (bảng `API-GAP-W8.md` trong thư mục tracker) B#42, C#50, C#49 = ledger L3-32 (Q-59 vế `K1` trong [QUESTIONS](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md)).
  Câu tạm chọn: Q-148, Q-149 (cuối spec).
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (đợt W8).
- [Kế hoạch](plan.md).

## Gói W8b — trạng thái, điểm vào, phụ thuộc

- **Trạng thái:** `blocked`. Báo cáo ba con số `US-12-04` là báo cáo EP-12, cùng loại với `US-12-06` đã xếp ngoài phạm vi; `BR-MF5-04` nói thu
  hồi **không** tự ghi tiết kiệm thực (DA8-07). Owner chọn (Q-160): (a) mở cả hạng mục; (b) chỉ **Phase 1** — tiết kiệm thực `K1` (C#49 = L3-32,
  ledger đã gán W8; nhỏ, ~10 file, chỉ `budgets`, cần W4 + W5) — chat review khuyến nghị (b) nếu muốn đóng L3-32; (c) để sau, ghi ledger
  `NGOÀI-PHẠM-VI` cho B#42/C#50.
- **Điểm vào:** P1 job `realised-saving-k1.job.ts` + nguồn mới của `realisedSavingList`; P2 `GET /api/v1/savings/summary` (`savingSummaryGet`),
  `GET /api/v1/avoided-costs`, `GET /api/v1/potential-savings`.
- **Phụ thuộc:** P1: W4 + W5 PASS. P2: W6 PASS + W8b `qd103-budget-vs-actual-report` Phase B (`BudgetsApi.spendTotal`). Hạng mục W8b khác cần nó:
  không (dashboard Người duyệt chi trỏ `realisedSavingList` — DA8-22).
- **Sửa theo audit (09/11/2026), ưu tiên hơn chữ cũ:** `savingSummaryGet.totalSpend` trả `null` cho `IT_ADMIN` (BRD 5.5.3: IT Admin không có _Tổng
  chi_ — DA8-06), trường nullable trong một schema, có test; mảng lồng (nếu có, ví dụ `limitations`) đăng ký `NESTED_ARRAYS` + sự kiện (DA8-13).

## Business outcome

Người duyệt chi, Finance, IT Admin chọn một khoảng ngày và thấy **ba con số tiết kiệm có nhãn, không bao giờ cộng** — _tiềm năng_ (khuyến nghị
ghost seat đang mở, đơn vị tháng), _tránh được_ (cấp từ kho dùng chung thay vì mua, ghi một lần), _thực_ (hóa đơn kỳ sau thấp hơn / hủy / gói `K1`
không bị trừ tiền kỳ sau) — đặt cạnh **tổng chi** cùng kỳ, kèm số seat đã thu hồi và số lần cấp lại từ kho; chọn một con số thì thấy căn cứ. Chỉ
_thực_ được đặt như phần giảm chi. Trưởng phòng và Super Admin bị từ chối. Gói `K1` đã hủy gia hạn có tiết kiệm _thực_ khi kỳ kế tiếp qua mà không
có hóa đơn.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W8, gói W8b), ngoài nhóm G.
- Mode: `technical-enabler`
- Outcome and owner: báo cáo ở module `optimization` (T7 — tầng thấp nhất import được cả ba nguồn: _tiềm năng_ của `optimization`, _tránh được_ ở `licensing` T4, _thực_ và tổng chi ở `budgets` T5) — capability mới `optimization/savings-report/` (L3, chỉ đọc); tiết kiệm thực `K1` (ghi) ở `budgets/realised-saving/`.
- Boundaries: 2 migration (`*_values` + bảng); 3 operation mới; 1 đổi (`realisedSavingList`); 3 hàm facade `licensing`, 3 hàm facade `budgets`, 1 job; ước ~34 file (P1 ~10).
- Not larger: section tiết kiệm trên dashboard Người duyệt chi và bản tóm tắt (`qd103-role-dashboards-digest`); ghi _tránh được_ (W4) và _thực_ `LOWER_INVOICE`/`CANCELLED` (W5); tiềm năng từng khuyến nghị (W6).
- Not smaller: ba con số phải đọc cùng một khoảng và cùng một luật quy kỳ, nếu không báo cáo so táo với cam.
- Siblings: `qd103-role-dashboards-digest`, `qd103-budget-vs-actual-report`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                                     | Coverage | Phần còn lại thuộc                                        |
| ----- | -------------------------------------- | -------- | --------------------------------------------------------- |
| —     | W8-GAP-B#42, W8-GAP-C#50, L3-32 (C#49) | n/a      | `qd103-role-dashboards-digest` (dashboard, tóm tắt tháng) |

## Supporting references

`US-12-04` AC-1→AC-11, AC-13; `US-10-04` AC-3 (đơn vị tiềm năng — `docs/workspace/items/qd103-ghost-seat-g3-g4/spec.md` _Behavior_ 9); `US-07-13` AC-6
(_tránh được_); `US-11-03` AC-9 (hủy). Spec dựa vào: `qd103-grant-from-shared-pool`, `qd103-k4-key-pool`, `qd103-subscription-close-kpi4-savings`,
`qd103-purchase-invoice-sbf19`, `qd103-ghost-seat-g1-g2`, `qd103-ghost-seat-g3-g4`, `qd103-ghost-seat-manager-decision`.

## Explicit out of scope

ROI, doanh thu (`QĐ-24`); xếp hạng nhân viên (không trường tên người ở căn cứ _tiềm năng_); tiết kiệm phần mềm nội bộ (`QĐ-62o`); hoàn tác dòng tiết kiệm
đã ghi (bảng append-only); `K5`, `K4` ở _thực_ (không có).

## Dependencies and blockers

W4 PASS (`pool_grant_avoided_costs`, `licensing/shared-pool/`), W5 PASS (`realised_savings`, `budgets/realised-saving/`, `realisedSavingList`), W6 PASS
(module `optimization` có trong `tiers.cjs`, `ghost_seat_recommendations` + `potentialSaving` trong bằng chứng, `LicensingApi.getSeatPricingFacts`),
`qd103-budget-vs-actual-report` Phase B (`BudgetsApi.spendTotal`). **Phase 1 (tiết kiệm thực `K1`) làm sớm được** sau W4 + W5 PASS — không cần W6.

## Ownership: module, data, API

- Migration `<ts>_realised_saving_k1_values`: `ALTER TYPE "RealisedSavingSource" ADD VALUE 'K1_NOT_RENEWED'` (riêng vì giá trị mới chưa dùng được trong
  cùng transaction; không hoàn tác — sao lưu trước `migrate deploy`).
- Migration `<ts+1>_realised_saving_k1`: `realised_savings.subscription_id DROP NOT NULL`; thêm `assignment_id uuid NULL`; CHECK `(source =
'K1_NOT_RENEWED') = (assignment_id IS NOT NULL)` và `source = 'K1_NOT_RENEWED' ⟹ subscription_id IS NULL AND purchase_invoice_id IS NULL AND
current_net_minor = 0`; UNIQUE partial `(assignment_id) WHERE source = 'K1_NOT_RENEWED'`. Không backfill.
- `budgets/realised-saving/` (W5, sửa + thêm): `realised-saving-k1.job.ts` (mới), `realised-saving.service.ts` (`recordK1NotRenewed`), `realised-saving.policy.ts`
  (+ spec: điều kiện ghi `K1`), `realised-saving.repo.ts` (hóa đơn baseline + có hóa đơn kỳ sau hay không — SQL trên `purchase_invoices`).
  `budgets/savings-view/savings-view.dto.ts`, `savings-view.service.ts` (`realisedSavingList`: `source` thêm `K1_NOT_RENEWED`, `subscription` nullable,
  `assignment { id, application{id,name} } | null` — không tên người).
- `budgets/public/budgets.api.ts`: `realisedSavingTotal(range, tx?)` ⟹ `{ amountMinor, count, currency }`; `spendTotal(range, basis)` (của
  `qd103-budget-vs-actual-report`).
- `licensing/public/licensing.api.ts` (implement ở `licensing/shared-pool/shared-pool-avoided-cost.repo.ts` và repo đọc tác vụ thu hồi có sẵn):
  `avoidedCostTotal(range, tx?)` ⟹ `{ amountMinor, count, currency }`; `pageAvoidedCosts(range, page, tx?)` ⟹ trang + tổng cùng snapshot;
  `countCompletedRevocations(range, tx?)`; `listEndedK1Assignments({ endedFrom, asOf }, tx?)` ⟹ `{ assignmentId, requestId, grantTaskId,
requestBeneficiaryCount, validUntil, applicationId }[]` (một câu lệnh).
- `optimization/savings-report/` (mới, L3 — import capability `ghost-seat/` L0 của chính module, facade `LicensingApi`, `BudgetsApi`, `CatalogApi`):
  `savings-report.controller.ts` (3 route), `savings-report.dto.ts`, `savings-report-view.service.ts`, `potential-saving-query.service.ts`,
  `savings-report.policy.ts` (+ spec: khoảng ngày, tiềm năng mỗi nhóm), `savings-report.repo.ts` (đọc `ghost_seat_recommendations` mở),
  `savings-report.mapper.ts`, `savings-report.errors.ts`, `savings-report.http-errors.ts`. `optimization.module.ts` import `BudgetsFacadeModule`
  (tên thật ở `bc10bd1c`). README `optimization`.
- **Operation mới** (`/api/v1`): `savingSummaryGet` GET `/savings/summary`, `avoidedCostList` GET `/avoided-costs`, `potentialSavingList` GET
  `/potential-savings` — cả ba `@RequireRoles('FINANCE', 'IT_ADMIN', 'SPENDING_APPROVER')`. **Đổi**: `realisedSavingList` (W5).

## Behavior and design

1. **Khoảng** (`savings-report.policy.ts`): query `from`, `to` (ngày nghiệp vụ, bắt buộc, `from ≤ to`, ≤ 366 ngày; sai ⟹ 422
   `SAVINGS.RANGE_INVALID`). _Tránh được_ quy theo `recorded_on` (ngày hoàn tất cấp — `US-12-04` AC-9: 90 USD chỉ ở quý III); _thực_ theo ngày ghi
   `recorded_at` (múi giờ tổ chức — ngày Finance xác nhận hóa đơn, ngày đóng thuê bao, ngày job `K1`); _tiềm năng_ là **hiện tại** (khuyến nghị đang
   mở lúc đọc — AC-7), có `potential.asOf` (Q-148).
2. **`savingSummaryGet`** (`US-12-04` AC-1, AC-6, AC-7): `{ from, to, computedAt, totalSpend { amount, basis: 'ACCRUAL' } | null, potential { monthlyAmount,
openRecommendations, asOf }, avoided { amount, poolReissueCount, noActionRecorded }, realised { amount, entryCount, noActionRecorded }, seatsReclaimed,
limitations }`. **Không** có trường tổng của hai/ba con số (test kiểm schema không có khóa `total`, `sum`, `combined` ngoài `totalSpend`). Chỉ
   `realised` được tài liệu hóa là _giảm chi_ (mô tả OpenAPI của field). `noActionRecorded = (count = 0)` — FE hiện câu _chưa có điều chỉnh/cấp lại nào
   được ghi_. `seatsReclaimed` = số tác vụ thu hồi **hoàn tất** trong khoảng (mọi nguồn) — chỉ là căn cứ, không đổi `realised` (AC-6). Số câu lệnh cố định.
3. **Tiềm năng** (Q-148; `FR-4.15`, `US-10-04` AC-3): Σ tiền **tháng** của khuyến nghị `G1`–`G4` trạng thái chưa đóng (`OPEN`, `RECLAIM_DECIDED`): `G3`/`G4`
   ⟹ `potentialSaving.monthlyAmountMinor` đã chụp trong bằng chứng (W6); `G1` ⟹ `free_seats × giá seat tháng`; `G2` ⟹ giá seat tháng của seat — giá từ
   `LicensingApi.getSeatPricingFacts` theo lô; `realisableAt = 'NEVER'` (`K4`) ⟹ không tính, đếm vào `limitations` (`K4_EXCLUDED`). Khuyến nghị thực
   hiện xong ⟹ đã đóng ⟹ rời tiềm năng (AC-10). Không cộng với _tránh được_/_thực_.
4. **`potentialSavingList`** (AC-2 vế tiềm năng): trang `page`/`pageSize ≤ 100`, thứ tự `monthlyAmount DESC, id`; lọc `group`; dòng `{ recommendationId,
group, tier, application{id,name}, plan{id,name}, provisioningType, monthlyAmount, amountAtPoint?, realisableAt }` — **không** người giữ/nhân viên
   (_không xếp hạng nhân viên_; IT Admin xem tên ở `ghostSeatRecommendationList`). Đếm + trang cùng snapshot.
5. **`avoidedCostList`** (AC-2, AC-9): trang ≤ 100, thứ tự `recordedOn DESC, id DESC`; dòng `{ id, requestId, assignmentId, application{id,name},
plan{id,name}, provisioningType: K2|K4, months?, unitAmount, amount, recordedOn }` (không tên người). Tổng các trang = `avoided.amount`.
6. **Căn cứ _thực_**: route có sẵn `realisedSavingList` (W5) với cùng `from/to` — không route mới; summary ghi `realised.sourceOperationId =
'realisedSavingList'` để FE và dashboard trỏ tới.
7. **Tiết kiệm thực `K1`** (L3-32, Q-149; `US-12-04` AC-11): job `realised-saving-k1.job.ts` mỗi ngày (tiến trình API, như sweeper của `budgets`; khóa
   advisory theo tổ chức; idempotent nhờ UNIQUE `assignment_id`). Với mỗi Assignment `K1` đã kết thúc (`validUntil` ≤ hôm nay) từ `listEndedK1Assignments`:
   baseline = hóa đơn `CONFIRMED` gần nhất (theo `service_period_end`) liên kết **tác vụ cấp** của Assignment, hoặc liên kết **Request** khi Request có
   đúng một người thụ hưởng; không có ⟹ bỏ (đếm `skippedNoBaseline` trong audit lượt). `E` = `service_period_end` của baseline. Ghi một dòng
   `K1_NOT_RENEWED` khi **đủ**: (a) `validUntil ≤ E + 1 ngày` (quyền dừng trước kỳ kế tiếp — _còn dùng tới hết kỳ đã trả thì chưa tăng_); (b) hôm nay >
   `nthWorkingDayFrom(E + 1, PURCHASE_INVOICE_SUBMIT_WORKING_DAYS + PURCHASE_INVOICE_CONFIRM_WORKING_DAYS)` (giá trị tham số lúc chạy); (c) không có
   đề nghị hóa đơn `SUBMITTED`/`CONFIRMED` nào của cùng liên kết có `service_period_start > E`. `saving = baseline.net` (giá trước thuế — Q-58),
   `months` = số tháng của kỳ baseline, `current = 0`, `baseline_purchase_invoice_id` = baseline. Chưa đủ (b) hoặc vướng (c) ⟹ thử lại lượt sau; (a) sai ⟹
   không bao giờ ghi. Audit `REALISED_SAVING.K1_RUN` (`created`, `skippedNoBaseline`, `waiting`). Hóa đơn kỳ sau đến **sau** khi đã ghi: không hoàn tác,
   audit `REALISED_SAVING.K1_CONTRADICTED` khi `purchaseInvoiceConfirm` thấy dòng `K1_NOT_RENEWED` của cùng Assignment (Finance thấy để giải trình).
8. **Quyền** (`US-12-04` AC-4, AC-5; BRD 5.5.3): `FINANCE`, `IT_ADMIN`, `SPENDING_APPROVER` đọc ba route; `IT_ADMIN` nhận `totalSpend: null` (DA8-06 —
   BRD 5.5.3 IT Admin không có cột _Tổng chi_); `MANAGER`, `SUPER_ADMIN`, `EMPLOYEE` ⟹ 403
   `AUTHORIZATION.FORBIDDEN` (guard). Lời 403/422 theo `F03` (route đọc).
9. **Lỗi**: 422 `SAVINGS.RANGE_INVALID`; 422 `VALIDATION_ERROR`. Ví dụ dựng bằng `errorExampleOf(...)`.

## Test matrix

| AC / rủi ro              | Tình huống (gồm từ chối, edge case)                                                                                | Cấp test           | Kết quả mong đợi                                                      | Bằng chứng sau implement |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------- | ------------------------ |
| AC-1                     | quý có tiềm năng 900, tránh được 180, thực 2 460; Người duyệt chi xem                                              | integration + http | ba số riêng; schema không có khóa tổng; `totalSpend` có               |                          |
| AC-2                     | chọn từng số: `realisedSavingList`, `avoidedCostList`, `potentialSavingList` cùng khoảng                           | integration        | tổng trang = số tương ứng; không tên nhân viên ở hai route mới        |                          |
| AC-3                     | khuyến nghị ước 200, hóa đơn giảm thực 150                                                                         | integration        | `realised` 150                                                        |                          |
| AC-4, AC-5               | trưởng phòng, Super Admin, Employee gọi 3 route; Finance, IT Admin                                                 | http               | 403 / 200                                                             |                          |
| DA8-06 tổng chi theo vai | `IT1` và `F1` gọi `savingSummaryGet` cùng khoảng                                                                   | http + integration | `IT1` `totalSpend: null`, ba con số như `F1`; `F1` có `totalSpend`    |                          |
| AC-6                     | thu hồi 5 seat Figma, hóa đơn chưa giảm                                                                            | integration        | `seatsReclaimed` +5, `realised` không đổi                             |                          |
| AC-7                     | kỳ không có cấp từ kho/điều chỉnh; có khuyến nghị mở                                                               | integration        | `avoided`/`realised` 0 + `noActionRecorded true`; tiềm năng có số     |                          |
| AC-9                     | cấp `R8` từ kho 14/07 (90); khóa `K4` 500; xem Q3 và Q4                                                            | integration        | Q3 590, `poolReissueCount` 2; Q4 0                                    |                          |
| AC-10                    | `G4` 15/tháng → thu hồi hoàn tất (khuyến nghị đóng)                                                                | integration        | tiềm năng −15; `realised` không đổi                                   |                          |
| Q-148 tiềm năng          | `G1` 3 seat Trống × 15; `G2` 1 seat 20; `G3` 15; `G4` khóa `K4`                                                    | unit + integration | 45 + 20 + 15 = 80; `K4_EXCLUDED`                                      |                          |
| AC-11 `K1` (L3-32)       | ChatGPT Plus `K1` 20/tháng, hóa đơn kỳ 01–31/10 xác nhận, thu hồi xong 31/10; job 05/11 và sau hạn                 | integration        | 05/11 chưa ghi; sau hạn một dòng `K1_NOT_RENEWED` 20, `months 1`      |                          |
| AC-11 phủ định           | còn dùng tới 15/11 (`validUntil` > E+1); hóa đơn kỳ 11 đã nộp; Request nhóm 3 người link Request; chạy job lần hai | integration        | không ghi / không ghi / không ghi (`skippedNoBaseline`) / không trùng |                          |
| `K1_CONTRADICTED`        | dòng `K1` đã ghi, sau đó Finance xác nhận hóa đơn kỳ 11                                                            | integration        | audit `K1_CONTRADICTED`; dòng giữ nguyên                              |                          |
| migration                | CHECK `K1_NOT_RENEWED` thiếu `assignment_id`; có `subscription_id`; trùng Assignment                               | integration        | từ chối cả ba                                                         |                          |
| `realisedSavingList` đổi | dòng `K1` và dòng `LOWER_INVOICE`                                                                                  | http + integration | `subscription null` + `assignment` / như cũ                           |                          |
| khoảng                   | `from > to`; 400 ngày; thiếu `to`                                                                                  | http               | 422 `RANGE_INVALID` ×2; 422 `VALIDATION_ERROR`                        |                          |
| `API-LIST-DETAIL.1`      | `avoidedCostList`, `potentialSavingList` 3 vs 30 dòng; `pageSize` 101; summary 3 vs 30 nguồn                       | integration + http | số câu lệnh bằng nhau; 422                                            |                          |
| kiến trúc                | `optimization` → `budgets`, `licensing`; không cạnh ngược                                                          | gate               | `pnpm arch:check` xanh; `savings-report` L3, không vòng               |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI 3 mới + `realisedSavingList` đổi (lỗi có ví dụ, `message` riêng, summary ≤ 70 ký tự); manifest API + ví dụ cập nhật.
- [ ] README `optimization` (capability `savings-report`, ba con số không cộng, nguồn từng số), `budgets` (`K1_NOT_RENEWED`, job), `licensing` (hàm facade mới);
      `docs/rules/security-jobs.md` thêm job `K1`; `pnpm arch:capabilities --module optimization` và `--module budgets` không vòng.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W8 (subagent số 2 soạn).
- 09/11/2026: sửa theo cổng thiết kế W8 — `totalSpend` null cho IT Admin (DA8-06); báo cáo ba con số đánh dấu chờ Owner (DA8-07); Sizing một dòng
  (DA8-21); trỏ `spendTotal` theo BvA Phase B. Chuyển gói W8b, `Thiết kế: blocked`.

## Câu tạm chọn (chờ Owner)

- **Q-148 — Định nghĩa và mốc thời gian của ba con số.** (a) _Tiềm năng_: W6 chỉ tính `potentialSaving` cho `G3`/`G4`; `US-12-04` nói _seat đang có
  khuyến nghị thu hồi/giảm_. Phương án: A gồm `G1`–`G4` (giá seat tháng cho `G1`/`G2`), loại `K4`; B chỉ `G3`/`G4`. **Tạm chọn A.** (b) Mốc: tiềm
  năng = hiện tại; tránh được = ngày hoàn tất cấp; thực = ngày ghi dòng. Phương án khác: thực theo kỳ dịch vụ của hóa đơn. **Tạm chọn ngày ghi** (AC-9,
  AC-11 dùng mốc ghi). Đổi lại: `potentialOf(group)` và `rangeOf` trong `savings-report.policy.ts`; `realisedSavingTotal` ở `budgets`.
- **Q-149 — Khi nào gói `K1` có tiết kiệm _thực_** (L3-32; nguồn chỉ nói _kỳ sau không còn bị trừ tiền_). Ví dụ: gói 20 USD/tháng, kỳ trả cuối 01–31/10,
  thu hồi 31/10. Phương án: A ghi khi quá hạn nộp + hạn xác nhận hóa đơn (tham số `PURCHASE_INVOICE_*_WORKING_DAYS`) sau ngày cuối kỳ đã trả mà không
  có hóa đơn kỳ kế tiếp, số tiền = net một kỳ baseline, không hoàn tác (chỉ audit nếu hóa đơn tới muộn); B ghi ngay khi thu hồi hoàn tất; C chờ Finance
  xác nhận tay. **Tạm chọn A** (bằng chứng là _vắng hóa đơn_ qua đủ hạn của `SBF-19`; B trái AC-11 _còn dùng tới hết kỳ thì chưa tăng_). Đổi lại:
  `k1Eligibility` trong `realised-saving.policy.ts`.
