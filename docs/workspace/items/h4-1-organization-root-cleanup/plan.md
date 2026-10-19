# Plan: H4.1 — dọn coupling nhỏ ở root `organization`

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `8fca0a4`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (audit H4.0 mục 9.2).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 19/10/2026; bằng chứng chạy trên cây làm việc chưa commit trên `8fca0a4`). Revision:
  commit `c4a8d5c` trên `dev` = `origin/dev` (Owner commit/push trực tiếp 19/10/2026, không PR); remote CI chưa có
  bằng chứng.

## Before coding

Preflight trên `dev` = `origin/dev` = `8fca0a4`, ahead/behind `0/0`, cây sạch; `8fca0a4` chỉ gồm bảy tệp DOC.1, cha
`5b75930`. Xác nhận trên code thật: `projects.controller.ts:12` import `toProjectWire` từ controller khác;
`department.service.ts:485` so `error.name`; `OrganizationRepo` chỉ dùng ở helper `lockEmployee` (`:483`, `:489`);
`OrganizationService.lockEmployeeForShare`/`getEmployee` gọi đúng `lockEmployee(tx, id, 'SHARE')`/`findEmployee(id, tx)`
của repo; repo ném `EmployeeNotFoundError` của `organization.errors.ts` (cùng lớp mà `instanceof` dùng);
`ImportLookupRepo` chỉ được `OrganizationService` và một integration test dùng; `readCostCenterForDepartment` 0 caller;
ledger có đúng ba mục H4.1. `openapi.json` `14fd428b…`.

## Tasks

### Task 1: characterization trước refactor

- Files: `src/modules/organization/organization.http-errors.spec.ts`, `src/modules/organization/mappers/project.mapper.spec.ts`.
- Depends on: none.
- Acceptance: bảng error → status/code/details cho mọi nhánh mapper, passthrough, 503, identity; wire project đủ trường —
  xanh trên code chưa sửa.
- Verify: `pnpm exec jest --runInBand <hai spec>` → xanh trước mọi sửa product.

### Task 2: F-11 mapper project

- Files: `mappers/project.mapper.ts` (mới), `departments.controller.ts`, `projects.controller.ts`, spec mapper.
- Depends on: Task 1.
- Acceptance: không controller nào import controller; mapper không đổi; ledger `controllerImports` rỗng.
- Verify: spec mapper + `src/architecture-structure.spec.ts` xanh.

### Task 3: F-12 facade và `instanceof`

- Files: `department.service.ts`, `department.service.spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: helper qua `OrganizationService`, bắt `instanceof EmployeeNotFoundError`, ném lại lỗi khác; không còn
  `OrganizationRepo` trong service; mục `errorMatchedByName` của `department.service.ts` gỡ, hai mục `ROOT.1` giữ.
- Verify: spec service đỏ trước (DI đòi `OrganizationRepo`) rồi xanh; `departments-http` integration xanh.

### Task 4: F-13 export và A4-09 code chết

- Files: `organization.module.ts`, `department.repo.ts`, `src/module-graph.spec.ts`.
- Depends on: none.
- Acceptance: `ImportLookupRepo` còn provider, không còn export; ba export `E4` giữ; `readCostCenterForDepartment` không
  còn; ledger export gỡ đúng một mục.
- Verify: `src/module-graph.spec.ts` xanh; quét 0 hit.

### Checkpoint

Sau Task 4: focused unit + ba architecture gate xanh, typecheck/lint sạch, tự review diff.

## Verification and handoff

Môi trường: Windows 11, Git Bash, pnpm 11.1.3, cây làm việc chưa commit trên `8fca0a4`, 19/10/2026. Integration dùng
PostgreSQL 17 (`postgres:17-alpine`) trong container riêng của lượt, role `LOGIN NOSUPERUSER CREATEDB`, đã xóa sau khi
chạy.

| Lệnh / kiểm tra AC                                                                                                                           | Revision / môi trường    | Kết quả thực chạy                                                                                                                                                                  | Giới hạn / việc còn lại                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Characterization trên code **chưa sửa**: `jest` error mapper + project mapper + ba architecture gate                                         | `8fca0a4` + hai spec mới | exit 0; 5 suite, 100 test (42 error mapper, 2 project mapper, 56 gate)                                                                                                             | spec mapper ban đầu dùng `status: 'ACTIVE'` (sai kiểu `ProjectStatus`, ts-jest không kiểm kiểu); sửa thành `RUNNING` khi typecheck bắt — mapper chép nguyên `status` nên kết luận không đổi |
| Spec `DepartmentService` trên code chưa sửa                                                                                                  | `8fca0a4` + spec         | đỏ đúng lý do: Nest không resolve tham số thứ 3 `OrganizationRepo` của `DepartmentService` (4/4 fail)                                                                              | —                                                                                                                                                                                           |
| Focused sau sửa: `jest src/modules/organization` + ba gate                                                                                   | cây cuối                 | exit 0; 9 suite, 148 test                                                                                                                                                          | —                                                                                                                                                                                           |
| `pnpm exec tsc --noEmit`, `eslint` các tệp đổi                                                                                               | cây cuối                 | exit 0                                                                                                                                                                             | —                                                                                                                                                                                           |
| `pnpm openapi:export` rồi `cmp` với bản sao đầu lượt                                                                                         | cây cuối                 | exit 0; byte-identical `14fd428b…`                                                                                                                                                 | —                                                                                                                                                                                           |
| `pnpm check`                                                                                                                                 | cây cuối                 | exit 0; rules 89 tệp/734 link/0 lỗi; rules test 18/18; unit 57 suite/631 test; scripts 19/19; discovery 57/14/46; build                                                            | —                                                                                                                                                                                           |
| `pnpm test:e2e`                                                                                                                              | cây cuối                 | exit 0; 14 suite/274 test                                                                                                                                                          | —                                                                                                                                                                                           |
| Integration focused: `departments-http`, `organization`, `organization-concurrency`                                                          | PostgreSQL riêng         | exit 0; 3 suite/63 test                                                                                                                                                            | —                                                                                                                                                                                           |
| `pnpm test:integration`                                                                                                                      | PostgreSQL riêng         | exit 0; 46 suite/597 test, 278,8 s; không `42501`; 0 database sót                                                                                                                  | remote CI chưa chạy                                                                                                                                                                         |
| Quét 0 hit: controller import controller; `error.name === 'EmployeeNotFoundError'`; export `ImportLookupRepo`; `readCostCenterForDepartment` | cây cuối                 | 0 / 0 / không còn trong `exports` / 0                                                                                                                                              | —                                                                                                                                                                                           |
| Ledger                                                                                                                                       | cây cuối                 | gỡ đúng `controllerImports` (nay rỗng), `errorMatchedByName: department.service.ts`, `OrganizationModule: ImportLookupRepo`; ba export `E4` và hai mục `ROOT.1` giữ; không mục mới | cap oversized của `department.service.ts` (519, nay 518 dòng) và `department.repo.ts` (507, nay 497) giữ nguyên — thuộc H4.6                                                                |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ (remote CI, Owner review).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
