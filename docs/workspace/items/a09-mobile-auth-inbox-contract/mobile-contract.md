# Hợp đồng BE cho ứng dụng Mobile (EP-16) — bàn giao A-09

Tài liệu cho dev Mobile. Nguồn: [spec A-09](spec.md), Docs `d6d868c`, BE `6eb12d1`. Mọi ví dụ lấy từ lượt chạy test trên
PostgreSQL thật ngày 31/10/2026, đã thay id, token và `requestId` bằng chỗ giữ chỗ; response đầy đủ nằm ở
`openapi.json` (theo `operationId` bên dưới), không chép lại ở đây.

_Mở rộng 31/10/2026 bởi A-07 ([spec](../a07-mobile-employee-flow/spec.md)) và A-08 ([spec](../a08-mobile-approver-flows/spec.md))
trên cùng BE `6eb12d1` + cây chưa commit đã có A-01, A-02: mục 4–6 cập nhật trạng thái và bằng chứng, mục 7 thêm chuỗi
duyệt, mục 9 thêm chuỗi API, ví dụ, dữ liệu test và danh sách operation app không gọi. Chủ của từng dòng: A-07 (`US-16-01`),
A-08 (`US-16-02`, `US-16-03`), A-09 (phần còn lại)._

## 0. Giới hạn của tài liệu này

- Đây là hợp đồng và bằng chứng **phía BE**. Không có bằng chứng nào ở đây cho ứng dụng native, màn hình, trải nghiệm
  mất mạng/offline, hay việc ứng dụng ẩn đúng các chức năng chỉ có trên web: dev Mobile kiểm riêng khi có build.
- Không có push, không token/định danh thiết bị, không biometrics, không tải tệp, không hàng đợi offline (`OOS-09`,
  `QĐ-61c`, `QĐ-61d`). BE cũng không có route hay bảng cho các thứ đó (test quét schema).
- Không có endpoint riêng cho Mobile. Mọi thứ dưới đây là route của web; **BE không đọc nhãn kênh** (`User-Agent`,
  `X-Client`…): một client tự xưng "web" hay "mobile" nhận cùng một câu trả lời, và không có nhãn nào mở hay đóng một
  route. Hạn chế màn hình của Mobile do app tự thực hiện.
- Dòng _pending_ nghĩa là operation chưa có ở cây hiện tại; chủ ghi bên cạnh (B-02, B-03, B-10). Đừng đoán tên route
  cho tới khi chủ chốt contract.

## 1. Quy ước chung

Base `/api/v1`. Thành công: `{ "success": true, "message": "<MÃ>", "data": … }`. Lỗi:
`{ "success": false, "error": { "code": "<MÃ>", "message": "…", "requestId": "…", "details"?: … } }`. Không có cookie;
header `Authorization: Bearer <accessToken>` cho mọi route trừ ba route `auth` công khai. Thời hạn: access token mặc định
600 giây, phiên không hoạt động 8 giờ, tuyệt đối 7 ngày (cấu hình được): đọc `expiresAt`/`refreshExpiresAt` trong
response, đừng gán cứng.

| HTTP | `error.code`                                                                | Khi nào                                                                                       | App làm gì                                                      |
| ---- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 401  | `AUTHENTICATION_REQUIRED`                                                   | Không có header Bearer                                                                        | Về màn đăng nhập                                                |
| 401  | `INVALID_ACCESS_TOKEN`                                                      | Token hỏng/hết hạn, phiên bị thu hồi, tài khoản bị khóa, chưa kích hoạt, nhân viên đã nghỉ    | Thử `refresh` một lần; nếu `refresh` cũng 401 thì đăng nhập lại |
| 401  | `AUTH.INVALID_CREDENTIALS`                                                  | Đăng nhập sai vì **bất kỳ** lý do nào (email lạ, sai mật khẩu, khóa, chưa kích hoạt, đã nghỉ) | Một thông báo chung; không tiết lộ lý do                        |
| 401  | `AUTH.SESSION_INVALID`                                                      | Refresh token lạ, đã dùng, hết hạn hoặc phiên đã kết thúc                                     | Đăng nhập lại                                                   |
| 429  | `AUTH.LOGIN_TEMPORARILY_BLOCKED`                                            | Quá nhiều lần sai cho một email; `details.retryAfterSeconds`                                  | Hiện thời gian chờ                                              |
| 403  | `AUTHORIZATION.FORBIDDEN`                                                   | Route đòi vai mà tài khoản không có                                                           | Không nên xảy ra nếu ẩn màn theo vai; hiện lỗi chung            |
| 404  | `ACCESS_REQUEST.NOT_FOUND`, `NOTIFICATION.NOT_FOUND`                        | Không tồn tại **hoặc** người gọi không có phần trong đối tượng (không phân biệt)              | Hiện "không tìm thấy"                                           |
| 409  | mã nghiệp vụ (xem các mục dưới)                                             | Trạng thái đã đổi (bước đã quyết ở web, Request đã rút…)                                      | Tải lại màn và hiện lý do                                       |
| 422  | `VALIDATION_ERROR`                                                          | Body/query sai; `details.issues[].path`                                                       | Hiện lỗi theo trường                                            |
| 503  | `AUTH.UNAVAILABLE`, `TOKEN_VERIFICATION_UNAVAILABLE`, `SERVICE_UNAVAILABLE` | Cơ sở dữ liệu tạm không sẵn sàng                                                              | Báo thử lại; **không** coi là đăng xuất                         |

```json
// POST /auth/login → 401 (cùng một thân cho mọi lý do)
{ "success": false, "error": { "code": "AUTH.INVALID_CREDENTIALS", "message": "The email or password is not valid.", "requestId": "<uuid>" } }
// POST /auth/refresh → 401
{ "success": false, "error": { "code": "AUTH.SESSION_INVALID", "message": "The session is not valid. Sign in again.", "requestId": "<uuid>" } }
// GET /me không token → 401
{ "success": false, "error": { "code": "AUTHENTICATION_REQUIRED", "message": "A Bearer access token is required.", "requestId": "<uuid>" } }
// token của tài khoản vừa bị khóa → 401, ở thao tác kế tiếp
{ "success": false, "error": { "code": "INVALID_ACCESS_TOKEN", "message": "The access token is invalid.", "requestId": "<uuid>" } }
// route theo vai → 403
{ "success": false, "error": { "code": "AUTHORIZATION.FORBIDDEN", "message": "You do not have permission to perform this action.", "requestId": "<uuid>" } }
// thiếu trường → 422
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed.", "details": { "issues": [{ "code": "invalid_type", "path": "businessReason" }] }, "requestId": "<uuid>" } }
```

**Hiện thao tác thất bại, không lưu tạm.** Khi mất mạng hay nhận 5xx, app báo lỗi và để người dùng thao tác lại từ đầu
(`US-16-04` AC-4). BE không có hàng đợi gửi sau và không có khóa idempotency cho client; app không được tự gửi lại một
thao tác ghi sau khi nhận kết quả không rõ mà không cho người dùng xem lại trạng thái (đọc lại đối tượng trước).

## 2. Chọn màn theo vai

Đọc `GET /me` ngay sau đăng nhập và sau mỗi lần làm mới; **vai lấy từ `data.roles.effective`**, không suy từ email hay từ
việc server từ chối:

```json
{
  "success": true,
  "message": "ME.RETRIEVED",
  "data": {
    "appUserId": "<uuid>",
    "loginEmail": "e1@acme.vn",
    "employee": {
      "id": "<uuid>",
      "employeeCode": "E1",
      "fullName": "…",
      "department": { "code": "P-DES", "name": "…" },
      "jobTitle": "…"
    },
    "roles": { "direct": ["EMPLOYEE"], "derived": [], "effective": ["EMPLOYEE"] },
    "selfServiceOnly": false
  }
}
```

| Màn trên Mobile                                                     | Điều kiện hiện                       | Ghi chú đã kiểm chứng                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Hộp thông báo, hồ sơ, đổi mật khẩu, đăng xuất                       | mọi tài khoản đăng nhập được         | Kể cả `selfServiceOnly: true` (không có vai nào): inbox và `/me` vẫn mở                                      |
| Phần mềm của tôi, Yêu cầu của tôi, Tạo yêu cầu (`US-16-01`)         | `effective` có `EMPLOYEE`            | IT Admin, Finance, Super Admin **không tự có** `EMPLOYEE`; vai cộng dồn, không kế thừa                       |
| Duyệt bước nhu cầu (`US-16-02`)                                     | `effective` có `MANAGER`             | `MANAGER` suy ra khi đang là trưởng phòng (không phải vai gán); hết giai đoạn thì biến mất ở lần gọi kế tiếp |
| Duyệt bước chi và nhu cầu của Request trưởng phòng gửi (`US-16-03`) | `effective` có `SPENDING_APPROVER`   | Suy ra từ cấu hình Người duyệt chi; mất ở lần gọi kế tiếp khi cấu hình đổi                                   |
| (không có trên mobile)                                              | `IT_ADMIN`, `FINANCE`, `SUPER_ADMIN` | Các vai này chỉ có inbox và `/me` trên mobile; BE vẫn trả lời route web của họ theo vai, app không gọi chúng |

`selfServiceOnly` chỉ là "không có vai nào"; một IT Admin không có `EMPLOYEE` có `selfServiceOnly: false` nhưng vẫn không
được hiện màn Employee. **Lưu ý `DEF-A09-01`**: hiện BE chưa từ chối `POST /access-requests` của tài khoản không có
`EMPLOYEE` (xem [spec](spec.md#behavior-and-design)); app phải tự ẩn màn theo bảng trên cho tới khi Owner chốt.

## 3. `US-16-04` — đăng nhập và hộp thông báo (đã có, đã kiểm chứng)

| AC / việc                          | Operation (`operationId`)                                                | Trạng thái | Bằng chứng BE                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 đăng nhập                     | `POST /auth/login` (`authLogin`)                                         | có         | `mobile-session-roles`: cùng wire cho hai nhãn kênh; mọi lỗi đăng nhập cùng một thân 401; body chỉ nhận email và mật khẩu         |
| AC-1 giữ phiên                     | `POST /auth/refresh` (`authRefresh`), `POST /auth/logout` (`authLogout`) | có         | `mobile-session-roles`, `smoke`: refresh token dùng một lần và xoay vòng; logout 204 rồi refresh/access đều 401                   |
| AC-1/AC-6 vai hiệu lực             | `GET /me` (`meGet`)                                                      | có         | `mobile-session-roles`: vai gán ∪ suy ra, đọc lại mỗi request                                                                     |
| AC-2 hộp thông báo                 | `GET /notifications` (`notificationList`)                                | có         | `mobile-inbox-isolation`: chỉ thông báo của người gọi, mới nhất trước, lọc `unreadOnly`, `pageSize` tối đa 50                     |
| AC-2 số chưa đọc                   | `GET /notifications/unread-count` (`notificationUnreadCount`)            | có         | như trên; không bị đổi bởi người khác đọc                                                                                         |
| AC-2 đã đọc                        | `POST /notifications/{id}/read`, `POST /notifications/read-all`          | có         | `mobile-inbox-isolation`: của người khác 404 `NOTIFICATION.NOT_FOUND` kể cả Super Admin; đã đọc ghi một lần, gọi lại trả y nguyên |
| AC-2 cảnh báo quyền sắp hết        | `GET /notifications` (sự kiện `LICENSE_EXPIRY_REMINDER` vào inbox)       | có         | A-03 (`a03-license-inbox-alerts`): thông báo `LICENSE_EXPIRY_REMINDER`, test `license-expiry-inbox.integration-spec.ts`           |
| AC-3 không push, không token       | —                                                                        | đã kiểm    | không bảng/cột token đẩy, thiết bị, kênh ở tài khoản, phiên, inbox, outbox; `deviceToken`/`channel` ở body login bị 422           |
| AC-5, AC-6 vai                     | `GET /me` + mọi route theo vai                                           | có         | ma trận vai × route và các ca đổi vai ở `mobile-session-roles`                                                                    |
| AC-4 mất mạng, AC-7 biometrics/tệp | —                                                                        | client     | Hành vi app native: không có bằng chứng BE; dev Mobile kiểm                                                                       |

```json
// POST /auth/login → 200  (refreshToken chỉ trong body; không cookie)
{ "success": true, "message": "AUTH.LOGGED_IN", "data": {
  "accessToken": "<jwt>", "tokenType": "Bearer", "expiresAt": "2026-10-31T05:30:42.000Z",
  "refreshToken": "<43 ký tự base64url>", "refreshExpiresAt": "2026-11-07T05:20:42.000Z" } }
// POST /auth/refresh body {"refreshToken":"…"} → 200 AUTH.SESSION_REFRESHED, cùng dạng; refresh token cũ hết hiệu lực
// POST /auth/logout body {"refreshToken":"…"} → 204, idempotent; cần refresh token trong body, Bearer một mình không đủ
// GET /notifications?pageSize=20&unreadOnly=true → 200
{ "success": true, "message": "NOTIFICATION.LISTED", "data": {
  "items": [ { "id": "<uuid>", "code": "STEP_ASSIGNED",
               "subject": { "type": "ACCESS_REQUEST", "id": "<uuid>" },
               "params": { "requestId": "<uuid>", "stepKind": "NEED", "cause": "SUBMITTED" },
               "createdAt": "2026-10-31T05:20:44.030Z", "readAt": null } ],
  "pagination": { "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1 } } }
// GET /notifications/unread-count → 200 { "message": "NOTIFICATION.UNREAD_COUNTED", "data": { "unread": 2 } }
// POST /notifications/{id}/read → 200 NOTIFICATION.READ  { "data": { "notification": { …, "readAt": "2026-10-31T05:20:44.201Z" } } }
// id của người khác hoặc không có → 404 NOTIFICATION.NOT_FOUND; id không phải uuid → 422 VALIDATION_ERROR
```

Thông báo **không có câu chữ**: app dựng câu từ `code`, `subject` và `params` (chỉ id, mã, lý do người liên quan đã
thấy; không số tiền, không bí mật — test quét khóa). Mã app cần xử lý ở ba tác vụ còn lại: người yêu cầu nhận
`REQUEST_SUBMITTED`, `REQUEST_NEED_APPROVED`, `REQUEST_REJECTED`, `REQUEST_SPEND_APPROVED`, `REQUEST_GRANTED`,
`REQUEST_FAILED`, `REQUEST_WITHDRAWN`, `REQUEST_CANCELLED`; người giữ bước nhận `STEP_ASSIGNED`,
`STEP_CLOSED_BY_WITHDRAWAL`, `STEP_SLA_REMINDER`. Inbox còn chứa mã của các vai khác (hồ sơ nhân sự, ngân sách, IT…)
chỉ tới người nhận đó; bấm vào một thông báo mà đối tượng chỉ có trên web là câu hỏi mở `OQ-G-14` của dev Mobile/Owner.
Trạng thái đã đọc đã có (`readAt`), nên `OQ-F-16` chỉ còn phần gom cảnh báo lặp.

## 4. `US-16-01` — Employee

Chủ: A-07. Test: `emp` = `test/integration/requests/mobile-employee-requests.integration-spec.ts`, `smoke` (mục 7).

| AC                               | Operation                                                                                                                             | Trạng thái | Chủ / ghi chú                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-1 Phần mềm của tôi            | `GET /me/software-rights?view=current\|ended` (`meSoftwareRightList`)                                                                 | có         | A-02 (vai `EMPLOYEE`; K1→K5, ngày hết hạn, `expiringSoon`; không tiền, không khóa K4). `emp`: chỉ quyền của người gọi, không khóa tiền. Không dùng `GET /saas-issues/options` hay `GET /license-assignments` (chỉ IT Admin)                                                                                                    |
| AC-2 Yêu cầu của tôi (danh sách) | —                                                                                                                                     | pending    | **B-03**. Yêu cầu contract: [b03-my-requests-requirement.md](../a07-mobile-employee-flow/b03-my-requests-requirement.md). `GET /access-requests/drafts` chỉ liệt kê **bản nháp** (`emp`: Request đã gửi không có ở đó)                                                                                                         |
| AC-2 chi tiết một Request        | `GET /access-requests/{id}` (`accessRequestGet`)                                                                                      | có         | `emp`: `PENDING` + `needStep.assignee` (đang chờ ai), `COMPLETED`, `REJECTED` + `needDecision.reason`; trạng thái là enum của web (`US-05-15`)                                                                                                                                                                                 |
| AC-3 chỉ dữ liệu của mình        | như trên, và `POST …/withdraw`                                                                                                        | có         | `emp`, `smoke`: đồng nghiệp cùng phòng mở/rút bằng đường dẫn trực tiếp → 404 `ACCESS_REQUEST.NOT_FOUND`, thân lỗi không có id của chủ                                                                                                                                                                                          |
| AC-4/AC-5 chọn phần mềm/gói      | `GET /requestable-applications[/{id}]`, `GET /requestable-plans[/{id}]` (`requestableApplicationList/Get`, `requestablePlanList/Get`) | có         | A-01. `emp`: gói trả phí `price.status = PRICED`; không trường bộ chuẩn. **Không dùng** `GET /applications`, `GET /plans` (IT Admin/Finance)                                                                                                                                                                                   |
| AC-5 xem trước                   | `POST /access-requests/preview` (`accessRequestPreview`)                                                                              | có         | `emp`: preview từ nhãn mobile bằng preview từ nhãn web; `chain[]`, `totalExpectedWorkingDays`, `pricing`, `costEstimate`; đã có quyền → `canSubmit: false`, `existingAccess`                                                                                                                                                   |
| AC-4/AC-5/AC-8 gửi               | `POST /access-requests` (`accessRequestSubmit`)                                                                                       | có         | Body `planId`, `termMonths`, `businessReason` (bắt buộc, trống/khoảng trắng → 422), tùy chọn `projectLabel`, `expectedSpendOn`; 409 `ACCESS_REQUEST.ALREADY_HOLDS_ACCESS` (`details.assignment`), 409 `FINANCE.SETUP_INCOMPLETE`. `emp`: nhánh/chuỗi/SLA/Audit giống web; paid (`PAID_IN_CATALOG`) và nội bộ (`INTERNAL_FREE`) |
| AC-6 rút                         | `POST /access-requests/{id}/withdraw` (`accessRequestWithdraw`), body `{ "reason"?: … }`                                              | có         | `emp`: rút → `WITHDRAWN`, người giữ bước có `STEP_CLOSED_BY_WITHDRAWAL`; người ngoài 404; trưởng phòng 403 `NOT_REQUESTER`; 409 `GRANT_RUNNING` (đang thực thi), `GRANT_COMPLETED` + `details.assignmentId` (app hướng sang hoàn trả trên web), `ALREADY_ENDED`                                                                |
| AC-7, AC-8 không có trên mobile  | —                                                                                                                                     | client     | BE vẫn có route nhóm, gia hạn, hoàn trả, đề xuất phần mềm mới cho web và **không chặn theo kênh**; danh sách app không gọi ở mục 9                                                                                                                                                                                             |

Cách tìm trạng thái hiện hành của một Request khi chưa có danh sách (B-03): đọc `GET /access-requests/{id}` theo `id` lấy từ
`subject.id` của thông báo trong inbox hoặc từ response gửi. Đây là cách nối tạm, không thay cho B-03.

## 5. `US-16-02` — trưởng phòng duyệt bước nhu cầu

Chủ: A-08. Test: `need` = `test/integration/requests/mobile-need-decision.integration-spec.ts`, `journey` (mục 7).

| AC                                      | Operation                                                                                                                                                     | Trạng thái | Chủ / ghi chú                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-3 hàng đợi chỉ phòng mình            | —                                                                                                                                                             | pending    | **B-02** (theo người giữ hiện hành, không theo phòng). Yêu cầu: [b02-b10](../a08-mobile-approver-flows/b02-b10-approval-queue-requirement.md). Tạm: `STEP_ASSIGNED` với `params.stepKind = "NEED"` trong inbox (`journey`). Vế ranh giới: trưởng phòng phòng khác → 404 (`need`)                                                                                                                                                                |
| AC-4 xem lý do, thời hạn, seat tương tự | `GET /access-requests/{id}` (`accessRequestGet`), `GET /access-requests/{id}/similar-seats` (`accessRequestSimilarSeatList`)                                  | có         | `need`: lý do, `termMonths`, giá; không có cờ _ngoài bộ chuẩn_                                                                                                                                                                                                                                                                                                                                                                                  |
| AC-9 dòng kế hoạch                      | `GET /access-requests/{id}/plan-line-suggestions` (`accessRequestPlanLineSuggestionList`), `PUT /access-requests/{id}/plan-line` (`accessRequestPlanLineSet`) | có         | Chỉ vai `MANAGER`; `need`: dòng `suggested`, `overdue`, không `remaining`/`held`/mã kiểm ngân sách. Chọn dòng ngay trong `need-decision` (`spend`), không cần `PUT` riêng                                                                                                                                                                                                                                                                       |
| AC-1/AC-2/AC-4/AC-5/AC-8 quyết          | `POST /access-requests/{id}/need-decision` (`accessRequestNeedDecide`)                                                                                        | có         | Body `{ "decision": "APPROVE" \| "REJECT", "reason"?, "termConfirmation"?: { "reason" }, "spend"?: { "planLine": { "position", "stillNeeded"? } \| "offPlan": true, "expectedSpendOn"? } }`. `need`: thiếu dòng → 422 `PLAN_LINE_REQUIRED`; từ chối thiếu lý do → 422; > 12 tháng → 422 `TERM_CONFIRMATION_REQUIRED`; tự gửi → 403 `OWN_REQUEST`; bản ghi `approval_records` (người, vai `MANAGER`, phòng, thời điểm, lý do) không sửa/xóa được |
| AC-6 màn cũ, đổi người giữ bước         | cùng operation                                                                                                                                                | có         | `need`: đã quyết trên web / đã rút → 409 `ACCESS_REQUEST.STEP_NOT_PENDING`, một bản ghi; trưởng phòng phòng khác, hết nhiệm kỳ → 404; web + mobile cùng lúc → đúng một 200                                                                                                                                                                                                                                                                      |
| AC-7 chỉ một tác vụ                     | —                                                                                                                                                             | client     | Route gửi thay, nhóm, rà soát điều chuyển… vẫn có cho web (mục 9)                                                                                                                                                                                                                                                                                                                                                                               |
| Mở rộng sang approver dự phòng          | —                                                                                                                                                             | mở         | `OQ-G-12`                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 6. `US-16-03` — Người duyệt chi

Chủ: A-08. Test: `spend` = `test/integration/requests/mobile-spend-approval.integration-spec.ts`, `journey`.

| AC                                                                 | Operation                                                                                                                                                    | Trạng thái | Chủ / ghi chú                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 hàng đợi bước duyệt chi                                       | `GET /spend-approvals` (`spendApprovalList`)                                                                                                                 | có         | Chỉ bước chi, cũ nhất trước; mục chờ Finance rà soát không có (`spend`)                                                                                                                                                                                                                                              |
| AC-4 hàng đợi chung với bước nhu cầu                               | `GET /spend-approvals` + list bước nhu cầu của B-02                                                                                                          | pending    | **B-02/B-10**. Quyết định A-08: **hai list, app gộp theo `openedAt`** — lý do và trường cần có ở [b02-b10](../a08-mobile-approver-flows/b02-b10-approval-queue-requirement.md). `spend`: R9 ở bước nhu cầu không có trong `/spend-approvals`                                                                         |
| AC-1 snapshot chỉ đọc                                              | `GET /access-requests/{id}/spend-approval` (`spendApprovalGet`), `GET …/budget-check` (`budgetCheckGet`), `GET …/budget-check/years` (`budgetCheckYearList`) | có         | `spend`: nhu cầu do trưởng phòng xác nhận, ngân sách/đã chi/giữ/còn lại/đang chờ của năm, `ranAt` = thời điểm dữ liệu; năm không có ngân sách → `NO_ACTIVE_BUDGET` với số `null`, không 0; không route sửa snapshot                                                                                                  |
| AC-2, AC-9 duyệt/từ chối bước chi                                  | `POST /access-requests/{id}/spend-approval` (`spendApprovalDecide`)                                                                                          | có         | Body strict `{ "decision", "reason"?, "override"?: { "reason", "years": [..] } }` (trường lạ → 422). `spend`: duyệt → bản ghi + `spend_decisions.check_id` + 1 cam kết HELD; từ chối thiếu lý do → 422; vượt còn lại → 422 `SPEND.OVERRIDE_REQUIRED` (`details.years`); chưa có bước chi → 409 `SPEND.NO_SPEND_STEP` |
| AC-4 bước nhu cầu của Request trưởng phòng tự gửi                  | `POST /access-requests/{id}/need-decision`                                                                                                                   | có (quyết) | `spend`, `journey`: vai quyết `SPENDING_APPROVER`, sau đó bước chi cùng người; hai bản ghi riêng, `samePersonAsSpend`/`same_person_as_spend` ở cả hai bước                                                                                                                                                           |
| AC-3, AC-6 người không phải Người duyệt chi, tự duyệt              | cùng các operation                                                                                                                                           | có         | `spend`: Finance/trưởng phòng/IT Admin → 403 `SPEND.NOT_THE_ASSIGNEE`, Employee → 403 `SPEND.OWN_REQUEST`; Request của chính Người duyệt chi → bước chi ở người thay thế, Người duyệt chi 404 khi đọc, 403 `OWN_REQUEST` khi quyết                                                                                   |
| AC-7 màn cũ                                                        | cùng các operation                                                                                                                                           | có         | `spend`: đã quyết trên web / Employee đã rút → 409 `SPEND.NO_SPEND_STEP`, không bản ghi/cam kết thứ hai; đổi Người duyệt chi → 403 `SPEND.NOT_THE_ASSIGNEE`; web + mobile cùng lúc → đúng một 200                                                                                                                    |
| AC-5, AC-8 không quyết gia hạn, không hỏi Finance, không hàng loạt | —                                                                                                                                                            | client     | `POST /spend-batches/{id}/decisions` (quyết cả lô) và hỏi Finance tồn tại cho web: **app không gọi**, BE không chặn theo kênh (mục 9). Quyết gia hạn/hợp thức hóa chưa có ở BE (`OQ-G-15`)                                                                                                                           |

## 7. Chuỗi smoke và cách chạy

`test/e2e/mobile-channel-smoke.e2e-spec.ts` (A-09, bước 2 mở rộng bởi A-07) chạy trên HTTP và PostgreSQL thật, mọi client
gửi nhãn mobile:

1. Employee đăng nhập (`/auth/login`), `/me` có `EMPLOYEE`.
2. **Danh sách**: `GET /me/software-rights` (rỗng), `GET /access-requests/drafts` (rỗng), `GET /requestable-plans` có gói,
   `GET /requestable-plans/{id}`. _Danh sách Yêu cầu của tôi vẫn pending (B-03)._
3. **Hành động**: `POST /access-requests/preview` rồi `POST /access-requests` → `PENDING`, bước nhu cầu giao cho trưởng phòng.
4. **Inbox**: Employee có `REQUEST_SUBMITTED`; trưởng phòng có `STEP_ASSIGNED`; đồng nghiệp và IT Admin không có gì về Request đó; người
   ngoài mở Request → 404.
5. Trưởng phòng `need-decision` → Employee nhận `REQUEST_NEED_APPROVED`; đánh dấu đã đọc một lần, người khác 404.
6. Employee gửi rồi **rút** Request thứ hai; trưởng phòng nhận `STEP_CLOSED_BY_WITHDRAWAL`.
7. Khóa tài khoản → thao tác kế tiếp 401 và `refresh` 401; trưởng phòng đăng xuất → access/refresh đều 401.

`test/e2e/mobile-approver-journey.e2e-spec.ts` (A-08): Employee gửi Request trả phí từ điện thoại → trưởng phòng mở từ
`STEP_ASSIGNED`, đọc dòng kế hoạch, duyệt với dòng gợi ý → trưởng phòng trình lô **trên web** → Người duyệt chi thấy trong
`/spend-approvals`, đọc chi tiết và snapshot, duyệt **từng mục** → một cam kết, Employee nhận `REQUEST_SPEND_APPROVED` →
trưởng phòng tự gửi R9: bước nhu cầu ở Người duyệt chi (trưởng phòng 403), Người duyệt chi quyết nhu cầu rồi quyết chi, hai
bản ghi.

```bash
export TEST_DATABASE_ADMIN_URL='postgresql://ci_integration:ci-integration-only@127.0.0.1:<cổng>/postgres'   # PostgreSQL test riêng, role thường CREATEDB
pnpm exec jest --config ./test/config/jest.e2e.cjs --runInBand test/e2e/mobile-
pnpm exec jest --config ./test/config/jest.integration.cjs test/integration/identity-access/mobile-session test/integration/notifications/mobile-inbox test/integration/requests/mobile-
```

Khi B-02, B-03 có route, bước 2 của smoke và bước "mở từ `STEP_ASSIGNED`" của `journey` đổi sang gọi route thật; mở rộng hai
chuỗi này, không viết chuỗi thứ ba.

## 8. Việc còn mở (không chặn app bắt đầu với phần đã có)

- **`DEF-A09-01`** route Employee của `requests` chưa đòi `EMPLOYEE` (Owner chốt điều kiện, B-10 sửa).
- Pending: B-03 Yêu cầu của tôi ([yêu cầu](../a07-mobile-employee-flow/b03-my-requests-requirement.md)); B-02 hàng đợi bước
  nhu cầu và B-10 trường gộp hai list ([yêu cầu](../a08-mobile-approver-flows/b02-b10-approval-queue-requirement.md)). Cảnh báo
  license vào inbox (A-03) đã có: `LICENSE_EXPIRY_REMINDER` và năm mã khác của nhóm đó đọc qua `GET /notifications`.
- Câu hỏi mở của nguồn: `OQ-G-11` (Audit ghi kênh hay không), `OQ-G-12`, `OQ-G-13`, `OQ-G-14`, `OQ-G-15`, `OQ-A-20` (kích hoạt,
  quên, đổi mật khẩu trên mobile: route công khai đã có nhưng chưa có nguồn cho phép trên mobile), `OQ-F-16`; của A-08:
  `Q-A08-01` (Request nhóm), `Q-A08-02` (bước nhu cầu của Request gia hạn quyền) trên Mobile.
- Chưa kiểm chứng: ứng dụng native, offline UX, hành vi khi bấm thông báo cho đối tượng chỉ có trên web, hiệu năng trên mạng di
  động.

## 9. Chuỗi API, ví dụ, dữ liệu test và operation app không gọi (A-07, A-08)

**Chuỗi của từng vai** (base `/api/v1`; mọi bước sau đăng nhập kèm Bearer; đọc lại đối tượng sau mọi 409 trước khi cho bấm lại):

| Vai             | Chuỗi                                                                                                                                                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee        | `GET /me` → `GET /me/software-rights` → (Yêu cầu của tôi: B-03; tạm `GET /notifications` → `GET /access-requests/{id}`) → `GET /requestable-applications` → `GET /requestable-plans?applicationId=` → `POST /access-requests/preview` → `POST /access-requests` → `POST /access-requests/{id}/withdraw`                       |
| Trưởng phòng    | `GET /me` (`MANAGER`) → (hàng đợi: B-02; tạm `STEP_ASSIGNED` `stepKind=NEED`) → `GET /access-requests/{id}` → `GET …/similar-seats` → `GET …/plan-line-suggestions` (Request trả phí) → `POST …/need-decision`                                                                                                                |
| Người duyệt chi | `GET /me` (`SPENDING_APPROVER`) → `GET /spend-approvals` (+ list nhu cầu của B-02 khi có) → `GET …/spend-approval` → `GET …/budget-check` → `GET …/budget-check/years` → (`GET …/finance-review` nếu Finance đã rà soát) → `POST …/spend-approval`; bước nhu cầu của R9: `GET /access-requests/{id}` → `POST …/need-decision` |

**Ví dụ đã làm sạch** (mã và trạng thái từ lượt chạy test 31/10/2026; `message` lỗi lấy từ ví dụ của `openapi.json`; app rẽ
nhánh theo `code`, không theo `message`; `"…"` là phần rút gọn, dạng đầy đủ ở `openapi.json`; số ngày trong `chain` là ví dụ):

```json
// POST /access-requests/preview {"planId":"<plan>","termMonths":1} → 200 (rút gọn)
{ "success": true, "data": { "preview": {
  "branch": "PAID_IN_CATALOG", "canSubmit": true, "existingAccess": null,
  "pricing": { "status": "PRICED", "amount": { "amount": "1000000", "currency": "VND" }, "…": "…" },
  "chain": [ { "sequence": 1, "kind": "NEED", "role": "MANAGER", "assignee": { "employeeId": "<uuid>", "employeeCode": "DES-H1", "fullName": "…" }, "explanation": "DEPARTMENT_HEAD", "…": "…" },
             { "kind": "SPEND_SUBMISSION", "…": "…" }, { "kind": "SPEND_APPROVAL", "…": "…" }, { "kind": "IT_EXECUTION", "…": "…" } ],
  "possibleExtraSteps": [ { "kind": "FINANCE_REVIEW", "beforeStep": "SPEND_APPROVAL" } ], "totalExpectedWorkingDays": 8 } } }
// POST /access-requests khi đã có quyền → 409
{ "success": false, "error": { "code": "ACCESS_REQUEST.ALREADY_HOLDS_ACCESS", "message": "The person already holds access to the plan.",
  "details": { "assignment": { "assignmentId": "<uuid>", "effectiveFrom": "2026-10-31", "validUntil": null } }, "requestId": "<uuid>" } }
// POST /access-requests/{id}/withdraw khi task cấp đã xong → 409 (app hướng sang hoàn trả trên web)
{ "success": false, "error": { "code": "ACCESS_REQUEST.GRANT_COMPLETED", "message": "The request cannot be withdrawn: GRANT_COMPLETED.", "details": { "assignmentId": "<uuid>" }, "requestId": "<uuid>" } }
// POST /access-requests/{id}/need-decision {"decision":"APPROVE","spend":{"planLine":{"position":1}}} → 200 (rút gọn)
{ "success": true, "message": "ACCESS_REQUEST.NEED_DECIDED", "data": { "request": { "state": "AWAITING_SPEND_SUBMISSION", "planLineAttached": true,
  "needDecision": { "decision": "APPROVED", "deciderRole": "MANAGER", "decidedBy": { "employeeId": "<uuid>", "employeeCode": "DES-H1", "fullName": "…" }, "reason": null, "termConfirmationReason": null, "decidedAt": "<iso>" } } } }
// màn cũ: bước đã quyết trên web hoặc Request đã rút → 409
{ "success": false, "error": { "code": "ACCESS_REQUEST.STEP_NOT_PENDING", "message": "The need step cannot be decided: STEP_NOT_PENDING.", "requestId": "<uuid>" } }
// GET /access-requests/{id}/budget-check/years → 200 (một năm, rút gọn)
{ "items": [ { "year": 2026, "code": "BUDGET_OK", "budget": { "amount": "100000000", "currency": "VND" }, "spent": { "amount": "40000000", "currency": "VND" },
  "held": { "amount": "20000000", "currency": "VND" }, "remaining": { "amount": "40000000", "currency": "VND" }, "pending": { "amount": "15000000", "currency": "VND" }, "…": "…" } ] }
// năm chưa có ngân sách: "code": "NO_ACTIVE_BUDGET", "budget": null, "remaining": null — app hiện "Chưa có ngân sách", không hiện 0
// POST /access-requests/{id}/spend-approval {"decision":"APPROVE"} khi vượt phần còn lại → 422
{ "success": false, "error": { "code": "SPEND.OVERRIDE_REQUIRED", "message": "The spend step cannot be decided: OVERRIDE_REQUIRED.", "details": { "years": [2026] }, "requestId": "<uuid>" } }
// màn cũ ở bước chi (đã quyết trên web, Request đã rút, hoặc đang chờ Finance) → 409
{ "success": false, "error": { "code": "SPEND.NO_SPEND_STEP", "message": "The spend step cannot be decided: NO_SPEND_STEP.", "requestId": "<uuid>" } }
// người không giữ bước (Finance, trưởng phòng, IT Admin, Người duyệt chi cũ) → 403 SPEND.NOT_THE_ASSIGNEE; người yêu cầu → 403 SPEND.OWN_REQUEST
```

**Dữ liệu test** (dựng bằng harness, PostgreSQL riêng, không PII): phòng `P-DES` có Unit Cost Center và trưởng phòng; Employee
có vai `EMPLOYEE`; phòng `P-ENG` với trưởng phòng riêng; `P-EXE` của Người duyệt chi `EXE-C1`, người thay thế `SBS-S1`,
approver dự phòng `FB-R1`; một gói trả phí 1 000 000 VND/seat/tháng của subscription phòng sở hữu, thuế GTGT 10 % được khấu
trừ; một gói nội bộ K5; ngân sách năm hiện hành 100tr, giữ 20tr, đã chi 40tr (và một dòng kế hoạch _Figma Organization 10
seats_ tháng 12); Request 10tr, 15tr (đang chờ), 45tr (vượt phần còn lại), 30tr (Cost Center chưa có ngân sách).

**Operation app không gọi** (có cho web, BE không chặn theo kênh — `QĐ-61b`, `QĐ-66o`, `US-16-01` AC-7, `US-16-02` AC-7,
`US-16-03` AC-5, AC-8):

| Nhóm                                 | Operation                                                                                                                                                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee: ngoài "yêu cầu đơn giản"   | `POST /access-requests/proposals` (đề xuất phần mềm mới), `POST /access-requests/renewals` (gia hạn), các route `return-requests` (hoàn trả), các route `access-requests/drafts` (không lưu tạm trên Mobile), Request nhóm và service account, mọi route tải tệp |
| Trưởng phòng: ngoài bước nhu cầu     | `POST /delegated-requests` (gửi thay), các route `group-requests` (nhóm), `GET /spend-queue` và `POST /spend-batches` (trình lô), `POST …/supplements`, rà soát điều chuyển, ghost seat, bàn giao                                                                |
| Người duyệt chi: ngoài hai loại bước | `POST /spend-batches/{id}/decisions` (quyết cả lô), `POST …/budget-information-requests` (hỏi Finance), quyết phiên bản ngân sách, sửa ngân sách                                                                                                                 |
