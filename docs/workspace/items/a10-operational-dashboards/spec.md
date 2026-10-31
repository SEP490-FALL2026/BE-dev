# Spec: a10-operational-dashboards — trang tổng quan vận hành theo vai (khung chung + trang Employee)

- Phụ trách: AI implementer theo giao việc Dev A (`A-10`), sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI implementer theo [DEV-A A-10](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-A.md) và
  [báo cáo audit 31/10](../../../reviews/roadmap-and-api-gaps-2026-10-31/README.md).
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-12-15` AC-2, AC-3, AC-4, AC-7, phần _Phạm vi quyền_ và _Sáu trang tổng quan_;
  `FR-0.3`, `QĐ-57a`, `QĐ-57d`, `QĐ-87h`(2), `QĐ-82l`(6), `QĐ-82m`), BE `6eb12d1` + diff chưa commit của `A-02`.
- Nhóm roadmap: G8 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Scope map: dòng G8 của hạng mục đã có trong [roadmap](../../../roadmap.md#work-item-decomposition-g8).

## Business outcome

Employee đã đăng nhập gọi `GET /api/v1/dashboards/employee` và thấy trang tổng quan của chính mình: số quyền phần mềm đang
giữ (gồm K4), số quyền có thời hạn sắp hết trong 7 ngày, số phiếu báo lỗi SaaS còn mở của mình, và mục "yêu cầu đang chờ và kết
quả" hiện rõ **chưa có nguồn** (không phải 0) — mỗi mục chỉ tới operation liệt kê dòng. Lát này cũng dựng module `dashboards`
(T7) và contract mục dùng chung cho bốn trang. Kiểm được bằng integration HTTP trên PostgreSQL thật.

## Sizing decision

- Container: G8 (trang tổng quan theo vai `US-12-15`), Dev A backlog `A-10`.
- Mode: `split-story`.
- Outcome and owner: trang tổng quan Employee + nền chung của các trang vận hành (module `dashboards`, capability `section/`,
  `employee/`; số đếm licensing qua `LicensingDashboardApi`).
- Boundaries: chỉ đọc; không bảng, không migration, không transaction ghi; một operation `GET /api/v1/dashboards/employee`
  (vai `EMPLOYEE`, dữ liệu theo `principal.employeeId`); số đếm đọc qua facade `public/` của licensing (ADR-0019).
- Not larger: trang trưởng phòng, IT Admin, Super Admin là ba actor, ba phạm vi quyền và ba nguồn khác nhau — mỗi trang một
  hạng mục kiểm chứng độc lập (siblings dưới đây). Trang Finance/Người duyệt chi (`US-12-15` AC-5, AC-6) và mọi phép tính tài
  chính thuộc `B-08`.
- Not smaller: contract mục chung và module chỉ có nghĩa khi có một trang dùng nó; tách khung khỏi trang Employee sẽ tạo
  một hạng mục không có outcome kiểm được.
- Siblings: `a10-manager-dashboard`, `a10-it-admin-dashboard`, `a10-super-admin-dashboard`, `a10-background-jobs-board`
  (deferred); `a02-my-software-read-model` (dữ liệu phần mềm); `b03-my-requests` (Request của tôi, Dev B — tên đề xuất).
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8) — dòng của hạng mục đã có trong khối đó.

## Primary Story/AC

| Story      | AC   | Coverage | Phần còn lại thuộc                                                                                                                              |
| ---------- | ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `US-12-15` | AC-2 | partial  | vế dữ liệu "phần mềm đang được cấp", "quyền sắp hết": `a02-my-software-read-model`; vế dữ liệu "yêu cầu đang chờ và kết quả": `b03-my-requests` |

Vế sở hữu ở đây, chính xác: **ghép trang tổng quan Employee khi đăng nhập** (một operation trả các mục của AC-2 cho chính người
gọi), **số đếm** phần mềm đang được cấp / quyền sắp hết (đếm theo đúng luật của A-02) và **phiếu báo lỗi SaaS của E1** (đếm phiếu
chưa xử lý xong của người gửi), **trạng thái thiếu nguồn** của mục yêu cầu, và vế "**không có số liệu chi phí hay dữ liệu của người
khác**" cho cả trang.

## Phân rã `US-12-15` AC-2, AC-3, AC-4, AC-7 (mỗi vế đúng một chủ)

| AC   | Vế                                                                                                   | Chủ                                          | Trạng thái mục                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| AC-2 | ghép trang Employee; không chi phí/người khác                                                        | `a10-operational-dashboards`                 | operation `employeeDashboardGet`                                                             |
| AC-2 | phần mềm đang được cấp (gồm K4), quyền sắp hết — dữ liệu                                             | `a02-my-software-read-model`                 | `COUNTED` (`meSoftwareRightList`)                                                            |
| AC-2 | phiếu báo lỗi SaaS của E1 — số đếm                                                                   | `a10-operational-dashboards`                 | `COUNTED` (`saasIssueList` scope `mine`)                                                     |
| AC-2 | yêu cầu đang chờ và kết quả — dữ liệu                                                                | `b03-my-requests` (Dev B, `B-03`)            | `NOT_AVAILABLE` `REQUEST_QUEUE_NOT_DELIVERED`                                                |
| AC-3 | ghép trang trưởng phòng theo phòng mình; không còn lại/kết quả kiểm tra/tổng công ty/P-ENG/KPI-5     | `a10-manager-dashboard`                      | operation `managerDashboardGet`                                                              |
| AC-3 | phần mềm phòng đang được cấp hoặc quản lý; rà soát điều chuyển đang chờ                              | `a10-manager-dashboard`                      | `COUNTED`                                                                                    |
| AC-3 | hàng đợi đủ điều kiện trình duyệt chi; đề xuất ngân sách; dòng phiên bản đã duyệt                    | `a10-manager-dashboard` (mục)                | `AT_SOURCE` (operation hiện có của `requests`/`budgets`)                                     |
| AC-3 | yêu cầu chờ H1 duyệt                                                                                 | `b02-need-decision-queue` (`B-02`)           | `NOT_AVAILABLE` `REQUEST_QUEUE_NOT_DELIVERED`                                                |
| AC-3 | thực chi + cam kết đang giữ của phòng                                                                | `g3-downstream-finance-integration` (`B-08`) | `NOT_AVAILABLE` `FINANCE_FIGURES_NOT_DELIVERED`                                              |
| AC-3 | ghost seat đang chờ                                                                                  | `g6-downstream-integration` (G7)             | `NOT_AVAILABLE` `USAGE_DATA_NOT_DELIVERED`                                                   |
| AC-4 | ghép trang IT Admin theo phạm vi phụ trách                                                           | `a10-it-admin-dashboard`                     | operation `itAdminDashboardGet`                                                              |
| AC-4 | hàng đợi cấp/thu hồi, bàn giao nghỉ việc, kho khóa, phiếu báo lỗi SaaS                               | `a10-it-admin-dashboard`                     | `COUNTED`                                                                                    |
| AC-4 | thuê bao sắp tới hạn báo hủy (toàn bộ thuê bao, client lọc `noticeDeadline`), điều khoản cần rà soát | `a10-it-admin-dashboard` (mục)               | `AT_SOURCE` (`subscriptionList`, `planWarningList`); bộ lọc hạn báo hủy: follow-up Owner/dev |
| AC-4 | sai lệch                                                                                             | `g6-downstream-integration` (G7)             | `NOT_AVAILABLE` `USAGE_DATA_NOT_DELIVERED`                                                   |
| AC-4 | máy chưa xác nhận                                                                                    | `g4-device-dependent-features` (G7 registry) | `NOT_AVAILABLE` `DEVICE_REGISTRY_NOT_DELIVERED`                                              |
| AC-4 | IT2 xử lý thay việc của P-DES, Audit Trail ghi cả hai người (`US-01-11`)                             | `a10-it-admin-dashboard`                     | thao tác nhận task hiện có (`g4-provisioning-queue-manual`); integration chứng minh          |
| AC-7 | ghép trang Super Admin; không nhóm Tổng chi, không seat/duyệt                                        | `a10-super-admin-dashboard`                  | operation `superAdminDashboardGet`                                                           |
| AC-7 | cảnh báo vai trò (phòng thiếu trưởng phòng/IT Admin), thông báo biến động chờ xử lý                  | `a10-super-admin-dashboard`                  | `COUNTED`                                                                                    |
| AC-7 | bảng theo dõi nghẽn, cấu hình người duyệt, vai Super Admin, hồ sơ chưa có tài khoản                  | `a10-super-admin-dashboard` (mục)            | `AT_SOURCE`                                                                                  |
| AC-7 | tác vụ nền                                                                                           | `a10-background-jobs-board` (deferred)       | `NOT_AVAILABLE` `NO_DATA_SOURCE`                                                             |

`AT_SOURCE` nghĩa là dòng đã có ở operation hiện hữu (đúng phạm vi người gọi), trang chỉ trỏ tới, **không đếm** vì số đếm sẽ cần
facade mới trong module của chủ khác (`requests`, `budgets` của Dev B; `catalog` chờ A-06 chốt mốc báo hủy). Không làm lại queue.

## Supporting references

- `US-01-01` AC-17, `QĐ-47c`: vai hiệu lực = trực tiếp ∪ suy ra; trang Employee từ chối người không có vai `EMPLOYEE`.
- `US-03-05` AC-1: nhắc trước 7 ngày (`REMINDER_LEAD_DAYS`) — cửa sổ "sắp hết" dùng chung với A-02.
- `QĐ-57a` (Employee thấy về mình từ dữ liệu nội bộ, không usage), `QĐ-57d`/`QĐ-74` (không cảnh báo usage trong MVP).
- ADR-0019 (tầng, facade), [API contract](../../../rules/api-contract.md) (không mảng lồng không biên, message riêng).

## Explicit out of scope

- Danh sách Request của tôi (`B-03`), hàng đợi duyệt nhu cầu (`B-02`), IT assessment (`B-04`): trang không tự dựng queue.
- Trang Finance, Người duyệt chi (`US-12-15` AC-5, AC-6) và mọi số tiền/công thức (`B-08`).
- Cảnh báo/hộp thông báo (`US-12-15` AC-1, AC-8→AC-23; `A-03`, `US-16-04`); số chưa đọc đã có ở `notificationUnreadCount`.
- Màn Mobile (`A-07`): dùng cùng operation, không endpoint riêng.

## Dependencies and blockers

- Không migration, không đổi contract hiện có. Dùng `A-02` (`MySoftwareService` không đổi; luật trạng thái `my-software.policy.ts`).
- **Quyết định thiết kế cần Owner chốt (không chặn code):** thêm tầng **T7** `dashboards` vào `scripts/arch/tiers.cjs`
  (ARCHITECTURE.md, module-structure.md) vì trang trưởng phòng/Super Admin đọc personnel (T6). Default đã áp dụng: T7.
- Tích hợp roadmap: đã xong — khối G8 có trong `docs/roadmap.md`; `b02-need-decision-queue`, `b03-my-requests` là tên đề xuất của
  Dev B, thay bằng item thật khi Dev B tạo (`pnpm rules:check` chỉ nhận item đã đăng ký).
- Review 2: chưa nhận quyết định phiên nào đổi sáu trang tổng quan; giả định baseline US v0.15.

## Ownership: module, data, API

- Module mới `dashboards` (T7): `section/` (contract mục), `employee/`. Không bảng; không `public/`.
- Licensing: capability mới `dashboard-facts/` (`DashboardFactsRepo`, `DashboardFactsService`), facade mới
  `public/licensing-dashboard.api.ts` (`LicensingDashboardApi`) + `licensing-dashboard.types.ts`. Đọc `license_assignments`,
  `provisioning_tasks`, `saas_issues`, `license_keys` — chỉ `count` và facts tối thiểu, không giá/key/định danh.
- Operation thêm: `GET /api/v1/dashboards/employee` (`employeeDashboardGet`, tag `dashboards`, message `DASHBOARD.EMPLOYEE_RETRIEVED`).

## Behavior and design

**Mục (`DashboardSection`)** — bốn trường cố định: `state` (`COUNTED` | `AT_SOURCE` | `NOT_AVAILABLE`), `count` (chỉ khi
`COUNTED`), `sourceOperationId` (operation liệt kê dòng cùng phạm vi; null khi chưa có), `reason` (chỉ khi `NOT_AVAILABLE`:
`REQUEST_QUEUE_NOT_DELIVERED`, `FINANCE_FIGURES_NOT_DELIVERED`, `USAGE_DATA_NOT_DELIVERED`, `DEVICE_REGISTRY_NOT_DELIVERED`,
`NO_DATA_SOURCE`). Bất biến: dữ liệu chưa có nguồn **không bao giờ** là 0 (`dashboard-section.policy.ts`, test unit).
Response là object có khóa cố định, không mảng → không phải collection (`API-LIST-DETAIL.1` không áp; không mục registry).

**Trang Employee.** `@RequireRoles('EMPLOYEE')` + service kiểm lại vai. `asOf` = `OrganizationApi.businessToday`.
`softwareRights` = số quyền `current` như `meSoftwareRightList` mặc định; `expiringRights` = số quyền đó có `expiringSoon` theo
**cùng hàm** `rightStatusOf`/`isExpiringSoon` của A-02 (đọc facts các quyền có `expectedEndDate` trong `[D, D+7]`, một snapshot
`RepeatableRead`); `saasIssues` = phiếu người gọi gửi ở `NEW`/`IN_PROGRESS`/`WAITING_REPORTER`/`WAITING_PROVIDER`;
`requests` = `NOT_AVAILABLE` `REQUEST_QUEUE_NOT_DELIVERED`. Không tham số → không IDOR; không 422.

**Lỗi.** 401, 403 `AUTHORIZATION.FORBIDDEN` (guard hoặc `DashboardRefusedError` cùng body), 503 (`TOKEN_VERIFICATION_UNAVAILABLE`
từ guard; `SERVICE_UNAVAILABLE` qua `toUnavailableApiException`). Không mã nghiệp vụ mới.

**Không áp dụng:** migration, transaction ghi/khóa/idempotency, job, extension point, audit (đọc), storage.

**Số câu lệnh.** Guard + `businessToday` + 1 transaction (3 câu: count, findMany facts theo cửa sổ 7 ngày, count phiếu) — không
phụ thuộc số quyền.

## Test matrix

| AC / rủi ro                      | Tình huống                                                                   | Cấp test         | Kết quả mong đợi                                                                                                                                                                                                | Bằng chứng                                        |
| -------------------------------- | ---------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| AC-2 số đếm khớp nguồn           | E1 có Figma (K2), Notion (K1) hết sau 5 ngày, 1 phiếu báo lỗi                | integration      | `softwareRights` = tổng `meSoftwareRightList` = 2; `expiringRights` = 1; `saasIssues` = tổng `saasIssueList?scope=mine` = 1                                                                                     | `dashboards-http.integration-spec.ts`             |
| AC-2 người khác                  | E2 phòng P-ENG có quyền + phiếu riêng                                        | integration      | E2 chỉ thấy số của mình (1/0/1); mutation bỏ lọc người → đỏ                                                                                                                                                     | integration + mutation                            |
| AC-2 dữ liệu rỗng / thiếu nguồn  | E3 không có gì                                                               | integration+unit | `COUNTED` 0 thật; `requests` vẫn `NOT_AVAILABLE`, `count` null                                                                                                                                                  | integration, `employee-dashboard.service.spec.ts` |
| không chi phí / khóa mục cố định | mọi trang                                                                    | integration+http | đúng bốn khóa mục; schema strict                                                                                                                                                                                | integration, `dashboards.http-spec.ts`            |
| bất biến mục                     | count âm/lẻ; NOT_AVAILABLE                                                   | unit             | RangeError; `count`/`sourceOperationId` null                                                                                                                                                                    | `dashboard-section.policy.spec.ts`                |
| role matrix                      | MANAGER suy ra, IT Admin, Super Admin, Finance, SPENDING_APPROVER, không vai | http+integration | 403; người nhiều vai có `EMPLOYEE` đọc được                                                                                                                                                                     | http + integration                                |
| không token / DB lỗi             | —                                                                            | http             | 401 `AUTHENTICATION_REQUIRED`; 503 `SERVICE_UNAVAILABLE` không lộ chi tiết                                                                                                                                      | `dashboards.http-spec.ts`                         |
| `sourceOperationId` tồn tại      | mọi mục của bốn trang thật                                                   | integration      | mọi id có trong `openapi.json`                                                                                                                                                                                  | integration                                       |
| contract                         | OpenAPI/manifest/inventory                                                   | http platform    | số operation khớp `test/http/platform/openapi-presentation.http-spec.ts` (303 ở cây tích hợp 31/10/2026; số này tăng khi Dev B thêm route, nên là con số lúc làm hạng mục), presentation/example/inventory xanh | `pnpm test:http`                                  |

## Definition of Done

- [x] Mọi vế sở hữu có test ở cấp phù hợp; mutation bỏ lọc người/IT Admin làm 5 test integration đỏ.
- [x] Gate liên quan xanh trên worktree cô lập tại `6eb12d1` (xem plan; chạy lại trên cây tích hợp là việc còn lại); OpenAPI export bằng Node 22.
- [x] Spec/plan/roadmap phản ánh implementation cuối — dòng hạng mục và scope map đã có trong `docs/roadmap.md`.
- [x] Không tăng legacy ledger kiến trúc (không registry/ngoại lệ mới); tầng T7 mới cần Owner chốt.
- [x] Module card `dashboards`, `licensing`, `personnel` cập nhật.

## Changes and acceptance

- 31/10/2026: thiết kế và implementation đầu tiên (AI implementer; bằng chứng từ worktree cô lập tại `6eb12d1` + A-02). Chưa peer review, chưa
  Owner review, chưa nghiệm thu.
