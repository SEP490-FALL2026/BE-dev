# Spec: qd103-seat-month-cost-pool-line — `SBF-11`: chi phí `K2` theo seat-tháng cho phòng người giữ, dòng _Chưa phân bổ — kho dùng chung_, tỷ lệ seat Trống, cảnh báo vượt Dự phòng kho

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent soạn W5), đợt W5 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready` (đã sửa theo audit thiết kế W5 `design-audit-w5.md`, chờ chat review duyệt). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.2`(1)(2)(4) dòng 920, `FR-5.14`, `FR-8.2`; `QĐ-103k`, `QĐ-103r`, `QĐ-103t`(8), `QĐ-103v`(7)(8), `QĐ-104c`, `QĐ-104g`,
  `QĐ-104i`, `QĐ-104k`(1), `QĐ-106k`, `QĐ-106h`(2), `QĐ-87d`, `QĐ-86`; QT v1.7 C.2, A.4, A.6), BE `712044f9`. Ledger: L1-15, L1-16, L3-28, L4-13. Luật R-H01→R-H03,
  R-K01, R-K03. Câu tạm chọn: Q-61 (thu hẹp) ([QUESTIONS](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md)); theo nguồn: Q-61 vế thu hồi giữa
  tháng, Q-64 vế từng kho, Q-65; kỹ thuật (chốt ở đây): Q-62, Q-63, Q-64 vế toàn kho.
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Mỗi tháng đã qua, hệ thống quy chi phí mỗi kho `K2` (và khóa có kỳ `K4`): seat _Đã gán_ ⟹ **phòng người giữ** (tài khoản dịch vụ: phòng người chịu trách
nhiệm) theo **seat-ngày × giá tháng quy đổi**; phòng chưa có Cost Center ⟹ dòng _Chưa phân bổ Cost Center_ (báo Finance); phần còn lại = seat đã trả − seat-tháng
đã gán ⟹ dòng **_Chưa phân bổ — kho dùng chung_** (cộng chênh thuế/tỷ giá hóa đơn `K2`), không trừ ngân sách phòng nào. Gói tính tiền chung chia theo seat-tháng
như vậy. Tổng các phần = chi phí kho, tính lại cho cùng kết quả, không sửa tay. Thực chi `K2` của phòng là seat-tháng (kiểm tra ngân sách, `budgetMine`/`Table`/
`Summary`); khoản cam kết `K2` chuyển dần thành chi phí theo tháng. Tỷ lệ chi phí seat Trống ≥ **10 %** ⟹ cảnh báo IT Admin; lũy kế dòng kho vượt **Dự phòng
kho dùng chung** ⟹ cảnh báo Finance. Quyền cũ mang phòng sở hữu thuê bao cũ được quy về phòng người giữ từ run đầu.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W5).
- Mode: `technical-enabler`.
- Outcome and owner: capability mới `licensing/seat-occupancy/` (L0 — seat-ngày đã trả/đã gán, dùng chung với `KPI-4`); capability mới `budgets/seat-cost/`
  (L0 — **không controller**: job tháng, dòng chi phí, khép tháng, cảnh báo); `budgets/budget` (tổng một nguồn đọc `seat_cost_months` bằng SQL, không import
  `seat-cost`); `budgets/budget-view` (đọc `sharedPoolCostList`).
- Boundaries: 2 migration; 1 operation mới; 6 đổi; 1 tham số; 3 mã thông báo; 1 job; 1 extension point. ~58 file, 9 task ⟹ **3 phase**.
- Not larger: cơ sở _theo dòng tiền_ `FR-5.3`, dự báo L1, `SBF-11a`, dashboard Finance riêng (W8); đổi phòng chịu chi phí khi điều chuyển (`MF-3`).
- Not smaller: dòng phòng, dòng kho và khép tháng cùng một lần tính; tách ra thì tổng không khớp chi phí kho (AC-9).
- Siblings: `qd103-subscription-close-kpi4-savings` (dùng `seat-occupancy`).
- Scope map: n/a

## Primary Story/AC

| Story | AC                         | Coverage | Phần còn lại thuộc                                                                        |
| ----- | -------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| —     | L1-15, L1-16, L3-28, L4-13 | n/a      | gỡ chặn `qd103-subscription-close-kpi4-savings` (`KPI-4`); W8 dashboard Finance, `FR-5.3` |

## Supporting references

`US-12-18` AC-1→AC-13; `US-12-20` AC-1→AC-7; `US-07-14` AC-5; `US-06-15` AC-14; `US-12-01` AC-11, AC-16. Spec cũ chỉ đọc: `a10-it-admin-dashboard`.

## Explicit out of scope

`K4` **vĩnh viễn** (chi phí một lần qua khoản cam kết — AC-6 chỉ kiểm không vào dòng kho), `K1`/`K5`; mô hình giá `CONSUMPTION`/`PER_HOST` (không seat — cảnh
báo `PRICING_MODEL_NOT_SEAT_BASED`, ledger W8); tính lại tháng đã khép; tiền tệ khác tiền báo cáo (giá quy đổi đã chụp, ADR-0007).

## Dependencies and blockers

W2 PASS (`budget_cycles.shared_pool_reserve_minor`, `qd103-budget-views`); W3 hàm giá tháng quy đổi; W4 PASS (`seat_monthly_minor`, khoản gắn Assignment, đích
`SHARED_POOL`/`expected_minor`, `charge_unallocated`); `qd103-subscription-adjustment-point` Checkpoint C (`subscription_quantity_events` đủ mọi đường, giá quy đổi).

## Ownership: module, data, API

- Migration `<ts-1>_assignment_charge_departments` (licensing): bảng `license_assignment_charge_departments` (`assignment_id` PK FK, `department_id` FK, `recorded_at`),
  append-only; backfill một dòng cho mỗi Assignment `K2`/`K4` kỳ còn mở ngày migration mà `owning_department_id` NULL hoặc khác phòng hiện hành của `employee_id`
  (người giữ; tài khoản dịch vụ: người chịu trách nhiệm). Không sửa `license_assignments` (trigger `license_assignments_immutable`).
- Migration `<ts>_seat_cost_months` (budgets; enum mới `CREATE TYPE`):
  - Enum `SeatCostLine {HOLDER, UNALLOCATED_COST_CENTER, SHARED_POOL, SHARED_POOL_INVOICE_VARIANCE}`.
  - Bảng `seat_cost_months`: `id`, `organization_id`, `month` (ngày 1), `subscription_id` (giá trị), `line`, `assignment_id NULL`, `segment_start date NULL`,
    `department_id NULL`, `cost_center_id NULL` FK, `commitment_id NULL` FK, `purchase_invoice_id NULL` FK, `seat_days NULL`, `amount_minor`, `currency`; CHECK theo
    `line`; UNIQUE `(organization_id, month, subscription_id, line, assignment_id, segment_start, department_id, cost_center_id, purchase_invoice_id) NULLS NOT
DISTINCT` (đổi Cost Center/người chịu trách nhiệm giữa tháng ⟹ hai dòng khác `segment_start`); trigger append-only.
  - `seat_cost_month_runs` (`organization_id`, `month`, `computed_at`, `first_month`; PK hai cột); `commitment_month_closures` (`commitment_id`, `month`,
    `slice_minor`, `accrued_minor`; PK; append-only); `shared_pool_alerts` (`kind`, `subscription_id NULL`, `month`, `cumulative_minor NULL`, `sent_at`; UNIQUE
    `(organization_id, kind, subscription_id, month) NULLS NOT DISTINCT`).
- `licensing/seat-occupancy/`: `seat-occupancy.service.ts`, `.policy.ts` (+ spec), `.repo.ts` (không import capability licensing nào); `public/licensing.api.ts`
  `seatOccupancyOf(org, month)` ⟹ mỗi kho (`K2` và `K4` `TERM`): `paidByDay[]`, `poolCostByDay[]`, `seatPriceByDay[]`, `pricingModel` (từ
  `CatalogApi.quantityTimelineOf`), Assignment `{ id, kind, chargeDepartmentId = coalesce(charge_departments, owning_department_id), requestId,
chargeUnallocated, segments[] }`.
- `licensing/public/licensing.extension-points.ts`: `SeatCostToDateContributions` (budgets đăng ký) cho danh sách quyền theo vai W4 và `vacantCostRatio` của điểm.
- `budgets/seat-cost/` (không controller): `seat-cost.job.ts`, `seat-cost.service.ts`, `seat-cost.policy.ts` (+ spec), `seat-cost.repo.ts`,
  `seat-cost-alerts.service.ts`, `seat-cost-alerts.policy.ts` (+ spec), `seat-cost-to-date.listener.ts`; import `budget/commitment.repo.ts` (khép tháng).
- `budgets/budget/` (24 file — chỉ sửa file có sẵn): `commitment.repo.ts:310-338` (`totals` đọc `seat_cost_months`, `commitment_month_closures` bằng SQL),
  `invoice.repo.ts:160-173` (`spentOf`), `budget-facts.repo.ts:23-46`, `budget.dto.ts:263-311`. `budgets/budget-view/`: `budget-view.service.ts`,
  `shared-pool-costs.controller.ts` (mới), `shared-pool-costs.dto.ts` (mới) — import `seat-cost` một chiều.
- `organization`: `OrganizationReadApi.activeCostCenterOn(departmentId, day)` nếu chưa có.
- `operating-parameters/parameter-definitions.policy.ts`: `IDLE_SEAT_COST_ALERT_PERCENT` int 1–100, mặc định 10, nhóm `SUBSCRIPTION` (A.4).
- `notifications`: `SHARED_POOL_IDLE_SEAT_RATIO`, `SHARED_POOL_RESERVE_EXCEEDED`, `SEAT_COST_UNALLOCATED_COST_CENTER`. `dashboards/it-admin`: `vacantSeatCost`.
- **Operation mới**: `sharedPoolCostList` GET `/shared-pool-costs?year&month&subscriptionId` (`FINANCE`, `IT_ADMIN`). **Đổi**: `budgetMine`, `budgetTable`
  (`spent` = hóa đơn + seat-tháng), `budgetSummary` (`sharedPoolUnallocatedYtd`, `unallocatedCostCenterYtd`, `sharedPoolOverReserve`, `vacantSeatCostRatio`),
  `subscriptionAdjustmentGet` (`vacantCostRatio`), `itAdminDashboardGet`, danh sách quyền theo vai W4 (`seatCostToDate`); `operatingParameterList`/`Set`.

## Behavior and design

1. **Khi nào** (Q-62 kỹ thuật — chốt): job mỗi giờ tính tháng `M` đã kết thúc (múi giờ tổ chức) chưa có run, theo thứ tự tháng; run đầu là **tháng của
   migration** (`first_month`), không tính lùi. Một transaction mỗi `(org, M)`; advisory lock `(org, M)`; run đã có ⟹ bỏ (idempotent).
2. **Seat-ngày** (R-H01, AC-10): Assignment của kho mở ở ngày `d` (từ `valid_from`, tới trước `valid_until`) là một seat-ngày; tháng gán/thu hồi giữa chừng tính
   theo ngày (16/11 ⟹ 15 ngày — Q-61 vế thu hồi theo nguồn US-12-18 AC-10). Phòng chịu = `chargeDepartmentId` (bản ghi mới: phòng người nhận — AC-3, W4; dữ liệu
   cũ: bảng backfill — `QĐ-103k`); tài khoản dịch vụ ⟹ phòng người chịu trách nhiệm (AC-12); `charge_unallocated` ⟹ `UNALLOCATED_COST_CENTER` (`QĐ-104g`).
   Kho gồm `K2` và `K4` `TERM` (`QĐ-103v`(8)); `K4` vĩnh viễn không dòng (AC-6).
3. **Dòng** (Q-63 kỹ thuật — chốt): giá theo ngày từ `subscription_quantity_events` (`monthly_price_reporting_minor` đã chụp). `PER_SEAT`: giá seat = giá tháng
   quy đổi; `FLAT_RATE`/`CONCURRENT` (BRD dòng 920): chi phí kho tháng = giá chung, giá seat-ngày = giá chung ÷ seat đã trả ngày đó. Mỗi đoạn của Assignment
   (đổi Cost Center hay người chịu trách nhiệm giữa tháng ⟹ đoạn mới): `amount = round_half_up(giá × seat_days / số ngày tháng)` ⟹ `HOLDER` (Cost Center hiện
   hành ở ngày đầu đoạn) hoặc `UNALLOCATED_COST_CENTER` (AC-7, `QĐ-87d`). `paid = round_half_up(Σ_d chi phí kho ngày d)`; `SHARED_POOL = paid − Σ dòng
Assignment` (hấp thụ làm tròn ⟹ tổng = chi phí kho — AC-1, AC-9); < 0 ⟹ 0 + audit `SEAT_COST.OVER_ASSIGNED`. Quyền đã thu hồi là seat Trống (AC-11).
4. **Chênh hóa đơn** (R-H02, AC-5 US-12-20): đề nghị `SHARED_POOL` `CONFIRMED` trong `M` có `expected_minor` ⟹ `SHARED_POOL_INVOICE_VARIANCE` = `net + thuế
không khấu trừ − expected` (âm được), vào **tháng xác nhận**, không viết lại tháng đã khép (theo nguồn US-12-20 AC-5). Hóa đơn năm trả trước không dồn (AC-2, AC-13).
5. **Khép tháng khoản cam kết** (R-H01, `QĐ-103r`, AC-4, AC-10, Q-61): khoản `K2` có `seat_monthly_minor`, `M` trong phạm vi: `seatsCovering` = người thụ hưởng −
   người có Assignment của khoản đã kết thúc trước ngày 1 của `M`; `slice = min(held trước khép, seat_monthly × seatsCovering)`; `accrued` = Σ `HOLDER` gắn khoản
   trong `M`. `held = amount − released − Σ hóa đơn − Σ slice`; phần `slice − accrued` (thu hồi giữa tháng — theo nguồn; **cấp giữa tháng** — Q-61 tạm chọn
   _giải phóng_) hiện ở `budgetCommitmentList` (`monthClosures`). Gắn khoản: `assignment_id` (khoản 01/01) rồi `requestId` + năm + Cost Center; không có ⟹ NULL.
6. **Hàm tổng** (`CommitmentRepo.totals`): `spent(CC, Y)` = hóa đơn theo năm kỳ dịch vụ **trừ** hóa đơn của khoản `K2` đã có khép tháng (Q-62) + Σ `HOLDER` của
   `CC` năm `Y`; `held` như mục 5. Kiểm tra ngân sách W3 và ba view W2 dùng chung ⟹ Request bằng đúng còn lại qua, +1 chặn. Dòng kho, `UNALLOCATED_*` không vào CC.
7. **Tỷ lệ seat Trống** (R-H03, AC-8 US-12-18): `ratio = SHARED_POOL / paid` mỗi kho; toàn kho `Σ SHARED_POOL / Σ paid` (không gồm chênh). Ngưỡng
   `getValueAt(key, computed_at)` (`QĐ-106h`(2)); kho ≥ ngưỡng ⟹ IT Admin phụ trách thuê bao (Q-11 A) một lần mỗi (kho, tháng) — theo nguồn; toàn kho ≥ ngưỡng ⟹ mọi IT Admin dùng
   được, một lần mỗi tháng (kỹ thuật). Finance không được báo (A.6). Hiện ở dashboard IT, `sharedPoolCostList`, `budgetSummary`, điểm điều chỉnh (QT C.2.1).
8. **Vượt Dự phòng kho** (R-H03, `QĐ-106k`, `QĐ-104i`, AC-6 US-12-20, Q-65 theo nguồn): lũy kế năm `Σ SHARED_POOL + VARIANCE` tới hết `M` > `shared_pool_reserve_minor`
   **và** > lũy kế ở cảnh báo trước ⟹ `SHARED_POOL_RESERVE_EXCEEDED` cho mọi Finance dùng được (dự phòng, lũy kế, phần vượt, 3 kho lớn nhất). Chưa có dự phòng
   ⟹ không cảnh báo, `overReserve: null`. Không chặn gì.
9. **Phòng chưa có Cost Center** (AC-7): dòng `UNALLOCATED_COST_CENTER` mới ⟹ `SEAT_COST_UNALLOCATED_COST_CENTER` cho Finance một lần mỗi (phòng, tháng).
10. **Đọc**: `sharedPoolCostList` Finance + IT Admin; trưởng phòng, Người duyệt chi, Employee 403. Không route ghi (AC-9).

## Test matrix

| AC / rủi ro           | Tình huống (gồm từ chối, edge case)                                                                         | Cấp test           | Kết quả mong đợi                                                     | Bằng chứng |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------- | ---------- |
| AC-1 (18) / AC-1 (20) | Figma 15/tháng, tháng 10: 12 `P-DES`, 5 `P-ENG`, 20 đã trả                                                  | integration        | `CC-DES` 180, `CC-ENG` 75, kho 45; tổng 300                          |            |
| AC-2 / AC-13          | hóa đơn trả trước 3 600 xác nhận 05/01; tháng 01: 12 `P-DES`                                                | integration        | `CC-DES` 180, kho 120; không dòng 3 600                              |            |
| AC-3                  | seat Trống tháng 10, cấp `E5` (`P-ENG`) 01/11                                                               | integration        | 10: kho 15 (không viết lại); 11: `CC-ENG` 15                         |            |
| AC-10                 | `S1` cấp 16/11; `S2` thu hồi 16/11 (30 ngày)                                                                | unit + integration | `S1` kho 7,50 / `CC-ENG` 7,50; `S2` `CC-DES` 7,50 / kho 7,50         |            |
| AC-11                 | 17 gán, 3 Trống (1 do thu hồi 01/11)                                                                        | integration        | kho 45, tỷ lệ 15 %                                                   |            |
| AC-12 / DA5-20        | `ci-bot` người chịu trách nhiệm `E5` (`P-ENG`) đổi sang `E8` (`P-OPS`) 16/11; `P-DES` đổi Cost Center 16/10 | integration        | hai dòng `HOLDER` khác `segment_start`, không lỗi UNIQUE; tháng khép |            |
| dữ liệu cũ (DA5-21)   | Assignment cũ mang phòng sở hữu thuê bao `P-IT`, người giữ `P-DES`; Assignment cũ phòng NULL                | integration        | `CC-DES`; NULL không người ⟹ `UNALLOCATED_COST_CENTER` + lý do       |            |
| AC-7                  | `E9` thuộc `P-NEW` chưa có Cost Center tháng 10; liên kết `CC-NEW` 01/11                                    | integration        | 10: `UNALLOCATED_COST_CENTER` 15, Finance 1 thông báo; 11: `CC-NEW`  |            |
| `QĐ-104g`             | quyền theo vai của Người duyệt chi (`charge_unallocated`)                                                   | integration        | `UNALLOCATED_COST_CENTER`, không trừ Cost Center                     |            |
| AC-6 / DA5-23         | `K4` vĩnh viễn cấp lại cho `P-ENG`; `K4` `TERM` 12 tháng 10/tháng gán `P-ENG`                               | integration        | không dòng / `CC-ENG` 10                                             |            |
| `FLAT_RATE` (DA5-22)  | gói chung 200/tháng, 10 seat đã trả, 8 gán `P-DES`                                                          | integration        | `CC-DES` 160, kho 40                                                 |            |
| AC-3 (20)             | mua thêm 2 seat hiệu lực 01/10 cấp cùng ngày; cấp 16/10                                                     | integration        | kho không tăng / kho 14,52                                           |            |
| AC-5 (20)             | hóa đơn mua thêm 280, `expected` 270, xác nhận tháng 10; hóa đơn thấp hơn 10                                | integration        | chênh +10 / −10 ở kho                                                |            |
| AC-4 (18) / Q-61      | `R40` khoản 01→12 × 15, thu hồi 01/12                                                                       | integration        | 12: kho 15; khép 11 `slice` 15 `accrued` 15                          |            |
| AC-10 / Q-61          | `E3` thu hồi 16/11, khoản 15/tháng                                                                          | integration        | khép 11: `slice` 15, `accrued` 7,50 — 7,50 giải phóng                |            |
| Q-61 nhóm / chưa cấp  | khoản 3 người, 1 thu hồi tháng 3; khoản duyệt 10, cấp 16/10                                                 | unit + integration | `seatsCovering` 2 / khép 10 `slice` 15, `accrued` 7,74               |            |
| hàm tổng (R-H01)      | `budgetMine` của `CC-DES` sau khép 10; Request đúng bằng còn lại / +1                                       | integration        | `spent` gồm seat-tháng; qua / chặn                                   |            |
| Q-62 cũ               | khoản `K2` có hóa đơn cũ áp trực tiếp, tháng trước run đầu                                                  | integration        | không khép tháng trước run; không đếm hai lần                        |            |
| AC-8 (18) / Q-64      | Figma 45/300, Slack 10/200; ngưỡng 10; đổi 20                                                               | integration        | IT phụ trách Figma 1 + toàn kho 1; Slack, Finance không; 20 ⟹ không  |            |
| AC-6 (20) / Q-65      | dự phòng 50tr: 48 → 52 (11) → chạy lại → 55 (12); chưa nhập dự phòng                                        | integration        | 1 cảnh báo Finance; không lặp; cảnh báo 55; không cảnh báo           |            |
| AC-9 (18) / AC-7 (20) | PATCH/POST `/shared-pool-costs`; tính lại tháng 10 trên cùng dữ liệu (không lưu) so dòng đã lưu             | http + integration | 404/405; kết quả trùng từng dòng, tổng = chi phí kho                 |            |
| tính lại thuần        | policy tính hai lần trên cùng snapshot                                                                      | unit policy        | hai kết quả bằng nhau                                                |            |
| `budgetSummary`       | Finance, Người duyệt chi; trưởng phòng                                                                      | http               | 4 trường mới / 403                                                   |            |
| `sharedPoolCostList`  | Finance, IT Admin; Người duyệt chi, trưởng phòng                                                            | http               | 200 / 403                                                            |            |
| L3-28 / US-07-14 AC-5 | `subscriptionAdjustmentGet` sau run; danh sách quyền theo vai                                               | http               | `vacantCostRatio` có số; `seatCostToDate` = Σ dòng                   |            |
| đua / idempotent      | hai worker cùng tính tháng 10                                                                               | integration        | một run, không dòng trùng                                            |            |
| migration + seed      | CHECK theo `line`; UPDATE dòng; backfill phòng chịu; DB sạch; `ops:seed`                                    | integration        | từ chối / từ chối / đúng / `migrate diff` không drift / seed nạp     |            |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI 1 mới + đổi; manifest test; README `budgets` (`seat-cost`, công thức, thứ tự khóa), `licensing` (`seat-occupancy`, bảng phòng
      chịu, extension point), `dashboards`; `docs/rules/security-jobs.md`; `pnpm arch:capabilities --module budgets` và `--module licensing` không vòng.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `migrate diff` DB sạch; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W5 (subagent soạn). Chưa qua cổng thiết kế. Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W5 (`design-audit-w5.md`): DA5-04 (vế giá), 19→24, 40 sửa; Q-62/Q-63 kỹ thuật, Q-64/Q-65 theo nguồn, Q-61 thu hẹp. Không
  finding nào bị bác. Chi tiết ở plan _Design review_. Chưa nghiệm thu.
