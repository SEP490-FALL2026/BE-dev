# Spec: qd103-period-cost-close — `SBF-11` khoản chi phí nội bộ và khép kỳ: xem trước, phát hành bản chụp bất biến theo vai

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: subagent số 2 của chat review (`SEP-Start 114`), đợt W8 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `blocked` (chờ Owner chọn gói W8b — Q-160). Đã sửa theo cổng thiết kế W8 ngày 09/11/2026 (DA8-04, DA8-05, DA8-08, DA8-13,
  DA8-21). Owner review: chưa review. **Không giao code** tới khi Owner mở gói.
- Gói: **W8b** (chỉ giữ thiết kế).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.1`(7), `FR-5.2`(3), `FR-5.3`, `FR-5.8a`, `FR-5.13`(4), 5.5.3; `QĐ-49g`, `QĐ-62m`, `QĐ-66ab`, `QĐ-66ac`, `QĐ-82e`,
  `QĐ-86b`, `QĐ-89a`, `QĐ-103k`, `QĐ-103l`, `QĐ-103t`(8), `QĐ-104c`, `QĐ-104e`(2); sơ đồ `SBF-11` v2.2 nút `a_inv`, `s_inv`, `s_alloc`, `s_report`, `a_pub`),
  BE `bc10bd1c`. Gap (bảng `API-GAP-W8.md` trong thư mục tracker): B#37, B#38 (vế _ngoại lệ mở_), B#39. Câu tạm chọn: Q-145, Q-146, Q-147.
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (đợt W8).
- [Kế hoạch](plan.md).

## Gói W8b — trạng thái, điểm vào, phụ thuộc

- **Trạng thái:** `blocked`. Tách hai phần (DA8-08) để Owner chọn (Q-160): **P1 khoản chi phí nội bộ** (B#37 — đổi thực chi, nhỏ: 1 bảng, 2 route);
  **P2 khép kỳ/phát hành bản chụp** (B#38 vế báo cáo, B#39 — `US-12-14`, ngoài cụm _thực chi cho kiểm tra ngân sách và BvA_ của `SBF-11` trong
  tracker; nếu làm thì **một** loại kỳ — Q-145).
- **Điểm vào:** P1 `POST/GET /api/v1/internal-costs`; P2 `GET /api/v1/period-reports/preview`, `POST/GET /api/v1/period-reports`, `GET
/api/v1/period-reports/{id}`, `/lines`, `/items`.
- **Phụ thuộc:** P1 cần W8b `qd103-budget-vs-actual-report` Phase B (`spend-source`, hàm tổng đọc chung) — hoặc, nếu Owner chỉ mở P1, P1 tự sửa
  `CommitmentRepo.totals` cộng `internal_costs` (một chỗ, cùng luật năm `QĐ-104e`). P2 cần BvA Phase C (chia kỳ/cơ sở) và phần mở rộng
  `purchaseInvoiceDueList` (kind `BILLING_PERIOD_MISSING`, lọc `servicePeriodMonth` — đã bỏ khỏi W8 `qd103-purchase-invoice-followups`, làm cùng hạng
  mục W8b mở trước). W5 PASS (tỷ lệ seat Trống). W2 `budget-views`.
- **Sửa theo audit (09/11/2026), ưu tiên hơn chữ cũ:** khoản nội bộ vào thực chi qua **hàm tổng hiện có** — `CommitmentRepo.totals.spent` thấy
  `internal_costs` ⟹ `budgetTable`, `budgetMine.remaining`, kiểm tra ngân sách 3 kết quả đổi ngay (DA8-04); không sổ `spend_entries`, không
  `recordInternalCost` (DA8-05); P2 chỉ một loại kỳ (DA8-08); mảng lồng của preview đăng ký `NESTED_ARRAYS` (DA8-13).

## Business outcome

Finance ghi **khoản chi phí phần mềm nội bộ** vào đúng một Cost Center (không hóa đơn, không cam kết, không duyệt) và nó vào thực chi của kỳ.
Cuối kỳ, Finance **xem trước** báo cáo kỳ (Budget vs Actual trên chi phí thực chịu, GTGT riêng, hai dòng _Chưa phân bổ_, Dự phòng kho, tỷ lệ chi
phí seat Trống, phòng vượt ngân sách, **ngoại lệ đang mở**, khoản _điều chỉnh kỳ trước_) rồi **phát hành** một bản chụp **bất biến** có thời điểm và
người phát hành. Một kỳ không phát hành lại. Người duyệt chi đọc toàn bộ kèm lời diễn giải; trưởng phòng đọc phần phòng mình, không lời diễn giải;
IT Admin, Super Admin bị từ chối. Không khóa kỳ, không bước duyệt, không thông báo.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W8, gói W8b), ngoài nhóm G.
- Mode: `technical-enabler`
- Outcome and owner: module `budgets` (T5) — capability mới `budgets/internal-cost/` (P1) và `budgets/period-report/` (P2, L3 — đọc `spend-source`, `spend-report`, điểm vào đọc của `purchaseInvoiceDueList`, `budget-view`); không module mới (`scripts/arch/tiers.cjs:8`).
- Boundaries: P1 — 1 migration (`internal_costs`), 2 operation, sửa hàm tổng; P2 — 1 migration (3 bảng bản chụp), 6 operation; 1 audit action mới; 0 thông báo; ước P1 ~14 file, P2 ~30 file.
- Not larger: bản nháp diễn giải AI (B#40); dự báo (B#41); đối soát sao kê `SBF-07`; dashboard Finance (`qd103-role-dashboards-digest`); việc cần nộp hóa đơn (`qd103-purchase-invoice-followups`).
- Not smaller: phát hành và bất biến phải có cùng lúc với cách tính _điều chỉnh kỳ trước_, nếu không khoản đến muộn bị đếm hai lần hoặc mất.
- Siblings: `qd103-budget-vs-actual-report`, `qd103-purchase-invoice-followups`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                                   | Coverage | Phần còn lại thuộc                                                                                 |
| ----- | ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------- |
| —     | W8-GAP-B#37, B#38 (vế báo cáo), B#39 | n/a      | `qd103-purchase-invoice-followups` (danh sách nguồn của ngoại lệ), AI nháp và dự báo ngoài phạm vi |

## Supporting references

`US-12-11` AC-1→AC-11; `US-12-14` AC-1, AC-2 (vế bản chụp), AC-3, AC-4 (vế xem), AC-5, AC-7→AC-11, AC-13→AC-19 (AC-6, AC-12 ngoài); `US-12-01`
AC-12. Sơ đồ `D:\FPT\FALL2026\Docs\Diagrams\supporting-business-flows\SBF-11-period-cost-attribution.md`.

## Explicit out of scope

AI (`d_ai`, `s_ai`, `a_edit`); dự báo; sao kê và khoản _Chưa phân bổ Cost Center_ do sao kê (`US-12-12`); giải phóng phần dư khoản cam kết (đã có
`budgetCommitmentRelease` — bản chụp chỉ ghi lại các lần giải phóng trong kỳ); sửa/xóa khoản nội bộ đã ghi (chỉ khoản bù — Q-147); khóa kỳ.

## Dependencies and blockers

Xem _Gói W8b — phụ thuộc_ ở trên. Tóm tắt: P1 ← BvA Phase B (hoặc tự sửa hàm tổng); P2 ← BvA Phase C + phần mở rộng `purchaseInvoiceDueList`;
W5 PASS; W2 `budget-views` (`overBudget`, `NO_BUDGET`, `priorPeriodAdjustment`).

## Ownership: module, data, API

- Migration `<ts>_period_cost_close` (enum bằng `CREATE TYPE`; mọi bảng append-only — trigger chặn UPDATE/DELETE):
  - (P1) `internal_costs`: `id`, `organization_id`, `application_id` (giá trị), `cost_center_id` FK, `period_start date`, `period_end date` (CHECK ≥ start, cùng năm
    — Q-147), `amount_minor` (CHECK ≠ 0), `currency char(3)`, `reporting_amount_minor`, `rate`, `rate_date`, `exchange_rate_id NULL`, `note text NULL`
    (≤ 1000), `correction_of_id uuid NULL` FK tự thân, `reason text NULL`; CHECK `amount_minor < 0 ⟹ correction_of_id IS NOT NULL AND reason IS NOT NULL`;
    `recorded_by_employee_id`, `recorded_at`. Index `(organization_id, period_start)`, `(cost_center_id, period_start)`.
  - (P2) `period_reports`: `id`, `organization_id`, `period_key text` (một loại kỳ theo Q-145 — mặc định tháng `2026-10`),
    `period_start`, `period_end`, `currency`, `published_at`, `published_by_employee_id`, `narrative text NULL` (≤ 10 000), tổng công ty (`spent_accrual`,
    `spent_cash`, `committed`, `deductible_tax`), `unallocated_cost_center_minor`, `unallocated_shared_pool_minor`, `shared_pool_reserve_minor NULL`,
    `vacant_cost_ratio_bps NULL`, `vacant_threshold_percent`, `prior_adjustment_minor`, `released_count`, `released_minor`, `open_exception_count`;
    UNIQUE `(organization_id, period_key)`.
  - Enum `PeriodReportLineScope {COST_CENTER, UNALLOCATED_COST_CENTER, UNALLOCATED_SHARED_POOL}`, `PeriodReportDimension {TOTAL, APPLICATION, VENDOR}`;
    `period_report_lines`: `report_id` FK, `line_no` (PK hai cột), `scope`, `dimension`, `cost_center_id NULL`, `department_id NULL`, `key_id NULL`,
    `label`, `budget_status NULL` (`ACTIVE`|`NO_BUDGET`), `base_minor NULL`, `reserve_minor NULL`, `spent_accrual_minor`, `spent_cash_minor`,
    `spent_ytd_minor`, `committed_minor`, `remaining_minor NULL`, `deductible_tax_minor`, `prior_period_adjustment_minor`, `over_budget boolean`.
  - Enum `PeriodReportItemKind {PURCHASE_NOT_SUBMITTED, INVOICE_RETURNED, BILLING_PERIOD_DUE, COMMITMENT_RELEASED, PRIOR_PERIOD_ADJUSTMENT}`;
    `period_report_items`: `report_id` FK, `line_no`, `kind`, `department_id NULL`, `cost_center_id NULL`, `request_id NULL`,
    `subscription_id NULL`, `purchase_invoice_id NULL`, `commitment_id NULL`, `source_kind NULL`, `source_id NULL` (khoản nguồn của `spend-source`), `origin_period_key NULL`, `service_start NULL`,
    `service_end NULL`, `amount_minor NULL`, `reason text NULL`; UNIQUE partial `(organization_id, source_kind, source_id) WHERE kind =
'PRIOR_PERIOD_ADJUSTMENT'` (một khoản đến muộn chỉ là điều chỉnh **một lần** trong một chuỗi kỳ).
- `budgets/internal-cost/` (mới): `internal-costs.controller.ts`, `internal-cost.dto.ts`, `internal-cost.service.ts`, `internal-cost-query.service.ts`,
  `internal-cost.policy.ts` (+ spec), `internal-cost.repo.ts`, `internal-cost.mapper.ts`, `internal-cost.errors.ts`, `internal-cost.http-errors.ts`.
- `budgets/period-report/` (mới): `period-reports.controller.ts`, `period-report.dto.ts`, `period-report-preview.service.ts`, `period-report-publish.service.ts`,
  `period-report-query.service.ts`, `period-report.policy.ts` (+ spec: khóa kỳ, phạm vi vai, chọn khoản điều chỉnh), `period-report.repo.ts`,
  `period-report.mapper.ts`, `period-report.errors.ts`, `period-report.http-errors.ts`, `period-report.types.ts`.
- Facade dùng: `CatalogApi` (kiểu ứng dụng `INTERNAL` — thêm `applicationKindsOf(ids, tx?)` nếu chưa có), `OrganizationReadApi.costCentersByIds`,
  `departmentOfCostCenters(ids, day, tx?)` (mới nếu chưa có), `getDepartmentHeads`/`headedUnitsFor` (phạm vi trưởng phòng), `FinanceApi.parseMoney`,
  `snapshotMoney`. `AuditApi.record`.
- **Operation mới** (`/api/v1`): `internalCostCreate` POST `/internal-costs` (`FINANCE`); `internalCostList` GET `/internal-costs` (`FINANCE`);
  `periodReportPreview` GET `/period-reports/preview?period=` (`FINANCE`); `periodReportPublish` POST `/period-reports` (`FINANCE`);
  `periodReportList` GET `/period-reports` (`FINANCE`, `SPENDING_APPROVER`, `MANAGER`); `periodReportGet` GET `/period-reports/{id}` (cùng ba vai);
  `periodReportLineList` GET `/period-reports/{id}/lines` (cùng ba vai); `periodReportItemList` GET `/period-reports/{id}/items` (`FINANCE`,
  `SPENDING_APPROVER`). Hai subresource thay mảng lồng không biên trong `periodReportGet` (`API-LIST-DETAIL.1`).

## Behavior and design

1. **Ghi khoản nội bộ** (`US-12-11`, `QĐ-49g`, `SBF-11 a_inv`): body `{ applicationId, costCenterId, periodStart, periodEnd?, amount, currency,
note?, correctionOf?, reason? }` (`z.strictObject`; ngày qua `businessDateSchema`). Một transaction: ứng dụng phải `INTERNAL` (khác/không có ⟹
   422 `INTERNAL_COST.NOT_INTERNAL_SOFTWARE` — AC-5); Cost Center phải tồn tại, `ACTIVE` (⟹ 422 `INTERNAL_COST.COST_CENTER_INVALID` — AC-4 _mã
   `Company`_, AC-6); `periodEnd` mặc định `periodStart`, khác năm ⟹ 422 `INTERNAL_COST.PERIOD_SPANS_YEARS` (Q-147); tiền qua `parseMoney`, quy
   đổi `snapshotMoney` theo **ngày ghi** (múi giờ tổ chức — AC-7), thiếu tỷ giá ⟹ 409 `INTERNAL_COST.RATE_MISSING`; lưu `internal_costs` (`budget_year =
năm(period_start)`, phòng = phòng gắn Cost Center tại `period_start`) + audit `INTERNAL_COST.RECORDED` (người, số tiền, Cost Center). **Thực chi**
   (DA8-04): `CommitmentRepo.totals.spent(CC, Y)` cộng `internal_costs` (qua `spend-source` của BvA, hoặc trực tiếp nếu chỉ mở P1) ⟹ `budgetTable.spent`,
   `budgetMine.remaining*`, `budgetCheckGet` và kiểm tra ngân sách 3 kết quả đổi trong cùng transaction đọc sau đó (`US-12-11` AC-1, AC-9). Không tạo
   hóa đơn/cam kết/bước duyệt (AC-1, AC-8). Không có trường tỷ lệ (AC-3); chia = nhiều khoản (AC-2).

2. **Khoản bù** (Q-147, `OQ-F-10`): `correctionOf` + `reason` (1–500) bắt buộc đi cùng; khoản bù chép ứng dụng, Cost Center, kỳ của khoản gốc (gửi khác
   ⟹ 422 `INTERNAL_COST.CORRECTION_INVALID`); `amount` âm, `gốc + Σ bù ≥ 0` (khóa khoản gốc `FOR UPDATE`; vượt ⟹ 422 cùng mã). Khoản đã ghi không
   bao giờ sửa/xóa.
3. **`internalCostList`** (Finance; vai khác 403 — AC-8 vế đọc, trưởng phòng thấy qua `spendReportGet`): lọc `year`, `costCenterId`, `applicationId`;
   trang `page`/`pageSize ≤ 100`, thứ tự `periodStart DESC, id DESC`, đếm + trang cùng snapshot; dòng `{ id, application{id,name}, costCenter{id,code},
periodStart, periodEnd, amount, reportingAmount, correctionOf?, reason?, recordedBy{employeeCode,fullName}, recordedAt }`.
4. **Kỳ** (Q-145 — DA8-08): **một** loại kỳ, mặc định tháng `YYYY-MM` (Owner đổi sang quý `YYYY-Qn` ở câu Q-145); kỳ chưa **kết thúc** (ngày cuối ≥
   hôm nay) ⟹ 422 `PERIOD_REPORT.PERIOD_NOT_ENDED` ở cả preview và
5. **Xem trước** (`periodReportPreview`, `SBF-11 s_inv` → `s_report`; `US-12-14` AC-1, AC-3→AC-5): tính **sống**, không ghi: tổng công ty hai cơ sở,
   hai dòng _Chưa phân bổ_, Dự phòng kho, tỷ lệ chi phí seat Trống của các tháng trong kỳ (dùng lại hàm tỷ lệ của W5) và cờ vượt ngưỡng
   (`getValueAt(IDLE_SEAT_COST_ALERT_PERCENT, hôm nay)`), số phòng `overBudget`, số và tổng _điều chỉnh kỳ trước_ (mục 8), số và tổng lần giải phóng
   cam kết trong kỳ, số **ngoại lệ đang mở**, `alreadyPublished` (+ `publishedReportId`), `limitations` (`STATEMENT_LINES_NOT_INCLUDED`,
   `FORECAST_NOT_INCLUDED`). Chi tiết lúc xem trước đọc qua route sống: `spendReportGet`, `spendFactList`, `purchaseInvoiceDueList`, `budgetCommitmentReleases`.
6. **Ngoại lệ đang mở** (B#38, `QĐ-103l`, `US-12-14` AC-1): lấy từ **điểm vào đọc của `purchaseInvoiceDueList`** (`qd103-purchase-invoice-followups`)
   với mốc `upTo = period_end` (điểm vào đọc nội bộ cùng module `budgets` nhận mốc ngày thay cho query `servicePeriodMonth` của route) — ánh xạ
   `kind` của `purchaseInvoiceDueList` (chat review đối chiếu 09/11): `PURCHASE_MISSING` ⟹ `PURCHASE_NOT_SUBMITTED`, `RETURNED` ⟹
   `INVOICE_RETURNED`, `BILLING_PERIOD_MISSING` ⟹ `BILLING_PERIOD_DUE`. **Không** chặn khép kỳ, **không** đổi trạng thái khoản cam kết (AC-1). Không tạo route
   `purchaseInvoiceMissingList`.
7. **Phát hành** (`periodReportPublish`, `SBF-11 a_pub`; AC-7, AC-8, AC-11, AC-15, AC-16): body `{ period, narrative? (≤ 10 000) }`. Một transaction
   `RepeatableRead`: advisory lock `(org, period_key)`; đã có báo cáo của khóa kỳ ⟹ 409 `PERIOD_REPORT.ALREADY_PUBLISHED` (đua: P2002 map cùng mã).
   Ghi `period_reports` + `period_report_lines` (mỗi Cost Center có số: dòng `TOTAL` với 5 số năm cùng nguồn `budgetTable` + số kỳ hai cơ sở +
   `spent_ytd` + GTGT + `prior_period_adjustment` + `over_budget`/`NO_BUDGET`; dòng `APPLICATION`, `VENDOR` theo Cost Center; hai dòng chưa phân bổ)
   cùng `period_report_items` (ngoại lệ mở, giải phóng cam kết trong kỳ kèm lý do — AC-2, điều chỉnh kỳ trước) bằng INSERT theo lô (≤ 500 dòng/câu).
   Audit `PERIOD_REPORT.PUBLISHED` (`periodKey`, `publishedAt`, vai được xem `[FINANCE, SPENDING_APPROVER, MANAGER]`, số dòng, `releasedCount`,
   `releasedMinor` — AC-15). **Không** thông báo (postcondition `US-12-14`). Trả 201 + `periodReportGet` của Finance.
8. **Điều chỉnh kỳ trước** (`QĐ-62m`, `QĐ-66ab`; AC-9, AC-14, AC-19, `US-12-11` AC-10): ở lần phát hành báo cáo `R`, khoản nguồn `E` (dòng `spend-source`; `recorded_at` = lúc khoản
   thành thực chi: xác nhận hóa đơn, lượt seat-tháng, ghi khoản nội bộ) là điều chỉnh khi `E.recorded_at` > `published_at` của một báo cáo đã phát hành
   có kỳ phủ một phần kỳ dịch vụ của `E`, và `E` chưa là điều chỉnh ở báo cáo nào (UNIQUE partial — một chuỗi kỳ). `amount` = phần chia _theo kỳ_ (Q-141) của `E` rơi vào các kỳ đã phát hành đó; `origin_period_key` =
   kỳ sớm nhất. Phần chia vào chính kỳ `R` vẫn là thực chi bình thường của `R`. Khoản thuộc năm đã đóng giữ `budget_year` cũ (AC-19: 22 USD là thực chi
   2026, hiện ở Q1/2027 là điều chỉnh, ngân sách 2027 không đổi).
9. **Đọc theo vai** (BRD 5.5.3, `SoD-2`, `QĐ-66ac`, Q-146):
   - `periodReportList`: trang `page`/`pageSize ≤ 100`, lọc `year`; thứ tự `periodStart DESC, id DESC`; dòng `{ id, periodKey,
publishedAt, publishedBy{employeeCode,fullName} }` cho cả ba vai (không số).
   - `periodReportGet`: `FINANCE`, `SPENDING_APPROVER` ⟹ đủ tổng công ty, hai dòng chưa phân bổ, Dự phòng kho, tỷ lệ + cờ vượt ngưỡng, `narrative`
     (AC-17, AC-18); `MANAGER` (trưởng phòng có hiệu lực **lúc đọc**) ⟹ chỉ đầu báo cáo (`periodKey`, `publishedAt`, `publishedBy`) và
     `departmentIds` của mình; mọi số công ty, dòng kho, tỷ lệ, `narrative` là `null` — kể cả khi Finance viết riêng cho phòng (AC-17).
   - `periodReportLineList`: lọc `dimension`, `costCenterId`, `departmentId`; trang ≤ 100, thứ tự `line_no`. `MANAGER` ⟹ chỉ dòng `scope = COST_CENTER`
     của Cost Center phòng mình (lọc ép ở repo), dòng `TOTAL` có đủ 5 số + `remaining` (AC-7 viết lại theo `QĐ-100p`); lọc phòng khác ⟹ 403
     `PERIOD_REPORT.SCOPE_FORBIDDEN`.
   - `periodReportItemList`: lọc `kind`; trang ≤ 100; `MANAGER` ⟹ 403 `AUTHORIZATION.FORBIDDEN` (guard).
   - `IT_ADMIN`, `SUPER_ADMIN`, `EMPLOYEE` gọi mọi route đọc ⟹ 403; mọi vai trừ `FINANCE` gọi preview/publish ⟹ 403 (AC-11). Không có route
     _phát hành lại_, _xóa_, _sửa_ (AC-16). Báo cáo không có ⟹ 404 `PERIOD_REPORT.NOT_FOUND`.
10. **Bất biến** (AC-8, AC-14, AC-18): bốn bảng append-only bằng trigger; mọi số lấy từ bản chụp, không tính lại khi đọc; sửa sau đó (hóa đơn, thuế,
    khoản nội bộ, cấp lại seat Trống) chỉ đổi số sống (`budgetTable`, `spendReportGet`) và báo cáo kỳ sau.
11. **Không khóa kỳ** (AC-10): ghi hóa đơn, khoản nội bộ, giải phóng cam kết cho kỳ đã phát hành vẫn thành công; không có mã lỗi _kỳ đã khóa_.
12. **Số câu lệnh**: preview, get, list, line/item list cố định theo cỡ dữ liệu (`test/support/query-count.ts`); publish số câu lệnh tỷ lệ số **lô** 500 dòng.

9a. **Mảng lồng** (DA8-13): mọi mảng trong `periodReportPreview` (dòng theo Cost Center, ngoại lệ, khoản điều chỉnh) phải là subresource phân trang
hoặc có biên chứng minh được; mảng có biên ⟹ mục `NESTED_ARRAYS` + sự kiện `added` có `bound`. Mảng không biên ⟹ chuyển sang route phân trang như
`periodReportLineList`/`ItemList`.

## Test matrix

| AC / rủi ro            | Tình huống (gồm từ chối, edge case)                                                                                                  | Cấp test           | Kết quả mong đợi                                                                                               | Bằng chứng sau implement |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------ |
| US-12-11 AC-1, AC-9    | _Cổng báo cáo nội bộ_ 40tr tháng 10 `CC-ENG`; Finance + `H2` xem `spendReportGet`                                                    | integration        | thực chi `CC-ENG` +40tr; không hóa đơn/cam kết; `H2` thấy khoản phòng mình                                     |                          |
| DA8-04 thực chi        | ghi khoản nội bộ 40tr `CC-ENG`; đọc `budgetTable`, `budgetMine` (`H2`), `budgetCheckGet` của Request `CC-ENG` 70tr khi còn lại 100tr | integration        | `spent` +40tr; `remaining` −40tr; kiểm tra chuyển từ _trong số cơ sở_ sang _dùng dự phòng_/_bị chặn_ đúng biên |                          |
| AC-2, AC-3             | hai khoản 24tr + 16tr; body có `ratios`                                                                                              | http + integration | tổng +40tr; 422 `VALIDATION_ERROR`                                                                             |                          |
| AC-4, AC-6             | Cost Center không tồn tại / `INACTIVE`                                                                                               | http               | 422 `COST_CENTER_INVALID`, không lưu                                                                           |                          |
| AC-5                   | Figma (SaaS)                                                                                                                         | http               | 422 `NOT_INTERNAL_SOFTWARE`                                                                                    |                          |
| AC-7                   | 1 000 USD có tỷ giá ngày ghi; không có tỷ giá                                                                                        | integration        | quy đổi theo ngày ghi, không đổi khi xem; 409 `RATE_MISSING`                                                   |                          |
| AC-8                   | IT Admin, trưởng phòng, Người duyệt chi, Super Admin gọi create/list                                                                 | http               | 403                                                                                                            |                          |
| AC-11 / Q-147          | 120tr kỳ 2027 cả năm; kỳ 11/2026–02/2027                                                                                             | integration + http | 4 quý × 30tr; 422 `PERIOD_SPANS_YEARS`                                                                         |                          |
| Q-147 khoản bù         | bù −10tr khoản 40tr có lý do; bù −50tr; bù thiếu lý do; bù đổi Cost Center                                                           | integration        | 201 tổng 30tr / 422 ×3 `CORRECTION_INVALID`/`VALIDATION_ERROR`                                                 |                          |
| append-only            | UPDATE/DELETE `internal_costs`, `period_reports`, lines, items                                                                       | integration        | trigger từ chối                                                                                                |                          |
| US-12-14 AC-1          | `R1` xác nhận 21tr (GTGT 2tr); `R3` cấp chưa nộp; hóa đơn Zoom bị trả                                                                | integration        | thực chi 21tr, GTGT 2tr riêng; 2 ngoại lệ mở; `K3` vẫn giữ; publish không bị chặn                              |                          |
| AC-2                   | giải phóng 3tr có lý do trong kỳ rồi publish                                                                                         | integration        | item `COMMITMENT_RELEASED` có lý do; header `released*`                                                        |                          |
| AC-4                   | Figma 6 `P-DES`, 3 `P-ENG` (`E1` chồng lấn), 1 Trống, tài khoản dịch vụ `P-DES`                                                      | integration        | lines `CC-DES` 90 (+ dịch vụ), `CC-ENG` 45, kho 15 — không mất, không đếm hai lần                              |                          |
| AC-5, AC-13            | `CC-DES` 100/40/20/GTGT 3; `CC-NEW` chưa ngân sách; `CC-X` còn lại −5tr                                                              | integration        | còn lại 40tr; `NO_BUDGET` không 0; −5tr `over_budget`                                                          |                          |
| AC-7 / Q-146           | sau phát hành: `C1`, `F1`, `H1`, `IT1`, `SA1` đọc get/lines/items                                                                    | http + integration | `C1`/`F1` đủ; `H1` chỉ dòng `P-DES`, số công ty null, items 403; `IT1`/`SA1` 403                               |                          |
| AC-7 hết hạn           | `H1` thôi trưởng phòng rồi đọc lines                                                                                                 | integration        | 403 `SCOPE_FORBIDDEN`                                                                                          |                          |
| AC-8, AC-10            | sau phát hành: hóa đơn mới, sửa thuế, khoản nội bộ cho kỳ đó                                                                         | integration        | đều thành công; bản chụp không đổi số, giữ `publishedAt`, người                                                |                          |
| AC-9, `US-12-11` AC-10 | Q3 phát hành 02/10; hóa đơn Q3 ghi 05/10; publish Q4                                                                                 | integration        | Q4 item `PRIOR_PERIOD_ADJUSTMENT` gốc `2026-Q3`; Q3 như cũ                                                     |                          |
| điều chỉnh một lần     | khoản đến muộn sau Q3; publish Q4 rồi Q1/2027; chuỗi tháng song song                                                                 | integration        | chỉ Q4 có item (chuỗi quý); chuỗi tháng có item riêng của mình                                                 |                          |
| AC-19                  | Q4/2026 đã phát hành; hóa đơn kỳ 12/2026 22 USD xác nhận 10/02/2027; publish Q1/2027                                                 | integration        | 22 USD thực chi 2026; item điều chỉnh gốc `2026-Q4`; số 2027 `CC-DES` không đổi                                |                          |
| AC-11                  | `C1`, IT Admin, trưởng phòng, Super Admin gọi preview/publish                                                                        | http               | 403; không bản chụp                                                                                            |                          |
| AC-16                  | publish Q3 lần hai; hai publish song song                                                                                            | http + integration | 409 `ALREADY_PUBLISHED`; một 201 một 409                                                                       |                          |
| AC-17                  | narrative có số toàn công ty; `H1` đọc get                                                                                           | integration        | `F1`/`C1` thấy; `H1` `narrative null`                                                                          |                          |
| AC-18                  | Q4 kho Trống 12tr, Dự phòng kho 50tr, chi phí kho 100tr, ngưỡng 10 %; rồi cấp lại seat                                               | integration        | 1 200 bps, cờ vượt ngưỡng; bản chụp không đổi; `H1` không thấy dòng kho/tỷ lệ                                  |                          |
| kỳ                     | kỳ chưa kết thúc; `2026-13`; `2026-Q5`                                                                                               | http               | 422 `PERIOD_NOT_ENDED` / 422 `VALIDATION_ERROR` ×2                                                             |                          |
| không thông báo        | publish                                                                                                                              | integration        | không dòng notification mới; audit `PERIOD_REPORT.PUBLISHED` đủ trường                                         |                          |
| `API-LIST-DETAIL.1`    | list, lines, items, internalCostList với 3 vs 30 dòng; `pageSize` 101                                                                | integration + http | số câu lệnh bằng nhau; 422                                                                                     |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI 8 operation mới (lỗi có ví dụ, `message` riêng, summary ≤ 70 ký tự); manifest API + ví dụ cập nhật; không mục ngoại lệ mới
      trong gate `api-collection-contract`.
- [ ] README `budgets` (capability `internal-cost`, `period-report`, bất biến bản chụp, cách chọn khoản điều chỉnh, thứ tự khóa publish);
      `pnpm arch:capabilities --module budgets` không vòng.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W8 (subagent số 2 soạn).
- 09/11/2026: sửa theo cổng thiết kế W8 — khoản nội bộ vào thực chi qua hàm tổng (DA8-04), bỏ sổ (DA8-05), tách P1/P2 và một loại kỳ (DA8-08),
  mảng lồng (DA8-13), Sizing một dòng (DA8-21). Chuyển gói W8b, `Thiết kế: blocked`.

## Câu tạm chọn (chờ Owner)

- **Q-145 — Kỳ phát hành và chuỗi điều chỉnh** (`OQ-F-14` mở; đổi theo DA8-08 — câu Owner). Phương án: A cả tháng và quý, hai chuỗi _điều chỉnh kỳ
  trước_ song song (bản nháp cũ — phình); B chỉ tháng; C chỉ quý. **Tạm chọn B** (`SBF-11` _kết thúc kỳ (tháng)_; một chuỗi, ít bảng/enum hơn; quý
  đọc được qua `spendReportGet?period=Qn`). Đổi lại: `periodKeyOf` trong `period-report.policy.ts`.

- **Q-146 — Bản của trưởng phòng.** AC-7 (`QĐ-100p`) liệt kê thêm đề xuất, dòng phiên bản đã duyệt, danh sách phiên bản đã gửi. Phương án: A bản chụp chỉ
  giữ dòng Cost Center của phòng (5 số + theo ứng dụng/NCC), phần đề xuất/phiên bản đọc qua route sống `budgetMine*` (bất biến sẵn sau khi duyệt);
  B chụp cả dòng phiên bản vào báo cáo. Phạm vi xác định **lúc đọc** theo giai đoạn trưởng phòng; ngoại lệ mở và lời diễn giải không hiện cho trưởng
  phòng. **Tạm chọn A.** Đổi lại: `scopeOf` trong `period-report.policy.ts`, `period-report-publish.service.ts` (thêm loại dòng nếu B).
- **Q-147 — Sửa sai khoản nội bộ và kỳ nhiều năm** (`OQ-F-10` _chặn-thiết-kế_). Phương án: A khoản đã ghi bất biến, sửa bằng **khoản bù âm** có lý do,
  tổng không âm; kỳ một khoản nằm trong một năm dương lịch (nhiều năm ⟹ ghi nhiều khoản, như _muốn chia thì ghi nhiều khoản_ của `FR-5.2`(3));
  B sửa tại chỗ có lịch sử; C hủy rồi ghi lại. **Tạm chọn A** (Audit Trail và bản chụp không đổi; `budget_year` một nghĩa). Đổi lại:
  `internal-cost.policy.ts` (`assertCorrection`, `assertSingleYear`).
