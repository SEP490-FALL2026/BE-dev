# Audit kiến trúc toàn bộ `src` — H4.0, 19/10/2026

Lượt audit **chỉ đọc** đối với product code, chạy theo Prompt 09 sau H3c. Mục tiêu: kiểm kê toàn bộ source BE, chứng minh
vùng nào thật sự cần refactor và tách backlog thành lát nhỏ. Không sửa `src/**`, `test/**`, Prisma, migration, config,
package hay `openapi.json`; không bắt đầu H4.1/H5/H6/H8/G3.

- Phụ lục đối chiếu đầy đủ `R`/`F`/`M`/`H`/`G`: [reconciliation.md](reconciliation.md).
- Báo cáo trước: [audit nền tảng 18/10/2026](../be-foundation-audit-2026-10-18/README.md) (`F-01` → `F-35`, Q1–Q9).
- Kế hoạch đang có: [foundation-remediation-handoff-2026-10-18](../../workspace/items/foundation-remediation-handoff-2026-10-18/spec.md).
- Quyết định Owner E1 → E9 (Prompt 09B, 19/10/2026): [mục 12](#quyết-định-owner-09b). H4.0 đóng sau 09B.

Quy ước nhãn: **Fact** = có tệp:dòng hoặc lệnh tái lập được; **Inference** = suy ra từ fact; **Recommendation** = đề xuất.
Mã finding mới của lượt này là `A4-01` → `A4-23` (tránh trùng `N-1` → `N-6` của review G0/G1).

## 1. Baseline và giới hạn

| Thuộc tính           | Giá trị đã kiểm (19/10/2026)                                                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo / branch / HEAD | BE `dev` / `bd05007` (`feat: update auth`)                                                                                                                                                                                             |
| Working tree         | Đầu lượt **68** đường dẫn dirty = 52 tracked + 16 untracked (10 tệp item H2a/H2b/H3a/H3b/H3c, 6 tệp mới trong `src`) — toàn bộ chuỗi H1 → H3c; cuối H4.0 **70** = 52 tracked + 18 untracked (thêm 2 tệp báo cáo này); chưa commit/push |
| `openapi.json`       | sha256 `14fd428b…` (baseline H3b/H3c)                                                                                                                                                                                                  |
| Docs nghiệp vụ       | `9416fe0` (chỉ đọc; không mở lại nguồn nghiệp vụ trong lượt này)                                                                                                                                                                       |
| Bảo toàn             | hash sha256 của 68 tệp dirty chụp đầu lượt và so cuối lượt (mục 13)                                                                                                                                                                    |

Giới hạn:

- Audit đọc source và chạy gate kiến trúc; **không** chạy lại integration/e2e (bằng chứng H3c: unit 562, e2e 274,
  integration 597 vẫn là bằng chứng gần nhất của cây này).
- Ba subagent **chỉ đọc** quét song song (core/infrastructure/root; identity-access + organization; các module còn lại +
  test/tooling). Agent chính kiểm lại mọi finding dùng trong báo cáo bằng lệnh/đọc tệp (mục 13).
- Số 63 từng ghi trong tracker là số cũ, không phải trạng thái Git thật: đầu H4.0 cây có 68 đường dẫn dirty (H3c thêm tệp
  mới), cuối H4.0 có 70 (mục 13). Số liệu dưới đây đếm lại từ filesystem.

## 2. Bản đồ `src` và chiều phụ thuộc

Đếm bằng script đọc-chỉ (mục 13), tệp `*.ts`, không gồm `src/generated`: **246 tệp** (192 non-spec, 54 spec),
**22 554 dòng**.

| Vùng                            | TS  | Non-spec | Controller | Service | Repo | Errors/http-errors | DTO | Module | Dòng  |
| ------------------------------- | --- | -------- | ---------- | ------- | ---- | ------------------ | --- | ------ | ----- |
| `modules/identity-access`       | 55  | 45       | 5          | 16      | 4    | 4 + 1              | 5   | 3      | 6 346 |
| `modules/organization`          | 36  | 33       | 5          | 6       | 4    | 4 + 1              | 4   | 2      | 4 599 |
| `modules/data-import`           | 10  | 8        | 1          | 1       | 1    | 1                  | 1   | 1      | 1 965 |
| `modules/operating-parameters`  | 11  | 10       | 1          | 2       | 1    | 1 + 1              | 1   | 2      | 1 071 |
| `modules/notifications`         | 9   | 7        | 0          | 2       | 1    | 0                  | 0   | 1      | 723   |
| `modules/installation`          | 8   | 5        | 0          | 1       | 0    | 0                  | 0   | 1      | 687   |
| `modules/catalog` (không mount) | 15  | 12       | 1          | 1       | 1    | 1                  | 4   | 1      | 574   |
| `modules/audit`                 | 14  | 11       | 1          | 2       | 2    | 1                  | 1   | 2      | 562   |
| `modules/onboarding`            | 4   | 3        | 1          | 1       | 0    | 0                  | 0   | 1      | 342   |
| `core`                          | 6   | 3        | —          | —       | —    | —                  | —   | 0      | 156   |
| `infrastructure` (9 thư mục)    | 64  | 46       | 1          | 2       | 0    | —                  | 2   | 9      | 4 029 |
| `src/` gốc                      | 14  | 9        | —          | —       | —    | —                  | —   | 3      | 1 500 |

**Chiều phụ thuộc thực tế (Fact, từ đồ thị import tương đối):**

```text
composition roots (main, worker, recovery-cli, installation-cli, email-dispatch.loop)
        │
        ▼
onboarding ──► data-import ──► organization ◄── identity-access ──► notifications
    │              │               ▲   │              │
    │              └──► audit ◄────┼───┴──────────────┘
    └──► identity-access (facade)  │
installation ──► identity-access (facade), organization, audit
operating-parameters ──► organization, audit
organization (chỉ OrganizationHttpModule) ──► identity-access (IdentityAccessFacadeModule)
        │
        ▼
infrastructure ──► core          (không tệp infrastructure nào import modules)
```

- Không import nào đi vào **subfolder** hay `*.repo.ts` của module khác (script `edges.py`: 0 vi phạm). Core không import
  Nest/Prisma/infrastructure/modules.
- **Không có chu trình Nest:** `OrganizationModule.imports = [DatabaseModule]`; chỉ `OrganizationHttpModule`
  (`organization-http.module.ts:23`) import `IdentityAccessFacadeModule`, còn `IdentityAccessFacadeModule` import
  `OrganizationModule`. Tệp organization duy nhất import identity-access là `department.service.ts:7` — ngoại lệ đã ghi ở
  `ARCHITECTURE.md`.
- Cạnh liên module tới tệp root **không phải facade** (Fact): `data-import/employee-import-rows.ts:3`,
  `employee-import.service.ts:8` → `organization/job-title-name.ts`; `onboarding/onboarding.service.ts:2` →
  `data-import/employee-import.service.ts`; `src/email-dispatch.loop.ts:5` → `notifications/email-dispatcher.service.ts`
  (A4-02).

## 3. Ma trận disposition module/capability

A giữ nguyên · B rule/gate/tài liệu · C refactor độc lập trước G3 · D refactor khi capability được mở · E cần Owner/dev
quyết (đã quyết ở 09B — [mục 12](#quyết-định-owner-09b)). Mỗi dòng đúng một phân loại chính.

| Module / capability                                             | Disp. | Lý do (Fact → Inference)                                                                                                                                                                                                                                                                                                                                  | Lát                   |
| --------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| identity-access / auth                                          | C     | `auth.controller.ts` (274 dòng) gom phiên + đặt lại + redeem lời mời (`:237-263` thuộc accounts), mapping lỗi inline (`:45-50`, `:86-133`); phụ thuộc hai chiều với accounts (F-25); `password-reset.service.ts` 10 dependency                                                                                                                            | H5.2, H5.3, H5.5      |
| identity-access / accounts                                      | C     | `account.repo.ts` 411 dòng trên bốn aggregate (AppUser, credential, role grant, action token); lớp lỗi trong `super-admin-transfer.service.ts:13`; mapper 21 nhánh dùng chung cho auth/access                                                                                                                                                             | H5.2, H5.3, H5.7 (E5) |
| identity-access / approval-roles                                | C     | Gọn; chỉ mapper HTTP trong `approval-role.errors.ts:25-47` và mã `ORGANIZATION.EMPLOYEE_NOT_FOUND` lặp với `account.http-errors.ts:44`. Ownership bảng giữ theo Q7                                                                                                                                                                                        | H5.3                  |
| identity-access / access                                        | C     | Verifier đọc ruột ba capability (`jwt-access-token.verifier.ts:11-13`); `resolveEffectiveRoles` (`account-policy.ts:71-80`) chỉ access dùng                                                                                                                                                                                                               | H5.4, H5.5            |
| identity-access / recovery (root, entry CLI)                    | E     | `recovery.service.ts` 608 dòng, `transferRole` 194 dòng (`:274-467`); F-19 (`recovery.repo.ts:159-166`); root còn 2 chỗ trước ngưỡng 12 — vị trí tách và wiring `SessionRepo` là trade-off thật                                                                                                                                                           | H5.6 (E6), H5.7 (E7)  |
| identity-access / root `dto/`, `errors/`, facade                | C     | `dto/approval-role`, `me`, `super-admin-transfer` chỉ một capability dùng; `errors/identity-access.errors.ts` 22 lớp trộn auth/accounts + adapter DB (`:167-177`); facade import ruột capability (`identity-access.service.ts:5-8`)                                                                                                                       | H5.1, H5.2            |
| organization / project                                          | C     | Persistence **trong** `department.repo.ts:404-498`; DTO trong `dto/department.dto.ts`; lỗi trong `errors/department.errors.ts:90-102`; controller import controller (F-11)                                                                                                                                                                                | H4.1, H4.2            |
| organization / job-title                                        | C     | Persistence trong `organization.repo.ts:76-170`; helper `job-title-name.ts` bị `data-import` dùng (Q6: chuyển primitive vào core)                                                                                                                                                                                                                         | H4.3a, H4.3b          |
| organization / employee + placement                             | C     | `organization.repo.ts:172-398` (cùng `lockDepartmentByCode` `:178-203`); lỗi public re-export ở `organization.errors.ts:10`                                                                                                                                                                                                                               | H4.4                  |
| organization / cost-center                                      | C     | Hai nơi ghi `cost_centers`: `cost-center.repo.ts` và `organization.repo.ts:67` (A4-08)                                                                                                                                                                                                                                                                    | H4.5                  |
| organization / department + department-head + Manager           | C     | `department.service.ts` 519 dòng (head `:336-447`), `department.repo.ts` 507 dòng; hai nơi ghi `departments` (`organization.repo.ts:71`); F-12 (`:485`); mã chết `readCostCenterForDepartment` (`department.repo.ts:166`)                                                                                                                                 | H4.1, H4.6            |
| organization / import-lookup                                    | A     | Repo chỉ đọc cho facade; chỉ cần gỡ export không consumer (F-13) ở H4.1                                                                                                                                                                                                                                                                                   | H4.1                  |
| organization / root (module, http module, facade, repo exports) | E     | Ba repo export cho `OrganizationHttpModule` (`organization.module.ts:14`); bỏ export đòi chuyển service vào graph worker/CLI hoặc submodule mới                                                                                                                                                                                                           | H4.7 (E4)             |
| data-import                                                     | D     | Một aggregate, ranh giới sạch qua facade; nợ thật (mapper HTTP trong tệp lỗi, service 545 dòng, không có facade cho onboarding) nhưng không chặn G3; trigger: H8 hoặc loại import thứ hai                                                                                                                                                                 | H8.1 → H8.3           |
| operating-parameters                                            | A     | Lỗi và mapper HTTP đã tách (`operating-parameters.http-errors.ts`); `parameter-definitions.ts` là bảng policy thuần có spec; repo hai bảng 125 dòng chấp nhận được                                                                                                                                                                                        | —                     |
| notifications                                                   | A     | Facade 45 dòng, dispatcher, repo một bảng, raw SQL trong repo; chỉ lệch tài liệu `ARCHITECTURE.md:193` (B qua DOC.1)                                                                                                                                                                                                                                      | DOC.1                 |
| audit                                                           | A     | Tách ghi (`AuditModule`) / đọc (`AuditHttpModule`) hợp lý; gate giữ reader khỏi worker/CLI (`module-graph.spec.ts:214`)                                                                                                                                                                                                                                   | —                     |
| onboarding                                                      | A     | Điều phối thuần qua facade (3 dependency); chỉ dùng `EmployeeImportService` vì data-import thiếu facade — sửa phía data-import                                                                                                                                                                                                                            | (H8.3)                |
| installation                                                    | D     | Lớp lỗi trong service (`installation.service.ts:12-25`), raw advisory lock (`:66`); sẽ bị mở bởi H6.1/H6.2                                                                                                                                                                                                                                                | H6.3                  |
| catalog                                                         | E     | Không mount; không theo rule hiện hành (service ném `ApiException` `catalog.service.ts:3,53,69`, controller không khai quyền); tài liệu vẫn gọi là mẫu (A4-14, A4-15)                                                                                                                                                                                     | E1, DOC.1             |
| `core`                                                          | A     | Ba tệp thuần; `Page<T>` chung và `normalizeDisplayName` sẽ được **thêm** bởi lát module (H4.3a, H8.3), không cần lát riêng; thư mục rỗng `core/time/` (A4-18)                                                                                                                                                                                             | —                     |
| infrastructure / config                                         | C     | `env-schema.ts` 425/425 dòng (cap ledger, không còn khoảng trống cho biến mới của G3); `resolveDatabaseUrl` bị chép ở `prisma.config.ts:4-16` trong khi chú thích `env-schema.ts:409-410` nói Prisma CLI dùng lại (A4-07)                                                                                                                                 | H6.3 (E3)             |
| infrastructure / database                                       | C     | F-30: cảnh báo `pg` từ test; `pg-pool.ts` dựa vào nội bộ `pg`/`pg-pool` (`:126`, `:248-251`) với phạm vi `^8.23.0`                                                                                                                                                                                                                                        | INF.1                 |
| infrastructure / security                                       | C     | F-18: `bearer-token.ts:6` phân biệt hoa/thường scheme (RFC 7235 không phân biệt); không test ghim hành vi                                                                                                                                                                                                                                                 | AUTH.1                |
| infrastructure / object-storage, queue                          | E     | `ObjectStorageModule` không có consumer nhưng nạp ở `app.module.ts:25`, `worker.module.ts:16`; `QueueInfrastructureModule` nạp ở `worker.module.ts:17` không đăng ký queue; production đòi `REDIS_PASSWORD` (`env-schema.ts:377`) và object storage HTTPS (A4-06)                                                                                         | H6.4 (E2)             |
| infrastructure / http, health, mail, observability              | A     | Đúng ranh giới; hằng số 422 cục bộ lặp ở 6 controller (A4-13) xử lý trong lát module                                                                                                                                                                                                                                                                      | —                     |
| composition roots                                               | B     | Không business logic; hai CLI chép `fail`/`cliLogger`/`isEnvironmentValidationError` (`recovery-cli.ts:15-34`, `installation-cli.ts:142-165`) và so `error.name` (`recovery-cli.ts:32`, `installation-cli.ts:41`) mà gate không quét root (A4-04); `email-dispatch.loop.ts` là root có logic, đặt chủ đích (ADR-0012) nhưng rule chưa cho phép tường minh | GATE.1, DOC.1, ROOT.1 |
| architecture gates (`src/*.spec.ts`)                            | B     | Bốn điểm mù đo được (mục 7)                                                                                                                                                                                                                                                                                                                               | GATE.1 (E9)           |
| `test/**`, scripts                                              | B     | 50 import từ `test/**` vào `src/modules` (9 vào subfolder, 9 vào `*.repo.ts`); đa phần là tra token DI, typecheck bắt khi move. Không cần gate; cần một dòng hướng dẫn trong `test/README.md`                                                                                                                                                             | DOC.1                 |

Tổng: 9 module, 13 capability trong hai module lớn (identity-access 6 hàng, organization 7 hàng), core, 9 thư mục
infrastructure, 9 tệp root, gate và test. Phân bố: A 7 · B 3 · C 13 · D 2 · E 4 (29 hàng bảng). C tập trung ở
identity-access/organization và ba điểm nhỏ của infrastructure — không gom các module khác vào C.

## 4. Inventory loại tệp và hotspot

**Tệp non-spec lớn nhất (Fact):**

| Tệp                                                | Dòng | Ledger cap | Trách nhiệm bị trộn                                                                                                                 |
| -------------------------------------------------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `identity-access/recovery.service.ts`              | 608  | 608        | ba workflow khôi phục, audit builder (`:539-566`), parse email (`:568-607`), chép flow lời mời (`:510-536`), SQL-state (`:433`)     |
| `data-import/employee-import.service.ts`           | 545  | 545        | upload/view/refresh/cancel/confirm, đọc CSV (`:379-412`), judge, summary, mapping, `Page<T>` riêng (`:77`), ba khối audit gần giống |
| `organization/department.service.ts`               | 519  | 519        | đọc/CRUD phòng, giai đoạn trưởng phòng (`:336-447`), kiểm IT Admin qua identity, `Page<T>` (`:40`), SQL-state (`:380-381`)          |
| `organization/department.repo.ts`                  | 507  | 507        | phòng, thành viên, trưởng phòng (`:249-402`), **project** (`:404-498`), đếm cho onboarding                                          |
| `infrastructure/config/env-schema.ts`              | 425  | 425        | khai báo kiểu, schema đầy đủ, schema cài đặt, bất biến database, chính sách production (`:343-390`)                                 |
| `identity-access/accounts/account.repo.ts`         | 411  | 411        | AppUser, credential, role grant, action token (~35 method)                                                                          |
| `organization/organization.repo.ts`                | 398  | —          | Organization, CostCenter, Department, JobTitle, Employee/Placement                                                                  |
| `identity-access/accounts/app-users.controller.ts` | 296  | —          | 9 route, cùng try/catch, mapper wire (`:31-58`)                                                                                     |
| `organization/departments.controller.ts`           | 293  | —          | 9 route, mapper `toWire`/`toProjectWire`/`toProfileWire` (`:41-80`)                                                                 |
| `identity-access/auth/auth.controller.ts`          | 274  | —          | phiên, đặt lại, redeem lời mời, mapping lỗi inline                                                                                  |

**Service vượt tín hiệu 6 dependency (Fact):** `password-reset.service.ts` 10 · `recovery.service.ts` 9 ·
`login.service.ts` 8 · `session.service.ts`, `password-change.service.ts`, `account-invitation.service.ts`,
`department.service.ts` 7.

**Lỗi và mapper (Fact):** identity-access có lỗi ở 7 chỗ (root `identity-access.errors.ts` 1 lớp public; `errors/` 22 lớp +
adapter; `account.http-errors.ts` 21 nhánh; `approval-role.errors.ts` 2 lớp + mapper; `recovery.errors.ts`;
`recovery.arguments.ts:4`; `super-admin-transfer.service.ts:13`) cộng mapping inline ở `auth.controller.ts` và
`super-admin-transfers.controller.ts:17-32`. organization: `errors/` 25 lớp (gồm 2 lớp project trong tệp department),
root `organization.errors.ts` 1 lớp + re-export 2, một mapper 25 nhánh `organization.http-errors.ts` (giữ: một mapper cho
lớp HTTP của bounded context là hợp lý).

**Trùng lặp (Fact):** 7 bản `Page<T>`/`*Page` (`department.service.ts:40`, `cost-center.service.ts:22`,
`employee-import.service.ts:77`, `job-title.service.ts:18`, `audit-query.service.ts:6`, `account-query.service.ts:42`,
`catalog.types.ts:23`) — A4-12; hằng số 422 `VALIDATION_ERROR` cục bộ ở 6 controller — A4-13; danh sách lý do
phòng/chức vụ của import (`employee-import-rows.ts:183-193`) chép lại `organization/employee-row.validator.ts` dù validator
ghi là sẽ dùng chung (`:36-37`) — A4-11 (rủi ro hành vi, không phải refactor).

## 5. Đồ thị import liên module và nội module

**Liên module (Fact, số cạnh import):** identity-access → organization 25, → audit 14, → notifications 9;
organization → audit 7, → identity-access 2 (chỉ `department.service.ts` + HTTP module); data-import → organization 5,
→ audit 2; onboarding → organization 4, → identity-access 3, → data-import 3; installation → identity-access 2,
→ organization 2, → audit 2; operating-parameters → organization 3, → audit 3.

**Nội module giữa folder (Fact):**

- identity-access: auth → accounts 13, root → auth 14, root → accounts 13, auth → root 11, accounts → root 7, access →
  auth 6, auth → errors 7, accounts → auth 4. 21 cạnh nằm trong ledger `crossCapabilityImports` (đều còn đúng; đã kiểm
  mẫu `jwt-access-token.verifier.ts:11-13`, `me.service.ts:5`, `account-status.service.ts:6`, `login.service.ts:7-8`).
- organization (phẳng): root → `errors/` 12, root → `dto/` 5, `dto/` → root 2. Vì phẳng, các cạnh giữa capability **không
  nhìn thấy được** cho tới khi có folder; sẽ thành vi phạm ngay khi tách: department → cost-center repo
  (`department.service.ts:8`, `:203`), department → persistence employee (`:30`, `:481-490`), project → department repo
  (`project.service.ts:5`), employee → job-title/department persistence (`employee-manual.service.ts:71`, `:75`),
  cost-center → helper job-title (`cost-center-name.ts:1`), DTO department → helper cost-center và schema project
  (`dto/department.dto.ts:5`, `:94`).
- Cạnh nội module gate **không** thấy vì một đầu ở root (A4-01): `auth/password-reset.service.ts:15` → root
  `recovery.repo.ts` (gồm ghi `recovery_tickets`); `recovery.service.ts:11-15` → ruột accounts/auth;
  `identity-access.service.ts:5-8` → ruột accounts/auth.

## 6. core, infrastructure, composition root, worker và CLI

- **core (A):** `application/pagination.ts` (chỉ catalog dùng), `business-date.ts` (5 module dùng), `email.ts` (4 module;
  mang mã FR/US trong chú thích và quy tắc bỏ `+tag` — là policy khớp danh tính, chấp nhận). Thư mục `core/time/` rỗng.
- **infrastructure (A, trừ ba điểm C/E):** không tệp nào import `src/modules`. `config` — xem A4-07; `database` — F-30;
  `security` — F-18; `AuthenticatedPrincipal` (`access-token-verifier.port.ts:13-16`) mang từ vựng identity (ghi nhận,
  giữ); `SecurityModule` export hai guard không ai dùng (giữ, nhỏ); `object-storage`/`queue` không consumer (A4-06, E2);
  `mail` không có Nest module, do notifications cung cấp (giữ).
- **Composition root (B):** `main.ts`, `bootstrap.ts`, `worker.ts` không có business logic; `ConfigModule.forRoot` validate
  env lúc import (CLI hoãn đúng bằng dynamic import `recovery-cli.ts:67`, `installation-cli.ts:188`). `RecoveryCliModule`
  gọn. Hai CLI chép helper và so `error.name` (A4-04); `installation-cli.ts:229` viết cứng "12–128 ký tự" thay vì hằng số
  policy. `email-dispatch.loop.ts` là provider của `WorkerModule` (`worker.module.ts:21`) nối dispatcher với
  `isActionLinkUsable` mà không cho notifications import identity-access — đặt chủ đích theo ADR-0012, nhưng
  `module-structure.md` chỉ cho root chứa composition root và gate.

## 7. Gate kiến trúc: phủ và điểm mù

Gate hiện có (35 test, xanh — mục 13): `architecture-boundaries.spec.ts` (core thuần; liên module chỉ root; layer folder;
ownership Prisma/raw SQL; đồ thị cài đặt R-13), `architecture-structure.spec.ts` (cross-capability, controller →
controller, catch-all, lỗi ngoài tệp lỗi, trùng tên lỗi, HTTP mapping trong tệp lỗi, `error.name`, raw SQL ngoài repo,
kích thước, root count, độ sâu; ledger `LEGACY` `:25-84`), `module-graph.spec.ts` (provider trùng, đồ thị worker/CLI,
private export; ledger `:27-38`).

Điểm mù đo được (Fact, mỗi điểm có ca sống):

| Mã    | Điểm mù                                                                                  | Dòng gate                                    | Ca sống trên cây                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A4-01 | Cross-capability bỏ qua importer ở root module và target ở root module                   | `architecture-structure.spec.ts:160`, `:166` | `password-reset.service.ts:15` → `recovery.repo.ts`; `recovery.service.ts:11-15`; `identity-access.service.ts:5-8`    |
| A4-02 | Liên module coi **mọi** tệp root là public (trừ `*.repo.ts`, password hasher)            | `architecture-boundaries.spec.ts:254`        | data-import → `job-title-name.ts` ×2; onboarding → `employee-import.service.ts`; loop → `email-dispatcher.service.ts` |
| A4-03 | Gate private export chỉ nhận tên đuôi `Repo` hoặc `PasswordHasher`                       | `module-graph.spec.ts:228`                   | `IdentityAccessFacadeModule` export `SuccessorEligibility` (`identity-access-facade.module.ts:19`)                    |
| A4-04 | Phần lớn gate cấu trúc chỉ quét `moduleFiles`                                            | `architecture-structure.spec.ts:155`         | `recovery-cli.ts:32`, `installation-cli.ts:41` so `error.name`                                                        |
| A4-05 | Không gate HTTP mapping trong service/controller; không gate vị trí DTO                  | —                                            | `catalog.service.ts:3,53,69` (`ApiException` trong service); mapping inline `auth.controller.ts`                      |
| —     | Không phát hiện chu trình module/import (hiện không có `forwardRef`, không có chu trình) | `module-graph.spec.ts:73`, `:85`, `:104`     | không có ca sống — ghi nhận                                                                                           |
| —     | `test/**` không bị gate                                                                  | —                                            | chủ đích: test DB cần ruột (Recommendation: chỉ hướng dẫn)                                                            |

## 8. Đối chiếu namespace và finding mới

### 8.1 Tóm tắt đối chiếu

Bảng từng mã ở [reconciliation.md](reconciliation.md). Tóm tắt:

- `R-0`, `R-1`, `R-2`: đã giải quyết (R-0 bằng gate local; R-1/R-2 bằng H3a/H3b). `R-00` → `R-16`: lịch sử, không mở lại.
- `F-01` → `F-35`: **đã giải quyết** 15 (F-01–F-08, F-16, F-17, F-22, F-27–F-29, F-35); **giữ OK** 2 (F-32, F-33, đã tái
  kiểm); **còn hợp lệ** 15 (F-09 một phần, F-10 một phần, F-11–F-15, F-19–F-21, F-23–F-26, F-34 một phần); **chưa có lát trước
  H4.0** 3 (F-18, F-30, F-31) — nay có AUTH.1, INF.1, AUTH.2.
- `M-01` → `M-57`: D/E-1 đã giải quyết qua H3a/H3b; B đã giải quyết bằng tài liệu; C (23) còn hợp lệ làm đầu vào G3–G10;
  E-2 (M-48) giữ `blocked`. Các dòng được đánh dấu "refactor phải giữ": M-01–M-03, M-14, M-18/M-19, M-22–M-28, M-36,
  M-46.
- H1 → H3 `verified` local; H4, H5, H6, H8 mở rộng thành lát nhỏ (mục 9); H7 `blocked`. G0 → G2 `merged-dev`; G3 → G10
  chưa bắt đầu.

### 8.2 Finding mới của H4.0

| Mã    | Loại       | Finding (Fact)                                                                                                                                                                          | Lát               |
| ----- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| A4-01 | gate       | Root module là điểm mù của gate cross-capability (mục 7)                                                                                                                                | GATE.1            |
| A4-02 | gate       | Liên module "mọi tệp root là public" (mục 7)                                                                                                                                            | GATE.1            |
| A4-03 | gate       | Export gate chỉ thấy `*Repo`/`PasswordHasher`; `SuccessorEligibility` lọt                                                                                                               | GATE.1, H5.7      |
| A4-04 | gate       | Gate cấu trúc không quét root/infrastructure; hai CLI so `error.name`                                                                                                                   | GATE.1, ROOT.1    |
| A4-05 | gate       | Không gate HTTP mapping trong service/controller                                                                                                                                        | GATE.1            |
| A4-06 | ops        | Hạ tầng không dùng trong đồ thị API/worker và yêu cầu production tương ứng                                                                                                              | H6.4 (E2)         |
| A4-07 | config     | `env-schema.ts` hết khoảng trống cap; `resolveDatabaseUrl` + URL mặc định chép ở `prisma.config.ts:4-16` trái chú thích `env-schema.ts:409-410`                                         | H6.3              |
| A4-08 | data       | Hai nơi ghi `cost_centers`, `departments`, `job_titles` (`organization.repo.ts:67`, `:71`, `:76` và repo riêng)                                                                         | H4.3b, H4.5, H4.6 |
| A4-09 | dead code  | `department.repo.ts:166` `readCostCenterForDepartment` không có caller                                                                                                                  | H4.1              |
| A4-10 | boundary   | data-import không có facade; export `EmployeeImportService` (`data-import.module.ts:18`), onboarding dùng trực tiếp                                                                     | H8.3              |
| A4-11 | hành vi    | Lý do lỗi dòng import chép validator organization (`employee-import-rows.ts:183-193` vs `employee-row.validator.ts:36-37`)                                                              | BEH.1             |
| A4-12 | trùng lặp  | 7 bản `Page<T>`/`*Page`                                                                                                                                                                 | theo lát module   |
| A4-13 | trùng lặp  | Hằng số 422 cục bộ ở 6 controller                                                                                                                                                       | theo lát module   |
| A4-14 | tài liệu   | Catalog vẫn được gọi là mẫu (`CONTRIBUTING.md:9`, `README.md:4`, `:10`, `ARCHITECTURE.md`, ADR-0003); `ARCHITECTURE.md:193` ghi `isInvitationLinkUsable` (code là `isActionLinkUsable`) | DOC.1             |
| A4-15 | module     | Catalog không mount và không theo rule hiện hành                                                                                                                                        | E1                |
| A4-16 | kích thước | Service > 6 dependency (mục 4)                                                                                                                                                          | H5.5, H4.6        |
| A4-17 | test       | 50 import test → `src/modules` (9 subfolder, 9 repo): churn đường dẫn khi move                                                                                                          | mỗi lát move      |
| A4-18 | core       | `core/time/` rỗng; `core/email.ts` mang mã FR/US                                                                                                                                        | DOC.1 (tùy chọn)  |
| A4-19 | layout     | `identity-access/dto/` chứa DTO một capability (approval-role, me, super-admin-transfer)                                                                                                | H5.1              |
| A4-20 | boundary   | `password-reset.service.ts` ghi `recovery_tickets` qua `RecoveryRepo` (cạnh ẩn auth → recovery)                                                                                         | H5.6 (E6)         |
| A4-21 | layout     | Root identity-access 10/12 tệp — giới hạn cách tách recovery                                                                                                                            | H5.7 (E7)         |
| A4-22 | ghi nhận   | Port `AuthenticatedPrincipal` mang từ vựng identity                                                                                                                                     | giữ               |
| A4-23 | ghi nhận   | `OrganizationAlreadyExistsError` không có consumer ngoài module (trái đề xuất 4.4 cũ là đưa lên public) — giữ nội bộ khi H4.4                                                           | H4.4              |

## 9. Backlog lát nhỏ đề xuất

Đây là **đề xuất**, chưa phải spec/plan. Mỗi lát sẽ thành một item riêng theo mẫu workspace trước khi code. Quy tắc chung
cho mọi lát refactor: không đổi route, method, `operationId`, status, mã lỗi, message, schema DB hay hành vi;
`openapi.json` giống hệt từng byte (trừ AUTH.2); legacy ledger chỉ co lại; chạy `pnpm check`, `pnpm test:e2e`,
`pnpm test:integration` trên PostgreSQL riêng. Các lát refactor là **enabler** — không có User Story/AC; kích thước ước
theo số capability chạm.

### 9.0 Điều kiện trước — CP-0 checkpoint

Commit/PR chuỗi H1 → H3c, chạy remote CI, ghi lại U-01 (teardown `42501`) có tái hiện hay không. **Mọi lát move/rename
chờ CP-0**: 70 đường dẫn chưa commit (68 của chuỗi H1 → H3c + 2 tệp báo cáo H4.0); 68 đường dẫn của chuỗi H1 → H3c
chồng lên các tệp mà H4/H5 sẽ di chuyển (`app-users.controller.ts`,
`account-status.service.ts`, `department.service.ts`, `organization.http-errors.ts`, nhiều suite integration).

### 9.1 Gate và tài liệu (B)

- **GATE.1 — mở rộng gate kiến trúc (test-only).** Files: ba `src/*.spec.ts`, `docs/rules/module-structure.md`.
  Findings: A4-01 → A4-05, phần còn lại F-10/F-14. Thay đổi: cross-capability xét cả root; liên module chỉ cho
  `<module>.module.ts`, `*-http.module.ts`, `*-facade.module.ts`, `<module>.service.ts`, `*.types.ts`, `*.errors.ts` (+ tệp
  entry CLI được liệt kê); export gate theo danh sách facade thay vì đuôi tên; quét root/infrastructure cho `error.name`;
  `ApiException`/`HttpStatus` trong `*.service.ts`. Ca sống A4-01 → A4-05 vào ledger có lát chủ (**E9 = A**, Owner đã
  duyệt — mục 12). Phụ thuộc: CP-0.
  Dừng khi: gate xanh, mỗi rule fail trên một ví dụ tổng hợp, không entry mới ngoài danh sách đã duyệt. Rủi ro merge: thấp
  (chỉ spec). Kích thước: 0 capability, 3 tệp test.
- **DOC.1 — đính chính tài liệu.** Files: `CONTRIBUTING.md`, root `README.md`, `ARCHITECTURE.md` (catalog là mẫu, `:193`,
  quy tắc tệp root như `email-dispatch.loop.ts`), ADR-0003 (ghi chú sửa đổi), `test/README.md` (ưu tiên HTTP/facade), bằng
  chứng F-26 (7 bản `Page`). Findings: A4-14, A4-17, A4-18, F-09 phần còn lại. Catalog theo **E1 = A**: thôi gọi là
  mẫu, ghi là module chưa mount chờ thiết kế G3. Dừng
  khi: `pnpm rules:check`, `pnpm rules:format` sạch. Kích thước: tài liệu.

### 9.2 organization — mỗi capability một lát (không gộp với identity-access)

Trước H4.1: thêm spec đặc tả `toOrganizationApiException` (mỗi lớp lỗi → status + mã) làm characterization.

| Lát   | Capability / files                                                                                                                                                                                                                                                                            | Findings / ledger gỡ                                                                            | Phụ thuộc    | Dừng khi                                                                    | Kích thước                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------- | ------------------------- |
| H4.1  | Sửa nhỏ ở root: F-12 dùng facade `lockEmployeeForShare`/`getEmployee` + `instanceof` (`department.service.ts:481-490`, giảm 7 → 6 dependency); `toProjectWire` ra mapper (F-11); gỡ export `ImportLookupRepo` (F-13); xóa `readCostCenterForDepartment` (A4-09)                               | F-11, F-12, F-13 (một phần), A4-09; `errorMatchedByName`, `controllerImports`, 1 private export | CP-0, GATE.1 | đúng các entry ledger trên biến mất                                         | 3 capability, chỉnh nhỏ   |
| H4.2  | `project/`: controller, service, `project.repo.ts` (từ `department.repo.ts:404-498`), dto, errors (`:90-102`), mapper; department gọi `ProjectService`                                                                                                                                        | F-23 (một phần)                                                                                 | H4.1         | không tệp project ở root; department không đọc bảng project                 | 1                         |
| H4.3a | `normalizeDisplayName` vào `src/core` (Q6); cập nhật 4 consumer organization + 2 consumer data-import — structure-only, so khớp T-12 giữ byte                                                                                                                                                 | F-23 (một phần), A4-02 (2 ca)                                                                   | H4.1         | không còn import `organization/job-title-name.ts` từ module khác            | 1 + điểm chạm data-import |
| H4.3b | `job-title/`: controller, service, `job-title.repo.ts` (gồm `createJobTitle` từ `organization.repo.ts:76`), dto, errors                                                                                                                                                                       | F-23, A4-08 (job_titles)                                                                        | H4.3a        | một writer cho `job_titles`                                                 | 1                         |
| H4.4  | `employee/`: controller, `employee-manual.service`, `employee.repo.ts` (`organization.repo.ts:172-398`), `import-lookup.repo`, policy validator; lỗi public `EmployeeCodeTaken`/`EmployeeEmailTaken` về root `organization.errors.ts`; khóa job-title/department qua method service công khai | F-23, A4-23                                                                                     | H4.3b        | employee không đọc persistence capability khác                              | 1                         |
| H4.5  | `cost-center/`: controller, service, repo + `createCostCenter` (không dùng lại `insert` dịch lỗi trùng — giữ hành vi cài đặt), policy tên, dto, errors                                                                                                                                        | F-23, A4-08 (cost_centers)                                                                      | H4.4         | một writer cho `cost_centers`                                               | 1                         |
| H4.6  | `department/`: controller + mapper, tách `department-head.service.ts`/`department-head.repo.ts`, `createDepartment` về repo department                                                                                                                                                        | F-23, A4-08 (departments), A4-16; oversized `department.*`                                      | H4.5         | `department.service.ts`, `department.repo.ts` dưới 400 dòng, ra khỏi ledger | 1 (+ head)                |
| H4.7  | Root: `organization.repo.ts` chỉ Organization; `organization.types.ts` chỉ type public; `Page<T>` dùng bản core; quyết export repo (**E4**)                                                                                                                                                   | F-13 phần còn lại, F-26 (một phần); `rootFiles`, `rootControllers`                              | H4.6, E4     | root ≤ 12 tệp, ≤ 2 controller; ledger organization rỗng (trừ E4)            | root                      |

Hành vi phải giữ xuyên suốt: M-01 → M-03 (ba khóa `details` của `DEPARTMENT.IN_USE`), M-22/M-23/M-25 → M-27 (trigger
trưởng phòng ⊆ thành viên, `assignHead`/`vacateHead`), thứ tự khóa trong ARCHITECTURE. Bài test cần tồn tại xanh:
`departments-http`, `cost-centers-http`, `job-titles-http`, `employee-manual-http`, `organization`,
`organization-concurrency`, `onboarding-http`, `employee-imports-http`. Rủi ro merge: cao nếu chạy trước CP-0 (H3a chạm
`organization.http-errors.ts`, `department.service.ts`).

### 9.3 identity-access — mỗi lát một mục tiêu

| Lát  | Phạm vi                                                                                                                                                                                                                       | Findings / ledger gỡ                                                | Phụ thuộc    | Dừng khi                                                   | Kích thước        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------ | ---------------------------------------------------------- | ----------------- |
| H5.0 | Characterization: spec đặc tả `toAccountApiException`, mapper approval-role, mapping inline của auth (mỗi lỗi → status + mã, gồm 401 chủ đích)                                                                                | (tiền đề)                                                           | CP-0         | mọi nhánh mapper có ca                                     | test only         |
| H5.1 | Chuyển DTO một capability: `approval-role.dto` → `approval-roles/dto/`, `me.dto` → `access/dto/`, `super-admin-transfer.dto` → `accounts/dto/` (structure-only)                                                               | A4-19                                                               | H5.0         | `dto/` root chỉ còn DTO hai capability dùng                | 3, chỉ import     |
| H5.2 | Tách `errors/identity-access.errors.ts` thành `errors/auth.errors.ts` + `errors/account.errors.ts`; `SuperAdminTransferRefusedError` vào account errors; `translateAccountWriteError` cạnh `account.repo`                     | F-24 (một phần); `errorClassesOutsideErrorFiles` (1 entry)          | H5.1         | không lớp lỗi trong service                                | 2                 |
| H5.3 | Mapper HTTP: `approval-role.http-errors.ts`; `auth.http-errors.ts` (từ `auth.controller.ts:45-50`, `:86-133` + nhánh auth của `account.http-errors.ts`); `me.controller` không import mapper accounts                         | F-24; `httpMappingInErrorFiles` (approval-role), 2 cross-capability | H5.2         | mã lỗi/status giống H5.0                                   | 3                 |
| H5.4 | `account-policy.ts` → `policies/account-policy.ts` (thật sự dùng chung bởi 5 nơi); tùy chọn `resolveEffectiveRoles` về `access/`                                                                                              | 6 cross-capability                                                  | H5.3         | không capability import `accounts/account-policy.ts`       | 1, structure-only |
| H5.5 | Bề mặt capability, mỗi mục một PR: (a) `SessionRepo` sau method service auth; (b) `ApprovalRoleRepo` sau `ApprovalRoleService`; (c) dịch vụ credential cho lời mời; (d) `AccountRepo` cho auth/access/approval-roles (**E5**) | F-25, A4-16; còn lại cross-capability                               | H5.4         | `crossCapabilityImports` rỗng, hết chu trình auth↔accounts | 1 mỗi PR          |
| H5.6 | F-19: recovery thu hồi phiên qua `SessionRepo` (wiring theo **E6**); quyết cạnh A4-20                                                                                                                                         | F-19, A4-20                                                         | H5.5(a), E6  | `recovery.repo.ts` không ghi `auth_sessions`               | 1                 |
| H5.7 | Tách `recovery.service.ts` (vị trí theo **E7**) và `account.repo.ts` theo aggregate (**E5**); dọn export facade (`SuccessorEligibility`, repo)                                                                                | oversized `recovery.service.ts`, `account.repo.ts`; private exports | H5.6, E5, E7 | hai tệp dưới 400 dòng, ra khỏi ledger                      | 2                 |

Hành vi phải giữ: M-14 (môi trường ticket), M-18/M-19 (body `{ reason }`, `after.reason`), M-24 (`approval-role.service`
`set()`), M-28 (successor eligibility), H3c (chặn quên mật khẩu khi có ticket chờ, trong cùng giao dịch sau khóa AppUser).
Test phải xanh: `super-admin-recovery`, `recovery-cli`, `auth-http`, `auth-concurrency`, `password-self-service-*`,
`account-management-http`, `account-concurrency`, `approval-roles-http`, `super-admin-transfer-http`, `module-graph`.
Rủi ro merge: rất cao trước CP-0 (H1/H2/H3b/H3c chạm `auth.controller.ts`, `app-users.controller.ts`,
`account-status.service.ts`, `password-reset.service.ts`, `recovery.repo.ts`).

### 9.4 Vận hành, cài đặt, cấu hình (H6) và database role (H7)

- **H6.1 `ops:inspect`** (F-20) — read-only, mask PII, phân biệt chưa cài/đã cài/lỗi DB. Vị trí theo **E8 = A**: folder
  capability trong `installation/`, có spec, safety guard và test riêng.
- **H6.2 `dev:seed`** (F-21) — chỉ local/test, idempotent, chặn production/host xa, không mật khẩu mặc định trong Git.
  Vị trí theo **E8 = A** như H6.1; không tạo module `operations`.
- **H6.3 installation + config** — lỗi installation vào `installation.errors.ts`; advisory lock vào repo (repo không bảng
  vẫn qua gate); tách `env-schema.ts` (database/production guards); `prisma.config.ts` dùng chung `resolveDatabaseUrl`
  (A4-07); gộp helper CLI và `instanceof` (ROOT.1); secret mặc định theo **E3 = C** — chỉ `test` còn giá trị mặc định
  công khai, development khai secret riêng qua `.env`, production giữ validation hiện hành; cập nhật `.env.example`,
  runbook và test, không log giá trị secret. Gỡ ledger installation (2 lỗi + raw SQL) và `env-schema.ts`.
- **H6.4 hạ tầng chưa dùng** (A4-06) theo **E2 = A**: gỡ `ObjectStorageModule` và `QueueInfrastructureModule` khỏi đồ thị
  API/worker, production không còn bắt buộc Redis/object storage; giữ source module, mount lại và bật validation bắt
  buộc khi Story G7/G9 dùng thật.
- **H7** (F-15) — giữ `blocked` tới khi có môi trường PostgreSQL cô lập.

### 9.5 data-import (H8) — khi lát import được mở

- **H8.1** mapper HTTP ra `employee-import.http-errors.ts` (gỡ ledger `httpMappingInErrorFiles`).
- **H8.2** tách `employee-import.service.ts`: đọc file thuần, so sánh judgement về rows module, gom ba khối audit; dưới 400
  dòng (gỡ ledger oversized). Phụ thuộc H4.3a.
- **H8.3** facade `data-import.service.ts` (`latestEmployeeImport`) cho onboarding (A4-10); `Page<T>` dùng bản core.

### 9.6 Lát nhỏ độc lập (sau CP-0, không chặn nhau)

- **AUTH.1 (F-18):** chấp nhận scheme `Bearer` không phân biệt hoa/thường (RFC 7235); thêm test ghim cả hai dạng. Thay
  đổi hành vi nhỏ ở guard — cần review security; OpenAPI không đổi.
- **AUTH.2 (F-31):** `newPassword` của đổi mật khẩu từ 256 lên 1024 như ý định ghi ở `auth.dto.ts:51` (policy trả
  `TOO_LONG` thay vì 422 `VALIDATION_ERROR`). **Đổi contract** (`maxLength` trong OpenAPI) — FE regenerate. Login/
  current password 256 giữ.
- **INF.1 (F-30):** `RetireOnTimeoutClient` kiểm config trước `super()`; ghim minor `pg`/`pg-pool` hoặc thêm test nâng
  cấp. Không đổi hành vi.
- **BEH.1 (A4-11):** dùng chung validator lý do dòng giữa form nhập tay và import preview — **thay đổi hành vi** có thể
  đổi mã lỗi theo cột; item nghiệp vụ riêng sau H4.4 và H8.2.

### 9.7 Thứ tự đề xuất

```text
CP-0 ─► GATE.1 (E9) ─► DOC.1 (E1)
   │
   ├─► H4.1 ─► H4.2 ─► H4.3a ─► H4.3b ─► H4.4 ─► H4.5 ─► H4.6 ─► H4.7 (E4)
   │                     └──────────────► H8.2 ─► H8.1/H8.3 (khi mở lát import)
   ├─► H5.0 ─► H5.1 ─► H5.2 ─► H5.3 ─► H5.4 ─► H5.5(a,b,c,d E5) ─► H5.6 (E6) ─► H5.7 (E5, E7)
   ├─► H6.3 (E3) ─► H6.1/H6.2 (E8) ; H6.4 (E2) ; H7 khi có môi trường
   └─► AUTH.1, AUTH.2, INF.1 (bất kỳ lúc nào sau CP-0, không chạy song song với lát khác đổi openapi.json)
G3 chỉ mở sau GATE.1 + H4.1 → H4.6 (cost-center/department/job-title là đầu vào G3) và E1.
```

H4 và H5 chạm module khác nhau, có thể song song nếu do hai người và không cùng chạm suite test chung
(`test/support/*`). Không chạy hai lát cùng đổi `openapi.json` song song.

## 10. Giữ nguyên — tránh refactor thừa

- Folder `auth/`, `accounts/`, `approval-roles/`, `access/` của identity-access; hai controller của accounts;
  `approval-role.repo`, `token.service`, `password.policy`, `login-throttle`.
- Nest submodule `OrganizationHttpModule`, `IdentityAccessFacadeModule`, `RecoveryModule`, `AuditHttpModule`.
- `organization.http-errors.ts` (một mapper cho lớp HTTP của bounded context); `import-lookup.repo.ts` chỉ đọc;
  `employee-row.validator`, `cost-center-name`, `organization-audit`.
- Toàn bộ `audit`, `notifications` (gồm `email-dispatch.loop.ts` ở root theo ADR-0012), `onboarding`,
  `operating-parameters` (kể cả `parameter-definitions.ts`), và trong data-import: `employee-import-rows.ts`, `csv.ts`,
  `employee-import.repo.ts`.
- Tệp entry CLI của installation (`hidden-prompt.ts`, `installation.arguments.ts`, `installation.input.ts`) và
  `recovery.*` ở root (Q6).
- `core` hiện tại; infrastructure `http`, `health`, `mail`, `observability`; `hashRefreshToken` (dư nhỏ của F-35).
- Không thêm gate `test → src`.

## 11. Rủi ro working tree chưa commit

- 70 đường dẫn chưa commit: 68 chứa sáu lát `verified` local, 2 là báo cáo H4.0. Move/rename trên cây này làm diff không
  review được và dễ mất thay đổi khi rebase. **CP-0 là điều kiện cứng** cho mọi lát có move/rename (H4.x, H5.x, H6.3, H8.x).
- GATE.1 và DOC.1 không move tệp product nhưng chạm `src/*.spec.ts`/tài liệu đang dirty — vẫn nên sau CP-0 để ledger bám
  đúng revision được review.
- Mỗi lát move phải cập nhật import trong `test/**` (A4-17); typecheck bắt được, nhưng diff test sẽ lớn — tách commit
  "đổi đường dẫn import" khỏi commit logic khi có thể.
- U-01 (teardown `42501`) cần ghi ở CP-0: nếu tái hiện, mở task test-infrastructure riêng, không trộn vào H4.

## 12. Chưa kiểm chứng, giới hạn và gói quyết định Owner/dev

Chưa kiểm chứng trong lượt này: hành vi Prisma adapter có chồng query thật hay không (F-30); `docker-compose.prod.yml`
không đọc lại (F-15 giữ theo audit 18/10); không chạy integration/e2e; không kiểm FE/Mobile.

### Gói quyết định (E1 → E9)

Bảng dưới là gói câu hỏi gốc của H4.0, giữ làm lịch sử: mỗi câu có phương án loại trừ nhau và khuyến nghị của audit.
Lựa chọn chính thức của Owner nằm ở [Quyết định Owner 09B](#quyết-định-owner-09b) ngay sau bảng; ở E2 và E3 Owner chọn
khác khuyến nghị.

| #   | Câu hỏi                                                                                                                            | Phương án                                                                                                                                                                                                                                                 | Khuyến nghị và tác động                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Module `catalog` không mount và lệch rule: giữ, xóa hay để G3 thay?                                                                | (a) giữ tới thiết kế G3, sửa tài liệu ngay để thôi gọi là mẫu · (b) xóa module + test ngay, giữ bảng · (c) xóa cả bảng bằng migration                                                                                                                     | **(a)**. DOC.1 sửa câu "mẫu"; G3 spec quyết thay thế. (b)/(c) đụng migration/test sớm khi G3 chưa thiết kế                                      |
| E2  | `ObjectStorageModule`/`QueueInfrastructureModule` không có consumer nhưng nạp vào API/worker; production bắt buộc Redis và storage | (a) gỡ khỏi đồ thị và nới validation production tới khi có Story dùng · (b) giữ có chủ đích, ghi là hạ tầng dành sẵn kèm Story sẽ dùng · (c) giữ module, chỉ nới validation production                                                                    | **(b)**: G7/G9 sắp cần storage (tệp sao kê/hóa đơn) và queue; ghi rõ trong ARCHITECTURE ở DOC.1, xem lại ở H6.4. (a) đổi yêu cầu deploy hai lần |
| E3  | Ngoài production, secret dùng giá trị mặc định công khai (F-34)                                                                    | (a) giữ cho `development`/`test`, ghi rõ mọi môi trường dùng chung chạy `NODE_ENV=production`, H6.3 thêm cảnh báo log khi dùng mặc định · (b) bỏ mặc định cả ở development (dev copy `.env.example`) · (c) chỉ giữ cho `test`                             | **(a)**: ít ma sát dev, có `.env.example`; rủi ro còn lại là cấu hình staging sai — cảnh báo log giúp phát hiện                                 |
| E4  | `OrganizationModule` export `CostCenterRepo`, `DepartmentRepo`, `OrganizationRepo` cho `OrganizationHttpModule`                    | (a) giữ export trong ledger tới khi G3 cần đổi đồ thị · (b) chuyển service capability vào `OrganizationModule`, chỉ export facade (service vào đồ thị worker/CLI) · (c) Nest submodule theo capability                                                    | **(a)**: rule (điều kiện 1–4) không có bằng chứng cho (c); (b) kéo service HTTP vào graph không cần. H4.7 giữ đúng ba entry                     |
| E5  | `AccountRepo` (4 aggregate) được auth/access/approval-roles/recovery/facade dùng trực tiếp                                         | (a) tách repo theo aggregate (credential, action token, role grant), chấp nhận ledger private export tăng tạm thời có Owner ký · (b) facade service của accounts bọc method repo · (c) ADR công nhận `AccountRepo` là persistence dùng chung trong module | **(a)**, làm ở H5.7 sau H5.5(a–c). (b) tạo nhiều method chuyển tiếp; (c) hợp thức hóa coupling                                                  |
| E6  | F-19: recovery dùng `SessionRepo` thế nào khi gate yêu cầu `SessionRepo` chỉ khai trong đồ thị API                                 | (a) khai `SessionRepo` thêm trong `RecoveryModule`, mở rộng gate provider trùng sang đồ thị CLI · (b) chuyển `SessionRepo` vào facade module và export (thêm entry ledger) · (c) giữ F-19 là nợ có ghi nhận                                               | **(a)**. Đồng thời giữ cạnh `password-reset.service` → `RecoveryRepo` (A4-20) như một cạnh có tài liệu cho tới khi có `RecoveryTicketService`   |
| E7  | Tách `recovery.service.ts` khi root identity-access chỉ còn 2 chỗ (ngưỡng 12)                                                      | (a) tối đa 2 tệp root mới · (b) thư mục `recovery/` cho phần cài đặt riêng, giữ tệp entry CLI ở root (đúng tinh thần Q6) · (c) chỉ tách method private, giữ dưới cap 608                                                                                  | **(b)**: Q6 đã cho phép nhóm phần cài đặt riêng theo capability; tránh chạm trần root                                                           |
| E8  | Vị trí `ops:inspect`/`dev:seed`                                                                                                    | (a) folder capability trong `installation/` (`inspect/`, `seed/`) · (b) module `operations` mới · (c) tệp root installation khi còn ≤ 12                                                                                                                  | **(a)**; có thể giao dev chốt trong spec H6.1/H6.2                                                                                              |
| E9  | GATE.1 sẽ biến các ca sống (A4-01 → A4-05) thành entry ledger mới                                                                  | (a) duyệt seed ledger với danh sách ca sống ở mục 7, mỗi entry gắn lát gỡ · (b) sửa vi phạm trước rồi mới thêm gate · (c) không thêm gate, dựa vào review                                                                                                 | **(a)**: chặn vi phạm mới ngay (onboarding bước 2–5 sẽ nối module G3); rule hiện yêu cầu Owner review khi thêm entry                            |

### Quyết định Owner 09B

Prompt 09B, 19/10/2026: Owner đã chọn cả chín câu E1 → E9. Đây là **quyết định kỹ thuật của workstream BE**, không phải
`QĐ-*` nghiệp vụ trong repo Docs, và **chưa** cho phép triển khai code: mỗi lát vẫn cần spec/plan riêng sau CP-0. Chữ
A/B/C ứng với phương án (a)/(b)/(c) của bảng trên. Lát sở hữu là nơi quyết định được hiện thực; 09B không sửa code, test,
ledger hay rules.

| #   | Chọn  | Quyết định                                                                                                                                                                                                                                                                                     | Lý do                                                                                                                                                                        | Lát sở hữu               |
| --- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| E1  | **A** | Giữ `catalog` tới thiết kế G3. Tài liệu thôi gọi module chưa mount này là mẫu kiến trúc. G3 quyết giữ, thay hay loại module; chưa xóa bảng, migration hay code                                                                                                                                 | Xóa module/bảng lúc này đụng migration và test khi G3 chưa thiết kế                                                                                                          | DOC.1; thiết kế G3       |
| E2  | **A** | Gỡ `ObjectStorageModule` và `QueueInfrastructureModule` khỏi đồ thị API/worker; production không còn bắt buộc Redis/object storage cho capability chưa dùng. Giữ source module để tái dùng; mount lại và bật validation bắt buộc khi Story G7/G9 dùng thật                                     | Khác khuyến nghị (b): Owner không muốn tạo dependency triển khai, kết nối hay failure surface khi chưa có consumer. Fact: Redis hiện chỉ do `QueueInfrastructureModule` dùng | H6.4                     |
| E3  | **C** | Chỉ `test` được dùng secret mặc định công khai. Development khai secret riêng qua `.env`; production giữ validation nghiêm hiện hành. Áp cho auth secret, throttle pepper, outbox payload key và key id nếu có tính bí mật; cập nhật `.env.example`, runbook và test; không log giá trị secret | Khác khuyến nghị (a): không để giá trị công khai lọt sang môi trường ngoài test. Không mở rộng thành thay đổi business contract                                              | H6.3                     |
| E4  | **A** | Tạm giữ đúng ba repo export của `OrganizationModule` (`CostCenterRepo`, `DepartmentRepo`, `OrganizationRepo`) trong legacy ledger — ngoại lệ có phạm vi cho `OrganizationHttpModule` dùng provider cùng bounded context; không thêm repo export mới                                            | Chưa có bằng chứng cần Nest submodule riêng; xem lại khi thiết kế G3 hoặc khi có bằng chứng đó                                                                               | H4.7; xem lại ở G3       |
| E5  | **A** | Tách `AccountRepo` theo aggregate. Chấp nhận ledger private export tăng tạm thời; mỗi entry có lát gỡ, Owner/dev review, không thành ngoại lệ vĩnh viễn. Làm sau H5.5(a–c) — phần (d) của H5.5 thực hiện trong H5.7                                                                            | Một repo bốn aggregate là nguồn coupling chính; (b) tạo nhiều method chuyển tiếp, (c) hợp thức hóa coupling                                                                  | H5.7                     |
| E6  | **A** | Khai `SessionRepo` thêm trong `RecoveryModule`; recovery revoke session trong transaction qua repo sở hữu session. Không biến `SessionRepo` thành export của facade. Gate provider trùng mở rộng đúng cho đồ thị CLI/recovery, không cho trùng ở nơi khác                                      | Sửa F-19 mà không mở thêm bề mặt public                                                                                                                                      | H5.6; gate ở GATE.1/H5.6 |
| E7  | **B** | Tạo folder capability `recovery/` cho phần cài đặt riêng; giữ các entrypoint CLI/recovery ở root theo rule hiện hành; không dồn thêm tệp triển khai vào root identity-access                                                                                                                   | Khớp Q6; tránh chạm trần 12 tệp root (A4-21)                                                                                                                                 | H5.7                     |
| E8  | **A** | `ops:inspect` và `dev:seed` nằm trong folder capability thuộc `installation/`; mỗi command có spec, safety guard và test riêng; không tạo module `operations` tổng quát                                                                                                                        | Hai command dùng chung đồ thị cài đặt; chưa có bằng chứng cần bounded context mới                                                                                            | H6.1, H6.2               |
| E9  | **A** | Duyệt seed legacy ledger cho đúng các vi phạm sống A4-01 → A4-05 trước khi siết gate. Mỗi entry ghi tệp/cạnh cụ thể, lý do tạm thời và lát loại bỏ; không tăng cap, không wildcard, không entry ngoài danh sách audit nếu chưa có Owner/dev review mới                                         | Chặn vi phạm mới ngay mà không phải sửa hết vi phạm cũ trước; khớp quy tắc ledger chỉ co lại (`module-structure.md`)                                                         | GATE.1                   |

Trạng thái gói: **đã chốt** — H4.0 đóng ở 09B. Bước kế tiếp vẫn là CP-0; GATE.1, DOC.1, H4.x, H5.x, H6.x, H8.x và G3 →
G10 chưa bắt đầu và mỗi lát cần prompt riêng.

## 13. Lệnh đã chạy, kết quả và tệp thay đổi

| Lệnh / kiểm tra                                                                                                              | Kết quả                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git rev-parse HEAD`, `git status --porcelain=v1 -uall`, `git diff --stat`                                                   | `bd05007` `dev`; đầu lượt 68 đường dẫn dirty (52 tracked + 16 untracked); cuối lượt 70 (52 + 18, thêm 2 tệp báo cáo)                                                                    |
| `sha256sum` mọi tệp dirty (đầu và cuối lượt), `openapi.json`, tệp prompt                                                     | 68/68 tệp dirty cũ giống hệt (chuỗi H1 → H3c giữ nguyên); chỉ thêm 2 tệp báo cáo; `openapi.json` `14fd428b…` không đổi; prompt 00–09 không đổi, chỉ tracker đổi; repo Docs như đầu lượt |
| Script đọc-chỉ `inventory.py` / `edges.py` (scratchpad, không ghi vào repo)                                                  | 246 tệp TS, 22 554 dòng; đồ thị import; 0 cạnh vào subfolder/repo module khác; danh sách raw SQL, tệp lớn                                                                               |
| `pnpm exec jest --runInBand src/architecture-structure.spec.ts src/architecture-boundaries.spec.ts src/module-graph.spec.ts` | exit 0; 3 suite, 35 test pass                                                                                                                                                           |
| Đọc kiểm lại finding của subagent (`grep`/`sed` trên tệp nguồn)                                                              | Mọi finding dùng ở mục 3–9 đã đối chiếu tệp:dòng; không phát hiện sai lệch                                                                                                              |
| `prettier --check` hai tệp báo cáo; script kiểm link/anchor tương đối của báo cáo (báo cáo nằm ngoài phạm vi `rules:check`)  | Prettier sạch; 0 link/anchor hỏng; 0 dòng có khoảng trắng cuối                                                                                                                          |
| `pnpm rules:check`, `pnpm rules:format`, `git diff --check` (BE); `git diff --no-index --check` cho tracker                  | `BE: 87 files, 704 links, 0 errors`; format sạch; không lỗi khoảng trắng                                                                                                                |

Tệp thay đổi trong lượt này: `docs/reviews/be-full-src-architecture-audit-2026-10-19/README.md`, `reconciliation.md` (mới)
trong repo BE; `Prompts/BE-audit-and-architecture-2026-10-18/BE-WORKSTREAM-TRACKER.md`. Không tệp nào trong `src/**`,
`test/**`, `prisma/**`, config, package hay `openapi.json` bị sửa.

### Prompt 09B — ghi quyết định E1 → E9 và đính chính metadata (19/10/2026)

Không chạy lại audit. Chỉ đổi hai tệp báo cáo này và tracker; ghi quyết định ở mục 12 và đính chính số dirty path (mục 1,
9.0, 11, 13).

| Lệnh / kiểm tra                                                                                  | Kết quả                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `git branch --show-current`, `git rev-parse --short HEAD`, `git status --porcelain=v1 -uall`     | `dev` / `bd05007`; đầu và cuối lượt đều 70 đường dẫn = 52 tracked + 18 untracked; không phát sinh tệp mới sau H4.0              |
| `sha256sum` 70 tệp dirty và tệp prompt, đầu và cuối lượt                                         | 68 tệp cũ giống hệt, kể cả `openapi.json` (`14fd428b…`); chỉ hai tệp báo cáo này và tracker đổi; prompt 00–09B không đổi        |
| `prettier --write`/`--check` hai tệp báo cáo; script kiểm link/anchor cho hai báo cáo và tracker | Prettier sạch; 13 link tương đối, 0 hỏng (script tự kiểm: bắt được anchor hỏng tổng hợp); 0 dòng có khoảng trắng cuối           |
| `pnpm rules:check`, `pnpm rules:format`, `git diff --check` (BE)                                 | exit 0; `BE: 87 files, 704 links, 0 errors`; format sạch; không lỗi khoảng trắng (chỉ cảnh báo LF→CRLF có sẵn của tệp dirty cũ) |
| `grep` "chờ Owner"/số 63/68/70 trên ba artifact                                                  | không còn nhãn chờ cho gói E; 63 chỉ còn trong câu đính chính lịch sử; 68 chỉ dùng cho chuỗi H1 → H3c, 70 là tổng cuối          |

Repo Docs: `9416fe0`, có 2 đường dẫn dirty từ trước lượt này (sơ đồ ngữ cảnh `.drawio` và tệp `.bkp`, sửa 18/10 16:04);
09B không chạm.
