# Spec: Installation & Local Data — `ops:inspect` chỉ đọc và `dev:seed` chỉ local (H6.1 + H6.2)

- Phụ trách: AI theo giao việc Owner (Prompt 23, 20/10/2026).
- Thiết kế ban đầu bởi: Owner — Q5 của [audit nền tảng](../../../reviews/be-foundation-audit-2026-10-18/README.md)
  (mục 7.2 câu 2–5; F-20, F-21), mục 9.4 và E8 = A của
  [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md), Prompt 23.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (không Story/AC; chỉ để biết vai trực tiếp/suy ra và bootstrap FR-9.8 đã pin), BE `188c9e0`
  (`dev` = `origin/dev`, commit Prompt 22 của Owner). Không ADR mới; ADR-0011, ADR-0012 giữ trạng thái.
- Nhóm roadmap: H6 của bó remediation sau audit H4.0 — chỉ là container, không phải ranh giới (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này người vận hành kiểm được trạng thái cài đặt bằng `pnpm ops:inspect` mà không nhập mật khẩu, không cần
secret của API và không thể ghi gì; dev/FE dựng dữ liệu demo local bằng `pnpm dev:seed -- --confirm-local` qua chính
service và Audit Trail, chạy lại không nhân bản, và lệnh từ chối mọi database không phải loopback. Mọi lệnh vận hành
theo một rule có gate ([operational commands](../../../rules/operational-commands.md)).

## Sizing decision

- Container: H6.1 + H6.2
- Mode: `technical-enabler`
- Outcome and owner: hai lệnh vận hành ngoài HTTP có hợp đồng, chốt an toàn và gate chung; owner là module
  `installation` (capability `inspect/`, `dev-seed/`), với hợp đồng đọc/ghi hẹp của `identity-access` và `audit`.
- Boundaries: không đổi bảng, migration, route/OpenAPI, quyền, session; `ops:inspect` không ghi (phiên PostgreSQL chỉ
  đọc); `dev:seed` ghi trong một transaction qua `OrganizationService`, facade seed của `identity-access` và
  `AuditService`, chỉ khi ba chốt local đạt; không job/sự kiện mới.
- Not larger: loại H7 (role PostgreSQL), BEH.1, hardening bundle, G3–G10, deploy staging/production; không seed vai suy
  ra (`MANAGER`, `SPENDING_APPROVER`) vì use case của chúng cần actor USER qua HTTP — fixture tối thiểu chỉ vai trực tiếp.
- Not smaller: hai lệnh dùng chung rule mới, gate cấu trúc/đồ thị, cấu hình chỉ-database, cách phân vai entry/service/
  repo và cùng một đọc trạng thái cài đặt (seed đòi đã cài, inspect báo kết quả seed). Tách ra sẽ viết gate hai lần
  hoặc để một lệnh chạy trước khi rule có gate; tài liệu vận hành (README, Docs `CI-CD/deployment.md`) đổi một lần.
- Siblings: `h7-postgresql-roles` (tên dự kiến, chưa tạo; hoãn theo audit mục 9.4).
- Scope map: n/a — technical enabler ngoài nhóm G; không có Story/AC.

## Primary Story/AC

| Story | AC                             | Coverage | Phần còn lại thuộc                                                                               |
| ----- | ------------------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| —     | H6.1 `ops:inspect` (F-20)      | n/a      | gỡ chặn `h7-postgresql-roles` (tên dự kiến): kiểm trạng thái trước/sau đổi role không cần secret |
| —     | H6.2 `dev:seed` (F-21)         | n/a      | gỡ chặn FE/dev và mọi lát G3 dùng dữ liệu demo (chưa có hạng mục đặt tên); `h7-postgresql-roles` |
| —     | Rule lệnh vận hành (8 quy tắc) | n/a      | gỡ chặn mọi lệnh vận hành sau (`h7-postgresql-roles`)                                            |

## Supporting references

- [Audit nền tảng](../../../reviews/be-foundation-audit-2026-10-18/README.md) mục 7.2 (F-20, F-21, Q5);
  [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md) mục 9.4, E8 = A;
  [reconciliation](../../../reviews/be-full-src-architecture-audit-2026-10-19/reconciliation.md) (F-20, F-21).
- [Operations Foundation](../operations-foundation-h6-3-h6-4-root1/spec.md) (đầu vào `188c9e0`: cấu hình chỉ-database,
  helper CLI, E2 = A, E3 = C).
- [Module structure](../../../rules/module-structure.md), [database rules](../../../rules/database-business.md),
  [security rules](../../../rules/security-jobs.md), [test guide](../../../../test/README.md).
- Tracker điều phối ngoài repo: `Prompts/BE-audit-and-architecture-2026-10-18/BE-WORKSTREAM-TRACKER.md`.

## Explicit out of scope

- H7 (role runtime/migration PostgreSQL), BEH.1, AUTH.x/INF.1/OPENAPI hardening, G3–G10, deploy hay dọn VPS.
- Seed vai suy ra: trưởng phòng (`DepartmentHeadService.assign`) và Người duyệt chi (`ApprovalRoleService.set`) chỉ có
  qua HTTP với actor USER; lệnh không giả lập actor hay phiên. Lệnh chứng minh nó không tạo head period, approval holder
  hay grant nào ngoài ba vai trực tiếp.
- Seed IT Admin phụ trách phòng (`departments.it_admin_employee_id`): không có use case ngoài HTTP; `ops:inspect` báo số
  phòng thiếu IT Admin dùng được.
- Sửa dữ liệu người thật, đặt lại credential, xóa dữ liệu demo, seed cho database không phải loopback.

## Dependencies and blockers

- Đầu vào: Prompt 22 ở `188c9e0` (`dev` = `origin/dev`, ahead/behind `0/0`, cây sạch), Owner commit/push trực tiếp.
- Không blocker. Integration cần PostgreSQL cô lập theo [test guide](../../../../test/README.md).
- Docs repo: chỉ `CI-CD/deployment.md` (Prompt 23 cho phép đúng tệp này); tệp sạch lúc bắt đầu.

## Ownership: module, data, API

- **`installation/inspect/`** — `InspectionModule` (đồ thị lệnh), `InstallationInspectionService` (điều phối, không
  Prisma), `MigrationStateRepo` (đọc `_prisma_migrations`, bảng của Prisma, không thuộc module nghiệp vụ nào), báo cáo
  và tham số. Đọc qua `OrganizationService` (`getOrganization`, `getOnboardingFacts`), `AuditService.countByAction`
  (mới, chỉ đọc), `IdentityAccessInspectionService` (mới).
- **`installation/dev-seed/`** — `DevSeedModule`, `DevSeedService` (chốt, kế hoạch, transaction, audit), `DevSeedRepo`
  (advisory lock của lệnh, không bảng), fixture, chốt local, generator mật khẩu, báo cáo, tham số. Ghi qua
  `OrganizationService` (`createUnitCostCenter`, `createDepartment`, `createJobTitle`, `createEmployeeWithPlacement`;
  đọc `readLocalSeedFixture` (mới, P23-RV-01: cost center, phòng, chức vụ theo khóa ổn định, kèm liên kết cost center ↔
  phòng) và `lookupForEmployeeImport` chỉ cho mã/email nhân viên), `LocalDemoAccountService` (mới) và `AuditService.record`.
- **`identity-access` (hợp đồng mới, chỉ trong đồ thị lệnh):** `IdentityAccessInspectionFacadeModule` export
  `IdentityAccessInspectionService` (đếm tài khoản theo trạng thái, grant hiệu lực theo vai, người giữ `SUPER_ADMIN`,
  người giữ vai duyệt, IT Admin dùng được); `IdentityAccessLocalSeedFacadeModule` export `LocalDemoAccountService`
  (đánh giá và tạo tài khoản demo đã kích hoạt cho **một** vai trực tiếp `IT_ADMIN`/`FINANCE`/`EMPLOYEE`). Hai lớp nằm
  trong `identity-access.service.ts` (allowlist bề mặt công khai); repo, hasher giữ private.
- **Hạ tầng:** `infrastructure/config/database-host.ts` (phân loại host của URL), `infrastructure/database/
read-only-session.module.ts` (token phiên chỉ đọc cho `PrismaService`).
- **Entry:** `src/inspect-cli.ts`, `src/dev-seed-cli.ts`; script `ops:inspect`, `dev:seed`. Không route HTTP, không
  module `operations`. Không bảng/migration mới.

## Behavior and design

### `pnpm ops:inspect [--json] [--help]`

- Cấu hình: chỉ `NODE_ENV`, `DATABASE_URL`, giới hạn `DB_*` (như lệnh khởi tạo); không đọc secret auth/outbox, SMTP,
  Redis, storage. Phiên PostgreSQL mở với `default_transaction_read_only=on`; mọi đọc database (migration, tổ chức, đếm
  audit, tài khoản, facts onboarding, IT Admin dùng được) chạy trong **một** transaction của lệnh, cùng `DbTx` đi qua
  facade `OrganizationService`/`IdentityAccessInspectionService` tới repo; báo cáo dựng từ kết quả đó (P23-RV-02). Đây là
  một transaction đọc, không phải hợp đồng serializable hay khóa mới.
- Kiểm: migration (thư mục `prisma/migrations` so với `_prisma_migrations`: đã áp, đang chờ, lỗi/rollback, lạ); tổ
  chức (có/không, múi giờ, tiền tệ); bản ghi bootstrap (đủ bảy loại sự kiện `INSTALLATION.*` với số lượng đúng); người
  giữ `SUPER_ADMIN` (số người giữ, trạng thái, kích hoạt, email che); số tài khoản theo `status/activationState`; số
  grant hiệu lực theo vai trực tiếp; số người đang giữ từng vai duyệt; số phòng hoạt động, phòng thiếu trưởng phòng
  hiện tại, phòng thiếu IT Admin dùng được.
- Trạng thái: `NOT_INSTALLED` (chưa có bảng migration hoặc chưa có tổ chức); `INCOMPLETE` (có tổ chức nhưng có vấn đề:
  `MIGRATIONS_PENDING`, `MIGRATIONS_FAILED`, `MIGRATIONS_UNKNOWN`, `BOOTSTRAP_RECORDS_INCOMPLETE`, `SUPER_ADMIN_MISSING`,
  `SUPER_ADMIN_NOT_USABLE`); `INSTALLED`. Phòng thiếu trưởng phòng/IT Admin là thông tin, không phải vấn đề (một
  cài đặt mới luôn có).
- Mã thoát: `0` `INSTALLED`; `2` `NOT_INSTALLED` hoặc `INCOMPLETE`; `1` tham số sai, env không hợp lệ, database không
  tới được, lỗi bất ngờ (chỉ in tên lỗi).
- Đầu ra: mặc định dạng người đọc, `--json` một object; cùng trạng thái và số liệu, không trường thời gian, thứ tự cố
  định nên chạy lại trên cùng trạng thái cho cùng byte. Định danh duy nhất được in là email Super Admin dạng che
  `ký-tự-đầu***@ký-tự-đầu***.<nhãn cuối>` (ví dụ `a***@a***.vn`). Không in email đầy đủ, tên/mã nhân viên, tên tổ chức,
  id, hash, token, payload mã hóa hay giá trị env.

### `pnpm dev:seed -- --confirm-local [--help]`

- Ba chốt, kiểm theo thứ tự trước mọi transaction ghi (rule 2): `NODE_ENV` ∈ {`development`, `test`}; host của
  `DATABASE_URL` hiệu lực (sau `resolveDatabaseUrl`) parse ra `localhost`, IPv4 `127.0.0.0/8` hoặc `[::1]`, giao thức
  `postgres(ql):`, không tham số `host`/`hostaddr`, không nhiều host; cờ `--confirm-local`. Thiếu cờ hay cờ lạ là lỗi
  tham số (thoát 1, không nạp đồ thị). Một `--` đứng đầu (pnpm chuyển tiếp) được bỏ qua.
- Đòi đã cài (có tổ chức); không tự chạy cài đặt, không tạo/đổi `SUPER_ADMIN`.
- Fixture cố định: cost center `DEMO-CC` (UNIT), phòng `DEMO`, chức vụ `Demo staff`, ba nhân viên `STAFF`, ngày vào
  `2026-01-05`, email miền dành riêng `demo.slm.test`, mỗi người một tài khoản đã kích hoạt với **một** vai trực tiếp:
  `DEMO-IT` → `IT_ADMIN`, `DEMO-FIN` → `FINANCE`, `DEMO-EMP` → `EMPLOYEE`.
- Idempotent theo khóa ổn định (P23-RV-01: mã cost center, mã phòng, tên chuẩn hóa chức vụ, mã nhân viên, tài khoản
  theo nhân viên), mỗi mục so trên **mọi** trường fixture cố định:
  - Cost center `DEMO-CC`: vắng ⟹ tạo; đúng tên hiển thị, `UNIT`, `ACTIVE` và chưa gắn phòng khác ⟹ `already-present`;
    khác ⟹ `COST_CENTER_NAME_DIFFERS`, `COST_CENTER_NOT_UNIT`, `COST_CENTER_INACTIVE` hoặc `COST_CENTER_IN_USE` (đã gắn
    phòng khác, `DEMO` không tạo trên nó được).
  - Phòng `DEMO`: vắng ⟹ tạo — trên cost center vừa tạo, hoặc trên `DEMO-CC` đúng fixture đã có sẵn mà chưa có phòng
    (phục hồi một phần); đúng tên, `ACTIVE` và gắn `DEMO-CC` ⟹ `already-present`; khác ⟹
    `DEPARTMENT_COST_CENTER_DIFFERS`, `DEPARTMENT_NAME_DIFFERS` hoặc `DEPARTMENT_INACTIVE`.
  - Chức vụ `Demo staff`: vắng ⟹ tạo; đúng tên hiển thị chuẩn và `ACTIVE` ⟹ `already-present`; cùng khóa chuẩn hóa mà
    khác tên hiển thị ⟹ `JOB_TITLE_NAME_DIFFERS`, ngừng dùng ⟹ `JOB_TITLE_INACTIVE`.
  - Nhân viên và tài khoản giữ cách so cũ (tên/email/phòng/chức vụ khác, email đã thuộc người khác, tài khoản bị
    khóa/chưa kích hoạt/thiếu vai, `FINANCE` đã có người khác giữ).
  - Một `conflict` ở bất kỳ mục nào ⟹ **cả lượt** bị từ chối: không ghi gì, không in mật khẩu, không sửa dữ liệu người
    thật, không đặt lại credential.
- Ghi: kế hoạch đọc trước; mật khẩu cho tài khoản sẽ tạo được sinh (`randomBytes(18)` base64url, 24 ký tự) và băm
  **ngoài** transaction; rồi một transaction: advisory lock của lệnh, đọc lại kế hoạch (khác ⟹ `conflict`
  `STATE_CHANGED`), ghi qua service, audit `actorKind: OPERATOR`, `operatorReference: LOCAL_SEED`, một `correlationId`:
  `DEV_SEED.COST_CENTER_CREATED`, `DEV_SEED.DEPARTMENT_CREATED`, `DEV_SEED.JOB_TITLE_CREATED`,
  `DEV_SEED.EMPLOYEE_CREATED`, `DEV_SEED.ACCOUNT_CREATED`, `ROLE.GRANTED`. Lỗi giữa chừng ⟹ rollback toàn bộ.
- Tài khoản demo: `ACTIVE`, `ACTIVATED`, `emailVerificationSource: BOOTSTRAP_ASSERTED` (do người chạy lệnh khẳng định,
  như tài khoản Super Admin của cài đặt; không có thư mời vì hộp thư demo không tồn tại).
- Mật khẩu mới chỉ in một lần ra stdout của lệnh, cạnh email demo; không log, không audit, không lưu ngoài hash; lần
  chạy lại không in mật khẩu.
- Mã thoát: `0` đã tạo ít nhất một mục (`CREATED`); `2` mọi mục đã có (`ALREADY_PRESENT`, không ghi); `3` bị từ chối,
  không ghi (`REFUSED`: chốt local, chưa cài, hoặc `conflict`); `1` tham số sai, env không hợp lệ, database không tới
  được, lỗi bất ngờ (rollback, chỉ in tên lỗi).

## Test matrix

| AC / rủi ro                 | Tình huống (gồm từ chối, edge case)                                                                                                         | Cấp test                                                                                  | Kết quả mong đợi                                              | Bằng chứng sau implement     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------- |
| characterization bootstrap  | bản ghi, mã, audit chính xác; chạy lại không đổi gì                                                                                         | integration installation                                                                  | xanh trên `188c9e0`                                           | [plan](plan.md#checkpoint-0) |
| parse host                  | credential, IPv4/`localhost`/`[::1]`, DNS/IP xa, `postgres`, `localhost.example.com`, `?host=`, URL hỏng                                    | unit `database-host.spec.ts`                                                              | chỉ loopback được nhận                                        | plan                         |
| inspect chỉ đọc             | ghi thử qua đồ thị inspect; fingerprint mọi bảng trước/sau                                                                                  | integration inspect                                                                       | `25006`; fingerprint bằng nhau                                | plan                         |
| inspect trạng thái/mã thoát | DB trống, đã cài, Super Admin bị khóa, migration lỗi; `--json` = người đọc; hai lần cùng byte; email che                                    | unit report + integration + process                                                       | 0/2/1 đúng; không PII                                         | plan                         |
| inspect env                 | chỉ `DATABASE_URL` (không secret); thiếu `DATABASE_URL`; DB không tới được                                                                  | process                                                                                   | chạy được; 1 với một dòng                                     | plan                         |
| seed ba chốt                | `production`/`staging`, host xa/`postgres`/giả, thiếu cờ, cờ lạ, `--force`                                                                  | unit guard + arguments + process                                                          | từ chối, không ghi                                            | plan                         |
| seed idempotent/rollback    | lần 1 tạo, lần 2 không ghi, không in mật khẩu; conflict không ghi; lỗi giữa chừng rollback                                                  | integration seed + process                                                                | 0 → 2; 3; 0 dòng mới                                          | plan                         |
| P23-RV-01 fixture theo khóa | cost center/phòng/chức vụ: vắng, đúng, từng loại khác; phục hồi một phần (DEMO-CC có, DEMO vắng); phòng đổi tên, phòng gắn cost center khác | unit `dev-seed-plan.spec.ts`, `dev-seed.service.spec.ts`; integration seed                | đúng từng mã conflict, cả lượt từ chối, fingerprint không đổi | plan, mục post-review        |
| P23-RV-02 một transaction   | mọi đọc database của inspect nhận cùng `DbTx` khi transaction còn mở; facts onboarding và repo dùng client được truyền                      | unit `inspection.service.spec.ts`, `organization-onboarding-facts.spec.ts`, hai spec repo | đỏ trên code cũ, xanh sau sửa                                 | plan, mục post-review        |
| vai                         | không grant `MANAGER`/`SPENDING_APPROVER`, không head period/approval holder; vai đúng                                                      | unit fixture + integration                                                                | chỉ ba vai trực tiếp                                          | plan                         |
| rule + gate                 | đột biến: ghi trong inspect, email đầy đủ, đòi secret, mount vào API/worker, bỏ một chốt, mật khẩu mặc định                                 | `operational-commands.spec.ts`, `module-graph.spec.ts`, test lệnh                         | đỏ đúng gate, khôi phục byte-identical                        | plan                         |
| OpenAPI                     | export lại                                                                                                                                  | `pnpm openapi:export`                                                                     | byte-identical `14fd428b…`                                    | plan                         |

## Definition of Done

- [x] Không AC nghiệp vụ; characterization xanh trên `188c9e0` trước khi sửa product code và xanh trên cây cuối.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối; e2e + integration + OpenAPI
      byte-identical.
- [x] Rule [operational commands](../../../rules/operational-commands.md) có gate, link từ chỉ mục rule, `AGENTS.md`,
      `CONTRIBUTING.md`; README, ARCHITECTURE, roadmap, items index, Docs `CI-CD/deployment.md` khớp hiện trạng.
- [x] Không thêm ledger; contract mới đăng ký chính xác ở `PUBLIC_CONTRACT_EXPORTS`/`CLI_ENTRY_FILES`.
- [x] Kiểm kê cuối: 0 container/image/database tạm/tiến trình/tệp tạm do gói tạo.

## Changes and acceptance

20/10/2026 — lập và thực hiện theo Prompt 23 trên `188c9e0`. Ghi chú thiết kế khi làm: (1) `dev:seed` tính khóa chức vụ
bằng `normalizeDisplayName(...).toLowerCase()` của `core`, cùng quy tắc T-12 mà `organization` giữ private; lần chạy lại
trên PostgreSQL ghim sự khớp. (2) Mã cost center demo không có lookup ở facade: nếu dữ liệu khác đã dùng `DEMO-CC`, lỗi
unique trong transaction được báo `REFUSED (UNIQUE_KEY_TAKEN)` và mọi thứ rollback. (3) Walker import của gate rule 3 lúc
đầu bỏ sót `import` side-effect và `require` (đột biến A-M6 sống sót); đã sửa và thêm ca tự kiểm. (4) Hai spec CLI có sẵn
chuyển sang `test/support/cli-process.ts`, assertion giữ nguyên.

20/10/2026 — sửa sau review độc lập (Prompt 23 mục 8, trong cùng hạng mục): **P23-RV-01** — plan seed dùng
`OrganizationService.readLocalSeedFixture` (hợp đồng đọc hẹp của organization, repo vẫn private, không mở rộng lookup
import) và so cost center, phòng, chức vụ trên mọi trường fixture cố định; ghi chú (2) trên thay bằng conflict
`COST_CENTER_*` cụ thể (`UNIQUE_KEY_TAKEN` chỉ còn là chốt chặn cuối). **P23-RV-02** — facts onboarding và IT Admin
dùng được của `ops:inspect` đọc trong cùng transaction, `DbTx` đi qua facade tới repo (tham số tùy chọn, checklist
onboarding không đổi). **P23-DOC-01** — Docs `CI-CD/deployment.md` bỏ `AUTH_COOKIE_SECURE` khỏi ví dụ `.env`, ghi chú
refresh token đi trong body. Owner review chưa có; chưa nghiệm thu.
