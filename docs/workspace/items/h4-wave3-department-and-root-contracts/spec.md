# Spec: organization Wave 3 — capability `department`, Department Head và root contract (H4.6, H4.7)

- Phụ trách: AI theo giao việc Owner (Prompt 17, 19/10/2026).
- Thiết kế ban đầu bởi: Owner qua [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md),
  mục 4, 7, 9.2 và `E4 = A`; Owner chốt phương án A cho Wave 2 (facade ủy quyền capability service), Wave 3 dùng lại.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (không có Story/AC mới; nghiệp vụ hiện hành giữ nguyên), BE `e632dd6` (`dev` = `origin/dev`,
  Wave 2; trước đó H4.2 `0d2ac58`, H4.3a `e053664`, H4.1 `c4a8d5c`).
- Nhóm roadmap: enabler refactor của `organization` trước G3 — chỉ là planning container.
- [Kế hoạch](plan.md).

## Business outcome

Không đổi hành vi người dùng: route, operationId, quyền, request/response, mã/message/details lỗi, Audit Trail,
transaction, thứ tự và chế độ khóa của Department, Department Head và mọi capability trước giữ nguyên; `openapi.json`
byte-identical. Kết quả kỹ thuật: `department/` sở hữu toàn bộ Department và Department Head, mỗi bảng một repo ghi; root
`organization` chỉ còn module, HTTP module, facade, type và lỗi public (6 file, 0 controller); `organization.repo.ts` chỉ
còn Organization; `Page<T>` của `organization` dùng primitive trong `src/core`; ledger `organization` chỉ còn ngoại lệ E4.

## Primary Story/AC

| Story | AC                                                                                                                  | Coverage | Phần còn lại thuộc                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| —     | F-23 (Department), A4-08 (`departments`), A4-16 (`department.service.ts`), F-13 phần H4.7, F-26 phần `organization` | n/a      | F-26 ngoài `organization` (4 bản `*Page`); E4 xem lại ở G3; lát G3–G6 |

## Supporting references

- Audit H4.0: mục 4 (hotspot `department.*`, 7 dependency), 7 (gate), 9.2 (H4.6, H4.7), 12 (`E4 = A`);
  [reconciliation](../../../reviews/be-full-src-architecture-audit-2026-10-19/reconciliation.md) F-13, F-23, F-26, M-01 → M-03,
  M-22 → M-27.
- [Module structure](../../../rules/module-structure.md): bề mặt công khai `*.service.ts`/`*.types.ts`, folder dùng chung
  chỉ cho nội dung hai capability dùng, ledger chỉ co lại; [database rules](../../../rules/database-business.md).
- [Wave 2](../h4-wave2-organization-capabilities/spec.md) (phương án A), [H4.2](../h4-2-project-capability/spec.md),
  [H4.1](../h4-1-organization-root-cleanup/spec.md).
- `US-03-06`, `US-01-02`, `US-01-11`, `US-02-04`, `US-01-09` AC-3 chỉ để truy vết hành vi phải giữ.

## Explicit out of scope

- Đổi E4 (ba repo export) khi chưa có quyết định Owner mới; Nest submodule, barrel, facade mới.
- `Page`/`*Page` ngoài `organization`: `data-import` (`Page<T>`), `AuditEventPage`, `AccountPage`, `CatalogApplicationPage`.
- H5–H8, ROOT.1, hardening, BEH.1, G3–G10; migration, dependency, wire/business behavior, Docs nghiệp vụ, FE/Mobile/AI.

## Dependencies and blockers

Wave 2 (`e632dd6`) trên `dev`. Ràng buộc kế thừa: gate cấm root facade import repo của capability, `E4 = A` cấm export
repo mới, module graph cấm export ngoài allowlist — nên repo Department Head là provider riêng của `OrganizationModule` sau
capability service; use case HTTP với head đi qua method facade có nghĩa (phương án A). `OrganizationModule` không import
`IdentityAccessFacadeModule` (chiều ngược tạo vòng), nên use case đặt/bỏ trưởng phòng (kiểm vai `SUPER_ADMIN`, audit) ở
`OrganizationHttpModule`.

## Ownership: module, data, API

**Provider graph cuối.** `OrganizationModule` (import `DatabaseModule`): `OrganizationService`, `OrganizationRepo`,
`CostCenterRepo`, `CostCenterCatalogueService`, `DepartmentRepo`, `DepartmentHeadRepo`, `DepartmentDirectoryService`,
`ImportLookupRepo`, `EmployeeDirectoryService`, `EmployeeRepo`, `JobTitleCatalogueService`, `JobTitleRepo`; export
`OrganizationService` + E4 (`OrganizationRepo`, `CostCenterRepo`, `DepartmentRepo`). `OrganizationHttpModule`: controller
Job Titles, Employees, Cost Centers, Departments, Projects; provider `JobTitleService`, `EmployeeManualService`,
`CostCenterService`, `DepartmentQueryService`, `DepartmentService`, `DepartmentHeadService`, `ProjectService`,
`ProjectRepo`. Mỗi token khai đúng một lần; không export mới.

**Phụ thuộc** (không vòng): controller → `DepartmentQueryService` (repo, facade, `ProjectService`, identity — 4),
`DepartmentService` (repo, `CostCenterService`, facade, identity, audit, runner — 6), `DepartmentHeadService` (repo, facade,
identity, audit, runner — 5); facade → `DepartmentDirectoryService` → `DepartmentRepo`, `DepartmentHeadRepo`. Không file nào
của `department/` import repo/policy riêng của capability khác; `department/` dùng `cost-center.types`, `CostCenterService`,
`ProjectService`, `project.types` và `dto/`/`mappers/` dùng chung.

### H4.6 — `department/` và Department Head

| Hạng mục             | Trước (`e632dd6`)                                                                                                                                                                         | Sau                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File                 | root: `departments.controller.ts`, `department.service.ts` (508, 7 dependency), `department.repo.ts` (394), `department.types.ts`; `dto/department.dto.ts`; `errors/department.errors.ts` | `department/`: controller, `department.mapper.ts`, `department.dto.ts`, `department.errors.ts`, `department.types.ts`, `department-query.service.ts`, `department.service.ts`, `department-head.service.ts`, `department-lookups.ts`, `department-directory.service.ts`, `department.repo.ts`, `department-head.repo.ts` + 2 spec |
| Writer `departments` | `DepartmentRepo` + `OrganizationRepo.createDepartment` (hai nơi ghi, A4-08)                                                                                                               | chỉ `DepartmentRepo` (`createForInstallation` nhận nguyên văn, `lockByCode` nhận nguyên văn `lockDepartmentByCode`)                                                                                                                                                                                                               |
| Writer head periods  | `DepartmentRepo` (cùng repo với phòng)                                                                                                                                                    | chỉ `DepartmentHeadRepo` (SQL nguyên văn); facade đọc qua `DepartmentDirectoryService`                                                                                                                                                                                                                                            |
| Đếm nhân viên        | `DepartmentRepo.countEmployees` đọc bảng `employees`                                                                                                                                      | `EmployeeRepo.countActive` qua `EmployeeDirectoryService` (cùng câu Prisma)                                                                                                                                                                                                                                                       |
| Use case             | một `DepartmentService` đọc + ghi + head, trả profile                                                                                                                                     | đọc ở `DepartmentQueryService`; tạo/sửa/ngừng ở `DepartmentService`; đặt/bỏ trưởng phòng ở `DepartmentHeadService` (hai thao tác dùng lại được, M-25 → M-27); ghi trả id/void, controller trả profile sau ghi                                                                                                                     |
| Wire mapper          | `toWire`/`toProfileWire` trong controller                                                                                                                                                 | `department/department.mapper.ts`; `mappers/project.mapper.ts` giữ (hai capability dùng)                                                                                                                                                                                                                                          |
| Schema project       | `projectSchema` trong `project/project.dto.ts`, `dto/department.dto.ts` import nó                                                                                                         | `dto/project-wire.dto.ts` dùng chung (project + department), cặp với `mappers/project.mapper.ts`                                                                                                                                                                                                                                  |
| Finding              | F-23 (Department), A4-08, A4-16, oversized `department.*`                                                                                                                                 | khép; mọi file `department/` < 400 dòng                                                                                                                                                                                                                                                                                           |
| Ledger               | `oversizedFiles` `modules/organization/department.service.ts` 508                                                                                                                         | gỡ; không mục mới                                                                                                                                                                                                                                                                                                                 |
| Giới hạn             | —                                                                                                                                                                                         | `DepartmentRepo` vẫn đọc `employee_placements` (thành viên của phòng) và `department_head_periods` cho `activeDepartmentsWithoutHead` (đọc, không ghi)                                                                                                                                                                            |

**Method thêm vào facade** (gọi `DepartmentDirectoryService` với cùng `tx`, không logic riêng):

| Method                                       | Người gọi                                         | Ủy quyền tới                                                                                                         |
| -------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `getDepartmentHeads(ids, onDate)`            | `DepartmentQueryService` (list/profile)           | `DepartmentHeadRepo.currentHeads`                                                                                    |
| `getDepartmentHeadHistory(id, limit, tx?)`   | `DepartmentQueryService`, `DepartmentHeadService` | `DepartmentHeadRepo.headPeriods`                                                                                     |
| `endDepartmentHeadPeriodsFrom(tx, id, from)` | `DepartmentHeadService`                           | `DepartmentHeadRepo.makeRoomForHead`                                                                                 |
| `startDepartmentHeadPeriod(tx, input)`       | `DepartmentHeadService`                           | `DepartmentHeadRepo.insertHeadPeriod` + dịch `23P01`/check sang `HeadAssignmentError` (chuyển nguyên văn từ service) |

Method facade cũ giữ chữ ký, đổi nơi trả lời: `isDepartmentHead`, `getHeadedDepartment` (nay cũng là kiểm phạm vi đọc
của trưởng phòng), `departmentsWithoutHead`, `createDepartment`, `lockDepartmentForEntry`, phần phòng của
`getOnboardingFacts` → `DepartmentDirectoryService`.

### H4.7 — root contract, `Page<T>`, E4

| Hạng mục                | Trước                                                                                                     | Sau                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organization.repo.ts`  | Organization + `createDepartment`, `lockDepartmentByCode` (69 dòng)                                       | chỉ Organization (`findOrganization`, `createOrganization`)                                                                                         |
| `organization.types.ts` | 12 type                                                                                                   | giữ nguyên: cả 12 là type của chữ ký facade mà module khác dùng (identity-access, installation, data-import, onboarding) — inventory ở plan         |
| Lỗi root                | `errors/organization.errors.ts` (`OrganizationAlreadyExistsError`, chỉ root dùng) trong folder dùng chung | `organization.errors.ts` (lỗi facade `createOrganization` ném ra cho cài đặt); folder `errors/` không còn                                           |
| `Page<T>`               | 3 bản trong `organization` (`department.service`, `cost-center.service`, `JobTitlePage`)                  | `Page<T>` + `pageOf` trong `src/core/application/pagination.ts`; ba consumer dùng bản core; shape và key order giữ                                  |
| Facade                  | method có consumer, trừ `lockEmployeeForUpdate` (0 consumer production)                                   | giữ `lockEmployeeForUpdate`: primitive của giao thức khóa T-11 (`1c890a5`), đã ghim ở Wave 2 — không phải pass-through do move để lại; chờ G6/Owner |
| Root                    | 10 file, 1 controller                                                                                     | 6 file, 0 controller; `dto/` (1 file), `mappers/` (3 file) chỉ nội dung dùng chung                                                                  |
| E4                      | ba repo export, ledger 3 entry                                                                            | giữ đúng ba export và ba entry `LEGACY_PRIVATE_EXPORTS`; chỉ đính chính comment theo consumer thật                                                  |
| Finding                 | F-13 phần còn lại, F-26, `rootFiles`/`rootControllers`                                                    | F-13 khép phần `organization` (ba repo export là E4); F-26 khép phần `organization`; ledger root đã trống từ Wave 2                                 |

## Behavior and design

Hành vi phải giữ: list RepeatableRead page/count, sort `code, id`, tìm literal không phân biệt hoa thường; profile đủ
khóa; trang thành viên; `DEPARTMENT.IN_USE` ba khóa, tối đa 20 tên theo mã; tạo phòng khóa Cost Center `FOR SHARE` trước
phòng, rồi người; sửa/ngừng/đặt/bỏ trưởng phòng khóa phòng `FOR UPDATE`; đặt trưởng phòng khóa người `FOR SHARE`, kiểm vai
`SUPER_ADMIN`, kiểm thành viên, cắt/hủy giai đoạn rồi chèn, dịch `23P01`/check; nhập tay khóa phòng `FOR SHARE` theo mã;
không thay đổi thì không ghi audit; audit payload và thứ tự giữ.

**Gate:** gỡ `oversizedFiles` `department.service.ts`; `LEGACY` của `organization` trong architecture-structure trống;
`LEGACY_PRIVATE_EXPORTS` giữ ba entry E4. Không mục mới, không allowlist/cap/export mới. Path tổng hợp trong test A4-02 của
`architecture-boundaries.spec.ts` đổi theo vị trí thật (không đổi luật).

## Test matrix

| AC / rủi ro             | Tình huống                                                                                                                                               | Cấp test                       | Kết quả mong đợi              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------- |
| Wire, paging            | profile đủ khóa; list trang 2 + tìm mã/tên; trang thành viên                                                                                             | integration (characterization) | như cũ                        |
| Audit                   | `HEAD_ASSIGNED` (ended/cancelled), `HEAD_VACATED`, `DEACTIVATED` đúng payload và thứ tự                                                                  | integration (characterization) | như cũ                        |
| `IN_USE`, cảnh báo      | 21 thành viên ⟹ 20 tên theo mã; cảnh báo theo mã rồi loại                                                                                                | integration (characterization) | như cũ                        |
| Chế độ khóa             | nhập tay `FOR SHARE` phòng; sửa/ngừng/đặt trưởng phòng `FOR UPDATE` phòng; đặt trưởng phòng `FOR SHARE` người                                            | integration (characterization) | như cũ                        |
| Facade                  | `isDepartmentHead` (kết thúc, hiện tại, tương lai), `getHeadedDepartment`, phòng cài đặt, `lockDepartmentForEntry`, `departmentsWithoutHead`, onboarding | integration (characterization) | như cũ                        |
| `Page<T>`               | `pageOf` làm tròn lên, danh sách rỗng, key order                                                                                                         | unit                           | xanh                          |
| Hành vi sẵn có          | departments, organization, concurrency, cost-center, employee manual/import, onboarding, installation, job-titles, approval roles                        | integration, e2e, unit         | xanh                          |
| Boundary, ledger, graph | cạnh liên area, root count, kích thước, export, provider trùng                                                                                           | unit (architecture gates)      | xanh, ledger chỉ co lại       |
| Contract                | mọi route; OpenAPI                                                                                                                                       | e2e, export                    | `openapi.json` byte-identical |

## Definition of Done

- [x] Hạng mục refactor không có primary AC; characterization xanh trên code cũ và vẫn xanh sau sửa.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên cây cuối; e2e + OpenAPI vì chạm controller.
- [x] Spec/plan/roadmap/rule phản ánh implementation cuối; không đổi contract nên không có thông báo FE.
- [x] Commit/push: Owner commit/push `ac3eb92` lên `dev` 19/10/2026 (không PR).
- [ ] Owner review.

## Changes and acceptance

- 19/10/2026: tạo hạng mục, thiết kế `ready`; implement H4.6 + H4.7 và `verified` local (bằng chứng ở [plan](plan.md)).
  Owner commit/push `ac3eb92` lên `dev` cùng ngày (không PR); chưa Owner review, chưa nghiệm thu.
