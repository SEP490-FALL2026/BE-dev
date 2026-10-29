# Chi tiết runtime của backend

Chi tiết kỹ thuật tách từ `ARCHITECTURE.md` ngày 29/10/2026
([ADR-0019](../decisions/0019-module-tiers-and-public-api.md)): pipeline HTTP, persistence, xác thực và hạ tầng. Bức
tranh tổng thể và cách đọc code ở [ARCHITECTURE](../../ARCHITECTURE.md).

## HTTP pipeline

```text
RequestIdMiddleware
  → ThrottlerGuard → AccessDeclarationGuard → AuthenticationGuard → AuthorizationGuard
  → ApplicationZodValidationPipe
  → controller → service → repo
  → mapper → success envelope → Zod response validation
```

Exception qua HttpExceptionFilter. Guard chạy trước DTO pipe. Mỗi route phải khai báo **đúng một** trong `@Public()`,
`@AuthenticatedOnly()`, `@RequireRoles(...)`; thiếu hoặc mâu thuẫn thì 500 và log lỗi lập trình
(`AccessDeclarationGuard`, fail closed). `@Public()` bỏ authentication, không bỏ rate limit. Thiếu token: 401
AUTHENTICATION_REQUIRED. Token sai chữ ký/hết hạn, phiên bị thu hồi, tài khoản khóa hoặc nhân viên _đã nghỉ việc_: 401
INVALID_ACCESS_TOKEN, kiểm ở **mỗi** request nên có hiệu lực ngay request kế tiếp. Vai không nằm trong token. Database
không sẵn sàng: 503 TOKEN_VERIFICATION_UNAVAILABLE (route auth: 503 AUTH.UNAVAILABLE), không lộ thông tin nội bộ. Sai
vai: 403 AUTHORIZATION.FORBIDDEN.

Lỗi DB tạm thời sau khi guard đã thành công tại `/me` được controller ánh xạ thành 503 `SERVICE_UNAVAILABLE`; readiness
thất bại cũng trả 503 với mã này. Lỗi không được nhận diện là tạm thời vẫn là 500, không bị che thành lỗi availability.

Rate limit hiện dùng bộ nhớ của từng process, theo **từng route trên mỗi IP**, **không dùng Redis**. Đây là phạm vi
Owner chốt giữ ([spec lát 1a](../workspace/items/us-01-bootstrap-login-session/spec.md));
`test/http/platform/rate-limit.http-spec.ts` ghim hành vi này. Throttle đăng nhập theo email là cơ chế riêng: chỉ lần
sai được tăng bộ đếm thất bại theo spec; bộ đếm tăng sau khi kiểm mật khẩu thất bại, trong một câu lệnh nguyên tử.
TRUST_PROXY_HOPS chỉ cấu hình khi ingress đáng tin cậy; proxy phải thay header request ID do client gửi. Baseline chưa
giải quyết rate limit phân tán.

## Persistence và hạ tầng

Vùng tổ chức-danh tính dùng ràng buộc ở PostgreSQL (migration SQL, ADR-0005): một Organization, múi giờ bất biến,
Department gắn Cost Center `UNIT`, placement không chồng lấn (`btree_gist`), một grant `SUPER_ADMIN` hiệu lực, audit chỉ
ghi thêm. Cột bảng mới snake_case qua `@map`; `PrismaService` ghim `TimeZone=UTC` cho mỗi kết nối: adapter-pg đọc/ghi
`timestamptz` như thể phiên là UTC. Instant truyền vào raw SQL dùng chuỗi ISO-8601 (`toISOString()`) kèm
`::timestamptz`. Mỗi kết nối gửi hai tham số khởi động ngoài chuẩn: `options` (`-c TimeZone=UTC`, ghim múi giờ) và
`idle_in_transaction_session_timeout` (backstop idle-in-transaction bên dưới; `pg` gửi nó như tham số khởi động riêng,
không qua `options`). PgBouncer và pooler quản lý từ chối tham số không theo dõi (`unsupported startup parameter`) trừ
khi liệt kê trong `ignore_startup_parameters`, và khi liệt kê thì **âm thầm bỏ** tham số đó: mất ghim UTC và/hoặc
backstop idle mà không có cảnh báo. Sau pooler, đặt hai giá trị ở phía server (`ALTER ROLE <role> SET timezone = 'UTC'`
và `ALTER ROLE <role> SET idle_in_transaction_session_timeout = '<ms>'`, hoặc cấu hình theo database) thay vì dựa vào
tham số khởi động — chưa kiểm chứng với pooler nào.

`PrismaService` sở hữu pool qua `createPostgresPool`; `PrismaPg` nhận pool ngoài với `disposeExternalPool: true` để
`$disconnect` đóng pool. `RetireOnTimeoutClient` đóng kết nối ngay khi query hết timeout phía client; release guard loại
kết nối đang trong transaction khỏi pool. Hợp đồng client chỉ hỗ trợ query text/config dạng Promise hoặc callback được
quan sát; từ chối Submittable (`pg.Query`), config callback, double callback, pipeline và custom Promise trước khi gửi
query. Đây là client nội bộ cho adapter Prisma, không phải wrapper cho mọi API của pg.
`DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` bổ sung backstop ở PostgreSQL (mặc định ít nhất 20 s, lớn hơn timeout transaction).
Khi mất phản hồi COMMIT, dữ liệu có thể đã commit nguyên tử dù client nhận 503; không tự retry ghi. Xem
[spec remediation](../workspace/items/g0-g1-remediation-after-rereview/spec.md).

Authentication: tài khoản nội bộ, access token JWT HS256 ngắn hạn cộng refresh token xoay vòng. Cả hai nằm trong body
của `POST /auth/login` và `/auth/refresh`; client gửi refresh token trong body của `/auth/refresh` và `/auth/logout`
(API không đọc hay đặt cookie). Refresh token là token opaque 256 bit, **không** phải JWT: CSDL chỉ lưu SHA-256, xác
thực bằng tra hash, khóa dòng và trạng thái phiên/tài khoản/nhân viên trong PostgreSQL — nguồn có thẩm quyền duy nhất,
không Redis. Phát lại refresh token đã consumed nhưng còn hạn thì thu hồi phiên; web giữ token trong bộ nhớ và client
single-flight refresh ([ADR-0011](../decisions/0011-internal-authentication-and-sessions.md)). Token hết hạn trả 401
trước khi xét consumed và không thu hồi phiên/token kế tiếp (tránh session DoS). Giao thức khóa và hợp đồng đăng xuất:
[spec nền](../workspace/items/foundation-org-identity-boundary/spec.md),
[spec lát 1a](../workspace/items/us-01-bootstrap-login-session/spec.md); ADR-0011 còn **Proposed**. Khởi tạo cài đặt:
`pnpm build` rồi `pnpm ops:bootstrap --help` (chạy bởi chính người giữ vai Super Admin; mật khẩu nhập ở prompt ẩn, không
nhận qua tham số hay biến môi trường).

CLI dùng `InstallationConfigurationModule` chỉ validate môi trường và DB; API/worker giữ config đầy đủ.
`IdentityAccessFacadeModule` (DatabaseModule + OrganizationModule) cung cấp facade `IdentityAccessService` cùng bốn
contract của `accounts` (`AccountDirectoryService`, `RoleGrantService`, `ActionLinkService`, `CredentialService`) dùng
chung instance cho `IdentityAccessModule` và `RecoveryModule`; repo AppUser/credential/RoleGrant/action token và
`PasswordHasher` là provider riêng sau các contract đó. CLI và worker chỉ import module này nên không dựng controller,
JWT hay workflow đăng nhập; CLI cũng không kéo SMTP/outbox. `RecoveryModule` (lệnh khôi phục) chỉ export hai entry
`HolderRecoveryService`, `RoleTransferRecoveryService`; provider mà cả API và lệnh khôi phục cần nhưng facade không cần
(ví dụ `SessionRepo`, `RecoveryRepo`, hai port `ACCOUNT_SESSIONS`, `APPROVAL_ROLE_HOLDINGS`) khai ở cả hai module theo
E6, ghim bằng danh sách chính xác. [Module graph test](../../test/gates/module-graph.gate-spec.ts) đọc metadata Nest
thật: mỗi provider token chỉ khai báo ở một module trong mỗi graph API/worker/CLI và các graph không chứa module không
dùng.

Lớp HTTP của `audit`, `organization` và `finance` nằm ở module riêng (`AuditHttpModule`, `OrganizationHttpModule`,
`FinanceHttpModule`) mà chỉ `AppModule` nạp: lệnh khởi tạo và worker import `AuditModule`/`OrganizationModule` chỉ để
dùng facade, và module graph test cấm controller trong hai đồ thị đó. Repo ghi (`AuditRepo`) tách khỏi repo đọc
(`AuditQueryRepo`). Trong `OrganizationModule`, `JobTitleRepo`, `EmployeeRepo`, `ImportLookupRepo`, `DepartmentHeadRepo`
là provider riêng sau capability service mà chỉ facade dùng; ba repo `CostCenterRepo`, `DepartmentRepo`,
`OrganizationRepo` vẫn export theo E4 (ngoại lệ legacy có phạm vi; H4.7 giữ nguyên, xem lại ở G3) để
`OrganizationHttpModule` cùng thư mục dùng chung một instance: `CostCenterService` inject `CostCenterRepo`;
`DepartmentService`, `DepartmentQueryService`, `DepartmentHeadService` inject `DepartmentRepo`; `OrganizationRepo` không
có consumer HTTP từ Wave 2, chỉ giữ export theo E4. Ánh xạ 503 dùng chung nằm ở
`infrastructure/http/errors/service-unavailable.ts` để module không import ruột của module khác.

Danh sách AppUser cũng dùng RepeatableRead cho page/count cùng snapshot. Giao dịch snapshot này (danh sách tài khoản)
gọi thẳng `prisma.$transaction`, nên chạy theo giới hạn interactive mặc định của Prisma (timeout 5 s, maxWait 2 s),
không theo `DB_TRANSACTION_TIMEOUT_MS`/`DB_TRANSACTION_MAX_WAIT_MS` như `TransactionRunner`; chúng chỉ đọc nên quá hạn
không làm mất dữ liệu (danh sách tài khoản trả 503). Băm/kiểm Argon2 tốn CPU chạy **trước** transaction, rồi trạng thái
được kiểm lại dưới khóa (giao thức khóa, [spec nền](../workspace/items/foundation-org-identity-boundary/spec.md)). Chi
tiết truy vấn candidates, tìm kiếm literal và thứ tự kiểm khi redeem ở
[spec lát 1b](../workspace/items/us-01-account-invitation-activation/spec.md).

Không đồ thị nào (API, worker, CLI khôi phục, CLI khởi tạo) mount `QueueInfrastructureModule` (Owner E2 = A, H6.4), và
chỉ API mount `ObjectStorageModule`, qua `CatalogModule`, cho tệp của hợp đồng
([ADR-0014](../decisions/0014-object-storage-mounted-for-contract-documents.md)); `module-graph.spec.ts` khóa cả hai.
Factory của module kho gọi validator riêng (`object-storage.config.ts`), nên production bắt buộc endpoint HTTPS kèm
bucket và khóa truy cập, còn worker và các lệnh không đọc các biến đó; `queue.config.ts` giữ nguyên cho lát nào mount
hàng đợi, và `env-schema.ts` không đọc các biến kho hay hàng đợi. WorkerModule cũng chạy `RequestWorkLoop`
(`src/worker/request-work.job.ts`): vòng thăm dò PostgreSQL mỗi `REQUEST_WORK_INTERVAL_MS` (1 000–300 000, mặc định
10 000) gọi `StepRedeterminationSweepService.sweep` của `requests` (thử giao lại bước đang chờ, lấy lại bước của người
đã nghỉ việc, mỗi ngày một lần chạy bảng định tuyến trên mọi bước nhu cầu đang giữ), mỗi Request một transaction, một
lượt không chồng lượt trước, lỗi chỉ ghi tên; cùng lượt đó gọi `StepSlaSweepService.sweep` (vào ngày làm việc của tổ
chức, nhắc các bước quá SLA và Request quá hạn ở hàng đợi trình rồi báo nghẽn tới Super Admin: mỗi đối tượng một
transaction dưới khóa `FOR UPDATE SKIP LOCKED` của dòng bước hay Request, ràng buộc duy nhất của CSDL giữ đúng một nhắc
mỗi đối tượng mỗi ngày làm việc nên nhiều worker chạy song song vẫn một nhắc; không ghi gì vào `access_requests`,
`access_request_steps`, bản ghi duyệt hay quyết định chi) rồi `RequestStatusProjectorService.project` (bộ chiếu audit
event của Request vào hộp thư trong ứng dụng: khóa con trỏ bằng `FOR UPDATE SKIP LOCKED`, mỗi lô tối đa 200 sự kiện một
transaction, tối đa 5 lô một lượt, độ trễ đọc `DB_TRANSACTION_TIMEOUT_MS` + 5 giây, nên thông báo tới chậm nhất cỡ 15
giây cộng chu kỳ vòng; mỗi việc của lượt thử riêng nên việc này lỗi không chặn việc kia); đồ thị worker nạp
`RequestsWorkFacadeModule` (không controller). Chạy một lượt bằng tay để kiểm: gọi
`RequestStatusProjectorService.project(now)` từ test tích hợp (`test/support/status-harness.ts`),
`StepSlaSweepService.sweep(now)` (`test/support/sla-harness.ts`, `sweepAt(now)`: `now` là tham số nên test dựng được
ngày làm việc, cuối tuần và ngày nghỉ), hay khởi động worker. WorkerModule chạy `EmailDispatchLoop`
(`src/worker/email-dispatch.job.ts`): vòng thăm dò PostgreSQL mỗi `OUTBOX_POLL_INTERVAL_MS` gửi thư trong EmailOutbox
([ADR-0012](../decisions/0012-account-email-delivery.md), vẫn **Proposed**) — không cần Redis cho việc này. Vòng lặp là
orchestration có chủ đích ở composition root vì nối hai module không được import nhau: `notifications` gửi thư qua hợp
đồng công khai `EmailDeliveryService.dispatchDue` (tệp riêng `email-delivery.service.ts` từ ROOT-HARDEN.1, đăng ký ở
`PUBLIC_CONTRACT_EXPORTS`), facade `IdentityAccessService.isActionLinkUsable` trả lời liên kết trong thư còn dùng được
không. `EmailDispatcher`, repo, cipher và transport vẫn private (ROOT.1). Mọi lệnh (`src/cli/<lệnh>/`, bảng
`src/cli/commands.ts`) dùng chung khung `src/cli/run-command.ts` để ghi lỗi, tắt
log Nest và nhận `EnvironmentValidationError` bằng `instanceof`; gate cấu trúc quét cả root và infrastructure để chặn so
khớp lỗi theo `error.name`.

Lệnh vận hành theo [operational commands](../rules/operational-commands.md). `InspectionModule` (H6.1) chỉ xác thực biến
DB, import `ReadOnlyDatabaseSessionModule` nên mọi phiên PostgreSQL mở `default_transaction_read_only=on`, và đọc qua
`OrganizationService`, `AuditService.countByAction` và `IdentityAccessInspectionService`
(`identity-access-inspection-facade.module.ts`, chỉ trong đồ thị này). `DevSeedModule` (H6.2) chỉ xác thực biến DB, kiểm
ba chốt local trước transaction và ghi qua `OrganizationService`, `LocalDemoAccountService`
(`identity-access-local-seed-facade.module.ts`, chỉ trong đồ thị này) và `AuditService`. Không đồ thị lệnh nào tới được
từ `AppModule`/`WorkerModule` (`module-graph.spec.ts`, `operational-commands.spec.ts`). Storage adapter hỗ trợ endpoint
S3-compatible; chưa có file ownership/API. Readiness chỉ chứng minh PostgreSQL có thể ping, không chứng minh
schema/migration hoặc chức năng đăng nhập đã sẵn sàng.

Cấu hình: `env-schema.ts` là hợp đồng validation công khai duy nhất (`validateEnvironment`, `EnvironmentVariables`,
`EnvironmentValidationError`, `validateInstallationEnvironment`, `resolveDatabaseUrl`), ghép từ các tệp con dưới cap 400
dòng. `database-url.ts` không import gì để `prisma.config.ts` dùng cùng quy tắc `DATABASE_URL` mà không nạp Nest hay
schema đầy đủ. Secret theo Owner E3 = C: chỉ `NODE_ENV=test` có fallback công khai cho bốn secret; development phải tự
khai, development và production từ chối mọi giá trị công khai trong repository.

Compose local mặc định chỉ chạy PostgreSQL; Redis và MinIO chỉ chạy với profile `queue`/`storage`. Compose production
không còn Redis. Production tách ba danh tính PostgreSQL (H7): API/worker dùng runtime role chỉ có DML và tự từ chối
khởi động khi là superuser/owner (`RuntimeDatabaseRoleModule`, chỉ `AppModule`/`WorkerModule` import); backup,
preflight, migration và `ops:db-roles reconcile` dùng deploy role sở hữu schema; superuser của cluster chỉ cho
`ops:db-roles provision`. Dockerfile build runtime API/worker. Migrations chạy riêng trước rollout. Xem
[containers](containers.md), [database rules](../rules/database-business.md) và [tests](../../test/README.md).
