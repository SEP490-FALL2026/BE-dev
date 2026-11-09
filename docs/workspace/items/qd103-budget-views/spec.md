# Spec: qd103-budget-views — trưởng phòng thấy đủ số ngân sách phòng và Trần phòng; bảng/ô tổng có Trần năm, dòng _chưa có ngân sách_; Người duyệt chi đọc

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`), đợt W2 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready`. Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.15`(4)(6), `FR-5.16`(4)(6), `FR-5.8`(6), `FR-5.8a`; `QĐ-100p`, `QĐ-82l`(1), `QĐ-97c`,
  `QĐ-103z`, `QĐ-104e`(2); `US-06-10` AC-7, `US-06-15` AC-7, AC-14, `US-06-18` AC-4, AC-9, `US-12-01` AC-11, AC-16), BE
  `d9c46552`. Ledger: L1-17, L1-18; luật R-I05 (trưởng phòng thấy Trần phòng), R-C02 (_chưa có ngân sách_), R-C06 (_điều
  chỉnh kỳ trước_).
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (xem tracker §5).
- [Kế hoạch](plan.md).

## Business outcome

`budgetMine` trả cho trưởng phòng: số cơ sở, dự phòng, cam kết đang giữ, thực chi, **Request đang chờ duyệt chi**, còn lại
(cùng công thức với kiểm tra ngân sách), **Trần của phòng và ba thành phần**, hạn nộp/hạn duyệt của kỳ — không có số toàn
công ty; `budgetTable`/`budgetSummary` có dòng **chưa có ngân sách** cho (Cost Center, năm) có khoản cam kết mà chưa có phiên
bản hiện hành, cột _điều chỉnh kỳ trước_, ô tổng có **Trần năm** và **Dự phòng kho dùng chung**, và **Người duyệt chi** đọc như Finance.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W2), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: `budgets/budget-view` (đọc); `requests` cung cấp số _Request đang chờ duyệt chi_ qua extension point của
  `budgets` (`requests → budgets` được, ngược lại không — `scripts/arch/tiers.cjs`).
- Boundaries: chỉ đọc; 3 operation đổi response/quyền; 1 extension point mới; không migration.
- Not larger: dòng _Chưa phân bổ — kho dùng chung_ và thực chi seat-tháng ở W5 `qd103-seat-month-cost-pool-line` (thêm trường
  khi có số, tránh trả số sai).
- Not smaller: ba view dùng chung một hàm tổng (`CommitmentRepo.totals` + phần chờ) để không lệch nhau và lệch kiểm tra ngân sách.
- Siblings: `qd103-budget-cycle-ceilings`, `qd103-department-effective-year`.
- Scope map: n/a

## Primary Story/AC

| Story | AC           | Coverage | Phần còn lại thuộc                        |
| ----- | ------------ | -------- | ----------------------------------------- |
| —     | L1-17, L1-18 | n/a      | gỡ chặn `qd103-seat-month-cost-pool-line` |

## Supporting references

`US-06-10` AC-7, `US-06-15` AC-7 (Trần của phòng **và ba thành phần**; không thấy trần năm, Dự phòng kho, tổng toàn công ty),
AC-14, `US-06-18` AC-4, AC-9, `US-12-01` AC-11, AC-16. `QĐ-82l`(1)/`QĐ-97c`: _còn lại = ngân sách − thực chi − cam kết đang
giữ − Request đang chờ duyệt chi_. `QĐ-104e`(2): phần chênh của năm đã đóng hiện ở _điều chỉnh kỳ trước_. Spec cũ
`qd96-100-budget-visibility-qd100p` chỉ đọc tham khảo.

## Explicit out of scope

Dashboard Finance riêng (W5); khoản cam kết 01/01 (W4) — view đọc từ bảng cam kết nên hiển thị đúng khi chúng xuất hiện.

## Dependencies and blockers

`qd103-budget-cycle-ceilings` (kỳ, Trần phòng, `published_at`); `qd103-department-effective-year` Task 4 (`budgetMine` dùng
`headedUnitsFor`, `costCenterId` tùy chọn).

## Ownership: module, data, API

- `budgets/public/budgets.extension-points.ts`: `PendingSpendContributions` (`Contributions<PendingSpendContribution>`), reader
  `pendingMany(pairs: { costCenterId; year }[], tx?) => Promise<Map<key, bigint>>`; `requests` đăng ký trong
  `requests/spend/pending-spend.listener.ts` bằng hàm lô mới của `budget-check.repo.ts` (cùng định nghĩa với `pendingFor`).
  Không có đóng góp (graph không có `requests`) ⟹ 0.
- `budgetMine` (trưởng phòng của Cost Center cho năm): giữ `status` (`ACTIVE` | `NO_ACTIVE_BUDGET` — không thêm `noBudget`),
  thêm `base`, `reserve`, `committed`, `spent`, `pendingSpend`, `remainingBase`, `remainingWithReserve`, `overBudget`,
  `departmentCeiling { total, signedCommitments, plannedSeats, priority }` (null khi kỳ chưa có hoặc đang không phát hành),
  `cycle { submissionDeadline, decisionDeadline, published }` (null khi chưa có kỳ). Không trả Trần năm, Dự phòng kho hay số
  phòng khác. Sửa chú thích _never what is left_ (`budget.dto.ts`).
- `budgetTable` (Finance, **Người duyệt chi**): thêm `pendingSpend`, `remaining*` như trên; dòng `status: 'NO_BUDGET'` cho
  (Cost Center, năm) có cam kết mà chưa có phiên bản hiện hành (số ngân sách null, `committed` có số); cột
  `priorPeriodAdjustment` (dưới).
- `budgetSummary` (Finance, **Người duyệt chi**): thêm `annualCeiling`, `sharedPoolReserve` của kỳ năm đó (null khi chưa có kỳ).
- Quyền: `RequireRoles('FINANCE', 'SPENDING_APPROVER')` cho `budgetTable`, `budgetSummary`; trưởng phòng, IT Admin,
  Employee, Super Admin 403.

## Behavior and design

1. Còn lại: `remainingBase = base − committed − spent − pendingSpend`, `remainingWithReserve = total − committed − spent −
pendingSpend`; được phép âm (`FR-5.8a`). Cùng nguồn số với `requests/spend/budget-check.service.ts` nên một Request mới bằng
   đúng `remainingWithReserve` thì kiểm tra cho qua, lớn hơn 1 đơn vị thì chặn.
2. Phòng chỉ có cam kết 01/01 (năm mới chưa duyệt) ⟹ `status = NO_ACTIVE_BUDGET`, số ngân sách null, `committed` có số.
3. `priorPeriodAdjustment` của năm `Y` = Σ chi phí thực của hóa đơn thuộc cam kết năm `Y` có `recorded_at ≥ 00:00 01/01/Y+1`
   (múi giờ tổ chức — mốc B7 cố định, không dùng `expired_at`); áp cả dòng `NO_BUDGET`; năm `Y+1` không đổi.
4. Số câu lệnh: không N+1 (đọc theo lô Cost Center × năm, gồm phần chờ).

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                                       | Cấp test    | Kết quả mong đợi                                                                            | Bằng chứng sau implement |
| ----------- | --------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- | ------------------------ |
| R-I05       | trưởng phòng xem phòng có phiên bản + Trần phòng đã phát hành                                             | integration | đủ trường, ba thành phần, số khớp tính tay                                                  |                          |
| QĐ-82l(1)   | phòng có Request đang chờ duyệt chi 20tr                                                                  | integration | `pendingSpend` 20tr, hai số còn lại đã trừ; khớp kiểm tra ngân sách (= qua, +1 chặn)        |                          |
| FR-5.8a     | thực chi vượt tổng                                                                                        | integration | `remainingWithReserve` âm, `overBudget` true                                                |                          |
| R-I05       | `budgetMine` khi kỳ chưa phát hành / đang bỏ phát hành / chưa có kỳ                                       | http        | `departmentCeiling` null / null / `cycle` null                                              |                          |
| AC-7        | response `budgetMine` của trưởng phòng; trưởng phòng gọi `budgetSummary`                                  | http        | không có `annualCeiling`/`sharedPoolReserve`; 403                                           |                          |
| R-C02       | phòng có cam kết năm mới, chưa có phiên bản                                                               | integration | `budgetMine.status = NO_ACTIVE_BUDGET`, dòng `NO_BUDGET` ở bảng                             |                          |
| quyền       | Finance, Người duyệt chi đọc bảng/ô tổng; trưởng phòng, IT Admin, Employee đọc                            | http        | 200 / 403                                                                                   |                          |
| ô tổng      | `budgetSummary` năm có kỳ / chưa có kỳ                                                                    | integration | `annualCeiling`, `sharedPoolReserve` có số / null                                           |                          |
| R-C06       | hóa đơn năm 2026 ghi 23:59 31/12/2026 và 00:00 01/01/2027; năm 2026 không có phiên bản (dòng `NO_BUDGET`) | integration | chỉ hóa đơn sau mốc vào `priorPeriodAdjustment`; dòng `NO_BUDGET` có số; năm 2027 không đổi |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI response 3 operation cập nhật; `pnpm arch:check`, `pnpm test:gates` xanh với extension point mới.
- [ ] Kiểm tra nhanh tracker §4.5; `pnpm check`, full suite **chưa chạy**.

## Changes and acceptance

08/11/2026: tạo ở W2. Chưa nghiệm thu.
08/11/2026: sửa theo audit thiết kế W2 (DA2-26…29, 31): còn lại trừ _Request đang chờ duyệt chi_ qua `PendingSpendContributions`
do `requests` đăng ký, mốc _điều chỉnh kỳ trước_ = 00:00 01/01 năm sau (một công thức, áp cả `NO_BUDGET`), Trần phòng kèm ba
thành phần, dùng `status` sẵn có thay `noBudget`, phụ thuộc `department-effective-year`, thêm test quyền/âm/null, Verify đúng file.
