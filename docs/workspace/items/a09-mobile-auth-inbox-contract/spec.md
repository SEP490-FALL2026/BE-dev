# Spec: A-09 — đăng nhập, phiên, hộp thông báo và bàn giao contract Mobile (`US-16-04`)

- Phụ trách: AI theo giao việc của điều phối (31/10/2026), mục A-09 của [backlog Dev A](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-A.md).
- Thiết kế ban đầu bởi: AI theo giao việc của điều phối (31/10/2026) — từ mục A-09 của backlog Dev A.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `d6d868c` (BRD v3.57, US v0.15 — `US-16-01`→`US-16-04`, `US-01-01` AC-16/AC-17, `US-01-10`, `US-05-15`, `US-12-15`), BE `6eb12d1`.
- Nhóm roadmap: G10 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md). [Hợp đồng bàn giao cho dev Mobile](mobile-contract.md). Dòng roadmap, scope map G10 và dòng items index đã có trong [roadmap](../../../roadmap.md#work-item-decomposition-g10) và [items index](../README.md).

## Business outcome

Dev Mobile có một hợp đồng BE đã được kiểm chứng trên PostgreSQL thật cho `US-16-04`: mọi vai đăng nhập, giữ phiên, làm mới,
đăng xuất và đọc hộp thông báo của chính mình bằng đúng các route và vai hiệu lực của web; tài khoản bị khóa hoặc đổi vai
bị chặn/đổi ở thao tác kế tiếp; IT Admin, Finance, Super Admin không tự có tác vụ Employee. Hạng mục không thêm hành vi
nghiệp vụ: nó xác minh, ghi bằng test và lập bảng ánh xạ bốn Story Mobile (`US-16-01`→`US-16-04`) vào operation hiện có.
Kiểm bằng ba file test mới và bảng ánh xạ ở [mobile-contract.md](mobile-contract.md).

## Sizing decision

- Container: G10 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: kênh Mobile dùng chung xác thực/phiên/vai/inbox với web và bàn giao contract bốn Story cho dev Mobile; chủ là integration/test BE cho Mobile của Dev A (A-09).
- Boundaries: không bảng, không migration, không route, không DTO mới; chỉ file test và tài liệu. Đọc qua HTTP và PostgreSQL thật các route `auth`, `me`, `notifications` và vài route của `requests` làm bước hành động của chuỗi smoke.
- Not larger: `US-16-01`→`US-16-03` cần API chưa có (chọn phần mềm/gói, Phần mềm của tôi, Yêu cầu của tôi, hàng đợi bước nhu cầu) do các hạng mục khác sở hữu; ở đây chỉ ánh xạ, không claim AC của chúng.
- Not smaller: một Story, một ranh giới (phiên + vai + inbox của người gọi); tách thêm chỉ nhân đôi dựng dữ liệu của bộ test.
- Siblings: none.
- Scope map: [G10](../../../roadmap.md#work-item-decomposition-g10).

## Primary Story/AC

| Story    | AC              | Coverage | Phần còn lại thuộc                                                                                                                                             |
| -------- | --------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-16-04 | AC-1→AC-3, AC-6 | partial  | AC-4, AC-7: không có phần BE, là hành vi của ứng dụng native của dev Mobile ([giải thích](./spec.md#explicit-out-of-scope))                                    |
| US-16-04 | AC-5            | partial  | deferred về chính `a09-mobile-auth-inbox-contract`: `DEF-A09-01` — route Employee của `requests` chưa đòi vai `EMPLOYEE`; chờ B-10 (Dev B) và quyết định Owner |

`US-16-04` AC-4 (mất mạng: không thao tác, không lưu tạm) và AC-7 (không biometrics, không tải tệp) là hành vi của ứng
dụng native; BE không có phần nào để chứng minh ngoài việc không có route/bảng tương ứng, nên chỉ ghi các bằng chứng phủ
định (không bảng token thiết bị, đăng nhập chỉ nhận email và mật khẩu) ở AC-3. Hai AC này không thuộc hạng mục BE nào: dev
Mobile kiểm trên app khi có build.

AC-2 được claim ở vế hộp thông báo: chỉ thông báo gửi cho chính mình, cùng nội dung với web, mobile không thêm loại. Việc
_phát_ cảnh báo quyền có thời hạn sắp hết vào inbox là của A-03 (`US-12-15`, `a03-license-inbox-alerts`), chưa có ở `6eb12d1`:
test A-09 dùng các thông báo `REQUEST_*`/`STEP_*` đã có. Từ khi A-03 xong, vế phát cảnh báo dựa trên
`test/integration/licensing/license-expiry-inbox.integration-spec.ts`: người giữ quyền đọc đúng một thông báo `LICENSE_EXPIRY_REMINDER`
qua `GET /api/v1/notifications` — chính route hộp thư Mobile đọc (cùng wire với web, nhãn kênh không đổi gì). A-09 không có test
riêng cho thông báo license.

## Supporting references

`QĐ-47c`, `QĐ-61a`→`QĐ-61d`, `QĐ-61h`, `FR-3.11`, `OOS-09`; `US-01-01` AC-2, AC-16, AC-17; `US-01-10` AC-3, AC-6, AC-11;
`US-05-15` AC-10; `US-12-15` AC-1, AC-16; `US-16-01`→`US-16-03` (chỉ ánh xạ operation, không claim AC); `OQ-G-11`,
`OQ-G-12`, `OQ-G-14`, `OQ-G-15`, `OQ-A-20`, `OQ-F-16`. Backlog: A-07, A-08 (hai hạng mục Mobile còn lại), A-01, A-02,
A-03, B-02, B-03, B-10 (cung cấp API còn thiếu).

## Explicit out of scope

- Mọi route, bảng, migration hoặc DTO mới; push, token/định danh thiết bị, biometrics, tải tệp, hàng đợi offline
  (`OOS-09`). Không chặn API web theo nhãn kênh do client gửi: test khẳng định nhãn không có tác dụng.
- `US-16-01`→`US-16-03`: ánh xạ ở [mobile-contract.md](mobile-contract.md); API còn thiếu thuộc A-01/A-02 (catalog, Phần mềm
  của tôi), B-03 (Yêu cầu của tôi), B-02 (hàng đợi bước nhu cầu), B-10 (bổ sung `requests`/`budgets`). Không sửa controller hay repo của
  `requests`/`budgets` ở đây.
- Cảnh báo license vào inbox (`US-12-15` dòng _quyền sắp hết_, vế phát thông báo của `US-16-04` AC-2): A-03 (đã có, xem trên).
- `US-16-04` AC-4 và AC-7: hành vi của ứng dụng native (mất mạng, biometrics, tải tệp); không phải hạng mục BE nào.
- Kích hoạt, quên, đổi mật khẩu trên mobile: `OQ-A-20`.
- Kiểm chứng ứng dụng native, màn hình, offline UX: dev Mobile; hạng mục này không claim.

## Dependencies and blockers

Không có blocker cho phần xác minh. Phụ thuộc để bảng ánh xạ hết dòng _pending_: A-01 (chọn phần mềm/gói), A-02 (Phần
mềm của tôi), A-03 (cảnh báo license), B-02 (hàng đợi nhu cầu), B-03 (Yêu cầu của tôi), B-10 (bổ sung `requests`/`budgets`).
Quyết định cần Owner/B trước khi đóng finding: [`DEF-A09-01`](#changes-and-acceptance) (route Employee chưa đòi vai
`EMPLOYEE`).

## Ownership: module, data, API

Không đổi source nên không đổi module, bảng hay operation. Test đặt theo tầng của
[test/README.md](../../../../test/README.md): integration trong `test/integration/identity-access/` và
`test/integration/notifications/`, E2E smoke trong `test/e2e/`. Chỉ dùng harness hiện có
(`StatusHarness`, `api-accounts`); không thêm file harness. Không đổi `openapi.json`, API manifest hay số operation.

## Behavior and design

Xác minh bằng đọc source ở BE `6eb12d1`:

- Một bộ route cho mọi client: `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /me`, `GET /notifications`,
  `GET /notifications/unread-count`, `POST /notifications/read-all`, `POST /notifications/{id}/read`. Không route nào đọc
  header kênh hay `User-Agent`; body đăng nhập là `strictObject` nên trường lạ (`deviceToken`, `channel`) bị 422.
- Vai hiệu lực đọc từ cơ sở dữ liệu ở mỗi request (`JwtAccessTokenVerifier`): token không mang vai; khóa tài khoản, nhân
  viên nghỉ, phiên bị thu hồi, hết hạn ngắt ở request kế tiếp; MANAGER và SPENDING_APPROVER suy ra từ dữ liệu.
- Inbox đọc theo `recipientEmployeeId` lấy từ phiên, không từ tham số; id của người khác trả 404 như id không tồn tại.
- Mọi lỗi đăng nhập là một câu `AUTH.INVALID_CREDENTIALS`; mọi lỗi làm mới là `AUTH.SESSION_INVALID`.

**Finding `DEF-A09-01` (chưa sửa, cần quyết định).** Các route Employee của `requests` (`POST /access-requests`, `POST
/access-requests/preview`, `GET /access-requests/drafts`, `POST /access-requests/{id}/withdraw`…) là `@AuthenticatedOnly()`
và chỉ từ chối Super Admin (`ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST`). Một tài khoản không có vai nào, chỉ `IT_ADMIN`
hoặc chỉ `FINANCE` gửi được Request (HTTP 201, thấy khi chạy thử 31/10/2026), trái `US-01-01` AC-16 ("mọi thao tác yêu cầu
một vai, kể cả của Employee, bị từ chối") và `US-16-04` AC-5. Spec của `g5-request-submission-and-routing` ghi đây là lựa chọn của người thiết kế, "siết bằng
một điều kiện ở `POST` nếu Owner chốt khác". Không sửa ở đây vì (1) controller/service thuộc `requests` (B-10), (2) vai
trưởng phòng gửi cho chính mình (`US-05-03` dòng 2) không có vai `EMPLOYEE` gán trực tiếp, nên điều kiện đúng cần Owner
chốt. Mặc định đã áp dụng: giữ nguyên hành vi hiện có, không test nào ghim hành vi này là đúng; test chỉ khẳng định phần
đã đúng (Super Admin bị từ chối, vai mặc định). Dev Mobile phải ẩn màn Employee theo `roles.effective` chứ không dựa
vào việc server từ chối cho tới khi finding này đóng.

## Test matrix

Cấp: `I` = integration PostgreSQL thật, `E` = E2E smoke. Tên file ngắn: `session-roles` =
`test/integration/identity-access/mobile-session-roles.integration-spec.ts`; `inbox` =
`test/integration/notifications/mobile-inbox-isolation.integration-spec.ts`; `smoke` =
`test/e2e/mobile-channel-smoke.e2e-spec.ts`.

| AC / rủi ro                        | Tình huống                                                                                                                          | Cấp | Kết quả mong đợi                                                                                                               | Bằng chứng sau implement      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| US-16-04 AC-1                      | Đăng nhập, làm mới, đăng xuất với nhãn web và nhãn mobile; hai phiên của cùng tài khoản                                             | I   | Cùng wire (`AUTH.LOGGED_IN`, năm trường), cùng vai hiệu lực; sau logout refresh 401 `AUTH.SESSION_INVALID`                     | `session-roles`, xem plan     |
| US-16-04 AC-1                      | Email không có, sai mật khẩu, tài khoản bị khóa, chưa kích hoạt, nhân viên đã nghỉ; làm mới bằng token lạ/đã tiêu/phiên đã kết thúc | I   | Cùng một câu trả lời 401, không cookie, thân giống nhau trừ `requestId`, cho cả hai nhãn                                       | `session-roles`               |
| US-16-04 AC-1                      | Body đăng nhập có `deviceToken`, `channel`, `biometric`                                                                             | I   | 422 `VALIDATION_ERROR`, không tạo phiên                                                                                        | `session-roles`               |
| US-16-04 AC-3                      | Quét `information_schema` các bảng tài khoản/phiên/inbox/outbox                                                                     | I   | Không cột hay bảng token đẩy, định danh thiết bị, kênh, user-agent                                                             | `session-roles`               |
| Không chặn web bằng nhãn kênh      | IT Admin/Finance gọi route web-only với `X-Client: mobile` và `web`                                                                 | I   | Trả lời chỉ theo vai (200/403), không theo nhãn                                                                                | `session-roles`               |
| US-16-04 AC-6; `US-01-10` AC-6     | Khóa tài khoản khi token còn hạn, rồi gọi mọi thao tác mobile (me, inbox, unread, drafts, preview, submit, read-all)                | I   | Mọi thao tác 401 `INVALID_ACCESS_TOKEN`, không ghi Request, đăng nhập 401 chung; mở khóa + đăng nhập mới vào được              | `session-roles`               |
| US-16-04 AC-6                      | Nhân viên nghỉ việc khi token còn hạn                                                                                               | I   | Thao tác kế tiếp 401                                                                                                           | `session-roles`               |
| US-16-04 AC-6; `US-01-01` AC-17    | Hết giai đoạn trưởng phòng; cấp/thu hồi `EMPLOYEE`, `IT_ADMIN`; thu hồi vai cuối; hết nhiệm vụ Người duyệt chi                      | I   | `/me` và route theo vai đổi ở lần gọi kế tiếp; trưởng phòng cũ quyết bước bị 404; vai suy ra (MANAGER, SPENDING_APPROVER) đúng | `session-roles`               |
| US-16-04 AC-5; `US-01-01` AC-16/17 | Tài khoản tạo qua API với `IT_ADMIN`, với `IT_ADMIN`+`EMPLOYEE`, không vai; Finance, Super Admin                                    | I   | Không ai tự có `EMPLOYEE`; không vai thì `selfServiceOnly`; vai cộng dồn không kế thừa                                         | `session-roles`               |
| US-16-04 AC-5                      | Super Admin gửi Request, cả hai nhãn                                                                                                | I   | 403 `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST`, không ghi Request                                                             | `session-roles`               |
| US-16-04 AC-5; role-gated          | Sáu loại tài khoản × bốn route theo vai (IT, Finance, Manager, Super Admin) + ba route tự phục vụ                                   | I   | Chỉ route của vai đang giữ là 200, còn lại 403; `/me`, inbox, unread mở cho mọi tài khoản                                      | `session-roles`               |
| US-16-04 AC-2; `US-05-15` AC-10    | Luồng thật: gửi Request rồi chiếu thông báo; alice, trưởng phòng, bob, tài khoản không vai đọc                                      | I   | Mỗi người chỉ thấy thông báo của mình; người ngoài không có thông báo của Request                                              | `inbox`                       |
| US-16-04 AC-2                      | Người khác, mọi vai và Super Admin đánh dấu đã đọc thông báo của alice                                                              | I   | 404 `NOTIFICATION.NOT_FOUND`, `read_at` vẫn rỗng                                                                               | `inbox`                       |
| US-16-04 AC-2                      | `read-all` của bob; lọc `unreadOnly`; số chưa đọc của alice và trưởng phòng                                                         | I   | Chỉ thông báo của bob đổi; số của người khác không đổi                                                                         | `inbox`                       |
| US-16-04 AC-2, AC-5                | IT Admin, Finance, trưởng phòng, tài khoản không vai, Super Admin mỗi người nhận một thông báo                                      | I   | Mỗi người thấy đúng thông báo của mình; Super Admin không thấy của người khác                                                  | `inbox`                       |
| US-16-04 AC-2, AC-6                | Thu hồi hết vai; khóa rồi mở khóa tài khoản                                                                                         | I   | Inbox theo người, không theo vai: còn nguyên sau khi mất vai; khóa → 401, mở khóa + đăng nhập mới → như cũ                     | `inbox`                       |
| US-16-04 AC-2 (`FR-3.11`)          | Quét khóa của `params` của mọi inbox                                                                                                | I   | Không khóa bí mật, không khóa số tiền/kiểm tra ngân sách                                                                       | `inbox`                       |
| US-16-04 AC-1→AC-3, AC-6 (chuỗi)   | Đăng nhập → danh sách nháp → xem trước → gửi → inbox → trưởng phòng quyết → inbox → đánh dấu đã đọc → rút → khóa → đăng xuất        | E   | Chuỗi chạy trên cùng route với web; người ngoài bị 404; khóa và đăng xuất chặn ở thao tác kế tiếp                              | `smoke`                       |
| US-16-04 AC-2 vế cảnh báo sắp hết  | Một quyền cá nhân còn 7 ngày; người giữ mở hộp thư bằng `GET /notifications`                                                        | I   | Đúng một thông báo `LICENSE_EXPIRY_REMINDER`, chưa đọc, về đúng quyền; chạy lại không báo lần hai                              | `license-expiry-inbox` (A-03) |
| US-16-04 AC-4, AC-7                | —                                                                                                                                   | —   | Hành vi của app native; không có bằng chứng BE; dev Mobile kiểm khi có build                                                   | không có                      |

## Definition of Done

- [x] Mọi primary AC `full` có test ở cấp phù hợp; AC `partial` ghi đúng vế đã làm (AC-2: vế đúng người/đúng nội dung).
- [x] Gate liên quan chạy xanh trên cây hiện tại (chi tiết và giới hạn ở bảng của [plan](plan.md)); chạy lại full integration/E2E trên cây tích hợp là việc còn lại của điều phối.
- [x] Spec/plan phản ánh implementation cuối; không đổi contract HTTP nên không có consumer FE phải báo.
- [x] Không tăng legacy ledger kiến trúc (không đổi source).
- [x] Tài liệu bàn giao Mobile viết; phần chưa kiểm chứng (client native, offline, push) ghi rõ trong [mobile-contract.md](mobile-contract.md).

## Changes and acceptance

- 31/10/2026: lập spec; worktree được căn lại về `6eb12d1` trước khi làm (worktree được tạo ở một revision cũ hơn). Chưa
  peer review, chưa Owner review, chưa nghiệm thu.
- `DEF-A09-01`: ghi ở `## Behavior and design`; chờ Owner chốt điều kiện `EMPLOYEE` cho route Employee và B-10 sửa
  controller/service của `requests`. Mặc định áp dụng: không đổi hành vi hiện có.
