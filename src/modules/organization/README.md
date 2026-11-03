# organization

Mục đích: dữ liệu tổ chức của một cài đặt — tổ chức, phòng ban và trưởng phòng, nhân viên và bố trí theo ngày, Cost
Center, dự án — và việc báo thay đổi tổ chức cho các module phía trên. Story chính: US-02-02 (nhập tay, sửa hồ sơ nhân
viên), US-03-06 (hồ sơ phòng ban, trưởng phòng, dự án), US-04-09 (danh mục Cost Center), US-01-11 (IT Admin phụ trách).
Các thao tác ghi tổ chức và hồ sơ của Super Admin không thu căn cứ HR (QĐ-93f): Audit Trail ghi người thực hiện, thời
điểm, trước/sau; sự kiện nhân sự (module `personnel`) vẫn có căn cứ.

Tầng: T2 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: audit, notifications; không import identity-access
(D5). Được dùng bởi: budgets, catalog, data-import, finance, identity-access, installation, licensing, onboarding,
operating-parameters, personnel, requests ([module-graph](../../../docs/generated/module-graph.md)).

## Public API (`public/`)

- Hai facade, cả hai gọi trong `tx` của bên gọi. Chọn theo việc cần làm: chỉ đọc (kể cả khóa `FOR SHARE` để giữ giá trị đã đọc
  ổn định) thì `OrganizationReadApi`; ghi, khóa `FOR UPDATE` hoặc hỏi "đang được dùng" thì `OrganizationApi`. Một lớp dùng cả hai
  thì inject cả hai, tên trường `organization` và `organizationReads`.
  - `OrganizationReadApi` ([public/organization-read.api.ts](public/organization-read.api.ts)), 37 phương thức đọc:
    - Chung: `businessToday` — hôm nay theo múi giờ của tổ chức; `getOrganization`, `getOrganizationShared` (`FOR SHARE`),
      `getCompanyEmailDomains`, `readLocalSeedFixture` (cho `dev:seed`), `countUnmarkedChangesAsOf` (cho `ops:inspect`).
    - Phòng ban: `getDepartmentBrief(s)`, `lockDepartmentShared`, `lockDepartmentForEntry`, `getDepartmentMemberIds`,
      `getDepartmentHeads`, `getHeadedDepartment`, `isDepartmentHead`, `departmentsWithoutHead`; IT Admin phụ trách:
      `getItAdminInCharge`, `getItAdminInChargeOfDepartment`, `getItAdminScope`, `getDepartmentIdsInChargeOf`.
    - Nhân viên: `getEmployee`, `getEmployeeByCode`, `getEmployeesByCodes`, `getEmployees`, `getEmployeePlacement`,
      `getEmployeeProfile`, `searchActiveEmployees`, `lockEmployeeForShare`, `isWorkEmailTaken`, `lookupForEmployeeImport`,
      `lockForEmployeeImport` (`FOR SHARE` trên phòng ban), `getProfileNotices`, `getOnboardingFacts`.
    - Cost Center: `getCostCentersByCodes`, `costCentersByIds`, `lockCostCentersShared`, `getOwningUnits`,
      `requireUnitCostCenter` (kiểm thuần, không chạm CSDL).
  - `OrganizationApi` ([public/organization.api.ts](public/organization.api.ts)), 10 phương thức ghi, khóa ghi và bộ đọc "đang dùng":
    - Ghi: `createOrganization`, `setReportingCurrency`, `createDepartment`, `createUnitCostCenter`,
      `createEmployeeWithPlacement` (cách duy nhất tạo nhân viên), `updateEmployeeOfficialFields`, `emitChange` (báo thay đổi).
      (`activateCostCenterDirectionForLocalSeed` — không còn người gọi từ khi `dev:seed` thôi ghi dòng kích hoạt — Owner cho xóa 31/10/2026.)
    - Khóa ghi: `lockEmployeeForUpdate` (`FOR UPDATE`).
    - Đang dùng: `getDepartmentUse`, `getCostCenterUse` (hỏi các extension point bên dưới).
- `OrganizationHistoryApi` ([public/organization-history.api.ts](public/organization-history.api.ts)): ghi lịch sử cho
  personnel và licensing (ADR-0017) — `lockDepartments`, `scheduleStructureChange`, `scheduleHeadHandover`, …
- `CostCenterDirectionApi` (`public/cost-center-direction.api.ts`): `activate`, `link` — chỉ lệnh
  `pnpm ops:cost-center-direction`, qua `cost-center-direction/cost-center-direction-cli.module.ts`.
- `public/employee-placement.policy.ts` — phòng ban có nhận người không; dùng chung cho form tay, import, chuyển phòng.
- Type/lỗi: `organization.types.ts`, `organization-use.types.ts`, `organization.errors.ts`, `cost-center-direction.*`.
- Export cho `OrganizationHttpModule` cùng thư mục (R10: chỉ consumer cùng thư mục được inject, không qua facade): các service của
  capability `OrganizationContextService`, `DepartmentRecordService`, `DepartmentUseService`, `EmployeeRecordService`,
  `OrganizationChangeService`, và ba repo theo ngoại lệ Owner E4 (`CostCenterRepo`, `DepartmentRepo`; `OrganizationRepo` hiện không
  còn consumer nào, chỉ giữ export theo E4).

## Bảng sở hữu

- `organizations`, `departments`, `department_head_periods`, `employees`, `employee_placements`, `cost_centers`,
  `cost_center_department_links`, `cost_center_direction_activations`,
  `organization_change_announcements` ([prisma/models/organization.prisma](../../../prisma/models/organization.prisma)).

## Extension point

- Mở ([public/organization.extension-points.ts](public/organization.extension-points.ts)), bên đăng ký `*.listener.ts`:
  - `OrganizationChangeListeners` (`organization.change-listeners`) — organization `department/held-notice-handover`;
    budgets `proposal/budget-head-change`; personnel `transfer/transfer-effective`,
    `transfer-review/transfer-review`; requests `reassignment/organization-change`.
  - `DepartmentUseContributions` (`organization.department-use-readers`) — catalog
    `subscription/subscription-department-use`; licensing `provisioning/department-use/department-open-work`; personnel
    `event-notice/department-open-work`; requests `access-request/open-request/department-open-requests`.
  - `CostCenterUseContributions` (`organization.cost-center-use-readers`) — budgets
    `commitment/budget-cost-center-use`; requests `access-request/open-request/cost-center-open-requests`.
  - `DepartmentServiceAccountReaderHook` (`organization.department-service-account-reader`) — licensing
    `assignment/assignment-service-account`; chỉ `department-management/department.service.ts` đọc (ngừng phòng ban, API), không qua facade.
  - `EmployeeAccountsHook` (`organization.employee-accounts`) — identity-access `accounts/employee-accounts`.
- Đăng ký vào: chỉ point của chính module (`department/held-notice-handover.listener.ts`).

## Hướng phụ thuộc giữa capability (R6)

Không vòng (`pnpm arch:capabilities --module organization`, gate `capability-graph`, kể cả đường đi qua facade và file gốc). Từ thấp lên cao:
`change-announcement`, `cost-center-direction`, `project` → `department` → `cost-center`, `employee` → `department-management`.
Các capability gọi service của nhau, **không** gọi facade của chính module (`public/organization.api.ts` là cửa cho module khác;
gate `module-layout`): `department-management/` và `employee/` đọc ngày và bản ghi tổ chức qua `organization-context.service.ts` (gốc), đọc
phòng ban qua `DepartmentRecordService`, nhân viên qua `EmployeeRecordService`, báo thay đổi qua `OrganizationChangeService`. Các
service đó được `OrganizationModule` xuất cho `OrganizationHttpModule` cùng thư mục (mục hợp đồng trong gate `module-graph`).

Tại sao có `department-management/`: một trưởng phòng là một nhân viên (`department-head.service`, `department.service` kiểm tra nhân
viên qua `EmployeeRecordService`), còn một nhân viên được xếp vào phòng ban (`employee-manual.service` khóa phòng ban để nhập,
`employee-record.service` tìm trưởng để báo). Hai chiều ấy nằm trong một capability thì thành vòng, nên phần nền của phòng ban (thư
mục, repo, use reader, kiểu, lỗi, policy) ở `department/` ở dưới `employee/`, còn use case ghi và đọc phòng ban và trưởng phòng ở trên.

Từ vựng trạng thái nhân viên (`EmployeeStatus`, `EmployeeWorkState`, `EmploymentType`) và của cấu trúc (`CostCenterKind`,
`CostCenterStatus`, `DepartmentStatus`, `HeadPeriodRecord`) là của cả module nên nằm ở gốc, `organization-employee.types.ts` và
`organization-structure.types.ts` (`public/organization.types.ts` dùng lại cho module khác), không ở capability.

## Capability → file chính

- `employee/` — `POST /employees` (`employees.controller.ts` → `employee-manual.service.ts`), `PATCH /employees/{id}`
  (`employee-maintenance.controller.ts` → `employee-maintenance.service.ts`); `employee.policy.ts`, `employee-correction.policy.ts`
  (hàm thuần: đổi gì, từ chối gì khi sửa trường chính thức), `employee.repo.ts`, `employee.http-errors.ts`.
- `department/` — phần nền: `department-record.service.ts` (thư mục, kỳ trưởng phòng), `department-use.service.ts`,
  `department.repo.ts`, `department-head.repo.ts`, `department.policy.ts`, `department.errors.ts`, `held-notice-handover.listener.ts`.
- `department-management/` — use case của phòng ban và trưởng phòng: `departments.controller.ts` (`/departments*`,
  `/department-warnings`) → `department.service.ts`, `department-query.service.ts`; `department-heads.controller.ts` (trưởng, khuyết,
  kế nhiệm) → `department-head.service.ts`; `department.dto.ts`, `department.mapper.ts`, `department.http-errors.ts`.
- `cost-center/` — `cost-centers.controller.ts` (`/cost-centers*`) → `cost-center.service.ts`, `cost-center.policy.ts`,
  `cost-center.http-errors.ts`.
- `change-announcement/` — `organization-change.service.ts` (phát thay đổi), `organization-change.job.ts` (sweeper mỗi
  giờ, chỉ trong graph API). `cost-center-direction/` — repo, policy và Nest module của lệnh (`cost-center-direction-cli.module.ts`).
- Gốc module (dùng chung nhiều capability): `organization-audit-event.mapper.ts`, `organization-context.service.ts`,
  `organization.http-errors.ts` (phần mọi route gặp: ApiException, nhân viên không có, database không trả lời; mỗi capability có
  `<capability>.http-errors.ts` trả lời lỗi của mình rồi gọi lại file này), `organization-local-seed-fixture.mapper.ts` (cho `public/`),
  `organization-employee.types.ts`, `organization-structure.types.ts`, `organization.repo.ts`.
- Nest: `organization.module.ts` (facade, mọi graph), `organization-http.module.ts` (controller + sweeper, chỉ API).

## Bất biến quan trọng

- Bố trí của một người không chồng ngày: `employee_placements_no_overlap` (EXCLUDE gist).
- INV-19: mỗi ngày một phòng có tối đa một trưởng, một người là trưởng tối đa một phòng (EXCLUDE trên
  `department_head_periods`); INV-20: trưởng thuộc phòng suốt kỳ (trigger `department_head_requires_membership`).
- Thứ tự khóa: các phòng theo id, rồi nhân viên (`OrganizationHistoryApi.lockDepartments`).
- Mỗi thay đổi báo đúng một lần (`@@unique([kind, subjectId])` của `organization_change_announcements`); listener ném
  lỗi thì thay đổi rollback theo.
- Không xóa phòng ban, Cost Center, chỉ ngừng; ngừng phòng bị từ chối khi còn thành viên, service account, việc mở hoặc
  subscription (`DepartmentInUseError`); nhóm "đang dùng" không có reader nào → `UseReaderMissingError`.

## Test

- Unit: `src/modules/organization/**/*.spec.ts`; HTTP: `test/http/organization/`; integration:
  `test/integration/organization/`.

Head and successor assignments require a direct `MANAGER` grant and reject `SPENDING_APPROVER`; the account check is made through the identity extension point.

QĐ-93h retires the project routes and department profile fields, and phase 2 drops the tables `projects` and `project_departments` (the migration stops with `P0001` while a row remains). The way back is the previous image, see `docs/guides/containers.md`.
