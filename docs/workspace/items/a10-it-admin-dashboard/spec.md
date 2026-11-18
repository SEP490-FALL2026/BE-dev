# Spec: a10-it-admin-dashboard — trang tổng quan IT Admin (phần vận hành)

- Phụ trách: AI implementer theo giao việc Dev A (`A-10`).
- Thiết kế ban đầu bởi: AI implementer theo [DEV-A A-10](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-A.md).
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-12-15` AC-4, _Phạm vi quyền_ IT Admin; `US-01-11`, `FR-2.15`), BE `6eb12d1`
  - diff `A-02`.
- Nhóm roadmap: G8 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Khung chung và bảng phân rã: [a10-operational-dashboards](../a10-operational-dashboards/spec.md).

## Business outcome

IT Admin IT1 gọi `GET /api/v1/dashboards/it-admin` và thấy việc trong phạm vi mình phụ trách: số task cấp và task thu hồi chưa
xong mà IT1 phụ trách mặc định, số phiếu báo lỗi SaaS giao IT1 chưa xử lý xong, số ca nghỉ việc đang bàn giao của các phòng IT1
phụ trách (hoặc đứng thay khi phòng không có IT Admin dùng được), số key trong kho chưa gán; trỏ tới thuê bao sắp tới hạn báo hủy
và điều khoản cần rà soát; "sai lệch" và "máy chưa xác nhận" hiện rõ **chưa có nguồn**. IT2 không thấy việc của P-DES.

## Sizing decision

- Container: G8 (`US-12-15`), Dev A `A-10`.
- Mode: `split-story`.
- Outcome and owner: trang IT Admin; module `dashboards`, capability `it-admin/`; số đếm qua `LicensingDashboardApi.itAdminFacts`
  và `PersonnelDashboardApi.handingOverCases`; phạm vi phòng qua `OrganizationApi.getItAdminScope` + `IdentityAccessApi`.
- Boundaries: chỉ đọc; một operation `GET /api/v1/dashboards/it-admin` (vai `IT_ADMIN`); không bảng, không migration.
- Not larger: kho khóa theo thiết bị/K4 (A-05), mốc báo hủy và gia hạn thuê bao (A-06), usage/sai lệch và thiết bị (G7) không
  thuộc trang.
- Not smaller: một vai, một phạm vi, một lần đọc; tách theo mục lặp kiểm quyền.
- Siblings: `a10-operational-dashboards`, `a10-manager-dashboard`, `a10-super-admin-dashboard`; `g4-device-dependent-features`,
  `g6-downstream-integration`.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Primary Story/AC

| Story      | AC   | Coverage | Phần còn lại thuộc                                                                       |
| ---------- | ---- | -------- | ---------------------------------------------------------------------------------------- |
| `US-12-15` | AC-4 | partial  | máy chưa xác nhận: `g4-device-dependent-features`; sai lệch: `g6-downstream-integration` |

Vế sở hữu: ghép trang theo phạm vi IT1; "hàng đợi cấp/thu hồi" (đếm task `GRANT`/`REVOKE` ở `QUEUED`/`RETRY_SCHEDULED`/
`IN_PROGRESS`/`FAILED` có `defaultResponsibleEmployeeId` = IT1 — như `provisioningTaskList?scope=MINE`); "bàn giao nghỉ việc" (ca
`HANDING_OVER` trong phạm vi phòng); "kho khóa" (key `IN_STORE`); "phiếu báo lỗi SaaS" (phiếu giao IT1 chưa xong — như
`saasIssueList?scope=assigned`); mục `cancellationDeadlines` trỏ tới `subscriptionList` (toàn bộ thuê bao; client lọc theo `noticeDeadline`, xem
`## Dependencies and blockers`), "điều khoản cần rà soát" (`planWarningList`); trạng thái thiếu nguồn của "sai lệch", "máy chưa xác nhận"; vế 2 "IT2 xử lý thay việc của P-DES, Audit Trail ghi cả hai
người" — hành vi đã có của thao tác nhận task (`g4-provisioning-queue-manual`, `US-01-11`), lát này chứng minh bằng integration
và chứng minh việc vẫn hiện ở trang của IT1.

## Supporting references

- `US-01-11` AC-1, AC-4→AC-6 (phạm vi phụ trách, đứng thay khi không có IT Admin dùng được) — `getItAdminScope`.
- `US-07-01`, `US-07-02` (queue), `US-03-04` (bàn giao nghỉ việc), `US-04-12` (kho khóa), `US-07-10/11` (phiếu báo lỗi).

## Explicit out of scope

- Đếm thuê bao sắp tới hạn báo hủy / điều khoản cần rà soát: luật mốc (`FR-1.4`) và cảnh báo điều khoản thuộc catalog/`A-06`;
  để `AT_SOURCE` tới khi có quyết định về bộ lọc hạn báo hủy hoặc facade (xem blockers; A-06 đã xong vẫn không có bộ lọc đó).
- Gán/thu hồi key theo thiết bị (`A-05`), sai lệch nguồn (`US-07-07`, G7), xác nhận chính sách máy (`US-09-03`, G7).

## Dependencies and blockers

- Không migration. Facade mới của umbrella và `a10-manager-dashboard` (`PersonnelDashboardApi`).
- **`cancellationDeadlines` chưa trỏ đúng nguồn (follow-up cần quyết định Owner/dev, A-06).** `GET /subscriptions`
  (`subscriptionList`) liệt kê mọi thuê bao và không lọc được theo hạn báo hủy; `GET /subscription-renewals`
  (`subscriptionRenewalList`) chỉ liệt kê ca gia hạn đã được đề xuất (`PROPOSED`/…), không phải mọi thuê bao sắp tới mốc. Vì vậy mục
  giữ `AT_SOURCE`/`subscriptionList`, mô tả OpenAPI và chú thích service nói thẳng "toàn bộ thuê bao; client lọc theo
  `noticeDeadline`". Để thành số đếm hoặc danh sách đúng cần một trong: (a) bộ lọc hạn báo hủy (ví dụ `noticeDeadlineBefore`) trên
  `subscriptionList`, hoặc (b) một facade đếm theo mốc ở licensing dùng `SubscriptionPeriodApi.listRenewalSubjects` (đã có cho
  `SubscriptionRenewalSweeper`; dashboards không gọi thẳng catalog, phải qua facade `LicensingDashboardApi`, ADR-0019). Cả hai thêm
  operation/tham số OpenAPI dùng chung nên **chưa làm** ở A-10; chờ quyết định.
- Câu hỏi Owner (không chặn): "của P-DES" với task/phiếu — đơn vị là IT Admin phụ trách mặc định lúc tạo (như queue `MINE` hiện
  có); default áp dụng: theo queue hiện có để số khớp danh sách.

## Ownership: module, data, API

- `dashboards/it-admin/` (controller, dto, service + spec). Licensing `DashboardFactsRepo.itAdmin` (count `provisioning_tasks`,
  `saas_issues`, `license_keys`); personnel `handingOverCases` (count `offboarding_cases`).
- Operation thêm: `GET /api/v1/dashboards/it-admin` (`itAdminDashboardGet`, message `DASHBOARD.IT_ADMIN_RETRIEVED`).

## Behavior and design

`@RequireRoles('IT_ADMIN')` + service kiểm lại. Response: `asOf`, `scope.departments` (số phòng trong phạm vi), `sections`:
`grantTasks`, `revocationTasks` (`provisioningTaskList`), `saasIssues` (`saasIssueList`), `offboardingHandovers`
(`offboardingCaseList`), `licenseKeys` (`licenseKeyList`) — `COUNTED`; `cancellationDeadlines`, `termsToReview` — `AT_SOURCE`;
`discrepancies` (`USAGE_DATA_NOT_DELIVERED`), `unconfirmedDevices` (`DEVICE_REGISTRY_NOT_DELIVERED`) — `NOT_AVAILABLE`. Số đếm
licensing trong một snapshot `RepeatableRead` (4 câu `count`). Không áp dụng: migration, ghi, job, audit.

## Test matrix

| AC / rủi ro            | Tình huống                                                                | Cấp test         | Kết quả mong đợi                                                                                                                                                                          | Bằng chứng                            |
| ---------------------- | ------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| AC-4 số đếm khớp nguồn | IT1 phụ trách P-DES: 1 grant + 1 revoke mở, 1 phiếu, 1 ca bàn giao, 2 key | integration      | grant+revoke = tổng `provisioningTaskList?scope=MINE&status=QUEUED`; phiếu = `scope=assigned`; ca = `offboardingCaseList?state=HANDING_OVER`; `scope.departments` = tổng `departmentList` | `dashboards-http.integration-spec.ts` |
| AC-4 phòng khác        | IT2 phụ trách P-ENG                                                       | integration      | IT2 thấy 1 grant, 0 revoke, 1 phiếu của mình; mutation bỏ lọc IT Admin → đỏ                                                                                                               | integration + mutation                |
| AC-4 thiết bị/sai lệch | mọi lần đọc                                                               | unit+integration | `NOT_AVAILABLE`, `count` null                                                                                                                                                             | service spec + integration            |
| AC-4 IT2 xử lý thay    | IT2 nhận task grant của P-DES (IT1 phụ trách mặc định)                    | integration      | 200; audit có actor IT2 và `defaultResponsibleEmployeeId` IT1; task vẫn đếm ở trang IT1                                                                                                   | integration                           |
| role matrix            | Employee, MANAGER, Super Admin, Finance, SPENDING_APPROVER, không vai     | http+integration | 403; 401; 503                                                                                                                                                                             | http + integration                    |

## Definition of Done

- [x] Vế sở hữu có test; số khớp list nguồn trên DB thật.
- [x] Gate liên quan xanh (lệnh chung ở plan của umbrella).
- [x] Dòng roadmap và scope map G8 đã có trong `docs/roadmap.md`.

## Changes and acceptance

- 31/10/2026: thiết kế và implementation đầu tiên (AI implementer; bằng chứng từ worktree cô lập tại `6eb12d1`). Chưa review, chưa nghiệm thu.
