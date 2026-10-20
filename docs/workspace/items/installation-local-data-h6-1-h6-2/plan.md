# Plan: Installation & Local Data — `ops:inspect` chỉ đọc và `dev:seed` chỉ local (H6.1 + H6.2)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `188c9e0`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (audit nền tảng Q5, audit H4.0 mục 9.4 + E8 = A;
  Prompt 23).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 20/10/2026, cây làm việc chưa commit trên `188c9e0`, gồm mục 8).
  Revision: commit `bf9db0d` trên `dev` = `origin/dev` (Owner commit/push trực tiếp, không PR); remote CI chưa có
  bằng chứng. Docs `CI-CD/deployment.md` của lát này chưa commit ở repo Docs. PR: chưa có.

## Before coding

Preflight 20/10/2026: `dev` = `origin/dev` = `188c9e0`, ahead/behind `0/0`, cây sạch; `188c9e0` là commit Prompt 22 của
Owner, chứa đủ 57 path của gói (19 thêm, 38 sửa). Docs `main` `9416fe0`: hai path dirty không liên quan được giữ nguyên,
`CI-CD/deployment.md` sạch. `.env` bị Git bỏ qua; bốn tên E3 vắng nên được thêm (giá trị sinh trong bộ nhớ, không in,
không sao chép); `.env` vẫn untracked.

Inventory (đọc source; hai subagent chỉ đọc):

- Cài đặt tạo: tổ chức, một cost center UNIT, một phòng, một chức vụ, hai nhân viên, tài khoản Super Admin đã kích hoạt
  (`BOOTSTRAP_ASSERTED`) + grant; bảy loại audit `INSTALLATION.*` (nhân viên hai lần) + `ROLE.GRANTED`. Mã do người chạy
  nhập; không có mã cố định.
- Đọc sẵn có: `OrganizationService.getOrganization`, `getOnboardingFacts`, `lookupForEmployeeImport`;
  `IdentityAccessService.findUsableItAdminEmployeeIds`; `RoleGrantService.findSuperAdminHolderId`. Chưa có: đếm tài
  khoản theo trạng thái/vai, người giữ vai duyệt ngoài đồ thị API, đếm audit theo action, bảng `_prisma_migrations`.
- Ghi sẵn có: `createUnitCostCenter`, `createDepartment`, `createJobTitle`, `createEmployeeWithPlacement`;
  `createAppUser`, `createCredential`, `grantRole` (contract của facade). Chưa có use case tạo tài khoản đã kích hoạt
  không phải Super Admin ngoài HTTP ⟹ `LocalDemoAccountService` hẹp, chỉ trong đồ thị seed.
- Vai suy ra cần actor USER qua HTTP ⟹ ngoài fixture (spec). Không cần migration, Super Admin thứ hai, grant vai suy
  ra, bypass production hay ghi chéo module.

## Tasks

### Phase 0 — rule, characterization trên baseline

### Task 1: rule lệnh vận hành và characterization

- Files: `docs/rules/operational-commands.md` (mới), `docs/rules/README.md`, `AGENTS.md`, `CONTRIBUTING.md`,
  `rules-check.config.json`; `src/infrastructure/config/database-url-parsing.spec.ts`,
  `test/integration/installation-bootstrap-facts.integration-spec.ts` (mới).
- Depends on: none
- Acceptance: rule đủ tám quy tắc và ví dụ đúng/sai/lách sai/dọn sai; characterization bootstrap (bản ghi, audit, chạy
  lại), đọc tài khoản không lộ hash, ràng buộc vai/Finance, parse URL của `node:url` cho mọi dạng host.
- Verify: chạy trên `188c9e0` chưa sửa product code → xanh (Checkpoint 0); test symbol mới đỏ vì chưa có.

### Checkpoint 0

Trên `188c9e0` (chỉ thêm test, product code chưa sửa): unit + gate tập trung 43 suite/630 test; characterization URL
15/15 (phát hiện: `postgresql:` không phải scheme đặc biệt nên host **không** bị hạ chữ thường, `LOCALHOST` giữ nguyên;
lỗi `Invalid URL` là `TypeError` của realm Node); integration bootstrap facts 8/8 (bảy action `INSTALLATION.*` + một
`ROLE.GRANTED`, `bootstrap_completed_at`, không head/IT Admin/vai duyệt, mọi thư mục migration đã áp, đọc tài khoản
không có trường credential, chạy lại `AlreadyInstalled`, một Finance mỗi tổ chức, email đăng nhập duy nhất). ESLint
sạch. Mỗi symbol mới (`postgresSessionOptions`, `countByAction`, `IdentityAccessInspectionService`, facts, guard,
`LocalDemoAccountService`, `classifyDatabaseUrl`) đỏ vì chưa có trước khi viết.

### Phase A — H6.1 `ops:inspect`

### Task 2: phiên chỉ đọc, hợp đồng đọc và lệnh inspect

- Files: `infrastructure/database/read-only-session.module.ts`, `prisma.service.ts`; `audit.service.ts`, `audit.repo.ts`;
  `identity-access.service.ts`, `identity-access-inspection-facade.module.ts`, repo/directory của accounts và
  approval-roles; `installation/inspect/*`; `src/inspect-cli.ts`; `package.json`; gate.
- Depends on: Task 1
- Acceptance: theo spec `ops:inspect`.
- Verify: unit/process/integration inspect, đồ thị, đột biến (ghi, email đầy đủ, đòi secret, mount vào API).

### Checkpoint A

`tsc`, ESLint sạch; unit + gate tập trung 57 suite/628; process + integration (inspect, hai CLI cũ đã chuyển sang
`test/support/cli-process.ts`, installation, bootstrap facts) 39/39. Inspect: `--help`/tham số lạ; DB chưa migrate và
chưa cài → 2 `NOT_INSTALLED`; đã cài → 0 `INSTALLED`, hai lần chạy cùng byte, `--json` cùng trạng thái/số liệu, chỉ
`b***@a***.vn`; Super Admin bị khóa + migration lỗi → 2 `INCOMPLETE`; DB không tới được → 1, chỉ tên lỗi; production chỉ
cần `DATABASE_URL`; fingerprint mọi bảng bằng nhau trước/sau; ghi thử qua đồ thị inspect bị PostgreSQL từ chối
(`read-only transaction`). Đột biến, mỗi cái khôi phục cùng SHA-256: A-M1 ghi trong repo inspect → integration đỏ; A-M2
bỏ phiên chỉ đọc → `module-graph` đỏ; A-M3 in email đầy đủ → integration đỏ; A-M4 nạp `ConfigurationModule` (đòi secret)
→ `module-graph` đỏ; A-M5 mount `InspectionModule` vào API → `module-graph` đỏ; A-M6 `import` side-effect từ API và
A-M7 `require` từ worker → **A-M6 lần đầu sống sót** (walker import chỉ bắt `from`/`import(`), sửa walker + thêm ca tự
kiểm, chạy lại: cả hai đỏ.

### Phase B — H6.2 `dev:seed`

### Task 3: chốt local, facade seed và lệnh seed

- Files: `infrastructure/config/database-host.ts`; `identity-access-local-seed-facade.module.ts`,
  `identity-access.service.ts`; `installation/dev-seed/*`; `src/dev-seed-cli.ts`; `package.json`;
  `test/support/cli-process.ts`; gate.
- Depends on: Task 2
- Acceptance: theo spec `dev:seed`.
- Verify: guard matrix, idempotency, rollback, audit, vai, mật khẩu một lần, process, integration; đột biến (bỏ chốt,
  mật khẩu mặc định, grant vai suy ra, đặt lại tài khoản, mount vào API/worker).

### Checkpoint B

Unit + gate tập trung 70 suite/889; integration seed/inspect/installation 7 suite/42. Seed trong tiến trình: trước cài
đặt → `NOT_INSTALLED`, fingerprint không đổi; lỗi muộn (audit `ROLE.GRANTED` của `EMPLOYEE`) → rollback, fingerprint
không đổi; lần đầu `CREATED`: ba tài khoản `ACTIVE`/`ACTIVATED`/`BOOTSTRAP_ASSERTED` đúng một vai trực tiếp, mật khẩu
in ra khớp hash Argon2 (`verify`), audit `LOCAL_SEED` một `correlationId` (CC 1, phòng 1, chức vụ 1, nhân viên 3, tài
khoản 3, `ROLE.GRANTED` 3), không mật khẩu/hash trong audit; Super Admin giữ nguyên (một grant, cùng hash); 0 head period,
0 approval holder; lần hai `ALREADY_PRESENT`, 9 mục, không mật khẩu, fingerprint không đổi; sửa tay → `CONFLICT`, không
sửa, fingerprint không đổi. Seed qua tiến trình: `--help`, thiếu cờ, `--force` → 1; production, host `postgres`, host xa
→ 3 và 0 dòng mới, không lặp URL; development + loopback: lần 1 → 0 với ba mật khẩu 24 ký tự khác nhau, lần 2 → 2 không
mật khẩu, số dòng không đổi. Đột biến, mỗi cái khôi phục cùng SHA-256: bỏ chốt NODE_ENV, bỏ chốt host, bỏ chốt cờ, kiểm
host bằng `includes('localhost')`, mật khẩu mặc định, grant `MANAGER`, coi tài khoản khác fixture là chưa có (đặt lại),
mount seed vào API, import seed từ worker → đều đỏ đúng test/gate.

### Phase C — tài liệu vận hành

### Task 4: tài liệu BE, Docs `CI-CD/deployment.md`, metadata và gate cuối

- Files: `README.md`, `ARCHITECTURE.md`, `docs/guides/containers.md`, `test/README.md`, `docs/roadmap.md`,
  `docs/workspace/items/README.md`, plan Prompt 22 (pin `188c9e0`), spec/plan này, tracker ngoài repo;
  Docs `CI-CD/deployment.md`.
- Depends on: Task 3
- Acceptance: tài liệu khớp lệnh và E2 = A; drift Redis của Docs khép; full gate; kiểm kê tài nguyên 0.
- Verify: mục dưới.

### Phase D — sửa sau review (Prompt 23 mục 8)

### Task 5: P23-RV-01, P23-RV-02, P23-DOC-01

- Files: `organization.service.ts`, `organization.types.ts`, repo và service capability `cost-center`, `department`,
  `job-title`, `employee`; `accounts/app-user.repo.ts`, `account-directory.service.ts`, `identity-access.service.ts`;
  `installation/dev-seed/dev-seed-plan.ts`, `dev-seed.service.ts`, `dev-seed.types.ts`; `installation/inspect/inspection.service.ts`;
  spec mới `dev-seed-plan.spec.ts`, `inspection.service.spec.ts`, `organization-onboarding-facts.spec.ts`,
  `onboarding-facts-transaction.repo.spec.ts`, `app-user-transaction.repo.spec.ts`; `dev-seed.service.spec.ts`,
  `dev-seed.integration-spec.ts`; Docs `CI-CD/deployment.md`.
- Depends on: Task 4
- Acceptance: theo spec mục `dev:seed` (so từng mục fixture theo khóa) và mục `ops:inspect` (một transaction); Docs
  không còn biến cookie hiện hành.
- Verify: đỏ trước/xanh sau, đột biến từng phép so và từng chỗ truyền `DbTx`, full gate chạy lại.

### Checkpoint D

- **P23-RV-02** (test trước): `inspection.service.spec.ts` ghi client mỗi đọc nhận và transaction còn mở hay không →
  **đỏ trên code cũ** (`getOnboardingFacts`, `usableItAdminEmployeeIds` nhận `undefined`, gọi sau khi transaction đóng).
  Sửa: `getOnboardingFacts(tx?)` (với `tx`: đọc tuần tự trong transaction, gồm múi giờ; không `tx`: checklist như cũ),
  `countActive`/`activeWithoutHead`/`activeWithItAdmin`/`countFreeUnits`/`findUsableItAdminEmployeeIds` nhận `tx` tùy
  chọn tới repo; `IdentityAccessInspectionService.usableItAdminEmployeeIds(ids, tx)`. Xanh: 2/2, facts 2/2, repo 2/2.
  Đột biến (khôi phục cùng SHA-256): facts ngoài transaction, IT Admin không `tx`, một đọc facts không `tx`, đọc múi
  giờ không `tx`, repo IT Admin / đếm phòng / cost center tự do dùng client riêng → đều đỏ. Lần chạy đột biến repo đầu
  tiên **không hợp lệ** (shell thiếu `TEST_DATABASE_ADMIN_URL`, 8 lỗi setup); thay bằng spec repo đơn vị, chạy lại: đỏ.
- **P23-RV-01** (test trước): `dev-seed-plan.spec.ts` 14 ca literal (vắng, đúng, mỗi loại khác của cost center/phòng/
  chức vụ, phục hồi một phần) → **đỏ** với plan cũ (14/14). Sửa: `OrganizationService.readLocalSeedFixture` (finder
  theo mã trong `cost-center.repo`/`department.repo`, `findJobTitleByNormalizedName` nhận `tx`), plan so mọi trường,
  service tạo phòng trên `DEMO-CC` có sẵn. Xanh: plan 14/14; service thêm hai ca (phục hồi một phần chỉ tạo phòng trên
  `cc-1`; phòng gắn cost center khác bị từ chối, không ghi). Integration (PostgreSQL thật): phòng đổi tên →
  `CONFLICT`/`DEPARTMENT_NAME_DIFFERS`, phòng gắn `OTHER-CC` → `DEPARTMENT_COST_CENTER_DIFFERS`, cả hai fingerprint
  không đổi, không mật khẩu; khôi phục → `ALREADY_PRESENT`. Đột biến: bỏ từng phép so (tên/kind/trạng thái/đang dùng của
  cost center; liên kết/tên/trạng thái phòng; tên/trạng thái chức vụ) và quên id cost center có sẵn → đều đỏ, khôi phục
  cùng SHA-256.
- **P23-DOC-01**: bỏ `AUTH_COOKIE_SECURE=true` khỏi ví dụ `.env`; ghi chú ngoài khối copy: refresh token đi trong body,
  API không đặt/đọc cookie, xóa dòng cũ nếu còn. Quét lại tệp: không còn khẳng định cookie hiện hành.

## Verification and handoff

Môi trường: Windows 11, Git Bash, Node v24.0.1, pnpm 11.1.3, Docker; PostgreSQL 17-alpine container riêng
`slm-p23-test-db` (`127.0.0.1:55440`, role `ci_integration` theo test guide, tên ghi vào ledger dọn dẹp trước khi tạo); cây
làm việc chưa commit trên `188c9e0`.

| Lệnh / kiểm tra AC                   | Revision / môi trường                                          | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                    | Giới hạn / việc còn lại                                                                                           |
| ------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Checkpoint 0 → B                     | `188c9e0` (0) rồi cây làm việc (A, B)                          | xanh; số liệu và đột biến ở từng checkpoint                                                                                                                                                                                                                                                                                                          | —                                                                                                                 |
| `pnpm check`                         | cây cuối                                                       | exit 0: rules 111 tệp/985 link, `rules:test` 38/38, Prettier, Prisma, ESLint, `tsc`, unit 93 suite/1260, `test:scripts` 19/19, discovery (unit 93, e2e 14, integration 50 tệp), build                                                                                                                                                                | lần đầu đỏ ở Prettier `package.json` (dòng script mới chèn sai format), sửa rồi chạy lại toàn bộ                  |
| `pnpm test:e2e`                      | cây cuối                                                       | 14 suite/274                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                 |
| `pnpm test:integration`              | cây cuối, PostgreSQL riêng                                     | 50 suite/658, 304 s; 0 DB `slm_*_test`, 0 backend sót, không `42501`; container đã xóa                                                                                                                                                                                                                                                               | —                                                                                                                 |
| `pnpm openapi:export`                | cây cuối                                                       | SHA-256 `14fd428bf3ee…` = `HEAD`, `cmp` byte-identical, inventory 61 dòng giống hệt, `openapi.json` không dirty                                                                                                                                                                                                                                      | —                                                                                                                 |
| Compose                              | cây cuối, không deploy                                         | mặc định `postgres`; hai profile `minio postgres redis`; production `postgres api caddy worker`, `config -q` exit 0; `src/infrastructure/queue`, `object-storage`, Compose, workflow không đổi so với `HEAD`; queue/storage vẫn không mount (gate H6.4)                                                                                              | —                                                                                                                 |
| Cấu hình development sau khi thêm E3 | `.env` local (chỉ tên)                                         | `ConfigurationModule` với `NODE_ENV=development`: ok, bốn tên E3 `set`; không in giá trị                                                                                                                                                                                                                                                             | —                                                                                                                 |
| Đột biến rule doc                    | `rules:check`                                                  | bỏ link rule ở `AGENTS.md`, `CONTRIBUTING.md`, chỉ mục rule → mỗi cái 1 lỗi cạnh bắt buộc, khôi phục cùng SHA-256                                                                                                                                                                                                                                    | —                                                                                                                 |
| Quét zero-hit                        | cây cuối                                                       | 0 mật khẩu mặc định/yếu trong src, scripts, docs, `.env.example`, `package.json`; 0 grant vai suy ra; raw SQL của `installation` chỉ ở ba repo; 0 delegate bảng module khác; inspect không in `loginEmail` thô; API/worker không import mã lệnh; Docs `CI-CD/deployment.md`: mọi chữ Redis là "không hiện hành", dọn orphan hoặc checklist tương lai | —                                                                                                                 |
| Post-review: `pnpm check`            | cây sau mục 8                                                  | exit 0: unit 98 suite/1282, rules 111 tệp/985 link, discovery unit 98/e2e 14/integration 50                                                                                                                                                                                                                                                          | —                                                                                                                 |
| Post-review: `pnpm test:e2e`         | cây sau mục 8                                                  | 14 suite/274                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                 |
| Post-review: `pnpm test:integration` | PostgreSQL riêng `slm-p23b-test-db` (ghi ledger trước khi tạo) | 50 suite/660, 398 s; 0 DB `slm_*_test`, 0 backend sót, không `42501`; container đã xóa                                                                                                                                                                                                                                                               | —                                                                                                                 |
| Post-review: OpenAPI, Compose, diff  | cây sau mục 8                                                  | `openapi.json` = `HEAD` (`14fd428bf3ee…`), inventory giống hệt, không dirty; Compose mặc định/profile/production hợp lệ; queue/storage/Compose/workflow không đổi; `git diff --check` sạch                                                                                                                                                           | —                                                                                                                 |
| Post-review: Docs                    | `main` `9416fe0`                                               | chỉ `CI-CD/deployment.md` sửa; anchor, fence, `diff --check`, `check-rules --workspace` sạch; hai tệp Draw.io có sẵn cùng hash trước/sau                                                                                                                                                                                                             | —                                                                                                                 |
| Kiểm kê tài nguyên                   | máy local                                                      | trước khi dọn: chỉ `slm-p23-test-db` (đã ghi ledger); 0 image, 0 DB tạm, 0 tiến trình CLI, 0 thư mục `slm-*-cli-*`; sau khi dọn: 0                                                                                                                                                                                                                   | dịch vụ khác của Owner không bị chạm                                                                              |
| Docs repo                            | `main` `9416fe0`                                               | chỉ `CI-CD/deployment.md` sửa; anchor nội bộ mới hợp lệ, fence chẵn, `git diff --check` sạch; `check-rules --workspace` không lỗi phía Docs; hai path dirty có sẵn cùng hash trước/sau                                                                                                                                                               | Docs không có Prettier/CI riêng; dòng `AUTH_COOKIE_SECURE` cũ trong ví dụ `.env` của tài liệu đó ngoài phạm vi E2 |

- [x] Hành vi trong scope có bằng chứng.
- [x] Spec/plan/test design phản ánh implementation cuối.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
