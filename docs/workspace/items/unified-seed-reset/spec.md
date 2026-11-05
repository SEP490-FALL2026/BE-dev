# Spec: unified-seed-reset — một lệnh seed (bootstrap + dữ liệu demo) cho local và VPS, có kiểm DB và xóa để seed lại

- Phụ trách: chưa giao — dev/AI nhận hạng mục sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI theo giao việc của Owner (phiên 03–04/11/2026); viết lại sau review đối kháng và disposition
  04/11/2026. Quyết định Owner: `## Owner decisions` (mọi mục đã đóng 04/11/2026).
- Thiết kế: `draft`. Owner review: chưa review toàn spec.
- Nguồn: Docs `0125072` + `QĐ-95` (chưa commit lúc ghi), BE `d7b8fe8d` (`dev`) + `qd95-one-role-per-account` (Task 3: fixture
  `shared-demo-v2`, hợp đồng tài khoản demo `initialRole`/`finalRole`, route `PUT /app-users/{id}/role`).
- Nhóm roadmap: không thuộc nhóm G — `technical-enabler` (xem `## Sizing decision`).
- Hạng mục cùng đợt: [`ci-integration-shards`](../ci-integration-shards/spec.md) →
  [`qd95-self-service-every-role`](../qd95-self-service-every-role/spec.md) →
  [`qd95-one-role-per-account`](../qd95-one-role-per-account/spec.md) → **hạng mục này** (cùng bản phát hành với `qd95-one-role-per-account`).
- Thay thế khi xong (_superseded_, giữ làm lịch sử): [`shared-demo-dataset`](../shared-demo-dataset/spec.md),
  `installation-local-data-h6-1-h6-2` (vế `dev:seed`).
- [Kế hoạch](plan.md).

## Business outcome

Dev chạy **một lệnh** để có installation demo đầy đủ — tổ chức, phòng gốc, Super Admin và toàn bộ dữ liệu demo đúng các quyết
định hiện hành — trên máy local (`pnpm seed:local`) hoặc VPS demo (`scripts/ops/seed.sh`). Mật khẩu được kiểm **trước** mọi việc.
DB đã có dữ liệu ⟹ lệnh hiện tóm tắt (database, host, cổng, tổ chức, số đếm) rồi hỏi: gõ đúng **tên database** để xóa hết và seed
lại, `c` để chạy **tiếp** phần còn thiếu (chỉ khi đúng tổ chức của fixture), hoặc thoát không đổi gì. Seed được bất kỳ ngày nào
trong năm (cuối năm: Request trả phí và ngân sách sang năm tài chính kế tiếp). Dữ liệu seed nằm trong một folder fixture có
README mô tả từng bản ghi.

## Sizing decision

- Container: yêu cầu trực tiếp của Owner 03/11/2026 (việc 3 trong ba việc của đợt).
- Mode: `technical-enabler`.
- Outcome and owner: lệnh vận hành `seed` (`src/cli/seed`, module `installation`) và hai wrapper (`scripts/dev`, `scripts/ops`).
- Boundaries: không route HTTP mới, không migration; dữ liệu nghiệp vụ vẫn ghi qua HTTP API đúng vai như `ops:demo-dataset`;
  bootstrap qua `InstallationApi.install()`; xóa database chỉ ở wrapper (quyền owner/cluster), không ở lệnh Nest.
- Not larger: thêm loại/lượng dữ liệu (Owner hoãn tới khi có thêm API); tính năng `QĐ-94` chưa có API trên `dev`.
- Not smaller: gộp lệnh mà không có kiểm-và-xóa thì không dùng được cho "drop rồi seed lại"; sửa lịch là điều kiện để seed lại
  sau 30/11 (lệnh hiện tại từ chối `apply` từ 01/12).
- Siblings: [`ci-integration-shards`](../ci-integration-shards/spec.md), [`qd95-one-role-per-account`](../qd95-one-role-per-account/spec.md),
  [`qd95-self-service-every-role`](../qd95-self-service-every-role/spec.md).
- Scope map: n/a

## Primary Story/AC

| Story | AC     | Coverage | Phần còn lại thuộc                                                                                   |
| ----- | ------ | -------- | ---------------------------------------------------------------------------------------------------- |
| —     | SEED.1 | n/a      | gỡ chặn `fe-one-role-contract` (tên dự kiến): FE tích hợp trên dataset demo mới, dựng lại nhanh được |

## Owner decisions

| Mã    | Nội dung                                                                 | Trạng thái                                                                                                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-S1 | Gộp seed, bỏ `dev:seed`, chạy local + VPS, kiểm DB rồi hỏi xóa/thoát     | **Đóng (Owner 04/11/2026)**                                                                                                                                                                                                                                                |
| OD-S2 | Sửa toàn bộ dataset theo quyết định hiện hành; không thêm loại/lượng mới | **Đóng (Owner 04/11/2026)**; người mới duy nhất là `DS1-ITOH` (`qd95-one-role-per-account` OD-R5)                                                                                                                                                                          |
| OD-S3 | Lệnh cũ `demo-dataset`, `dev-seed`                                       | **Đóng (Owner 04/11/2026)**: **xóa hẳn**, không stub; alias `dist/demo-dataset-cli.js`, `dist/dev-seed-cli.js` mất theo. Ngoại lệ có lý do cho `OD-A7` ghi ở `docs/rules/operational-commands.md` và ghi chú ở ADR-0019 (task): VPS dựng lại, `seed.sh` thay mọi người gọi |
| OD-S4 | Reset DB dùng chung (đổi `database-business.md:11`, `containers.md:404`) | **Đóng (Owner 04/11/2026)**: chỉ qua `seed.sh` trên VPS có `SEED_ALLOW_RESET=true` và gõ đúng tên database                                                                                                                                                                 |
| OD-S5 | Seed vào tháng 12                                                        | **Đóng (Owner 04/11/2026)**: R1/R2 và các Request trả phí dùng chung ngày chi sang năm tài chính kế tiếp; seed lập ngân sách năm sau cho mọi Cost Center có ngân sách trong fixture                                                                                        |
| OD-S6 | Luôn có thuê bao trong cửa sổ cảnh báo gia hạn (`[15, 7]` ngày)          | **Đóng (Owner 04/11/2026)**: **bỏ** yêu cầu; ghi vào _ứng viên dữ liệu sau_ của `fixture/shared-demo-v2/README.md`                                                                                                                                                         |
| OD-S7 | Một vai mỗi tài khoản, trưởng phòng `DS1-ITOH`, một Super Admin          | **Đóng (Owner 04/11/2026)** — ở [`qd95-one-role-per-account`](../qd95-one-role-per-account/spec.md#owner-decisions); hạng mục này chỉ kiểm lại trên dataset                                                                                                                |

## Supporting references

- Ba đường seed hiện có: `ops:bootstrap` (tổ chức, phòng đầu tiên, Super Admin — [guide](../../../guides/bootstrap-installation.md)),
  `dev:seed` (DB loopback, 3 tài khoản `DEMO-IT`/`DEMO-FIN`/`DEMO-EMP`), `ops:demo-dataset` (fixture có phiên bản, ghi qua HTTP API,
  chạy lại không trùng, không xóa — [guide](../../../guides/demo-dataset.md)).
- Lịch hiện tại ([demo-dataset-calendar.ts](../../../../src/cli/seed/seed-calendar.ts)): `LAST_APPLY_DAY = '11-30'`,
  từ chối `FISCAL_YEAR_START_MONTH ≠ 1` và dataset đã nạp ở năm khác. Audit `occurredAt` lấy `now()` của DB nên integration không
  giả được ngày (`demo-dataset-calendar.integration-spec.ts:10-12`).
- Ngày: mọi Request trả phí dùng chung `spendDay` (`steps/request.steps.ts:76`, hàm ở `:84-89`, hôm nay + 7 cắt ở 31/12);
  ngân sách theo `yearOf` (`steps/finance.steps.ts:113`), dòng kế hoạch hôm nay → 31/12 (`propose`, `:163-184`); thuê bao
  01/01–31/12 năm hiện tại (`steps/catalog.steps.ts:143-150,191-201`); trưởng phòng, `BM-09` đã tính từ `ctx.today`
  (`organization.steps.ts:191`, `extras.steps.ts:75`). `yearIsOpen` cho phép năm tương lai (`budgets/budget/budget.policy.ts:73-74`:
  `year >= fiscalYearOf(today)`) ⟹ đề xuất/phiên bản ngân sách năm sau được nhận. `planLine: { position }` của R1/R2
  (`request.steps.ts:161`) chọn dòng theo vị trí.
- Lệnh hiện tại lấy khóa apply **sau** khi đọc installation (`demo-dataset-run.ts:39-44`) và từ chối DB chưa bootstrap (`:88`).
- Mật khẩu: `InstallationApi.install` kiểm chính sách trước khóa qua `identity.prepareCredential(password, loginEmail)`
  (`installation/public/installation.api.ts:56-57` → `CredentialService.prepareCredential` → `checkPasswordPolicy` ở
  `identity-access/credentials/password.policy.ts`: 12–128 ký tự sau NFC, không trùng email đăng nhập); mật khẩu demo 12–128
  (`demo-dataset-run.ts:83`). stdin là hai dòng `SUPER_ADMIN_PASSWORD=…` / `DEMO_ACCOUNT_PASSWORD=…` (`demo-dataset-secrets.ts`).
  Bootstrap ghi `environment` vào audit `INSTALLATION.ORGANIZATION_CREATED` (`installation.api.ts:93-97`).
- Đọc trạng thái: runtime role không có quyền trên `_prisma_migrations` (`database-role-judgement.ts:15`) ⟹ `check` không gọi
  `MigrationStateRepo.appliedMigrations`/`changeAnnouncementsSeededAt` (`inspect/migration-state.repo.ts:28-52`); bảng chưa có hiện
  thành Prisma `P2021` (`installation-inspection.api.ts:19,117`). `InspectionCliModule` (graph chỉ đọc của `ops:inspect`) không
  kiểm vai PostgreSQL. Chưa có read API đếm nhân viên ⟹ `check` chỉ đếm phòng (`getOnboardingFacts().activeDepartments`) và tài
  khoản (`IdentityAccessInspectionApi.accountInventory`).
- Môi trường: `ConfigModule` đọc `.env` của thư mục làm việc trừ khi `NODE_ENV=test`, biến có sẵn trong tiến trình thắng
  (`infrastructure/config/env-config.ts:4-16`); `prisma.config.ts` nạp `DOTENV_CONFIG_PATH` (mặc định `.env`) khi `NODE_ENV≠test`.
- Prisma `^7.9.1`: `migrate reset --force` xóa/tạo lại schema, áp lại mọi migration, không chạy seed; Prisma **chặn** khi phát hiện
  agent AI trừ khi có `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` — wrapper **không** được đặt hay chuyển biến này.
- VPS: API lắng nghe `PORT` (Compose `${PORT:-3000}` lấy từ `<app-dir>/.env`, `docker-compose.prod.yml:55-58`), tên database
  `${POSTGRES_DB:-software_license_management}`; dump `run --rm --no-deps -T backup pg_dump --format=custom --no-owner --no-privileges`
  ghi `.partial`, kiểm `pg_restore --list` rồi đổi tên (`deploy-release.sh:203-211`); khóa deploy `flock -n` trên
  `releases/.deploy.lock`, deploy đang khóa ⟹ deploy khác exit 2 (`deploy-release.sh:104-123`); deploy từ chối DB không có lịch sử
  migration khi `releases/current-image` có (`deploy-release.sh:286`); image và cách gọi Compose theo `demo-dataset.sh:143-163`
  (`releases/current-image`, `--project-directory`, `-f`); CD chỉ chép `docker-compose.prod.yml`, `Caddyfile`, `deploy-release.sh`
  (`.github/workflows/deploy.yml:102`); retention chỉ khớp `slm-pre-migrate-*.dump` (`postgres-backup-retention.sh:14`).
- Gate: alias được gọi ở `ALIAS_CALLERS` phải có trong bảng lệnh và mỗi script `dist/cli` phải là lệnh của bảng
  (`test/gates/operational-commands.gate-spec.ts:55-66,257-277`); mỗi lệnh có đúng `cli/<lệnh>/<lệnh>.arguments.ts` (`:166-177`);
  thư mục lệnh `COMMAND_FOLDERS` (`:21-31`), file chỉ-lệnh (`:41-42`); ngoại lệ binder theo graph
  (`test/gates/extension-wiring.gate-spec.ts:48-56,104-112,160-170`; ADR-0019 R1 — danh sách chỉ co lại).

## Explicit out of scope

- Thêm loại/lượng dữ liệu mới; tính năng `QĐ-94` chưa có API (Request tiếp tục sử dụng, phong bì ngân sách năm, mốc ND−90/−60/−30);
  thuê bao luôn nằm trong cửa sổ cảnh báo gia hạn (`OD-S6`) — ghi vào _ứng viên dữ liệu sau_ trong `fixture/shared-demo-v2/README.md`.
- Seed qua CD hay lúc API khởi động; endpoint seed; chèn trạng thái nghiệp vụ bằng SQL.
- Cài đặt thật cho khách hàng: vẫn `ops:bootstrap` + `bootstrap-installation.sh` (giữ nguyên); `apply` chỉ bootstrap khi có
  `--allow-bootstrap` (chỉ hai wrapper truyền).

## Dependencies and blockers

- `qd95-one-role-per-account` merge trước (route đổi vai, hợp đồng tài khoản demo một vai, fixture `shared-demo-v2`); hai hạng mục
  vào **cùng một bản phát hành**.
- VPS đang có DB demo nhiều vai ⟹ **trước** khi deploy bản phát hành đó, Owner chạy runbook _Dựng lại VPS một lần_ (bên dưới).
- Owner commit `QĐ-95`/Docs và các đổi rule (`OD-S3`, `OD-S4`) trước khi chạy reset trên VPS. Lượt reset thật ở local do Owner chạy
  (Prisma chặn agent AI).

## Ownership: module, data, API

- `src/cli/seed/` (`git mv src/cli/demo-dataset src/cli/seed`, mọi file `demo-dataset*.ts` → `seed*.ts`, gồm `seed.command.ts`,
  `seed.arguments.ts`). **Folder dữ liệu duy nhất** `src/cli/seed/fixture/shared-demo-v2/`: `installation.ts` (tổ chức, múi giờ
  `Asia/Ho_Chi_Minh`, tiền tệ `VND`, phòng gốc riêng `DS1-ADMIN` "Quản trị hệ thống" và người Super Admin `DS1-SA` — không bước
  `organization` nào dùng lại), `organization.ts`, `catalog.ts`, `finance.ts`, `requests.ts`, `extras.ts`, `index.ts`, `README.md`
  (mục đích từng bản ghi, bảng tài khoản, phòng gốc và Super Admin, ứng viên dữ liệu sau, cách thêm dữ liệu: loại đã có ⟹ chỉ sửa
  fixture; loại mới ⟹ một step + một mục fixture + một kiểm tra). Dữ liệu chuyển nguyên từ `shared-demo-v2.ts` +
  `shared-demo-v2-sales-marketing.ts` của `qd95-one-role-per-account`; mã fixture giữ `shared-demo-v2` (chưa nạp vào DB dùng chung
  nào trước bản phát hành này).
- `src/cli/commands.ts`: dòng `demo-dataset` → `seed` (alias `seed-cli`); dòng `dev-seed` bỏ (Task 5).
- Module `installation`: `git mv src/modules/installation/demo-dataset src/modules/installation/seed`,
  `demo-dataset-cli.module.ts` → `seed-cli.module.ts` (`SeedCliModule`, graph không đổi). `check` dùng graph sẵn có
  `InspectionCliModule` với method mới `InstallationInspectionApi.seedCheck()`; bootstrap trong `apply` mở graph sẵn có
  `InstallationModule` (của `bootstrap`) chỉ cho lời gọi `install` — không graph mới, không mục ngoại lệ mới. Bỏ
  `installation/dev-seed/**`, `public/dev-seed.*`.
- `organization`: bỏ `readLocalSeedFixture` (`public/organization-read.api.ts:261-270`), `LocalSeedFixtureFacts`
  (`public/organization.types.ts:226`) và `toLocalSeedFixtureFacts` của `organization-local-seed-fixture.mapper.ts`; **giữ**
  `toBrief` của file đó (dùng ở `organization-history.api.ts:8`, `organization-read.api.ts:9`) — chuyển sang
  `organization-brief.mapper.ts` rồi xóa file cũ.
- `audit`: method đọc mới `AuditApi.firstAfterField(tx, action, field): Promise<string | null>` (giá trị chuỗi `after.<field>` của
  sự kiện cũ nhất có action đó) cho `ENVIRONMENT` của `check`.
- Scripts: `scripts/dev/seed-local.mjs`, `scripts/dev/local-database-host.mjs` (logic `classifyDatabaseUrl` viết lại bằng `.mjs`),
  `scripts/ops/seed.sh`; bỏ `scripts/ops/demo-dataset.sh`, `scripts/ops/demo-dataset-local.mjs`, `scripts/verify/demo-dataset*.test.mjs`,
  `.env.demo-dataset*.example`; thêm `.env.seed.example` (VPS), `.env.seed.local.example` + ngoại lệ `.gitignore`; mở rộng
  `scripts/ops/postgres-backup-retention.sh`.
- `package.json`: `ops:seed` (`node dist/cli seed`), `seed:local` (`node scripts/dev/seed-local.mjs`); bỏ `ops:demo-dataset`, `dev:seed`.

## Behavior and design

**Lệnh** (mode là đối số vị trí; `--environment` theo schema bootstrap `installation.dto.ts:74-75`):

```text
node dist/cli.js seed <check|plan|apply> --environment <LOCAL_TEST|SHARED> [--fixture shared-demo-v2]
  [--api-url <url>] [--operator-reference <ref>] [--allow-bootstrap] [--secrets-stdin] [--json]
node dist/cli.js seed --help   # dòng đầu: SEED_PROTOCOL 1
```

- `check` — graph `InspectionCliModule` (phiên chỉ đọc), không cần `--api-url`. Với `--secrets-stdin`: đọc stdin bằng
  `parseDemoSecrets` và kiểm **trước** mọi đọc DB — mật khẩu Super Admin bằng `checkPasswordPolicy` với email đăng nhập của Super
  Admin trong `fixture/installation.ts` (export hàm thuần ở `identity-access/public/password.policy.ts`, re-export của
  `credentials/password.policy.ts`; tiền lệ policy thuần trong `public/`: `installation/public/recovery-target.policy.ts`), mật khẩu
  demo 12–128 như `demo-dataset-run.ts:83`; không băm, không ghi. Sai ⟹ in `REFUSED<TAB>SECRETS<TAB><lý do>` (lý do: `TOO_SHORT`, `TOO_LONG`,
  `EQUALS_LOGIN_EMAIL`, `DEMO_LENGTH`, `FORMAT`), exit 3, không có dòng `STATE`. Rồi `InstallationInspectionApi.seedCheck()` (một
  transaction chỉ đọc, không đọc `_prisma_migrations`, `P2021` ⟹ `NOT_MIGRATED`; trạng thái do hàm thuần mới `seedStateOf` trong
  `inspect/inspection-facts.policy.ts` quyết từ: có tổ chức, `bootstrapMismatches(countByAction(BOOTSTRAP_ACTIONS))`, Super Admin
  dùng được của `accountInventory`). In dòng cố định (TAB, CR, LF trong tên tổ chức thay bằng dấu cách):

  ```text
  STATE<TAB><NOT_MIGRATED|EMPTY|INSTALLED|INCOMPLETE>
  ORGANIZATION<TAB><tên hoặc ->
  FIXTURE_ORGANIZATION<TAB><yes|no>
  ENVIRONMENT<TAB><SHARED|LOCAL_TEST|UNKNOWN>      (AuditApi.firstAfterField(tx, 'INSTALLATION.ORGANIZATION_CREATED', 'environment'))
  COUNTS<TAB>departments=<n><TAB>accounts=<n>
  SECRETS<TAB><ok|not-checked>
  ```

  Exit: `0` EMPTY · `2` INSTALLED hoặc INCOMPLETE · `3` NOT_MIGRATED (có dòng `STATE`) hoặc mật khẩu sai (không có `STATE`) · `1` lỗi.

- `plan` — giữ hành vi `plan` hiện có (đọc cái đã có so với fixture; đăng nhập nên đọc stdin).
- `apply` — graph `SeedCliModule`; **lấy khóa apply trước** (`DemoAccountsApi.holdApplyLock`, khóa `seed:<fixture>:apply`) rồi
  mới đọc trạng thái (`DemoAccountsApi.seedState()`, cùng `seedStateOf`); lượt thứ hai ⟹ exit 3. `NOT_MIGRATED` ⟹ exit 3. `EMPTY` ⟹
  cần `--allow-bootstrap` (thiếu ⟹ exit 3, gợi ý `ops:bootstrap`), mở `InstallationModule` bằng `runInNestContext`, gọi
  `InstallationApi.install(fixture.installation + environment + operatorReference 'SEED:<fixture>:<ref>', superAdminPassword)` rồi
  đóng (mật khẩu yếu ⟹ exit 3, không ghi), rồi chạy các step qua HTTP như hiện có. `INSTALLED` đúng tổ chức của fixture ⟹ chạy tiếp
  phần còn thiếu. `INSTALLED` tổ chức khác hoặc `INCOMPLETE` ⟹ exit 3. Xung đột ⟹ exit 4; không còn gì để ghi ⟹ exit 2.
- Không có cờ xóa trong lệnh Nest. Mật khẩu chỉ qua stdin (rule `operational-commands`).

**Lịch (bỏ `LAST_APPLY_DAY`; file `src/cli/seed/seed-calendar.ts`).**

- Giữ: `FISCAL_YEAR_START_MONTH` phải là 1; dataset đã nạp ở năm khác ⟹ `plan`/`apply` exit 3 "dataset thuộc năm khác — chạy wrapper
  seed và chọn xóa".
- `T` = `termMonths` lớn nhất của các kịch bản có `planLine` (R1, R2: 1); `S0` = hôm nay + 7 ngày; `end` = `addMonths(S0, T)`
  − 1 ngày. `end` ≤ 31/12 năm hiện tại ⟹ như cũ: `spendDay` = `S0`, chỉ ngân sách năm hiện tại. Ngược lại (**nhánh năm sau**):
  `spendDay` = `addWorkingDays('<Y>-12-31', 1, new Set())` (`src/core/working-days.ts` — chỉ trừ thứ Bảy/Chủ nhật; dataset không
  khai ngày nghỉ) cho **mọi** Request trả phí (chúng dùng chung `spendDay`), và bước `budget.year` lập thêm đề xuất → phiên bản → duyệt **năm
  Y+1** cho mọi Cost Center có ngân sách trong fixture (ENG, MKT, SAL) với cùng `lines` (cùng thứ tự ⟹ `planLine.position` của
  R1/R2 trỏ đúng dòng năm sau). `propose()` và `budgetTurn()` nhận `year`: năm hiện tại ⟹ dòng hôm nay → 31/12; năm Y+1 ⟹
  01/01/Y+1 → 31/12/Y+1. R7 giữ ngoài kế hoạch (`offPlan`).
- Giới hạn đã biết (ghi README): ở nhánh năm sau R1 vẫn được cấp từ thuê bao năm hiện tại (`grantFrom: 'jira-eng'`, kỳ hết 31/12);
  thuê bao seed vào cuối tháng 11/tháng 12 đã qua hạn báo hủy nên lượt quét gia hạn ghi sự kiện mốc đã qua — đúng hành vi; cảnh báo
  gia hạn chỉ hiện khi seed cuối tháng 11/tháng 12.
- Công tắc chỉ cho test: input `forceNextFiscalYear?: boolean` của `runSeed` (không có cờ CLI), chỉ có hiệu lực khi
  `process.env.NODE_ENV === 'test'` — integration chứng minh nhánh năm sau ở mọi ngày.
- Unit (hàm ngày): 01/01 → 08/01; 15/06 → 22/06; 24/11 → 01/12 (vẫn năm hiện tại); 25/11, 30/11, 01/12, 25/12, 31/12 → nhánh năm
  sau; `2027-12-10` → `2028-01-03` (01/01/2028 là thứ Bảy); năm tài chính bắt đầu tháng khác 1 ⟹ từ chối.

**Rà soát dataset theo quyết định hiện hành (Owner 04/11/2026).** Đối chiếu **từng bản ghi** với `QĐ`/BRD hiện hành, ghi vào bảng
_Rà soát dataset_ trong plan (bản ghi → quy tắc → hiện trạng → sửa):

- `QĐ-95`: đã làm ở `qd95-one-role-per-account` Task 3 — kiểm lại (mỗi tài khoản một vai, trưởng phòng chỉ `MANAGER`, IT Admin/
  Finance/Người duyệt chi/Super Admin không làm trưởng phòng/người kế nhiệm).
- `QĐ-93`: không approver dự phòng/người thay thế; Người duyệt chi không là người yêu cầu/thụ hưởng; mã đúng `QĐ-93i`; không dự án;
  nhân viên chưa xếp phòng (nếu có) đúng `QĐ-93g`.
- `QĐ-94` phần đã có API: mỗi thuê bao thuộc đúng một phòng, người phòng khác xin qua phòng mình; Request R1→R9 đi đúng luồng hiện
  hành (trình lô, Finance rà soát khi ngoại lệ). Không đòi thuê bao trong cửa sổ cảnh báo gia hạn (`OD-S6`).
- **Rõ ràng:** `fixture/shared-demo-v2/README.md` có một dòng _dùng để demo gì_ cho mỗi phòng/người/tài khoản/thuê bao/Request, bảng
  tài khoản (email, vai, phòng, trưởng phòng của phòng nào) và phòng gốc `DS1-ADMIN` + Super Admin; unit test so bảng với fixture.

**Wrapper local `pnpm seed:local`** (`scripts/dev/seed-local.mjs`, Node, chạy được trên Windows; `--confirm-reset <tên database>`,
`--continue` cho chạy không tương tác):

1. Đọc `.env.seed.local` (gốc repo) như dữ liệu, không source. Bắt buộc `NODE_ENV=development` (không nhận `test` — app sẽ trỏ
   `<db>_test`), `DATABASE_URL` có host loopback (`scripts/dev/local-database-host.mjs` + `node --test`), `SEED_SUPER_ADMIN_PASSWORD`,
   `SEED_DEMO_ACCOUNT_PASSWORD`; `PORT` tùy chọn (mặc định 3000); file chứa mọi biến API/worker cần ở development (theo `.env.example`).
   Thiếu/sai ⟹ exit 3, không gọi lệnh nào.
2. **Đăng ký dọn tiến trình con trước khi tạo** (rule 8): handler `exit`, `SIGINT`, `SIGTERM` dừng mọi con (Windows:
   `taskkill /pid <pid> /T /F`). Mọi tiến trình con nhận môi trường tường minh: `process.env` + mọi giá trị của file +
   `DOTENV_CONFIG_PATH` = đường dẫn tuyệt đối của `.env.seed.local`, **trừ** `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` (xóa khỏi
   object);
   `node` chạy bằng `process.execPath`; `pnpm build` bằng `spawn('pnpm', ['build'], { shell: process.platform === 'win32' })`.
3. Cổng API đang trả lời ⟹ exit 3 "dừng `pnpm start:dev`" (watch xóa/viết lại `dist/`); luôn in cảnh báo dừng `pnpm start:worker`.
   `dist/cli.js` thiếu hoặc cũ hơn file mới nhất của `src/`/`prisma/` ⟹ `pnpm build`.
4. `node dist/cli.js seed check --environment LOCAL_TEST --secrets-stdin` (mật khẩu qua pipe). Mật khẩu sai ⟹ exit 3. `EMPTY` hoặc
   `NOT_MIGRATED` ⟹ bước 6. `INSTALLED`/`INCOMPLETE` (exit 2) ⟹ in tóm tắt: **tên database, host, cổng** (từ `DATABASE_URL`), tổ
   chức, `ENVIRONMENT`, số đếm; hỏi: gõ đúng tên database ⟹ xóa · `c` ⟹ chạy tiếp (chỉ khi `INSTALLED` và `FIXTURE_ORGANIZATION=yes`)
   · Enter ⟹ thoát 0. `check` exit 1 (schema cũ đọc lỗi) ⟹ chỉ cho xóa, xác nhận như trên. `ENVIRONMENT=SHARED` ⟹ **từ chối xóa**
   (exit 3, "DB này được bootstrap cho môi trường dùng chung").
5. Xóa: `node node_modules/prisma/build/index.js migrate reset --force` (URL của file — owner local). Không đặt biến consent.
6. Luôn `prisma migrate deploy` trước `apply` (cả khi chạy tiếp).
7. Chạy `node dist/main` và `node dist/worker`, chờ `GET http://127.0.0.1:<PORT>/api/v1/health/ready` tối đa
   `SEED_READY_TIMEOUT_SECONDS` (mặc định 120; hết ⟹ dừng con, exit 1), chạy lệnh dưới (mật khẩu qua pipe), dừng con, in báo cáo; exit theo
   `apply`.

   ```text
   node dist/cli.js seed apply --allow-bootstrap --environment LOCAL_TEST --api-url http://127.0.0.1:<PORT>      --operator-reference LOCAL-SEED --secrets-stdin
   ```

**Wrapper VPS `scripts/ops/seed.sh`**

```text
scripts/ops/seed.sh --app-dir <dir> --config <file> [--confirm-reset <tên database>] [--continue] [--ready-timeout <s>]
```

(Bash 4 + Docker Compose + `flock`; đọc `--config` và `<app-dir>/.env` như dữ liệu; không được CD chép —
guide: `scp` từ checkout của commit đang deploy). File cấu hình (`.env.seed.example`): `SEED_OPERATOR_REFERENCE`,
`SEED_SUPER_ADMIN_PASSWORD`, `SEED_DEMO_ACCOUNT_PASSWORD`, `SEED_ALLOW_RESET` (`true`|`false`). Từ `<app-dir>/.env`: `PORT` (mặc
định 3000), `POSTGRES_DB` (mặc định `software_license_management`). Mọi lệnh Compose: `API_IMAGE="<releases/current-image>" docker
compose --project-directory <app-dir> -f <app-dir>/docker-compose.prod.yml …` (kiểm image như `demo-dataset.sh:143-157`); mọi `run`
có `-T`; mật khẩu chỉ qua pipe vào stdin.

1. `flock -n` trên `releases/.deploy.lock`, giữ suốt lượt (đang khóa ⟹ exit 3). Một deploy CI/CD trong lúc seed sẽ dừng exit 2 ở
   khóa của nó — guide ghi rõ.
2. `run --rm --no-deps -T api node dist/cli.js seed --help` phải có dòng `SEED_PROTOCOL 1` (thiếu/khác ⟹ exit 3).
3. `seed check --environment SHARED --secrets-stdin`. Mật khẩu sai ⟹ exit 3. `EMPTY` ⟹ bước 6. `NOT_MIGRATED` ⟹
   `run --rm --no-deps -T migrate node node_modules/prisma/build/index.js migrate deploy` rồi bước 6 (không cần `SEED_ALLOW_RESET`).
   `INSTALLED`/`INCOMPLETE` ⟹ tóm tắt, hỏi như wrapper local (`--confirm-reset`/`--continue`): xóa cần `SEED_ALLOW_RESET=true` (thiếu
   ⟹ exit 3) và gõ đúng `POSTGRES_DB`; `--continue` không cần `SEED_ALLOW_RESET`, chỉ khi `INSTALLED` + `FIXTURE_ORGANIZATION=yes`
   (`INCOMPLETE` chỉ cho xóa). `check` exit 1 ⟹ chỉ cho xóa (cùng điều kiện).
4. Xóa, mỗi bước lỗi thì dừng và in bước đã xong:
   1. Dump `run --rm --no-deps -T backup pg_dump --format=custom --no-owner --no-privileges` vào
      `backups/postgres/slm-pre-reseed-<UTC yyyyMMddTHHmmssZ>.dump.partial`; rỗng hoặc `run --rm --no-deps -T backup pg_restore --list`
      lỗi ⟹ exit 1, chưa xóa gì; đạt ⟹ đổi tên bỏ `.partial`. `seed.sh` không xóa dump nào (retention lo).
   2. `stop api worker`.
   3. `exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""'`.
   4. `run --rm -T db-admin` (provision).
   5. `run --rm --no-deps -T migrate node node_modules/prisma/build/index.js migrate deploy` (image hiện hành ⟹ lịch sử migration
      khớp release, deploy sau không bị chặn).
   6. `run --rm --no-deps -T migrate node dist/database-roles-cli.js reconcile`.
   7. `up -d api worker`; chờ ready bằng probe trong container như `READY_PROBE` của `deploy-release.sh:303` tối đa `--ready-timeout`
      (mặc định 180 s; hết ⟹ exit 1).
   - Lỗi sau bước 3: exit 1, `api`/`worker` dừng, in lệnh khôi phục từ dump (tạo lại DB, provision, `pg_restore` bằng deploy role,
     reconcile, `up -d`).
5. (Chạy tiếp) không xóa, đi thẳng bước 6.
6. Chạy lệnh dưới; báo cáo (không mật khẩu, không token) vào
   `<app-dir>/seed-reports/<UTC>-apply.txt` (chỉ owner đọc). Exit theo lệnh (0/2/3/4/1); `3` khi wrapper tự từ chối trước khi ghi.
   CD không bao giờ gọi script này.

   ```text
   run --rm --no-deps -T api node dist/cli.js seed apply --allow-bootstrap --environment SHARED --api-url http://api:<PORT>      --operator-reference <SEED_OPERATOR_REFERENCE> --secrets-stdin
   ```

`postgres-backup-retention.sh`: thêm mẫu `^slm-pre-reseed-[0-9]{8}T[0-9]{6}Z\.dump$`, cùng quy tắc (10 bản mới nhất **mỗi loại** +
mọi bản dưới 30 ngày); test ở `scripts/verify/backup-retention.test.mjs`.

**Runbook dựng lại VPS một lần (trước khi deploy bản có `QĐ-95`; ghi trong `docs/guides/seed.md`).** Trên **image cũ** đang chạy,
giữ khóa deploy (`exec 9>releases/.deploy.lock; flock -n 9`): dump như bước 4.1 (kiểm `pg_restore --list`) → `stop api worker` →
`DROP`/`CREATE DATABASE` như bước 4.3 → `run --rm db-admin` → image cũ `migrate deploy` → `reconcile` → `up -d api worker` (chờ ready)
→ nhả khóa → để CI/CD deploy bản `QĐ-95` như thường (DB có lịch sử migration nên đường quay lại được đánh giá trên DB đọc được,
`deploy-release.sh:286` không chặn) → `scp` `seed.sh`, tạo `.env.seed` → `seed.sh` (`EMPTY` ⟹ bootstrap + dữ liệu). Cùng thứ tự
dump → stop như `seed.sh`. Từ lần sau seed lại bằng `seed.sh` có reset.

**Rule và tài liệu.**

- `docs/rules/operational-commands.md`: câu `OD-A7` (dòng 8-11) thêm **ngoại lệ có lý do** (Owner 04/11/2026): `demo-dataset`,
  `dev-seed` và alias của chúng bị xóa vì VPS dựng lại và `seed.sh` thay mọi người gọi; bảng lệnh; rule 2 viết lại cho `seed:local`
  (`NODE_ENV=development` + host loopback + gõ tên database/`--confirm-reset`, thay `--confirm-local`); rule reset (chỉ ở wrapper, chỉ
  khi cấu hình cho phép và có xác nhận, local từ chối DB `SHARED`); đoạn `ops:demo-dataset` (dòng 76-95). ADR-0019: ghi chú ngoại lệ
  `OD-A7` cạnh dòng 50.
- Gate `test/gates/operational-commands.gate-spec.ts` (`COMMAND_FOLDERS`, `COMMAND_ONLY_FILES`, `ALIAS_CALLERS`, `scriptOf`, test rule
  2), `module-graph.gate-spec.ts:28-29`, `extension-wiring.gate-spec.ts:54-55,110-111,160` (đổi tên `DemoDatasetCliModule` →
  `SeedCliModule`, bỏ `DevSeedCliModule` — số mục ngoại lệ không tăng; lý do của mục `ApprovalRoleChangeListeners` vẫn là cấp
  `FINANCE` qua `LocalDemoAccountApi.createDemoAccount`), `test/support/process-graphs.ts:7-8`.
- `docs/rules/database-business.md:11`; `docs/guides/containers.md:111,404`; guide mới `docs/guides/seed.md`;
  `docs/guides/demo-dataset.md` thành trang ngắn trỏ sang `seed.md`; `docs/guides/bootstrap-installation.md`; `ARCHITECTURE.md:26,28`;
  `AGENTS.md:30` (kiểm, chỉ sửa nếu cần); `docs/rules/module-structure.md:172-178`; `README.md:14-23,53,63`; `docs/guides/huong-dan-dev-moi.md`;
  `docs/README.md:24`; `scripts/README.md:21-27`; `src/modules/installation/README.md`; `src/modules/identity-access/README.md:36-37,83`;
  `src/modules/organization/README.md:20,32,102`; `test/support/README.md:278-279`; `rules-check.config.json` và danh sách
  `rules:format` (`package.json`) thêm `docs/guides/seed.md`; `eslint-suppressions.json` (bỏ mục của file đã xóa, dòng 101, 111).

Migration, collection API, jobs/storage: không áp dụng.

## Test matrix

| AC / rủi ro                    | Tình huống (gồm từ chối, edge case)                                                                                                                                                                               | Cấp test                                                                | Kết quả mong đợi                                                                                                             | Bằng chứng |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- |
| SEED.1 check                   | DB chưa migrate; DB trống; sau `apply`; installation dở (chỉ tổ chức); tên tổ chức có TAB/xuống dòng                                                                                                              | integration                                                             | `NOT_MIGRATED` exit 3; `EMPTY` exit 0; `INSTALLED` exit 2 tên/số/`ENVIRONMENT` đúng; `INCOMPLETE` exit 2; không ghi          | planned    |
| SEED.1 check runtime role      | `check` (cả `NOT_MIGRATED`) và `apply` bằng runtime role, `NODE_ENV=production`                                                                                                                                   | integration `_serial`                                                   | không lỗi quyền (không đọc `_prisma_migrations`)                                                                             | planned    |
| SEED.1 mật khẩu                | `check --secrets-stdin`: mật khẩu Super Admin ngắn/dài/trùng email; mật khẩu demo ngoài 12–128; sai định dạng                                                                                                     | unit + integration                                                      | `REFUSED SECRETS <lý do>`, exit 3, không dòng `STATE`, không đọc/ghi DB                                                      | planned    |
| SEED.1 apply từ trống          | DB trống ± `--allow-bootstrap`; mật khẩu Super Admin yếu                                                                                                                                                          | integration                                                             | đủ tổ chức, phòng `DS1-ADMIN`, Super Admin, dữ liệu, R1→R9 đúng đích, exit 0; thiếu cờ ⟹ 3; mật khẩu yếu ⟹ 3                 | planned    |
| SEED.1 chạy lại/tiếp           | `apply` lần hai; lỗi giữa chừng rồi chạy lại; bản ghi dataset bị sửa; danh sách quá dài                                                                                                                           | integration (giữ các test xung đột hiện có)                             | exit 2 không ghi thêm; đi tiếp không bản sao; sửa ⟹ exit 4; quá dài ⟹ xung đột                                               | planned    |
| SEED.1 tổ chức khác/dở         | `INSTALLED` tổ chức khác; `INCOMPLETE`                                                                                                                                                                            | integration                                                             | exit 3, không ghi                                                                                                            | planned    |
| SEED.1 đồng thời               | Hai `apply` cùng lúc trên DB trống                                                                                                                                                                                | integration                                                             | một chạy, một exit 3 (khóa lấy trước khi đọc trạng thái); không bootstrap hai lần                                            | planned    |
| SEED.1 dataset đúng quyết định | Sau `apply`: một vai mỗi tài khoản; trưởng phòng chỉ `MANAGER`; Người duyệt chi không là người yêu cầu/thụ hưởng; mỗi thuê bao một phòng; R1→R9 đúng đích                                                         | integration                                                             | mọi khẳng định xanh                                                                                                          | planned    |
| SEED.1 bảng tài khoản          | `fixture/shared-demo-v2/README.md` so với fixture                                                                                                                                                                 | unit                                                                    | khớp                                                                                                                         | planned    |
| SEED.1 lịch                    | Hàm ngày với các ngày của spec; dataset năm khác; năm tài chính không bắt đầu tháng 1                                                                                                                             | unit                                                                    | `spendDay`/nhánh đúng; năm khác ⟹ exit 3                                                                                     | planned    |
| SEED.1 nhánh năm sau           | `apply` với `forceNextFiscalYear` (`NODE_ENV=test`); cùng input khi `NODE_ENV≠test`                                                                                                                               | integration                                                             | ngân sách Y+1 `APPROVED` cho ENG, MKT, SAL; R1 `COMPLETED`, R2 chờ quyết chi với `expectedSpendOn` Y+1; ngoài test bị bỏ qua | planned    |
| SEED.1 lệnh cũ                 | `node dist/cli.js demo-dataset`, `dev-seed`; `pnpm ops:demo-dataset`, `pnpm dev:seed`                                                                                                                             | gate + unit                                                             | lệnh không có trong bảng (lỗi "unknown command"); không còn alias, script npm hay người gọi                                  | planned    |
| SEED.1 chốt local              | `NODE_ENV=test`/`production`/thiếu; `DATABASE_URL` thiếu/host không loopback; API đang trả lời trên cổng                                                                                                          | script (`node --test`, prisma/node giả)                                 | exit 3, không gọi lệnh nào                                                                                                   | planned    |
| SEED.1 xác nhận local          | Enter; gõ sai tên database; `c` khi tổ chức khác/`INCOMPLETE`; `--confirm-reset` đúng/sai; `check` exit 1 rồi xóa; `NOT_MIGRATED`; `ENVIRONMENT=SHARED`                                                           | script (`node --test`, giả)                                             | thoát 0 / 3 / reset → migrate → apply / tiếp / migrate → apply / từ chối xóa                                                 | planned    |
| SEED.1 an toàn local           | `dist` cũ hơn `src` ⟹ build; biến consent có trong môi trường cha; SIGINT khi API con đang chạy; mật khẩu sai trước khi xóa; hết thời gian chờ ready                                                              | script (`node --test`, giả)                                             | build chạy; con không nhận biến consent; con bị dừng; không gọi reset; exit 1 và con bị dừng                                 | planned    |
| SEED.1 VPS wrapper             | Không `SEED_ALLOW_RESET`; khóa deploy đang giữ; image không có `SEED_PROTOCOL 1`; dump rỗng/`pg_restore --list` lỗi; sai tên database; thứ tự dump→stop→drop→provision→migrate→reconcile→up→apply; lỗi sau drop   | `scripts/verify/seed.test.mjs` (docker giả ghi thứ tự lệnh) + `bash -n` | đúng thứ tự, đúng từ chối, exit 1 + lệnh khôi phục khi lỗi sau drop                                                          | planned    |
| SEED.1 VPS nhánh               | `check` exit 1 (chỉ xóa); exit 3 `NOT_MIGRATED` (migrate deploy, không cần `SEED_ALLOW_RESET`); `INCOMPLETE` + `--continue`; `--continue` không cần `SEED_ALLOW_RESET`; hết thời gian chờ ready; `PORT` từ `.env` | `scripts/verify/seed.test.mjs`                                          | đúng nhánh; `--api-url http://api:<PORT>`; mọi `run` có `-T`; mật khẩu chỉ qua stdin                                         | planned    |
| SEED.1 retention               | Thư mục có `slm-pre-reseed-*` và `slm-pre-migrate-*` cũ/mới                                                                                                                                                       | `scripts/verify/backup-retention.test.mjs`                              | giữ 10 mới nhất mỗi loại + mọi bản < 30 ngày; tên khác không chạm                                                            | planned    |
| SEED.1 bỏ `dev:seed`           | Gate lệnh vận hành, module graph, extension wiring, policy ownership                                                                                                                                              | `pnpm test:gates`                                                       | không còn `DevSeedApi`/`DevSeedCliModule`; số mục ngoại lệ không tăng                                                        | planned    |
| SEED.1 local thật              | Máy dev có dữ liệu → `pnpm seed:local` → gõ tên database → seed lại                                                                                                                                               | thủ công (**Owner** — Prisma chặn agent AI)                             | thành công, đăng nhập các vai demo                                                                                           | planned    |
| SEED.1 VPS thật                | Runbook dựng lại một lần; sau đó `seed.sh` có reset                                                                                                                                                               | thủ công (Owner)                                                        | dump được tạo; DB dựng lại; đăng nhập các vai demo; deploy kế tiếp bình thường                                               | planned    |

## Definition of Done

- [ ] Integration seed (check/apply/chạy lại/tiếp/khác tổ chức/đồng thời/dataset/nhánh năm sau/runtime role `_serial`) xanh trên
      PostgreSQL riêng.
- [ ] Unit (hàm ngày, mật khẩu, bảng tài khoản), script tests của hai wrapper và retention, gate lệnh vận hành và module graph xanh.
- [ ] Quick set (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`,
      `pnpm test:scripts`) xanh sau **từng** task.
- [ ] Bảng _Rà soát dataset_ đầy đủ; `fixture/shared-demo-v2/README.md` mô tả mọi bản ghi; Docs `Figma UI-UX/API-Integration/demo/**`
      viết lại.
- [ ] Rule/guide/tài liệu ở mục _Rule và tài liệu_ cập nhật (gồm ngoại lệ `OD-A7` và ghi chú ADR-0019); Owner chạy local thật và
      runbook VPS, ghi kết quả.

## Changes and acceptance

- 04/11/2026 (disposition + Owner): kiểm mật khẩu trước khi xóa; bỏ yêu cầu cửa sổ cảnh báo gia hạn; lịch cuối năm sang năm tài
  chính kế tiếp có ngân sách năm sau; xóa hẳn hai lệnh cũ (ngoại lệ `OD-A7`); runbook VPS giữ đường quay lại; xác nhận bằng tên
  database, local từ chối DB `SHARED`; `check` chỉ đếm phòng/tài khoản; fixture `shared-demo-v2` nhận từ `qd95-one-role-per-account`.
- 04/11/2026: implement cục bộ Tasks 1–8; chưa review, chưa chạy integration/e2e hay reset thật. Task 9 Docs chờ Owner seed VPS.
- Owner xác nhận trong chat: giữ `--allow-bootstrap` theo spec (sửa ghi chú plan nói bỏ cờ); cho sửa duy nhất đích link calendar ở phần tham chiếu sau khi chuyển thư mục.
- Owner xác nhận dùng hàm public wrapper gọi policy credential hiện có thay cho cú pháp re-export ở phần thiết kế, vì gate cấm re-export trong business module. Không đổi policy hay nới gate. Bằng chứng ở plan và báo cáo implement.
