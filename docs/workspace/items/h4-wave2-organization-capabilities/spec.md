# Spec: organization Wave 2 — capability `job-title`, `employee`, `cost-center` (H4.3b, H4.4, H4.5)

- Phụ trách: AI theo giao việc Owner (Prompt 16, 19/10/2026).
- Thiết kế ban đầu bởi: Owner qua [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md),
  mục 4, 7, 9.2, 9.7 và `E4 = A`; Owner làm rõ Prompt 16 trong phiên (xem _Dependencies and blockers_).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (không có Story/AC mới; nghiệp vụ hiện hành giữ nguyên), BE `0d2ac58` (`dev`, H4.2; trước đó
  H4.3a + 14B `e053664`, H4.1 `c4a8d5c`).
- Nhóm roadmap: enabler refactor của `organization` trước G3 — chỉ là planning container.
- [Kế hoạch](plan.md).

## Business outcome

Không đổi hành vi người dùng: route, wire, mã/message/details lỗi, quyền, Audit Trail, transaction, thứ tự và chế độ khóa
của Job Title, Employee, Cost Center giữ nguyên; `openapi.json` byte-identical. `F-23` (phần Job Title, Employee, Cost
Center) và `A4-08` cho `job_titles`, `cost_centers` khép: mỗi capability một folder, mỗi bảng một repo ghi, root
`organization` còn 10 file, 1 controller, và hai mục ledger kích thước root được gỡ.

## Primary Story/AC

| Story | AC                                                                                   | Coverage | Phần còn lại thuộc      |
| ----- | ------------------------------------------------------------------------------------ | -------- | ----------------------- |
| —     | F-23 (Job Title, Employee, Cost Center), A4-08 (`job_titles`, `cost_centers`), A4-23 | n/a      | Wave 3: H4.6, H4.7 (E4) |

## Supporting references

- Audit H4.0: mục 4 (hotspot), 7 (gate), 9.2 (H4.3b, H4.4, H4.5), 9.7, 12 (`E4 = A`);
  [reconciliation](../../../reviews/be-full-src-architecture-audit-2026-10-19/reconciliation.md) `F-23`.
- [Module structure](../../../rules/module-structure.md): bề mặt công khai `*.service.ts`/`*.types.ts`, root không public
  mặc định, ledger chỉ co lại.
- [H4.1](../h4-1-organization-root-cleanup/spec.md), [H4.3a](../h4-3a-core-display-name/spec.md),
  [H4.2](../h4-2-project-capability/spec.md).
- `US-02-07` (danh mục chức vụ), `US-02-02` AC-14/15 (nhập tay), `US-02-01`/`US-02-02` (import), `US-04-09` (Cost Center),
  `US-03-06` (phòng) chỉ để truy vết hành vi phải giữ.

## Explicit out of scope

- Wave 3: H4.6 (`department/`, `createDepartment`, `lockDepartmentByCode`), H4.7 (`organization.repo.ts` chỉ Organization,
  quyết export E4); H5–H8, ROOT.1, hardening, BEH.1, G3–G10.
- Đổi export E4 (`OrganizationRepo` không còn consumer HTTP nhưng vẫn export tới H4.7), Nest submodule, barrel, DTO gate.
- Migration, dependency, wire/business behavior, Docs nghiệp vụ, FE/Mobile/AI Module.

## Dependencies and blockers

H4.2 (`0d2ac58`) trên `dev`. **Owner làm rõ Prompt 16 (19/10/2026, phương án A):** gate cấm file root (facade
`OrganizationService`) import repo của capability, và `E4 = A` cấm export repo mới cho `OrganizationHttpModule`; vì vậy repo
Job Title, Employee giữ là provider riêng của `OrganizationModule` sau một capability service có trách nhiệm rõ, facade ủy
quyền cho service đó, use case HTTP gọi facade bằng method có nghĩa; cùng transaction đi qua chuỗi, thứ tự khóa giữ, không
gọi vòng, không nhân bản rule, không API repo chung trên facade; không thêm ledger, không nới gate.

## Ownership: module, data, API

**Provider graph cuối.** `OrganizationModule` (import `DatabaseModule`): `OrganizationService`, `OrganizationRepo`,
`DepartmentRepo`, `CostCenterRepo`, `CostCenterCatalogueService`, `JobTitleRepo`, `JobTitleCatalogueService`, `EmployeeRepo`,
`ImportLookupRepo`, `EmployeeDirectoryService`; export `OrganizationService` + E4 (`OrganizationRepo`, `CostCenterRepo`,
`DepartmentRepo`). `OrganizationHttpModule`: controller Job Titles, Employees, Cost Centers, Departments, Projects; provider
`JobTitleService`, `EmployeeManualService`, `CostCenterService`, `DepartmentService`, `ProjectService`, `ProjectRepo`. Mỗi
token khai đúng một lần; không export mới.

| Phase     | Trước (`0d2ac58`)                                                                                                                                                                                                                               | Sau                                                                                                                                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — H4.3b | controller, service, `dto/job-title.dto.ts`, `job-title-name.ts` ở root; lỗi trong `errors/organization.errors.ts`; type trong `organization.types.ts`; 7 method + select trong `OrganizationRepo`; `JobTitleService` inject `OrganizationRepo` | `job-title/`: controller, service, dto, errors, types, name policy + spec, `job-title.repo.ts` (nguyên văn, gồm `createJobTitle` cài đặt), `job-title-catalogue.service.ts`; `JobTitleService` chỉ qua facade                                                                                     |
| B — H4.4  | controller, manual service, `import-lookup.repo.ts`, validator + spec, `dto/employee.dto.ts` ở root; 10 method Employee + `escapeLikePattern` trong `OrganizationRepo`; `EmployeeCodeTaken/EmailTaken` khai trong `errors/` và re-export ở root | `employee/`: controller, manual service, dto, `employee.errors.ts` (`EmployeeRowInvalidError`), validator + spec, `import-lookup.repo.ts`, `employee.repo.ts` (nguyên văn), `employee-directory.service.ts`; hai lỗi “taken” khai thật ở root `organization.errors.ts` (consumer: data-import)    |
| C — H4.5  | 7 file Cost Center ở root/`dto`/`errors`; `createCostCenter` cài đặt trong `OrganizationRepo` (hai nơi ghi); `DepartmentService` inject `CostCenterRepo`                                                                                        | `cost-center/`: controller, service, repo (nhận `createCostCenter` nguyên văn — không dùng lại `insert`), types (+ hằng định dạng mã dùng chung với mã phòng), errors, dto, name policy + spec, `cost-center-catalogue.service.ts`; `DepartmentService` gọi `CostCenterService.lockForDepartment` |

Không có `employee.types.ts`: mọi type Employee hoặc là contract facade mà module khác import (phải ở root
`organization.types.ts`), hoặc chỉ của use case nhập tay. `OrganizationRepo` còn Organization (`findOrganization`,
`createOrganization`) và phần Department chờ Wave 3 (`createDepartment`, `lockDepartmentByCode`).

**Method thêm vào facade `OrganizationService`** (mỗi method gọi capability service với cùng `tx`, không logic riêng):

| Method                                                                   | Người gọi               | Ủy quyền tới                                     |
| ------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------ |
| `listJobTitles`, `insertJobTitle`, `renameJobTitle`, `setJobTitleStatus` | `JobTitleService`       | `JobTitleCatalogueService`                       |
| `lockJobTitleForUpdate`, `findJobTitleByNormalizedName`                  | `JobTitleService`       | `JobTitleCatalogueService` (`lock` `UPDATE`)     |
| `lockJobTitleForShare`                                                   | `EmployeeManualService` | `JobTitleCatalogueService` (`lock` `SHARE`)      |
| `employeeRecordingInstant`, `isEmployeeCodeTaken`, `isWorkEmailTaken`    | `EmployeeManualService` | `EmployeeDirectoryService`                       |
| `lockDepartmentForEntry`                                                 | `EmployeeManualService` | `OrganizationRepo.lockDepartmentByCode` (Wave 3) |

Method facade cũ giữ chữ ký, đổi nơi trả lời: `createJobTitle` → `JobTitleCatalogueService`; `createEmployeeWithPlacement`,
`lockEmployeeForShare/ForUpdate`, `getEmployee*`, `searchActiveEmployees`, `getEmployeeProfile`, `lookupForEmployeeImport`,
`lockForEmployeeImport` → `EmployeeDirectoryService`; `createUnitCostCenter`, đếm Cost Center trống của
`getOnboardingFacts` → `CostCenterCatalogueService`. `CostCenterService` thêm `lockForDepartment` (`FOR SHARE`).

## Behavior and design

Hành vi phải giữ: chuẩn hóa T-12, tìm literal, snapshot RepeatableRead, version, conflict 409 nêu bản trùng; nhập tay —
khóa phòng `FOR SHARE` → chức vụ `FOR SHARE` → kiểm mã/email → ghi employee + placement đầu trong một transaction, dịch
lỗi unique, `memberSince` theo đồng hồ transaction; import — khóa phòng rồi chức vụ `FOR SHARE` theo id; Cost Center —
tên/mã/kind, lock `UPDATE` khi đổi, khóa phòng khi ngừng, `IN_USE` ba key, `createCostCenter` cài đặt không dịch lỗi
trùng; tạo phòng khóa Cost Center `FOR SHARE` trước phòng.

**Gate:** `rootControllers.organization` (4) và `rootFiles.organization` (22) gỡ vì root còn 1 controller, 10 file (≤ ngưỡng
mặc định); không mục mới, không allowlist/export mới; cap `department.service.ts` 508 giữ (file không đổi số dòng).

## Test matrix

| AC / rủi ro                | Tình huống                                                                                                                                               | Cấp test                       | Kết quả mong đợi                             | Bằng chứng sau implement |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------- | ------------------------ |
| Chế độ khóa                | nhập tay đi qua `FOR SHARE` chức vụ, đổi tên chờ; tạo phòng đi qua `FOR SHARE` Cost Center, chờ `FOR UPDATE`; import `FOR SHARE`; khóa employee hai mode | integration (characterization) | như cũ                                       | [plan](plan.md)          |
| Audit payload              | `EMPLOYEE.CREATED` đủ khóa; `JOB_TITLE.REACTIVATED`, `COST_CENTER.DEACTIVATED` before/after                                                              | integration (characterization) | như cũ                                       | [plan](plan.md)          |
| Facade                     | `EmployeeNotFoundError` cả hai mode; `getEmployees` rỗng/không biết; Cost Center cài đặt là UNIT; đếm trống bỏ COMPANY/INACTIVE                          | integration (characterization) | như cũ                                       | [plan](plan.md)          |
| Hành vi sẵn có             | job-titles, employee manual/import/onboarding, cost-centers, departments, organization, concurrency, installation                                        | integration, e2e, unit         | xanh                                         | [plan](plan.md)          |
| Boundary, ledger, provider | cạnh liên area, root count, export, provider trùng                                                                                                       | unit (architecture gates)      | xanh, ledger chỉ co lại                      | [plan](plan.md)          |
| Contract                   | mọi route; OpenAPI                                                                                                                                       | e2e, export                    | `openapi.json` byte-identical, inventory giữ | [plan](plan.md)          |

## Definition of Done

- [x] Hạng mục refactor không có primary AC; characterization xanh trên code cũ và vẫn xanh sau sửa.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên cây cuối; e2e + OpenAPI vì chạm controller.
- [x] Spec/plan/roadmap/rule phản ánh implementation cuối; không đổi contract nên không có thông báo FE.
- [x] Legacy ledger chỉ co lại; không mục, allowlist hay export mới.
- [x] Phần chưa kiểm chứng ghi rõ ở plan.

## Changes and acceptance

- 19/10/2026: tạo hạng mục, thiết kế `ready`; Owner làm rõ Prompt 16 (phương án A) trong phiên; implement ba phase và
  `verified` local (bằng chứng ở [plan](plan.md)). Owner commit/push `e632dd6` lên `dev` cùng ngày (không PR); chưa
  Owner review, chưa nghiệm thu.
