# installation

Mục đích: các việc chạy ngoài HTTP, từ dòng lệnh — cài đặt lần đầu (organization, phòng ban đầu tiên, tài khoản
Super Admin), dữ liệu demo cho database local, tài khoản của dataset demo dùng chung, báo cáo trạng thái cài đặt và kiểm tra trước migration (cả hai chỉ
đọc). Không controller, không bảng riêng. Nguồn yêu cầu: FR-9.8, `QĐ-87f`(1), `QĐ-87d`(1) (cài đặt); H6.1, H6.2,
P28-01 (lệnh vận hành).
Tầng: T6 (`scripts/arch/tiers.cjs`). Phụ thuộc: organization, identity-access, finance, audit. Được dùng bởi: không
module nào; chỉ lệnh trong `src/cli/` (bootstrap, seed, inspect, preflight).

## Lệnh CLI → public API

Lệnh nằm ở `src/cli/<lệnh>/` (bảng lệnh: `src/cli/commands.ts`) và chỉ gọi `public/*.api.ts`:

- `pnpm ops:bootstrap` (`src/cli/bootstrap/bootstrap.command.ts`) → `InstallationApi.install`.
- `pnpm ops:seed` (`src/cli/seed/seed.command.ts`) → `DemoAccountsApi` (`inspect`,
  `findEmployees`, `describe`, `create`); mọi bản ghi khác của dataset đi qua HTTP API đang chạy, không qua module này.
- `pnpm ops:inspect` (`src/cli/inspect/inspect.command.ts`) → `InstallationInspectionApi.inspect`.
- `pnpm ops:preflight` (`src/cli/preflight/preflight.command.ts`) → `MigrationPreflightApi.judge`, hoặc `recoveryTarget`
  khi có `--recovery-target`.

## Public API (`public/`)

- `InstallationApi` ([public/installation.api.ts](public/installation.api.ts)) — `install`: tạo dữ liệu thật tối thiểu
  trong một transaction; chạy lần hai thấy organization đã có thì không đổi gì.
- `DemoAccountsApi` ([public/demo-accounts.api.ts](public/demo-accounts.api.ts)) — sự thật của cài đặt cho lệnh dataset
  demo (tổ chức, ngày nghiệp vụ, người giữ `SUPER_ADMIN`), tra nhân viên theo mã, và `create`: tài khoản đã kích hoạt
  cho nhân viên của dataset qua `LocalDemoAccountApi` (một vai trực tiếp), mật khẩu hash bằng
  `IdentityAccessApi.prepareCredential` trước transaction, kế hoạch đọc lại trong transaction (đổi thì
  `DemoAccountsChangedError`), Audit `DEMO_DATASET.ACCOUNT_CREATED` + `ROLE.GRANTED` với `actorKind OPERATOR`; và
  `holdApplyLock`: khóa advisory phiên của fixture trên database (kết nối riêng, `trySessionAdvisoryLock` của
  infrastructure) để hai `apply` không chạy cùng lúc; type ở `demo-accounts.types.ts`.
- `InstallationInspectionApi` ([public/installation-inspection.api.ts](public/installation-inspection.api.ts)) — `inspect`: đếm và liệt kê vi phạm
  bất biến; type ở `inspection.types.ts`.
- `MigrationPreflightApi` ([public/migration-preflight.api.ts](public/migration-preflight.api.ts)) — `judge`: lịch sử
  migration có đưa được database tới Cost Center chỉ cho Unit; `recoveryTarget`: một image có phục vụ được database này.
  Type ở `migration-preflight.types.ts`; in báo cáo: `migration-preflight-report.mapper.ts`; luật image:
  `recovery-target.policy.ts`.
- `public/installation.errors.ts` — `InstallationInputError`, `AlreadyInstalledError`, `StdinPasswordError`,
  `RecoveryTargetLabelsError`, `DemoAccountsChangedError`.

## Bảng sở hữu

- Không có (`installation.repo.ts` chỉ giữ advisory lock theo transaction). Dòng mà lệnh ghi thuộc module sở hữu chúng.

## Extension point

- Mở: không có. Đăng ký vào: không có.

## Capability → file chính

- Gốc module — `installation.module.ts` (graph của bootstrap), `installation.dto.ts` (đọc input cài đặt),
  `installation.repo.ts` (advisory lock để hai lần cài chạy nối tiếp).
- `seed/` — `seed-cli.module.ts` (graph của `ops:seed`: organization, identity-access facade và
  local seed facade, audit, `RuntimeDatabaseRoleModule` — production chỉ chạy bằng runtime role; không guard local vì mọi
  dữ liệu nghiệp vụ đi qua API).
- `inspect/` — `inspection-cli.module.ts` (graph của `ops:inspect`, mọi session read-only), `inspection-facts.policy.ts`, `migration-state.repo.ts`.
- `migration-preflight/` — `migration-preflight-cli.module.ts` (graph của `ops:preflight`, read-only, không module nghiệp vụ),
  `migration-preflight-judgement.policy.ts`, `migration-preflight.repo.ts`.
- Mỗi lệnh có Nest module riêng, tên `<lệnh>-cli.module.ts`; API và worker không import module nào ở đây. `installation.module.ts` giữ tên: nó là
  module `installation` (tầng T6) và bootstrap là lệnh duy nhất dùng nó.

## Bất biến quan trọng

- Cài đặt tạo đúng: organization, MỘT phòng ban đầu tiên không Cost Center/trưởng phòng/IT Admin, nhân viên của
  Super Admin và tài khoản Super Admin đã kích hoạt; không tạo Cost Center, chức danh hay nhân viên IT
  (`installation.api.ts`).
- Mọi audit event của cài đặt mang `installationException: true`; không bao giờ sửa tài khoản đã có (khôi phục là
  thủ tục riêng, FR-8.10(d)).
- `DemoAccountsApi.create` chỉ tạo tài khoản cho nhân viên chưa có tài khoản; tài khoản đã có không bao giờ bị đổi
  (mật khẩu, vai, trạng thái); không bao giờ cấp `SUPER_ADMIN` hay vai suy ra.
- `inspect` và `preflight` không ghi được: graph mở mọi session PostgreSQL read-only (`ReadOnlyDatabaseSessionModule`),
  mọi lệnh đọc trong một transaction.

## Test

- Unit: `src/modules/installation/**/*.spec.ts` và `src/cli/{bootstrap,seed,inspect,preflight}/**/*.spec.ts`; HTTP:
  không có (không route); integration: `test/integration/installation/`.

Unified seed: check calls InstallationInspectionApi.seedCheck through the existing read-only inspection graph, with no migration-history query. Apply holds DemoAccountsApi.holdApplyLock before seedState/inspect; EMPTY bootstrap explicitly opens the existing InstallationModule, then writes business records through HTTP. No new graph or binder exception. Reset exists only in owner-run wrappers; see [seed guide](../../../docs/guides/seed.md).
