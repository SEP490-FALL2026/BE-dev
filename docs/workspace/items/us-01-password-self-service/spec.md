# Spec: lát 1c — quên, đặt lại và đổi mật khẩu

- Phụ trách: AI theo giao việc Owner (triển khai 16/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (draft 14/10/2026 từ review US; hoàn thiện contract/dữ liệu trong Task 3,
  15/10/2026).
- Thiết kế: ready (15/10/2026) — đủ đầu vào để code; **không** có nghĩa Owner đã duyệt. Triển khai: **verified** local
  16/10/2026 (cây làm việc chưa commit trên `e833092`; xem [plan](plan.md)). Owner review: chưa review.
- Nguồn: Docs commit `3341ea0` = snapshot `S-2026-10-14b` ([sources](../../sources.md), hash 49/49 khớp ngày 15/10/2026).
  `US-01-10` AC-3 → AC-7, AC-9, AC-12, _Business rules_, _Postconditions_ (`BE-UserStory/src/EP-01.md`); BRD v3.39
  `FR-8.1`, `FR-8.3`, `FR-8.6`, `FR-8.8`, `FR-8.9`, `FR-8.11` (a)→(i), `INV-05`; `QĐ-46a`→`QĐ-46d`, `QĐ-39c`/`39d`,
  `QĐ-41a`, `QĐ-47`, `QĐ-72`, `QĐ-73a`. AC-12 (`QĐ-73a`) là quyết định Owner **sau** `QĐ-72`, không nằm trong phần GVHD
  đã duyệt (`project-decisions.md`, dòng `QĐ-73a`).
- _Đính chính 18/10/2026 ([audit nền tảng](../../../reviews/be-foundation-audit-2026-10-18/README.md)):_ AC đã giao — căn cứ là bảng nghiệm thu bên dưới: `US-01-10` AC-3, AC-4, AC-5, AC-6 (vế đặt lại/đổi; nghỉ việc bằng fixture tới G6), AC-7 (vế đặt lại khi bị từ chối tạm thời), AC-9 (sự kiện của lát), AC-12; AC-8 chỉ là hồi quy.
- Trạng thái yêu cầu: `US-01-10` `BASELINED`, P0 (`QĐ-72`). Giá trị thời hạn, giới hạn tần suất, chính sách mật khẩu là
  thiết kế kỹ thuật BE, "phải chốt trong thiết kế lát BE mới và được dev khác review" (_Business rules_ `US-01-10`) — chốt
  ở bảng `T-*` dưới đây; review của dev khác là điều kiện trước khi giao lên `dev` ([plan](plan.md), DoD mục 11).
- Thiết kế kế thừa: [ADR-0011](../../../decisions/0011-internal-authentication-and-sessions.md),
  [ADR-0012](../../../decisions/0012-account-email-delivery.md) (đều _Proposed_); [G0](../foundation-org-identity-boundary/spec.md)
  (giao thức khóa, dòng _Đổi / đặt lại mật khẩu_), [1a](../us-01-bootstrap-login-session/spec.md),
  [1b](../us-01-account-invitation-activation/spec.md) — baseline `verified` local tại BE `d60d306`, cấu trúc module sau
  Task 2 tại `ab0c43a`. [Kế hoạch](plan.md).

## Vấn đề và phạm vi

Chủ tài khoản đã kích hoạt tự lấy lại hoặc đổi mật khẩu mà không ai khác biết mật khẩu; đổi/đặt lại thu hồi mọi phiên,
báo qua thư tới email đang lưu, và không làm tài khoản khóa hoặc của nhân viên đã nghỉ việc dùng lại được.

| Trong lát 1c                                                                        | Ngoài lát (nơi làm)                                                                    |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `US-01-10` AC-3 (quên mật khẩu, phản hồi chung), AC-4 (đặt lại), AC-5 (đổi)         | AC-1, AC-2, AC-8, AC-9 phần kích hoạt — lát 1b (`verified`)                            |
| AC-6 vế đặt lại/đổi: tài khoản **khóa** hoặc nhân viên **đã nghỉ việc** vẫn bị chặn | AC-10 quên mật khẩu khi đang khôi phục — `us-01-09-super-admin-transfer-recovery`      |
| AC-7 vế đặt lại khi đang bị từ chối tạm thời                                        | AC-11 mobile — G10 (`US-16-04`)                                                        |
| AC-9 cho sự kiện của lát; AC-12 thư báo đã đổi/đặt lại (`QĐ-73a`)                   | Chuyển _đã nghỉ việc_ thật — G6; lát này dựng trạng thái `TERMINATED` bằng fixture SQL |
| Mở rộng outbox cho thư không có liên kết (cần cho AC-12)                            | Trang FE `/reset-password`, màn đổi mật khẩu — repo FE, dùng contract dưới đây         |

Không claim hoàn thành `US-01-10`: còn AC-10, AC-11.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                                                          | Kết luận                                                                                                                                            | Nguồn / loại                                 |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Q-1 Có thư báo đã đổi/đặt lại?                                               | **Có**: chỉ báo sự kiện (thời điểm, loại), không mã/liên kết, tới email đăng nhập đang lưu; thư lỗi không làm hỏng thao tác, được xử lý lại         | `QĐ-73a`, AC-12 — sự thật nguồn              |
| Q-2 Đặt lại qua liên kết có tính là xác minh email của Super Admin khởi tạo? | **Không đổi** `emailVerificationSource` trong 1c; câu hỏi thuộc `US-01-09` (`QĐ-67b`)                                                               | lựa chọn kỹ thuật, không ảnh hưởng AC của 1c |
| Q-3 Ngoại lệ I-6 _đang đặt lại do khôi phục_ (G0)                            | Thuộc `US-01-09`; 1c gom điều kiện "đủ điều kiện nhận thư đặt lại" vào **một** hàm để AC-10 thêm vế sau                                             | G0 I-6                                       |
| Q-4 Sai mật khẩu hiện tại khi đổi có khóa tài khoản?                         | **Không** khóa (AC-7); tính vào cùng bộ đếm từ chối tạm thời của email đăng nhập (T-6)                                                              | AC-7 + lựa chọn kỹ thuật                     |
| Q-5 Đổi mật khẩu có cần vai?                                                 | Không — mọi tài khoản đăng nhập được (kể cả 0 vai, Super Admin tự đổi `FR-8.8`) gọi được; người khác không có route đổi hộ (AC-8)                   | AC-5, AC-8, `FR-8.8`                         |
| Q-6 Thời gian phản hồi của yêu cầu quên mật khẩu                             | AC-3 yêu cầu **nội dung** phản hồi như nhau. Ca (a) ghi token/outbox nên chậm hơn vài ms; không thêm trễ nhân tạo. Rủi ro còn lại ghi ở mục Bảo mật | lựa chọn kỹ thuật                            |
| Review giá trị kỹ thuật bởi dev khác                                         | Là điều kiện trước khi giao `dev` (DoD 11), không chặn bắt đầu code                                                                                 | `US-01-10` _Business rules_                  |

Không còn câu hỏi nghiệp vụ chặn lát này.

## Hành vi và thiết kế

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-1  | Token đặt lại: 32 byte ngẫu nhiên, base64url; lưu SHA-256 ở `account_action_tokens` purpose `RESET_PASSWORD`; TTL `AUTH_PASSWORD_RESET_TTL_SECONDS` mặc định 1800 (min 300, max 86400)                                                |
| T-2  | Một tài khoản tối đa `AUTH_PASSWORD_RESET_MAX_PER_HOUR` (mặc định 3) token đặt lại tạo trong 60 phút gần nhất, đếm từ bảng token dưới khóa AppUser; vượt ⟹ vẫn 202, không token, không thư                                            |
| T-3  | Đặt lại hoặc đổi thành công xóa dòng `login_throttles` của email đăng nhập (AC-7: lấy lại quyền đăng nhập ngay)                                                                                                                       |
| T-4  | Yêu cầu mới thu hồi token đặt lại còn dùng được trước đó (`SUPERSEDED`) và hủy thư `PENDING` của nó — tối đa một liên kết dùng được                                                                                                   |
| T-5  | Đổi/đặt lại thu hồi mọi token còn dùng được của tài khoản với lý do mới `CREDENTIAL_CHANGED`, mọi phiên còn sống với lý do mới `PASSWORD_CHANGED` / `PASSWORD_RESET`                                                                  |
| T-6  | Sai mật khẩu hiện tại: upsert `login_throttles` của email đăng nhập như đăng nhập sai (`AUTH_LOGIN_MAX_FAILURES`, `AUTH_LOGIN_WINDOW_SECONDS`, `AUTH_LOGIN_BLOCK_SECONDS`); đang chặn ⟹ 429                                           |
| T-7  | Chính sách mật khẩu dùng lại `auth/password.policy.ts` của 1a; không kiểm _mới = cũ_                                                                                                                                                  |
| T-8  | Liên kết `${APP_PUBLIC_URL}/reset-password#token=<token>` — token ở fragment như `activationLink`                                                                                                                                     |
| T-9  | Hai route công khai thêm `@Throttle({ default: { limit: 10, ttl: 60_000 } })` trên throttler toàn cục hiện có (`@nestjs/throttler` 6.x, [tài liệu](https://docs.nestjs.com/security/rate-limiting#customize))                         |
| T-10 | Worker kiểm lại trước khi gửi thư có liên kết: `INVITE` như 1b; `RESET_PASSWORD` cần token dùng được, chưa hết hạn, tài khoản `ACTIVE` + `ACTIVATED`, nhân viên không `TERMINATED`. Thư báo (không liên kết) gửi không cần kiểm token |

### HTTP contract

Mọi response theo envelope chuẩn ([API rules](../../../rules/api-contract.md)). Mã lỗi mới chỉ thêm, không đổi mã cũ.

| Operation | `POST /api/v1/auth/password-reset-requests` — `authRequestPasswordReset`, `@Public()`                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Request   | `{ email: string }` (`z.strictObject`, trim, 1–320 ký tự, dạng email)                                                                    |
| 202       | `{ success: true, message: 'AUTH.PASSWORD_RESET_REQUESTED', data: { requested: true } }` — **giống hệt** cho (a)–(e), kể cả khi vượt T-2 |
| Lỗi       | 422 `VALIDATION_ERROR` (dạng sai, không phụ thuộc tài khoản); 429 throttler route; 503 `AUTH.UNAVAILABLE`                                |

| Operation | `POST /api/v1/auth/password-resets` — `authResetPassword`, `@Public()`                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request   | `{ token: string, newPassword: string }` (strict; `token` 43 ký tự base64url như lời mời)                                                                                                                                                                     |
| 200       | `{ message: 'AUTH.PASSWORD_RESET', data: { passwordReset: true } }`; không phát phiên, không trả token                                                                                                                                                        |
| Lỗi       | 400 `AUTH.PASSWORD_RESET_INVALID` — **một** mã cho token không tồn tại/hết hạn/đã dùng/bị thu hồi, tài khoản khóa/chưa kích hoạt, nhân viên đã nghỉ việc; 422 `VALIDATION_ERROR`, 422 `AUTH.PASSWORD_POLICY_VIOLATION`; 429 throttler; 503 `AUTH.UNAVAILABLE` |

| Operation | `POST /api/v1/me/password` — `meChangePassword`, `@AuthenticatedOnly()`                                                                                                                                                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request   | `{ currentPassword: string, newPassword: string }` (strict; 1–256 ký tự trước kiểm policy)                                                                                                                                                                                                                                                                              |
| 200       | `{ message: 'AUTH.PASSWORD_CHANGED', data: { passwordChanged: true } }`; mọi phiên bị thu hồi nên mọi refresh token của tài khoản hết dùng được (bản 15/10 ghi "xóa cookie refresh" — superseded bởi `1336bd5`); access token hiện tại bị guard từ chối từ request kế tiếp (phiên đã thu hồi)                                                                           |
| Lỗi       | 401 guard (`AUTHENTICATION_REQUIRED`, `INVALID_ACCESS_TOKEN` — gồm tài khoản khóa/nhân viên nghỉ việc); 422 `AUTH.CURRENT_PASSWORD_INVALID` (không 401, để FE không coi là hết phiên); 422 `VALIDATION_ERROR`, `AUTH.PASSWORD_POLICY_VIOLATION`; 429 `AUTH.LOGIN_TEMPORARILY_BLOCKED`; 503 `SERVICE_UNAVAILABLE` (sau guard) / `TOKEN_VERIFICATION_UNAVAILABLE` (guard) |

Không có route cho người khác xem/đặt mật khẩu hộ (AC-8): kiểm bằng API inventory.

### Luồng và khóa (bổ sung dòng _Đổi / đặt lại mật khẩu_ của G0)

| Thao tác     | Trước giao dịch (không khóa)                                                                                                                                                           | Trong giao dịch, theo thứ tự                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yêu cầu quên | chuẩn hóa email (`core/email.ts`); tra AppUser theo email đăng nhập chuẩn hóa; không thấy ⟹ 202, không ghi                                                                             | AppUser `FOR UPDATE` → đọc lại `ACTIVE` + `ACTIVATED`, nhân viên không `TERMINATED` (facade đọc, không khóa) → không đủ ⟹ commit rỗng, 202 → đếm token T-2 → vượt ⟹ 202 → thu hồi token đặt lại cũ + hủy thư `PENDING` (T-4) → chèn token → outbox `PASSWORD_RESET` tới **email đăng nhập đang lưu**, payload niêm phong `{ token, expiresAt, fullName }` → audit `APP_USER.PASSWORD_RESET_REQUESTED` |
| Đặt lại      | kiểm dạng; băm token; tra `tokenHash` → appUser (không khóa); không thấy hoặc purpose khác ⟹ 400, **không** Argon2; kiểm policy; băm mật khẩu mới                                      | AppUser `FOR UPDATE` → token `FOR UPDATE` → kiểm lại purpose, chưa dùng, chưa thu hồi, chưa hết hạn, đúng tài khoản; `ACTIVE` + `ACTIVATED`; nhân viên không `TERMINATED` ⟹ sai: 400 → ghi credential (hash, `hashPolicyVersion`, `changedAt`) → tiêu token → T-5 (token khác, phiên) → T-3 → outbox `PASSWORD_CHANGED_NOTICE` → audit `APP_USER.PASSWORD_RESET`                                      |
| Đổi          | đọc AppUser + credential + throttle; đang chặn ⟹ 429; Argon2 kiểm mật khẩu hiện tại; sai ⟹ upsert throttle (câu lệnh riêng, không khóa tài khoản) ⟹ 422; kiểm policy; băm mật khẩu mới | AppUser `FOR UPDATE` → đọc lại `ACTIVE` + `ACTIVATED`, nhân viên không `TERMINATED`; hash credential hiện tại **=** hash đã kiểm (khác ⟹ 422 `AUTH.CURRENT_PASSWORD_INVALID`) → ghi credential → T-5 (gồm **phiên hiện tại**) → T-3 → outbox `PASSWORD_CHANGED_NOTICE` → audit `APP_USER.PASSWORD_CHANGED`                                                                                            |

Lỗi CSDL tạm thời, deadlock, hết `lock_timeout`/`statement_timeout`, mất phản hồi `COMMIT`: theo quy tắc 6 của G0 — rollback,
503, không tự thử lại thao tác ghi. Thư báo nằm trong cùng giao dịch: commit thì chắc chắn có dòng outbox; gửi SMTP lỗi do
worker thử lại theo ADR-0012, không đảo thao tác (AC-12). **Không đổi:** vai, trạng thái khóa, trạng thái nhân viên,
`activationState`, `emailVerificationSource`; không tự đăng nhập sau đặt lại.

### Dữ liệu và migration

Một migration mới `<timestamp>_password_self_service`, không sửa migration đã merge:

- `AccountActionPurpose` thêm `RESET_PASSWORD`; `AccountActionTokenRevokedReason` thêm `CREDENTIAL_CHANGED`;
  `SessionRevokedReason` thêm `PASSWORD_CHANGED`, `PASSWORD_RESET` (`ALTER TYPE … ADD VALUE`; không dùng giá trị mới
  trong cùng migration).
- `email_outbox.action_token_hash` bỏ `NOT NULL`, giữ unique (PostgreSQL cho nhiều `NULL`): thư báo không có token. Prisma
  `actionTokenHash String? @unique`.
- Index `account_action_tokens (app_user_id, purpose, created_at)` cho đếm T-2.
- `notifications.types.ts`: `EmailTemplate` thêm `'PASSWORD_RESET' | 'PASSWORD_CHANGED_NOTICE'`; `EnqueueEmailInput.actionTokenHash`
  thành `string | null`; `TokenUsability` chỉ được gọi khi có `actionTokenHash`. `email-templates.ts` render ba mẫu `vi`/`en`.
- Facade `IdentityAccessService.isInvitationLinkUsable` đổi thành `isActionLinkUsable(tokenHash)` theo purpose (T-10);
  cập nhật `src/email-dispatch.loop.ts`. Không có module nào khác đọc bảng identity.
- `AccountRepo.latestToken()` và chi tiết `GET /app-users/{id}.invitation` (`account-query.service.ts`) **lọc purpose
  `INVITE`**: hiện chưa lọc, nên không sửa thì token đặt lại hiện thành "lời mời" cho Super Admin (hồi quy 1b). Test hồi quy bắt buộc.
- Tên khóa trong `before`/`after` của audit không được khớp `/pass(word)?|hash|token|secret|cookie|credential|…/i`
  (`AuditService` ném `UnsafeAuditPayloadError`): dùng `{ event, at }`, không dùng khóa như `passwordChangedAt`.
- Biến môi trường mới trong `env-schema.ts` + `.env.example`: `AUTH_PASSWORD_RESET_TTL_SECONDS`, `AUTH_PASSWORD_RESET_MAX_PER_HOUR`.

### Bảo mật, PII, nhật ký

Token chỉ ở payload niêm phong và trong liên kết; DB lưu SHA-256. Audit `after` chỉ có `{ event, at }`, không email nhập,
không token, không hash (facade `AuditService` đã chặn khóa `pass|hash|token|...`). Log cấu trúc của yêu cầu quên mật khẩu
**không** ghi email nhập hay nhánh (a)–(e); chỉ route, status, `requestId`. Response không phụ thuộc tài khoản; rủi ro còn
lại: chênh thời gian vài ms giữa ca (a) và còn lại — chấp nhận ở MVP, ghi trong ADR-0011 khi implement.

## Acceptance và kiểm chứng

| US/AC           | Tình huống                                                                                                                                                   | Cấp test, kết quả mong đợi                                                                       | Bằng chứng sau implement                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| AC-3            | Năm email (a)–(e) qua API thật; email (a) viết hoa/khoảng trắng                                                                                              | HTTP + PostgreSQL thật: status/body giống hệt; outbox chỉ (a), recipient = email đang lưu        | PASS: `password-self-service-http` (forgot, 5 ca + 422 + giới hạn route T-9)                       |
| AC-3 / T-2, T-4 | Bốn yêu cầu liền cho (a) trong một giờ ⟹ 3 token, chỉ token cuối dùng được, 1 thư `PENDING`                                                                  | integration                                                                                      | PASS: `password-self-service-http` (T-2/T-4)                                                       |
| AC-4            | Đặt lại thành công; dùng lại liên kết ⟹ 400; refresh cũ ⟹ 401; access token cũ ⟹ 401 ở request kế tiếp; vai/khóa/nhân viên không đổi                         | HTTP + PostgreSQL thật                                                                           | PASS: `password-self-service-http` (reset, 400 chung, 422 policy)                                  |
| AC-5            | Sai mật khẩu hiện tại ⟹ 422; đúng ⟹ 200, mọi phiên (gồm hiện tại) bị thu hồi, refresh token cũ ⟹ 401; tài khoản 0 vai; Super Admin tự đổi                    | HTTP + PostgreSQL thật                                                                           | PASS: `password-self-service-http` (change)                                                        |
| AC-6            | Khóa sau khi phát token ⟹ đặt lại 400; mở khóa không hồi token; nhân viên `TERMINATED` (fixture) ⟹ 400, đổi ⟹ 401 ở guard                                    | integration                                                                                      | PASS: `password-self-service-http` (khóa, TERMINATED, guard 401), `action-link-purpose`            |
| AC-7            | Đăng nhập sai tới ngưỡng ⟹ 429; quên + đặt lại vẫn 200; sau đó đăng nhập được ngay (T-3); sai mật khẩu hiện tại tới ngưỡng ⟹ 429, `AppUser.status` không đổi | HTTP + PostgreSQL thật                                                                           | PASS: `password-self-service-http` (reset gỡ chặn, đổi sai tới ngưỡng ⟹ 429, không khóa)           |
| AC-9            | Audit, log, outbox không chứa mật khẩu/token/hash (grep giá trị thật trên DB và log bắt được); giao dịch lỗi không để lại audit                              | integration                                                                                      | PASS: `password-self-service-http` (audit, outbox, log bắt được)                                   |
| AC-12           | Đổi/đặt lại thành công ⟹ đúng một thư báo tới email đang lưu, không link/mã; thất bại ⟹ 0 thư; SMTP lỗi ⟹ thao tác vẫn hiệu lực, thư `FAILED`/thử lại        | worker thật + SMTP server trong tiến trình (`smtp-server`, mẫu `worker-mail-loop`) + integration | PASS: `password-self-service-mail` (worker + SMTP trong tiến trình, SMTP lỗi rồi thử lại)          |
| T-10            | Khóa tài khoản sau khi xếp thư đặt lại ⟹ worker không gửi (`CANCELLED`/bỏ qua)                                                                               | integration `worker-mail-loop`                                                                   | PASS: `password-self-service-mail` (TERMINATED sau khi xếp thư ⟹ CANCELLED), `action-link-purpose` |
| Đồng thời       | đặt lại ↔ khóa, đặt lại ↔ đăng nhập, đổi ↔ đổi, đặt lại ↔ đặt lại cùng token, quên ↔ quên, quên ↔ khóa                                                       | integration với `concurrency-harness` (`pg_locks`, không `sleep`): một bên thắng, không `40P01`  | PASS: `password-self-service-concurrency` (6 ca × 6 vòng; không `40P01`)                           |
| Lỗi tạm thời    | CSDL ngừng trả lời giữa giao dịch đặt lại/đổi ⟹ 503, không ghi dở                                                                                            | integration với `PgRelay`                                                                        | PASS: `password-self-service-unavailable` (503, không ghi dở, không `idle in transaction`)         |
| AC-8 (hồi quy)  | API inventory không có route đặt/xem mật khẩu hộ                                                                                                             | e2e `api-inventory`                                                                              | PASS: e2e `api-inventory` (manifest = đúng 3 operation mới, allowlist công khai khớp)              |

## Sẵn sàng bàn giao

- [x] Nguồn cố định, truy cập được: Docs `3341ea0`.
- [x] Scope/AC/contract/dữ liệu/khóa rõ; phụ thuộc 1a/1b và remediation đã `verified` local tại `d60d306`, refactor tại `ab0c43a`.
- [x] Plan và spec thống nhất; không còn câu hỏi nghiệp vụ chặn.
- [x] Người phụ trách nhận ownership (AI theo giao việc Owner, 16/10/2026).
- [ ] Dev khác review bảng `T-*` trước khi giao `dev` (yêu cầu của `US-01-10`) — **pending**.

## Thay đổi và nghiệm thu

14/10/2026: tạo draft từ review US theo lát, thêm AC-12 theo `QĐ-73a`.
15/10/2026 (Task 3): pin nguồn Docs `3341ea0`; chốt `T-1`→`T-10`, HTTP contract, migration, luồng khóa, thay đổi outbox
cho thư không liên kết; bỏ điều kiện "chờ remediation merge" (đã có ở `d60d306`); chuyển `ready`. Chưa implement, chưa nghiệm thu.
16/10/2026: implement xong sáu bước của plan, kiểm chứng local (unit 360, e2e 36, integration 291, `pnpm check` exit 0; chi tiết và
các quyết định khi triển khai ở [plan](plan.md)). Khác spec: thư chứa liên kết đã dùng cũng bị hủy khi đặt lại thành công;
hàm điều kiện nhận thư tên `canReceiveResetMail`; không có `.env.example` trong repo. Chưa review, chưa nghiệm thu.
