# Spec: xử lý tác vụ cấp/thu hồi thất bại: thử lại, làm tay, đóng thất bại (`US-07-04`)

- Phụ trách: AI theo giao việc Owner (lập bản đồ phân rã 20/10/2026; thiết kế và triển khai 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `57b1e1c`.
- Nhóm roadmap: G4 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Tác vụ lỗi được phân loại; lỗi vĩnh viễn hoặc hết lượt thử vào hàng đợi lỗi và IT Admin chọn thử lại, chuyển làm tay kèm bằng chứng hoặc đóng thất bại kèm lý do; seat vẫn bị chiếm và quyền vẫn còn khi thu hồi lỗi.

## Sizing decision

- Container: G4 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: Tác vụ lỗi được phân loại; lỗi vĩnh viễn hoặc hết lượt thử vào hàng đợi lỗi và IT Admin chọn thử lại, chuyển làm tay kèm bằng chứng hoặc đóng thất bại kèm lý do; seat vẫn bị chiếm và quyền vẫn còn khi thu hồi lỗi.
- Boundaries: Vòng đời `provisioning_tasks` (lỗi, số lần thử, quyết định); giá trị `PROVISIONING_RETRY_COUNT`, `INVITATION_*` từ tham số vận hành; route quyết định cho IT Admin.
- Not larger: Thông báo, Request, cam kết ngân sách, bảng điều khiển mục nợ thuộc các hạng mục sibling.
- Not smaller: Phân loại lỗi và ba quyết định là một máy trạng thái.
- Siblings: `g4-request-and-transfer-integration`, `g4-notification-delivery`, `g3-downstream-finance-integration`.
- Scope map: [G4](../../../roadmap.md#work-item-decomposition-g4).

## Primary Story/AC

| Story    | AC                    | Coverage | Phần còn lại thuộc                                                                                                                                        |
| -------- | --------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-07-04 | AC-1→AC-3, AC-6→AC-14 | partial  | AC-3, AC-6, AC-12, AC-13: `g4-notification-delivery`; AC-4, AC-6, AC-12: `g4-request-and-transfer-integration`; AC-5: `g3-downstream-finance-integration` |

Phần `partial`, nói rõ vế đã làm và vế còn lại:

- AC-3: làm vế _không thử lại, tác vụ lỗi, IT Admin quyết như lỗi vĩnh viễn_ và ghi loại lỗi `AUTHENTICATION` kèm sự kiện Audit Trail để thông báo đọc; vế _Super Admin được báo_ thuộc `g4-notification-delivery`.
- AC-6 và AC-12: làm vế _tác vụ đóng thất bại, Assignment của lệnh cấp thành `Thất bại` và nhả seat_. Vế _Request `Thất bại`, khoản cam kết `Đã giải phóng`_ thuộc `g4-request-and-transfer-integration` (chưa có Request, cam kết); vế _người yêu cầu được báo_ thuộc `g4-notification-delivery`. Sự kiện đóng mang `requestId` để hai hạng mục đó nối vào. AC-12 còn một vế của connector (thu lại lời mời tại nhà cung cấp, `US-07-03`, G7): ở đây chỉ làm kết cục đóng thất bại của tác vụ lỗi.
- AC-13: làm vế _IT thấy lỗi gần nhất và số lần đã thử_; vế _thông báo tiếng Việt không mã lỗi_ thuộc `g4-notification-delivery`.
- AC-4 (hết hạn mức → nhánh mua thêm) và AC-5 (mục nợ ở bảng điều khiển) không nằm trong hạng mục này: ghi loại lỗi `QUOTA_EXCEEDED` và thời điểm lỗi để hai hạng mục kia dùng.

Thử lại tự động **không có kẻ thực thi** ở lát này (không có connector, `US-07-03` ở G7): ở đây có hàm ghi lỗi do connector gọi (`ProvisioningService.recordFailure`), chính sách phân loại và lịch thử lại; test đóng vai connector bằng cách gọi hàm đó.

## Supporting references

`FR-2.5`, `QĐ-62i`, `QĐ-62j`, `QĐ-27`, `BR-12.*`, `OQ-D-01`, `F-12`; `US-07-01` AC-5, AC-6; `US-07-02` AC-6; `US-07-05` (thu hồi, G6) cho loại tác vụ thu hồi.

## Explicit out of scope

Tạo lời mời và đối soát (`US-07-03`); bàn giao khi thu hồi (`US-07-09`); tạo tác vụ thu hồi (`US-07-05`, G6); thông báo; Request, cam kết ngân sách; bảng điều khiển mục nợ.

## Dependencies and blockers

`g4-provisioning-queue-manual` (bảng và vòng đời tác vụ), `g2-operating-parameters` (`PROVISIONING_RETRY_COUNT`). Không blocker cho phần làm ở đây.

## Ownership: module, data, API

- Module `licensing`: capability `provisioning/` (`failure.policy.ts` + spec thuần: phân loại lỗi, lịch thử lại, quyết định hiện có; `provisioning-failure.service.ts`: ghi lỗi của connector (facade `LicensingService.recordProvisioningFailure`); `provisioning-decision.service.ts`: ba quyết định của IT Admin; `provisioning-task-frame.service.ts` (khung chung: khóa tác vụ, quy tắc tự thực thi, audit) và `provisioning-task-view.service.ts` (thẻ việc) tách khỏi `ProvisioningService`; `provisioning-tasks.controller.ts` thêm ba route; `provisioning.policy.ts` mở rộng bảng chuyển trạng thái); `AssignmentService.closeFailed`; lỗi vào `licensing.errors.ts`, kiểu vào `licensing.types.ts`.
- Module `operating-parameters`: chỉ đọc `PROVISIONING_RETRY_COUNT` qua `OperatingParametersService.getValue`.
- Dữ liệu: cột mới của `provisioning_tasks` và `license_assignments` (xem _Dữ liệu và migration_).
- API (ba operation mới, tổng 130): `POST /provisioning-tasks/{id}/retry` (`provisioningTaskRetry`), `POST /provisioning-tasks/{id}/hand-off` (`provisioningTaskHandOff`), `POST /provisioning-tasks/{id}/close-failed` (`provisioningTaskCloseFailed`) — chỉ `IT_ADMIN`.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                             | Kết luận                                                                                                                                                                                                                                                                                                                                                                                | Nguồn / loại                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Loại lỗi                                        | `TRANSIENT` (tạm thời), `PERMANENT` (vĩnh viễn: ví dụ _email đã tồn tại_), `AUTHENTICATION` (kết nối hết hạn), `QUOTA_EXCEEDED` (nhà cung cấp báo vượt số license), `NOT_DONE` (IT Admin ghi _không làm được_ ở kênh thủ công). Chỉ `TRANSIENT` được thử lại tự động; mọi loại khác vào hàng đợi lỗi ngay                                                                               | `F-12`; US-07-04 bảng dòng 1→4         |
| Thử lại tự động và hết lượt                     | Lỗi `TRANSIENT` ở lần thứ _k_ (`attempts = k`): nếu `k ≤ N` (`N = PROVISIONING_RETRY_COUNT`, mặc định 3, đọc lúc ghi lỗi) ⟹ trạng thái `RETRY_SCHEDULED` với `nextRetryAt = now + giãn cách(k)`; nếu `k > N` ⟹ coi như lỗi vĩnh viễn: `FAILED`, không thử lại nữa. Thẻ hiện `attempts`/`maxAttempts` (`maxAttempts = N + 1`: một lần đầu và `N` lần thử lại)                            | AC-1, AC-7; `OQ-A-05` (Owner xác nhận) |
| Giãn cách tăng dần                              | `giãn cách(k) = min(5 × 2^(k−1), 240)` phút (5, 10, 20, 40, …, tối đa 4 giờ); hằng số của policy, Owner xác nhận khi review                                                                                                                                                                                                                                                             | AC-1 ("chốt ở thiết kế kỹ thuật")      |
| Không có kẻ thực thi tự động                    | Không tiến trình nào chuyển `RETRY_SCHEDULED` về chạy (cần connector, G7), không tiến trình nào tự chuyển làm tay hay tự đóng theo thời gian: `FAILED` quá 30 ngày vẫn là `FAILED` (kiểm bằng cách lùi `failed_at`)                                                                                                                                                                     | AC-9; `BR-12.*`                        |
| Ba quyết định của IT Admin trên tác vụ `FAILED` | **Thử lại** (`retry`): về `QUEUED` cùng kênh, xóa lỗi, đặt `attempts = 0`, seat vẫn chiếm; **chuyển làm tay** (`hand-off`, chỉ tác vụ `CONNECTOR`): sang kênh `MANUAL`, `QUEUED`, kèm bằng chứng bắt buộc; **đóng thất bại** (`close-failed`): `CLOSED_FAILED`, lý do bắt buộc. Quyết định chỉ làm được trên `FAILED`; trạng thái khác ⟹ 409. Không bước nào tạo hay đổi bước phê duyệt | AC-8, AC-9, AC-10, AC-14; `QĐ-27`      |
| Đóng thất bại một tác vụ cấp                    | Tác vụ `CLOSED_FAILED` (cuối, bất biến); Assignment của lệnh cấp thành `Thất bại`: có `failed_at`, kết thúc ngay ngày bắt đầu (khoảng rỗng) nên **không còn chiếm seat** ở bất kỳ ngày nào và không ai bị tính là đã được cấp; Assignment cũ nguyên văn về mọi cột khác và vẫn nằm trong lịch sử. Người đó có thể được cấp lại về sau bằng Assignment mới (`US-07-01` AC-6)             | AC-6, AC-12; `US-07-01` AC-6           |
| Đóng thất bại một tác vụ thu hồi                | Tác vụ `CLOSED_FAILED`, Assignment **vẫn hiệu lực**, không đổi gì, seat chưa trống; "lãng phí" (`G2`) vẫn hiện vì Assignment còn mở. Tác vụ thu hồi do `US-07-05` (G6) tạo; lát này giá trị `REVOKE` có trong `kind` và quyết định hiểu nó, test dựng tác vụ thu hồi bằng SQL                                                                                                           | AC-11                                  |
| Cái gì còn lại cho Request                      | Không có Request nào để đổi trạng thái, không khoản cam kết nào để giải phóng, không thông báo nào để gửi: sự kiện Audit Trail `PROVISIONING_TASK.CLOSED_FAILED` mang `requestId`, loại tác vụ và lý do để các hạng mục đó đọc. Không báo _Thất bại_ cho tới khi IT đóng (lỗi vĩnh viễn **chưa** là kết cục cuối)                                                                       | AC-2, AC-6; US-07-04 bảng dòng 2       |
| Lỗi gần nhất                                    | Thẻ hiện `lastError` (chi tiết kỹ thuật cho IT), `failureKind`, `attempts`; mã kỹ thuật chỉ ở chi tiết mở rộng này, không ở lý do đóng gửi người dùng cuối (không có thông báo ở lát này)                                                                                                                                                                                               | AC-13                                  |
| Quyền                                           | Ba route `IT_ADMIN` (Finance, Người duyệt chi, Super Admin, trưởng phòng, Employee ⟹ 403, tác vụ nguyên). Hàm ghi lỗi của connector không có route HTTP: nó là hợp đồng nội bộ của module, tác nhân `SYSTEM` trong Audit Trail                                                                                                                                                          | AC-14; `SoD-*`                         |
| IT Admin là người thụ hưởng                     | Ba quyết định áp quy tắc `QĐ-77m` như `claim`, `complete`: không tự quyết cho mình khi còn IT Admin khác dùng được; chỉ còn một thì được làm và Audit Trail gắn `selfExecuted`                                                                                                                                                                                                          | `US-01-05` AC-12                       |
| Báo lỗi tay (`report-failure`) của lát trước    | Từ nay ghi loại `NOT_DONE`; tác vụ vào `FAILED` và đi theo ba quyết định trên. Hai kết quả cũ (thẻ, seat vẫn chiếm) không đổi                                                                                                                                                                                                                                                           | US-07-02 AC-6                          |

## Behavior and design

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-F1 | `failure.policy.ts` thuần: `retryDelayMinutes(attempt)`, `classifyFailure({ kind, attempts, retryCount })` ⟹ `RETRY_SCHEDULED` kèm độ trễ hoặc `FAILED`, `availableDecisions(status, channel)`, `assertDecidable(status)`, `cleanHandOffEvidence`, `cleanCloseReason`; không I/O                                           |
| T-F2 | Ghi lỗi của connector và ba quyết định là mỗi cái một `TransactionRunner.run` khóa hàng tác vụ `FOR UPDATE` (và, khi đóng lệnh cấp, Assignment của nó sau thuê bao như mọi người ghi seat), ghi cột, audit cùng giao dịch                                                                                                  |
| T-F3 | `AssignmentService.closeFailed(tx, actor, assignmentId, requestId)` đặt `failed_at` và `valid_until = valid_from` một lần; CSDL cho phép đúng bước này (CHECK `failed_at ⟹ valid_until = valid_from`, trigger bất biến cho phép chuyển `failed_at` từ null sang giá trị khi Assignment đang mở), từ chối mọi thay đổi khác |
| T-F4 | Tác vụ `CLOSED_FAILED` bất biến như `COMPLETED` (trigger `55000`); CHECK trạng thái ⟺ cột mở rộng cho sáu trạng thái; `FAILED` có `failure_kind`, `failed_at`, lý do; `failed_by` chỉ bắt buộc ở kênh thủ công (lỗi của connector do hệ thống ghi)                                                                         |

### HTTP contract

Lỗi chung: 401, 403 `AUTHORIZATION.FORBIDDEN` (cả `PROVISIONING.ANOTHER_IT_ADMIN_NEEDED`), 404 `PROVISIONING_TASK.NOT_FOUND`, 409 `PROVISIONING_TASK.NOT_FAILED` (tác vụ không ở `FAILED`), 422 `VALIDATION_ERROR`, 503. Thẻ việc thêm: `failureKind | null`, `attempts`, `maxAttempts`, `nextRetryAt | null`, `lastError | null`, `availableDecisions: ('RETRY' | 'HAND_OFF' | 'CLOSE_FAILED')[]`, `handedOffBy | null`, `handedOffAt | null`, `handOffEvidence | null`, `closedBy | null`, `closedAt | null`, `closeReason | null`; `status` thêm `RETRY_SCHEDULED`, `CLOSED_FAILED`; `kind` thêm `REVOKE`.

| Operation (operationId)                                                                     | Thành công                                         | Lỗi riêng                                                                                                         |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POST /provisioning-tasks/{id}/retry` (`provisioningTaskRetry`)                             | 200 `PROVISIONING_TASK.RETRY_REQUESTED` `{ task }` | 404; 409 `NOT_FAILED`; 403 `ANOTHER_IT_ADMIN_NEEDED`                                                              |
| `POST /provisioning-tasks/{id}/hand-off` (`provisioningTaskHandOff`) — `{ evidence }`       | 200 `PROVISIONING_TASK.HANDED_OFF` `{ task }`      | 404; 409 `NOT_FAILED`, `ALREADY_MANUAL`; 403 `ANOTHER_IT_ADMIN_NEEDED`; 422 `PROVISIONING_TASK.EVIDENCE_REQUIRED` |
| `POST /provisioning-tasks/{id}/close-failed` (`provisioningTaskCloseFailed`) — `{ reason }` | 200 `PROVISIONING_TASK.CLOSED_FAILED` `{ task }`   | 404; 409 `NOT_FAILED`; 403 `ANOTHER_IT_ADMIN_NEEDED`; 422 `PROVISIONING_TASK.REASON_REQUIRED`                     |

### Dữ liệu và migration

Hai migration: `20261020230000_licensing_provisioning_failure_values` (chỉ thêm giá trị enum, vì giá trị mới không dùng được trong giao dịch thêm nó) và `20261020230100_licensing_provisioning_failure_handling` (cột, ràng buộc, trigger). Enum `ProvisioningTaskKind` thêm `REVOKE`; enum `ProvisioningTaskStatus` thêm `RETRY_SCHEDULED`, `CLOSED_FAILED`; enum mới `ProvisioningFailureKind`; cột mới của `provisioning_tasks`: `failure_kind`, `attempts` (mặc định 0), `last_error`, `next_retry_at`, `closed_by_app_user_id`, `closed_at`, `close_reason`, `handed_off_by_app_user_id`, `handed_off_at`, `hand_off_evidence`; dòng `FAILED` cũ được điền `NOT_DONE`; CHECK trạng thái ⟺ cột thay bằng bản sáu trạng thái; trigger bất biến thêm `CLOSED_FAILED`. `license_assignments`: cột `failed_at`, CHECK `failed_at IS NULL OR valid_until = valid_from`, `license_assignments_period_order` cho phép khoảng rỗng khi `failed_at` có giá trị, trigger bất biến cho phép đặt `failed_at` một lần.

### Audit và bảo mật

`PROVISIONING_TASK.FAILURE_RECORDED` (tác nhân `SYSTEM`; loại lỗi, số lần, lịch thử lại hay chuyển `FAILED`), `PROVISIONING_TASK.RETRY_REQUESTED`, `PROVISIONING_TASK.HANDED_OFF` (không chép bằng chứng vào Audit Trail), `PROVISIONING_TASK.CLOSED_FAILED` (lý do, `requestId`, loại tác vụ), `LICENSE_ASSIGNMENT.FAILED`. `lastError` và bằng chứng nằm trên tác vụ, không vào Audit Trail; không trường mật khẩu ở bất kỳ DTO nào.

## Test matrix

| AC / rủi ro    | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                                  | Cấp test                   | Kết quả mong đợi                                        | Bằng chứng sau implement |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------- | ------------------------ |
| US-07-04 AC-1  | Connector ghi lỗi `TRANSIENT` lần 1 ⟹ `RETRY_SCHEDULED`, `attempts = 1`, `maxAttempts = 4`, `nextRetryAt` sau 5 phút; lần 2 sau 10 phút; Assignment và seat nguyên                                                                   | policy + HTTP + PostgreSQL | tự thử lại, giãn cách tăng dần, hiện k/tối đa           | chờ chạy                 |
| US-07-04 AC-2  | Lỗi `PERMANENT` (email đã tồn tại) ⟹ `FAILED`, không `nextRetryAt`, `availableDecisions` đủ, Assignment còn mở, seat chiếm, không `CLOSED_FAILED`, không sự kiện đóng                                                                | policy + HTTP + PostgreSQL | IT có việc cần quyết, chưa là kết cục cuối              | chờ chạy                 |
| US-07-04 AC-3  | Lỗi `AUTHENTICATION` ⟹ `FAILED`, không thử lại, loại lỗi ghi lại và có trong Audit Trail                                                                                                                                             | policy + HTTP + PostgreSQL | không thử lại; thông báo Super Admin ở lát khác         | chờ chạy                 |
| US-07-04 AC-6  | `FAILED` cấp: `close-failed` kèm lý do ⟹ tác vụ `CLOSED_FAILED`, Assignment có `failed_at` và không còn chiếm seat (seat trống tăng 1), cột khác nguyên, sự kiện đóng mang `requestId`; sau đó cấp lại cho người đó được             | HTTP + PostgreSQL          | Assignment `Thất bại`, seat nhả (vế Request ở lát khác) | chờ chạy                 |
| US-07-04 AC-7  | Lỗi `TRANSIENT` lần `N + 1` (N đặt 2 bằng tham số) ⟹ `FAILED`, không `nextRetryAt`; đổi tham số thì lần quyết định kế tiếp theo giá trị mới                                                                                          | policy + HTTP + PostgreSQL | hết lượt xử lý như vĩnh viễn                            | chờ chạy                 |
| US-07-04 AC-8  | `retry` trên `FAILED` ⟹ `QUEUED` cùng kênh, lỗi và `attempts` về 0, seat vẫn chiếm, Audit Trail ghi lựa chọn và người chọn                                                                                                           | HTTP + PostgreSQL          | quay lại hàng đợi cùng kênh                             | chờ chạy                 |
| US-07-04 AC-9  | Tác vụ `CONNECTOR` `FAILED` lùi `failed_at` 30 ngày vẫn `FAILED`; `hand-off` kèm bằng chứng ⟹ kênh `MANUAL`, `QUEUED`, hoàn tất được theo `US-07-02`; thiếu bằng chứng ⟹ 422; tác vụ đã `MANUAL` ⟹ 409 `ALREADY_MANUAL`              | HTTP + PostgreSQL          | không tự chuyển; chuyển tay có bằng chứng               | chờ chạy                 |
| US-07-04 AC-10 | `close-failed` thiếu lý do, toàn khoảng trắng ⟹ 422, tác vụ và Assignment không đổi                                                                                                                                                  | policy + HTTP              | không đóng được                                         | chờ chạy                 |
| US-07-04 AC-11 | Tác vụ thu hồi `FAILED` (dựng bằng SQL): Assignment còn hiệu lực, seat chưa trống; `close-failed` kèm lý do ⟹ tác vụ `CLOSED_FAILED`, Assignment vẫn hiệu lực, không `failed_at`, `seat-usage` và công cụ phòng vẫn tính             | HTTP + PostgreSQL          | quyền còn, lãng phí còn hiện                            | chờ chạy                 |
| US-07-04 AC-12 | Kết cục đóng thất bại như AC-6 cho lệnh cấp của lời mời không được chấp nhận (vế thu lại lời mời ở G7)                                                                                                                               | HTTP + PostgreSQL          | seat được nhả (vế connector, Request, thông báo để sau) | chờ chạy                 |
| US-07-04 AC-13 | Thẻ tác vụ lỗi hiện `lastError`, `failureKind`, `attempts`; sự kiện Audit Trail không chứa `lastError`                                                                                                                               | HTTP                       | IT thấy lỗi gần nhất, số lần thử                        | chờ chạy                 |
| US-07-04 AC-14 | Finance, Người duyệt chi, Super Admin, trưởng phòng, Employee gọi ba route ⟹ 403, tác vụ không đổi; quyết định không tạo hay đổi bước phê duyệt nào (không bảng phê duyệt nào ghi)                                                   | e2e + HTTP                 | chỉ IT Admin quyết                                      | chờ chạy                 |
| Trạng thái     | `retry`, `hand-off`, `close-failed` trên `QUEUED`, `IN_PROGRESS`, `COMPLETED`, `CLOSED_FAILED`, `RETRY_SCHEDULED` ⟹ 409 `NOT_FAILED`; `claim`, `complete`, `report-failure` trên tác vụ mới `CLOSED_FAILED`, `RETRY_SCHEDULED` ⟹ 409 | policy + HTTP              | máy trạng thái đúng                                     | chờ chạy                 |
| QĐ-77m         | IT Admin là người thụ hưởng không tự `retry` hay `close-failed` khi còn IT Admin khác dùng được; chỉ còn một ⟹ được làm, `selfExecuted = true`                                                                                       | HTTP                       | quy tắc tự thực thi                                     | chờ chạy                 |
| Đồng thời      | Hai `close-failed` cùng lúc ⟹ một 200 một 409; `close-failed` đồng thời với `retry` ⟹ một thắng, trạng thái cuối nhất quán, Assignment chỉ `Thất bại` khi đóng thắng                                                                 | HTTP + PostgreSQL          | khóa hàng tác vụ                                        | chờ chạy                 |
| Dữ liệu        | CHECK trạng thái ⟺ cột sáu trạng thái; `CLOSED_FAILED` và `COMPLETED` bất biến; Assignment `failed_at` ⟹ khoảng rỗng, không sửa lại; khoảng rỗng không chiếm seat và không va chạm `INV-02`                                          | constraints                | CSDL giữ bất biến                                       | chờ chạy                 |
| Hợp đồng       | `api-inventory`: ba operation mới có summary, 401/403/404/409/422/503, message riêng; manifest cập nhật                                                                                                                              | e2e                        | 130 operation                                           | chờ chạy                 |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: thiết kế `ready`. Quyết định cần Owner xác nhận khi review: phân loại năm loại lỗi và chỉ `TRANSIENT` tự thử lại; giãn cách `min(5 × 2^(k−1), 240)` phút; `maxAttempts = N + 1` với `N = PROVISIONING_RETRY_COUNT`; `retry` đặt lại số lần thử về 0; `hand-off` chỉ cho tác vụ connector và bắt buộc bằng chứng; Assignment `Thất bại` là khoảng rỗng có `failed_at` (không xóa, không chiếm seat); tác vụ thu hồi đóng thất bại không đụng Assignment; vế Request, cam kết, thông báo, thu lại lời mời ở connector chưa làm (hạng mục khác). Chưa code, chưa review, chưa nghiệm thu.
