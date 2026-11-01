# Plan: employee-directory-read

- [Spec](spec.md); revision đầu vào: Docs `69e8a3d`, BE `1a77ffe8`.
- Bổ sung sau pin: D-S17…D-S26 (Docs chưa commit) — Owner 01/11/2026.
- Phụ trách: chưa phân công (sở hữu cả thiết kế, implementation, test và cập nhật plan). Thiết kế ban đầu bởi: AI theo
  giao việc Owner (gói `QĐ-93`, 01/11/2026).
- Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

- Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/api-contract.md` (API-LIST-DETAIL.1, `OPENAPI-EXAMPLE.1`, lời route đọc),
  `docs/rules/module-structure.md` (extension point, tên service đọc, 25 file/thư mục), `docs/rules/security-jobs.md` (guard
  đọc CSDL ở mọi request), `test/README.md`, `test/support/README.md` (query-count harness).
- Quyền chạy test (Owner 01/11/2026, `D-S26`): được tự chạy `pnpm typecheck`/`pnpm lint`/`pnpm arch:check`/`pnpm rules:check`,
  unit test (`pnpm test -- <file>`) và integration test **theo file đã sửa** (`pnpm test:integration -- <file>`), và
  `pnpm check`; **phải hỏi Owner trước** khi chạy toàn bộ `pnpm test:integration`, `pnpm test:e2e` hoặc
  `pnpm test:integration:timing`. Plan này coi `pnpm test:http -- <file>` và `pnpm test:gates` (không CSDL) như unit test.
- Thứ tự merge (spec, Dependencies): W4, sau `qd93-unplaced-employee-first-placement` (A–D) đã merge — kiểm trên `dev`: vị
  từ _chưa xếp phòng_ dùng chung (`EmployeeRepo.unplacedAmong` hoặc mảnh SQL dùng chung, `D-S25`: không có placement nào),
  route `POST /employees` không phòng và `POST /employees/{id}/first-placements`; `AppRole` sáu giá trị và chuỗi `ROLE_GRANTS`
  của lát vai; tên `department-manager-http.integration-spec.ts` của lát dự án phase 1. Thiếu một trong các thứ đó ⟹ dừng,
  báo Owner.
- Không migration. Nếu phát sinh: timestamp thật khi tạo thư mục, đổi lại cho đứng sau migration mới nhất trên `dev` trước
  merge và thêm vào `scripts/verify/merged-migrations.txt` (`DB-15`).
- Mẫu để chép: `department-management/department-technical-members.repo.ts:19-53` (trang + đếm trong một `RepeatableRead`),
  `department-query.service.ts:104-112` (lịch sử có biên + `cutHistory`), `test/integration/organization/organization-identity-read-contracts.integration-spec.ts`
  (đếm câu lệnh, `oneSnapshot`), `test/integration/licensing/licensing-assignment-read-contracts.integration-spec.ts:50-75`
  (cùng số câu trên hai cỡ dữ liệu, cửa sổ từ câu đầu chạm bảng của route — dòng 69-73).
- Database test riêng theo `test/README.md`.

## Tasks

### Task 1: Hook tài khoản theo lô (identity-access bind)

- Files: `src/modules/organization/public/organization.extension-points.ts` (`EmployeeAccountSummary`,
  `EmployeeAccountDetail`, ba method mới của `EmployeeAccounts`: `findEmployeeIdsWithAccount`, `summarizeAccounts`,
  `describeAccount`), `src/modules/identity-access/accounts/employee-accounts.listener.ts` (bind),
  `src/modules/identity-access/accounts/account-record.service.ts` (`summarizeAccounts` — **một** câu chỉ trên `app_users`
  theo `employee_id`, không `role_grants`; `describeAccount` — **một** câu `app_users` + `role_grants` còn hiệu lực, không
  khóa; `findEmployeeIdsWithAccount` có sẵn), repo tương ứng trong `src/modules/identity-access/accounts/`
  (`app-user.repo.ts`, `role-grant.repo.ts`), test integration
  `test/integration/identity-access/employee-account-summaries.integration-spec.ts` (mới: có/không tài khoản, khóa, chưa kích
  hoạt, đã nghỉ việc, vai bị thu hồi không trả ở `describeAccount`; `summarizeAccounts` một câu cho 1 và 50 id và câu đó không
  chạm `role_grants`; `describeAccount` một câu).
- Depends on: none.
- Acceptance: test mới đỏ trước, xanh sau; `extension-wiring` xanh; module card `identity-access`, `organization` ghi điểm mở.
- Verify: `pnpm test:integration -- test/integration/identity-access/employee-account-summaries.integration-spec.ts` → xanh;
  `pnpm test:gates` → xanh.

### Task 2: Policy tìm kiếm và mapper (unit, test trước)

- Files: `src/modules/organization/employee-directory/employee-directory-search.policy.ts` (+ spec: UUID thường và viết hoa ⟹
  khớp id; chuỗi ⟹ ba khóa đã chuẩn hóa; `q` là email hợp lệ ⟹ `normalizeEmail(q)` cho khóa email; gập dấu tiếng Việt gồm
  `Đđ`; escape `%`, `_`, `\`; `q` rỗng sau trim ⟹ không lọc),
  `employee-directory.types.ts` (`EMPLOYEE_PLACEMENT_HISTORY_LIMIT = 50`, record), `employee-directory.mapper.ts` (+ spec:
  `account: null` khi không tài khoản; ngày `YYYY-MM-DD`; `validTo` loại trừ giữ nguyên; summary không có `roles`; trường
  `department`, `unplaced` cùng tên với `EmployeeResponseDto`).
- Depends on: Task 1.
- Acceptance: unit xanh; không import Nest/Prisma trong policy/mapper.
- Verify: `pnpm test -- src/modules/organization/employee-directory` → xanh.

### Task 3: Repo, query service, controller và DTO

- Files: `employee-directory.repo.ts` (SQL list với bộ lọc — `unplaced` gọi **vị từ dùng chung** của
  `organization/employee/` do `qd93-unplaced-employee-first-placement` sở hữu, không viết `NOT EXISTS` riêng; `departmentId`
  theo `valid_from <= hôm nay AND (valid_to IS NULL OR valid_to > hôm nay)`; email qua `normalized_work_email`; câu trang rồi
  câu đếm trong một `RepeatableRead`; detail: nhân viên + phòng hiện hành, lịch sử placement `limit + 1`; hằng SQL gập dấu),
  `employee-directory-query.service.ts` (thứ tự cố định: `businessToday()`, hook `findEmployeeIdsWithAccount` khi có
  `hasAccount`, repo trang + đếm, rồi `summarizeAccounts` cho id của trang; detail: repo rồi `describeAccount`),
  `employee-directory.dto.ts` (query strict; param dùng lại `employeeIdParamSchema` của `organization/employee/employee.dto.ts:71`;
  `EmployeeSummaryDto`, `EmployeeDetailDto = summary.extend`, trang), `employee-directory.controller.ts`
  (`@ApiTags('employees')`, `@Controller({ path: 'employees', version: '1' })`, `@RequireRoles('SUPER_ADMIN')`,
  `employeeList`/`employeeGet`, summary ≤ 70 ký tự, message `EMPLOYEE.LISTED`/`EMPLOYEE.FETCHED`, lỗi 401/403/404/422/503 có ví
  dụ, mô tả 403 theo lời route đọc), `src/modules/organization/organization-http.module.ts`, test integration mới
  `test/integration/organization/employee-directory-http.integration-spec.ts` (mọi dòng AC-22, AC-24, AC-25 của test matrix;
  nhân viên _chưa xếp phòng_ tạo qua `POST /employees` không phòng, xếp phòng lần đầu qua `POST /employees/{id}/first-placements`
  — không dựng bằng SQL; ca `D-S25` so với `OrganizationReadApi.getUnplacedEmployeeIds`; `%`/`_` nghĩa đen; `valid_to` loại
  trừ; trang sau trang cuối; ngày bằng `test/support/pretend-today.ts`).
- Depends on: Task 2.
- Acceptance: test integration đỏ trước khi có route, xanh sau; thứ tự `employee_code, id`; 404 không lộ dữ liệu;
  `rg -n "NOT EXISTS" src/modules/organization/employee-directory` rỗng (vị từ dùng chung).
- Verify: `pnpm test:integration -- test/integration/organization/employee-directory-http.integration-spec.ts` → xanh.

### Task 4: Hợp đồng HTTP, OpenAPI, registry và đếm câu lệnh

- Files: `test/http/organization/employees.http-spec.ts` (403 cho FINANCE, IT_ADMIN, EMPLOYEE, không vai, MANAGER,
  SPENDING_APPROVER như các route organization khác; 401; 422 query sai: `page=0`, `pageSize=0`, `pageSize=101`, khóa lạ
  `sort=x`, `q` 101 ký tự, `departmentId=abc`, `workState=X`, `unplaced=yes`, id không UUID),
  `test/support/api-coverage-manifest.ts` (`GET /api/v1/employees`, `GET /api/v1/employees/{id}`),
  `test/support/openapi-example-manifest.ts` (`employeeList`, `employeeGet`), `test/support/openapi-example-route-codes-organization.ts`
  (`employeeGet` 404), `test/http/platform/openapi-read-wording.http-spec.ts` (`READ_WORDING` cho hai route — tùy chọn),
  `test/http/platform/openapi-presentation.http-spec.ts` (số trên `dev` lúc rebase + 2), `test/support/api-collection-registry-nested.ts`
  (hai mục `bounded`: `employeeGet#placements` `maxItems: 50`, `employeeGet#account.roles` `maxItems: 6` source
  `ROLE_GRANTS` — chuỗi phải nói sáu giá trị, xem spec), `test/support/api-collection-registry-events.ts` (`boundedNested` thêm
  tham số `date` mặc định `'2026-10-23'`; hai `boundedNested(…, 'added', <ngày thật>)`), thêm ca đếm câu lệnh vào
  `test/integration/organization/employee-directory-http.integration-spec.ts` (relay theo `organization-identity-read-contracts`;
  cửa sổ `dataStatements` từ câu đầu chạm `employee_placements`; list 3 câu có/không `hasAccount`, tổng có `hasAccount` = không
  có + 1; detail 3 câu, 404 1 câu; tổng bằng nhau trên 5/60 nhân viên và 1/40 placement; không câu list nào chạm
  `role_grants`, `employee_leaves`, `offboarding_cases`, `audit_events`; trang + đếm `oneSnapshot`).
- Depends on: Task 3.
- Acceptance: `api-inventory`, `openapi-response-examples`, `api-collection-contract` xanh; đếm câu lệnh đúng định nghĩa cửa
  sổ của spec.
- Verify: `pnpm openapi:export`; `pnpm test:http -- test/http/organization/employees.http-spec.ts test/http/platform` → xanh;
  `pnpm test:gates` → xanh; `pnpm arch:routes && pnpm arch:docs:check` → xanh;
  `pnpm test:integration -- test/integration/organization/employee-directory-http.integration-spec.ts` → xanh.

### Checkpoint

`pnpm check`, `pnpm test:http -- test/http/organization/employees.http-spec.ts test/http/platform`,
`pnpm test:integration -- test/integration/identity-access/employee-account-summaries.integration-spec.ts test/integration/organization/employee-directory-http.integration-spec.ts`
xanh; tự review theo AC-22, AC-24→AC-26 và API-LIST-DETAIL.1 (projection, biên, thứ tự, snapshot, cửa sổ đếm câu lệnh).

### Task 5: `employeeId` trong thành viên phòng (`API-GAP-04`)

- Files: `src/modules/organization/department/department.repo.ts` (`readMembers` chọn `e.id`), `department/department.types.ts`
  (`DepartmentMemberRecord.employeeId`), `department-management/department.dto.ts` (`memberPageSchema`), test ghim khóa:
  `test/integration/organization/organization-identity-read-contracts.integration-spec.ts` (dòng 147-154),
  `test/integration/organization/department-manager-http.integration-spec.ts` (tên sau `qd93-remove-department-projects`
  phase 1; ở `1a77ffe8` là `department-manager-and-projects-http.integration-spec.ts` dòng 135-142 — đọc lại số dòng trên
  `dev`), `test/integration/organization/department-contract-http.integration-spec.ts` (dòng 293-316).
- Depends on: Checkpoint.
- Acceptance: item có `employeeId` đúng; khóa khác giữ; số câu lệnh không đổi.
- Verify: `pnpm test:integration -- test/integration/organization/organization-identity-read-contracts.integration-spec.ts test/integration/organization/department-manager-http.integration-spec.ts test/integration/organization/department-contract-http.integration-spec.ts`
  → xanh; `pnpm openapi:export` diff chỉ thêm `employeeId`.

### Task 6: Bản đọc riêng của vai khác vẫn dùng được (`US-02-02` AC-26 vế sau)

- Files: không sửa — chạy lại theo file các test hiện có: `test/integration/organization/cost-centers-http.integration-spec.ts`
  (Finance theo Cost Center), `test/integration/organization/department-manager-http.integration-spec.ts` (trưởng phòng,
  IT Admin `technical-members`), `test/integration/identity-access/account-roles-http.integration-spec.ts` (`/me`).
- Depends on: Task 5.
- Acceptance: xanh, không sửa assertion.
- Verify: `pnpm test:integration -- test/integration/organization/cost-centers-http.integration-spec.ts test/integration/organization/department-manager-http.integration-spec.ts test/integration/identity-access/account-roles-http.integration-spec.ts`
  → xanh.

## Verification and handoff

Chạy từ gốc BE: `pnpm check`, `pnpm test:http` theo file, `pnpm openapi:export`, `pnpm test:gates`, integration theo file của
Checkpoint, Task 5 và Task 6 (database riêng). **Hỏi Owner** (`D-S26`) trước toàn bộ `pnpm test:integration` (hook
`EmployeeAccounts` đổi — bind dùng ở các luồng phòng ban ngoài danh sách).

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| chưa chạy          | —                     | —                 | thiết kế `draft`        |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; số câu lệnh thực đo (cửa sổ và tổng) ghi lại.
- [ ] Diff cuối đã tự review; module card `organization`, `identity-access` cập nhật; FE được báo hai route và `employeeId`.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
