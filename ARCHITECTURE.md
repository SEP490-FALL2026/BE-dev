# Kiến trúc backend

Modular monolith: NestJS + Express, TypeScript, PostgreSQL + Prisma.
API và worker có entry point riêng trong cùng codebase.

## Năng lực hiện có

| Thành phần     | Đã có                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Chưa triển khai                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| HTTP           | Zod DTO, response envelope, exception filter, OpenAPI, rate limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | API theo các US còn lại                                  |
| Health         | Liveness và PostgreSQL readiness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Probe queue/storage                                      |
| Catalog        | Từ điển nhà cung cấp dùng chung (`/vendor-dictionary/*`, chỉ IT Admin): nhóm, dòng dịch vụ, nhận diện theo tên/tên miền/mô tả giao dịch, xử lý đề xuất; danh mục ứng dụng (`/applications`: IT Admin ghi, Finance đọc; nhà cung cấp của tổ chức; Business Owner đang làm việc; cờ liên lạc; đề xuất từ điển) nhóm chức năng (`/functional-groups`) và gói của ứng dụng (`/plans`: kiểu cấp K1/K2/K4/K5, mô hình giá, mức kiểm soát, hồ sơ workspace K2), nhà cung cấp của tổ chức (`/vendors`) hồ sơ thuế do Finance khai (`/vendors/{id}/tax-profile`, ước tính thuế) thuê bao/khoản mua vĩnh viễn có giá và ảnh chụp quy đổi (`/subscriptions`, mốc báo hủy suy ra khi đọc) điều khoản gói với cảnh báo rà soát suy ra khi đọc (`/plans/{id}/terms`, `/plan-warnings`) và lịch sử Business Owner với cảnh báo người đã nghỉ (`/business-owner-warnings`, `/applications/{id}/business-owners`) và phân bổ chi phí thuê bao không tính theo người (`/subscriptions/{id}/cost-allocation`: Finance ghi, IT Admin đọc; dữ liệu của `finance`) và bộ công cụ chuẩn theo phòng × chức vụ có phiên bản (`/standard-toolsets*`: IT Admin ghi kèm lý do, trưởng phòng đọc phòng mình, nhân viên đọc của mình; không cấp, không thu hồi) và việc ngừng dùng ứng dụng (`/applications/{id}/retirement*`, `/retire`: Business Owner hiện tại xác nhận, chặn bởi seat đang giữ và thuê bao còn hiệu lực) và hợp đồng cùng tệp đính kèm (`/contracts*`, `/documents*`: tệp qua liên kết ký sẵn, chỉ IT Admin và Finance mở, liên kết sống 300 giây và không lưu) và các chốt seat của thuê bao (nháp và ứng dụng đã ngừng không nhận seat; đọc số seat qua `SeatOccupancyRegistry`, ADR-0013 mục 4); facade `CatalogService` (mục tiêu của seat: thuê bao hoặc gói nội bộ) cho `licensing`; mẫu cũ đã gỡ ở `g3-catalog-foundation`; `finance` (C7), `licensing` (C3) thêm theo từng lát G3/G4 ([ADR-0013](docs/decisions/0013-catalog-finance-licensing-contexts.md)) | Nghiệp vụ và quyền G3/G4                                 |
| Licensing      | Assignment của seat (`/license-assignments`, `/subscriptions/{id}/seat-usage`: chỉ IT Admin), import hiện trạng seat xem trước – xác nhận (`/seat-baseline-imports*`), đóng giai đoạn khởi tạo (`/seat-baseline*`), đổi người chịu trách nhiệm tài khoản dịch vụ, hàng đợi tác vụ cấp phát (`/provisioning-tasks*`: lệnh cấp qua cổng `GRANT_REQUEST_GATE`, nhận việc, hoàn tất kèm bằng chứng, ghi không làm được; chỉ IT Admin; cổng mặc định từ chối mọi Request cho tới khi G5 nối), phân loại lỗi và ba quyết định trên tác vụ lỗi (`/provisioning-tasks/{id}/retry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | hand-off                                                 | close-failed`; connector báo lỗi qua `LicensingService.recordProvisioningFailure`); kho khóa bản quyền của khoản mua K4 (`/license-keys*`: nhập lô, danh sách che bớt, xem đầy đủ có audit mỗi lần; chỉ IT Admin; khóa mã hóa AES-256-GCM ở trạng thái nghỉ); chưa có Request thật, gán khóa vào Assignment, thiết bị và connector |
| Finance        | Tiền và quy đổi (`src/core/money`, ADR-0007), ước tính thuế (`core/money/tax-estimate`), bảng tiền tệ, tỷ giá nhập tay (`/currencies`, `/exchange-rates`), hồ sơ thuế nhà cung cấp có phiên bản (`finance/tax-profile`), phân bổ chi phí thuê bao theo tỷ lệ tổng 100% có phiên bản (`finance/cost-allocation`), facade `FinanceService` (`parseMoney`, `snapshotMoney`) và use case `ExchangeRateService`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Nguồn tỷ giá công khai, hóa đơn và báo cáo chi phí (G8)  |
| Authentication | Argon2id, JWT/refresh session, guards, CLI bootstrap, `/me`, tài khoản, lời mời, mật khẩu, vai suy ra (Manager, Người duyệt chi), chuyển giao Super Admin, CLI khôi phục (`ops:recover`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Phân quyền theo phạm vi của lát G3–G7                    |
| Database       | Audit, finance, organization, identity-access, operating-parameters, data-import, notifications; migration SQL ở `prisma/migrations/`, `TransactionRunner`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Schema cho các lát tiếp theo                             |
| Queue/storage  | Kho đối tượng S3 do API mount cho tệp của hợp đồng (ADR-0014; lỗi kho → 503); BullMQ vẫn chưa mount (E2 = A); worker gửi SMTP từ outbox PostgreSQL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | BullMQ queue processor (G7/G9), vòng đời xóa và quét tệp |

Bảng mô tả code đang có, không phải trạng thái nghiệm thu. Tiến độ từng lát, revision/PR, trạng thái review và kết quả
gate nằm ở [roadmap](docs/roadmap.md); bằng chứng ở [audit nền tảng 18/10/2026](docs/reviews/be-foundation-audit-2026-10-18/README.md)
và [review G0/G1](docs/reviews/g0-g1-remediation-2026-10-15/README.md). Kế hoạch remediation theo baseline và refactor nền
tảng: [foundation-remediation-handoff-2026-10-18](docs/workspace/items/foundation-remediation-handoff-2026-10-18/spec.md).
Mẫu `catalog` cũ đã bị thay (Owner E1 = A, [audit H4.0](docs/reviews/be-full-src-architecture-audit-2026-10-19/README.md#quyết-định-owner-09b);
quyết định ở [ADR-0013](docs/decisions/0013-catalog-finance-licensing-contexts.md)): thay đổi mới đặt file theo
[module structure](docs/rules/module-structure.md) và architecture gate.

## Bản đồ source

```text
src/
  main.ts, bootstrap.ts       # HTTP, CORS, versioning, Swagger
  app.module.ts               # ghép module API
  worker.ts, worker.module.ts # worker application context
  installation-cli.ts         # lệnh khởi tạo một lần, ngoài HTTP (pnpm ops:bootstrap)
  recovery-cli.ts, recovery-cli.module.ts  # lệnh khôi phục Super Admin theo phiếu, ngoài HTTP (pnpm ops:recover)
  inspect-cli.ts              # kiểm trạng thái cài đặt chỉ đọc (pnpm ops:inspect)
  dev-seed-cli.ts             # dữ liệu demo chỉ local (pnpm dev:seed -- --confirm-local)
  operational-commands.spec.ts  # gate của rule lệnh vận hành
  core/                       # thuần TypeScript: pagination, email, business-date, money (tiền, tỷ giá, quy đổi — ADR-0007)
  infrastructure/
    cli/                      # helper chung của hai CLI: ghi lỗi, logger im lặng, nhận lỗi env bằng instanceof
    config/                   # env-schema.ts (hợp đồng validation công khai) ghép database-url/database-environment/secret-environment/environment-validation
    http/                     # pipe, envelope, serializer, filter
    security/                 # guard khai báo/xác thực/phân quyền, verifier port, rate limiting
    database/                 # Prisma service, TransactionRunner, ReadOnlyDatabaseSessionModule (phiên chỉ đọc của lệnh inspect)
    queue/                    # BullMQ connection + queue.config.ts (chưa mount)
    mail/                     # port MailTransport và SMTP adapter (nodemailer)
    object-storage/           # port (ký liên kết, head, readPrefix, delete), S3-compatible adapter (lỗi kho → ObjectStorageUnavailableError) + object-storage.config.ts (chỉ API mount, ADR-0014)
    observability/            # request context, request ID, logger
    health/                   # health controller
  modules/
    audit/                    # AuditEvent chỉ ghi thêm (facade record(tx, event)); tra cứu cho Super Admin ở AuditHttpModule riêng
    organization/             # tổ chức, Cost Center (vòng đời), phòng + hồ sơ + giai đoạn trưởng phòng, dự án, chức vụ, nhân viên + placement; API ở OrganizationHttpModule riêng (lớp HTTP này được gọi IdentityAccessFacadeModule để kiểm IT Admin phụ trách — ngoại lệ duy nhất của chiều organization → identity)
    operating-parameters/     # tham số vận hành (giá trị, lịch sử, ngày không làm việc) + đồng tiền báo cáo (`/reporting-currency`, khóa ở CSDL khi có tỷ giá hoặc giá quy đổi) + API Super Admin
    data-import/              # gốc: module, facade DataImportService (latestEmployeeImport) + data-import.types; gọi organization qua facade
      employee-import/        # import nhân sự CSV xem trước – xác nhận (employee_imports): controller, service, repo, đọc file, quy tắc dòng, audit, lỗi + mapper HTTP
      seat-baseline-import/   # import hiện trạng seat của một thuê bao hoặc một gói nội bộ (seat_baseline_imports): đọc file (`core/csv`), phán xét dòng thuần, service xem trước/xác nhận một lần/hủy, controller; ghi Assignment qua facade `LicensingService`
    onboarding/               # checklist khởi tạo năm bước: tổng hợp đọc từ organization, identity-access, facade data-import, `CatalogService` và `LicensingService`, không sở hữu bảng
    identity-access/          # gốc: module, facade module, facade, types, lỗi public, port dùng chung ACCOUNT_SESSIONS (identity-access.ports.ts), recovery.module (RecoveryModule, chỉ nạp bởi lệnh khôi phục); dto/, mappers/, policies/ dùng chung (hai capability trở lên)
      auth/                   # đăng nhập, refresh/logout, phiên + refresh token + throttle (session.repo), đổi/đặt lại mật khẩu; SessionDirectoryService hiện thực port ACCOUNT_SESSIONS
      accounts/               # truy vấn, tạo/mời/kích hoạt, khóa/vai, chuyển giao Super Admin; repo theo aggregate (AppUser, credential, RoleGrant, action token) sau contract AccountDirectory/RoleGrant/ActionLink/Credential service; hasher và chính sách mật khẩu
      approval-roles/         # Người duyệt chi, người thay thế, approver dự phòng (approval_role_holders); ApprovalRoleDirectoryService hiện thực port APPROVAL_ROLE_HOLDINGS
      access/                 # /me và verifier access token cho guard
      recovery/               # lệnh ops:recover (E7): entry HolderRecoveryService, RoleTransferRecoveryService, tham số, lỗi, type, recovery.repo
    catalog/                  # C1 phần G3 (ADR-0013): từ điển nhà cung cấp (`vendor-dictionary/`: nhóm, dòng, hàm nhận diện thuần `vendor-matcher.ts`, đề xuất), `catalog-entry/` (ứng dụng), `vendor/` (nhà cung cấp của tổ chức), `functional-group/`, `plan/` (gói, hồ sơ workspace), `vendor/` (nhà cung cấp, route hồ sơ thuế; dùng facade `FinanceService`), `subscription/` (thuê bao, nháp, mốc báo hủy), `plan-terms/` (điều khoản, ý kiến, cảnh báo rà soát), `standard-toolset/` (bộ công cụ chuẩn có phiên bản), `contract/` (hợp đồng tối thiểu, tệp đính kèm qua `OBJECT_STORAGE`), `mappers/` (audit dùng chung); CatalogModule gồm controller, chưa export gì; không import `finance`/`licensing`
    finance/                  # C7 phần G3 (ADR-0013): tiền tệ và tỷ giá nhập tay (`exchange-rate/`, `currency/`), facade `FinanceService` (parseMoney, snapshotMoney); API ở FinanceHttpModule riêng; không import `catalog`
    licensing/                # C3 phần G4 (ADR-0013): `assignment/` (license_assignments: bất biến INV-01/02/07 ở CSDL, ghi hàng loạt cho import khởi tạo, đổi người chịu trách nhiệm tài khoản dịch vụ, liệt kê, seat trống) và `seat-baseline/` (đóng giai đoạn khởi tạo) và `provisioning/` (provisioning_tasks: vòng đời tác vụ, bằng chứng, hàng đợi theo phòng, lỗi và quyết định của IT Admin; cổng Request `GRANT_REQUEST_GATE` ở `licensing.types.ts`) và `license-key/` (license_keys: bản mã và dấu vân tay HMAC, chính sách lô thuần, `LicenseKeyCipher` dựng từ cấu hình trong `LicensingModule`); facade `LicensingService`; đọc `catalog` qua `CatalogService`
    notifications/            # EmailOutbox (mã hóa payload), dispatcher gửi thư; không import identity-access
    installation/             # use case khởi tạo; không sở hữu bảng; import IdentityAccessFacadeModule (không import IdentityAccessModule) và chỉ xác thực biến môi trường DB
      inspect/                # ops:inspect (E8 = A): InspectionModule, đọc _prisma_migrations, báo cáo, tham số
      dev-seed/               # dev:seed (E8 = A): DevSeedModule, chốt local, fixture, kế hoạch, generator mật khẩu, báo cáo
prisma/
  schema.prisma               # generator, datasource
  models/                     # audit, organization, identity-access, operating-parameters, data-import, notifications, finance, catalog, licensing
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
  [module structure](docs/rules/module-structure.md). `organization` đã nhóm theo capability (`cost-center/`,
  `department/`, `employee/`, `job-title/`, `project/`), root chỉ còn module, HTTP module, facade, type và lỗi public;
  `data-import` giữ capability `employee-import/` sau facade `DataImportService` (H8); chi tiết ở
  [ví dụ đích](docs/rules/module-structure.md#ví-dụ-đích-và-trạng-thái-chuyển-tiếp).
- Gốc module **không** public mặc định. Module khác và composition root chỉ import **allowlist** bề mặt công khai ở gốc
  (`<module>.module.ts`, `*-http.module.ts`, `*-facade.module.ts`, facade `<module>.service.ts`, `*.types.ts`,
  `*.errors.ts`); composition root được thêm đúng các entry CLI đã liệt kê. File gốc khác, repo,
  `password-hasher.service` và file thư mục con là private; trong cùng module, gốc, capability và thư mục dùng chung
  (khi nó là importer) chỉ đọc file của phần khác khi file đó là bề mặt public ở gốc hoặc contract nội module đăng ký
  chính xác (registry GATE.2, không suy từ hậu tố tên file; chỉ `*.module.ts` ghép mọi provider); thư mục dùng chung
  là đích tự do. Nest module nghiệp vụ chỉ export contract đúng danh sách. Không
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
`PrismaService` ghim `TimeZone=UTC`
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
`IdentityAccessService` cùng bốn contract của `accounts` (`AccountDirectoryService`, `RoleGrantService`,
`ActionLinkService`, `CredentialService`) dùng chung instance cho `IdentityAccessModule` và `RecoveryModule`; repo
AppUser/credential/RoleGrant/action token và `PasswordHasher` là provider riêng sau các contract đó. CLI và worker chỉ
import module này nên không dựng controller, JWT hay workflow đăng nhập; CLI cũng không kéo SMTP/outbox.
`RecoveryModule` (lệnh khôi phục) chỉ export hai entry `HolderRecoveryService`, `RoleTransferRecoveryService`; provider
mà cả API và lệnh khôi phục cần nhưng facade không cần (ví dụ `SessionRepo`, `RecoveryRepo`, hai port `ACCOUNT_SESSIONS`,
`APPROVAL_ROLE_HOLDINGS`) khai ở cả hai module theo E6, ghim bằng danh sách chính xác. [Module graph
test](src/module-graph.spec.ts) đọc metadata Nest thật: mỗi provider token chỉ khai báo ở một module trong mỗi graph
API/worker/CLI và các graph không chứa module không dùng.

Lớp HTTP của `audit`, `organization` và `finance` nằm ở module riêng (`AuditHttpModule`, `OrganizationHttpModule`,
`FinanceHttpModule`) mà chỉ
`AppModule` nạp: lệnh khởi tạo và worker import `AuditModule`/`OrganizationModule` chỉ để dùng facade, và module graph
test cấm controller trong hai đồ thị đó. Repo ghi (`AuditRepo`) tách khỏi repo đọc (`AuditQueryRepo`). Trong
`OrganizationModule`, `JobTitleRepo`, `EmployeeRepo`, `ImportLookupRepo`, `DepartmentHeadRepo` là provider riêng sau
capability service mà chỉ facade dùng; ba repo `CostCenterRepo`, `DepartmentRepo`, `OrganizationRepo` vẫn export theo E4
(ngoại lệ legacy có phạm vi; H4.7 giữ nguyên, xem lại ở G3) để `OrganizationHttpModule` cùng thư mục
dùng chung một instance: `CostCenterService` inject `CostCenterRepo`; `DepartmentService`, `DepartmentQueryService`,
`DepartmentHeadService` inject `DepartmentRepo`; `OrganizationRepo` không có consumer HTTP từ Wave 2, chỉ giữ export theo
E4. Ánh xạ 503
dùng chung nằm ở `infrastructure/http/errors/service-unavailable.ts` để module không import ruột của module khác.

Danh sách AppUser cũng dùng RepeatableRead cho page/count cùng snapshot. Giao dịch snapshot
này (danh sách tài khoản) gọi thẳng `prisma.$transaction`, nên chạy theo giới hạn interactive mặc
định của Prisma (timeout 5 s, maxWait 2 s), không theo `DB_TRANSACTION_TIMEOUT_MS`/`DB_TRANSACTION_MAX_WAIT_MS`
như `TransactionRunner`; chúng chỉ đọc nên quá hạn không làm mất dữ liệu (danh sách tài khoản trả 503).
Băm/kiểm Argon2 tốn CPU chạy **trước** transaction, rồi trạng thái được kiểm lại dưới khóa (giao thức khóa,
[spec nền](docs/workspace/items/foundation-org-identity-boundary/spec.md)). Chi tiết truy vấn
candidates, tìm kiếm literal và thứ tự kiểm khi redeem ở
[spec lát 1b](docs/workspace/items/us-01-account-invitation-activation/spec.md).

Không đồ thị nào (API, worker, CLI khôi phục, CLI khởi tạo) mount `QueueInfrastructureModule` (Owner E2 = A, H6.4), và
chỉ API mount `ObjectStorageModule`, qua `CatalogModule`, cho tệp của hợp đồng ([ADR-0014](docs/decisions/0014-object-storage-mounted-for-contract-documents.md));
`module-graph.spec.ts` khóa cả hai. Factory của module kho gọi validator riêng (`object-storage.config.ts`), nên production
bắt buộc endpoint HTTPS kèm bucket và khóa truy cập, còn worker và các lệnh không đọc các biến đó; `queue.config.ts` giữ
nguyên cho lát nào mount hàng đợi, và `env-schema.ts` không đọc các biến kho hay hàng đợi.
WorkerModule chạy `EmailDispatchLoop` (`src/email-dispatch.loop.ts`): vòng thăm dò PostgreSQL mỗi
`OUTBOX_POLL_INTERVAL_MS` gửi thư trong EmailOutbox ([ADR-0012](docs/decisions/0012-account-email-delivery.md), vẫn
**Proposed**) — không cần Redis cho việc này.
Vòng lặp là orchestration có chủ đích ở composition root vì nối hai module không được import nhau: `notifications`
gửi thư qua hợp đồng công khai `EmailDeliveryService.dispatchDue` (tệp riêng `email-delivery.service.ts` từ ROOT-HARDEN.1, đăng ký ở
`PUBLIC_CONTRACT_EXPORTS`), facade `IdentityAccessService.isActionLinkUsable` trả lời liên kết trong thư còn dùng được
không. `EmailDispatcher`, repo, cipher và transport vẫn private (ROOT.1).
Các CLI (`installation-cli.ts`, `recovery-cli.ts`, `inspect-cli.ts`, `dev-seed-cli.ts`) dùng chung
`infrastructure/cli/cli-runtime.ts` để ghi lỗi, tắt log Nest và nhận `EnvironmentValidationError` bằng `instanceof`; gate
cấu trúc quét cả root và infrastructure để chặn so khớp lỗi theo `error.name`.

Lệnh vận hành theo [operational commands](docs/rules/operational-commands.md). `InspectionModule` (H6.1) chỉ xác thực
biến DB, import `ReadOnlyDatabaseSessionModule` nên mọi phiên PostgreSQL mở `default_transaction_read_only=on`, và đọc
qua `OrganizationService`, `AuditService.countByAction` và `IdentityAccessInspectionService`
(`identity-access-inspection-facade.module.ts`, chỉ trong đồ thị này). `DevSeedModule` (H6.2) chỉ xác thực biến DB, kiểm
ba chốt local trước transaction và ghi qua `OrganizationService`, `LocalDemoAccountService`
(`identity-access-local-seed-facade.module.ts`, chỉ trong đồ thị này) và `AuditService`. Không đồ thị lệnh nào tới được từ
`AppModule`/`WorkerModule` (`module-graph.spec.ts`, `operational-commands.spec.ts`).
Storage adapter hỗ trợ endpoint S3-compatible; chưa có file ownership/API.
Readiness chỉ chứng minh PostgreSQL có thể ping, không chứng minh schema/migration hoặc chức năng đăng nhập đã sẵn sàng.

Cấu hình: `env-schema.ts` là hợp đồng validation công khai duy nhất (`validateEnvironment`, `EnvironmentVariables`,
`EnvironmentValidationError`, `validateInstallationEnvironment`, `resolveDatabaseUrl`), ghép từ các tệp con dưới cap
400 dòng. `database-url.ts` không import gì để `prisma.config.ts` dùng cùng quy tắc `DATABASE_URL` mà không nạp Nest hay
schema đầy đủ. Secret theo Owner E3 = C: chỉ `NODE_ENV=test` có fallback công khai cho bốn secret; development phải tự
khai, development và production từ chối mọi giá trị công khai trong repository.

Compose local mặc định chỉ chạy PostgreSQL; Redis và MinIO chỉ chạy với profile `queue`/`storage`. Compose production
không còn Redis. Dockerfile build runtime API/worker.
Migrations chạy riêng trước rollout. Xem [containers](docs/guides/containers.md),
[database rules](docs/rules/database-business.md) và [tests](test/README.md).
