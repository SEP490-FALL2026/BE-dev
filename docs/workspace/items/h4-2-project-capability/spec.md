# Spec: H4.2 — tách capability `project` khỏi root `organization`

- Phụ trách: AI theo giao việc Owner (Prompt 15, 19/10/2026).
- Thiết kế ban đầu bởi: Owner qua [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md),
  mục 4, 7, 9.2 (lát H4.2) và `E4 = A` ở mục 12; vị trí HTTP error mapper do Owner chốt trong phiên (xem dưới).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (không có Story/AC mới; nghiệp vụ hiện hành giữ nguyên), BE `e053664` (`dev`, H4.3a + metadata
  14B, cha `c4a8d5c` H4.1).
- Nhóm roadmap: enabler refactor của `organization` trước G3 — chỉ là planning container.
- [Kế hoạch](plan.md).

## Business outcome

Không đổi hành vi người dùng: `/v1/projects` (list/filter, create, update), Project trên hồ sơ phòng, mã/message lỗi,
quyền, Audit Trail và OpenAPI giữ nguyên. Phần Project của `F-23` khép: Project có capability folder riêng, persistence
riêng (`ProjectRepo`), `DepartmentService` đọc Project qua `ProjectService`, và root `organization` giảm một controller,
bốn file. Kiểm bằng characterization chạy trên code cũ rồi code mới, ba architecture gate và `openapi.json`
byte-identical.

## Primary Story/AC

| Story | AC                  | Coverage | Phần còn lại thuộc                     |
| ----- | ------------------- | -------- | -------------------------------------- |
| —     | F-23 (phần Project) | n/a      | Wave 2: H4.3b + H4.4 + H4.5; H4.6–H4.7 |

## Supporting references

- Audit H4.0: mục 4 (hotspot `organization`), 7 (gate), 9.2 (lát H4.2), 9.7, 12 (`E4 = A`);
  [reconciliation](../../../reviews/be-full-src-architecture-audit-2026-10-19/reconciliation.md) `F-23`.
- [Module structure](../../../rules/module-structure.md): capability folder, folder dùng chung `dto/`, `errors/`,
  `mappers/`, bề mặt công khai `*.service.ts`/`*.types.ts`, ledger chỉ co lại.
- [H4.1](../h4-1-organization-root-cleanup/spec.md) (mapper project dùng chung, characterization error mapper) và
  [H4.3a](../h4-3a-core-display-name/spec.md) (`ProjectService` dùng `core/normalizeDisplayName`).
- `US-03-06` AC-14 (Project trên hồ sơ phòng), AC-17, AC-19 chỉ để truy vết hành vi phải giữ; không có AC mới.

## Explicit out of scope

- Wave 2 (H4.3b `job-title/`, H4.4 `employee/`, H4.5 `cost-center/`), H4.6 `department/`, H4.7 (`E4`); H5–H8, ROOT.1,
  hardening, G3–G10.
- Quyết định DTO gate toàn repo, shared `Page<T>`, Nest submodule/facade/barrel mới, đổi public-surface rule.
- Tách `DepartmentService` thêm (vẫn 7 dependency — tín hiệu review, xem dưới) hay đổi quan hệ `projects`/`departments`.
- Đổi business behavior, Docs nghiệp vụ, FE/Mobile, Prisma schema/migration, package/config, ADR.

## Dependencies and blockers

H4.3a (`e053664`) trên `dev`. Không blocker. Một sai lệch với prompt được Owner chốt trong phiên: HTTP error mapper
không vào `errors/` vì gate coi mọi tệp trong `errors/` là tệp lỗi nghiệp vụ và cấm `ApiException`/`HttpStatus` ở đó;
mapper vào `mappers/` (folder dùng chung), giữ nguyên mọi mapping, không đổi gate, không thêm ledger.

## Ownership: module, data, API

| Thành phần                | Trước (`e053664`)                                                                 | Sau                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Controller                | `organization/projects.controller.ts` (root)                                      | `project/projects.controller.ts` (tên lớp, route, operationId giữ)                                                          |
| Service                   | `organization/project.service.ts`, inject `DepartmentRepo`                        | `project/project.service.ts`, inject `ProjectRepo`                                                                          |
| Repo                      | 6 method + `toProject` trong `DepartmentRepo`                                     | `project/project.repo.ts` — chép nguyên văn (insert, lock `FOR UPDATE`, find, update, list, kiểm department id, mapper row) |
| Types                     | `ProjectStatus`, `ProjectRecord` trong `department.types.ts`                      | `project/project.types.ts`                                                                                                  |
| Errors                    | `ProjectNotFoundError`, `ProjectInvalidError` trong `errors/department.errors.ts` | `project/project.errors.ts` (class, message giữ)                                                                            |
| DTO/schema                | Project schema + 6 DTO trong `dto/department.dto.ts`                              | `project/project.dto.ts`; `projectSchema` một định nghĩa, export cho `dto/department.dto.ts` nhúng vào hồ sơ phòng          |
| Mapper wire               | `mappers/project.mapper.ts` (2 consumer)                                          | giữ ở `mappers/`, chỉ đổi import type                                                                                       |
| Audit event factory       | `organization/organization-audit.ts` (root, private)                              | `mappers/audit-event.mapper.ts` (5 consumer: project, department, cost-center, job-title, employee-manual)                  |
| HTTP error mapper + spec  | `organization/organization.http-errors.ts` (root, private)                        | `mappers/organization.http-errors.ts` + spec (5 controller consumer)                                                        |
| View types của Department | `DepartmentView`, `DepartmentProfileView` trong `department.service.ts`           | `department.types.ts`; `projects: ProjectRecord[]` (type công khai)                                                         |
| DI                        | `ProjectService` trong `OrganizationHttpModule`                                   | `ProjectService` + `ProjectRepo` đăng ký đúng một lần ở đó; không export, không Nest submodule                              |

`ProjectRepo` sở hữu query `projects`/`project_departments` và đọc `departments` chỉ để kiểm id đầu vào trong cùng
transaction. Không bảng, migration, route hay operation HTTP nào thêm/đổi.

**Vì sao mapper và hai adapter ở `mappers/`:** `toProjectWire` có hai consumer (Projects và Departments controller);
`organizationAuditEvent` và `toOrganizationApiException` được nhiều capability dùng. Folder dùng chung là nơi duy nhất
mọi capability và root cùng import được mà không tạo cạnh private, không mở public-surface rule và không thêm ledger.

**Vì sao view types chuyển sang `department.types.ts`:** `department.service.ts` đang ở cap oversized 519; inject
`ProjectService` và import thêm đẩy file lên 521. Hai interface thuần type (không logic) chuyển sang file type công khai
của root; `departments.controller.ts` import chúng từ đó. File còn 508 dòng, cap hạ về 508.

## Behavior and design

Hành vi phải giữ: list (mọi project theo `name`, `id`; filter `departmentId`), create (chuẩn hóa tên bằng core,
description NFC + trim, rỗng ⟹ `null`, mặc định `RUNNING`, bỏ trùng department id, kiểm department trong transaction,
Audit Trail `PROJECT.CREATED`), update (khóa `FOR UPDATE` trong transaction trước mọi kiểm/ghi, chỉ ghi và audit trường
thay đổi, không đổi gì ⟹ không ghi, không audit), lỗi `PROJECT.INVALID_*`/`PROJECT.NOT_FOUND`, hồ sơ phòng trả
`projects` cùng wire với route Project; thứ tự đọc/ủy quyền của `profile()` giữ (chỉ nguồn `projects` đổi từ repo sang
`ProjectService.list(id)`, cùng query).

`DepartmentService` có 7 dependency (thêm `ProjectService`) — vượt tín hiệu review "> 6"; chấp nhận vì prompt yêu cầu
Department đọc Project qua service công khai, và việc tách `DepartmentService` thuộc H4.6.

**Gate** (`architecture-structure.spec.ts`): `rootControllers.organization` 5 → 4, `rootFiles.organization` 26 → 22,
`department.repo.ts` 497 → 394 dòng ⟹ xóa mục oversized (507), `department.service.ts` cap 519 → 508. Không mục mới,
không allowlist mới; ledger import/export khác giữ nguyên.

## Test matrix

| AC / rủi ro                   | Tình huống                                                                                                                                                                                                                   | Cấp test                       | Kết quả mong đợi                                   | Bằng chứng sau implement |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------- | ------------------------ |
| Contract `/v1/projects`       | wire đúng key/kiểu/ISO, departments theo `code`; list mọi project theo tên; filter; NFC/trim tên, description giữ xuống dòng, rỗng ⟹ `null`; no-op không ghi/audit; chỉ audit trường đổi; `INVALID_DESCRIPTION`, `NOT_FOUND` | integration (characterization) | như cũ, trên code cũ rồi mới                       | [plan](plan.md)          |
| Hồ sơ phòng                   | `projects` trên profile đúng wire của route Project                                                                                                                                                                          | integration (characterization) | như cũ                                             | [plan](plan.md)          |
| Thứ tự trong `ProjectService` | create: kiểm → insert → audit → commit → đọc lại; update: lock trong tx trước kiểm/ghi; no-op; not found; dept thiếu                                                                                                         | unit (characterization)        | như cũ                                             | [plan](plan.md)          |
| Error mapper, wire mapper     | characterization H4.1                                                                                                                                                                                                        | unit                           | như cũ                                             | [plan](plan.md)          |
| Boundary, ledger, provider    | root count/cap, oversized, cạnh liên area, export                                                                                                                                                                            | unit (architecture gates)      | xanh, chỉ co lại                                   | [plan](plan.md)          |
| Contract toàn hệ thống        | mọi route; OpenAPI                                                                                                                                                                                                           | e2e, integration, export       | xanh; `openapi.json` byte-identical, inventory giữ | [plan](plan.md)          |

## Definition of Done

- [x] Hạng mục refactor không có primary AC; characterization xanh trên code cũ và vẫn xanh sau sửa.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên cây cuối; e2e + OpenAPI vì chạm controller.
- [x] Spec/plan/roadmap phản ánh implementation cuối; không đổi contract nên không có thông báo FE.
- [x] Legacy ledger chỉ co lại; không mục hay allowlist mới.
- [x] Phần chưa kiểm chứng ghi rõ ở plan.

## Changes and acceptance

- 19/10/2026: tạo hạng mục, thiết kế `ready`; Owner chốt vị trí HTTP error mapper ở `mappers/` trong phiên; implement và
  `verified` local (bằng chứng ở [plan](plan.md)). Chưa commit, chưa Owner review, chưa nghiệm thu.
