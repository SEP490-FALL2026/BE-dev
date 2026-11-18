# Kiểm kê chức năng BE và runbook kiểm thử API thủ công

Ngày rà soát: **20/10/2026**. Phạm vi: nhánh `dev`, HEAD `9a7164a`; đối chiếu `src/`, `openapi.json`,
controller/service, test, `docs/roadmap.md` và các lệnh vận hành. Tài liệu này mô tả code đang chạy được, không thay
cho Owner review hay nghiệm thu Story.

## Kết luận nhanh

- Runtime đang mount **60 HTTP operation**. Chức năng nghiệp vụ đã có thuộc G1 và một phần G2; G0 là enabler dữ liệu,
  transaction và audit. Roadmap chưa đánh dấu Story nào `accepted`.
- G1 đã có bootstrap, login/session, `/me`, quản trị tài khoản, invitation, password self-service, Audit Trail,
  approval roles, chuyển giao và khôi phục Super Admin.
- G2 đã có Cost Center, phòng ban/trưởng phòng, project mô tả trên hồ sơ phòng, chức vụ, nhập tay nhân viên, import CSV
  preview-confirm, operating parameters và onboarding bước 1. Nhiều Story chỉ được phủ một phần.
- G3–G10 chưa có API nghiệp vụ được mount. `catalog` có source/schema/test nhưng `CatalogModule` không nằm trong
  `AppModule`, nên ba route trong `catalog.controller.ts` **không gọi được**. Queue/BullMQ và S3 adapter cũng chưa mount.
- Không có tài khoản hay mật khẩu mặc định lấy từ `.env`. Chi tiết seed nằm ở mục [Seed và tài khoản test](#seed-và-tài-khoản-test).

## Trạng thái theo roadmap

| Nhóm | Code hiện có                                                                                                                                    | Story/lát được chạm                                                                                                      | Phần chưa có                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| G0   | Boundary organization–identity, audit cùng transaction, bootstrap, PostgreSQL/Prisma foundation                                                 | Enabler cho G1/G2                                                                                                        | Owner review/remote CI/acceptance vẫn còn mở                                                       |
| G1   | Auth/session; account invitation/activation; khóa/mở/gán vai; password change/reset; Audit Trail; approval roles; Super Admin transfer/recovery | `US-01-01`, `US-01-03`, `US-01-04`, `US-01-06`, `US-01-09`, `US-01-10`; chạm một phần `US-01-02`, `US-01-05`, `US-01-11` | Luồng nghỉ việc/nghỉ dài và quyền theo các lát sau; chưa Story nào `accepted`                      |
| G2   | Job title; manual employee; Cost Center; department/head/Manager; project text; employee CSV import; onboarding step 1                          | `US-02-01`→`US-02-04`, `US-02-07`, `US-03-06`, `US-04-09`; các AC liên quan của G1                                       | Onboarding bước 2–5; điều chuyển/nghỉ việc; assignment/seat và các phần được spec để lại cho G3–G6 |
| G3   | Không có API runtime; catalog cũ chưa mount                                                                                                     | Chưa triển khai                                                                                                          | Danh mục phần mềm, gói, mua/thuê bao, tiền/thuế                                                    |
| G4   | Không có API nghiệp vụ                                                                                                                          | Chưa triển khai                                                                                                          | Assignment, capacity, provisioning, hiện trạng ban đầu                                             |
| G5   | Không có API nghiệp vụ                                                                                                                          | Chưa triển khai                                                                                                          | Request, duyệt nhu cầu/chi, ngân sách, cấp quyền                                                   |
| G6   | Không có API nghiệp vụ                                                                                                                          | Chưa triển khai                                                                                                          | Điều chuyển, nghỉ việc/nghỉ dài, thu hồi/bàn giao                                                  |
| G7   | Không có API nghiệp vụ; source queue/storage không mount                                                                                        | Chưa triển khai                                                                                                          | Usage ingestion, collector, rules, privacy                                                         |
| G8   | Không có API nghiệp vụ                                                                                                                          | Chưa triển khai                                                                                                          | Gia hạn, hóa đơn, phân bổ chi phí, báo cáo                                                         |
| G9   | Không có API nghiệp vụ                                                                                                                          | Chưa triển khai                                                                                                          | Import sao kê và đối soát                                                                          |
| G10  | Không có API nghiệp vụ                                                                                                                          | Chưa triển khai                                                                                                          | AI và Mobile-specific slices                                                                       |

## Chuẩn bị môi trường local

Không đưa secret thật vào lệnh, tài liệu hoặc ảnh chụp. Các bước dưới đây chỉ cần đọc tên biến trong `.env.example`;
không cần in giá trị `.env`.

1. Cài Node.js 22 hoặc 24 và pnpm `11.1.3`, sau đó chạy:

   ```powershell
   pnpm install --frozen-lockfile
   docker compose up -d --wait
   pnpm db:migrate:deploy
   pnpm build
   ```

2. Development cần `NODE_ENV=development`, `DATABASE_URL` và bốn secret riêng của máy:
   `AUTH_ACCESS_TOKEN_SECRET`, `AUTH_THROTTLE_PEPPER`, `OUTBOX_PAYLOAD_KEY`, `OUTBOX_PAYLOAD_KEY_ID`.
   API/worker không cần Redis hoặc object storage ở code hiện tại.
3. Khởi tạo database mới một lần. Xem đầy đủ tham số bằng `pnpm ops:bootstrap --help`; ví dụ cấu trúc lệnh:

   ```powershell
   pnpm ops:bootstrap -- --timezone Asia/Ho_Chi_Minh --organization-name "SLM Manual Test" --cost-center-code INIT-CC --cost-center-name "Initial cost center" --department-code INIT --department-name "Initial department" --job-title "Initial staff" --admin-code SA-001 --admin-name "Manual Super Admin" --admin-email sa@manual.slm.test --admin-hire-date 2026-01-05 --it-code IT-001 --it-name "Initial IT Employee" --it-email initial.it@manual.slm.test --it-hire-date 2026-01-05 --operator-reference MANUAL-BOOTSTRAP-001 --environment LOCAL_TEST
   ```

   Password Super Admin được nhập ở hidden prompt, không đi qua option hay env. Lệnh tạo organization, một Cost Center
   `UNIT`, một phòng, một chức vụ, Employee của Super Admin, một IT Employee chưa có account, account Super Admin và
   Audit Trail trong một transaction.

4. Kiểm trạng thái và tạo data demo:

   ```powershell
   pnpm ops:inspect
   pnpm dev:seed -- --confirm-local
   ```

5. Chạy API; nếu cần nhận invitation/reset mail thì chạy worker và một SMTP sink local ở terminal khác:

   ```powershell
   pnpm start:dev
   pnpm start:worker
   ```

   Cấu hình `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `APP_PUBLIC_URL`. Compose mặc định không kèm SMTP sink. Swagger ở
   `http://localhost:3000/api/docs` khi `SWAGGER_ENABLED=true`.

## Seed và tài khoản test

### Seed có lấy tài khoản từ env không?

**Không.** Source `dev-seed.fixture.ts` cố định danh tính demo; `local-password.ts` sinh password bằng
`randomBytes(18).toString('base64url')`, tức 24 ký tự ngẫu nhiên. Password chỉ được in một lần khi account mới được
tạo; database chỉ giữ hash. Chạy seed lần hai không in lại và không reset password.

Env chỉ quyết định **đích database** và ba chốt an toàn của lệnh:

- `NODE_ENV` phải là `development` hoặc `test`;
- host trong `DATABASE_URL` phải parse thành `localhost`, `127.0.0.0/8` hoặc `::1`;
- người chạy phải truyền `--confirm-local`.

`ops:bootstrap` cũng không lấy email/tên/password account từ env: tên, code, email truyền qua CLI; password nhập tại
hidden prompt. Nó chỉ dùng env database. Không đọc account seed từ `.env.production`.

| Nguồn           | Email/login                                                             | Vai trực tiếp | Password           | Ghi chú                                                       |
| --------------- | ----------------------------------------------------------------------- | ------------- | ------------------ | ------------------------------------------------------------- |
| `ops:bootstrap` | Do người chạy truyền `--login-email` hoặc mặc định bằng `--admin-email` | `SUPER_ADMIN` | Nhập hidden prompt | Tạo một lần; không phải seed mặc định                         |
| `dev:seed`      | `it.admin@demo.slm.test`                                                | `IT_ADMIN`    | CSPRNG, in một lần | Account đã activate                                           |
| `dev:seed`      | `finance@demo.slm.test`                                                 | `FINANCE`     | CSPRNG, in một lần | Chỉ có một Finance seat; seed từ chối nếu người khác đang giữ |
| `dev:seed`      | `employee@demo.slm.test`                                                | `EMPLOYEE`    | CSPRNG, in một lần | Account đã activate                                           |

Fixture còn tạo `DEMO-CC`, phòng `DEMO`, chức vụ `Demo staff` và ba Employee `DEMO-IT`, `DEMO-FIN`, `DEMO-EMP`.
`MANAGER` và `SPENDING_APPROVER` là vai suy ra, không được seed/grant trực tiếp:

- gán `DEMO-EMP` làm trưởng phòng qua API head assignment để kiểm vai `MANAGER`;
- cấu hình holder qua `/approval-roles/{role}` để kiểm vai duyệt chi/thay thế/dự phòng.

Mã thoát seed: `0` tạo mới, `2` đã tồn tại đúng fixture, `3` bị từ chối và không ghi, `1` lỗi. Nếu dữ liệu cùng stable
key khác fixture, lệnh từ chối thay vì sửa dữ liệu.

## Hợp đồng HTTP chung

Base URL mặc định:

```powershell
$base = 'http://localhost:3000/api/v1'
```

Mọi success trừ logout `204` có envelope:

```json
{ "success": true, "message": "DOMAIN.EVENT", "data": {} }
```

Mọi lỗi có envelope ổn định và `x-request-id`:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details": {},
    "requestId": "uuid"
  }
}
```

`401` nghĩa chưa xác thực/token hoặc session không dùng được; `403` nghĩa đã đăng nhập nhưng sai vai/phạm vi; `422`
là input hoặc rule nghiệp vụ; `409` là conflict trạng thái/uniqueness; `429` là rate limit; `503` là dependency tạm
không sẵn sàng. List thường dùng `page=1&pageSize=20`, tối đa 100; import rows mặc định 50, tối đa 200.

Login và tạo header:

```powershell
$loginBody = @{ email = 'it.admin@demo.slm.test'; password = '<password-in-ra-khi-seed>' } | ConvertTo-Json
$itLogin = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body $loginBody
$itHeaders = @{ Authorization = "Bearer $($itLogin.data.accessToken)" }
```

Lặp lại cho `$saHeaders`, `$financeHeaders`, `$employeeHeaders`. Không ghi token vào file. Sau mỗi thao tác đổi role,
lock/unlock hoặc đổi password, gọi lại `/me` hoặc login lại để quan sát hiệu lực ở request kế tiếp.

## Checklist 60 API

### Health — public

| Xong | API                        | Input | Hoạt động/chức năng cần kiểm                                                                                   |
| ---- | -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| [ ]  | `GET /api/v1/health/live`  | Không | `200`, process đang chạy; không kiểm DB.                                                                       |
| [ ]  | `GET /api/v1/health/ready` | Không | `200` khi PostgreSQL ping trong 1,5 giây; DB lỗi trả `503 SERVICE_UNAVAILABLE`. Chưa probe SMTP/queue/storage. |

### Authentication và self-service

| Xong | API                                         | Quyền                              | Input                           | Hoạt động/chức năng cần kiểm                                                                                                                      |
| ---- | ------------------------------------------- | ---------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]  | `POST /api/v1/auth/login`                   | Public                             | `{email,password}`              | `200`, cấp access + refresh token và hai expiry. Sai email/password cùng một `401`; nhiều lần sai bị `429`.                                       |
| [ ]  | `POST /api/v1/auth/refresh`                 | Public, xác thực bằng refresh body | `{refreshToken}`                | `200`, rotate sang cặp token mới và tiêu token cũ. Token cũ còn hạn bị replay sẽ đóng session; token hết hạn chỉ `401`, không phá session khác.   |
| [ ]  | `POST /api/v1/auth/logout`                  | Public, xác thực bằng refresh body | `{refreshToken}`                | `204`, idempotent; kết thúc session nếu token thuộc session mở. Body hợp lệ nhưng token lạ vẫn `204`.                                             |
| [ ]  | `POST /api/v1/auth/password-reset-requests` | Public                             | `{email}`                       | Luôn `202 {requested:true}` cho email có/không có account để chống dò tài khoản. Account hợp lệ sẽ queue mail; tối đa phát hành theo rate config. |
| [ ]  | `POST /api/v1/auth/password-resets`         | Public                             | `{token,newPassword}`           | `200`, đặt password mới và revoke mọi session; không unlock account. Token sai/dùng rồi/hết hạn cùng `400`.                                       |
| [ ]  | `POST /api/v1/auth/invitations/redeem`      | Public                             | `{token,password}`              | `200`, activate account INVITED và đặt password đầu tiên; không tự login. Link sai/dùng rồi/hết hạn trả `400`.                                    |
| [ ]  | `GET /api/v1/me`                            | Bearer, mọi account đã đăng nhập   | Không                           | Trả account, Employee và effective roles; dùng để xác minh direct + derived role.                                                                 |
| [ ]  | `POST /api/v1/me/password`                  | Bearer, mọi account đã đăng nhập   | `{currentPassword,newPassword}` | `200`, đổi password của chính mình và revoke toàn bộ session, gồm session đang gọi; login lại bằng password mới.                                  |

Password nghiệp vụ là 12–128 Unicode code point sau NFC, không có composition rule, và không được bằng login email.
DTO nhận tối đa 1.024 ký tự ở trường password mới để policy trả lỗi có chủ đích; password login/current tối đa 256.

### Account, role, Audit Trail và Super Admin

| Xong | API                                                | Quyền                | Input                                                                                 | Hoạt động/chức năng cần kiểm                                                                                                                                                                       |
| ---- | -------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]  | `GET /api/v1/account-candidates`                   | `SUPER_ADMIN`        | `search?`                                                                             | Tối đa 20 Employee chưa nghỉ và chưa có account; dùng lấy `employeeId` trước khi tạo account.                                                                                                      |
| [ ]  | `GET /api/v1/app-users`                            | `SUPER_ADMIN`        | `page,pageSize,status,activationState,role`                                           | Phân trang account theo trạng thái, activation và direct role.                                                                                                                                     |
| [ ]  | `POST /api/v1/app-users`                           | `SUPER_ADMIN`        | `{employeeId,loginEmail?,roles?}`                                                     | `201`, tạo account `INVITED`, queue invitation. Không cho grant derived role hay `SUPER_ADMIN`; Finance seat là duy nhất.                                                                          |
| [ ]  | `GET /api/v1/app-users/{id}`                       | `SUPER_ADMIN`        | UUID                                                                                  | Trả account detail, role history và trạng thái invitation/delivery.                                                                                                                                |
| [ ]  | `POST /api/v1/app-users/{id}/invitations`          | `SUPER_ADMIN`        | UUID                                                                                  | `202`, revoke invitation cũ và queue link mới; chỉ cho account đang invited, không locked/departed/caller.                                                                                         |
| [ ]  | `POST /api/v1/app-users/{id}/lock`                 | `SUPER_ADMIN`        | `{reason}`                                                                            | `200`, khóa, revoke sessions và invitation chưa dùng; không khóa caller hoặc holder Super Admin. Reason bắt buộc.                                                                                  |
| [ ]  | `POST /api/v1/app-users/{id}/unlock`               | `SUPER_ADMIN`        | `{reason}`                                                                            | `200`, mở lại account nhưng không tạo session; reason bắt buộc, caller không tự đổi status.                                                                                                        |
| [ ]  | `POST /api/v1/app-users/{id}/role-grants`          | `SUPER_ADMIN`        | `{role}`                                                                              | `201`, direct role có hiệu lực ở request kế tiếp. Thử duplicate/Finance đã có để nhận `409`; derived/SA nhận `422`.                                                                                |
| [ ]  | `DELETE /api/v1/app-users/{id}/role-grants/{role}` | `SUPER_ADMIN`        | UUID + role                                                                           | `200`, revoke direct role, được phép để account không có role. Không dùng để chuyển `SUPER_ADMIN` hay derived role.                                                                                |
| [ ]  | `GET /api/v1/approval-roles`                       | `SUPER_ADMIN`        | Không                                                                                 | Trả ba cấu hình `SPENDING_APPROVER`, `CONFLICT_SUBSTITUTE`, `FALLBACK_APPROVER`, holder hiện tại và lịch sử.                                                                                       |
| [ ]  | `PUT /api/v1/approval-roles/{role}`                | `SUPER_ADMIN`        | `{employeeId}`                                                                        | Đổi holder từ hiện tại; cùng holder là no-op. Người đó phải đang làm việc, có account usable; substitute phải khác spending approver.                                                              |
| [ ]  | `GET /api/v1/audit-events`                         | `SUPER_ADMIN`        | `page,pageSize,resourceType,resourceId,actorAppUserId,action,occurredFrom,occurredTo` | Audit newest-first; khoảng thời gian là `[from,to)`. Dùng correlation/resource để đối chiếu mọi write trong checklist.                                                                             |
| [ ]  | `POST /api/v1/super-admin-transfers`               | `SUPER_ADMIN` holder | `{successorAppUserId}`                                                                | Chuyển role nguyên tử và caller mất SA từ request kế tiếp. Successor phải activated, email verified, đang làm việc và không giữ role/approval/head xung đột. Chỉ thử cuối cùng trên DB disposable. |

### Tổ chức và nhân sự

#### Job title

| Xong | API                                       | Quyền      | Input                             | Hoạt động/chức năng cần kiểm                                                    |
| ---- | ----------------------------------------- | ---------- | --------------------------------- | ------------------------------------------------------------------------------- |
| [ ]  | `GET /api/v1/job-titles`                  | `IT_ADMIN` | `status?,search?,page?,pageSize?` | List theo tên; search literal; lọc ACTIVE/INACTIVE.                             |
| [ ]  | `POST /api/v1/job-titles`                 | `IT_ADMIN` | `{name}`                          | `201`, tạo ACTIVE; tên trùng sau normalize case/whitespace trả `409`.           |
| [ ]  | `PATCH /api/v1/job-titles/{id}`           | `IT_ADMIN` | `{name}`                          | Đổi tên, các Employee đang giữ vẫn giữ.                                         |
| [ ]  | `POST /api/v1/job-titles/{id}/deactivate` | `IT_ADMIN` | UUID                              | Idempotent; không xóa hoặc gỡ title khỏi Employee cũ, nhưng chặn placement mới. |
| [ ]  | `POST /api/v1/job-titles/{id}/reactivate` | `IT_ADMIN` | UUID                              | Idempotent; cho phép dùng title lại.                                            |

#### Cost Center

| Xong | API                                         | Quyền                     | Input                                   | Hoạt động/chức năng cần kiểm                                                 |
| ---- | ------------------------------------------- | ------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| [ ]  | `GET /api/v1/cost-centers`                  | `FINANCE` hoặc `IT_ADMIN` | `status?,kind?,search?,page?,pageSize?` | Finance/IT cùng đọc; trả department đang charge vào từng Cost Center.        |
| [ ]  | `POST /api/v1/cost-centers`                 | `FINANCE`                 | `{code,name,kind}`                      | `201`; kind chỉ `UNIT`/`COMPANY`, code duy nhất. IT/SA bị `403` để giữ SoD.  |
| [ ]  | `PATCH /api/v1/cost-centers/{id}`           | `FINANCE`                 | `{name}`                                | Chỉ đổi tên; code, department và lịch sử giữ nguyên.                         |
| [ ]  | `POST /api/v1/cost-centers/{id}/deactivate` | `FINANCE`                 | UUID                                    | Idempotent; `409 COST_CENTER.IN_USE` nếu department charge vào đó còn người. |
| [ ]  | `GET /api/v1/cost-centers/{id}/employees`   | `FINANCE`                 | `page?,pageSize?`                       | Danh sách tối giản người thuộc CC hôm nay; không trả email/contract/manager. |

#### Department, head và Manager

| Xong | API                                              | Quyền                                | Input                                                   | Hoạt động/chức năng cần kiểm                                                                           |
| ---- | ------------------------------------------------ | ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [ ]  | `GET /api/v1/departments`                        | `IT_ADMIN`                           | `status?,search?,page?,pageSize?`                       | List code order, head hôm nay, people count, warnings.                                                 |
| [ ]  | `POST /api/v1/departments`                       | `IT_ADMIN`                           | `{code,name,function?,costCenterId,itAdminEmployeeId?}` | `201`; Cost Center phải là UNIT active và chưa thuộc phòng khác. Mới tạo chưa có head.                 |
| [ ]  | `GET /api/v1/departments/{id}`                   | `IT_ADMIN` hoặc `MANAGER` đúng phòng | UUID                                                    | Hồ sơ CC, IT phụ trách, head current/history, count, projects, warnings; Manager ngoài scope bị `403`. |
| [ ]  | `PATCH /api/v1/departments/{id}`                 | `IT_ADMIN`                           | `{name?,function?,itAdminEmployeeId?}`                  | Đổi profile/IT phụ trách; không đổi CC hay membership.                                                 |
| [ ]  | `POST /api/v1/departments/{id}/deactivate`       | `IT_ADMIN`                           | UUID                                                    | Idempotent; chỉ retire khi hết members; `409` trả members/open work, không có shared account.          |
| [ ]  | `POST /api/v1/departments/{id}/head-assignments` | `IT_ADMIN`                           | `{employeeId,effectiveFrom}`                            | Người được gán phải là member đúng ngày; head cũ kết thúc ngày trước đó; vai `MANAGER` được suy ra.    |
| [ ]  | `POST /api/v1/departments/{id}/head-vacancies`   | `IT_ADMIN`                           | `{effectiveFrom}`                                       | Kết thúc head từ ngày chỉ định; không có head thì no-op và warning xuất hiện.                          |
| [ ]  | `GET /api/v1/departments/{id}/employees`         | `IT_ADMIN` hoặc `MANAGER` đúng phòng | `page?,pageSize?`                                       | Trả code, name, status, có work email hay không và member-since; không lộ email/finance data.          |
| [ ]  | `GET /api/v1/department-warnings`                | `IT_ADMIN` hoặc `SUPER_ADMIN`        | Không                                                   | Các phòng active thiếu head hoặc IT Admin usable; đây là phần duy nhất SA được đọc về phòng.           |

#### Employee và project mô tả

| Xong | API                           | Quyền      | Input                                                                                    | Hoạt động/chức năng cần kiểm                                                                                                      |
| ---- | ----------------------------- | ---------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [ ]  | `POST /api/v1/employees`      | `IT_ADMIN` | `{employeeCode,fullName,workEmail?,employmentType,hireDate,departmentCode?,jobTitleId?}` | `201`, tạo Employee + placement; không tạo account, role, invitation hoặc mail. Placement invalid trả đầy đủ reasons trong `422`. |
| [ ]  | `GET /api/v1/projects`        | `IT_ADMIN` | `departmentId?`                                                                          | List project mô tả, có thể lọc theo phòng. Đây chưa phải Cost Center/project membership/approval.                                 |
| [ ]  | `POST /api/v1/projects`       | `IT_ADMIN` | `{name,description?,status?,departmentIds}`                                              | `201`, gắn project text vào hồ sơ các phòng. Status là `RUNNING`/`FINISHED`.                                                      |
| [ ]  | `PATCH /api/v1/projects/{id}` | `IT_ADMIN` | Các field của create đều optional                                                        | Đổi mô tả, status hoặc danh sách phòng; ID lạ `404`.                                                                              |

### Operating parameters và lịch không làm việc — `SUPER_ADMIN`

| Xong | API                                              | Input                         | Hoạt động/chức năng cần kiểm                                                                               |
| ---- | ------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [ ]  | `GET /api/v1/operating-parameters`               | Không                         | Trả 14 parameter, effective value, default, unit, description và constraints.                              |
| [ ]  | `PUT /api/v1/operating-parameters/{key}`         | `{value}`                     | Lưu version mới; cùng value là no-op. Giá trị chỉ áp cho đối tượng tạo sau. Key/value sai trả `404`/`422`. |
| [ ]  | `GET /api/v1/operating-parameters/{key}/history` | Key                           | Lịch sử newest-first với `from`/`until`.                                                                   |
| [ ]  | `GET /api/v1/non-working-dates`                  | `from?,to?` dạng `YYYY-MM-DD` | List ngày nghỉ trong khoảng.                                                                               |
| [ ]  | `POST /api/v1/non-working-dates`                 | `{date,reason}`               | `201`, chỉ hôm nay hoặc tương lai; trùng ngày trả `409`.                                                   |
| [ ]  | `PATCH /api/v1/non-working-dates/{date}`         | `{reason}`                    | Đổi lý do; ngày quá khứ bị từ chối.                                                                        |
| [ ]  | `DELETE /api/v1/non-working-dates/{date}`        | Date path                     | Đưa ngày trở lại working day; ngày quá khứ hoặc không tồn tại bị từ chối.                                  |

Các key hiện có: `APPROVAL_SLA_WORKING_DAYS`, `ACTIVITY_WINDOW_MINUTES`, `BUDGET_PERIOD_KIND`,
`TRANSFER_REVIEW_WORKING_DAYS`, `ABRUPT_DEPARTURE_HOLD_WORKING_DAYS`, `PROVISIONING_RETRY_COUNT`,
`INVITATION_REMINDER_DAYS`, `INVITATION_WITHDRAW_DAYS`, `HANDOVER_SHORT_DEADLINE_WORKING_DAYS`,
`DETECTION_THRESHOLD_DAYS`, `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`, `RULE_SCHEDULE_G1_G2`, `RULE_SCHEDULE_G3_G4`,
`FORECAST_ERROR_THRESHOLD_PERCENT`. Gọi list trước để lấy domain/default chính xác; đặc biệt withdraw phải lớn hơn reminder.

### Employee import CSV — `IT_ADMIN`

| Xong | API                                                    | Input                                                       | Hoạt động/chức năng cần kiểm                                                                                  |
| ---- | ------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [ ]  | `POST /api/v1/employee-imports`                        | `multipart/form-data`, field `file`, tối đa 2 MiB           | `201`, parse tối đa 1.000 data row và tạo preview; chưa ghi Employee.                                         |
| [ ]  | `GET /api/v1/employee-imports/{id}`                    | UUID                                                        | Trả preview/result, version, summary, expiry và ignored columns.                                              |
| [ ]  | `GET /api/v1/employee-imports/{id}/rows`               | `outcome?,page?,pageSize?`                                  | Row result `VALID`, `ERROR`, `EXISTS_SAME`, `EXISTS_DIFFERENT`; dùng filter để tải lỗi.                       |
| [ ]  | `POST /api/v1/employee-imports/{id}/preview-refreshes` | UUID                                                        | Re-evaluate cùng rows với DB hiện tại, tăng preview version; version cũ không confirm được.                   |
| [ ]  | `POST /api/v1/employee-imports/{id}/confirmations`     | `{previewVersion,idempotencyKey,acknowledgeDuplicateFile?}` | Ghi các row VALID đúng một lần. Cùng key replay kết quả; stale/outdated/expired/cancelled/conflict không ghi. |
| [ ]  | `POST /api/v1/employee-imports/{id}/cancellations`     | UUID                                                        | Idempotent khi còn preview; sau confirm trả conflict.                                                         |

CSV bắt buộc sáu cột `employee_code,full_name,employment_type,hire_date,department_code,job_title`; `work_email` là
optional. Header chấp nhận alias tiếng Anh/Việt, separator comma/semicolon/tab. Ví dụ với data demo:

```csv
employee_code,full_name,work_email,employment_type,hire_date,department_code,job_title
IMP-001,Imported Tester,imported.tester@manual.slm.test,STAFF,2026-01-10,DEMO,Demo staff
```

Upload bằng PowerShell qua `curl.exe`:

```powershell
curl.exe -sS -X POST "$base/employee-imports" -H "Authorization: Bearer $($itLogin.data.accessToken)" -F "file=@.\manual-employees.csv;type=text/csv"
```

Sau upload, lấy `data.id` và `data.previewVersion`, xem rows, rồi confirm bằng một key ổn định 8–100 ký tự. Gửi lại
đúng body/key để xác minh `replayed=true`; đổi key sau khi đã confirm phải bị conflict.

### Onboarding

| Xong | API                                | Quyền      | Input | Hoạt động/chức năng cần kiểm                                                                                          |
| ---- | ---------------------------------- | ---------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| [ ]  | `GET /api/v1/onboarding-checklist` | `IT_ADMIN` | Không | Trả năm bước. Chỉ bước 1 được tính từ departments/employees/cost centers/latest import; bước 2–5 trả `NOT_AVAILABLE`. |

## Chuỗi kiểm thử tay khuyến nghị

1. Gọi hai health route khi DB đang chạy; dừng DB tạm thời chỉ trên môi trường disposable để xác minh live `200` nhưng
   ready `503`.
2. Chạy `ops:inspect`, `dev:seed`; lưu ba password chỉ trong biến terminal. Login SA/IT/Finance/Employee và gọi `/me`.
3. Với Finance, tạo `MANUAL-CC` kind `UNIT`; với IT, lấy ID đó tạo `MANUAL` department và tạo job title.
4. Với IT, nhập tay một Employee vào `MANUAL`; với SA, tìm candidate và tạo account `EMPLOYEE`. Chạy worker/SMTP sink,
   lấy invitation token từ link mail, redeem, login và gọi `/me`.
5. Gán Employee làm head của `MANUAL`; login lại account đó và xác minh `/me` có `MANAGER`, đọc đúng department nhưng
   đọc department khác bị `403`. Vacate head và xác minh role mất ở request tiếp theo.
6. Với SA, đặt ba approval-role holder và kiểm history. Xác minh holder hợp lệ trong `/me` theo rule hiệu lực.
7. Tạo/rename/deactivate/reactivate job title; tạo/update project; thử retire department/Cost Center khi còn member để
   nhận `409`, rồi kiểm error details không chứa dữ liệu ngoài contract.
8. List/set parameter và history; thêm/đổi/xóa một ngày nghỉ tương lai.
9. Chạy đủ import preview → rows → refresh → confirm → replay. Tạo một file lỗi/trùng để kiểm từng outcome và bảo đảm
   preview không ghi Employee.
10. Test lock/unlock account demo với reason; kiểm access/refresh token cũ dừng. Test grant/revoke direct role và các
    conflict. Không lock tài khoản SA đang giữ vai.
11. Test password change, password reset request/mail/reset, token dùng lại, session revoke và anti-enumeration.
12. Dùng Audit Trail lọc theo action/resource/time để đối chiếu các write. Test Super Admin transfer sau cùng và chỉ
    trên DB có thể bỏ; command recovery cũng chỉ thử trên DB disposable với ticket giả lập rõ ràng.

Mỗi route có auth nên có ít nhất ba ca: không Bearer → `401`; Bearer sai role/scope → `403`; đúng role → success hoặc
business error dự kiến. Mỗi DTO nên có một ca unknown field/UUID sai/body thiếu để xác minh strict validation `422`.

## Lệnh ngoài HTTP

| Lệnh                               | Chức năng                                                                                               | Cách test an toàn                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm ops:bootstrap`               | Tạo installation đầu tiên và SA                                                                         | DB mới; chạy `--help`; chạy một lần exit 0, lần hai exit 2 và fingerprint DB không đổi                                                  |
| `pnpm ops:inspect [--json]`        | Báo migration, organization, bootstrap records, SA masked, count account/role, approval/department gaps | Read-only PostgreSQL session; exit 0 nếu nhất quán, 2 nếu thiếu/dở, 1 nếu lỗi                                                           |
| `pnpm dev:seed -- --confirm-local` | Fixture local và ba account demo                                                                        | Chỉ loopback + development/test; lần hai exit 2, không reset password; thử thiếu cờ/remote host phải bị từ chối trước write             |
| `pnpm ops:recover <mode>`          | Khôi phục SA theo ticket khi holder không tự thao tác được                                              | Xem `--help`; DB disposable; modes `reset-credentials`, `unlock`, `transfer-role`; mọi mode cần ticket, approver, operator, environment |

`ops:recover reset-credentials` revoke credential/session/link cũ và gửi link một lần; `unlock` chỉ mở holder còn làm
việc; `transfer-role` mời/activate successor rồi chuyển role khi chạy lại cùng ticket. Command không nhận password,
token/link qua option và ghi Audit Trail.

## Bằng chứng kiểm chứng mới

Chạy trên HEAD `9a7164a`, ngày 20/10/2026, với preload chặn đọc `.env`, `.env.production` và các biến thể secret;
`.env.example` vẫn được phép đọc cho contract biến:

| Gate                    | Kết quả                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`            | PASS: rules 115 file/1.034 link/0 lỗi; 38 rule test; 104 unit suite/1.369 test; 20 script test; lint, typecheck, Prisma validate/generate, build đều pass |
| `pnpm test:e2e`         | PASS: 15 suite/278 test                                                                                                                                   |
| `pnpm test:integration` | PASS: 50 suite/661 test trên PostgreSQL 17, role test `NOSUPERUSER + CREATEDB`                                                                            |
| `pnpm openapi:export`   | PASS; SHA-256 trước/sau cùng `C1982F7DF22CB9E52A5C1C783871DA4A3D2048C1E2E1169C28D3F0E1E698360D`                                                           |
| Cleanup                 | PostgreSQL container tạm `slm-api-review-20261020-pg` và volume ẩn danh đã xóa; kiểm kê không còn container cùng tên                                      |

Các gate trên chứng minh source/test/contract hiện tại nhất quán ở local. Chúng không chứng minh remote CI, release
artifact, Owner review hoặc acceptance của Story. Các log `disk full`, DB unavailable và connection retired trong test
là lỗi được suite chủ động mô phỏng; summary cuối vẫn pass.

## Giới hạn phải nhớ khi test

- `SWAGGER_ENABLED=false` sẽ không mount `/api/docs`, nhưng 60 API vẫn hoạt động.
- Worker hiện chỉ poll PostgreSQL outbox và gửi SMTP; không có BullMQ processor, Redis queue hay file/object-storage API.
- Mail delivery cần SMTP sink thật. HTTP `202` chỉ chứng minh request/outbox accepted; cần xem worker + mailbox để chứng
  minh thư được gửi và link redeem được.
- Onboarding mới có bước 1. Project hiện chỉ là text gắn hồ sơ phòng. Catalog cũ chưa phải G3.
- `ops:bootstrap`, seed, import confirm, transfer và recovery là write operation. Chạy trên DB disposable khi thử ca lỗi;
  không tự retry write sau timeout/unknown COMMIT.
- Roadmap là nguồn trạng thái: `merged-dev`/`verified` không đồng nghĩa `accepted`.
