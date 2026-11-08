# Spec: qd103-budget-vs-actual-report — Budget vs Actual theo kỳ/chiều/cơ sở, truy căn cứ một con số, cột GTGT được khấu trừ, bổ sung đọc nhỏ của MF-4

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: subagent số 2 của chat review (`SEP-Start 114`), đợt W8 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `blocked` (chờ Owner chọn gói W8b — Q-160). Đã sửa theo cổng thiết kế W8 ngày 09/11/2026 (DA8-04, DA8-05, DA8-13, DA8-18,
  DA8-19, DA8-21). Owner review: chưa review. **Không giao code** tới khi Owner mở gói.
- Gói: **W8b** (chỉ giữ thiết kế).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.1`(5)(7), `FR-5.2`(1)(3)(4), `FR-5.3`, `FR-5.13`(4), 5.5.3; `QĐ-24`, `QĐ-82e`, `QĐ-97d`, `QĐ-100p`, `QĐ-103k`,
  `QĐ-103r`, `QĐ-103t`(8), `QĐ-104a`, `QĐ-104c`, `QĐ-104e`; sơ đồ `SBF-11` v2.2 `s_alloc`, `s_report`), BE `bc10bd1c`. Gap (bảng `API-GAP-W8.md`
  trong thư mục tracker): B#2, B#15, B#21, B#23, B#25, B#26, B#27, B#28, B#34. Câu tạm chọn: Q-140 → Q-144 (cuối spec).
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (đợt W8).
- [Kế hoạch](plan.md).

## Gói W8b — trạng thái, điểm vào, phụ thuộc

- **Trạng thái:** `blocked`. Không phải gap trực tiếp của bước MF-4 theo tracker W8 (DA8-01): báo cáo Budget vs Actual nhiều chiều (`US-12-01`),
  truy căn cứ, cột GTGT, bốn chỗ đọc nhỏ MF-4. Chờ Owner chọn (Q-160): (a) mở cả hạng mục; (b) chỉ mở **Phase A** (đọc nhỏ MF-4: B#2, B#15,
  B#21, B#23 — nhỏ, không migration, ~12 file); (c) để sau đợt W9.
- **Điểm vào:** `GET /api/v1/spend-reports` (`spendReportGet`), `GET /api/v1/spend-facts` (`spendFactList`), `GET /api/v1/budget-cycles/{year}/history`
  (`budgetCycleHistoryList`); đổi `budgetTable`, `budgetSummary`, `budgetMine`, `budgetCyclePackage`, `budgetCommitmentList`/`Releases`.
- **Phụ thuộc:** W2, W4, W5 PASS; W8 `qd103-request-history-by-role` (dùng lại `AuditApi.eventsOfResource` cho B#2); W8
  `qd103-purchase-invoice-followups` (thuế Finance ghi vào cột chung — không chặn). Hạng mục W8b khác cần nó: `qd103-period-cost-close` (chia kỳ,
  nguồn thực chi), `qd103-savings-report` (`BudgetsApi.spendTotal`), `qd103-role-dashboards-digest` (`spendReportGet`).
- **Sửa theo audit (09/11/2026), ưu tiên hơn mọi chữ cũ còn sót:** bỏ sổ thứ hai `spend_entries` và backfill — báo cáo, truy căn cứ và cột GTGT
  **đọc thẳng** nguồn bằng một đoạn SQL dùng chung với hàm tổng `CommitmentRepo.totals` (DA8-05); khoản nội bộ vào thực chi qua chính hàm tổng
  (DA8-04 — làm ở `qd103-period-cost-close`); lịch sử kỳ đọc Audit Trail qua `AuditApi.eventsOfResource` + allowlist, không bảng
  `budget_cycle_changes` (DA8-18); trưởng phòng **không** thấy cột GTGT tới khi Owner trả lời `OQ-F-02` (DA8-19); mảng lồng `limitations`,
  `totals` đăng ký `NESTED_ARRAYS` (DA8-13).

## Business outcome

Finance và Người duyệt chi mở **một** báo cáo Budget vs Actual, chọn **kỳ** (tháng, quý, YTD của một năm), **chiều gom** (Cost Center, phòng ban,
ứng dụng, nhà cung cấp) và **cơ sở** (_theo kỳ_ / _theo hóa đơn — dòng tiền_), thấy ngân sách · thực chi · cam kết đang giữ · còn lại trên chi
phí thực chịu, **GTGT được khấu trừ ở cột riêng**, hai dòng _Chưa phân bổ_ tách riêng, và bấm một con số để thấy **các khoản tạo nên nó**
(hóa đơn, seat-tháng, khoản nội bộ, phần chưa phân bổ). Trưởng phòng thấy thực chi và cam kết **của phòng mình** theo ứng dụng/nhà cung cấp.
Cột `deductibleTax` có trên `budgetTable`, `budgetSummary`, `budgetMine`. MF-4 có thêm bốn chỗ đọc nhỏ: lịch sử đổi Trần/Dự phòng kho,
trạng thái trưởng phòng trong gói B4, người giữ/phần mềm của khoản cam kết tự tạo 01/01, phần cam kết tự tạo trong số của trưởng phòng.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W8, gói W8b), ngoài nhóm G.
- Mode: `technical-enabler`
- Outcome and owner: module `budgets` (T5) — capability mới `budgets/spend-source/` (L0: một đoạn SQL nguồn thực chi dùng chung cho hàm tổng và báo cáo) và `budgets/spend-report/` (L3, hai route đọc); nhãn qua facade `catalog`, `organization`, `licensing`.
- Boundaries: 0 migration; 3 operation mới (`spendReportGet`, `spendFactList`, `budgetCycleHistoryList`); 6 operation đổi; 2 hàm facade mới; `CommitmentRequestView` thêm `applicationId`, `vendorId`; ước ~40 file, 3 lượt.
- Not larger: ghi khoản nội bộ, khép kỳ, phát hành báo cáo kỳ (`qd103-period-cost-close`); tiết kiệm (`qd103-savings-report`); dashboard, `BUDGET_OVER_RESERVE` (`qd103-role-dashboards-digest`); thuế Finance ghi (`qd103-purchase-invoice-followups`); sao kê `SBF-07`; dự báo (B#41).
- Not smaller: báo cáo, truy căn cứ, cột GTGT và hàm tổng phải đọc **cùng một** đoạn SQL nguồn, nếu không tổng một Cost Center trên báo cáo lệch `budgetTable` (`US-12-01` AC-9).
- Siblings: `qd103-period-cost-close`, `qd103-savings-report`, `qd103-role-dashboards-digest`, `qd103-request-history-by-role`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                                                                    | Coverage | Phần còn lại thuộc                                                                                          |
| ----- | --------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| —     | W8-GAP-B#26, B#27, B#28, B#34, B#25, B#2, B#15, B#21, B#23 (tạm chọn) | n/a      | `qd103-period-cost-close` (khoản nội bộ, báo cáo kỳ), `qd103-role-dashboards-digest` (dashboard, thông báo) |

## Supporting references

`US-12-01` AC-1→AC-7, AC-9, AC-11, AC-13, AC-14, AC-16, AC-17 (vế đọc); `US-12-18` AC-1, AC-7 (dòng theo phòng/chưa phân bổ); `US-12-20` AC-1
(dòng kho theo tháng); `US-12-11` AC-9, AC-11 (vế báo cáo — số liệu có khi `qd103-period-cost-close` ghi `internal_costs`); `US-06-15` AC-8 (lịch sử Trần năm,
`EP-06.md:525`); `US-06-18` AC-9 (`EP-06.md:658`); `US-06-11`/`EP-06.md:689-691` (danh sách phòng không trưởng phòng, B#15). Spec W2/W4/W5 dựa vào:
`qd103-budget-views`, `qd103-budget-cycle-ceilings`, `qd103-budget-baseline-annual-check`, `qd103-new-year-auto-commitments`,
`qd103-purchase-invoice-sbf19`, `qd103-seat-month-cost-pool-line`.

## Explicit out of scope

- Khoản sao kê chưa có hóa đơn (_thực chi tạm_, `FR-5.4`(5), `US-12-01` AC-8, AC-9 vế sao kê) — `SBF-07` ngoài phạm vi tracker; báo cáo ghi
  `limitations: ['STATEMENT_LINES_NOT_INCLUDED']`.
- Chiều _dự án_, _cây người phụ trách_ (`US-12-01` AC-4 — không tồn tại); phân kỳ quý của phiên bản và so dự báo.
- Tiền tệ khác tiền báo cáo: giữ đúng cách của hàm tổng W5 (`spec:qd103-seat-month-cost-pool-line` mục _Explicit out of scope_), không quy đổi lại.
- Ghi khoản nội bộ (bảng `internal_costs`) — `qd103-period-cost-close`; `spend-source` đọc bảng đó khi có.

## Dependencies and blockers

W2 PASS (`budget-views`: `remaining*`, `NO_BUDGET`, `priorPeriodAdjustment`; `budget-cycle-ceilings`; `budget-baseline-annual-check` B4 + luật
`BASELINE`). W4 PASS (`purchase-invoice-sbf19`: `purchase_invoices`, `applyConfirmed`, `CommitmentRequestView`; `new-year-auto-commitments`:
`origin`, `assignment_id`). W5 PASS (`seat-month-cost-pool-line`: `seat_cost_months`, hàm tổng `CommitmentRepo.totals`). W8
`qd103-request-history-by-role` PASS (`AuditApi.eventsOfResource` cho B#2). Phase A (B#2, B#15, B#21, B#23) làm được khi W2 + W4 + W8
`qd103-request-history-by-role` PASS.

## Ownership: module, data, API

- **Không migration** (DA8-05, DA8-18). Không bảng sổ, không backfill, không bảng lịch sử kỳ.
- `budgets/spend-source/` (mới, L0 — chỉ facade tầng dưới): `spend-source.repo.ts` (một đoạn SQL `UNION ALL` các khoản đã thành thực chi:
  `purchase_invoices`/`invoices` đã xác nhận theo luật W5 mục 6, `seat_cost_months`, và `internal_costs` khi `qd103-period-cost-close` đã có — mỗi
  dòng mang `kind`, `line`, `source_id`, `cost_center_id`, `department_id`, `application_id`, `vendor_id`, `service_start`, `service_end`,
  `invoice_on`, `budget_year`, `actual_minor`, `deductible_tax_minor`, `unallocated_reason`, `recorded_at` — lúc khoản thành thực chi), `spend-source.policy.ts` (+ spec: line/năm/ngày cơ sở
  của từng nguồn), `spend-source.types.ts`. `CommitmentRepo.totals` (`budgets/budget/commitment.repo.ts`, sửa file có sẵn) đọc `spent` từ chính
  đoạn SQL này (lọc `line = 'COST_CENTER'`) ⟹ bất biến _báo cáo = hàm tổng_ đúng theo cấu tạo, test chỉ để chặn hồi quy.
- `budgets/spend-report/` (mới, L3): `spend-reports.controller.ts` (2 route), `spend-report.dto.ts`, `spend-report-view.service.ts`,
  `spend-fact-query.service.ts`, `spend-report.policy.ts` (+ spec: kỳ → khoảng ngày, phạm vi theo vai, chiều cho phép), `spend-report.repo.ts`
  (gom theo SQL, chia theo kỳ), `spend-report.mapper.ts`, `spend-report.errors.ts`, `spend-report.http-errors.ts`, `spend-report.types.ts`.
- Không có điểm ghi mới ở W4/W5 (bản nháp cũ ghi sổ ở `purchase-invoice-decision.service.ts`, `seat-cost.service.ts` — bỏ).
- `budgets/budget/` (24 file — chỉ sửa file có sẵn): `budget.dto.ts` (`deductibleTax` ở dòng bảng, `totals[*]`, `budgetMine` — `null` cho trưởng phòng,
  DA8-19; `committedYearStartAuto` ở `budgetMine`), `budget-facts.repo.ts` (GTGT theo lô Cost Center × năm từ `spend-source`), `commitment.repo.ts`
  (`totals` đọc `spend-source`; thêm phần tự tạo 01/01). `budgets/budget-view/budget-view.service.ts`.
- `budgets/cycle/`: `cycle-history-query.service.ts` (mới — đọc `AuditApi.eventsOfResource('BUDGET_CYCLE', cycleId, CYCLE_HISTORY_ACTIONS, skip,
take)`, allowlist hành động audit của `update`/`setCeilings`/`publish` → `field`, chỉ lấy khóa trước/sau/lý do), `budget-cycles.controller.ts`
  (route lịch sử), `cycle.dto.ts`; gói B4: nơi W2 đặt `budgetCyclePackage` (đọc `bc10bd1c`) — thêm `headStatus`, `baselineVersionAllowed`,
  `baselineBlockedReason` dùng **cùng hàm luật** của `budgetVersionCreate source=BASELINE`.
- `budgets/commitment/`: `commitment.dto.ts`, `commitment.service.ts` (gắn `assignment` theo lô cho khoản `YEAR_START_AUTO`).
- `budgets/public/budgets.extension-points.ts`: `CommitmentRequestView` thêm `applicationId`, `vendorId` (requests điền ở
  `requests/spend/commitment-request-facts.listener.ts`, file có sẵn). `budgets/public/budgets.api.ts`: `spendTotal(range, basis)` (cho
  `qd103-savings-report`).
- `licensing/public/licensing.api.ts`: `assignmentBriefs(ids, tx?)` ⟹ `{ id, employeeId, planId, applicationId }[]` (một câu lệnh).
  `catalog/public/catalog.api.ts`: `applicationLabels(ids)`, `vendorLabels(ids)` (tên, theo lô) nếu chưa có hàm tương đương ở `bc10bd1c`.
- **Operation mới** (`/api/v1`): `spendReportGet` GET `/spend-reports` (`FINANCE`, `SPENDING_APPROVER`, `MANAGER`); `spendFactList` GET `/spend-facts`
  (`FINANCE`, `SPENDING_APPROVER`, `MANAGER`); `budgetCycleHistoryList` GET `/budget-cycles/{year}/history` (`FINANCE`, `SPENDING_APPROVER`).
  **Đổi**: `budgetTable`, `budgetSummary` (`deductibleTax`), `budgetMine` (`deductibleTax`, `committedYearStartAuto`), `budgetCyclePackage`
  (`departments[].headStatus`, `baselineVersionAllowed`, `baselineBlockedReason`), `budgetCommitmentList` (+ `budgetCommitmentReleases` nếu hiện dòng
  khoản: `assignment`). Không operation nào bị bỏ (B#34 `unallocatedCostList` **không** tạo — thay bằng `spendFactList?line=UNALLOCATED_COST_CENTER`).

## Behavior and design

1. **Nguồn thực chi đọc thẳng** (một nguồn — `FR-5.1`(5), `US-12-01` AC-9; DA8-05): không sổ thứ hai. `spend-source` liệt kê mỗi khoản đã thành
   thực chi **từ bảng gốc**:
   - Hóa đơn xác nhận (`SBF-19`) đích `COMMITMENT` (`K1`, `K4`, mua một lần) ⟹ `INVOICE`/`COST_CENTER` của Cost Center khoản; `actual = net +
thuế không khấu trừ`; `deductible_tax`; `service_*` = kỳ dịch vụ; `invoice_on = issued_on`; `budget_year = năm(service_start)`.
   - Đích `HOLDER_DEPARTMENT` ⟹ `COST_CENTER` của Cost Center hiện hành của phòng tại `service_start`; đích `UNALLOCATED_COST_CENTER` ⟹ dòng đó
     kèm `unallocated_reason` (theo `targetOf` của W4).
   - Đích `SHARED_POOL` (hóa đơn `K2`) ⟹ `UNALLOCATED_SHARED_POOL` với `actual = 0`, chỉ mang `deductible_tax` (`QĐ-104c`, `US-12-01` AC-2).
   - `seat_cost_months` (W5) ⟹ `SEAT_MONTH`: `HOLDER` ⟹ `COST_CENTER`; `UNALLOCATED_COST_CENTER` ⟹ dòng đó; `SHARED_POOL`,
     `SHARED_POOL_INVOICE_VARIANCE` ⟹ `UNALLOCATED_SHARED_POOL`; `invoice_on` = ngày 1 của tháng (Q-140).
   - `internal_costs` (khi `qd103-period-cost-close` có) ⟹ `INTERNAL_COST`/`COST_CENTER`, `budget_year = năm(period_start)`.
     `CommitmentRepo.totals.spent(CC, Y)` = Σ `actual` của `spend-source` với `line = 'COST_CENTER'`, Cost Center `CC`, năm `Y` (luật W5 mục 6 giữ nguyên
     — hóa đơn `K2` đã khép tháng không tính, vì `K2` đi theo seat-tháng). Kiểm tra ngân sách 3 kết quả và ba view W2 dùng hàm tổng ⟹ tự thấy mọi
     nguồn, kể cả khoản nội bộ (DA8-04). Test: đổi đoạn SQL ⟹ cả `budgetTable` lẫn báo cáo đổi cùng.
2. **Kỳ** (`spend-report.policy.ts`): query `year` (bắt buộc), `period` ∈ `M01…M12` | `Q1…Q4` | `YTD` (mặc định `YTD`); khoảng = tháng/quý của
   `year`; `YTD` = 01/01 → hôm nay (múi giờ tổ chức), năm đã qua ⟹ cả năm; năm tương lai ⟹ 422 `SPEND_REPORT.PERIOD_IN_FUTURE`.
3. **Cơ sở** (`FR-5.3`, Q-140): `basis=ACCRUAL` (_theo kỳ_, mặc định) — khoản kỳ dài chia đều theo tháng của `service_start…service_end`, tháng lẻ
   theo số ngày, phần dư làm tròn dồn vào tháng cuối (Q-141; `US-12-01` AC-2: 12 000/năm ⟹ 1 000/tháng; `US-12-11` AC-11: 120tr/năm ⟹ 30tr/quý);
   `basis=CASH` (_theo hóa đơn_) — cả khoản vào ngày `invoice_on`. Chia làm bằng SQL (`generate_series` theo tháng giao khoảng), không đọc từng dòng.
   Response luôn có `basis` và `basisLabel` (`ACCRUAL` | `CASH`) cùng `asOf` (thời điểm đọc) và `lastRecordedAt` (khoản mới nhất của nguồn — AC-13, không
   nhãn _thời gian thực_).
4. **Chiều gom** `groupBy` ∈ `COST_CENTER` | `DEPARTMENT` | `APPLICATION` | `VENDOR` (`US-12-01` AC-4; khác ⟹ 422 `VALIDATION_ERROR`). Dòng
   (`rows[]`, **phân trang** `page`/`pageSize ≤ 100`, thứ tự `label, key`): `{ key, label, spent, deductibleTax, committed, budget?, remaining?,
overBudget? }`. `spent`/`deductibleTax` = phần của kỳ theo cơ sở; `committed` = cam kết **đang giữ** của năm (theo ứng dụng/NCC qua
   `CommitmentRequestView.applicationId/vendorId`; khoản 01/01 qua `assignmentBriefs`); `budget`, `remaining`, `overBudget` chỉ ở `COST_CENTER`/
   `DEPARTMENT`, là số **năm** đọc từ cùng nguồn `budgetTable` (`QĐ-82e`: kiểm soát theo năm, tháng/quý chỉ cho thực chi); `NO_BUDGET` ⟹ `budget:
null`, `status: 'NO_BUDGET'`. Dòng `line ≠ COST_CENTER` **không** vào `rows`; khóa `UNKNOWN` (dữ liệu cũ không xác định phòng/ứng dụng) là một dòng
   có nhãn riêng. Phần `totals` (không phân trang): `company { spent, deductibleTax, committed }` = Σ phòng + hai dòng dưới (AC-11),
   `unallocatedCostCenter { spent, deductibleTax }`, `unallocatedSharedPool { spent, deductibleTax, sharedPoolReserve }` (đặt cạnh Dự phòng kho —
   AC-16; `sharedPoolReserve` null khi chưa có kỳ), `limitations`. Không có hàng/ngân sách `Company`.
5. **Phạm vi theo vai** (`US-12-01` AC-6, AC-7; `QĐ-100p`; BRD 5.5.3): `FINANCE`, `SPENDING_APPROVER` — mọi chiều, toàn công ty. `MANAGER` — chỉ
   khi đang là trưởng phòng có hiệu lực (đọc `headedUnitsFor` như `budgetMine`); bắt buộc `groupBy=APPLICATION|VENDOR` (khác ⟹ 403
   `SPEND_REPORT.SCOPE_FORBIDDEN`); số chỉ của Cost Center của phòng mình ở năm đó; **không** `totals.company`, hai dòng _Chưa phân bổ_,
   `sharedPoolReserve` (trả `null`, có trong schema là `nullable`); `departmentId` khác phòng mình ⟹ 403 cùng mã; hết giai đoạn trưởng phòng ⟹ 403.
   `IT_ADMIN`, `SUPER_ADMIN`, `EMPLOYEE` ⟹ 403 `AUTHORIZATION.FORBIDDEN` (guard). Trưởng phòng nhận `deductibleTax: null` (Q-142 (a) — DA8-19).
6. **Truy căn cứ** `spendFactList` (`US-12-01` AC-5, AC-16; B#27, B#34): query `year` + `period` + `basis` như mục 2–3, lọc tùy chọn `line`
   (`COST_CENTER` | `UNALLOCATED_COST_CENTER` | `UNALLOCATED_SHARED_POOL`), `costCenterId`, `departmentId`, `applicationId`, `vendorId`, `kind`
   (`INVOICE` | `SEAT_MONTH` | `INTERNAL_COST`); trang `page`/`pageSize ≤ 100`, thứ tự `service_start DESC, id DESC`. Dòng (summary): `{ id, kind, line,
sourceId, costCenter?{id,code}, department?{id,name}, application?{id,name}, vendor?{id,name}, servicePeriod{start,end}, invoiceOn, amountInPeriod,
actualCost, deductibleTax, unallocatedReason?, commitmentId?, requestId?, subscriptionId? }` (`amountInPeriod` = phần chia vào kỳ theo cơ sở). Tổng
   các `amountInPeriod` cùng bộ lọc = con số tương ứng của `spendReportGet` (test). Trưởng phòng: chỉ `line=COST_CENTER` của Cost Center mình (lọc ép
   ở repo; lọc khác ⟹ 403 `SPEND_REPORT.SCOPE_FORBIDDEN`). Người duyệt chi đọc được cả dòng _Chưa phân bổ Cost Center_ từng khoản (BRD 5.5.3 không cấm;
   B#34 _Người duyệt chi chỉ tổng_ là đề xuất của audit, không có nguồn — giữ đọc được, ghi ở Q-142).
7. **Cột GTGT được khấu trừ** (B#25, `FR-5.13`(4), `US-12-01` AC-1): `deductibleTax` (moneyView) = Σ `deductible_tax_minor` của `spend-source` theo
   (Cost Center, `budget_year`) — ở dòng `budgetTable`, `budgetSummary.totals[*]` và `budgetMine`. **Không** trừ vào `spent`/`remaining*` (test AC-1:
   40tr thực chi, 3tr GTGT riêng). Trưởng phòng nhận `null` (DA8-19, `OQ-F-02` mở; `QĐ-100p` chỉ liệt kê 5 số) — trường nullable trong một schema.
8. **Lịch sử kỳ ngân sách** (B#2, `EP-06.md:525`, Q-144 đổi — DA8-18): đọc Audit Trail của tài nguyên `BUDGET_CYCLE` qua
   `AuditApi.eventsOfResource` (hàm có phân trang, do W8 `qd103-request-history-by-role` thêm) với allowlist hành động của `update`, `setCeilings`,
   `publish` (chat code đối chiếu tên `action` thật và khóa `before`/`after` mà W2 ghi; hành động/khóa thiếu ⟹ ghi _Lệch_, không thêm bảng).
   `budgetCycleHistoryList` (`FINANCE`, `SPENDING_APPROVER`; trưởng phòng 403 — `US-06-15` AC-7): trang `page`/`pageSize ≤ 100`, thứ tự
   `occurredAt DESC, id DESC`, dòng `{ id, changedAt, by{employeeCode,fullName}|null, field, department?{id,name}, before, after, reason }`; chỉ
   khóa trong allowlist. Năm không có kỳ ⟹ 404 `BUDGET.CYCLE_NOT_FOUND` (mã có sẵn). Thay đổi trước khi W2 ghi audit đủ khóa ⟹ không có (giới hạn ghi README).

9. **Gói B4 — trạng thái trưởng phòng** (B#15, `EP-06.md:689-691`): mỗi `departments[]` thêm `headStatus` (`HAS_HEAD` | `NO_HEAD` | `SUCCESSOR_PENDING`
   — theo vế (c) của luật `BASELINE`), `baselineVersionAllowed` và `baselineBlockedReason` (cùng giá trị `details.reason` của 409
   `BUDGET.BASELINE_VERSION_NOT_ALLOWED`, hoặc `SETUP_INCOMPLETE` khi thiếu vế (e)). Tính bằng **đúng hàm** mà `budgetVersionCreate` dùng, theo lô
   (một lần đọc trưởng phòng `getDepartmentHeads` + nhiệm kỳ sắp tới cho mọi phòng) — test: mọi phòng `baselineVersionAllowed = true` thì
   `budgetVersionCreate source=BASELINE` thành công, `false` thì 409 cùng `reason`.
10. **Khoản cam kết tự tạo 01/01** (B#21, `EP-06.md:650-653`): dòng `budgetCommitmentList` (và `budgetCommitmentReleases` nếu dòng hiện khoản) có
    `assignment: { id, employee{employeeCode,fullName}, application{id,name}, plan{id,name}|null } | null` — có khi `origin = YEAR_START_AUTO` và
    `assignment_id` khác null; đọc theo lô (`assignmentBriefs` + `getEmployees` + nhãn catalog), số câu lệnh hằng.
11. **Trưởng phòng thấy phần cam kết tự tạo** (B#23, Q-143): **không** tạo `budgetMineCommitmentList`; `budgetMine` thêm `committedYearStartAuto`
    (phần của `committed` là khoản `YEAR_START_AUTO` đang giữ) — trả lời AC-9 _"thấy cam kết đang giữ gồm các khoản tự tạo"_. Danh sách từng khoản
    cho trưởng phòng làm sau nếu Owner chọn B.
12. **Lỗi** (một mã một status): 422 `SPEND_REPORT.PERIOD_IN_FUTURE`; 403 `SPEND_REPORT.SCOPE_FORBIDDEN`; 422 `VALIDATION_ERROR` (query sai). Ví dụ
    lỗi dựng bằng `errorExampleOf(...)` ở `spend-report.http-errors.ts`.
    12a. **Mảng lồng** (DA8-13): `totals.limitations` (enum, `bounded` theo số giá trị enum) ⟹ mục `NESTED_ARRAYS`
    (`test/support/api-collection-registry-nested*.ts`) + sự kiện `added` có `bound` (`test/support/api-collection-registry-events.ts`); `rows`, dòng
    truy căn cứ là danh sách phân trang cấp đầu. Không mảng không biên.
13. **Số câu lệnh**: `spendReportGet` cố định (gom SQL + một lần nhãn mỗi loại khóa của trang + một lần số năm theo lô); `spendFactList` cố định (trang +
    đếm cùng snapshot `RepeatableRead` + nhãn theo lô). Test `test/support/query-count.ts` trên hai cỡ dữ liệu.

## Test matrix

| AC / rủi ro         | Tình huống (gồm từ chối, edge case)                                                                                    | Cấp test           | Kết quả mong đợi                                                                                        | Bằng chứng sau implement |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| nguồn — hóa đơn     | xác nhận hóa đơn `K1` 20tr + GTGT 2tr + thuế nộp thay 1tr (`US-12-14` AC-1)                                            | integration        | `spendFactList` một khoản `INVOICE` `actual` 21tr, `deductible` 2tr; `budgetTable.spent` +21tr          |                          |
| nguồn — `K2`        | hóa đơn `K2` đích `SHARED_POOL` có GTGT 1tr                                                                            | integration        | dòng kho `actual 0`, `deductible 1tr`; thực chi phòng không đổi                                         |                          |
| nguồn — seat-tháng  | lượt tháng 10 Figma: 6 `P-DES`, 3 `P-ENG`, 1 Trống (`US-12-01` AC-4)                                                   | integration        | 90 / 45 / kho 15                                                                                        |                          |
| một nguồn (DA8-05)  | dữ liệu hỗn hợp (hóa đơn `K1`, `K4`, seat-tháng, `NO_BUDGET`, năm đã đóng)                                             | integration        | Σ `spendReportGet` `COST_CENTER` theo (CC, năm) = `budgetTable.spent` = `CommitmentRepo.totals.spent`   |                          |
| không bảng mới      | `prisma migrate diff` sau hạng mục                                                                                     | integration        | không migration                                                                                         |                          |
| AC-1 / B#25         | `CC-DES` 110tr, thực chi 40tr, cam kết 20tr, GTGT 3tr                                                                  | integration + http | `budgetTable`/`Summary`/`Mine` `deductibleTax` 3tr, `spent` 40tr, còn lại 50tr                          |                          |
| AC-2 / Q-141        | hóa đơn năm 12 000 USD (không `K2`) phát hành 15/01, kỳ 01/01–31/12; `M01` hai cơ sở; hóa đơn `K2`                     | integration        | `CASH` M01 12 000; `ACCRUAL` M01 1 000; `K2` seat-tháng ở cả hai                                        |                          |
| `US-12-11` AC-11    | khoản nội bộ 120tr năm 2027 `CC-ENG` (ghi `internal_costs` trực tiếp ở test); `Q1…Q4`                                  | integration        | mỗi quý 30tr, tổng 120tr                                                                                |                          |
| chia tháng lẻ       | kỳ 16/11–15/12 300 USD                                                                                                 | unit policy        | tháng 11: 150, tháng 12: 150 (theo ngày); dư vào tháng cuối                                             |                          |
| AC-4 chiều          | tháng 08: `DEPARTMENT`, `APPLICATION`, `VENDOR`; `groupBy=PROJECT`                                                     | http + integration | `P-DES` 90, `P-ENG` 45, Figma 150, NCC Figma 150; 422                                                   |                          |
| AC-11 / AC-16       | 60tr `CC-DES`, 40tr `CC-ENG`, 5tr chưa phân bổ CC, 3tr kho; Dự phòng kho 50tr                                          | integration        | `company` 108tr; hai dòng riêng; `sharedPoolReserve` 50tr cạnh dòng kho                                 |                          |
| `NO_BUDGET` / AC-17 | 2027 `CC-DES` chỉ có cam kết 01/01                                                                                     | integration        | dòng `status NO_BUDGET`, `budget null`, `committed` có số                                               |                          |
| AC-5 / B#27         | chọn 40tr `CC-DES` YTD; Σ `amountInPeriod` các trang                                                                   | integration        | hóa đơn + seat-tháng + nội bộ tạo nên 40tr; tổng bằng 40tr                                              |                          |
| B#34                | `spendFactList?line=UNALLOCATED_COST_CENTER` có khoản `K1` cấp thất bại + seat phòng chưa CC                           | integration        | hai dòng, `unallocatedReason` đúng, `department` có                                                     |                          |
| AC-16 căn cứ kho    | `line=UNALLOCATED_SHARED_POOL` tháng 10                                                                                | integration        | dòng theo thuê bao/tháng tạo nên 15                                                                     |                          |
| AC-6 quyền          | IT Admin, Super Admin, Employee gọi `spendReportGet`, `spendFactList`                                                  | http               | 403 `AUTHORIZATION.FORBIDDEN`                                                                           |                          |
| AC-7 / B#28         | `H1` (`P-DES`) `groupBy=APPLICATION`; `groupBy=COST_CENTER`; `departmentId=P-ENG`; `spendFactList?costCenterId=CC-ENG` | http + integration | chỉ số `CC-DES`, `totals.company` null; 403 `SCOPE_FORBIDDEN` ba ca còn lại                             |                          |
| AC-7 hết hạn        | `H1` hết giai đoạn trưởng phòng                                                                                        | integration        | 403 `SCOPE_FORBIDDEN`                                                                                   |                          |
| Q-142               | `H1` đọc `budgetMine`/`spendReportGet` của phòng; Người duyệt chi `spendFactList?line=UNALLOCATED_COST_CENTER`         | integration        | `deductibleTax: null` / 200                                                                             |                          |
| AC-13               | response có `asOf`, `lastRecordedAt`, `basis`                                                                          | http               | đủ, không chữ _real-time_                                                                               |                          |
| kỳ                  | `year` tương lai; `period=M13`; `YTD` năm đã qua                                                                       | http + unit        | 422 `PERIOD_IN_FUTURE` / 422 `VALIDATION_ERROR` / cả năm                                                |                          |
| `API-LIST-DETAIL.1` | `spendReportGet` và `spendFactList` 3 vs 30 khoản/nhóm                                                                 | integration        | số câu lệnh bằng nhau; không đọc từng dòng; `pageSize` 101 ⟹ 422                                        |                          |
| B#2 đọc audit       | đổi Trần năm có lý do; PUT đổi Dự phòng kho + 1 Trần phòng; PUT giống hệt; phát hành bị chặn rồi thành công            | integration        | dòng lịch sử đúng số sự kiện audit trong allowlist; no-op không có dòng; khóa ngoài allowlist không trả |                          |
| B#2 đọc             | Finance, Người duyệt chi đọc; trưởng phòng, IT Admin đọc; năm không có kỳ                                              | http               | 200 / 403 / 404 `BUDGET.CYCLE_NOT_FOUND`                                                                |                          |
| B#15                | 4 phòng: có trưởng phòng; không trưởng phòng qua hạn; kế nhiệm từ ngày mai; không Cost Center                          | integration        | `HAS_HEAD`/false, `NO_HEAD`/true, `SUCCESSOR_PENDING`/false, `NO_HEAD`/false `SETUP_INCOMPLETE`         |                          |
| B#15 khớp luật      | gọi `budgetVersionCreate source=BASELINE` cho từng phòng của ca trên                                                   | integration        | thành công đúng phòng `true`; 409 cùng `reason` ở phòng `false`                                         |                          |
| B#21                | `budgetCommitmentList?origin=YEAR_START_AUTO` 2 vs 20 khoản                                                            | integration        | `assignment` đủ người/phần mềm/gói; số câu lệnh hằng; khoản `APPROVAL` `assignment null`                |                          |
| B#23 / Q-143        | `H1` có 2 khoản 01/01 (1 200) + 1 khoản duyệt (500)                                                                    | integration        | `committed` 1 700, `committedYearStartAuto` 1 200                                                       |                          |
| facade              | `CommitmentRequestView` có `applicationId`, `vendorId`; graph thiếu `requests`                                         | unit listener      | có giá trị / chiều ứng dụng gom `UNKNOWN`                                                               |                          |
| hồi quy             | test hiện có `budget-summary`, `budget-commitment-list`, `budget-cycle-*`, `mf4-budget.flow-spec.ts`                   | integration + flow | xanh                                                                                                    |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI: 3 operation mới + 6 đổi đúng _Ownership_ (lỗi có ví dụ, `message` riêng, summary ≤ 70 ký tự); cập nhật
      `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts`; gate `api-collection-contract` không cần mục ngoại lệ mới
      (mọi mảng có biên/phân trang).
- [ ] README `budgets` (capability `spend-source` L0 là nguồn duy nhất của hàm tổng, báo cáo, GTGT; lịch sử kỳ đọc Audit Trail);
      `pnpm arch:capabilities --module budgets` không vòng, `spend-source` ở L0.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W8 (subagent số 2 soạn).
- 09/11/2026: sửa theo cổng thiết kế W8 — bỏ sổ `spend_entries` + backfill, đọc thẳng nguồn qua `spend-source` dùng chung với hàm tổng (DA8-04,
  DA8-05); lịch sử kỳ từ Audit Trail, bỏ `budget_cycle_changes` (DA8-18); GTGT trưởng phòng `null` (DA8-19); mảng lồng (DA8-13); Sizing một dòng
  (DA8-21). Chuyển gói W8b, `Thiết kế: blocked`.

## Câu tạm chọn (chờ Owner)

- **Q-140 — Cơ sở _theo dòng tiền_ khi BE không có ngày thanh toán.** Bối cảnh: `US-12-01` gọi là _theo dòng tiền_; `FR-5.3` gọi là _theo hóa đơn (ngày
  hóa đơn)_; `purchase_invoices`/`invoices` chỉ có `issued_on`, `purchased_on`, kỳ dịch vụ — không có ngày trả (BE không làm thanh toán, `QĐ-103l`); sao
  kê `SBF-07` ngoài phạm vi. Ví dụ: hóa đơn năm 12 000 phát hành 15/01 trả 20/02. Phương án: A `CASH` = ngày hóa đơn `issued_on` (theo chữ của BRD), sao
  kê chưa tính, `limitations` ghi rõ; B thêm cột ngày trả do Finance nhập; C bỏ cơ sở thứ hai. **Tạm chọn A** (không thêm dữ liệu, đúng `FR-5.3`; `K2`
  theo seat-tháng ở cả hai cơ sở — `QĐ-104c`). Đổi lại: hàm `invoiceDateOf` trong `spend-source.policy.ts` (cột `invoice_on`).
- **Q-141 — Chia _theo kỳ_ cho khoản phủ nhiều tháng.** Ví dụ: kỳ 16/11–15/12 300 USD; kỳ năm 12 000. Phương án: A đều theo tháng, tháng lẻ theo ngày,
  dư làm tròn vào tháng cuối; B theo ngày toàn kỳ (12 000/365 ⟹ tháng 1 = 1 019). **Tạm chọn A** (khớp `US-12-01` AC-2 _1 000 mỗi tháng_ và `US-12-11`
  AC-11 _30tr mỗi quý_). Đổi lại: `monthShares` trong `spend-report.policy.ts` + biểu thức SQL tương ứng ở `spend-report.repo.ts`.
- **Q-142 — Phạm vi đọc phụ.** (a) Trưởng phòng có thấy cột GTGT của phòng mình không (`OQ-F-02` mở; `QĐ-100p` chỉ liệt kê 5 số): **đổi —
  mặc định không** (`null`), câu Owner (DA8-19). (b) Người duyệt chi có xem **từng khoản** dòng _Chưa phân bổ Cost Center_ không (BRD 5.5.3 cho xem
  Tổng chi toàn công ty): **tạm chọn có** — theo nguồn. Đổi lại: `scopeOf(role)` trong `spend-report.policy.ts`, `budget.dto.ts`.
- **Q-143 — `budgetMineCommitmentList` (B#23, `EP-06.md:658`).** AC-9 _"thấy cam kết đang giữ gồm các khoản tự tạo của `CC-A`"_ không nói danh sách.
  Phương án: A thêm số `committedYearStartAuto` vào `budgetMine`; B route danh sách khoản cho trưởng phòng. **Tạm chọn A** (nhỏ, thêm được B sau không
  phá). Đổi lại: `budget.dto.ts` (`budgetMine`), route mới ở `budgets/commitment/` nếu B.
- **Q-144 — Lịch sử đổi Trần năm cho Finance/Người duyệt chi (B#2)** (đổi — kỹ thuật, DA8-18). Phương án: A bảng `budget_cycle_changes` + route
  (bản nháp cũ); B đọc Audit Trail qua `AuditApi.eventsOfResource` có phân trang + allowlist; C không làm. **Chọn B** (không migration; hàm đọc có
  phân trang đã có ở W8 nên không còn lý do _mảng không biên_). Đổi lại: `cycle-history-query.service.ts` (allowlist).
