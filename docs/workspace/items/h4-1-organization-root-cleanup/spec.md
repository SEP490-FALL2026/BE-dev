# Spec: H4.1 — dọn coupling nhỏ ở root `organization`

- Phụ trách: AI theo giao việc Owner (Prompt 13, 19/10/2026).
- Thiết kế ban đầu bởi: Owner qua [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md),
  mục 9.2 (lát H4.1) và quyết định `E4 = A` ở mục 12.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (không có Story/AC mới; nghiệp vụ hiện hành giữ nguyên), BE `8fca0a4` (`dev`, sau GATE.1
  `5b75930` và DOC.1 `8fca0a4`).
- Nhóm roadmap: enabler refactor của `organization` trước G3 — chỉ là planning container.
- [Kế hoạch](plan.md).

## Business outcome

Không đổi hành vi người dùng: mọi route, response, lỗi và OpenAPI của `organization` giữ nguyên, trong khi bốn coupling nhỏ
ở root module (`F-11`, `F-12`, phần H4.1 của `F-13`, `A4-09`) được gỡ và đúng ba mục legacy ledger tương ứng biến mất.
Kiểm bằng characterization test của error mapper và project mapper, test service, ba architecture gate và
`openapi.json` byte-identical.

## Primary Story/AC

| Story | AC                                  | Coverage | Phần còn lại thuộc |
| ----- | ----------------------------------- | -------- | ------------------ |
| —     | F-11, F-12, F-13 (phần H4.1), A4-09 | n/a      | H4.2 → H4.7        |

## Supporting references

- Audit H4.0: mục 4 (hotspot), 7 (gate), 9.2 (bảng lát organization), 12 (`E4 = A`);
  [reconciliation](../../../reviews/be-full-src-architecture-audit-2026-10-19/reconciliation.md) `F-11` → `F-13`.
- [Module structure](../../../rules/module-structure.md) (folder dùng chung `mappers/`, allowlist export, ledger).
- `US-03-06`, `US-04-09`, `US-01-11` chỉ để truy vết hành vi phải giữ; không có AC mới.

## Explicit out of scope

- H4.2: tạo/move `project/`, tách persistence project khỏi `department.repo.ts`, chuyển DTO/error project.
- H4.3a → H4.7: `normalizeDisplayName`, `job-title/`, `employee/`, `cost-center/`, `department/`, ba repo export `E4`.
- `Page<T>` chung, catalog/G3, H5/H6/H7/H8, ROOT.1, hardening `CP0-04` → `CP0-10`.
- Đổi business behavior, Docs nghiệp vụ, FE/Mobile, migration, package/config.

## Dependencies and blockers

GATE.1 (`5b75930`) và DOC.1 (`8fca0a4`) đã trên `dev`. Không blocker. Mọi move/rename capability chờ H4.2 trở đi.

## Ownership: module, data, API

Module `organization` (bounded context sở hữu `departments`, `projects`, `employees`…). Không bảng, migration hay
operation HTTP nào thêm/đổi. `OrganizationModule` vẫn export `OrganizationService` và đúng ba repo `E4`
(`CostCenterRepo`, `DepartmentRepo`, `OrganizationRepo`); `ImportLookupRepo` còn là provider nội bộ. Mapper project mới
ở `mappers/` (folder dùng chung cấp module) vì hai capability — department profile và project — cùng dùng; không thêm file
root, không tạo Nest submodule.

## Behavior and design

| Finding | Hiện trạng ở `8fca0a4`                                                                                 | Thay đổi                                                                                                                                               | Ledger gỡ                                     |
| ------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| F-11    | `projects.controller.ts:12` import `toProjectWire` từ `departments.controller.ts`                      | `toProjectWire` ra `mappers/project.mapper.ts`; hai controller cùng import                                                                             | `controllerImports` (mục duy nhất)            |
| F-12    | `department.service.ts:481-490` dùng `OrganizationRepo` và so `error.name === 'EmployeeNotFoundError'` | dùng facade `lockEmployeeForShare(tx, id)` rồi `getEmployee(id, tx)`; bắt `instanceof EmployeeNotFoundError`; bỏ dependency `OrganizationRepo` (7 → 6) | `errorMatchedByName`: `department.service.ts` |
| F-13    | `organization.module.ts:14` export `ImportLookupRepo`, không consumer ngoài module                     | bỏ khỏi `exports`, giữ trong `providers`                                                                                                               | `OrganizationModule: ImportLookupRepo`        |
| A4-09   | `department.repo.ts:166` `readCostCenterForDepartment` không có caller                                 | xóa method                                                                                                                                             | —                                             |

Hành vi phải giữ: route, request/response, status, mã/message/details lỗi và OpenAPI; access metadata; transaction,
thứ tự khóa (phòng → employee `FOR SHARE` → account), Audit Trail; `DEPARTMENT.IN_USE.details` đúng `members`,
`openWork`, `totalMembers`. Facade `lockEmployeeForShare`/`getEmployee` gọi đúng hai method repo cũ trên cùng `tx`, nên
SQL, khóa và kết quả không đổi; chỉ `EmployeeNotFoundError` thành "không có người", lỗi khác ném tiếp.

Bảng characterization của `toOrganizationApiException` (error → status/code/details) nằm trong
`organization.http-errors.spec.ts`: 34 dòng nhánh, cộng passthrough `ApiException`, 503 qua `toUnavailableApiException` và
trả nguyên identity cho lỗi không nhận biết.

## Test matrix

| AC / rủi ro                                     | Tình huống                                                              | Cấp test                   | Kết quả mong đợi                                                                                   | Bằng chứng sau implement |
| ----------------------------------------------- | ----------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------ |
| Contract lỗi `organization`                     | mỗi lớp lỗi được mapper nhận; passthrough; DB không trả lời; lỗi lạ     | unit (characterization)    | status/code/message/details như cũ; 503; identity                                                  | [plan](plan.md)          |
| F-11 wire project                               | đủ trường, ISO-8601, description null/có, departments rỗng              | unit (characterization)    | wire như cũ                                                                                        | [plan](plan.md)          |
| F-12 employee không tồn tại / hợp lệ / lỗi khác | IT Admin phụ trách và trưởng phòng qua `update`/`assignHead`            | unit service + integration | 422 `IT_ADMIN_INVALID` / `HEAD_EMPLOYEE_NOT_FOUND`; lock trước read cùng `tx`; lỗi khác ném nguyên | [plan](plan.md)          |
| Provider graph và export                        | `OrganizationModule` export facade + ba repo `E4`; không provider trùng | unit (module graph)        | ledger hai chiều sạch                                                                              | [plan](plan.md)          |
| Ledger                                          | đúng ba mục H4.1 biến mất, không mục mới                                | unit (architecture gates)  | xanh                                                                                               | [plan](plan.md)          |
| Không đổi contract                              | toàn bộ route                                                           | e2e, integration, export   | e2e/integration xanh; `openapi.json` byte-identical                                                | [plan](plan.md)          |

## Definition of Done

- [x] Hạng mục refactor không có primary AC; characterization xanh trên code cũ và vẫn xanh sau sửa.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên cây cuối; e2e + OpenAPI vì chạm controller.
- [x] Spec/plan/roadmap phản ánh implementation cuối; không đổi contract nên không có thông báo FE.
- [x] Legacy ledger chỉ co lại: gỡ đúng ba mục H4.1.
- [x] Phần chưa kiểm chứng ghi rõ ở plan.

## Changes and acceptance

- 19/10/2026: tạo hạng mục, thiết kế `ready`; implement và `verified` local (bằng chứng ở [plan](plan.md)). Chưa commit,
  chưa Owner review, chưa nghiệm thu.
