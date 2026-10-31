# Spec: cảnh báo license vào hộp thông báo (F58)

- Phụ trách: AI theo giao việc A-03 của Dev A (31/10/2026); tiếp quản `g4-notification-delivery`.
- Thiết kế ban đầu bởi: AI theo giao việc A-03 (31/10/2026), từ khung `g4-notification-delivery` (20/10/2026).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `726219a` (BRD `FR-5.14` bảng cảnh báo; US `US-12-15` danh mục dòng 3, 12, 13, 17, 26, 38 và AC-1, AC-8, AC-11;
  Story nguồn `US-03-05`, `US-03-08`, `US-03-09`, `US-07-02`, `US-07-03`, `US-07-04`, `US-07-05`, `US-07-09`), BE `6eb12d1`.
- Nhóm roadmap: G4, G6 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Dòng hạng mục và scope map G4/G6 đã có trong [roadmap](../../../roadmap.md).

## Business outcome

Các cảnh báo license của `FR-5.14` đã có điểm phát (bản ghi nhắc hoặc audit event) nay tới **hộp thông báo trong ứng dụng**
của đúng người giữ vai lúc gửi: quyền có thời hạn sắp hết (T−7), bàn giao dữ liệu chưa xác nhận, người chịu trách nhiệm tài
khoản dịch vụ sắp rời, người đã nghỉ việc còn truy cập gói `K1` tới hết kỳ. Kiểm được bằng `GET /notifications` của người nhận
và bảng `in_app_notifications`; chạy lại job hay lặp thao tác không sinh thông báo thứ hai.

## Sizing decision

- Container: G4, G6 (nhóm giao việc; finding F58 của remediation, `RA-06`).
- Mode: `grouped-stories`.
- Outcome and owner: các cảnh báo license `FR-5.14` vào hộp thông báo, viết trong transaction của sự kiện nguồn; capability
  `licensing` (gốc module `licensing-alerts.*`, `expiry/`, `handover/`, `assignment/service-account-duty/`,
  `provisioning/revocation-completion/`) và một lời gọi từ `personnel/service-account`.
- Boundaries: không bảng, không migration, không route mới; chỉ thêm mã vào bảng mã đóng của `notifications` và gọi
  `NotificationsApi.notifyInApp` trong transaction sẵn có của job/thao tác; không thư điện tử, không push.
- Not larger: lời mời nhà cung cấp chưa chấp nhận (dòng 17) và lỗi xác thực connector (dòng 26) cần connector/sự kiện G7 của
  Owner; các cảnh báo không phải license (ngân sách, nhân sự, Request) đã có ở hạng mục khác.
- Not smaller: bốn sự kiện dùng chung một chính sách người nhận (người giữ vai lúc gửi, IT Admin còn dùng được, không ai thay
  trưởng phòng vắng) và một cách khóa sự kiện; tách theo sự kiện sẽ lặp phần đó và test của nó.
- Siblings: `g6-time-limited-access`, `g6-handover-confirmation`, `g6-service-account-handover`, `g6-revocation-by-grant-kind`,
  `g4-provisioning-queue-manual`, `g4-provisioning-failure-handling`, `g4-request-and-transfer-integration`,
  `g5-request-status-notifications`, `g6-downstream-integration`, `g4-notification-delivery` (được tiếp quản).
- Scope map: [G4](../../../roadmap.md#work-item-decomposition-g4), [G6](../../../roadmap.md#work-item-decomposition-g6).

## Primary Story/AC

| Story    | AC                       | Coverage | Phần còn lại thuộc                                                                                                                                         |
| -------- | ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-03-05 | AC-1                     | partial  | AC-1 vế nhắc, audit, danh sách: `g6-time-limited-access`                                                                                                   |
| US-07-02 | AC-1                     | partial  | AC-1 vế hoàn tất kèm bằng chứng: `g4-provisioning-queue-manual`                                                                                            |
| US-07-04 | AC-3, AC-6, AC-12, AC-13 | partial  | vế loại lỗi, thử lại, đóng thất bại: `g4-provisioning-failure-handling`; vế kết cục Request/cam kết của AC-6, AC-12: `g4-request-and-transfer-integration` |

Vế thuộc hạng mục này: **thông báo trong hộp thông báo** của từng AC. `US-03-05` AC-1: người giữ quyền, trưởng phòng hôm nay
và IT Admin phụ trách nhận nhắc T−7 (mới, E1). `US-07-02` AC-1 và `US-07-04` AC-6, AC-13: người yêu cầu nhận thông báo có
quyền / thất bại không mã lỗi — **đã có** ở phép chiếu `requests/status` (`REQUEST_GRANTED`, `REQUEST_FAILED` chỉ mang
`requestId`, `contact`), xác minh lại, không viết lại. `US-07-04` AC-3, AC-12: `blocked` chờ G7 (mục _Dependencies and blockers_).

## Supporting references

- Danh mục `US-12-15` (AC-1, AC-8, AC-11) và BRD `FR-5.14`: dòng 3 (quyền có thời hạn, T−7), 12 (bàn giao chưa xác nhận),
  13 (người chịu trách nhiệm tài khoản dịch vụ sắp rời), 17 (lời mời chưa chấp nhận), 26 (lỗi xác thực connector),
  38 (người đã nghỉ việc còn `K1` tới hết kỳ, `QĐ-77l`). Kênh: chỉ hộp thông báo (`FR-3.11`, `QĐ-61c`).
- Vế _nhắc/cảnh báo_ của `US-03-09` AC-3, AC-6, `US-07-09` AC-17, AC-18 (dòng 12), `US-03-08` AC-1, AC-5 (dòng 13) và
  `US-07-05` AC-19 (dòng 38) nằm trong các hạng mục `g6-*` ở scope map dưới dạng `full`, với audit event làm điểm phát và câu
  _kênh thông báo đọc event (`g4-notification-delivery`)_. Hạng mục này **giao** vế hộp thông báo của các điểm phát đó mà không
  lấy lại AC (một chủ một vế); đề xuất đổi các dòng đó thành `partial` (chủ vế hộp thông báo = hạng mục này, cần `## Size exception` vì vượt ba Story: `US-03-09` AC-3, AC-6; `US-07-09` AC-17, AC-18; `US-03-08` AC-1, AC-5; `US-07-05` AC-19) **chưa áp dụng, chờ Owner chọn**; mặc định: giữ `full` ở chủ G6 và ghi vế hộp thông báo ở đây. Tương tự dòng G2 `US-02-02` AC-17 (`deferred` → `g4-notification-delivery`): thông báo hồ sơ nhân viên mới đã có (`EMPLOYEE_PROFILE_CREATED`, F17) nên Owner/người tích hợp có thể chuyển dòng đó về hạng mục đã làm (ngoài phạm vi A-03).
- `QĐ-62c`, `QĐ-87` `D-7` (không ai nhận thay trưởng phòng vắng), `US-12-15` _cảnh báo cho vai đã mất hiệu lực → không gửi_,
  ADR-0018 (sweeper chạy trong tiến trình API), ADR-0019 (tầng module, `public/`).

## Explicit out of scope

- Bộ công cụ chuẩn (`US-04-10`, `RETIRED`): bỏ khỏi khung cũ, không còn vế nào.
- Lời mời nhà cung cấp chưa chấp nhận sau N ngày / thu lại sau M ngày (dòng 17, `US-07-03` AC-7, AC-8, `US-07-04` AC-12) và
  lỗi xác thực connector báo Super Admin (dòng 26, `US-07-04` AC-3): không có trạng thái _chờ chấp nhận_ hay connector thật trong
  BE; không implement connector (Owner giữ G7).
- Nhắc trưởng phòng/Super Admin về _phòng thiếu trưởng phòng_ (dòng 9): đã có ở `organization` (`D-7`).
- Thư điện tử, push, gom/đánh dấu xử lý cảnh báo (`OQ-F-16`), trang tổng quan (`US-12-15` AC-2→AC-7, G8).
- Các dòng còn lại của danh mục không phải license.

## Dependencies and blockers

- Đã có: hộp thông báo (`20261024110000_notifications_in_app_inbox`, `NotificationsApi.notifyInApp`, bảng mã đóng
  `inbox.policy.ts`); các điểm phát: `ExpiryReminderSweeper` (`assignment_expiry_reminders`), `HANDOVER_DUTY.OPENED`/`OVERDUE`
  (`HandoverDutySweeper`), `SERVICE_ACCOUNT_DUTY.OPENED` (hook `personnel`) / `.OVERDUE` (`ServiceAccountDutySweeper`), hoàn tất
  thu hồi `K1` `UNTIL_PAID_END`; phép chiếu `REQUEST_GRANTED`/`REQUEST_FAILED` của `requests/status`.
- **Blocker B1 (dòng 17, `US-07-03` AC-7/AC-8, `US-07-04` AC-12):** chưa có trạng thái tác vụ _chờ chấp nhận_ và đối soát lời mời
  (`TE-11b`, connector G7 của Owner); giá trị N, M chưa chốt (`OQ-D-01`). Điều kiện gỡ: Owner bàn giao contract sự kiện
  _lời mời chờ_ của G7. Mặc định áp dụng: không phát gì.
- **Blocker B2 (dòng 26, `US-07-04` AC-3):** lỗi xác thực chỉ ghi được qua `recordProvisioningFailure` của connector chưa có;
  chờ contract sự kiện lỗi xác thực của G7. Khi có: thêm mã `CONNECTOR_AUTH_FAILED` tới Super Admin dùng chung
  `LicensingAlerts` (không platform thứ hai). Mặc định: không phát gì.
- Không migration (cột `code` là chuỗi có CHECK dạng mã, không enum).

## Ownership: module, data, API

- `notifications`: thêm 6 mã và khóa tham số vào `IN_APP_NOTIFICATION_CODES`/`PARAM_KEYS_BY_CODE` (bảng mã đóng).
- `licensing` (T4): `licensing-alerts.policy.ts` (thuần: nội dung, khóa sự kiện, lọc người nhận), `licensing-alerts.service.ts`
  (`LicensingAlerts`: IT Admin phụ trách còn dùng được, ghi thông báo qua `NotificationsApi`); `handover/handover-alert.service.ts`.
  Sửa `expiry-reminder.service.ts`, `handover-issue.service.ts`, `handover-overdue.service.ts`, `service-account-duty.service.ts`,
  `revocation-completion.service.ts`; facade `LicensingServiceAccountApi.remindServiceAccountDuties` (mới).
- `organization`: `OrganizationApi.getItAdminInChargeOfDepartment(departmentId)` (mới, đọc, không đổi hành vi).
- `personnel`: `service-account/service-account-duty.listener.ts` gọi `remindServiceAccountDuties` sau audit.
- Bảng: chỉ ghi `in_app_notifications` qua facade; đọc `assignment_expiry_reminders`, `handover_duties`, `provisioning_task_reasons`
  của chính `licensing`. Không HTTP mới; OpenAPI không đổi.

## Behavior and design

Chung: mọi thông báo ghi trong transaction đã có của job/thao tác (cùng bản ghi nhắc, mốc `*_noticed_at` và audit), nên rollback
thì không còn; người nhận đọc tại lúc gửi; khóa sự kiện `(người nhận, eventKey)` duy nhất của hộp thông báo làm mọi lần chạy lại
không ghi thêm. IT Admin chỉ được báo khi còn vai và tài khoản dùng được (`findUsableItAdminEmployeeIds`). Trưởng phòng vắng →
không ai nhận thay (không approver dự phòng, không IT Admin, không Super Admin). Tham số chỉ là id, mã, ngày, số đếm; không tên,
định danh tài khoản, khóa, giá hay ghi chú (tham số chọn từng khóa; bảng mã đóng từ chối khóa lạ — đã bắt được một rò
`accountIdentifier` khi test).

| Sự kiện                 | Mã                                    | Người nhận                                                                                             | Khi nào                                                                                            | Khóa sự kiện               | Thu hồi/hủy                                                                   |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| E1 dòng 3               | `LICENSE_EXPIRY_REMINDER`             | người giữ quyền; trưởng phòng hôm nay; IT Admin phụ trách còn dùng được                                | mỗi giờ, ngày kết thúc trong `[hôm nay, +7]`                                                       | `…:{assignment}:{endDate}` | gia hạn (bản ghi cũ đóng), hủy/kết thúc → ra khỏi tập, không nhắc nữa         |
| E2 dòng 12 (mở)         | `HANDOVER_CONFIRMATION_DUE`           | người xác nhận hiện tại (trưởng phòng/người kế nhiệm/người cố định); IT Admin phụ trách phòng của duty | khi duty mở hoặc đổi vai                                                                           | `…:{duty}`                 | —                                                                             |
| E2 dòng 12 (quá hạn)    | `HANDOVER_CONFIRMATION_OVERDUE`       | như trên, đọc lúc quá hạn                                                                              | sweeper mỗi giờ, một lần cho mỗi hạn                                                               | `…:{duty}:{dueOn}`         | xác nhận hoặc hủy ca trước hạn → không báo; dời hạn → báo lại khi hạn mới qua |
| E3 dòng 13 (trước ngày) | `SERVICE_ACCOUNT_RESPONSIBLE_DUE`     | IT Admin phụ trách phòng sở hữu tài khoản (gộp số tài khoản theo người)                                | khi ghi điều chuyển/nghỉ việc hoặc dời ngày                                                        | `…:{file}:{dueOn}`         | —                                                                             |
| E3 dòng 13 (tới ngày)   | `SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE` | IT Admin phụ trách phòng sở hữu                                                                        | sweeper, một lần cho tài khoản và ngày                                                             | `…:{assignment}:{dueOn}`   | đã chỉ định người mới hoặc hồ sơ hủy → không còn duty, không báo              |
| E4 dòng 38              | `LEAVER_K1_ACCESS_RUNS_ON`            | IT Admin phụ trách phòng của người (hôm nay, hoặc ngày mở thu hồi)                                     | hoàn tất thu hồi `RENEWAL_CANCELLED` + `UNTIL_PAID_END` và có lý do `DEPARTURE`/`ABRUPT_DEPARTURE` | `…:{task}`                 | `CUT` hoặc nguồn khác → không báo                                             |

E1 đổi một điều của bản ghi nhắc: IT Admin phụ trách đã mất vai/tài khoản không còn được ghi dòng `IT_ADMIN` (trước đây vẫn
ghi). Phòng chưa có IT Admin dùng được giữ quyền trong tập ứng viên như phòng thiếu trưởng phòng; IT Admin được gán sau nhận
ở lượt kế tiếp. Không đổi lock order: các lần đọc tổ chức/danh tính thêm vào là đọc không khóa trong transaction đã có.
Không API/HTTP mới, không migration, không thư. Job vẫn chạy trong tiến trình API (ADR-0018).

## Test matrix

| AC / rủi ro                                                    | Tình huống (gồm từ chối, edge case)                                          | Cấp test           | Kết quả mong đợi                                                                                             | Bằng chứng sau implement                                                                                                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-03-05 AC-1, `US-12-15` AC-8                                 | T−7: người giữ quyền, trưởng phòng, IT Admin; chạy lại cùng ngày và ngày sau | integration        | 3 thông báo, đúng tham số, không thư, chạy lại không thêm; người giữ quyền đọc được qua `GET /notifications` | `license-expiry-inbox` ca 1 — xanh                                                                                                                                     |
| ngày biên                                                      | hết hạn +7, +8, +2, −1; +8 ngày hôm sau                                      | integration        | +7, +2 có; +8 không (có ở ngày sau); đã hết hạn không                                                        | ca 2 — xanh                                                                                                                                                            |
| US-03-05 AC-10, `QĐ-62c`                                       | phòng thiếu trưởng phòng; gán trưởng phòng sau                               | integration        | chỉ người giữ quyền + IT Admin; trưởng phòng mới nhận ở lượt sau                                             | ca 3 — xanh                                                                                                                                                            |
| người đổi vai                                                  | IT Admin phụ trách không còn vai; gán IT Admin khác                          | integration        | người mất vai không nhận, không có dòng `IT_ADMIN`; người mới nhận                                           | ca 4 — xanh                                                                                                                                                            |
| gia hạn hủy nhắc                                               | gia hạn trước cửa sổ; lượt ở ngày +33                                        | integration        | bản ghi cũ không nhắc; bản kế tiếp chỉ nhắc khi vào cửa sổ                                                   | ca 5 — xanh                                                                                                                                                            |
| dòng 12 mở                                                     | ca nghỉ việc có kế hoạch, hai seat; mở lại                                   | integration        | trưởng phòng + IT Admin mỗi duty một lần; người nghỉ không nhận                                              | `license-handover-inbox` — xanh                                                                                                                                        |
| dòng 12 quá hạn                                                | quá hạn, chạy hai lần; dời hạn rồi qua hạn                                   | integration        | một lần mỗi hạn; hạn mới báo lại                                                                             | xanh                                                                                                                                                                   |
| dòng 12 hủy                                                    | xác nhận một duty, hủy ca                                                    | integration        | không báo quá hạn                                                                                            | xanh                                                                                                                                                                   |
| dòng 12 thiếu trưởng phòng (`US-03-09` AC-6, `US-07-09` AC-18) | phòng không trưởng phòng; gán trưởng phòng mới                               | integration        | lúc mở chỉ IT Admin; quá hạn báo trưởng phòng mới                                                            | xanh                                                                                                                                                                   |
| dòng 13 trước ngày (`US-03-08` AC-1)                           | ghi điều chuyển người giữ hai tài khoản                                      | integration        | IT Admin phụ trách một thông báo, `accountCount` 2, không định danh tài khoản                                | xanh                                                                                                                                                                   |
| dòng 13 tới ngày (`US-03-08` AC-5)                             | nghỉ đột ngột; một tài khoản đã chỉ định người mới; chạy hai lần             | integration        | một thông báo cho tài khoản còn lại                                                                          | xanh                                                                                                                                                                   |
| dòng 13 không IT Admin                                         | phòng sở hữu không có IT Admin phụ trách                                     | integration        | không ai nhận, nhắc nội bộ vẫn ghi                                                                           | xanh                                                                                                                                                                   |
| dòng 38                                                        | `K1` nghỉ đột ngột `UNTIL_PAID_END`; `CUT`; nguồn `MANAGER_NOT_NEEDED`       | integration        | chỉ ca đầu báo IT Admin, `accessUntil` = ngày hết kỳ                                                         | xanh                                                                                                                                                                   |
| US-07-02 AC-1, US-07-04 AC-6, AC-13                            | người yêu cầu nhận có quyền / thất bại không mã lỗi                          | integration có sẵn | `REQUEST_GRANTED`, `REQUEST_FAILED` (`requestId`, `contact`)                                                 | `test/integration/audit/request-status-projection.integration-spec.ts`, `test/integration/requests/request-status-notifications.integration-spec.ts` — xanh (chạy lại) |
| bảng mã đóng                                                   | mỗi mã mới nhận đúng khóa; khóa lạ bị từ chối                                | unit               | `inbox.policy.spec.ts`, `licensing-alerts.policy.spec.ts`                                                    | xanh                                                                                                                                                                   |
| US-07-04 AC-3, AC-12                                           | lỗi xác thực / thu lại lời mời                                               | —                  | blocked B1, B2                                                                                               | chưa chạy                                                                                                                                                              |

## Definition of Done

- [x] Vế hộp thông báo của primary AC (trừ AC bị chặn) có test đỏ-trước/xanh-sau ở cấp phù hợp; vế `partial` ghi đúng.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối: đã chạy trong phiên làm việc (xem plan), phải chạy lại trên cây tích hợp.
- [x] Spec/plan phản ánh implementation; không đổi HTTP/OpenAPI.
- [x] Không tăng legacy ledger kiến trúc.
- [x] Tài liệu vận hành (`docs/rules/security-jobs.md`, module card) cập nhật.

## Changes and acceptance

31/10/2026: lập từ khung `g4-notification-delivery` (A-03, F58, `RA-06`), re-pin `FR-5.14`/`US-12-15` Docs `726219a`; bỏ
bộ chuẩn retired; tách dòng 17 và 26 thành blocker G7. Chưa Owner review, chưa nghiệm thu.
