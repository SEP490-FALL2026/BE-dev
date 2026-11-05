# Spec: qd96-100-budget-visibility-qd100p — ai thấy gì của kết quả kiểm tra và số ngân sách phòng

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement tiếp quản spec/plan và evidence.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-B) theo [tracker qd96-100](../../../reviews/qd96-100-alignment-2026-11-05/README.md),
  `LEDGER.md` L-112, L-308, L-806.
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-3.20`, `FR-5.14`; US 05/11/2026 — `US-06-12` AC-26, `US-06-10` AC-7; `QĐ-100p`, `QĐ-97c`,
  `QĐ-82l(1)`), BE `3e4553b9`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Người yêu cầu đọc được kết quả, lý do và phần vượt của **Request của mình** (không số ngân sách phòng); trưởng phòng đọc được
kết quả và đủ số ngân sách phòng mình — số cơ sở, dự phòng, cam kết đang giữ, thực chi, còn lại — ở `budgetMine`, danh sách
phiên bản đã gửi (kèm số tiền) và trang tổng quan; người khác (trưởng phòng phòng khác, IT Admin, Super Admin) không đọc được.
`budgetCheckGet`/`budgetCheckYearList` rời thư mục `finance-review/`. Kiểm được bằng HTTP + integration theo vai.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (giao việc Owner 05/11/2026), Story thuộc G5.
- Mode: `split-story`.
- Outcome and owner: một ranh giới quyền đọc (`QĐ-100p`); capability đọc kiểm tra mới `requests/budget-check-view/`,
  `budgets/budget-view`, `dashboards/manager`.
- Boundaries: chỉ đọc; bảng `request_budget_checks(_years)`, `budget_versions`, `budget_commitments`; API `budgetCheckGet`,
  `budgetCheckYearList`, `budgetMine`, `budgetMineVersionList`, `managerDashboardGet` (mục `spending`). Không migration.
- Not larger: chi tiết duyệt chi của Người duyệt chi là `qd96-100-reserve-confirmation`; thông báo là `qd96-100-spend-notifications`;
  dashboard Finance/Người duyệt chi là hoãn H5.
- Not smaller: ba bề mặt cùng một luật đọc theo vai; tách thì có lúc người yêu cầu thấy số phòng hoặc trưởng phòng thiếu số.
- Siblings: `qd96-100-budget-check-three-outcomes`, `qd96-100-reserve-confirmation`, `qd96-100-remove-finance-review-path`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC    | Coverage | Phần còn lại thuộc                                  |
| -------- | ----- | -------- | --------------------------------------------------- |
| US-06-12 | AC-26 | partial  | xem bảng của `qd96-100-budget-check-three-outcomes` |
| US-06-10 | AC-7  | partial  | còn lại: `g5-budget-proposal-and-review`            |

## Supporting references

- `QĐ-100p` thay `QĐ-82l(6)` (`INF-06`) và vế _không kèm số tiền_ của `QĐ-93j(3)`.
- `US-12-15` AC-3 (trang tổng quan trưởng phòng, chủ `a10-manager-dashboard`): hạng mục này chỉ thay nguồn mục `spending`.

## Explicit out of scope

- Trường mới trong hàng đợi trình (`overBase`, `overReserve`, `reserveConfirmation`) → `qd96-100-reserve-confirmation`.
- Thực chi từ hóa đơn (`spent` hiện chỉ từ cam kết đã thành chi) → hoãn H7.
- Đổi quyền đọc của Finance: giữ như hiện nay (Finance đọc mọi check). Finance chỉ không được **báo** (`qd96-100-spend-notifications`).

## Dependencies and blockers

- Cần `qd96-100-budget-check-three-outcomes` (mã năm mới, `overBase/overReserve`, `base/reserve` trong snapshot).
- Không migration; đi trước `qd96-100-remove-finance-review-path` (hạng mục đó xóa thư mục `finance-review/`).

## Ownership: module, data, API

- Mới `src/modules/requests/budget-check-view/` (controller + view service + DTO), chuyển từ
  `finance-review/finance-reviews.controller.ts:148-180` và `finance-review/spend-view.service.ts:119-139`,
  `spend-years-view.service.ts`. `operationId`, path, message giữ nguyên ⟹ FE không đổi đường gọi.
- `budgets/budget-view/budget-view.service.ts:34-63,130-150`, `budgets/budget/budget.dto.ts:311-342`, `budgets.controller.ts:41-90`
  (mô tả OpenAPI).
- `dashboards/manager/manager-dashboard.service.ts:25-80` + `budgets/public` (đọc số ngân sách phòng).

## Behavior and design

1. **Quyền đọc check** (thay `requireReader`, `spend-view.service.ts:128-138`), theo thứ tự:
   - Finance: như nay (đầy đủ). Người giữ bước chi (mới nhất) của Request: đầy đủ (snapshot, `US-06-01`).
   - Trưởng phòng **hiện hành** của phòng của Request: đầy đủ (mọi năm, số cơ sở, dự phòng, giữ, chi, chờ, còn lại, phần vượt).
   - Người yêu cầu (hoặc người thụ hưởng của Request cá nhân do chính họ gửi): **chiếu hẹp** — `outcome`, `blockedReasons`,
     từng năm `{year, code, overBase, overReserve}`; các trường số ngân sách là `null` (cùng schema, field nullable).
   - Còn lại (trưởng phòng phòng khác, IT Admin, Super Admin, Employee khác): 404 `SPEND.REVIEW_NOT_FOUND` như nay (không lộ tồn tại).
2. **`budgetMine`** thêm `base`, `reserve`, `committed`, `spent`, `pending`, `remaining`, `remainingBase` (cùng công thức với
   kiểm tra #6: `remaining = base + reserve − committed − spent − pending`, `pending` = Request của phòng có bước duyệt chi đang
   mở; chỉ cho Cost Center phòng mình — F24 review Docs); `status = NO_ACTIVE_BUDGET` thì các số `null` (không hiện 0). Mô tả
   OpenAPI bỏ câu _never what is left_.
3. **`budgetMineVersionList`** mỗi phiên bản đã gửi thêm `base`, `reserve`, `total`.
4. **Trang tổng quan trưởng phòng:** mục `spending` từ `notAvailable('FINANCE_FIGURES_NOT_DELIVERED')` thành số của năm hiện hành
   (cùng nguồn với `budgetMine`); sửa docstring đang ghi ngược `QĐ-100p` (`manager-dashboard.service.ts:31-38`).
5. **Hàng đợi trình:** bỏ chú thích _never a budget figure_ (`spend-submission.dto.ts:73`); số chi tiết đã do #7 thêm.
6. Không áp dụng: transaction ghi, khóa, job, migration.

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow F24)

**Mức FE-tonight: A** cho mục 1, 2, 3 (sửa tại chỗ trong `finance-review/spend-view.service.ts` nếu Task 1 chưa làm), **B** cho
mục 4 (mục `spending` của dashboard — FE đọc `budgetMine` tối nay), mục 5 và việc dời thư mục (plan Task 1, phải xong trước
`qd96-100-remove-finance-review-path`). Path/operationId không đổi.

| Operation (vai)                                                                             | Hiện tại                                                  | Sau sửa (output; không có field nhập mới)                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `budgetMine` `GET /budgets/mine?year=` (trưởng phòng hiện hành, chỉ Cost Center phòng mình) | `status`, `total`, `version`, `proposal`, `latestRefusal` | thêm `base`, `reserve`, `committed`, `spent`, `pending`, `remaining`, `remainingBase` (`money \| null`; `null` khi `NO_ACTIVE_BUDGET`); `total` giữ (= base + reserve)                                                                                                                                          |
| `budgetMineVersionList` `GET /budgets/mine/versions`                                        | phiên bản không kèm tiền                                  | mỗi phiên bản đã gửi thêm `base`, `reserve`, `total`                                                                                                                                                                                                                                                            |
| `budgetCheckGet`, `budgetCheckYearList` (đọc kết quả kiểm)                                  | Finance + người giữ bước + (luật cũ)                      | Finance, người giữ bước chi, trưởng phòng hiện hành của phòng Request: đầy đủ; người yêu cầu (và người thụ hưởng Request cá nhân tự gửi): `outcome`, `blockedReasons`, mỗi năm `{year, code, overBase, overReserve}`, các số ngân sách `null`; người khác: 404 `SPEND.REVIEW_NOT_FOUND` (giữ mã tới CP-2, R-29) |

Không mở số của phòng khác hay toàn công ty cho trưởng phòng (`SoD-2`).

`budgetMineLineList` (D6): giữ ẩn `financeComment`, `adjustmentReason` với trưởng phòng — code đã trả `null`
(`budget-view.service.ts:82`) dù schema dùng chung `versionLineSchema` (`budget.dto.ts:288-303`); không đổi contract (chỉ có thể
tách schema hẹp ở B). **B (D7):** `budgetTable` mở thêm cho Người duyệt chi đọc gói toàn công ty (`QĐ-94g` B6, `FR-5.15`(6));
hiện chỉ `FINANCE` (`budgets.controller.ts:100-101`); demo MF-4 4.6 dùng `budgetVersionGet` theo phòng.

## Test matrix

| AC / rủi ro      | Tình huống                               | Cấp test           | Kết quả mong đợi                                        | Bằng chứng sau implement |
| ---------------- | ---------------------------------------- | ------------------ | ------------------------------------------------------- | ------------------------ |
| `US-06-12` AC-26 | E1 đọc check R4 (bị chặn)                | http + integration | thấy kết quả, lý do, `overReserve`; số ngân sách `null` | planned                  |
| AC-26            | H1 đọc check R2                          | http               | đủ số + phần vượt                                       | planned                  |
| AC-26 (từ chối)  | H2, IT Admin, Super Admin, Employee khác | http               | 404                                                     | planned                  |
| AC-26            | Người duyệt chi không giữ bước           | http               | 404; người giữ bước: đầy đủ                             | planned                  |
| `US-06-10` AC-7  | H1 gọi `budgetMine` phiên bản đã duyệt   | http               | base, reserve, committed, spent, remaining              | planned                  |
| AC-7             | chưa có phiên bản                        | http               | `NO_ACTIVE_BUDGET`, số `null`                           | planned                  |
| AC-7             | `budgetMineVersionList`                  | http               | có số tiền mỗi phiên bản                                | planned                  |
| L-806            | trang tổng quan trưởng phòng             | integration        | mục `spending` có số phòng mình, không số phòng khác    | planned                  |
| Tương thích      | `operationId`/path sau khi dời           | gates              | OpenAPI không đổi path                                  | planned                  |

## Definition of Done

- [ ] AC claim có test; quick gates + test theo file xanh; `openapi:export` cập nhật (mô tả, field mới nullable).
- [ ] FE được báo trường mới của `budgetMine`, dashboard (L-981).
- [ ] Spec/plan phản ánh implementation; không tăng legacy ledger.

## Changes and acceptance

05/11/2026: bản đầu (`draft`). Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow: F24): mức FE-tonight **A** (mục 1–3) / **B** (dashboard, dời thư mục); thêm
`pending` vào `budgetMine`; bảng contract FE. Vẫn `draft`.
05/11/2026 (chỉnh 05/11 theo review main flow — vòng FIELDS): phần A thuộc **Đợt 3** (Owner). D6 không đổi (đã `null` ở code); D7 ghi là B.
Vẫn `draft`.
