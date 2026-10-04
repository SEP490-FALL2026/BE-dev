# Runbook: chạy local, demo và bảo trì lát identity/audit

> **Lịch sử — sau restore 2026-10-03, không dùng lệnh dưới đây cho source hiện tại.** Các script/module S0 chưa commit đã được backup rồi bỏ khỏi working tree; DB/.env/volume cũ vẫn còn. Không reset hoặc migrate DB cũ để làm theo runbook này. Xem [maintenance local password — Proposed](native-identity-maintenance.md); tính năng mới chưa được implement.

Áp dụng cho lát S0 đầu tiên (`docs/architecture/s0-identity-audit-slice.md`, ADR-0005, ADR-0006). Mọi dữ liệu là **giả lập** (`*.demo@saas-sentry.test`). Chỉ chạy trên máy local; không trỏ vào database dùng chung (`LR-14`).

## 1. Thành phần và cổng

| Thành phần          | Chạy ở đâu                                 | Cổng      | Ghi chú                                                   |
| ------------------- | ------------------------------------------ | --------- | --------------------------------------------------------- |
| PostgreSQL 17       | Compose project `slm-demo`                 | **55432** | Cổng riêng vì máy có thể đã có PostgreSQL native giữ 5432 |
| Keycloak 26.7 (IdP) | Compose project `slm-demo`, profile `auth` | 8080      | Giữ mật khẩu, phiên đăng nhập; BE không thấy mật khẩu     |
| API NestJS          | trên máy                                   | 3000      | Swagger: `http://localhost:3000/api/docs`                 |
| Redis, MinIO        | không cần cho lát này                      | —         | Không khởi động; cổng 6379 có thể đang bị dự án khác dùng |

Database: `software_license_management` (dữ liệu demo) và `software_license_management_test` (test tự dựng lại mỗi lần chạy).

## 2. Cấu hình một lần (`.env`, không commit)

Sao chép phần _Local demo stack_ trong `.env.example` vào `.env` và bật các dòng sau:

```dotenv
DATABASE_URL=postgresql://app:app@localhost:55432/software_license_management
COMPOSE_PROJECT_NAME=slm-demo
COMPOSE_PROFILES=auth
POSTGRES_HOST_PORT=55432
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin
DEMO_USER_PASSWORD=<tự đặt, không chia sẻ trong repo/log>
BOOTSTRAP_ORG_NAME=SaaS-Sentry Demo Co.
BOOTSTRAP_TIME_ZONE=Asia/Ho_Chi_Minh
BOOTSTRAP_REPORTING_CURRENCY=VND
SWAGGER_OIDC_CLIENT_ID=software-license-swagger
SWAGGER_PUBLIC_URL=http://localhost:3000
```

`COMPOSE_PROJECT_NAME=slm-demo` làm Docker tạo volume `slm-demo_*` riêng; volume cũ `software-license-management_*` **không bị đụng tới**.

## 3. Khởi động

```bash
pnpm install --frozen-lockfile
docker compose up -d postgres keycloak          # chờ Keycloak ~30–60 s lần đầu
pnpm db:migrate:deploy                           # tạo DB nếu chưa có, áp migration đã commit
pnpm db:seed:demo                                # idempotent: chạy lại không tạo trùng
pnpm keycloak:demo-users                         # đặt DEMO_USER_PASSWORD cho user demo (chỉ chấp nhận Keycloak localhost)
pnpm start:dev                                   # hoặc: pnpm build && node dist/main
```

Kiểm tra nhanh: `curl http://localhost:3000/api/v1/health/ready` → `"database","status":"up"`.

Dừng: `Ctrl+C` API, rồi `docker compose stop` (giữ dữ liệu).

## 4. Tài khoản demo

Mật khẩu của tất cả là giá trị `DEMO_USER_PASSWORD` trong `.env`.

| Username Keycloak | Nhân viên | Vai trò trong DB                             | Dùng để chứng minh                                         |
| ----------------- | --------- | -------------------------------------------- | ---------------------------------------------------------- |
| `sa.demo`         | E0001     | `SUPER_ADMIN`, `EMPLOYEE`                    | quản trị tài khoản, xem audit                              |
| `it.demo`         | E0002     | `IT_ADMIN`, `EMPLOYEE`                       | bị từ chối ở `/app-users`, `/audit-events`                 |
| `fin.demo`        | E0003     | `FINANCE`, `EMPLOYEE`                        | bị từ chối như trên                                        |
| `mgr.demo`        | E0004     | `EMPLOYEE` + `MANAGER` suy ra                | `isManager: true` nhờ E0005/6/7/9 báo cáo cho E0004        |
| `emp.demo`        | E0005     | `EMPLOYEE`                                   | quyền tối thiểu; bị khóa/mở trong demo                     |
| `locked.demo`     | E0006     | `EMPLOYEE`, trạng thái `LOCKED`              | 403 `ACCOUNT_LOCKED`                                       |
| `newhire.demo`    | E0007     | — (chưa có tài khoản)                        | Super Admin tạo tài khoản → tự liên kết lần đầu (tầng 2)   |
| `it2.demo`        | E0008     | —                                            | tài khoản đặc quyền → phải gắn subject tường minh (tầng 3) |
| `unverified.demo` | E0009     | `EMPLOYEE`, email Keycloak **chưa xác minh** | 403 `EMAIL_NOT_VERIFIED`                                   |
| `outsider.demo`   | —         | không có hồ sơ                               | 403 `NO_MATCHING_ACCOUNT`, không tạo tài khoản             |

E0010 là nhân viên đã nghỉ (để chứng minh `US-01-01` AC-5).

## 5. Đăng nhập trong Swagger

1. Mở `http://localhost:3000/api/docs` → **Authorize**.
2. Khối `oidc (OAuth2, authorizationCode with PKCE)`: tick `openid` → **Authorize** → cửa sổ Keycloak → đăng nhập → cửa sổ tự đóng, hiện _Authorized_. Không có client secret; không có endpoint mật khẩu trên API.
3. Mọi request "Try it out" gửi `Authorization: Bearer <access token>` — đúng header mà runtime kiểm.
4. Đổi người dùng: **Logout** trong Swagger chỉ xóa token khỏi trang. Keycloak vẫn còn phiên SSO, nên lần Authorize kế tiếp sẽ vào thẳng người cũ. Để đổi người, mở `http://localhost:8080/realms/software-license-management/account` → _Sign out_, hoặc dùng cửa sổ ẩn danh.

**Phân biệt khi trình bày:** đăng nhập, mật khẩu, phiên SSO, logout là việc của **Keycloak** (`:8080`). API nghiệp vụ (`:3000/api/v1`) chỉ kiểm token và đọc quyền từ PostgreSQL.

Phương án dự phòng (khi popup bị trình duyệt chặn): khối `bearer` nhận một access token thật. Lấy bằng một trình duyệt đã đăng nhập Swagger (DevTools → request → header `Authorization`). Không dán token vào tài liệu hay chat.

## 6. Thời hạn token và logout (đo trên realm local, Keycloak 26.7, 02/10/2026)

| Thông số                                                   | Giá trị            |
| ---------------------------------------------------------- | ------------------ |
| Access token (client Swagger/web, mặc định realm)          | 300 s              |
| Access token (client `software-license-e2e` của test live) | 15 s               |
| SSO session idle / max                                     | 1 800 s / 36 000 s |

- **Logout ở Keycloak:** token đã cấp vẫn được API chấp nhận tới `exp`, vì API kiểm token offline. Test live đã quan sát: sau logout `/me` vẫn 200, quá `exp` thì 401.
- **Khóa ở API** (`POST /app-users/{id}/lock`): có hiệu lực **ngay request kế tiếp**, kể cả với token còn hạn (403 `ACCOUNT_LOCKED`).
- Muốn chặn cả việc lấy token mới thì disable user trong Keycloak (thao tác của IT, ngoài API).

## 7. Kịch bản demo 5–10 phút

1. **Hạ tầng thật (30 s).** `docker compose ps` (postgres + keycloak), `GET /api/v1/health/ready` → database up.
2. **Đăng nhập thật (1 phút).** Swagger → Authorize → Keycloak (`sa.demo`) → `GET /me`. Chỉ ra `directRoles` lấy từ DB, `identity.subject` = id user Keycloak.
3. **Chặn quyền (1,5 phút).** Đổi sang `emp.demo` (mục 5.4) → `GET /app-users`, `GET /audit-events` → 403 `FORBIDDEN`. Gọi `/me` không có token → 401. Đăng nhập `outsider.demo` → 403 `PRINCIPAL_NOT_PROVISIONED` (không tự tạo tài khoản).
4. **Ghi → đọc DB (2 phút).** Quay lại `sa.demo`:
   - `GET /app-users` → lấy `employee.id` của E0007 từ DB (hoặc Prisma Studio `pnpm db:studio`).
   - `POST /app-users` `{ "employeeId": "<E0007>", "loginEmail": "newhire.demo@saas-sentry.test", "roles": ["EMPLOYEE"] }` → 201.
   - Thử `roles: ["MANAGER"]` → 422 `ROLE_NOT_DIRECTLY_ASSIGNABLE`; `["SUPER_ADMIN","IT_ADMIN"]` → 422; thêm `"status":"LOCKED"` → 422 (không mass assignment); cấp vai cho chính mình → 403.
   - Đăng nhập `newhire.demo` → `/me` 200: tài khoản tự liên kết lần đầu vì email đã xác minh và không có vai đặc quyền.
5. **Khóa có hiệu lực ngay (1 phút).** `sa.demo` khóa `emp.demo` → request kế tiếp của `emp.demo` → 403 `ACCOUNT_LOCKED`; mở khóa → 200.
6. **Audit (1 phút).** `GET /audit-events?resourceId=<id>` → `APP_USER_CREATED`, `IDENTITY_LINKED`, `APP_USER_LOCKED`/`UNLOCKED`, kèm người làm, vai trò lúc làm, trước/sau, `correlationId` (= header `x-request-id`). Nêu rằng DB từ chối `UPDATE/DELETE/TRUNCATE` trên bảng này (integration test).
7. **Bằng chứng test (1 phút).** Chiếu kết quả `pnpm test:live` (19 ca, luồng thật) và `pnpm test:integration` (51 ca, PostgreSQL thật).

Tình huống tùy chọn (tầng 3): `sa.demo` tạo tài khoản `IT_ADMIN` cho E0008 → `it2.demo` đăng nhập nhận 403 `EXPLICIT_BINDING_REQUIRED` kèm `subject` → `sa.demo` gọi `POST /app-users/{id}/identity-links` với subject đó → `it2.demo` vào được.

Lưu ý: bước 4 và tình huống tầng 3 thay đổi dữ liệu demo. Muốn trình diễn lại từ đầu, xem mục 9.

## 8. Chạy test

```bash
pnpm check                         # rules, format, lint, prisma validate, typecheck, unit + architecture, build
pnpm test:e2e                      # hợp đồng HTTP, repository/resolver stub — KHÔNG phải bằng chứng luồng IdP thật
NODE_ENV=test pnpm test:integration   # PostgreSQL thật; tự dựng lại *_test từ migration
pnpm test:live                     # Keycloak thật → API → PostgreSQL *_test; cần Keycloak đang chạy + keycloak:demo-users
pnpm openapi:export                # sau khi đổi HTTP/DTO; review diff openapi.json
```

Test integration/live **xóa và dựng lại schema của database `*_test`**. Helper từ chối mọi database không kết thúc bằng `_test` hoặc không ở localhost.

## 9. Làm sạch riêng dữ liệu demo

- Chạy lại kịch bản từ đầu (giữ Keycloak):
  ```bash
  docker compose exec postgres dropdb -U app software_license_management
  pnpm db:migrate:deploy && pnpm db:seed:demo
  ```
- Xóa toàn bộ stack demo, **chỉ** volume `slm-demo_*`: `docker compose -p slm-demo down -v`. Lệnh này không đụng volume `software-license-management_*` hay PostgreSQL native.
- Keycloak `start-dev` lưu realm trong container; muốn nạp lại realm đã sửa thì `docker compose rm -sf keycloak && docker compose up -d keycloak && pnpm keycloak:demo-users`.
- Đổi mật khẩu demo: sửa `DEMO_USER_PASSWORD` trong `.env` rồi `pnpm keycloak:demo-users`.

## 10. Lỗi thường gặp

| Hiện tượng                                            | Nguyên nhân                                                                                 | Cách xử lý                                                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role "app" does not exist`                           | `DATABASE_URL` trỏ vào PostgreSQL native ở 5432                                             | Dùng cổng 55432 như mục 2                                                                                                                                           |
| `Bind for 0.0.0.0:6379 failed`                        | dự án khác giữ Redis 6379                                                                   | Lát này không cần Redis; chỉ `up -d postgres keycloak`                                                                                                              |
| 503 `TOKEN_VERIFICATION_UNAVAILABLE`                  | Keycloak chưa chạy hoặc chưa sẵn sàng                                                       | `docker compose up -d keycloak`, chờ realm import                                                                                                                   |
| 403 `PRINCIPAL_NOT_PROVISIONED`                       | identity chưa liên kết; xem `details.reason`                                                | `NO_MATCHING_ACCOUNT`: Super Admin tạo tài khoản · `EMAIL_NOT_VERIFIED`: xác minh email ở Keycloak · `EXPLICIT_BINDING_REQUIRED`: Super Admin gắn `details.subject` |
| Swagger Authorize mở popup rồi không _Authorized_     | popup bị chặn, hoặc redirect URI khác `http://localhost:3000/api/docs/oauth2-redirect.html` | Cho phép popup; giữ API ở cổng 3000 hoặc sửa `SWAGGER_PUBLIC_URL` + redirect URI của client                                                                         |
| `keycloak:demo-users` báo `skip … not in realm`       | realm được tạo trước khi thêm user                                                          | Nạp lại realm (mục 9)                                                                                                                                               |
| Migration S0 dừng với `LR-14: table … holds … row(s)` | đang chạy trên DB có dữ liệu bảng phác thảo                                                 | **Dừng.** Không xóa dữ liệu; báo nhóm (`LR-14`)                                                                                                                     |

## 11. Bảo trì

- Không sửa migration đã áp. Thay đổi = migration mới; ràng buộc ngoài Prisma viết tay và thêm vào `test/integration/schema-constraints.integration-spec.ts` (ADR-0005).
- Model Prisma mới phải có chủ trong `PRISMA_MODEL_OWNER` (`src/architecture-boundaries.spec.ts`).
- Không ghi mật khẩu, token, client secret vào repo, log hay ảnh chụp tài liệu. Realm import không chứa credential; mật khẩu chỉ ở `.env`.
