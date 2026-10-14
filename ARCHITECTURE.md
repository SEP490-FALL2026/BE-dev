# Kiến trúc backend

Modular monolith: NestJS + Express, TypeScript, PostgreSQL + Prisma.
API và worker có entry point riêng trong cùng codebase.

## Trạng thái foundation

| Thành phần     | Đã có                                                                                            | Chưa triển khai                                                     |
| -------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| HTTP           | Zod DTO, response envelope, exception filter, OpenAPI, rate limit                                | API theo các US còn lại                                             |
| Health         | Liveness và PostgreSQL readiness                                                                 | Probe queue/storage                                                 |
| Catalog        | Source list/get/create và tests làm mẫu; không mount HTTP                                        | Nghiệp vụ catalog G3 và quyền theo role/resource                    |
| Authentication | Argon2id, JWT/refresh session, guards, CLI bootstrap, `/me`, quản trị tài khoản và lời mời       | Đổi/đặt lại mật khẩu, vai suy ra, chuyển giao/khôi phục Super Admin |
| Database       | Catalog, audit, organization, identity-access, notifications; 5 migration và `TransactionRunner` | Schema cho các lát tiếp theo                                        |
| Queue/storage  | S3 adapter, BullMQ configuration; worker gửi SMTP từ outbox PostgreSQL                           | BullMQ queue processor và file API                                  |

G0 và lát 1a/1b đã merge qua PR #4 (`64073c4`), có 16 operation HTTP.
Spec/plan và ADR-0011/0012 chưa được dev review/nghiệm thu; kết quả AI review và lỗi còn mở
được dẫn ở [theo dõi sau review](docs/workspace/g0-g1-review-follow-up.md).
Catalog là mẫu cấu trúc, chưa cung cấp nghiệp vụ G3.

## Bản đồ source

```text
src/
  main.ts, bootstrap.ts       # HTTP, CORS, cookie parser, versioning, Swagger
  app.module.ts               # ghép module API
  worker.ts, worker.module.ts # worker application context
  installation-cli.ts         # lệnh khởi tạo một lần, ngoài HTTP (pnpm ops:bootstrap)
  core/                       # thuần TypeScript: pagination, email, business-date
  infrastructure/
    config/                   # environment validation
    http/                     # pipe, envelope, serializer, filter
    security/                 # guard khai báo/xác thực/phân quyền, verifier port, rate limiting
    database/                 # Prisma service, TransactionRunner
    queue/                    # BullMQ connection
    object-storage/           # port và S3-compatible adapter
    observability/            # request context, request ID, logger
    health/                   # health controller
  modules/
    audit/                    # AuditEvent chỉ ghi thêm (facade record(tx, event))
    organization/             # tổ chức, Cost Center, phòng, chức vụ, nhân viên + placement
    identity-access/          # tài khoản, mật khẩu, vai gán, phiên, đăng nhập, /me, quản trị tài khoản, lời mời
    notifications/            # EmailOutbox (mã hóa payload), dispatcher gửi thư; không import identity-access
    installation/             # use case khởi tạo; không sở hữu bảng
    catalog/                  # module mẫu cấu trúc, KHÔNG đăng ký vào AppModule
prisma/
  schema.prisma               # generator, datasource
  models/                     # audit, organization, identity-access, notifications, catalog
  migrations/                 # lịch sử SQL cho baseline mới
scripts/                      # công cụ dev/verification, không phải runtime API
test/
  e2e/, integration/          # suite
  config/, support/           # runner config và helper
```

## Ranh giới phụ thuộc

- Core không import Nest, Prisma, SDK hoặc business module.
- Infrastructure cung cấp kỹ thuật; business workflow nằm trong feature module.
- Controller map HTTP/DTO; service điều phối; repo sở hữu persistence; mapper tạo wire data.
- Module dùng layout phẳng. Chỉ tạo dto/errors/mappers/policies/services khi có nhu cầu thật.
- Module khác gọi facade/contract được export; không import private repo/DTO/policy,
  không truy cập bảng thuộc module khác.
- Cross-module atomic write: facade nhận `tx` của người gọi (`DbTx`); `TransactionRunner.run`
  mở giao dịch Read Committed với `lock_timeout`/`statement_timeout` riêng cho giao dịch.
  Khóa dòng của module khác chỉ qua facade (ví dụ `organization.lockEmployeeForShare(tx, id)`).
- Không dùng vòng phụ thuộc, generic base repository hoặc scaffold hàng loạt khi chưa có US.

[Architecture tests](src/architecture-boundaries.spec.ts) quét một số boundary;
không thay thế review dependency và hành vi.

## HTTP pipeline

```text
RequestIdMiddleware
  → ThrottlerGuard → AccessDeclarationGuard → AuthenticationGuard → AuthorizationGuard
  → ApplicationZodValidationPipe
  → controller → service → repo
  → mapper → success envelope → Zod response validation
```

Exception qua HttpExceptionFilter. Guard chạy trước DTO pipe.
Mỗi route phải khai báo **đúng một** trong `@Public()`, `@AuthenticatedOnly()`,
`@RequireRoles(...)`; thiếu hoặc mâu thuẫn thì 500 và log lỗi lập trình
(`AccessDeclarationGuard`, fail closed). `@Public()` bỏ authentication, không bỏ rate limit.
Thiếu token: 401 AUTHENTICATION_REQUIRED. Token sai chữ ký/hết hạn, phiên bị thu hồi,
tài khoản khóa hoặc nhân viên _đã nghỉ việc_: 401 INVALID_ACCESS_TOKEN, kiểm ở **mỗi** request
nên có hiệu lực ngay request kế tiếp. Vai không nằm trong token. Database không sẵn sàng:
503 TOKEN_VERIFICATION_UNAVAILABLE (route auth: 503 AUTH.UNAVAILABLE), không lộ thông tin nội bộ.
Sai vai: 403 AUTHORIZATION.FORBIDDEN.

Rate limit hiện dùng bộ nhớ của từng process, theo **từng route trên mỗi IP**, **không dùng Redis**.
Owner chốt giữ phạm vi này ngày 14/10/2026 (R-07); dev cần bổ sung test xác nhận.
Throttle đăng nhập theo email là cơ chế riêng: chỉ lần sai được tăng bộ đếm thất bại theo spec;
code tại `64073c4` còn đếm lượt đang xử lý, cần sửa R-06.
TRUST_PROXY_HOPS chỉ cấu hình khi ingress đáng tin cậy; proxy phải thay header
request ID do client gửi. Baseline chưa giải quyết rate limit phân tán.

## Persistence và hạ tầng

Vùng tổ chức-danh tính dùng ràng buộc ở PostgreSQL (migration SQL, ADR-0005): một Organization,
múi giờ bất biến, Department gắn Cost Center `UNIT`, placement không chồng lấn (`btree_gist`),
một grant `SUPER_ADMIN` hiệu lực, audit chỉ ghi thêm. Cột bảng mới snake_case qua `@map`;
`catalog_applications` giữ camelCase tới khi thiết kế lại. `PrismaService` ghim `TimeZone=UTC`
cho mỗi kết nối: adapter-pg đọc/ghi `timestamptz` như thể phiên là UTC. Instant truyền vào raw SQL
dùng chuỗi ISO-8601 (`toISOString()`) kèm `::timestamptz`. Ghim này gửi tham số khởi động `options`:
qua PgBouncer hoặc pooler quản lý phải cho phép (`ignore_startup_parameters = options`) hoặc đổi cách ghim
(`ALTER ROLE ... SET timezone`) — chưa kiểm chứng với pooler nào.

Authentication: tài khoản nội bộ, access token JWT HS256 ngắn hạn cộng refresh token xoay vòng trong cookie
`HttpOnly`/`SameSite=Strict`/`Path=/<prefix>/v1/auth`; phát lại refresh token thì thu hồi phiên. Giao thức
khóa và hợp đồng đăng xuất: [spec nền](docs/workspace/items/foundation-org-identity-boundary/spec.md),
[spec lát 1a](docs/workspace/items/us-01-bootstrap-login-session/spec.md); ADR-0011 còn **Proposed**.
Khởi tạo cài đặt: `pnpm build` rồi `pnpm ops:bootstrap --help` (chạy bởi chính người giữ vai Super Admin;
mật khẩu nhập ở prompt ẩn, không nhận qua tham số hay biến môi trường).

Catalog dùng unique slug ở PostgreSQL; phân trang sort name/id, transaction
RepeatableRead để page/count dùng cùng snapshot. Snapshot không cố định giữa các
request phân trang khác nhau.

AppModule chưa dùng queue. WorkerModule cấu hình BullMQ (chưa có job) và chạy `EmailDispatchLoop`
(`src/email-dispatch.loop.ts`): vòng thăm dò PostgreSQL mỗi `OUTBOX_POLL_INTERVAL_MS` gửi thư trong
EmailOutbox ([ADR-0012](docs/decisions/0012-account-email-delivery.md), vẫn **Proposed**) — không cần Redis cho việc này.
Vòng lặp nằm ở gốc ghép vì nối hai module không được import nhau: `notifications` gửi thư,
`identity-access` trả lời liên kết trong thư còn dùng được không. Quản trị tài khoản (lát 1b): route
`/app-users`, `/account-candidates` chỉ Super Admin; kích hoạt qua `POST /auth/invitations/redeem`.
Storage adapter hỗ trợ endpoint S3-compatible; chưa có file ownership/API.
Readiness chỉ chứng minh PostgreSQL có thể ping, không chứng minh schema/migration,
Redis, storage hoặc chức năng đăng nhập đã sẵn sàng.

Compose phục vụ local PostgreSQL, Redis, MinIO; Dockerfile build runtime API/worker.
Migrations chạy riêng trước rollout. Xem [containers](docs/guides/containers.md),
[database rules](docs/rules/database-business.md) và [tests](test/README.md).
