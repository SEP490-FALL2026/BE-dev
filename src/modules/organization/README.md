# organization

Mục đích: dữ liệu tổ chức của một cài đặt — tổ chức, phòng ban và trưởng phòng, nhân viên và bố trí theo ngày, Cost
Center, dự án — và việc báo thay đổi tổ chức cho các module phía trên. Story chính: US-02-02 (nhập tay, sửa hồ sơ nhân
viên), US-03-06 (hồ sơ phòng ban, trưởng phòng, dự án), US-04-09 (danh mục Cost Center), US-01-11 (IT Admin phụ trách).

Tầng: T2 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: audit, notifications; không import identity-access
(D5). Được dùng bởi: budgets, catalog, data-import, finance, identity-access, installation, licensing, onboarding,
operating-parameters, personnel, requests ([module-graph](../../../docs/generated/module-graph.md)).

## Public API (`public/`)

- `OrganizationApi` ([public/organization.api.ts](public/organization.api.ts)), gọi trong `tx` của bên gọi:
  - `businessToday` — hôm nay theo múi giờ của tổ chức; `getOrganization`, `getOrganizationShared` (`FOR SHARE`).
  - Phòng ban: `getDepartmentBrief(s)`, `lockDepartmentShared`, `getDepartmentMemberIds`, `getDepartmentHeads`,
    `isDepartmentHead`; IT Admin phụ trách: `getItAdminInCharge`, `getItAdminScope`.
  - Nhân viên: `createEmployeeWithPlacement` (cách duy nhất tạo nhân viên), `getEmployee(s)`, `getEmployeePlacement`,
    `searchActiveEmployees`, `lockEmployeeForShare`/`ForUpdate`, `lookupForEmployeeImport` (cho import).
  - Cost Center: `createUnitCostCenter`, `costCentersByIds`, `lockCostCentersShared`, `getOwningUnits`,
    `requireUnitCostCenter`.
  - Đang dùng: `getDepartmentUse`, `getCostCenterUse`, `getOwnedServiceAccounts` (hỏi các extension point bên dưới).
  - `emitChange` (báo thay đổi), `getProfileNotices`, `getOnboardingFacts`.
- `OrganizationHistoryApi` ([public/organization-history.api.ts](public/organization-history.api.ts)): ghi lịch sử cho
  personnel và licensing (ADR-0017) — `lockDepartments`, `scheduleStructureChange`, `scheduleHeadHandover`, …
- `CostCenterDirectionApi` (`public/cost-center-direction.api.ts`): `activate`, `link` — chỉ lệnh
  `pnpm ops:cost-center-direction`, qua `cost-center-direction/cost-center-direction.module.ts`.
- `public/employee-placement.policy.ts` — phòng ban có nhận người không; dùng chung cho form tay, import, chuyển phòng.
- Type/lỗi: `organization.types.ts`, `organization-use.types.ts`, `organization.errors.ts`, `cost-center-direction.*`.
- Ngoại lệ cũ (quyết định E4): `OrganizationModule` còn export `OrganizationRepo`, `CostCenterRepo`, `DepartmentRepo`.

## Bảng sở hữu

- `organizations`, `departments`, `department_head_periods`, `employees`, `employee_placements`, `cost_centers`,
  `cost_center_department_links`, `cost_center_direction_activations`, `projects`, `project_departments`,
  `organization_change_announcements` ([prisma/models/organization.prisma](../../../prisma/models/organization.prisma)).

## Extension point

- Mở ([public/organization.extension-points.ts](public/organization.extension-points.ts)), bên đăng ký `*.listener.ts`:
  - `OrganizationChangeListeners` (`organization.change-listeners`) — organization `department/held-notice-handover`;
    budgets `budget/proposal/budget-head-change`; personnel `transfer/transfer-effective`,
    `transfer-review/transfer-review`; requests `reassignment/organization-change`.
  - `DepartmentUseContributions` (`organization.department-use-readers`) — catalog
    `subscription/subscription-department-use`; licensing `provisioning/department-use/department-open-work`; personnel
    `event-notice/department-open-work`; requests `access-request/open-request/department-open-requests`.
  - `CostCenterUseContributions` (`organization.cost-center-use-readers`) — budgets
    `budget/commitment/budget-cost-center-use`; requests `access-request/open-request/cost-center-open-requests`.
  - `DepartmentServiceAccountReaderHook` (`organization.department-service-account-reader`) — licensing
    `assignment/assignment-service-account`.
  - `EmployeeAccountsHook` (`organization.employee-accounts`) — identity-access `accounts/employee-accounts`.
- Đăng ký vào: chỉ point của chính module (`department/held-notice-handover.listener.ts`).

## Capability → file chính

- `employee/` — `POST /employees` (`employees.controller.ts` → `employee-manual.service.ts`), `PATCH /employees/{id}`
  (`employee-maintenance.controller.ts` → `employee-maintenance.service.ts`); `employee.policy.ts`, `employee.repo.ts`.
- `department/` — `departments.controller.ts` (`/departments*`, `/department-warnings`) → `department.service.ts`,
  `department-query.service.ts`; `department-heads.controller.ts` (trưởng, khuyết, kế nhiệm) →
  `department-head.service.ts`; `department-use.service.ts`, `department.policy.ts`.
- `cost-center/` — `cost-centers.controller.ts` (`/cost-centers*`) → `cost-center.service.ts`, `cost-center.policy.ts`.
- `project/` — `projects.controller.ts` (`/projects*`) → `project.service.ts`.
- `change-announcement/` — `organization-change.service.ts` (phát thay đổi), `organization-change.job.ts` (sweeper mỗi
  giờ, chỉ trong graph API). `cost-center-direction/` — repo, policy của lệnh. `mappers/` — HTTP errors, audit event.
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
