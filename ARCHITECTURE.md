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
Gói remediation tại `a0cf5f1` đã vào `origin/dev` qua PR #7 và #8. Spec/plan,
ADR-0011/0012 (vẫn Proposed) và code chưa được dev review/nghiệm thu.
Kết quả kiểm chứng và phần còn mở nằm trong [báo cáo review G0/G1](docs/reviews/g0-g1-remediation-2026-10-15/README.md).
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
    installation/             # use case khởi tạo; không sở hữu bảng; import IdentityAccessFacadeModule (không import IdentityAccessModule) và chỉ xác thực biến môi trường DB
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

Lỗi DB tạm thời sau khi guard đã thành công tại `/me` được controller ánh xạ thành
503 `SERVICE_UNAVAILABLE` (R-15); readiness thất bại cũng trả 503 với mã này (R-12).
Lỗi không được nhận diện là tạm thời vẫn là 500, không bị che thành lỗi availability.

Rate limit hiện dùng bộ nhớ của từng process, theo **từng route trên mỗi IP**, **không dùng Redis**.
Owner chốt giữ phạm vi này ngày 14/10/2026 (R-07); `test/e2e/rate-limit.e2e-spec.ts` ghim hành vi này.
Throttle đăng nhập theo email là cơ chế riêng: chỉ lần sai được tăng bộ đếm thất bại theo spec;
bộ đếm tăng sau khi kiểm mật khẩu thất bại, trong một câu lệnh nguyên tử (R-06).
TRUST_PROXY_HOPS chỉ cấu hình khi ingress đáng tin cậy; proxy phải thay header
request ID do client gửi. Baseline chưa giải quyết rate limit phân tán.

## Persistence và hạ tầng

Vùng tổ chức-danh tính dùng ràng buộc ở PostgreSQL (migration SQL, ADR-0005): một Organization,
múi giờ bất biến, Department gắn Cost Center `UNIT`, placement không chồng lấn (`btree_gist`),
một grant `SUPER_ADMIN` hiệu lực, audit chỉ ghi thêm. Cột bảng mới snake_case qua `@map`;
`catalog_applications` giữ camelCase tới khi thiết kế lại. `PrismaService` ghim `TimeZone=UTC`
cho mỗi kết nối: adapter-pg đọc/ghi `timestamptz` như thể phiên là UTC. Instant truyền vào raw SQL
dùng chuỗi ISO-8601 (`toISOString()`) kèm `::timestamptz`. Mỗi kết nối gửi hai tham số khởi động ngoài
chuẩn: `options` (`-c TimeZone=UTC`, ghim múi giờ) và `idle_in_transaction_session_timeout`
(backstop N-1 bên dưới; `pg` gửi nó như tham số khởi động riêng, không qua `options`). PgBouncer và pooler
quản lý từ chối tham số không theo dõi (`unsupported startup parameter`) trừ khi liệt kê trong
`ignore_startup_parameters`, và khi liệt kê thì **âm thầm bỏ** tham số đó: mất ghim UTC và/hoặc backstop idle
mà không có cảnh báo. Sau pooler, đặt hai giá trị ở phía server (`ALTER ROLE <role> SET timezone = 'UTC'` và
`ALTER ROLE <role> SET idle_in_transaction_session_timeout = '<ms>'`, hoặc cấu hình theo database) thay vì
dựa vào tham số khởi động — chưa kiểm chứng với pooler nào.

`PrismaService` sở hữu pool qua `createPostgresPool`; `PrismaPg` nhận pool ngoài với
`disposeExternalPool: true` để `$disconnect` đóng pool. `RetireOnTimeoutClient` đóng kết nối ngay
khi query hết timeout phía client; release guard loại kết nối đang trong transaction khỏi pool.
Hợp đồng client chỉ hỗ trợ query text/config dạng Promise hoặc callback được quan sát; từ chối
Submittable (`pg.Query`), config callback, double callback, pipeline và custom Promise trước khi
gửi query. Đây là client nội bộ cho adapter Prisma, không phải wrapper cho mọi API của pg.
`DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` bổ sung backstop ở PostgreSQL (mặc định ít nhất 20 s,
lớn hơn timeout transaction). Khi mất phản hồi COMMIT, dữ liệu có thể đã commit nguyên tử dù
client nhận 503; không tự retry ghi. Xem [spec remediation](docs/workspace/items/g0-g1-remediation-after-rereview/spec.md).

Authentication: tài khoản nội bộ, access token JWT HS256 ngắn hạn cộng refresh token xoay vòng trong cookie
`HttpOnly`/`SameSite=Strict`/`Path=/<prefix>/v1/auth`; phát lại refresh token thì thu hồi phiên. Giao thức
khóa và hợp đồng đăng xuất: [spec nền](docs/workspace/items/foundation-org-identity-boundary/spec.md),
[spec lát 1a](docs/workspace/items/us-01-bootstrap-login-session/spec.md); ADR-0011 còn **Proposed**.
Khởi tạo cài đặt: `pnpm build` rồi `pnpm ops:bootstrap --help` (chạy bởi chính người giữ vai Super Admin;
mật khẩu nhập ở prompt ẩn, không nhận qua tham số hay biến môi trường).

CLI dùng `InstallationConfigurationModule` chỉ validate môi trường và DB; API/worker giữ config
đầy đủ. `IdentityAccessFacadeModule` cung cấp facade cùng repo/hasher dùng chung instance cho
module identity runtime, không kéo JWT, SMTP hay worker vào CLI (R-13).

Catalog dùng unique slug ở PostgreSQL; phân trang sort name/id, transaction
RepeatableRead để page/count dùng cùng snapshot. Snapshot không cố định giữa các
request phân trang khác nhau.

Danh sách AppUser cũng dùng RepeatableRead cho page/count cùng snapshot (R-14). Hai giao dịch snapshot
này (danh sách tài khoản, catalog) gọi thẳng `prisma.$transaction`, nên chạy theo giới hạn interactive mặc
định của Prisma (timeout 5 s, maxWait 2 s), không theo `DB_TRANSACTION_TIMEOUT_MS`/`DB_TRANSACTION_MAX_WAIT_MS`
như `TransactionRunner`; chúng chỉ đọc nên quá hạn không làm mất dữ liệu (danh sách tài khoản trả 503).
Candidates lấy danh sách Employee đã có tài khoản qua repo identity, truyền vào facade organization
để loại trừ trong query trước sort/limit 20; không còn cửa sổ 200/5 000 nhân viên (R-03).
Search `%`, `_`, `\` là ký tự nhập literal (N-6). Redeem kiểm dạng token và tra chủ token trước Argon2;
hash mật khẩu vẫn ở ngoài transaction, rồi kiểm lại trạng thái dưới khóa (R-09).

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
