# Kiến trúc backend

Modular monolith: NestJS + Express, TypeScript, PostgreSQL + Prisma.
API và worker có entry point riêng trong cùng codebase.

## Năng lực hiện có

| Thành phần     | Đã có                                                                                                                                                                                    | Chưa triển khai                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| HTTP           | Zod DTO, response envelope, exception filter, OpenAPI, rate limit                                                                                                                        | API theo các US còn lại                                        |
| Health         | Liveness và PostgreSQL readiness                                                                                                                                                         | Probe queue/storage                                            |
| Catalog        | Source list/get/create, schema và test được giữ; `CatalogModule` chưa mount, chưa có access declaration, không phải mẫu kiến trúc                                                        | G3 quyết giữ, thay hay loại module/bảng; nghiệp vụ và quyền G3 |
| Authentication | Argon2id, JWT/refresh session, guards, CLI bootstrap, `/me`, tài khoản, lời mời, mật khẩu, vai suy ra (Manager, Người duyệt chi), chuyển giao Super Admin, CLI khôi phục (`ops:recover`) | Phân quyền theo phạm vi của lát G3–G7                          |
| Database       | Catalog, audit, organization, identity-access, operating-parameters, data-import, notifications; migration SQL ở `prisma/migrations/`, `TransactionRunner`                               | Schema cho các lát tiếp theo                                   |
| Queue/storage  | S3 adapter, BullMQ configuration; worker gửi SMTP từ outbox PostgreSQL                                                                                                                   | BullMQ queue processor và file API                             |

Bảng mô tả code đang có, không phải trạng thái nghiệm thu. Tiến độ từng lát, revision/PR, trạng thái review và kết quả
gate nằm ở [roadmap](docs/roadmap.md); bằng chứng ở [audit nền tảng 18/10/2026](docs/reviews/be-foundation-audit-2026-10-18/README.md)
và [review G0/G1](docs/reviews/g0-g1-remediation-2026-10-15/README.md). Kế hoạch remediation theo baseline và refactor nền
tảng: [foundation-remediation-handoff-2026-10-18](docs/workspace/items/foundation-remediation-handoff-2026-10-18/spec.md).
Catalog không phải mẫu kiến trúc và chưa cung cấp nghiệp vụ G3: thay đổi mới đặt file theo
[module structure](docs/rules/module-structure.md) và architecture gate thay vì copy một module cụ thể. Tương lai của
catalog do G3 quyết (Owner E1 = A, [audit H4.0](docs/reviews/be-full-src-architecture-audit-2026-10-19/README.md#quyết-định-owner-09b)).

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
    catalog/                  # source/test giữ lại, KHÔNG đăng ký vào AppModule, không phải mẫu; G3 quyết
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
- Module dùng layout phẳng. Chỉ tạo dto/errors/mappers/policies/services khi có nhu cầu thật; module vượt 2 controller
  hoặc 12 file ở root nhóm theo capability (như `identity-access`), tối đa hai tầng thư mục. Folder capability không tự
  động là Nest module; điều kiện tạo Nest submodule, ownership capability, chỗ đặt lỗi và ngưỡng kích thước ở
  [module structure](docs/rules/module-structure.md). `organization` đã nhóm theo capability trừ phần Department còn ở
  root (chuyển tiếp); đích và trạng thái ở
  [ví dụ đích](docs/rules/module-structure.md#ví-dụ-đích-và-trạng-thái-chuyển-tiếp).
- Gốc module **không** public mặc định. Module khác và composition root chỉ import **allowlist** bề mặt công khai ở gốc
  (`<module>.module.ts`, `*-http.module.ts`, `*-facade.module.ts`, facade `<module>.service.ts`, `*.types.ts`,
  `*.errors.ts`); composition root được thêm đúng các entry CLI đã liệt kê. File gốc khác, repo,
  `password-hasher.service` và file thư mục con là private; trong cùng module, gốc và capability cũng không đọc file
  private của nhau (chỉ `*.module.ts` ghép provider). Nest module nghiệp vụ chỉ export contract đúng danh sách. Không
  truy cập bảng thuộc module khác. Chi tiết và ledger: [module structure](docs/rules/module-structure.md#liên-module).
- Cross-module atomic write: facade nhận `tx` của người gọi (`DbTx`); `TransactionRunner.run`
  mở giao dịch Read Committed với `lock_timeout`/`statement_timeout` riêng cho giao dịch.
  Khóa dòng của module khác chỉ qua facade (ví dụ `organization.lockEmployeeForShare(tx, id)`).
- Advisory lock đầu giao dịch (trước khóa dòng): `6173204001` khởi tạo cài đặt; `7300001` đổi vai duyệt;
  `hashtextextended('operating-parameter:<key>')` mỗi tham số. Thứ tự khóa dòng: Employee → AppUser → … (spec nền).
- Lệnh ngoài HTTP (`ops:bootstrap`, `ops:recover`) có đồ thị module riêng, không controller/guard; mọi thay đổi
  dữ liệu đi qua service trong `TransactionRunner` cùng audit như API.
- Không dùng vòng phụ thuộc, generic base repository hoặc scaffold hàng loạt khi chưa có US.

[Architecture tests](src/architecture-boundaries.spec.ts), [structure gates](src/architecture-structure.spec.ts) và
[module graph test](src/module-graph.spec.ts) quét các boundary liệt kê ở
[module structure](docs/rules/module-structure.md#gate-và-legacy-ledger); vi phạm có sẵn nằm trong legacy ledger chỉ được
co lại. Gate không thay thế review dependency và hành vi.

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
503 `SERVICE_UNAVAILABLE`; readiness thất bại cũng trả 503 với mã này.
Lỗi không được nhận diện là tạm thời vẫn là 500, không bị che thành lỗi availability.

Rate limit hiện dùng bộ nhớ của từng process, theo **từng route trên mỗi IP**, **không dùng Redis**.
Đây là phạm vi Owner chốt giữ ([spec lát 1a](docs/workspace/items/us-01-bootstrap-login-session/spec.md));
`test/e2e/rate-limit.e2e-spec.ts` ghim hành vi này.
Throttle đăng nhập theo email là cơ chế riêng: chỉ lần sai được tăng bộ đếm thất bại theo spec;
bộ đếm tăng sau khi kiểm mật khẩu thất bại, trong một câu lệnh nguyên tử.
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
(backstop idle-in-transaction bên dưới; `pg` gửi nó như tham số khởi động riêng, không qua `options`). PgBouncer và pooler
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
(API không đọc hay đặt cookie). Refresh token là token opaque 256 bit, **không** phải JWT: CSDL chỉ lưu SHA-256, xác thực
bằng tra hash, khóa dòng và trạng thái phiên/tài khoản/nhân viên trong PostgreSQL — nguồn có thẩm quyền duy nhất, không
Redis. Phát lại refresh token đã consumed nhưng còn hạn thì thu hồi phiên; web giữ token trong bộ nhớ và client
single-flight refresh ([ADR-0011](docs/decisions/0011-internal-authentication-and-sessions.md)).
Token hết hạn trả 401 trước khi xét consumed và không thu hồi phiên/token kế tiếp (tránh session DoS). Giao thức
khóa và hợp đồng đăng xuất: [spec nền](docs/workspace/items/foundation-org-identity-boundary/spec.md),
[spec lát 1a](docs/workspace/items/us-01-bootstrap-login-session/spec.md); ADR-0011 còn **Proposed**.
Khởi tạo cài đặt: `pnpm build` rồi `pnpm ops:bootstrap --help` (chạy bởi chính người giữ vai Super Admin;
mật khẩu nhập ở prompt ẩn, không nhận qua tham số hay biến môi trường).

CLI dùng `InstallationConfigurationModule` chỉ validate môi trường và DB; API/worker giữ config
đầy đủ. `IdentityAccessFacadeModule` (DatabaseModule + OrganizationModule) cung cấp facade
`IdentityAccessService` cùng `AccountRepo`/`PasswordHasher` dùng chung instance cho `IdentityAccessModule`;
CLI và worker chỉ import module này nên không dựng controller, JWT hay workflow đăng nhập; CLI cũng không kéo
SMTP/outbox. [Module graph test](src/module-graph.spec.ts) đọc metadata Nest thật: mỗi provider token chỉ khai
báo ở một module trong graph API/worker/CLI và các graph không chứa module không dùng.

Lớp HTTP của `audit` và `organization` nằm ở module riêng (`AuditHttpModule`, `OrganizationHttpModule`) mà chỉ
`AppModule` nạp: lệnh khởi tạo và worker import `AuditModule`/`OrganizationModule` chỉ để dùng facade, và module graph
test cấm controller trong hai đồ thị đó. Repo ghi (`AuditRepo`) tách khỏi repo đọc (`AuditQueryRepo`). Trong
`OrganizationModule`, `JobTitleRepo`, `EmployeeRepo`, `ImportLookupRepo` là provider riêng sau capability service mà chỉ
facade dùng; ba repo `CostCenterRepo`, `DepartmentRepo`, `OrganizationRepo` vẫn export theo E4 (như `AccountRepo`, xem lại ở
H4.7) để `OrganizationHttpModule` cùng thư mục dùng chung một instance: `CostCenterService` inject `CostCenterRepo`,
`DepartmentService` inject `DepartmentRepo`; `OrganizationRepo` không còn consumer HTTP từ Wave 2, chỉ giữ export tới lượt
review H4.7/E4. Ánh xạ 503
dùng chung nằm ở `infrastructure/http/errors/service-unavailable.ts` để module không import ruột của module khác.

Catalog dùng unique slug ở PostgreSQL; phân trang sort name/id, transaction
RepeatableRead để page/count dùng cùng snapshot. Snapshot không cố định giữa các
request phân trang khác nhau.

Danh sách AppUser cũng dùng RepeatableRead cho page/count cùng snapshot. Hai giao dịch snapshot
này (danh sách tài khoản, catalog) gọi thẳng `prisma.$transaction`, nên chạy theo giới hạn interactive mặc
định của Prisma (timeout 5 s, maxWait 2 s), không theo `DB_TRANSACTION_TIMEOUT_MS`/`DB_TRANSACTION_MAX_WAIT_MS`
như `TransactionRunner`; chúng chỉ đọc nên quá hạn không làm mất dữ liệu (danh sách tài khoản trả 503).
Băm/kiểm Argon2 tốn CPU chạy **trước** transaction, rồi trạng thái được kiểm lại dưới khóa (giao thức khóa,
[spec nền](docs/workspace/items/foundation-org-identity-boundary/spec.md)). Chi tiết truy vấn
candidates, tìm kiếm literal và thứ tự kiểm khi redeem ở
[spec lát 1b](docs/workspace/items/us-01-account-invitation-activation/spec.md).

AppModule chưa dùng queue. WorkerModule cấu hình BullMQ (chưa có job) và chạy `EmailDispatchLoop`
(`src/email-dispatch.loop.ts`): vòng thăm dò PostgreSQL mỗi `OUTBOX_POLL_INTERVAL_MS` gửi thư trong
EmailOutbox ([ADR-0012](docs/decisions/0012-account-email-delivery.md), vẫn **Proposed**) — không cần Redis cho việc này.
Vòng lặp là orchestration có chủ đích ở composition root vì nối hai module không được import nhau: `notifications`
gửi thư, facade `IdentityAccessService.isActionLinkUsable` trả lời liên kết trong thư còn dùng được không. Import trực
tiếp `notifications/email-dispatcher.service.ts` của vòng lặp và export `EmailDispatcher` hiện là mục legacy ledger,
gỡ ở ROOT.1.
Storage adapter hỗ trợ endpoint S3-compatible; chưa có file ownership/API.
Readiness chỉ chứng minh PostgreSQL có thể ping, không chứng minh schema/migration,
Redis, storage hoặc chức năng đăng nhập đã sẵn sàng.

Compose phục vụ local PostgreSQL, Redis, MinIO; Dockerfile build runtime API/worker.
Migrations chạy riêng trước rollout. Xem [containers](docs/guides/containers.md),
[database rules](docs/rules/database-business.md) và [tests](test/README.md).
