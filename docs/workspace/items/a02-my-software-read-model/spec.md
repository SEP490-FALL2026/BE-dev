# Spec: a02-my-software-read-model — "Phần mềm của tôi"

- Phụ trách: AI implementer theo giao việc Dev A (`A-02`), sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI implementer theo [DEV-A A-02](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-A.md) và
  [báo cáo audit 31/10](../../../reviews/roadmap-and-api-gaps-2026-10-31/README.md).
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-12-15` AC-2, `US-16-01` AC-1; `US-01-01` AC-17, `US-03-05` AC-1, AC-2,
  `QĐ-43b`, `QĐ-47c`, `QĐ-57a`, `QĐ-61b`), BE `6eb12d1`.
- Nhóm roadmap: G8 (trang tổng quan Employee) và G10 (màn Mobile) — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Scope map: dòng G8 và G10 của hạng mục đã có trong [roadmap](../../../roadmap.md).

## Business outcome

Employee đã đăng nhập (vai hiệu lực `EMPLOYEE`) gọi một API đọc và thấy đúng các quyền phần mềm **của chính mình** —
K1→K5, gồm khóa K4 — với trạng thái tại ngày nghiệp vụ, ngày hết hạn của quyền có thời hạn, cờ sắp hết hạn, quyền bắt đầu
sau, và (ở chế độ xem riêng) quyền đã kết thúc; không có chi phí, seat hay dữ liệu của người khác, không có khóa bí mật. Web
dashboard Employee và màn Mobile dùng chung operation này. Kiểm được bằng HTTP integration trên PostgreSQL thật.

## Sizing decision

- Container: G8 (đọc của trang tổng quan Employee `US-12-15`) và G10 (`US-16-01` Mobile); Dev A backlog `A-02`.
- Mode: `grouped-stories`.
- Outcome and owner: một read model "quyền của tôi" dùng chung web/mobile; capability `licensing/my-software/` sở hữu.
- Boundaries: chỉ đọc; bảng `license_assignments` + `provisioning_tasks` (licensing) và tên gói/ứng dụng/kiểu cấp qua
  `CatalogApi.getPlanRevocationInfo`; một operation `GET /api/v1/me/software-rights`; không transaction ghi, không job, không
  extension point, không migration; quyền: vai `EMPLOYEE`, dữ liệu theo `principal.employeeId`.
- Not larger: Request của tôi (`B-03`), danh sách phiếu báo lỗi SaaS (đã có `GET /saas-issues`), ghép dashboard (`A-10`),
  luồng Mobile end-to-end (`A-07`) và K4 gắn thiết bị (`A-05`) là outcome khác, owner khác.
- Not smaller: hai Story cùng đòi một dữ liệu duy nhất (US-16-01 AC-1 dẫn "như trang tổng quan Employee — US-12-15 AC-2");
  tách web/mobile sẽ tạo hai contract cho cùng dữ liệu, trái `QĐ-61` (cùng REST API).
- Siblings: `a10-operational-dashboards` (ghép dashboard US-12-15), `a07-mobile-employee-flow` (mapping/E2E Mobile), `B-03`
  (Request của tôi), `g4-device-dependent-features` (K4 gắn thiết bị, A-05). Tên `a10-operational-dashboards` và
  `a07-mobile-employee-flow` đã có thư mục và dòng roadmap.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8), [G10](../../../roadmap.md#work-item-decomposition-g10) —
  dòng của hạng mục đã có trong hai khối này.

## Primary Story/AC

| Story      | AC   | Coverage | Phần còn lại thuộc                                                                                                  |
| ---------- | ---- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `US-12-15` | AC-2 | partial  | `a10-operational-dashboards` (ghép trang; vế "yêu cầu đang chờ và kết quả" qua `B-03`; vế phiếu báo lỗi SaaS đã có) |
| `US-16-01` | AC-1 | partial  | `a07-mobile-employee-flow` (mapping màn Mobile → operation, E2E chuỗi Mobile)                                       |

Vế sở hữu ở đây, chính xác:

- `US-12-15` AC-2: "phần mềm đang được cấp (gồm Office 2021 K4)", "quyền Notion sắp hết" (ngày hết hạn + cờ ≤ 7 ngày), "không
  có số liệu chi phí hay dữ liệu của người khác" **cho phần phần mềm**. Không sở hữu: "yêu cầu đang chờ và kết quả" (B-03),
  "phiếu báo lỗi SaaS của E1" (đã có `GET /saas-issues`, scope `mine` — `g6-saas-error-report`), việc ghép thành trang khi đăng
  nhập (A-10).
- `US-16-01` AC-1: dữ liệu và quyền của API "Phần mềm của tôi" (đúng phần mềm của E1 gồm K4, ngày hết hạn Notion, không thấy
  của E2, không chi phí). Không sở hữu: màn Mobile, sequence API Mobile và E2E chuỗi Mobile (A-07).

## Supporting references

- `US-01-01` AC-17, `QĐ-47c`: vai hiệu lực = trực tiếp ∪ suy ra; thao tác chỉ dành cho Employee từ chối tài khoản không có
  vai `EMPLOYEE` (kể cả trưởng phòng chỉ có vai suy ra). `US-16-01` AC-6: người nhiều vai có hợp quyền.
- `US-03-05` AC-1, AC-2: quyền hết hiệu lực từ ngày sau ngày hết hạn; nhắc trước 7 ngày (`REMINDER_LEAD_DAYS`).
- `US-07-05` AC-19: K1 hủy gia hạn còn truy cập tới hết kỳ đã trả (nguồn của trạng thái `ENDING`).
- `US-05-14` AC-1, AC-2: gia hạn tạo bản ghi kế tiếp nối chuỗi (nguồn của `UPCOMING` và `successorAssignmentId`).
- `QĐ-43b`: ngày bắt đầu chỉ là ngày ghi nhận thì không trình bày như ngày cấp (`grantedOn` null + nhãn).
- `US-04-12` AC-5→AC-8, `g4-device-dependent-features`: gán khóa K4 theo thiết bị chưa có; lát này không đọc kho khóa.
- ADR-0019 (tầng/public API), [API-LIST-DETAIL.1](../../../rules/api-contract.md#collection-và-detail-api-list-detail1).

## Explicit out of scope

- Request của tôi, trạng thái Request (`B-03`); danh sách phiếu báo lỗi SaaS (đã có); ghép dashboard Employee (`A-10`).
- Màn Mobile, sequence và E2E Mobile (`A-07`); push/offline (không có theo `QĐ-61c`).
- Gắn khóa K4 với người/thiết bị, hiển thị khóa hay thiết bị (`A-05`, chờ registry G7 của Owner): operation này **không bao giờ**
  đọc `license_keys`.
- Tài khoản dịch vụ mà người gọi chịu trách nhiệm (thuộc phòng, không phải quyền cá nhân — đã có `GET /service-account-duties`).
- Ngày kết thúc của **thuê bao** công ty (không phải quyền cá nhân); usage (không có trong MVP — `QĐ-57d`).
- Xem quyền của người khác, xem hộ (trưởng phòng/IT Admin) — đã có `GET /license-assignments`, `GET /departments/{id}/tools-in-use`.
- Detail endpoint theo id: không có AC cần; danh sách đã đủ trường. Không thêm.
- `GET /saas-issues/options` giữ nguyên: là form báo lỗi (chỉ quyền mở có thể báo lỗi, không ngày/không trạng thái/không K),
  không dùng làm endpoint dashboard.

## Dependencies and blockers

- Không phụ thuộc collector/G7, không migration, không đổi public API của module khác.
- Đối chiếu Review 2 (`Docs/Reviews/review2-main-flows-process-policy-2026-10-31`): chưa nhận quyết định phiên nào của Owner đổi
  dữ liệu trang tổng quan Employee; **giả định** baseline US v0.15 giữ nguyên. Nếu Review 2 đổi phạm vi trang Employee, sửa
  spec trước phần phụ thuộc.
- Tích hợp roadmap: đã xong — khối `### Work-item decomposition: G8`/`G10` và các item `a10-operational-dashboards`,
  `a07-mobile-employee-flow` đã có trong `docs/roadmap.md`.
- Câu hỏi Owner (không chặn): (1) có cần cho Employee xem ngày kết thúc thuê bao công ty của phần mềm đang dùng không (hiện
  không — không phải quyền cá nhân); (2) trang tổng quan có cần chế độ "đã kết thúc" mặc định ẩn như thiết kế này không.

## Ownership: module, data, API

- Module `licensing` (T4), capability mới `my-software/` (controller, dto, service, repo, policy). Không Nest module mới.
  Capability đứng trên `expiry` (dùng `REMINDER_LEAD_DAYS`) và `assignment` (dùng `effectiveFromLabel`); không ai import nó.
- Đọc: `license_assignments`, `provisioning_tasks` (của licensing). Tên gói/ứng dụng + kiểu cấp qua `CatalogApi.getPlanRevocationInfo`
  (một câu lệnh cho cả trang); ngày nghiệp vụ qua `OrganizationApi.businessToday`. Không đọc bảng module khác.
- Thêm operation: `GET /api/v1/me/software-rights` (`meSoftwareRightList`, tag `me`, message `ME.SOFTWARE_RIGHTS_LISTED`).
  Không đổi contract hiện có (kể cả `saasIssueFormOptions`).

## Behavior and design

**Quyền.** `@RequireRoles('EMPLOYEE')`: 401 không token, 403 `AUTHORIZATION.FORBIDDEN` cho tài khoản không có vai `EMPLOYEE`
(IT Admin/Finance/Super Admin thuần, tài khoản không vai, trưởng phòng/Người duyệt chi chỉ có vai suy ra). Không tham số nào
nêu người: dữ liệu luôn theo `principal.employeeId`; query lạ (vd `employeeId`) → 422 vì DTO strict. Không IDOR.

**Query.** `view` = `current` (mặc định) | `ended`; `page` ≥ 1 (mặc định 1); `pageSize` 1→100 (mặc định 20).

**Tập dữ liệu.** Assignment `kind = PERSONAL` của chính người gọi, loại `failedAt`/`cancelledAt` (grant thất bại hoặc bị hủy chưa
từng giữ seat). `current`: `validUntil IS NULL OR validUntil > hôm nay` (đang giữ hoặc sẽ giữ — cùng điều kiện với
`listPersonalSeatsOf` và `/saas-issues/options`). `ended`: `validUntil <= hôm nay`.

**Thứ tự.** `current`: `validFrom ASC, id ASC`; `ended`: `validUntil DESC, id ASC`. Count và page trong một transaction
`RepeatableRead`; không cắt trang trong bộ nhớ.

**Item (summary projection `mySoftwareRightSummarySchema`).** `assignmentId`, `application {id,name}`, `plan {id,name}`,
`provisioningType` (K1→K5), `status`, `effectiveFrom`, `grantedOn` (null khi chỉ là ngày ghi nhận — `QĐ-43b`), `effectiveFromLabel`,
`expectedEndDate` (ngày hết hạn của quyền có thời hạn), `expiringSoon`, `validUntil` (ngày đầu tiên không còn giữ, nửa mở),
`successorAssignmentId` (bản ghi gia hạn nối tiếp). Response còn `asOf` (ngày nghiệp vụ dùng để tính) và `view`. Không có
giá, Cost Center, `accountIdentifier`, `reason`, ghi chú thu hồi, khóa K4, người khác. Không mảng lồng.

**Trạng thái tại ngày nghiệp vụ `D`** (`my-software.policy.ts`, xét theo thứ tự):

| Trạng thái     | Điều kiện                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `ENDED`        | `validUntil <= D`                                                                                           |
| `UPCOMING`     | `validFrom > D` (bản ghi gia hạn nối tiếp, quyền có hiệu lực sau)                                           |
| `PROVISIONING` | có task GRANT `QUEUED`/`RETRY_SCHEDULED`/`IN_PROGRESS`/`FAILED`                                             |
| `REVOKING`     | có task REVOKE `QUEUED`/`RETRY_SCHEDULED`/`IN_PROGRESS`/`FAILED`                                            |
| `ENDING`       | task REVOKE `COMPLETED` với `accessState = UNTIL_PAID_END` và `validUntil > D` (K1 còn truy cập tới hết kỳ) |
| `EXPIRED`      | `expectedEndDate < D` và không có bản ghi gia hạn nối tiếp (`US-03-05` AC-2: hết từ ngày sau)               |
| `ACTIVE`       | còn lại; bản ghi cũ đã gia hạn (có `validUntil` tương lai + successor) vẫn `ACTIVE`                         |

`expiringSoon` = trạng thái `ACTIVE`/`PROVISIONING`, có `expectedEndDate` trong `[D, D+7]`, không có successor.

**K4.** Hiển thị như mọi quyền (`provisioningType: K4`); không join/đọc `license_keys`; test kiểm khóa và dạng che không xuất hiện
và không câu lệnh nào chạm bảng `license_keys`. Hôm nay chưa đường nào tạo assignment K4 (grant/baseline từ chối K4 chờ A-05);
read model đúng khi A-05 bắt đầu ghi.

**Đối chiếu `/saas-issues/options` và projection hiện có.** `options` là form: chỉ quyền mở, chỉ `assignmentId`/plan/grant chưa
xong, không ngày, không trạng thái, không kiểu cấp → không đủ cho dashboard và không nên đổi nghĩa form. `listPersonalSeatsOf`
(facade cho offboarding/transfer) không phân trang, kèm ghi chú thu hồi và lý do cấp (dữ liệu cho người xử lý). `department-tools`
theo phòng, cần vai IT/Manager. Vì vậy dùng lại **điều kiện tập dữ liệu** và **cách nhận biết K1 kết thúc tới hết kỳ** (như
`department-tools`) nhưng làm repo/projection riêng có phân trang và summary đúng cho Employee.

**Lỗi.** 401, 403, 422 `VALIDATION_ERROR`, 503 (`TOKEN_VERIFICATION_UNAVAILABLE` từ guard; `SERVICE_UNAVAILABLE` khi DB lỗi tạm
thời qua `toUnavailableApiException`). Không mã nghiệp vụ riêng.

**Không áp dụng:** migration (không đổi schema), transaction ghi/khóa/idempotency (chỉ đọc), job/worker, extension point, audit
(đọc không ghi Audit Trail — như các list khác), storage.

**Số câu lệnh.** Hằng số theo số dòng: guard/session + `businessToday` + 1 page + 1 task theo lô + 1 successor theo lô + 1 count +
1 catalog (bỏ qua khi trang rỗng). Test đếm câu lệnh trên hai cỡ dữ liệu và khẳng định không đọc `license_keys`, `cost_centers`,
`subscriptions`.

## Test matrix

| AC / rủi ro                            | Tình huống (gồm từ chối, edge case)                                                         | Cấp test         | Kết quả mong đợi                                                                            | Bằng chứng sau implement                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------- |
| US-12-15 AC-2, US-16-01 AC-1           | E1 có K2 (Figma), K4 (Office), K1 (Notion), K5 (nội bộ) + các trạng thái khác               | integration      | đủ 10 quyền current, kiểu K1/K2/K4/K5 đúng                                                  | `my-software-http.integration-spec.ts` xanh |
| AC-1 ngày hết hạn                      | Notion hết sau 5 ngày; quyền khác hết 3 ngày trước                                          | integration+unit | `expectedEndDate`, `expiringSoon=true`; quá hạn → `EXPIRED`                                 | integration + `my-software.policy.spec.ts`  |
| không lộ khóa K4 / chi phí / định danh | kho khóa có key của thuê bao K4 mà E1 có quyền                                              | integration      | không có key, dạng che, fingerprint, identifier, giá; không đọc bảng khóa                   | integration (2 test)                        |
| người khác (IDOR)                      | E2 cùng thuê bao Figma/Office; query `employeeId`                                           | integration+http | E1 không thấy của E2 và ngược lại; `employeeId` → 422                                       | integration, `my-software.http-spec.ts`     |
| thời điểm hiệu lực                     | gia hạn quyết trước hạn: bản cũ còn tới D+4, bản mới từ D+4                                 | integration+unit | cũ `ACTIVE` + `successorAssignmentId`, mới `UPCOMING`                                       | integration + policy spec                   |
| kết thúc quyền                         | thu hồi K2 xong hôm nay; K1 hủy gia hạn tới hết kỳ; thu hồi đang mở; grant thất bại đã đóng | integration+unit | `ENDED` chỉ ở `view=ended`; `ENDING` + `validUntil`; `REVOKING`; grant hỏng không xuất hiện | integration + policy spec                   |
| grant chưa xong                        | grant QUEUED                                                                                | integration      | `PROVISIONING`                                                                              | integration                                 |
| role matrix                            | IT Admin/Finance/Super Admin/không vai/MANAGER suy ra/SPENDING_APPROVER suy ra; IT+EMPLOYEE | http+integration | 403 `AUTHORIZATION.FORBIDDEN`; người nhiều vai có `EMPLOYEE` đọc được của mình              | http + integration                          |
| không token                            | gọi không header                                                                            | http+integration | 401 `AUTHENTICATION_REQUIRED`                                                               | http + integration                          |
| phân trang/thứ tự                      | pageSize 3 qua 4 trang; pageSize 101; page 0; view lạ                                       | integration+http | tổng bằng nhau, nối trang = toàn bộ, thứ tự `validFrom,id`; 422                             | integration + http                          |
| số câu lệnh                            | 1 quyền vs 10 quyền                                                                         | integration      | bằng nhau; không bảng khóa/Cost Center/thuê bao                                             | integration                                 |
| DB tạm lỗi                             | service ném `TransientDatabaseError`                                                        | http             | 503 `SERVICE_UNAVAILABLE`, không lộ chi tiết                                                | http                                        |
| mapping/ghép tên                       | đọc tên gói một lần cho trang; trang rỗng không gọi catalog; không lộ ghi chú thu hồi       | unit             | đúng shape                                                                                  | `my-software.service.spec.ts`               |
| contract                               | OpenAPI/manifest/ví dụ                                                                      | http platform    | inventory, example manifest, presentation (288 operation) xanh                              | `pnpm test:http`                            |

## Definition of Done

- [x] Mọi vế sở hữu có test đỏ-trước/xanh-sau ở cấp phù hợp (mutation bỏ lọc `employeeId` làm 4 test integration đỏ).
- [x] Gate liên quan xanh trên worktree cô lập tại `6eb12d1` (xem plan; chạy lại trên cây tích hợp là việc còn lại); HTTP đổi thì e2e/HTTP + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối — dòng G8, G10 và dòng hạng mục đã có trong `docs/roadmap.md`.
- [x] Không tăng legacy ledger kiến trúc (không registry/ngoại lệ mới).
- [x] Module card licensing cập nhật; không runbook bị ảnh hưởng.

## Changes and acceptance

- 31/10/2026: thiết kế và implementation đầu tiên (AI implementer; bằng chứng từ worktree cô lập tại `6eb12d1`). Chưa peer review, chưa Owner
  review, chưa nghiệm thu.
