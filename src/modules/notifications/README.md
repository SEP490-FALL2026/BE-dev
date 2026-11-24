# notifications

Mục đích: hai kênh báo tin — email qua outbox giao dịch (worker gửi sau commit) và hộp thư trong ứng dụng
(`/notifications*`), kể cả thông báo giữ lại cho phòng ban chưa có trưởng. Story chính: US-05-15 (hộp thư, mục
`g5-request-status-notifications` của roadmap), `FR-3.11`; mail mời, đặt lại mật khẩu, báo đổi mật khẩu (`PASSWORD_CHANGED_NOTICE`) và báo đổi email đăng nhập (`LOGIN_EMAIL_CHANGED_NOTICE`, gửi cả địa chỉ cũ và mới) của identity-access.

Tầng: T1 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: không module nghiệp vụ nào
(`infrastructure/database`, `infrastructure/mail`). Được dùng bởi: budgets, data-import, identity-access, licensing,
organization, personnel, requests ([module-graph](../../../docs/generated/module-graph.md)); worker
`worker/email-dispatch.job.ts`.

## Public API (`public/`)

- `NotificationsApi` ([public/notifications.api.ts](public/notifications.api.ts)):
  - `enqueueEmail(tx, input)` — ghi mail vào outbox trong `tx` của bên gọi; không gửi ở đây.
  - `notifyInApp(tx, input)` — ghi thông báo trong ứng dụng; `false` khi người nhận đã có thông báo cùng event key.
  - `holdForDepartment(tx, input)` — giữ thông báo cho phòng ban chưa có trưởng (F67, T-11).
  - `deliverHeldToHead(tx, input)` — giao mọi thông báo đang giữ cho trưởng phòng đầu tiên, một lần.
  - `cancelPendingForTokens(tx, hashes)`, `deliveryStates(hashes)` — hủy mail chưa gửi / đọc trạng thái gửi theo token.
- `EmailDeliveryApi` ([public/email-delivery.api.ts](public/email-delivery.api.ts)): `dispatchDue(isUsable)` — gửi
  một lô outbox đến hạn; chỉ vòng mail của worker gọi.
- `public/notifications.types.ts` — `EmailTemplate`, `IN_APP_NOTIFICATION_CODES` (bảng mã đóng; hai nhóm cuối là cảnh báo license
  của `a03-license-inbox-alerts` và mười mã `SUBSCRIPTION_*` của gia hạn thuê bao ở `a06-*`: `SUBSCRIPTION_RENEWAL_ALERT`,
  `_RENEWAL_RED_ALERT`, `_RENEWAL_KEPT`, `_RENEWAL_DATA_QUALITY`, `_RENEWAL_PROPOSED`, `_RENEWAL_DECIDED`, `_RENEWAL_LATE`,
  `_RENEWAL_OUTCOME_RECORDED`, `_AUTO_RENEWAL_INCIDENT`, `_EXPIRY_MARKED`; chỉ id, mã và ngày, khóa nằm trong `PARAM_KEYS_BY_CODE`; mã cũ
  `SUBSCRIPTION_BUSINESS_OWNER_LEFT` không ghi mới nhưng dòng đã lưu vẫn đọc được — `QĐ-111g`), `TokenUsability`.
  - Tám mã của `FR-3.21`/`FR-2.15`/`SBF-07a`/`SBF-08`/`US-09-04` (khóa ở `PARAM_KEYS_BY_CODE`, chỉ id, mã, ngày, nguồn và số đếm; không nội dung người viết, định danh tài
    khoản hay số tiền), mỗi mã một người nhận cố định và `eventKey` riêng:
    - `SPEND_BATCH_SUBMITTED` (`batchId, departmentId, sentCount`; subject `SPEND_BATCH`) — Người duyệt chi giữ bước vừa mở, một thông báo cho mỗi lô và người
      (`requests/spend-submission/spend-batch-recorder.service.ts`; `eventKey SPEND_BATCH_SUBMITTED:{batchId}`).
    - `SAAS_ISSUE_SUBMITTED` (`issueId, issueCode, category, impact, applicationId`), `SAAS_ISSUE_RESPONSE_OVERDUE` (`issueId, issueCode, responseDueOn`),
      `SAAS_ISSUE_STATE_CHANGED` (`issueId, issueCode, fromState, toState, trigger`; subject `SAAS_ISSUE`) — IT Admin được giao khi gửi và khi quá hạn phản hồi; bên
      còn lại khi đổi trạng thái (người báo hoặc IT Admin theo `trigger`) (`licensing/saas-issue/saas-issue-notifier.service.ts`).
    - `OUT_OF_PROCESS_CASE_REPORTED` (`caseId, applicationId, vendorId, employeeId`; subject `OUT_OF_PROCESS_CASE`) — người dùng và trưởng phòng hôm nay của phòng họ khi ca
      đóng `REPORT_ONLY`; `VENDOR_ACCOUNT_DISCREPANCY_OPENED` (`applicationId, vendorId, source, newCount`; không subject) — IT Admin phụ trách ứng dụng, không thì mọi IT Admin
      dùng được (`usage/vendor-account-review/vendor-account-review-notifier.service.ts`).
    - `DEVICE_STOP_REQUESTED`, `DEVICE_STOP_REQUEST_OVERDUE` (`stopRequestId, registrationId, deviceId, holderEmployeeId, dueAt, dueOn`; subject `DEVICE_STOP_REQUEST`) — IT Admin
      phụ trách phòng của người giữ, không thì mọi IT Admin dùng được, không bao giờ chính người giữ (`devices/stop-request/stop-request-notifier.service.ts`).
    - `UNPLACED_WORK_WAITING` (`workKind, workId, employeeId`; đích `unplacedWorkDesignationList`) — Super Admin khi có việc của người chưa từng xếp phòng chưa có IT Admin xử lý; `UNPLACED_WORK_DESIGNATED` (`designationId, workKind, workId, employeeId`; subject `UNPLACED_WORK_DESIGNATION`; đích `unplacedWorkDesignationList`) — IT Admin được chỉ định (`organization/unplaced-work-designation/unplaced-work-designation.service.ts`).
  - `STEP_ASSIGNED` (`requestId, stepKind, cause`) có thêm hai giá trị `cause`: `RESUBMITTED` (người gửi gửi lại sau _Trả về_, báo người giữ bước mở lại) và `SPEND_SENT` (bước duyệt chi
    mở khi trưởng phòng xác nhận dự phòng riêng, ngoài lô).
- `public/notifications.errors.ts` — `InvalidInAppNotificationError`.
- `NotificationsModule` export thêm `InboxService`, chỉ cho `NotificationsHttpModule` của chính module.

## Bảng sở hữu

- `email_outbox`, `in_app_notifications`, `held_department_notifications`
  ([prisma/models/notifications.prisma](../../../prisma/models/notifications.prisma)).

## Extension point

- Mở: `notifications.name-sources` — `NotificationNameContributions` ([public/notifications.extension-points.ts](public/notifications.extension-points.ts)),
  mỗi bên đăng ký là một `NotificationNameSource` (`kinds` + `names(kind, ids)` → `Map<id, tên hiển thị>`; id không có thì vắng, không ném).
  Cũng ở đó: kiểu `NameKind` (bảy loại tên một câu thông báo có thể gọi). Provider nằm ở `NotificationsModule` (mọi graph: API, worker, CLI).
- Đăng ký vào: không có ở module này. Bên đăng ký của điểm mở trên: `organization` (EMPLOYEE, DEPARTMENT, COST_CENTER; `organization-http.module.ts`),
  `catalog` và `requests` (làm ở N5b; xem README hai module).
  "Link còn dùng được không" là tham số `TokenUsability` của `dispatchDue`: worker truyền
  `IdentityAccessApi.isActionLinkUsable`, nên module không đọc bảng của identity-access.

## Capability → file chính

- `inbox/` — hộp thư: `inbox.controller.ts` (`GET /notifications`, `GET /notifications/unread-count`,
  `POST /notifications/read-all`, `POST /notifications/{id}/read`) → `inbox.service.ts`; `inbox.policy.ts` (mã đóng,
  khóa tham số theo mã, khóa cấm); `held-notification.service.ts` (thông báo giữ cho phòng chưa có trưởng).
- Outbox email (gốc module): `notifications.repo.ts`, `email-dispatcher.service.ts` (worker gửi),
  `payload-cipher.service.ts` (mã hóa payload), `email-templates.mapper.ts` (dựng nội dung mail).
- Nest: `notifications.module.ts` (mọi graph), `notifications-http.module.ts` (chỉ API mount, chỉ `InboxController`).

## Bất biến quan trọng

- Mail và thông báo được ghi trong `tx` của thay đổi nghiệp vụ, rollback thì không còn; việc gửi qua mạng chạy sau
  commit, ngoài transaction (ADR-0012, `EmailDispatcher`).
- Dispatcher lấy dòng bằng `FOR UPDATE SKIP LOCKED` dưới lease 60 s, nên hai dispatcher không lấy chung một dòng; thử
  tối đa 5 lần, backoff 30 s → 15 phút (`email-dispatcher.service.ts`, `notifications.repo.ts`).
- Payload mail mã hóa AES-256-GCM; id dòng outbox và id khóa là dữ liệu xác thực, nên ciphertext chép sang dòng khác
  không mở được (`payload-cipher.service.ts`).
- Một thông báo cho mỗi (người nhận, event key): `@@unique([recipientEmployeeId, eventKey])`; chỉ `read_at` đổi, một
  lần; không xóa.
- Thông báo chỉ là mã của bảng đóng và tham số phẳng trong danh sách khóa của mã; khóa giống bí mật bị từ chối, tối đa
  4 096 byte (`refuseInAppNotification` trong `inbox.policy.ts`).
- Route hộp thư lấy người gọi từ session, không từ tham số: không ai đọc hộp thư của người khác, kể cả Super Admin.

## Test

- Unit: `src/modules/notifications/**/*.spec.ts`; integration: `test/integration/notifications/`.
- HTTP: chưa có thư mục `test/http/notifications/`.
