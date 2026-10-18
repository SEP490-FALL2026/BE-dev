# Kiến trúc backend

Modular monolith: NestJS + Express, TypeScript, PostgreSQL + Prisma.
API và worker có entry point riêng trong cùng codebase.

## Trạng thái foundation

| Thành phần     | Đã có                                                                                                                                                                                    | Chưa triển khai                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| HTTP           | Zod DTO, response envelope, exception filter, OpenAPI, rate limit                                                                                                                        | API theo các US còn lại                          |
| Health         | Liveness và PostgreSQL readiness                                                                                                                                                         | Probe queue/storage                              |
| Catalog        | Source list/get/create và tests làm mẫu; không mount HTTP                                                                                                                                | Nghiệp vụ catalog G3 và quyền theo role/resource |
| Authentication | Argon2id, JWT/refresh session, guards, CLI bootstrap, `/me`, tài khoản, lời mời, mật khẩu, vai suy ra (Manager, Người duyệt chi), chuyển giao Super Admin, CLI khôi phục (`ops:recover`) | Phân quyền theo phạm vi của lát G3–G7            |
| Database       | Catalog, audit, organization, identity-access, notifications; 5 migration và `TransactionRunner`                                                                                         | Schema cho các lát tiếp theo                     |
| Queue/storage  | S3 adapter, BullMQ configuration; worker gửi SMTP từ outbox PostgreSQL                                                                                                                   | BullMQ queue processor và file API               |

G0 và lát 1a/1b đã merge qua PR #4 (`64073c4`), có 16 operation HTTP.
Gói remediation tại `a0cf5f1` đã vào `origin/dev` qua PR #7 và #8. Spec/plan,
ADR-0011/0012 (vẫn Proposed) và code chưa được dev review/nghiệm thu.
Kết quả kiểm chứng và phần còn mở nằm trong [báo cáo review G0/G1](docs/reviews/g0-g1-remediation-2026-10-15/README.md).
Catalog là mẫu cấu trúc, chưa cung cấp nghiệp vụ G3.

## Bản đồ source

```text
src/
  main.ts, bootstrap.ts       # HTTP, CORS, versioning, Swagger
  app.module.ts               # ghép module API
  worker.ts, worker.module.ts # worker application context
  installation-cli.ts         # lệnh khởi tạo một lần, ngoài HTTP (pnpm ops:bootstrap)
  recovery-cli.ts, recovery-cli.module.ts  # lệnh khôi phục Super Admin theo phiếu, ngoài HTTP (pnpm ops:recover)
  core/                       # thuần TypeScript: pagination, email, business-date
  infrastructure/
    config/                   # environment validation
    http/                     # pipe, envelope, serializer, filter
    security/                 # guard khai báo/xác thực/phân quyền, verifier port, rate limiting
    database/                 # Prisma service, TransactionRunner
    queue/                    # BullMQ connection
    mail/                     # port MailTransport và SMTP adapter (nodemailer)
    object-storage/           # port và S3-compatible adapter
    observability/            # request context, request ID, logger
    health/                   # health controller
  modules/
    audit/                    # AuditEvent chỉ ghi thêm (facade record(tx, event)); tra cứu cho Super Admin ở AuditHttpModule riêng
    organization/             # tổ chức, Cost Center (vòng đời), phòng + hồ sơ + giai đoạn trưởng phòng, dự án, chức vụ, nhân viên + placement; API ở OrganizationHttpModule riêng (lớp HTTP này được gọi IdentityAccessFacadeModule để kiểm IT Admin phụ trách — ngoại lệ duy nhất của chiều organization → identity)
    operating-parameters/     # tham số vận hành (giá trị, lịch sử, ngày không làm việc) + API Super Admin
    data-import/              # import nhân sự CSV xem trước – xác nhận (employee_imports); gọi organization qua facade
    onboarding/               # checklist khởi tạo: tổng hợp đọc từ organization và identity-access, không sở hữu bảng
    identity-access/          # facade, module, types ở gốc; dto/, errors/ dùng chung; recovery.* (RecoveryModule, chỉ nạp bởi lệnh khôi phục)
      auth/                   # đăng nhập, refresh/logout, phiên + refresh token + throttle (session.repo), token, mật khẩu
      accounts/               # truy vấn, tạo/mời/kích hoạt, khóa/vai, chuyển giao Super Admin; account.repo (AppUser, credential, vai, action token)
      approval-roles/         # Người duyệt chi, người thay thế, approver dự phòng (approval_role_holders)
      access/                 # /me và verifier access token cho guard
    notifications/            # EmailOutbox (mã hóa payload), dispatcher gửi thư; không import identity-access
    installation/             # use case khởi tạo; không sở hữu bảng; import IdentityAccessFacadeModule (không import IdentityAccessModule) và chỉ xác thực biến môi trường DB
    catalog/                  # module mẫu cấu trúc, KHÔNG đăng ký vào AppModule
prisma/
  schema.prisma               # generator, datasource
  models/                     # audit, organization, identity-access, operating-parameters, data-import, notifications, catalog
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
- Module dùng layout phẳng. Chỉ tạo dto/errors/mappers/policies/services khi có nhu cầu thật; module đã có
  nhiều capability (như `identity-access`) nhóm theo capability, tối đa hai tầng thư mục.
- Module khác chỉ import file ở **gốc** module (facade, module, types, errors public); không import repo,
  `password-hasher.service` hay file trong thư mục con, và không truy cập bảng thuộc module khác.
- Cross-module atomic write: facade nhận `tx` của người gọi (`DbTx`); `TransactionRunner.run`
  mở giao dịch Read Committed với `lock_timeout`/`statement_timeout` riêng cho giao dịch.
  Khóa dòng của module khác chỉ qua facade (ví dụ `organization.lockEmployeeForShare(tx, id)`).
- Advisory lock đầu giao dịch (trước khóa dòng): `6173204001` khởi tạo cài đặt; `7300001` đổi vai duyệt;
  `hashtextextended('operating-parameter:<key>')` mỗi tham số. Thứ tự khóa dòng: Employee → AppUser → … (spec nền).
- Lệnh ngoài HTTP (`ops:bootstrap`, `ops:recover`) có đồ thị module riêng, không controller/guard; mọi thay đổi
  dữ liệu đi qua service trong `TransactionRunner` cùng audit như API.
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

Authentication: tài khoản nội bộ, access token JWT HS256 ngắn hạn cộng refresh token xoay vòng. Cả hai nằm trong body
của `POST /auth/login` và `/auth/refresh`; client gửi refresh token trong body của `/auth/refresh` và `/auth/logout`
(API không đọc hay đặt cookie). Phát lại refresh token đã consumed nhưng còn hạn thì thu hồi phiên.
Token hết hạn trả 401 trước khi xét consumed và không thu hồi phiên/token kế tiếp (quyết định Task 1B, tránh session DoS). Giao thức
khóa và hợp đồng đăng xuất: [spec nền](docs/workspace/items/foundation-org-identity-boundary/spec.md),
[spec lát 1a](docs/workspace/items/us-01-bootstrap-login-session/spec.md); ADR-0011 còn **Proposed**.
Khởi tạo cài đặt: `pnpm build` rồi `pnpm ops:bootstrap --help` (chạy bởi chính người giữ vai Super Admin;
mật khẩu nhập ở prompt ẩn, không nhận qua tham số hay biến môi trường).

CLI dùng `InstallationConfigurationModule` chỉ validate môi trường và DB; API/worker giữ config
đầy đủ. `IdentityAccessFacadeModule` (DatabaseModule + OrganizationModule) cung cấp facade
`IdentityAccessService` cùng `AccountRepo`/`PasswordHasher` dùng chung instance cho `IdentityAccessModule`;
CLI và worker chỉ import module này nên không dựng controller, JWT hay workflow đăng nhập; CLI cũng không kéo
SMTP/outbox (R-13). [Module graph test](src/module-graph.spec.ts) đọc metadata Nest thật: mỗi provider token chỉ khai
báo ở một module trong graph API/worker/CLI và các graph không chứa module không dùng.

Lớp HTTP của `audit` và `organization` nằm ở module riêng (`AuditHttpModule`, `OrganizationHttpModule`) mà chỉ
`AppModule` nạp: lệnh khởi tạo và worker import `AuditModule`/`OrganizationModule` chỉ để dùng facade, và module graph
test cấm controller trong hai đồ thị đó. Repo ghi (`AuditRepo`) tách khỏi repo đọc (`AuditQueryRepo`); `OrganizationRepo` được
`OrganizationModule` export chỉ để `OrganizationHttpModule` cùng thư mục dùng chung một instance (như `AccountRepo`). Ánh xạ 503
dùng chung nằm ở `infrastructure/http/errors/service-unavailable.ts` để module không import ruột của module khác.

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
facade `IdentityAccessService.isInvitationLinkUsable` trả lời liên kết trong thư còn dùng được không. Quản trị tài khoản (lát 1b): route
`/app-users`, `/account-candidates` chỉ Super Admin; kích hoạt qua `POST /auth/invitations/redeem`.
Storage adapter hỗ trợ endpoint S3-compatible; chưa có file ownership/API.
Readiness chỉ chứng minh PostgreSQL có thể ping, không chứng minh schema/migration,
Redis, storage hoặc chức năng đăng nhập đã sẵn sàng.

Compose phục vụ local PostgreSQL, Redis, MinIO; Dockerfile build runtime API/worker.
Migrations chạy riêng trước rollout. Xem [containers](docs/guides/containers.md),
[database rules](docs/rules/database-business.md) và [tests](test/README.md).
