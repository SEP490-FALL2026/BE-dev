# Spec: qd103-role-dashboards-digest — trang tổng quan Finance và Người duyệt chi, bản tóm tắt định kỳ, hai thông báo ngân sách còn thiếu

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent số 3 soạn W8), đợt W8 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08–09/11/2026.
- Thiết kế: `blocked` (chờ Owner chọn gói W8b — Q-160). Đã sửa theo cổng thiết kế W8 ngày 09/11/2026 (DA8-13, DA8-17, DA8-21, DA8-22).
  Owner review: chưa review. **Không giao code** tới khi Owner mở gói.
- Gói: **W8b** (chỉ giữ thiết kế).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.14` bảng trang tổng quan + bảng cảnh báo, `FR-3.11`, `FR-5.8`(6), `FR-5.8a`, `FR-8.2`; `QĐ-99h`, `QĐ-100j`,
  `QĐ-103e`, `QĐ-103l`, `QĐ-104a`, `QĐ-104i`; QT v1.7 A.4 dòng _Kỳ bản tóm tắt cho Người duyệt chi_, A.6), BE `bc10bd1c` (đọc ở `46b6a94e`, nhánh
  `feat/qd103-108-mf145`). Gap (bảng `API-GAP-W8.md` trong thư mục tracker): B#22, B#29, B#43, B#44, B#45, B#46, A#27, C#47 (+ C#44 _nhắc kỳ_
  thanh toán_ nếu mở `maintenanceDue`). Câu TẠM CHỌN: Q-150 → Q-155 (cuối spec).
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (đợt W8).
- [Kế hoạch](plan.md).

## Gói W8b — trạng thái, điểm vào, phụ thuộc

- **Trạng thái:** `blocked`. Hạng mục có nguồn BRD rõ (BRD 5.5.4 bảng trang tổng quan Finance/Người duyệt chi, bảng cảnh báo; `EP-05.md:360`) —
  **không** phải gold-plating, nhưng là trang tổng quan `US-12-15`, ngoài 2 hạng mục Owner giao cho W8 (DA8-01). Owner chọn (Q-160): (a) mở cả
  ba phase; (b) chỉ Phase 2 — hai thông báo ngân sách `BUDGET_NEW_YEAR_NO_BUDGET`, `BUDGET_OVER_RESERVE` (B#22, B#29 — bước MF-4, nhỏ); (c) để sau.
- **Điểm vào:** `GET /api/v1/dashboards/finance`, `GET /api/v1/dashboards/spending-approver`; đổi `managerDashboardGet`; job bản tóm tắt; 3 mã
  thông báo; khóa `SPENDING_APPROVER_DIGEST_PERIOD`.
- **Phụ thuộc:** W2–W5 PASS; W8 `qd103-mf5-followups` PASS **trước** (cùng sửa controller điểm điều chỉnh — hạng mục này làm sau); W8
  `qd103-purchase-invoice-followups` (`purchaseInvoiceDueList`) cho mục việc tồn; W8 `qd103-request-history-by-role` (`AuditApi.lastEventOfResources`
  cho khóa kỳ của bản tóm tắt). Mục `maintenanceDue` (C#44) cần phần mở rộng `purchaseInvoiceDueList` kind `BILLING_PERIOD_MISSING` (bỏ khỏi W8 —
  làm cùng hạng mục này hoặc `qd103-period-cost-close`, cái nào mở trước).
- **Sửa theo audit (09/11/2026), ưu tiên hơn chữ cũ:** bỏ bảng `spending_approver_digests` và migration — chống trùng bằng `eventKey` của thông báo
  (unique `(recipient, eventKey)` — `prisma/models/notifications.prisma:55`), khóa kỳ bằng audit `SPENDING_DIGEST.SENT` (ghi cả khi 0 người nhận; lượt
  sau thấy audit của kỳ ⟹ bỏ) (DA8-17); mục `savings` trỏ `realisedSavingList` (`AT_SOURCE`, tiết kiệm **thực** — BRD 5.5.4), không phụ thuộc
  `savingSummaryGet` (DA8-22); mảng lồng của trang đăng ký `NESTED_ARRAYS` + sự kiện (DA8-13).

## Business outcome

Finance và Người duyệt chi có **trang tổng quan của vai** như bốn vai đã có (`src/modules/dashboards/`): mỗi mục chỉ trỏ route nguồn
(`sourceOperationId`) hoặc đếm hàng việc cần làm, không tính lại số tiền. Trang trưởng phòng thôi ghi _thực chi + cam kết_ là chưa có nguồn (trỏ
`budgetMine`). Người duyệt chi nhận **một bản tóm tắt mỗi kỳ** (mặc định tháng) gom việc _thông tin_ (`QĐ-99h`) thay cho thông báo ngay. Finance và
trưởng phòng được báo **năm mới chưa có ngân sách** (01/01) và **ngân sách vượt cả dự phòng** khi Finance xác nhận hóa đơn.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W8, gói W8b), ngoài nhóm G.
- Mode: `technical-enabler`
- Outcome and owner: `dashboards` (capability mới `finance/`, `spending-approver/`; sửa `manager/`, `section/`); `budgets` (facade đếm, hai mã thông báo, hàm đọc cho bản tóm tắt); `requests` (capability mới `spending-digest/` — job, không bảng; facade đếm); `licensing` (đếm kết quả điều chỉnh/cảnh báo đỏ; quyền đọc `subscriptionAdjustmentList`/`Get` cho Người duyệt chi); `operating-parameters` (1 khóa); `notifications` (3 mã).
- Boundaries: 0 migration; 2 operation mới; 3 operation đổi; 3 mã thông báo; 1 tham số; 1 job; ước ~50 file, 3 lượt.
- Not larger: route đọc chi tiết bản tóm tắt (Q-152 — không làm); số liệu nguồn (`purchaseInvoiceDueList`, `spendReportGet`, `realisedSavingList`); phần MF-1 của trang trưởng phòng ngoài gap B#46.
- Not smaller: hai trang mới dùng chung khung `section/` và cùng đổi `DashboardRole`; bản tóm tắt dùng đúng các mục _thông tin_ của trang Người duyệt chi.
- Siblings: `qd103-mf5-followups`, `qd103-purchase-invoice-followups`, `qd103-budget-vs-actual-report`, `qd103-request-history-by-role`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                                                                                                     | Coverage | Phần còn lại thuộc                                                    |
| ----- | ------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------- |
| —     | W8-GAP-B#22, W8-GAP-B#29, W8-GAP-B#43, W8-GAP-B#44, W8-GAP-B#45, W8-GAP-B#46, W8-GAP-A#27, W8-GAP-C#47 | n/a      | số nguồn ở `qd103-savings-report`, `qd103-purchase-invoice-followups` |

## Supporting references

`US-12-15` AC-3 (vế ngân sách của trưởng phòng), AC-5, AC-6, AC-28, bảng cảnh báo dòng 74 (vượt dự phòng do thuế), 77 (bản tóm tắt); BRD bảng cảnh
báo dòng _Năm mới chưa có ngân sách_ (EP-12 chưa có số dòng); `US-06-18` AC-4; `US-05-09` (tồn đọng chỉ trên trang tổng quan — `EP-05.md:360`);
`US-12-01` (`FR-5.8a`). Spec cũ `a10-operational-dashboards` chỉ đọc khung (§4 luật 9).

## Explicit out of scope

- Chênh lệch thuế/tỷ giá (`SBF-11a`) — mục `taxFxVariance` là `NOT_AVAILABLE` `NO_DATA_SOURCE`. Báo cáo kỳ, dự báo, lời diễn giải AI.
- Thư điện tử cho các thông báo của hạng mục này (`FR-3.11`: chỉ hai loại có thư — xem `qd103-mf5-followups`).
- Push mobile (`QĐ-61c`). Trang Super Admin, IT Admin, Employee (không đổi).

## Dependencies and blockers

W2 PASS (`qd103-budget-views`: `budgetTable`/`budgetSummary` mở cho `SPENDING_APPROVER`, `budgetMine` đủ số; `qd103-budget-baseline-annual-check`:
`budgetCyclePackage`; `qd103-budget-cycle-ceilings`). W3 PASS (`qd103-request-single-step-routing`: `routing` trên `spendApprovalList`). W4 PASS
(`qd103-purchase-invoice-sbf19`: `purchaseInvoiceList`, `purchaseInvoiceConfirm`; `qd103-new-year-auto-commitments`: job + `YEAR_START_AUTO`). W5 PASS
(`qd103-subscription-adjustment-point`, `qd103-subscription-alerts-incidents` — `red_alert_sent_at`, `subscriptionIncidentList`;
`qd103-seat-month-cost-pool-line` — `budgetSummary.vacantSeatCostRatio`, `sharedPoolOverReserve`; `qd103-subscription-close-kpi4-savings` —
`realised_savings`, `realisedSavingList`). Xem thêm _Gói W8b — phụ thuộc_ ở trên (không còn phụ thuộc `qd103-savings-report`).

## Ownership: module, data, API

- **Không migration** (DA8-17).
- `dashboards/`: `section/dashboard-section.policy.ts` (`DashboardRole` + `FINANCE`, `SPENDING_APPROVER`; `countedOnly(count)` — Q-150),
  `finance/` (controller, dto, service + spec), `spending-approver/` (controller, dto, service + spec), `manager/manager-dashboard.{service,dto}.ts`,
  `dashboards.module.ts` (import `BudgetsModule`), `README.md` (sáu trang, bất biến `COUNTED` không nguồn).
- `budgets/public/budgets-dashboard.api.ts` (mới): `invoicesAwaitingConfirmation()`, `proposalsAwaitingReview(year)`, `versionsAwaitingDecision()`;
  `budgets/public/budgets.api.ts`: `announceYearStartNoBudget(tx, { organizationId, year, now })`, `digestFigures({ from, to, year })` →
  `{ realisedSavingMinor, currency, overBudgetCostCenters }`; `budget/budget-notifier.service.ts` (`yearStartNoBudget`, `overReserve` — sửa file có sẵn,
  `budget/` đã 24 file); `purchase-invoice/purchase-invoice-decision.service.ts` (W4: gọi kiểm vượt dự phòng sau xác nhận).
- `requests/`: `spending-digest/` (`spending-digest.job.ts` + spec, `.service.ts`, `.policy.ts` + spec — kỳ, khóa kỳ bằng audit, thuần; không repo bảng,
  không codec `summary`); `public/requests-dashboard.api.ts` (`spendDecisionsHeldBy`, `overdueHeadSteps(today)`);
  `year-start-commitments/year-start-commitments.service.ts` (W4: gọi `announceYearStartNoBudget` khi đặt `completed_at`); `requests.module.ts`.
- `licensing/public/licensing.api.ts`: `adjustmentDigestFacts({ from, to })` → `{ recordedResults, redAlerts }` (đếm `subscription_adjustment_points`
  có `recorded_at`/`red_alert_sent_at` trong kỳ); `subscription-adjustment` controller: `SPENDING_APPROVER` đọc `subscriptionAdjustmentList`/`Get`, lọc
  `redAlert?: boolean` (Q-151).
- `operating-parameters/parameter-definitions.policy.ts`: `SPENDING_APPROVER_DIGEST_PERIOD` enum `MONTHLY|QUARTERLY`, mặc định `MONTHLY`, nhóm
  `WORKFLOW`, chủ `SUPER_ADMIN`, nguồn `QĐ-99h, QT A.4`.
- `notifications/public/notifications.types.ts` + `inbox/inbox.policy.ts`: `BUDGET_NEW_YEAR_NO_BUDGET`, `BUDGET_OVER_RESERVE`,
  `SPENDING_APPROVER_MONTHLY_DIGEST` (khóa tham số ở _Behavior_ 5–7).
- Operation mới: `financeDashboardGet` GET `/api/v1/dashboards/finance` (`FINANCE`); `spendingApproverDashboardGet` GET
  `/api/v1/dashboards/spending-approver` (`SPENDING_APPROVER`). Đổi: `managerDashboardGet` (`spending` → `AT_SOURCE`, thêm `departmentCeiling`),
  `subscriptionAdjustmentList`, `subscriptionAdjustmentGet` (vai đọc + lọc); `operatingParameterList`/`Set` (khóa mới).

## Behavior and design

1. **Trang Finance** (`US-12-15` AC-5; mỗi mục một dòng, `asOf` = ngày làm việc): `invoicesAwaitingConfirmation` `COUNTED` (`purchaseInvoiceList`,
   trạng thái chờ xác nhận); `proposalsAwaitingReview` `COUNTED` (`budgetProposalList`, đã nộp chưa xử lý của kỳ đang mở); `AT_SOURCE`:
   `budgetTotals` (`budgetTable`), `overBudgetDepartments` (`budgetTable`, `overCommitted`), `commitmentsWithoutBudget` (`budgetCommitmentList`),
   `newYearNoBudget` (`budgetTable`, dòng `NO_BUDGET`), `annualCycle` (`budgetCycleGet` — Trần năm, Trần phòng), `sharedPoolReserve`,
   `vacantSeatCostRatio`, `unallocatedCostCenter` (`budgetSummary`), `baselineVersionsDue` (`budgetCyclePackage`), `adjustmentResults`, `redAlerts`
   (`subscriptionAdjustmentList`), `expiredNotRenewed` (`subscriptionIncidentList`); `taxFxVariance` `NOT_AVAILABLE` `NO_DATA_SOURCE`. **Không** có mục
   _Request chờ Finance rà soát_, _yêu cầu thông tin ngân sách_, _cam kết chờ ghi nhận_.
2. **Trang Người duyệt chi** (AC-6, A#27): `spendApprovals` `COUNTED` (`spendApprovalList` — lô, Request một bước, Request tiếp tục chờ người gọi);
   `budgetVersionsAwaitingDecision` `COUNTED` (`budgetVersionList`, đã gửi chờ quyết); `AT_SOURCE`: `oneStepRequests`, `reserveUseRequests`,
   `gh3FlaggedRequests` (`spendApprovalList`), `companyPackage` (`budgetCyclePackage`), `budgetTotals` (`budgetSummary`), `savings`
   (`realisedSavingList` — tiết kiệm thực, DA8-22); **chỉ xem** (`QĐ-99h`): `adjustmentResults`, `redAlerts` (`subscriptionAdjustmentList`), `overBudgetDepartments`
   (`budgetTable`), `subscriptionIncidents` (`subscriptionIncidentList`), `overdueHeadSteps` `COUNTED` không nguồn (Q-150). **Không** có mục _phong
   bì_, _Request tăng seat_, _thuê bao cam kết kỳ sắp tới hạn chót_, _nhà cung cấp không cho giảm_.
3. **Trang trưởng phòng** (B#46): `spending` = `AT_SOURCE budgetMine` (bỏ `FINANCE_FIGURES_NOT_DELIVERED`), thêm `departmentCeiling` `AT_SOURCE
budgetMine`; mục khác giữ nguyên.
4. **Quyền**: route `@RequireRoles` đúng một vai; service gọi `assertHoldsRole` lần nữa; vai khác ⟹ 403 như guard (`toDashboardApiException`). Không mục
   nào trả số tiền. Đếm `COUNTED` bằng đúng tổng của route nguồn khi cùng người gọi đọc (trừ `overdueHeadSteps`).
5. **Bản tóm tắt** (B#45, C#47, AC-28, dòng 77): `SpendingDigestSweeper` mỗi giờ (mẫu `budgets/year-end/year-end.job.ts`). Mỗi tổ chức: kỳ vừa kết thúc
   theo `SPENDING_APPROVER_DIGEST_PERIOD` **đọc lúc kỳ bắt đầu** (`QĐ-106h`), múi giờ tổ chức; đã có audit `SPENDING_DIGEST.SENT` của `(org,
period_key)` (`AuditApi.lastEventOfResources`) ⟹ bỏ (DA8-17). Một transaction + `pg_try_advisory_xact_lock(org, period)`: gom
   `adjustmentDigestFacts`, `digestFigures` (tiết kiệm thực trong kỳ, số Cost Center vượt ngân sách năm hiện hành lúc gửi), `overdueHeadSteps`; gửi
   `SPENDING_APPROVER_MONTHLY_DIGEST` tới Người duyệt chi dùng được, params `periodKey`, `periodStart`, `periodEnd`, `adjustmentResultCount`,
   `redAlertCount`, `realisedSavingMinor`, `currency`, `overBudgetCostCenterCount`, `overdueHeadStepCount`, `eventKey =
SPENDING_APPROVER_MONTHLY_DIGEST:<period_key>` (unique theo người nhận ⟹ không gửi trùng); ghi audit `SPENDING_DIGEST.SENT` (`recipientCount`,
   các số đếm) — **cả khi 0 người nhận**. Kỳ không có việc nào ⟹ vẫn gửi với số 0. Không gửi thông báo ngay nào khác (giữ `QĐ-99h`).

6. **Năm mới chưa có ngân sách** (B#22, `FR-5.8`(6), `US-06-18` AC-4): khi lượt `year-start-commitments` đặt `completed_at` (cùng transaction),
   `announceYearStartNoBudget` gom khoản `origin = YEAR_START_AUTO`, `unattached_reason = 'NO_BUDGET'` của năm `Y` theo Cost Center: Finance dùng
   được nhận **một** `BUDGET_NEW_YEAR_NO_BUDGET` (`year`, `costCenterCount`, `commitmentCount`, `totalMinor`, `currency`; key `…:<Y>`); trưởng phòng
   hiện hành của mỗi phòng có Cost Center đó nhận một (`year`, `costCenterCode`, `commitmentCount`, `totalMinor`, `currency`; key `…:<Y>:<costCenterId>`).
   Phòng không trưởng phòng ⟹ không gửi ai thay. Không có khoản `NO_BUDGET` ⟹ không gửi. Lượt chạy lại sau lỗi không gửi trùng (key).
7. **Vượt cả dự phòng** (B#29, dòng 74, `FR-5.8a`): trong transaction `purchaseInvoiceConfirm`, đọc còn lại `(costCenter, year)` theo cùng công thức
   `budgetTable` (`total − committed − spent`) **trước** và **sau** khi ghi thực chi; trước ≥ 0 và sau < 0 ⟹ `BUDGET_OVER_RESERVE` cho Finance dùng
   được và trưởng phòng hiện hành (`year`, `costCenterCode`, `overMinor`, `currency`, `purchaseInvoiceId`; key `…:<purchaseInvoiceId>`). Người duyệt chi
   **không** nhận (chỉ xem trang/tóm tắt). Năm không có phiên bản (`NO_BUDGET`) ⟹ không gửi (đã có thông báo ở mục 6).
8. **Dữ liệu cũ / seed**: không backfill bản tóm tắt; tổ chức tạo giữa kỳ ⟹ kỳ đầu vẫn gửi khi kết thúc. Seed không đổi.

## Test matrix

| AC / rủi ro           | Tình huống (gồm từ chối, edge case)                                                                                         | Cấp test           | Kết quả mong đợi                                                                            | Bằng chứng sau implement |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------- | ------------------------ |
| AC-5 Finance          | `F1` đọc; 2 hóa đơn chờ xác nhận, 1 đề xuất đã nộp                                                                          | http + integration | đủ mục mục 1; `invoicesAwaitingConfirmation = 2` = tổng `purchaseInvoiceList`               |                          |
| AC-5 phủ định         | không có mục Finance rà soát/hỏi thông tin; `taxFxVariance`                                                                 | unit + http        | không khóa đó / `NOT_AVAILABLE` `NO_DATA_SOURCE`, không số                                  |                          |
| AC-6 Người duyệt chi  | `C1`: 1 lô 3 Request, 1 Request một bước, 1 phiên bản chờ quyết                                                             | integration        | `spendApprovals` = tổng `spendApprovalList`; `budgetVersionsAwaitingDecision = 1`           |                          |
| AC-6 chỉ xem          | các mục thông tin                                                                                                           | unit               | `AT_SOURCE`/`COUNTED` đúng nguồn; không mục _phong bì_ v.v.                                 |                          |
| quyền (phủ định)      | `IT1`, `H1`, `SA1`, `E1` gọi hai route mới; `F1` gọi trang Người duyệt chi; `C1` gọi trang Finance                          | http               | 403 mọi ô                                                                                   |                          |
| Q-151 quyền           | `C1` gọi `subscriptionAdjustmentList?redAlert=true`; `C1` gọi `subscriptionAdjustmentRecord`                                | http               | 200 chỉ điểm có cảnh báo đỏ / 403                                                           |                          |
| B#46                  | `H1` đọc trang trưởng phòng                                                                                                 | http               | `spending`, `departmentCeiling` = `AT_SOURCE budgetMine`                                    |                          |
| AC-28 tóm tắt         | tháng 11: 2 kết quả điều chỉnh, 1 cảnh báo đỏ, tiết kiệm thực 300, 1 CC vượt, 1 bước trưởng phòng quá SLA; chạy 01/12 01:00 | integration        | `C1` nhận **một** thông báo, params đúng; dòng `2026-11`; không thông báo ngay nào thêm     |                          |
| tóm tắt idempotent    | lượt giờ sau; hai instance cùng lúc; chạy giữa tháng                                                                        | integration        | không gửi thêm; một lượt; chưa gửi                                                          |                          |
| tham số kỳ            | đổi `MONTHLY` → `QUARTERLY` giữa tháng 11                                                                                   | unit + integration | 01/12 vẫn gửi `2026-11`; kỳ sau là `2026-Q1`                                                |                          |
| không Người duyệt chi | không ai giữ vai                                                                                                            | integration        | audit `SPENDING_DIGEST.SENT` `recipientCount = 0`; lượt sau không chạy lại kỳ đó; không lỗi |                          |
| DA8-17 không bảng     | `prisma migrate diff` sau hạng mục; hai lượt cùng kỳ                                                                        | integration        | không migration; một thông báo mỗi người nhận (unique `eventKey`)                           |                          |
| B#22                  | 01/01/2027 `CC-HR` 2 khoản `NO_BUDGET`, `CC-A` có phiên bản; `P-OPS` không trưởng phòng có 1 khoản                          | integration        | `F1` 1 thông báo (2 CC); `H-HR` 1; `CC-A` không; không ai thay `P-OPS`                      |                          |
| B#22 lặp              | lượt lỗi rồi chạy lại; năm không khoản `NO_BUDGET`                                                                          | integration        | không trùng / không gửi                                                                     |                          |
| B#29                  | còn lại 10, xác nhận hóa đơn 15 (thuế không khấu trừ); rồi hóa đơn 5 tiếp                                                   | integration        | `F1`, `H1` nhận `overMinor = 5`; lần hai không gửi (đã âm); `C1` không                      |                          |
| B#29 phủ định         | xác nhận làm còn lại về đúng 0; năm `NO_BUDGET`                                                                             | integration        | không thông báo                                                                             |                          |
| hồi quy               | test dashboards hiện có; `operatingParameterList` có khóa mới; `pnpm openapi:export`                                        | http + gates       | xanh; diff chỉ ở operation spec nêu                                                         |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI thêm 2 operation, đổi đúng các operation ở _Ownership_ (summary ≤ 70 ký tự, `message` riêng, ví dụ 403);
      `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts` cập nhật.
- [ ] README `dashboards`, `requests` (bảng mới, job), `budgets` (facade, mã thông báo), `notifications` (3 mã) cập nhật.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Câu tạm chọn (TẠM CHỌN — chờ Owner)

- **Q-150** Đếm hay chỉ trỏ nguồn? Ví dụ Finance mở trang thấy "2 hóa đơn chờ" hay chỉ nút tới danh sách. Phương án: (A) mọi mục `AT_SOURCE`;
  (B) `COUNTED` cho hàng việc **cần làm** (hóa đơn chờ xác nhận, đề xuất chờ rà soát, quyết duyệt chi, phiên bản chờ quyết) + `overdueHeadSteps`
  `COUNTED` không nguồn vì Người duyệt chi không đọc được `stepCongestionList` (`SUPER_ADMIN`). **Tạm chọn B**. Đổi lại: `finance-dashboard.service.ts`,
  `spending-approver-dashboard.service.ts` (đổi `counted` ↔ `atSource`).
- **Q-151** Người duyệt chi xem kết quả điều chỉnh/cảnh báo đỏ ở đâu (`subscriptionAdjustmentList` chỉ `IT_ADMIN`, `FINANCE`)? (A) mở đọc cho
  `SPENDING_APPROVER` + lọc `redAlert`; (B) chỉ số trong bản tóm tắt. **Tạm chọn A** (chỉ đọc). Đổi lại: `@RequireRoles` của controller điểm điều chỉnh.
- **Q-152** Bản tóm tắt có route đọc chi tiết không? (A) chỉ thông báo với số đếm (khóa kỳ bằng audit, không bảng — DA8-17); (B) thêm route đọc
  chi tiết (cần bảng chụp). **Tạm chọn A** — kỹ thuật; danh sách từng việc đã có ở các mục _chỉ xem_. Đổi lại: thêm bảng + route ở hạng mục riêng.
- **Q-153** Nội dung và kỳ: dòng 77 nêu 4 việc; AC-28 thêm cảnh báo đỏ; A.6 thêm `KPI-4`. **Tạm chọn**: 4 việc + số cảnh báo đỏ, **không** `KPI-4`;
  kỳ `MONTHLY|QUARTERLY`, mặc định `MONTHLY`; gửi trong giờ đầu sau kỳ. Đổi lại: `spending-digest.policy.ts`, khóa tham số.
- **Q-154** Năm mới chưa có ngân sách: một thông báo tổng cho Finance hay một mỗi Cost Center? **Tạm chọn** một tổng cho Finance, một mỗi phòng cho
  trưởng phòng; phòng không trưởng phòng không giữ chờ (chỉ dòng 53 có ngoại lệ). Đổi lại: `budget-notifier.service.ts` `yearStartNoBudget`.
- **Q-155** Vượt dự phòng: chỉ lúc xác nhận hóa đơn (dòng 74) hay cả seat-tháng (W5)? **Tạm chọn** chỉ hóa đơn, chỉ khi **chuyển** từ ≥ 0 sang < 0.
  Đổi lại: nơi gọi `overReserve` (thêm job seat-tháng nếu Owner chọn).

## Changes and acceptance

- 08–09/11/2026: tạo ở W8 (subagent số 3 soạn).
- 09/11/2026: sửa theo cổng thiết kế W8 — bỏ bảng/migration bản tóm tắt, khóa kỳ bằng audit + `eventKey` (DA8-17); mục tiết kiệm trỏ
  `realisedSavingList` (DA8-22); làm sau `qd103-mf5-followups`; Sizing một dòng (DA8-21). Chuyển gói W8b, `Thiết kế: blocked`.
