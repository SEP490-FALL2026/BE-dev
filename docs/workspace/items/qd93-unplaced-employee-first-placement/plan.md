# Plan: qd93-unplaced-employee-first-placement

- [Spec](spec.md); revision đầu vào: Docs `69e8a3d`, BE `1a77ffe8`. [Test plan](test-plan.md) cho Phase C (từng route
  tạo Request theo hợp đồng `D-S21`, viết lại 01/11/2026).
- Bổ sung sau pin: D-S17…D-S26 (Docs chưa commit) — Owner 01/11/2026, đã có trong `QĐ-93g` ở Docs working tree.
- Phụ trách: chưa phân công (sở hữu cả thiết kế, implementation, test và cập nhật plan). Thiết kế ban đầu bởi: AI theo
  giao việc Owner (gói `QĐ-93`, 01/11/2026).
- Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec (Phase D theo `QĐ-93g`(5) `D-S14`, lượt sửa
  `D-S17`…`D-S25`). Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

- Quyền chạy test (Owner 01/11/2026, `D-S26`): được tự chạy `pnpm typecheck`/`pnpm lint`/`pnpm arch:check`/`pnpm rules:check`,
  unit test (`pnpm test -- <file>`) và integration/HTTP test **theo file đã sửa** (`pnpm test:integration -- <file>`,
  `pnpm test:http -- <file>`), và `pnpm check`; **phải hỏi Owner trước** khi chạy toàn bộ `pnpm test:integration`,
  `pnpm test:e2e` hoặc `pnpm test:integration:timing`.
- Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/module-structure.md` (capability mới, R6 không vòng, 25 file/thư mục,
  extension point), `docs/rules/database-business.md` (`DB-05`, `DB-15`, khóa, transaction), `docs/rules/api-contract.md`
  (route mới, `OPENAPI-EXAMPLE.1`, một mã một status), `test/README.md`.
- Thứ tự merge (gói `QĐ-93`, một hạng mục một lần, rebase lên `dev` trước merge): nhánh làm việc đã có W1
  `qd93-remove-hr-basis-org-writes` và W3 `qd93-remove-fallback-substitute-approvers` phase A (policy bên Request chung
  `D-S21` — tên mã lỗi, hình dạng `details`, `blockedBy`, trình tự khóa/đọc, vị trí gọi trước đọc phòng và thứ tự bên → lý do
  lấy từ đó, không định nghĩa lại; lát này chỉ cấp `OrganizationReadApi.getUnplacedEmployeeIds`); lát này merge ở W3 ngay sau fallback
  A; `qd93-code-format-xlsx-employee-import` và `employee-directory-read` (W4) merge sau. **A–D là một PR, merge một lần** —
  không merge phase lẻ lên `dev`.
- Migration: `<ts>` dưới đây là chỗ giữ tên. Implementer đặt timestamp thật khi tạo thư mục; trước merge đặt lại timestamp sau
  migration mới nhất trên `dev` (hai migration của lát này giữ thứ tự A trước D) và thêm vào
  `scripts/verify/merged-migrations.txt` (danh sách gate thứ tự migration; đang dừng ở `20261028110000` dù `dev` có migration
  mới hơn — không sửa danh sách ở lượt thiết kế này).
- Đọc chữ `QĐ-93g`(3)–(5) (`D-S17`, `D-S18`, `D-S25`) và `US-03-04` AC-30, `US-03-01` AC-25 ở Docs working tree hoặc commit
  mới hơn `69e8a3d`; đọc lại `src/modules/personnel/offboarding/*`, `personnel/transfer/*`, `licensing/handover/*` trên `dev`.
- Người gọi writer cũ: `rg -n "createEmployeeWithPlacement" src test scripts` (src: confirmation service, `installation.api.ts`,
  `dev-seed.api.ts`, organization; test: `http-test-app.ts`, `builders/account.builder.ts`,
  `employee-import-service-harness.ts`, `installation-bootstrap-facts`, `organization.integration-spec.ts`, ba unit spec).
- Nơi xóa placement: `rg -n "DELETE FROM employee_placements|employeePlacement.delete" src test` (danh sách ở Task A.1).
- Database test riêng theo `test/README.md`.

## Tasks

### Phase A — CSDL và tạo hồ sơ không phòng

### Task A.1: Migration `<ts>_organization_placement_keep_one` (`INV-20`) và dựng lại người "không phòng" trong test

- Files: `prisma/migrations/<ts>_organization_placement_keep_one/migration.sql` (hàm + trigger `employee_placements_keep_one`
  `BEFORE DELETE ON employee_placements FOR EACH ROW`: `PERFORM 1 FROM employees WHERE id = OLD.employee_id FOR UPDATE`; nếu
  `NOT EXISTS (SELECT 1 FROM employee_placements WHERE employee_id = OLD.employee_id AND id <> OLD.id)` thì `RAISE EXCEPTION …
USING ERRCODE = 'restrict_violation', CONSTRAINT = 'employee_placements_keep_one'`; tên xếp sau
  `employee_placements_history_guard`), test mới `test/integration/organization/employee-placement-keep-one.integration-spec.ts`
  (xóa placement duy nhất ⟹ `23001`; xóa placement mới của điều chuyển đã lên lịch khi placement cũ còn ⟹ được; hai phiên cùng
  xóa hai placement của một người ⟹ phiên sau `23001`; placement đã báo tổ chức ⟹ vẫn `55000`). Sáu spec đang xóa placement để
  dựng người "không phòng" đổi sang chèn `employees` không placement (helper `insertEmployeeWithoutPlacement` ở
  `test/support/builders/account.builder.ts`): `test/integration/audit/access-request-http.integration-spec.ts:297`,
  `test/integration/catalog/requestable-software.integration-spec.ts:290`,
  `test/integration/licensing/license-assignment-http.integration-spec.ts:111`,
  `test/integration/requests/service-account-request.integration-spec.ts:196`,
  `test/integration/organization/organization.integration-spec.ts:207-208` (bỏ dọn placement/nhân viên — database của file bị
  xóa ở `afterAll`), `test/integration/organization/department-integrity-http.integration-spec.ts:66` (xóa placement không phải
  cuối — trigger cho qua; chỉ chạy lại). Mã họ khẳng định (`ACCESS_REQUEST.NO_DEPARTMENT`, `REQUESTABLE_SOFTWARE.NO_DEPARTMENT`)
  giữ ở Phase A, đổi ở Task C.2/C.4.
- Depends on: none.
- Acceptance: trigger có trên database migrate mới; `prisma migrate diff` không drift (trigger ngoài Prisma — `ADR-0005`); bảy
  spec trên xanh không đổi khẳng định; `department-transfer-integrity` vẫn `55000`.
- Verify: `pnpm prisma:validate`; `pnpm test:integration -- test/integration/organization/employee-placement-keep-one.integration-spec.ts test/integration/requests/department-transfer-change.integration-spec.ts test/integration/requests/department-transfer-integrity.integration-spec.ts test/integration/audit/access-request-http.integration-spec.ts test/integration/catalog/requestable-software.integration-spec.ts test/integration/licensing/license-assignment-http.integration-spec.ts test/integration/requests/service-account-request.integration-spec.ts test/integration/organization/organization.integration-spec.ts test/integration/organization/department-integrity-http.integration-spec.ts`
  → xanh.

### Task A.2: `placement-coverage.ts` theo `INV-20` mới

- Files: `test/support/placement-coverage.ts` (bỏ `no placement`; `active employee must have exactly one open placement` thành
  "người đang làm có placement thì có đúng một placement mở" — không placement nào là _chưa xếp phòng_ hợp lệ; placement đầu
  bắt đầu ở ngày vào, ngày ghi hồ sơ, hoặc không trước cả hai — xếp phòng lần đầu; giữ `gap or overlap` và `terminated … no
open placement`), `test/support/README.md` (mô tả), ca mới trong `test/integration/organization/organization.integration-spec.ts`
  (người không placement ⟹ không vi phạm; người đang làm có hai placement mở ⟹ vi phạm; placement đầu trước ngày vào ⟹ vi phạm).
  Người dùng helper chạy lại: bảy suite gọi trực tiếp (`auth-http`, `installation-minimal-env`, `installation`,
  `cost-centers-http`, `employee-manual-http`, `organization-concurrency`, `organization`) và hai harness
  (`department-harness.ts` — năm suite `department-*-http`; `employee-import-http-harness.ts` — ba suite `employee-import-*`).
- Depends on: Task A.1.
- Acceptance: các suite trên xanh trên code cũ (chưa có ai không phòng); ca mới đỏ trên helper cũ, xanh trên helper mới.
- Verify: `pnpm test:integration -- test/integration/organization/organization.integration-spec.ts test/integration/identity-access/auth-http.integration-spec.ts test/integration/installation/installation.integration-spec.ts test/integration/installation/installation-minimal-env.integration-spec.ts test/integration/organization/cost-centers-http.integration-spec.ts test/integration/organization/employee-manual-http.integration-spec.ts test/integration/organization/organization-concurrency.integration-spec.ts`
  → xanh.

### Task A.3: Test đỏ cho hồ sơ không phòng (nhập tay, import)

- Files: `src/modules/organization/employee/employee-row.policy.spec.ts` (mã trống ⟹ không lý do phòng),
  `src/modules/data-import/employee-import/row-validation/employee-import-row-validation-placement.policy.spec.ts` (header
  không cột phòng hợp lệ; ô trống ⟹ `VALID` với `departmentId: null`; ô vắng (`cells.department_code === undefined`) ⟹ người
  đã có không khác biệt mã phòng; ô `''` ⟹ khác biệt như cũ),
  `src/modules/data-import/employee-import/employee-import-summary.json.spec.ts`, `employee-import-result.json.spec.ts` (dòng
  cũ không có khóa mới ⟹ 0), `test/integration/organization/employee-manual-http.integration-spec.ts` (ca `E302` không phòng;
  mã phòng chưa có/đã ngừng vẫn 422), `test/integration/data-import/employee-import-preview-http.integration-spec.ts` (AC-2
  không cột; AC-1 dòng 17 trống; AC-8 phòng đã ngừng; file không cột phòng cho người đã có → preview rồi **làm mới**: không
  khác biệt), `test/integration/data-import/employee-import-confirm-http.integration-spec.ts` (`created`, `createdUnplaced`;
  không placement; AC-4; import lại `E302` với mã phòng ⟹ `EXISTS_DIFFERENT`; file không cột phòng cho người đã có → **xác
  nhận** không `PREVIEW_STALE`).
- Depends on: Task A.2.
- Acceptance: các ca mới đỏ trên code cũ (`DEPARTMENT_REQUIRED`, `IMPORT.FILE_MISSING_COLUMNS`).
- Verify: `pnpm test -- src/modules/organization/employee/employee-row.policy.spec.ts src/modules/data-import/employee-import`
  → đỏ đúng ca mới.

### Task A.4: Một writer `createEmployee` có placement tùy chọn; nhập tay không phòng

- Files: `src/modules/organization/public/organization.types.ts` (`CreateEmployeeInput` với `placement: { departmentId;
from } | null`), `public/organization.api.ts` (`createEmployee` thay `createEmployeeWithPlacement`),
  `employee/employee.repo.ts`, `employee/employee-record.service.ts`, `employee/employee-manual.service.ts` (không tra phòng
  khi mã trống; adapter chỉ truyền `department` khi có mã; audit `department: null`, `memberSince: null`; view nullable),
  `employee/employee-row.policy.ts`, `employee/employee.dto.ts` (`memberSince`, `department` nullable, `unplaced`),
  `employee/employees.controller.ts` (mô tả 201), `src/modules/installation/public/installation.api.ts`,
  `src/modules/installation/public/dev-seed.api.ts` (+ hai unit spec), người gọi trong `test/` theo `## Before coding`.
- Depends on: Task A.3.
- Acceptance: ca nhập tay của Task A.3 xanh; installation/dev-seed vẫn tạo nhân viên có phòng (`placement` đầy đủ);
  `rg -n "createEmployeeWithPlacement" src test scripts` rỗng.
- Verify: `pnpm typecheck`; `pnpm test -- src/modules/organization src/modules/installation` → xanh;
  `pnpm test:integration -- test/integration/organization/employee-manual-http.integration-spec.ts test/integration/installation/installation.integration-spec.ts test/integration/installation/installation-bootstrap-facts.integration-spec.ts`
  → xanh.

### Task A.5: Import với cột phòng tùy chọn và bộ đếm _chưa xếp phòng_

- Files: `src/modules/data-import/employee-import/row-validation/employee-import-row-validation.policy.ts`
  (`OPTIONAL_COLUMNS` thêm `department_code`; `placementIssues` chỉ khi có mã; `parsedRow` nhận `departmentId | null`; so cột
  phòng chỉ khi `cells.department_code !== undefined` — cùng một hàm cho preview, làm mới và xác nhận, không truyền header),
  `employee-import-row.types.ts`, `employee-import.types.ts`, `preview/employee-import-preview.service.ts` (`newUnplaced`),
  `confirmation/employee-import-confirmation.service.ts` (`createEmployee` với `placement: null`, `createdUnplaced`, `created`
  = tổng), `employee-import-summary.json.ts`, `employee-import-result.json.ts` (`.default(0)`), `employee-import.dto.ts`,
  `employee-import-audit.mapper.ts` (`department: string | null`), `employee-import.http-errors.ts` (ví dụ `['employee_code']`),
  `employee-imports.controller.ts` (mô tả 422), `test/support/employee-import-http-harness.ts`,
  `test/support/employee-import-service-harness.ts`.
- Depends on: Task A.4.
- Acceptance: ca import của Task A.3 xanh (gồm làm mới và xác nhận); preview cũ trên database (không khóa mới) đọc được.
- Verify: `pnpm test -- src/modules/data-import` → xanh;
  `pnpm test:integration -- test/integration/data-import/employee-import-preview-http.integration-spec.ts test/integration/data-import/employee-import-confirm-http.integration-spec.ts test/integration/data-import/employee-import-wire-http.integration-spec.ts`
  → xanh.

### Checkpoint Phase A

`pnpm check`; integration theo file của Task A.1–A.5 (các lệnh Verify ở trên) xanh; `pnpm openapi:export` diff chỉ ở
`employeeCreate` và schema import. Tự review theo `US-02-02` AC-2, AC-7, AC-14, AC-20 (vế tạo), `US-02-03` AC-1, AC-2, AC-4,
AC-8.

### Phase B — Xếp phòng lần đầu

### Task B.1: Policy xếp phòng lần đầu (unit, test trước)

- Files: `src/modules/organization/first-placement/first-placement.policy.ts`, `first-placement.policy.spec.ts` (thứ tự lý do:
  hồ sơ của chính mình, đã nghỉ việc, đang bàn giao, đã có placement, ngày trước hôm nay, ngày trước ngày vào; ngày bằng hôm
  nay và bằng ngày vào hợp lệ; ngày vào tương lai; ngày rất xa hợp lệ), `first-placement.errors.ts`
  (`FirstPlacementError(problem)` với `ALREADY_PLACED | EMPLOYEE_LEFT | EMPLOYEE_LEAVING | DEPARTMENT_NOT_FOUND |
DEPARTMENT_INACTIVE | DATE_IN_PAST | BEFORE_HIRE_DATE`).
- Depends on: Checkpoint Phase A.
- Acceptance: spec đỏ trước khi viết policy, xanh sau; policy thuần (không Nest/Prisma).
- Verify: `pnpm test -- src/modules/organization/first-placement` → xanh.

### Task B.2: Route, DTO, ánh xạ lỗi và HTTP contract

- Files: `first-placements.controller.ts` (`@Controller({ path: 'employees', version: '1' })`, `@Post(':id/first-placements')`,
  `@RequireRoles('SUPER_ADMIN')`, operationId `employeeFirstPlacementCreate`, summary ≤ 70 ký tự, 201
  `EMPLOYEE.FIRST_PLACEMENT_RECORDED`, lỗi 403/404/409/422 có ví dụ), `first-placement.dto.ts`,
  `first-placement.http-errors.ts` (`EMPLOYEE.FIRST_PLACEMENT_<PROBLEM>`; 409 cho `ALREADY_PLACED`, `EMPLOYEE_LEFT`,
  `EMPLOYEE_LEAVING`; 422 còn lại; `FIRST_PLACEMENT_ERROR_EXAMPLES`), `src/modules/organization/organization-http.module.ts`,
  `test/http/organization/employees.http-spec.ts` (401, 403 cho FINANCE/IT_ADMIN/EMPLOYEE/không vai, 422 body thiếu/thừa khóa/
  ngày sai/`hrBasis`), `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts`,
  `test/support/openapi-example-route-codes-organization.ts`, `test/http/platform/openapi-presentation.http-spec.ts` (số
  operation + 1).
- Depends on: Task B.1.
- Acceptance: HTTP contract xanh với service giả qua `createHttpContractApp({ overrides })`; inventory/example gate xanh.
- Verify: `pnpm openapi:export`; `pnpm test:http -- test/http/organization/employees.http-spec.ts test/http/platform/openapi-presentation.http-spec.ts`
  → xanh; `pnpm test:gates` → xanh.

### Task B.3: Service, repo, audit, thông báo và integration

- Files: `first-placement.service.ts` (giao dịch: `businessToday`, khóa phòng `FOR SHARE`, khóa nhân viên `FOR UPDATE`,
  policy, `insertFirstPlacement`, ánh xạ `check_violation`/`23P01`, audit `EMPLOYEE.FIRST_PLACEMENT_RECORDED`, thông báo),
  `first-placement-notice.mapper.ts` (+ spec), `src/modules/organization/employee/employee.repo.ts` (`insertFirstPlacement`),
  `employee/employee-record.service.ts`, `src/modules/notifications/public/notifications.types.ts`,
  `src/modules/notifications/inbox/inbox.policy.ts` (params của `EMPLOYEE_FIRST_PLACED`),
  `test/integration/organization/employee-first-placement-http.integration-spec.ts` (mọi ca AC-21 của spec, hai lần gọi đồng
  thời, xếp phòng ↔ ngừng phòng đồng thời cả hai thứ tự, đọc `GET /departments/{id}/employees` trước/sau ngày hiệu lực, không
  announcement/rà soát/tác vụ, thông báo ba người nhận; `US-01-01` AC-22: tạo tài khoản, gán vai cho `E302` rồi xếp phòng),
  `test/integration/organization/department-head-http.integration-spec.ts` (gán/chỉ định `E302` ⟹ 422 — vế `E302` của
  `US-03-06` AC-23).
- Depends on: Task B.2.
- Acceptance: test integration xanh; audit có trước/sau; không dòng `organization_change_announcements` mới cho placement đầu.
- Verify: `pnpm test:integration -- test/integration/organization/employee-first-placement-http.integration-spec.ts test/integration/organization/department-head-http.integration-spec.ts`
  → xanh.

### Task B.4: Ngừng phòng đếm người sẽ vào

- Files: `src/modules/organization/department/department.repo.ts` (đọc người có placement `valid_from > today` của phòng, có
  biên `IN_USE_LISTED`), `src/modules/organization/department-management/department.service.ts` (gộp vào nhóm `members`),
  `test/integration/organization/department-integrity-http.integration-spec.ts` (ca ngừng phòng có người xếp lần đầu từ
  ngày mai ⟹ 409 `DEPARTMENT.IN_USE`).
- Depends on: Task B.3.
- Acceptance: test mới đỏ trước, xanh sau; hình dạng `details.members` không đổi.
- Verify: `pnpm test:integration -- test/integration/organization/department-integrity-http.integration-spec.ts` → xanh.

### Checkpoint Phase B

`pnpm check`; `pnpm test:http -- test/http/organization/employees.http-spec.ts test/http/organization/departments.http-spec.ts`;
`pnpm test:integration -- test/integration/organization/employee-first-placement-http.integration-spec.ts test/integration/organization/department-head-http.integration-spec.ts test/integration/organization/department-integrity-http.integration-spec.ts test/integration/notifications/in-app-notifications.integration-spec.ts`
xanh; `pnpm arch:capabilities --module organization` không vòng; tự review theo `US-02-02` AC-16 (vế xếp phòng), AC-20, AC-21.

### Phase C — Từ chối Request của người chưa xếp phòng (nhánh `UNPLACED` của `D-S21`)

### Task C.1: Đọc dùng chung cho module khác (`D-S25`)

- Files: `src/modules/organization/employee/employee.repo.ts` (`unplacedEmployeeSql(employeeIdColumn)` xuất ra, `unplacedAmong(ids,
tx?)`, `scheduledFirstPlacement(employeeId, onDate, tx)`), `employee/employee-record.service.ts`,
  `src/modules/organization/department/department.repo.ts` + `department-record.service.ts` (`requestUnitsOn`,
  `requestMemberIdsOn`), `src/modules/organization/public/organization-read.api.ts` (`getUnplacedEmployeeIds`,
  `getRequestUnits`, `getRequestMemberIds`, `getScheduledFirstPlacement`), `src/modules/organization/README.md` (vị từ dùng
  chung cho `employee-directory-read`), `test/integration/organization/organization.integration-spec.ts` (người chưa xếp phòng,
  người xếp từ tương lai, người đã nghỉ việc, người đang làm — cho từng đọc).
- Depends on: Checkpoint Phase B.
- Acceptance: `getUnplacedEmployeeIds(ids, tx?): Promise<ReadonlySet<string>>` (tên duy nhất policy chung gọi — spec › _Định
  nghĩa dùng chung_) chỉ trả nhân viên tồn tại không có dòng placement nào, không khóa; `getRequestUnits` trả phòng tương lai cho
  người xếp lần đầu từ ngày tương lai, không trả gì cho người đã nghỉ; `getOwningUnits` không đổi.
- Verify: `pnpm test:integration -- test/integration/organization/organization.integration-spec.ts` → xanh.

### Task C.2: Nhánh `UNPLACED` ở policy chung và các cửa Request của người gửi

- Files: policy bên Request chung của `qd93-remove-fallback-substitute-approvers` —
  `src/modules/identity-access/request-party/request-party-eligibility.service.ts` (bước 2 của trình tự chung:
  `OrganizationReadApi.getUnplacedEmployeeIds(mọi id các bên, tx)` **sau** `lockSpendingApproverAmong`, không khóa nhân viên) và
  `request-party/request-party.policy.ts` (+ `.spec.ts`; nhánh `UNPLACED` của `requestPartyBlock`/`ineligibleReasons`, thứ tự bên
  rồi lý do không đổi); `src/modules/requests/access-request/request-facts.service.ts` (`assess`, `assessProposal` đọc
  `getRequestUnits` — sau lời gọi kiểm chung), `request-submission/{request-preview.service.ts,request-preview.dto.ts}` (trả sớm
  khi `blockedBy.reason = 'UNPLACED'`, `department` nullable, `totalExpectedWorkingDays` `nonnegative` — đề xuất chờ Owner, spec ›
  _Từ chối Request…_), `draft/request-draft.service.ts`, `renewal-request/renewal-request.service.ts`,
  `return-request/return-request.service.ts`, `group-request-submission/group-request.service.ts` (người gửi),
  `group-request-submission/group-candidate.service.ts` (`getRequestMemberIds`; người gọi _chưa xếp phòng_ ⟹ 422 chung qua
  `blockOf` đã đặt ở fallback, trước `getRequestUnits`), `test/support/openapi-example-route-codes-requests-spend.ts`
  (`groupRequestCandidateList` bỏ `409 ACCESS_REQUEST.NO_DEPARTMENT` nếu không còn đường nào ra nó), controller tương ứng nếu ví
  dụ lỗi đổi, file integration mới `test/integration/requests/unplaced-employee-requests.integration-spec.ts` (≤ 800 dòng; các
  dòng người gửi của test matrix và bảng từng route của [test plan](test-plan.md), viết trước — đỏ), đổi khẳng định ở
  `test/integration/audit/access-request-http.integration-spec.ts` và
  `test/integration/requests/service-account-request.integration-spec.ts` (người không placement ⟹ 422 `UNPLACED`).
- Depends on: Task C.1.
- Acceptance: dòng người gửi, preview (`blockedBy`), danh sách ứng viên và dòng _thứ tự phán định và khóa_ của test matrix
  xanh; không lỗi phòng nào ra trước 422 chung cho người _chưa xếp phòng_; ca `NO_DEPARTMENT` cũ (người đã nghỉ việc) giữ mã cũ;
  không Request/bước/cam kết nào khi từ chối. Task chạm > 5 file vì một nhánh của một policy chạy ở mọi cửa; tách C.2a (policy +
  `request-facts`, preview, draft) / C.2b (gia hạn, hoàn trả, nhóm, danh sách ứng viên) nếu diff lớn.
- Verify: `pnpm test -- src/modules/identity-access/request-party src/modules/requests` (spec cạnh file đã sửa);
  `pnpm test:integration -- test/integration/requests/unplaced-employee-requests.integration-spec.ts test/integration/audit/access-request-http.integration-spec.ts test/integration/requests/service-account-request.integration-spec.ts test/integration/requests/access-request-preview.integration-spec.ts test/integration/requests/access-request-draft-constraints.integration-spec.ts test/integration/requests/return-request.integration-spec.ts test/integration/requests/group-request-submit.integration-spec.ts`
  → xanh; `pnpm arch:capabilities --module identity-access` không vòng.

### Task C.3: Tạo thay, dòng nhóm, thành viên tương lai (`D-S22`, `D-S25`)

- Files: `src/modules/requests/delegated-request/delegated-request.service.ts` (người thụ hưởng đọc `getRequestUnits` **sau**
  `assertEligible` mà fallback đã đặt — khóa mọi người thụ hưởng trước, rồi kiểm chung, rồi `headedDepartment`/kiểm từng người;
  nhánh `UNPLACED` qua policy chung — tất-cả-hoặc-không, liệt kê mọi người), `delegated-request.policy.ts` (+ spec, nếu đổi),
  `group-request/group-request.policy.ts` (+ spec; lý do dòng `UNPLACED` từ `ineligibleAmong`, đứng sau `SPENDING_APPROVER` và
  trước mọi lý do phòng), `group-request-submission/group-submission-facts.service.ts` (`getRequestUnits`),
  test integration của Task C.2 (thêm dòng; tách file thứ hai
  `test/integration/requests/unplaced-employee-delegated-group.integration-spec.ts` nếu vượt 800 dòng) gồm ca `D-S25`: `E302`
  xếp vào `P-DES` từ ngày mai — `H1` tạo thay được, `E302` tự gửi được (tính vào `CC-DES`), ứng viên nhóm có `E302`; và ca cấp
  phát `responsibleEmployeeId = E302` (kiểm chung của fallback đã nằm trong `problemWith` trước `OUTSIDE_DEPARTMENT` — không sửa
  `licensing`).
- Depends on: Task C.2.
- Acceptance: dòng tạo thay/nhóm/cấp phát/`D-S25` của test matrix xanh, gồm tạo thay `E302` + `E1` ⟹ 422 chung (không
  `OUTSIDE_DEPARTMENT`/`NOT_HEAD`) và ca song song ghi nghỉ việc ↔ tạo thay không deadlock; không thao tác thêm người thụ hưởng ở
  hồ sơ bổ sung (`D-S23`).
- Verify: `pnpm test -- src/modules/requests/delegated-request src/modules/requests/group-request` → xanh;
  `pnpm test:integration -- test/integration/requests/unplaced-employee-requests.integration-spec.ts test/integration/requests/spend-delegated-requests.integration-spec.ts test/integration/requests/group-request-submit.integration-spec.ts test/integration/requests/group-request-edge.integration-spec.ts`
  → xanh.

### Task C.4: Bộ chọn phần mềm (catalog)

- Files: `src/modules/catalog/requestable-software/{requestable-software.service.ts,requestable-software.errors.ts,requestable-software.http-errors.ts,requestable-software.controller.ts}`
  (`getRequestUnits`; người gọi _chưa xếp phòng_ ⟹ 409 `REQUESTABLE_SOFTWARE.NO_DEPARTMENT` `details.reason: 'UNPLACED'`, ví dụ),
  `test/integration/catalog/requestable-software.integration-spec.ts` (đổi khẳng định ca "không phòng"; ca `D-S25`).
- Depends on: Task C.1.
- Acceptance: dòng "bộ chọn phần mềm" và `D-S25` của test matrix xanh.
- Verify: `pnpm test:integration -- test/integration/catalog/requestable-software.integration-spec.ts` → xanh.

### Task C.5: OpenAPI, manifest, tài liệu

- Files: `test/support/openapi-example-route-codes-requests.ts`, `openapi-example-route-codes-requests-spend.ts`
  (`groupRequestCandidateList`), `openapi-example-route-codes-catalog.ts`, `openapi.json`
  (sinh lại), `docs/generated/routes.md`, `docs/generated/*` của `arch:graph` (sinh lại), `src/modules/data-import/README.md`,
  `src/modules/requests/README.md`, `src/modules/notifications/README.md`, `src/modules/catalog/README.md`.
- Depends on: Task C.3, Task C.4.
- Acceptance: `openapi-response-examples` và `api-inventory` xanh; module card mô tả _chưa xếp phòng_, `D-S25` và nhánh
  `UNPLACED`.
- Verify: `pnpm openapi:export`; `pnpm test:http -- test/http/platform/openapi-presentation.http-spec.ts`; `pnpm arch:graph &&
pnpm arch:routes && pnpm arch:docs:check` → xanh.

### Checkpoint Phase C

`pnpm check`; integration theo file của Task C.1–C.4 (lệnh Verify ở trên) xanh; tự review theo mọi AC của bảng Primary và
test plan. Hành trình E2E `pnpm test:e2e -- test/e2e/paid-request-to-seat.e2e-spec.ts` chỉ sau khi Owner đồng ý (`D-S26`).

### Phase D — Nghỉ việc rút gọn (`US-03-04` AC-30, `D-S17`, `D-S18`) và điều chuyển (`US-03-01` AC-25)

### Task D.1: Migration `<ts>_personnel_offboarding_unplaced` và test đỏ

- Files: `prisma/migrations/<ts>_personnel_offboarding_unplaced/migration.sql` (`department_id DROP NOT NULL`; cột
  `cancelled_placement_id`, `cancelled_placement_department_id` (FK), `cancelled_placement_from`; CHECK
  `offboarding_cases_unplaced_no_head`, `offboarding_cases_cancelled_placement`; `CREATE OR REPLACE FUNCTION` của
  `employee_placements_keep_one` thêm ngoại lệ: placement cuối có `valid_from` sau ngày nghiệp vụ hôm nay **và** hồ sơ nghỉ
  việc chưa hủy nêu `cancelled_placement_id = OLD.id`), `prisma/models/personnel.prisma` (`departmentId String?`, quan hệ
  `Department?`, ba cột mới), `src/modules/personnel/offboarding/offboarding.policy.spec.ts`,
  `change/offboarding-change.policy.spec.ts` (mốc `hireDate` khi không placement), file mới
  `test/integration/personnel/offboarding-unplaced.integration-spec.ts` (các dòng `US-03-04` AC-30 và `D-S17` của test matrix,
  viết trước — đỏ: hôm nay `PLACEMENT_OVERLAP` `NO_OPEN_PLACEMENT`), ca CHECK và ngoại lệ trigger trong
  `test/integration/organization/employee-placement-keep-one.integration-spec.ts`.
- Depends on: Checkpoint Phase C.
- Acceptance: migration áp trên database mới; CHECK từ chối; trigger vẫn `23001` khi không có hồ sơ nêu placement; ca AC-30
  đỏ đúng lý do.
- Verify: `pnpm prisma:validate`; `pnpm prisma:generate`; `pnpm test:gates`;
  `pnpm test:integration -- test/integration/organization/employee-placement-keep-one.integration-spec.ts test/integration/personnel/offboarding-unplaced.integration-spec.ts`
  → keep-one xanh, offboarding-unplaced đỏ đúng ca mới.

### Task D.2: Nhánh không phòng khi ghi nghỉ việc

- Files: `src/modules/personnel/offboarding/offboarding-preconditions.service.ts` (rẽ nhánh theo `getUnplacedEmployeeIds` /
  `getScheduledFirstPlacement`, khóa, đọc lại sau khóa), `offboarding.policy.ts` (`placementFrom: BusinessDate | null`),
  `offboarding-endings.service.ts` (bỏ kết thúc placement và bàn giao trưởng phòng khi không phòng),
  `offboarding-case-writer.service.ts` (`department_id` null; không `handovers.open`; thông báo không phòng),
  `offboarding-handover.service.ts` (không mở khi `departmentId` null), `offboarding-revocation.service.ts` (chỉ truyền
  `context.departmentId` khi có), `src/modules/personnel/event-notice/personnel-notifier.service.ts` (`departmentId: string |
null`), `offboarding.repo.ts`, `offboarding.types.ts`.
- Depends on: Task D.1.
- Acceptance: dòng ghi, căn cứ, không tài khoản, đồng thời ↔ xếp phòng lần đầu của test matrix xanh; không mã lỗi mới ở
  `OFFBOARDING_CASE.*`; luồng của người đã xếp phòng không đổi. Tách D.2a (tiền điều kiện + policy) / D.2b (kết thúc + ghi +
  thông báo) nếu diff lớn.
- Verify: `pnpm test -- src/modules/personnel/offboarding src/modules/personnel/event-notice` → xanh;
  `pnpm test:integration -- test/integration/personnel/offboarding-unplaced.integration-spec.ts test/integration/personnel/offboarding-departure.integration-spec.ts test/integration/requests/offboarding-record.integration-spec.ts test/integration/requests/offboarding-integrity.integration-spec.ts`
  → xanh phần ghi, hồi quy xanh.

### Task D.3: Hủy xếp phòng chưa hiệu lực khi nghỉ việc và khôi phục khi hủy hồ sơ (`D-S17`)

- Files: `src/modules/organization/employee/employee.repo.ts` (`cancelScheduledFirstPlacement`, `restoreFirstPlacement`),
  `src/modules/organization/public/organization.api.ts` (hai lệnh, audit `EMPLOYEE.FIRST_PLACEMENT_CANCELLED`),
  `src/modules/personnel/offboarding/offboarding-case-writer.service.ts` (ghi ba cột rồi xóa sau khi chèn hồ sơ, trước
  `leaveInTx`; `alsoDepartmentIds` cho `DEPARTURE_RECORDED`), `change/offboarding-change-writer.service.ts` (`cancel`: khôi
  phục khi phòng `ACTIVE`, `detail.firstPlacementRestored`), `offboarding-frame.service.ts` (khóa phòng của placement đã hủy
  `FOR SHARE` trước nhân viên), test của Task D.1.
- Depends on: Task D.2.
- Acceptance: dòng `D-S17` của test matrix xanh (ghi có kế hoạch và đột xuất, hủy khi phòng còn/đã ngừng, xếp phòng khi
  `HANDING_OVER` ⟹ 409 `EMPLOYEE_LEAVING`).
- Verify: `pnpm test:integration -- test/integration/personnel/offboarding-unplaced.integration-spec.ts test/integration/organization/employee-first-placement-http.integration-spec.ts test/integration/requests/offboarding-change.integration-spec.ts`
  → xanh.

### Task D.4: Không nghĩa vụ trưởng phòng cho người nghỉ không phòng (`D-S18`)

- Files: `src/modules/licensing/handover/handover-confirmer.policy.ts` (+ spec: `requirementOf(facts, dataLoss,
{ departmentId })` bỏ `DEPARTURE`/`ABRUPT_DEPARTURE` khi không phòng), `handover-issue.service.ts`, `handover.service.ts`
  (`open`, `openFromTask` đọc phòng trước khi xét yêu cầu), `src/modules/licensing/README.md`, ca trong
  `test/integration/personnel/offboarding-unplaced.integration-spec.ts` (IT Admin mở thu hồi seat gói mất dữ liệu của người
  nghỉ không phòng ⟹ không `handover_duties`, tác vụ nhận/làm được ngay).
- Depends on: Task D.2.
- Acceptance: dòng `D-S18` của test matrix xanh; bàn giao của người đã xếp phòng không đổi.
- Verify: `pnpm test -- src/modules/licensing/handover` → xanh;
  `pnpm test:integration -- test/integration/personnel/offboarding-unplaced.integration-spec.ts test/integration/requests/handover-duty-departure.integration-spec.ts test/integration/licensing/handover-duty-sources.integration-spec.ts test/integration/licensing/provisioning-revocation-open.integration-spec.ts`
  → xanh.

### Task D.5: Các bước sau khi ghi với hồ sơ không phòng; phạm vi đọc của IT Admin

- Files: `src/modules/personnel/offboarding/change/offboarding-change-judge.service.ts` (`placementFrom` null ⟹ `hireDate`;
  không đọc trưởng phòng khi không phòng), `change/offboarding-change-writer.service.ts` (không `periods.schedule` khi không
  phòng), `detail/offboarding-detail.service.ts` (không `getDepartmentBrief(null)`), `offboarding-view.service.ts`,
  `offboarding-list.repo.ts` (hồ sơ `department_id IS NULL` cho mọi IT Admin dùng được), `offboarding-frame.service.ts`,
  `offboarding.mapper.ts`, `offboarding.dto.ts` (`department` nullable), `src/modules/personnel/role-duties/role-duties.listener.ts`
  (`departmentId` null), test của Task D.1 (đổi ngày cuối, hủy, IT Admin chưa xếp phòng nghỉ ⟹ `ROLE_HOLDER_LEAVING`, ghi _đã
  nghỉ việc_, khóa tài khoản, phiên bị từ chối, IT Admin không phụ trách phòng nào đọc và mở thu hồi, đóng hồ sơ).
- Depends on: Task D.3, Task D.4.
- Acceptance: mọi dòng `US-03-04` AC-30 của test matrix xanh.
- Verify: `pnpm test -- src/modules/personnel` (spec cạnh file đã sửa) → xanh;
  `pnpm test:integration -- test/integration/personnel/offboarding-unplaced.integration-spec.ts test/integration/requests/offboarding-change.integration-spec.ts test/integration/personnel/role-duties.integration-spec.ts`;
  `pnpm test:http -- test/http/personnel/offboarding-cases.http-spec.ts test/http/personnel/role-duties.http-spec.ts` → xanh.

### Task D.6: Lý do điều chuyển người chưa xếp phòng (`US-03-01` AC-25)

- Files: `src/modules/personnel/transfer/transfer-preconditions.service.ts` (không placement hiệu lực và _chưa xếp phòng_ ⟹
  `PLACEMENT_OVERLAP` `details.reason: 'UNPLACED'`), `transfer.http-errors.ts` (ví dụ), `transfers.controller.ts` (mô tả 409),
  `test/integration/requests/department-transfer-record.integration-spec.ts` (ca AC-25 và ca sau xếp phòng có hiệu lực).
- Depends on: Task C.1.
- Acceptance: dòng `US-03-01` AC-25 của test matrix xanh; ca điều chuyển khác không đổi.
- Verify: `pnpm test:integration -- test/integration/requests/department-transfer-record.integration-spec.ts`;
  `pnpm test:http -- test/http/personnel/department-transfers.http-spec.ts` → xanh.

### Task D.7: OpenAPI, manifest, tài liệu

- Files: `openapi.json` (sinh lại), `test/support/openapi-example-route-codes-*.ts` của `personnel` (`UNPLACED` ở điều chuyển)
  và `organization` (`EMPLOYEE_LEAVING`), `src/modules/personnel/README.md`, `src/modules/organization/README.md`,
  `src/modules/licensing/README.md`, `docs/generated/*` (sinh lại).
- Depends on: Task D.5, Task D.6.
- Acceptance: OpenAPI có `department` nullable ở hồ sơ nghỉ việc và ví dụ mới; module card mô tả luồng rút gọn, `D-S17`,
  `D-S18`.
- Verify: `pnpm openapi:export`; `pnpm test:http -- test/http/platform/openapi-presentation.http-spec.ts`; `pnpm arch:graph &&
pnpm arch:routes && pnpm arch:docs:check` → xanh.

### Checkpoint Phase D

`pnpm check`; integration theo file của Task D.1–D.6 (lệnh Verify ở trên) xanh. Hồi quy `pnpm test:e2e --
test/e2e/offboarding-revocation.e2e-spec.ts` chỉ sau khi Owner đồng ý (`D-S26`). Tự review theo `US-03-04` AC-30,
`US-03-01` AC-25 và spec. Mở **một** PR A–D.

## Verification and handoff

Chạy từ gốc BE: `pnpm check`, `pnpm openapi:export`, HTTP và integration theo file đã sửa (danh sách ở các checkpoint). Full
`pnpm test:integration` (database riêng) và một hành trình `pnpm test:e2e` trước handoff: **hỏi Owner trước** (`D-S26`).

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| chưa chạy          | —                     | —                 | thiết kế `draft`        |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test plan phản ánh đúng implementation cuối; tên migration (timestamp thật) ghi lại ở spec và
      `scripts/verify/merged-migrations.txt`.
- [ ] Diff cuối đã tự review; module card cập nhật; FE được báo route, wire, nhánh `UNPLACED` và mã mới.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
