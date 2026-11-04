# Plan: qd93-remove-hr-basis-org-writes

- [Spec](spec.md); revision đầu vào: Docs `69e8a3d`, BE `1a77ffe8`.
- Bổ sung sau pin: D-S17…D-S26 (Docs chưa commit) — Owner 01/11/2026.
- Phụ trách: chưa phân công (sở hữu cả thiết kế, implementation, test và cập nhật plan). Thiết kế ban đầu bởi: AI theo
  giao việc Owner (gói `QĐ-93`, 01/11/2026).
- Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

- Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/api-contract.md` (mục Errors, Handoff, `OPENAPI-EXAMPLE.1`),
  `docs/rules/module-structure.md`, `test/README.md`; đối chiếu spec với BE `1a77ffe8`.
- Quyền chạy test (Owner 01/11/2026, `D-S26`): được tự chạy `pnpm typecheck`/`pnpm lint`/`pnpm arch:check`/`pnpm rules:check`,
  unit test (`pnpm test -- <file>`) và integration test **theo file đã sửa** (`pnpm test:integration -- <file>`), và
  `pnpm check`; **phải hỏi Owner trước** khi chạy toàn bộ `pnpm test:integration`, `pnpm test:e2e` hoặc
  `pnpm test:integration:timing`. Plan này coi `pnpm test:http -- <file>` và `pnpm test:gates` (không CSDL) như unit test.
- OD-1 = **A — strict** (request còn gửi `hrBasis` ⟹ 422) đã được Owner duyệt 01/11/2026; plan dưới đây theo A, không có
  nhánh giữ `hrBasis` deprecated. Phase 1 và Phase 2 là checkpoint của **một** PR, **một** release (FE đổi 10 body cùng lúc).
- Thứ tự merge: lát này merge **đầu tiên** ở W1 (rebase lên `dev` trước khi merge). Giữ
  `hr-basis.dto.ts`/`hr-basis.types.ts`/`test/support/hr-basis.ts` cho `project/` — `qd93-remove-department-projects` phase 1
  (W2) xóa chúng. `qd93-remove-in-app-super-admin-transfer` (W1) sau đó xóa `super-admin-transfer-http.integration-spec.ts`
  mà lát này sửa; `qd93-direct-manager-spending-approver-roles` (W2) rebase lên lát này (cùng file trưởng phòng/harness).
- Không migration. Nếu phát sinh: timestamp thật khi tạo thư mục, đổi lại cho đứng sau migration mới nhất trên `dev` trước
  merge (`DB-15`); KHÔNG sửa `scripts/verify/merged-migrations.txt` trên nhánh hạng mục (thư mục migration mới xếp sau cùng
  nên gate `migration-order` vẫn xanh); Owner thêm vào danh sách khi phát hành.
- Liệt kê lại nơi dùng: `rg -n "hrBasis|HrBasis|HR_BASIS|hr-basis" src test` (ở `1a77ffe8`: 26 file `src`, 45 file test/
  support — danh sách ở Task 1.3 và 2.3).
- Database test riêng theo `test/README.md` (PostgreSQL 17, `TEST_DATABASE_ADMIN_URL`). Không chạy trên database dùng chung.

## Tasks

### Phase 1 — Phòng ban, trưởng phòng, kế nhiệm, IT Admin phụ trách, `API-DOC-F05`

### Task 1.1: Test đỏ cho thao tác phòng ban không căn cứ

- Files: `test/http/organization/departments.http-spec.ts` (bỏ `HR_BASIS_BODY`; thêm ca "body kèm `hrBasis` ⟹ 422
  `VALIDATION_ERROR`" cho 7 route; ca tên 201 ký tự/chức năng 1 001 ký tự ⟹ 422 `VALIDATION_ERROR`; tên 200 chữ có dấu gửi
  dạng NFD qua schema, 201 chữ NFD ⟹ 422),
  `test/integration/organization/department-profile-http.integration-spec.ts` (ca dòng 252 "thiếu căn cứ ⟹ 422" đổi
  thành "không căn cứ ⟹ ghi, audit không `hrBasis`"; tên NFD lưu dạng NFC), `test/integration/organization/department-head-http.integration-spec.ts`
  (ca không căn cứ cho assign/vacate/designate/clear; ca 409 `DEPARTMENT.INACTIVE` cho assign và designate; vế báo
  `US-03-06` AC-22: assign hiệu lực hôm nay ⟹ dòng `organization_change_announcements` `HEAD_PERIOD_START`, vacate ⟹
  `HEAD_PERIOD_END`, bước nhu cầu đang mở chuyển người mới; successor-clear khi không có kế nhiệm ⟹ không thêm dòng
  `audit_events`), `test/integration/organization/department-contract-http.integration-spec.ts` (ca `PATCH` phòng đã ngừng ⟹
  409; `PATCH {}` và deactivate phòng đã ngừng ⟹ không thêm dòng `audit_events`).
- Depends on: none.
- Acceptance: test mới đỏ trên code cũ vì cũ đòi `hrBasis` (422) hoặc vì OpenAPI chưa khai 409; không sửa assertion cũ của
  hành vi khác.
- Verify: `pnpm test:http -- test/http/organization/departments.http-spec.ts` và
  `pnpm test:integration -- test/integration/organization/department-head-http.integration-spec.ts test/integration/organization/department-profile-http.integration-spec.ts test/integration/organization/department-contract-http.integration-spec.ts`
  → đỏ đúng các ca mới (ca vế báo và không-đổi-gì có thể xanh ngay — chúng ghim hành vi hiện có).

### Task 1.2: Bỏ `hrBasis` khỏi DTO/service/audit phòng ban; căn chỉnh giới hạn và 409

- Files: `src/modules/organization/department-management/department.dto.ts` (bỏ khóa `hrBasis` ở 7 schema; hai body rỗng
  `z.strictObject({})`; `name`/`function` dùng `.normalize('NFC').trim().max(DEPARTMENT_NAME_MAX_LENGTH)` /
  `.normalize('NFC').trim().max(DEPARTMENT_FUNCTION_MAX_LENGTH)` — spec, `API-DOC-F05`),
  `src/modules/organization/department/department.types.ts` (export hai hằng 200/1000),
  `department.service.ts` (bỏ `hrBasis` khỏi input/audit; bỏ kiểm độ dài chức năng; dùng hằng chung),
  `department-head.service.ts` (bỏ `hrBasis` ở 4 method và 4 audit), `departments.controller.ts`,
  `department-heads.controller.ts` (không truyền `hrBasis`; khai 409 `DEPARTMENT_INACTIVE` cho `departmentUpdate`,
  `departmentHeadAssign`, `departmentSuccessorDesignate`; mô tả bỏ "HR basis"), `department.http-errors.ts` (thêm
  `DEPARTMENT_INACTIVE` vào `DEPARTMENT_ERROR_EXAMPLES`; `SUPER_ADMIN_ONLY.description` bỏ "on an HR basis"),
  `department.service.spec.ts`, `department-head.service.spec.ts`, `department-head-announcements.spec.ts` (bỏ `hrBasis` khỏi
  input và kỳ vọng audit), `src/modules/organization/department/department.policy.ts` (chú thích).
- Depends on: Task 1.1.
- Acceptance: test Task 1.1 xanh; audit `DEPARTMENT.*` mới không có khóa `hrBasis`; `PATCH /departments/{id}` đổi
  `itAdminEmployeeId` không căn cứ thành công (`US-01-11` AC-7).
- Verify: `pnpm test -- src/modules/organization/department-management` →
  xanh; `pnpm test:http -- test/http/organization/departments.http-spec.ts` → xanh.

### Task 1.3: Harness và test phòng ban gọi API không căn cứ

- Files: `test/support/department-harness.ts` (bỏ `writes()` gắn `HR_BASIS` cho `/departments`; giữ cho `/projects` nếu lát
  dự án chưa xóa), `test/support/builders/organization.builder.ts:48`, các spec gửi `hrBasis` tới route phòng ban:
  `test/integration/organization/{cost-centers-http,department-contract-http,department-head-http,department-profile-http,organization-concurrency,organization-identity-read-contracts,unit-only-cost-attribution}.integration-spec.ts`,
  `test/integration/licensing/{department-tools-http,license-key-http,provisioning-queue-http}.integration-spec.ts`,
  `test/integration/requests/{cost-center-direction-http,department-transfer-record,step-reassignment}.integration-spec.ts`,
  `test/integration/catalog/document-http.integration-spec.ts`,
  `test/integration/operating-parameters/operating-parameters-http.integration-spec.ts`,
  `test/integration/onboarding/onboarding-http.integration-spec.ts`,
  `test/integration/identity-access/{super-admin-transfer-http.integration-spec.ts,organization-unavailable.timing-spec.ts}`,
  `test/integration/data-import/employee-import-preview-http.integration-spec.ts` (chỉ lời gọi `head-assignments` dòng 362;
  phần import ở Task 2.3),
  `test/support/{handover-harness,provisioning-harness,reassignment-harness,request-harness}.ts`,
  `test/e2e/auth-session.e2e-spec.ts` (chỉ phần gọi route phòng ban; phần nhân viên ở Task 2.3).
  `test/integration/organization/department-manager-and-projects-http.integration-spec.ts:342` gửi tới `/projects` — giữ.
- Depends on: Task 1.2.
- Acceptance: không spec nào còn gửi `hrBasis` tới route phòng ban; số `it`/`test` mỗi file không giảm (trừ ca "thiếu căn
  cứ ⟹ 422" đã đổi thành ca thành công).
- Verify: theo file (`D-S26`) —
  `pnpm test:integration -- test/integration/organization/cost-centers-http.integration-spec.ts test/integration/organization/department-contract-http.integration-spec.ts test/integration/organization/department-head-http.integration-spec.ts test/integration/organization/department-profile-http.integration-spec.ts test/integration/organization/organization-concurrency.integration-spec.ts test/integration/organization/organization-identity-read-contracts.integration-spec.ts test/integration/organization/unit-only-cost-attribution.integration-spec.ts`
  → xanh;
  `pnpm test:integration -- test/integration/licensing/department-tools-http.integration-spec.ts test/integration/licensing/license-key-http.integration-spec.ts test/integration/licensing/provisioning-queue-http.integration-spec.ts test/integration/requests/cost-center-direction-http.integration-spec.ts test/integration/requests/department-transfer-record.integration-spec.ts test/integration/requests/step-reassignment.integration-spec.ts`
  → xanh;
  `pnpm test:integration -- test/integration/catalog/document-http.integration-spec.ts test/integration/operating-parameters/operating-parameters-http.integration-spec.ts test/integration/onboarding/onboarding-http.integration-spec.ts test/integration/identity-access/super-admin-transfer-http.integration-spec.ts test/integration/data-import/employee-import-preview-http.integration-spec.ts`
  → xanh. `organization-unavailable.timing-spec.ts` chỉ chạy bằng `pnpm test:integration:timing` ⟹ **hỏi Owner**; e2e ⟹
  **hỏi Owner** (`D-S26`).

### Task 1.4: Manifest OpenAPI và export cho Phase 1

- Files: `test/support/openapi-example-route-codes-organization.ts` (`'409': ['DEPARTMENT.INACTIVE']` cho
  `departmentUpdate`, `departmentHeadAssign`, `departmentSuccessorDesignate`), `openapi.json` (sinh bằng lệnh),
  `src/cli/demo-dataset/steps/organization.steps.ts` (bỏ `hrBasis` ở **3** lời gọi phòng ban: `POST /departments` dòng 54,
  `PATCH /departments/{id}` dòng 161, `POST /departments/{id}/head-assignments` dòng 182), `docs/generated/routes.md`
  (nếu mô tả đổi — sinh bằng lệnh).
- Depends on: Task 1.2, Task 1.3.
- Acceptance: `openapi.json` chỉ đổi ở 7 operation phòng ban (bỏ `hrBasis`, `maxLength`, 409); inventory và example gate
  xanh.
- Verify: `pnpm openapi:export` → diff đúng phạm vi; `pnpm test:http -- test/http/platform` → xanh;
  `pnpm arch:routes && pnpm arch:docs:check` → xanh.

### Checkpoint Phase 1

`pnpm check` xanh; `pnpm test:http -- test/http/organization/departments.http-spec.ts test/http/platform`; ba lệnh
integration theo file của Task 1.3 (gồm Task 1.1) xanh. Tự review diff theo `US-03-06` AC-1, AC-22, `US-01-11` AC-7,
`US-02-04` AC-4 và `API-DOC-F05`. Checkpoint nội bộ — không deploy riêng.

### Phase 2 — Hồ sơ nhân viên, import, kiểu dùng chung

### Task 2.1: Test đỏ cho nhập tay, sửa hồ sơ, xác nhận import không căn cứ

- Files: `test/http/organization/employees.http-spec.ts` (bỏ ca "HR basis thiếu phần" dòng 70-74, 117; thêm ca body kèm
  `hrBasis` ⟹ 422), `test/http/data-import/employee-imports.http-spec.ts` (dòng 155-159 tương tự),
  `test/integration/organization/employee-manual-http.integration-spec.ts` (ca dòng 357-358 đổi thành "không căn cứ ⟹ 201,
  audit không `hrBasis`"), `test/integration/notifications/employee-maintenance-http.integration-spec.ts` (dòng 240-243 →
  "không căn cứ ⟹ 200; `E1` và trưởng phòng nhận `EMPLOYEE_PROFILE_UPDATED`"),
  `test/integration/data-import/employee-import-wire-http.integration-spec.ts` (dòng 338-341 → xác nhận không căn cứ ghi
  được; audit `EMPLOYEE_IMPORT.CONFIRMED`/`EMPLOYEE.CREATED` không `hrBasis`).
- Depends on: Checkpoint Phase 1.
- Acceptance: ca mới đỏ trên code cũ.
- Verify: `pnpm test:http -- test/http/organization/employees.http-spec.ts test/http/data-import` → đỏ đúng ca mới.

### Task 2.2: Bỏ `hrBasis` khỏi employee và employee-import

- Files: `src/modules/organization/employee/employee.dto.ts` (bỏ khóa ở create/update; chú thích),
  `employee-manual.service.ts` (input, audit), `employee-maintenance.service.ts` (input, audit),
  `employees.controller.ts`, `employee-maintenance.controller.ts` (không truyền; mô tả), `employee.errors.ts`,
  `employee.policy.ts` (chú thích "HR basis"), `employee-maintenance.service.spec.ts`,
  `src/modules/data-import/employee-import/employee-import.dto.ts` (`confirmImportBodySchema` bỏ `hrBasis`),
  `employee-imports.controller.ts` (mô tả), `confirmation/employee-import-confirmation.service.ts` (input, `writeValidRows`,
  audit), `confirmation/employee-import-confirmation.service.spec.ts`, `employee-import-audit.mapper.ts` (bỏ tham số và khóa
  `hrBasis` ở `importConfirmedEvent`, `importEmployeeCreatedEvent`), `employee-import.errors.ts`,
  `employee-import.policy.ts` (chú thích), `src/modules/organization/public/organization.types.ts:48` (chú thích).
- Depends on: Task 2.1.
- Acceptance: test Task 2.1 xanh; audit mới không có `hrBasis`; thông báo `EMPLOYEE_PROFILE_*` không đổi.
- Verify: `pnpm test -- src/modules/organization/employee src/modules/data-import/employee-import` → xanh;
  `pnpm test:http -- test/http/organization test/http/data-import` → xanh.

### Task 2.3: Harness, demo dataset và test nhân viên/import không căn cứ

- Files: `test/support/{employee-import-http-harness,employee-import-service-harness}.ts`,
  `test/support/department-harness.ts:157` (`enter()` vẫn gửi `hrBasis: HR_BASIS` tới `POST /employees` — bỏ khóa; Task 1.3 chỉ
  bỏ phần `/departments` của `writes()`), `test/support/provisioning-harness.ts:169` (`member()` truyền `hrBasis` vào
  `enterEmployee` — bỏ khóa),
  `test/integration/data-import/{employee-import-confirm-http,employee-import-preview-http,employee-import-seats-http}.integration-spec.ts`,
  `test/integration/organization/{employee-manual-http,employee-kind-of-staff-assignment-end}.integration-spec.ts`,
  `test/integration/installation/demo-dataset.integration-spec.ts`, `test/e2e/auth-session.e2e-spec.ts`,
  `src/cli/demo-dataset/steps/organization.steps.ts` (**1** lời gọi `POST /employees`, dòng 83),
  `src/cli/demo-dataset/demo-step-kit.ts` (xóa `basis()` dòng 90-95 — sau Task 1.4 và lời gọi trên không còn ai dùng),
  `src/cli/demo-dataset/fixture/demo-fixture.types.ts:113` và `src/cli/demo-dataset/fixture/shared-demo-v1.ts:17-22` (xóa
  trường `basis` — spec, Ownership). `test/support/hr-basis.ts` giữ cho test `/projects` (lát dự án phase 1 xóa).
- Depends on: Task 2.2.
- Acceptance: `rg -n "hrBasis|HR_BASIS" test src` chỉ còn (a) `profile-correction.service.ts` và
  `test/integration/personnel/super-admin-event-service.integration-spec.ts` (CLI giữ căn cứ), (b) `project/**`,
  `test/support/hr-basis.ts` và test dự án (`department-manager-and-projects-http.integration-spec.ts:342`,
  `department-harness.ts` phần `/projects`); `rg -n "basis\(" src/cli/demo-dataset` rỗng.
- Verify: theo file (`D-S26`) —
  `pnpm test:integration -- test/integration/data-import/employee-import-confirm-http.integration-spec.ts test/integration/data-import/employee-import-preview-http.integration-spec.ts test/integration/data-import/employee-import-seats-http.integration-spec.ts test/integration/data-import/employee-import-wire-http.integration-spec.ts test/integration/organization/employee-manual-http.integration-spec.ts test/integration/organization/employee-kind-of-staff-assignment-end.integration-spec.ts test/integration/notifications/employee-maintenance-http.integration-spec.ts test/integration/installation/demo-dataset.integration-spec.ts`
  → xanh. `pnpm test:e2e -- test/e2e/auth-session.e2e-spec.ts` ⟹ **hỏi Owner** (`D-S26`).

### Task 2.4: Thu hẹp kiểu dùng chung, OpenAPI, tài liệu

- Files: `src/infrastructure/http/dto/hr-basis.dto.ts`, `src/modules/organization/public/hr-basis.types.ts` (giữ cho
  `project/`, chỉ sửa chú thích "dùng bởi `/projects`"; ghi ở bảng verification là việc xóa của
  `qd93-remove-department-projects` phase 1), `openapi.json`,
  `src/modules/organization/README.md`, `src/modules/data-import/README.md` (bỏ "kèm căn cứ HR" ở thao tác tổ chức/hồ sơ; ghi
  sự kiện nhân sự vẫn có căn cứ), `src/modules/onboarding/onboarding.controller.ts:70` (chú thích),
  `src/modules/installation/public/installation.api.ts:25` (chú thích, tùy chọn).
- Depends on: Task 2.3.
- Acceptance: `openapi.json` không còn schema căn cứ ở 10 operation (`projectCreate`, `projectUpdate` còn tới lát dự án
  phase 1); `pnpm arch:check` xanh (không import mồ côi).
- Verify: `pnpm openapi:export` → diff đúng phạm vi; `pnpm check` → xanh.

### Checkpoint Phase 2

Chạy (database riêng theo `test/README.md`):

- `pnpm check`; `pnpm test:http -- test/http/organization/departments.http-spec.ts test/http/organization/employees.http-spec.ts test/http/data-import/employee-imports.http-spec.ts test/http/platform`;
  vế căn cứ vẫn bắt buộc (không sửa, chạy lại theo file):
  `pnpm test:http -- test/http/personnel/department-transfers.http-spec.ts test/http/personnel/long-leaves.http-spec.ts test/http/personnel/offboarding-cases.http-spec.ts`.
- Integration theo file — mọi file đã sửa ở Phase 1 (ba lệnh Verify của Task 1.3) và Phase 2 (lệnh Verify của Task 2.3,
  cộng `test/integration/data-import/employee-import-wire-http.integration-spec.ts` của Task 2.1), cộng các file chứng minh
  căn cứ sự kiện nhân sự vẫn bắt buộc (không sửa):
  `pnpm test:integration -- test/integration/personnel/super-admin-event-service.integration-spec.ts test/integration/personnel/long-leave-start.integration-spec.ts test/integration/requests/offboarding-record.integration-spec.ts test/integration/requests/department-transfer-record.integration-spec.ts`.
- **Hỏi Owner** (`D-S26`) trước: toàn bộ `pnpm test:integration` (harness `department-harness.ts`, `request-harness.ts`,
  `handover-harness.ts`… dùng ở nhiều file ngoài danh sách), `pnpm test:integration:timing` (cho
  `test/integration/identity-access/organization-unavailable.timing-spec.ts`), `pnpm test:e2e -- test/e2e/auth-session.e2e-spec.ts`.
  Chưa được cho ⟹ ghi giới hạn ở bảng verification.

Tự review diff theo mọi AC trong bảng Primary; ghi thông báo FE (10 body, OD-1 = A strict). Bốn khóa `full` của lát
(`US-02-02` AC-10, `US-02-04` AC-4, `US-03-06` AC-1, `US-01-11` AC-7 — spec › _Primary Story/AC_): ghi vào bảng verification
tên ca chứng minh **phần còn lại** của từng AC (đã có, chạy lại theo file ở trên, không sửa khẳng định):
`department-profile-http.integration-spec.ts` (`creating a department (US-03-06 AC-1 → AC-3, QĐ-87d(1))`),
`onboarding-http.integration-spec.ts` (`shows a department with no Cost Center as a warning that stops nothing, and drops it once
Finance creates one for it`), `provisioning-queue-http.integration-spec.ts:290` (`US-01-11 AC-7: …`),
`employee-import-preview-http.integration-spec.ts` (`lists the columns that differ…`, `refuses a second row with the same work
email…`).

## Verification and handoff

Chạy từ gốc BE: `pnpm check`, `pnpm test:http` theo file, `pnpm openapi:export`, integration theo file như Checkpoint Phase
2 (database riêng theo `test/README.md`); toàn bộ `pnpm test:integration`, `pnpm test:integration:timing` và
`pnpm test:e2e -- test/e2e/auth-session.e2e-spec.ts` chỉ khi Owner cho (`D-S26`).

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| chưa chạy          | —                     | —                 | thiết kế `draft`        |

### Verification evidence (phase A, 02/11/2026)

Người kiểm: AI verifier độc lập (không phải người implement), nhánh `feat/qd93-remove-hr-basis-org-writes` HEAD `e5670a6a`
(parent `dev` `03da6c4f`), Windows, shell không export `TEST_DATABASE_*`. Chỉ ghi kết quả thực chạy ở lượt này; số liệu
integration theo file trong log của người implement **không** được chạy lại ở đây.

| Command                                                                    | Result (exit code + counts, real only)                                                                                                                                                                                                                                                                                     | Notes                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                               | exit 0; rules 411 files/3339 links/0 errors; rules:test 38/38; unit 327 suites/4453 tests pass; gates 16 suites/326 pass; depcruise 0 violations (1597 modules); arch:docs:check ok; test:scripts 272 pass/0 fail/2 skipped; discovery ok; build ok                                                                        | Chạy không có `TEST_DATABASE_*`/`BOOTSTRAP_` trong env.                                                                                                                                                                                                                                                  |
| `pnpm rules:check`                                                         | exit 0; `BE: 411 files, 3339 links, 0 errors`                                                                                                                                                                                                                                                                              | —                                                                                                                                                                                                                                                                                                        |
| `pnpm openapi:export` rồi `git status`                                     | exit 0; không diff (`openapi.json` khớp code)                                                                                                                                                                                                                                                                              | Không drift.                                                                                                                                                                                                                                                                                             |
| So `openapi.json` `dev...HEAD` (script JSON)                               | đổi đúng 10 operation (`employeeCreate`, `employeeUpdateOfficialFields`, `departmentCreate`, `departmentUpdate`, `departmentDeactivate`, `departmentHeadAssign`, `departmentHeadVacate`, `departmentSuccessorDesignate`, `departmentSuccessorClear`, `employeeImportConfirm`) + 10 schema body DTO; không path/schema khác | `hrBasis` vắng ở cả 10 body; còn ở `projectCreate`/`projectUpdate` (đúng phạm vi — lát dự án xóa). `name.maxLength` 200, `function.maxLength` 1000 (create/update). 409 `DEPARTMENT.INACTIVE` có ở `departmentUpdate`, `departmentHeadAssign`, `departmentSuccessorDesignate`.                           |
| `grep -rnE "hrBasis\|HR_BASIS" src test`                                   | còn: `project/**`, `hr-basis.dto.ts`, `profile-correction.service.ts:70` (CLI `QĐ-87c`(4)), `super-admin-event-service` spec, `test/support/hr-basis.ts`, harness `/projects`, và các ca "body cũ kèm `hrBasis` ⟹ 422"                                                                                                     | Khớp acceptance Task 2.3. `grep "basis" src/cli/demo-dataset` rỗng. `src/modules/personnel/**` không đổi trong diff (grounds giữ nguyên).                                                                                                                                                                |
| Quét diff: `eslint-disable`/`ts-ignore`/`.skip`/`.only`/migration          | 0 / 0 / 0 / 0 / không có migration, không sửa `merged-migrations.txt`                                                                                                                                                                                                                                                      | Số `it`/`test` theo file không giảm (4 file tăng: departments.http 16→18, department-head 21→26, department-profile 21→23, employee-import-wire 10→11).                                                                                                                                                  |
| `pnpm test:http -- <file>` (checkpoint Phase 1/2)                          | không chạy ở phase A                                                                                                                                                                                                                                                                                                       | Log người implement ghi 347 + 90 pass; chưa kiểm độc lập.                                                                                                                                                                                                                                                |
| `pnpm test:integration -- <file>` (Task 1.3, 2.3, personnel)               | không chạy ở phase A                                                                                                                                                                                                                                                                                                       | Log người implement ghi 129/90/100/101/88 pass; chưa kiểm độc lập.                                                                                                                                                                                                                                       |
| `pnpm test:integration` (toàn bộ)                                          | deferred to phase B — not run                                                                                                                                                                                                                                                                                              | `D-S26`.                                                                                                                                                                                                                                                                                                 |
| `pnpm test:integration:timing` (`organization-unavailable.timing-spec.ts`) | deferred to phase B — not run                                                                                                                                                                                                                                                                                              | File đã sửa (bỏ `hrBasis`), chưa chạy.                                                                                                                                                                                                                                                                   |
| `pnpm test:e2e -- test/e2e/auth-session.e2e-spec.ts`                       | deferred to phase B — not run                                                                                                                                                                                                                                                                                              | File đã sửa (bỏ `hrBasis`), chưa chạy.                                                                                                                                                                                                                                                                   |
| Task 1.1 (`466eab58`)                                                      | done                                                                                                                                                                                                                                                                                                                       | Lệch vị trí: ca 409 `PATCH` phòng đã ngừng và ca "không đổi gì ⟹ không thêm audit" nằm ở `department-profile-http` (:197, :276, :440) và `department-head-http` (:254, :370, :411), không ở `department-contract-http` (file này chỉ bỏ `hrBasis` khỏi kỳ vọng audit).                                   |
| Task 1.2 (`db95c09c`, `6a4133b1`)                                          | done                                                                                                                                                                                                                                                                                                                       | Hằng 200/1000 ở `department.types.ts`; NFC+trim+max trong schema; service bỏ `requireFunction`, giữ kiểm tên rỗng/độ dài; body rỗng `z.preprocess(body ?? {}, z.strictObject({}))`.                                                                                                                      |
| Task 1.3 (`a03c2884`)                                                      | done                                                                                                                                                                                                                                                                                                                       | Phần `/employees` của vài spec trong danh sách 1.3 hoàn tất ở Task 2.3 (`9f1eb76a`).                                                                                                                                                                                                                     |
| Task 1.4 (`9f5d8c13`)                                                      | done                                                                                                                                                                                                                                                                                                                       | Manifest 409 ba operation; demo dataset ba lời gọi phòng ban; `routes.md` không đổi nội dung.                                                                                                                                                                                                            |
| Checkpoint Phase 1                                                         | partial (phase A)                                                                                                                                                                                                                                                                                                          | `pnpm check` xanh ở HEAD; test:http/integration theo file chưa kiểm độc lập.                                                                                                                                                                                                                             |
| Task 2.1 (`d2178b0a`)                                                      | done                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                        |
| Task 2.2 (`86d78bbe`)                                                      | done                                                                                                                                                                                                                                                                                                                       | `employee-import-service-harness.ts` sửa ở đây thay vì 2.3 (unit spec cần).                                                                                                                                                                                                                              |
| Task 2.3 (`9f1eb76a`)                                                      | done                                                                                                                                                                                                                                                                                                                       | `basis()`, trường `basis` của fixture đã xóa; module card hai module cập nhật.                                                                                                                                                                                                                           |
| Task 2.4 (`e5670a6a`)                                                      | done                                                                                                                                                                                                                                                                                                                       | Hai file `hr-basis` giữ cho `/projects` (chú thích). `module-graph.md` sinh lại. FYI Owner: `openapi-request-rules.http-spec.ts` hạ ngưỡng dưới số lá `date` 96 → 92 (10 lá `hrBasis.issuedOn` rời tài liệu theo spec; số `format: date` trong `openapi.json` 119 → 109).                                |
| Checkpoint Phase 2                                                         | partial (phase A)                                                                                                                                                                                                                                                                                                          | `pnpm check` xanh; http/integration theo file chưa kiểm độc lập; timing/e2e/toàn bộ integration deferred phase B.                                                                                                                                                                                        |
| Verification and handoff                                                   | partial                                                                                                                                                                                                                                                                                                                    | Header plan còn `Triển khai: not-started`, spec còn `draft`, cột "Bằng chứng sau implement" của Test matrix còn `planned`, roadmap chưa cập nhật (owner-side). Spec dòng 186 nói `PATCH {}` ⟹ 200 không ghi, code/test có sẵn trả 422 `DEPARTMENT.UPDATE_EMPTY` — lệch câu chữ spec, không phải hồi quy. |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; module card cập nhật; phần chưa kiểm chứng ghi rõ (ví dụ hai file `hr-basis` còn lại chờ lát
      dự án phase 1, lệnh timing/e2e/toàn bộ integration chưa được Owner cho).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
