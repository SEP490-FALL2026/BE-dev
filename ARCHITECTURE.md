# Kiến trúc backend

Modular monolith: NestJS + Express, TypeScript, PostgreSQL + Prisma.
API và worker có entry point riêng trong cùng codebase.

## Trạng thái foundation

| Thành phần     | Đã có                                                             | Chưa triển khai                                   |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| HTTP           | Zod DTO, response envelope, exception filter, OpenAPI, rate limit | API theo các US còn lại                           |
| Health         | Liveness và PostgreSQL readiness                                  | Probe queue/storage                               |
| Catalog        | List/get/create, service, repo, mapper, tests                     | Quyền theo role/resource                          |
| Authentication | Bearer guard, verifier port, mặc định từ chối                     | Tài khoản/mật khẩu, JWT, session và authorization |
| Database       | Catalog schema và migration baseline cho DB mới                   | Schema nghiệp vụ khác                             |
| Queue/storage  | BullMQ configuration, worker context, S3 adapter                  | Queue processor và file API                       |

Hướng auth đã chọn là tài khoản/mật khẩu + JWT. Chưa có bảng tài khoản, password
hash, login endpoint hoặc token signing. Verifier placeholder luôn từ chối token;
không dùng nó làm cơ chế đăng nhập. Catalog là mẫu cấu trúc, chưa sẵn sàng cung cấp
nghiệp vụ thật trước khi có authentication và authorization theo US.

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
    identity-access/          # tài khoản, mật khẩu, vai gán, phiên, đăng nhập, /me
    installation/             # use case khởi tạo; không sở hữu bảng
    catalog/                  # module mẫu cấu trúc, KHÔNG đăng ký vào AppModule
prisma/
  schema.prisma               # generator, datasource
  models/                     # audit, organization, identity-access, catalog
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

Rate limit hiện dùng bộ nhớ của từng process, **không dùng Redis**.
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

AppModule chưa dùng queue. WorkerModule chỉ cấu hình BullMQ.
Storage adapter hỗ trợ endpoint S3-compatible; chưa có file ownership/API.
Readiness chỉ chứng minh PostgreSQL có thể ping, không chứng minh schema/migration,
Redis, storage hoặc chức năng đăng nhập đã sẵn sàng.

Compose phục vụ local PostgreSQL, Redis, MinIO; Dockerfile build runtime API/worker.
Migrations chạy riêng trước rollout. Xem [containers](docs/guides/containers.md),
[database rules](docs/rules/database-business.md) và [tests](test/README.md).
