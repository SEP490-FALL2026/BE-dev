# Spec: a10-manager-dashboard — trang tổng quan trưởng phòng (phần vận hành)

- Phụ trách: AI implementer theo giao việc Dev A (`A-10`).
- Thiết kế ban đầu bởi: AI implementer theo [DEV-A A-10](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-A.md).
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-12-15` AC-3, _Phạm vi quyền_ của trưởng phòng; `QĐ-87h`(2), `QĐ-87` `D-14`,
  `QĐ-82l`(6), `QĐ-82m` `INF-06`, `FR-0.3`), BE `6eb12d1` + diff `A-02`.
- Nhóm roadmap: G8 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Khung chung và bảng phân rã: [a10-operational-dashboards](../a10-operational-dashboards/spec.md).

## Business outcome

Trưởng phòng H1 (vai `MANAGER` suy ra) gọi `GET /api/v1/dashboards/manager` và thấy trang của **đúng phòng mình đang làm trưởng**
ở ngày nghiệp vụ: số ghế phần mềm phòng đang được cấp hoặc quản lý, số rà soát sau điều chuyển đang mở; trỏ tới hàng đợi trình
duyệt chi, đề xuất ngân sách, dòng phiên bản đã duyệt; và ba mục **chưa có nguồn** (yêu cầu chờ H1 duyệt, ghost seat, thực chi +
cam kết) hiện rõ lý do, không bao giờ là 0. Không có số còn lại, kết quả kiểm tra ngân sách, tổng công ty, dữ liệu phòng khác hay
KPI-5.

## Sizing decision

- Container: G8 (`US-12-15`), Dev A `A-10`.
- Mode: `split-story`.
- Outcome and owner: trang trưởng phòng; module `dashboards`, capability `manager/`; số đếm qua `LicensingDashboardApi`
  (`departmentFacts`) và `PersonnelDashboardApi` (`openTransferReviews`).
- Boundaries: chỉ đọc; một operation `GET /api/v1/dashboards/manager` (vai `MANAGER`, phòng = `getHeadedDepartment` của người gọi
  ở ngày nghiệp vụ); không bảng, không migration.
- Not larger: tiền (B-08) và usage (G7) không có contract; hàng đợi nhu cầu (B-02) chưa có — trang chỉ hiện trạng thái thiếu.
- Not smaller: các mục cùng một phạm vi quyền (một phòng, một vai) và một lần đọc; tách theo mục sẽ lặp kiểm quyền và test.
- Siblings: `a10-operational-dashboards` (khung), `a10-it-admin-dashboard`, `a10-super-admin-dashboard`;
  `b02-need-decision-queue` (Dev B, tên đề xuất), `g3-downstream-finance-integration`, `g6-downstream-integration`.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Primary Story/AC

| Story      | AC   | Coverage | Phần còn lại thuộc                                                                                                                                                   |
| ---------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `US-12-15` | AC-3 | partial  | yêu cầu chờ H1 duyệt: `b02-need-decision-queue`; thực chi + cam kết của phòng: `g3-downstream-finance-integration`; ghost seat đang chờ: `g6-downstream-integration` |

Vế sở hữu: ghép trang theo phòng H1; "phần mềm P-DES đang được cấp hoặc quản lý" (số ghế, read model, không phải bằng chứng đang
dùng); "rà soát điều chuyển đang chờ"; mục trỏ tới "hàng đợi đủ điều kiện trình duyệt chi", "đề xuất ngân sách", "dòng phiên bản đã
duyệt" (dữ liệu đã có ở `g5-spend-submission-batches`, `g5-budget-proposal-and-review`, `g5-budget-version-decision`); vế phủ định
"không có số còn lại, kết quả kiểm tra ngân sách, tổng công ty, P-ENG hay KPI-5"; trạng thái thiếu nguồn của ba vế còn lại.

## Supporting references

- `US-03-06` AC-13, AC-17 (công cụ phòng ban, trưởng phòng đọc phòng mình), `US-03-07` (rà soát sau điều chuyển).
- `US-01-02`/`QĐ-47c`: `MANAGER` là vai suy ra từ kỳ trưởng phòng.

## Explicit out of scope

- Số tiền, công thức, tổng hợp tài chính (B-08); danh sách duyệt nhu cầu (B-02); ghost seat/usage (G7 của Owner).
- Đếm hàng đợi trình chi/đề xuất/dòng phiên bản: cần facade mới trong `requests`/`budgets` (module của Dev B) — để `AT_SOURCE`.

## Dependencies and blockers

- Không migration. Dùng facade mới `PersonnelDashboardApi` (lát này) và `LicensingDashboardApi` (umbrella).
- Tích hợp: `b02-need-decision-queue` là tên đề xuất (Dev B chốt tên thật); khối G8 đã có trong `docs/roadmap.md`.
- Câu hỏi Owner (không chặn): trưởng phòng nhiều phòng — `getHeadedDepartment` trả một phòng; default: phòng đó.

## Ownership: module, data, API

- `dashboards/manager/` (controller, dto, service + spec). Personnel: capability mới `dashboard-facts/`
  (`PersonnelDashboardFactsRepo`), facade `public/personnel-dashboard.api.ts` (`PersonnelDashboardApi`). Đọc `transfer_reviews`
  (count `OPEN` theo phòng); licensing đếm ghế như `departmentToolsInUse` (`AssignmentDepartmentRepo.toolsOfDepartment`).
- Operation thêm: `GET /api/v1/dashboards/manager` (`managerDashboardGet`, message `DASHBOARD.MANAGER_RETRIEVED`).

## Behavior and design

`@RequireRoles('MANAGER')` + service kiểm lại vai; không có phòng đang làm trưởng (hoặc phòng không còn) → `DashboardRefusedError`
→ 403 `AUTHORIZATION.FORBIDDEN`. Response: `asOf`, `department {id, code, name}`, `sections`: `departmentSoftware` (`COUNTED`,
`departmentToolsInUse`), `transferReviews` (`COUNTED`, `transferReviewList`), `spendQueue` (`AT_SOURCE`, `spendQueueList`),
`budgetProposals` (`AT_SOURCE`, `budgetProposalList`), `approvedBudgetLines` (`AT_SOURCE`, `budgetMineLineList`), `needApprovals`
(`NOT_AVAILABLE` `REQUEST_QUEUE_NOT_DELIVERED`), `ghostSeats` (`USAGE_DATA_NOT_DELIVERED`), `spending`
(`FINANCE_FIGURES_NOT_DELIVERED`). Không trường tiền nào tồn tại trong schema. Không áp dụng: migration, ghi, job, audit.

## Test matrix

| AC / rủi ro                       | Tình huống                                                             | Cấp test         | Kết quả mong đợi                                                                                                  | Bằng chứng                            |
| --------------------------------- | ---------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| AC-3 số đếm khớp nguồn            | P-DES có ghế, một người P-ENG chuyển vào hôm nay (mở review)           | integration      | `departmentSoftware` = tổng `departmentToolsInUse`; `transferReviews` = tổng `transferReviewList?status=OPEN` = 1 | `dashboards-http.integration-spec.ts` |
| AC-3 không P-ENG                  | H2 (P-ENG) có review riêng                                             | integration      | mỗi trưởng phòng chỉ thấy phòng mình; số ghế khác nhau                                                            | integration                           |
| AC-3 tiền/usage/queue thiếu nguồn | mọi lần đọc                                                            | unit+integration | `NOT_AVAILABLE`, `count` null, không 0; không khóa `remaining`/`budgetCheck`/`companyTotal`/`kpi5`                | service spec + integration            |
| không phòng                       | vai `MANAGER` nhưng không làm trưởng phòng nào hôm nay                 | unit+http        | 403 `AUTHORIZATION.FORBIDDEN`                                                                                     | service spec, http spec               |
| role matrix                       | Employee, IT Admin, Super Admin, Finance, SPENDING_APPROVER, không vai | http+integration | 403; 401 không token; 503 DB lỗi                                                                                  | http + integration                    |

## Definition of Done

- [x] Vế sở hữu có test; tiền/usage không bao giờ là 0.
- [x] Gate liên quan xanh (xem plan của umbrella cho lệnh chung).
- [x] Dòng roadmap và scope map G8 đã có trong `docs/roadmap.md`.
- [x] Module card personnel cập nhật.

## Changes and acceptance

- 31/10/2026: thiết kế và implementation đầu tiên (AI implementer; bằng chứng từ worktree cô lập tại `6eb12d1`). Chưa review, chưa nghiệm thu.
