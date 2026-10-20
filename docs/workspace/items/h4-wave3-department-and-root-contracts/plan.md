# Plan: organization Wave 3 — capability `department`, Department Head và root contract (H4.6, H4.7)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `e632dd6`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (audit H4.0 mục 9.2, `E4 = A`; phương án A của Wave 2).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 19/10/2026; bằng chứng chạy trên cây làm việc chưa commit trên `e632dd6`). Revision:
  commit `ac3eb92` trên `dev` = `origin/dev` (Owner commit/push trực tiếp 19/10/2026, không PR); remote CI chưa có
  bằng chứng.

## Before coding

Preflight trên `dev` = `origin/dev` = `e632dd6` (cha `0d2ac58`), ahead/behind `0/0`, cây sạch; `e632dd6` chứa đúng Wave
2: `job-title/`, `employee/`, `cost-center/`, root `organization` 10 file/1 controller, `OrganizationRepo` 69 dòng,
`openapi.json` `14fd428b…`. Tracker ngoài repo đã qua Prettier (`prettier --check` sạch; hash chuỗi token phi khoảng trắng
trước/sau trùng nhau, không cần định dạng lại).

Inventory (đọc trực tiếp, không subagent):

- Department: controller 283 dòng (9 route, mapper wire trong file), `DepartmentService` 508 dòng/7 dependency (đọc, ghi,
  head, `Page<T>`), `DepartmentRepo` 394 dòng (phòng, thành viên, head periods, đếm `employees`), `department.types.ts`,
  `dto/department.dto.ts` (import `projectSchema` của `project/`), `errors/department.errors.ts`; `OrganizationRepo` còn
  `createDepartment`, `lockDepartmentByCode`.
- Facade dùng `DepartmentRepo` cho `isDepartmentHead`, `getHeadedDepartment`, `departmentsWithoutHead`, `getOnboardingFacts`.
- Ghi `departments`: `DepartmentRepo.insert/update/deactivate` + `OrganizationRepo.createDepartment`; ghi
  `department_head_periods`: `DepartmentRepo.makeRoomForHead/insertHeadPeriod`; khóa: phòng `FOR UPDATE`/`FOR SHARE` theo
  id, `FOR SHARE` theo mã (nhập tay), Cost Center `FOR SHARE` (tạo phòng), người `FOR SHARE` (head, IT Admin).
- `Page<T>`/`*Page`: 7 bản (A4-12) — `organization` 3 (`department.service`, `cost-center.service`, `JobTitlePage`, cùng
  shape `{ items, pagination: { page, pageSize, totalItems, totalPages = ceil } }`); ngoài phạm vi 4 (`data-import`
  `Page<T>`, `AuditEventPage`, `AccountPage`, `CatalogApplicationPage`). `src/core/application/pagination.ts` đã có
  `normalizePageSize`.
- Ledger liên quan: `oversizedFiles` `department.service.ts` 508; `LEGACY_PRIVATE_EXPORTS` ba entry E4; `rootFiles`,
  `rootControllers` đã trống từ Wave 2.
- Route Department: `departmentList`, `departmentCreate`, `departmentGet`, `departmentUpdate`, `departmentDeactivate`,
  `departmentHeadAssign`, `departmentHeadVacate`, `departmentMemberList`, `departmentWarningList`.

Baseline trên code chưa sửa: integration departments-http, organization, organization-concurrency,
organization-unavailable, cost-centers, employee manual/import, onboarding, installation (3), job-titles,
approval-roles, role-grant — 14 suite/239 test; unit ba gate + organization, onboarding, installation, data-import,
identity-access, core — 30 suite/569 test.

## Tasks

### Task 1: characterization trên code cũ

- Files: `test/integration/departments-http.integration-spec.ts` (7 test), `organization-concurrency.integration-spec.ts`
  (3 test; helper `settlesWhileShared` nâng lên phạm vi suite), `organization.integration-spec.ts` (3 test) — mỗi tệp một
  khối `... kept by the Wave 3 move`.
- Đã có từ trước: tạo/sửa/ngừng, mã trùng, Cost Center không dùng được, `IN_USE` ba khóa, head AC-5 → AC-9/AC-18,
  vai MANAGER, phạm vi đọc, project, INV-19, đua hai trưởng phòng; thiếu: wire đủ khóa, paging, trang thành viên, audit
  head đủ payload, giới hạn 20 tên, thứ tự cảnh báo, chế độ khóa phòng/người, facade head/phòng.
- Depends on: none.
- Acceptance: 13 test mới xanh trên code chưa sửa; ba suite 88/88.
- Verify: integration trên PostgreSQL riêng, code chưa sửa.

### Task 2: Phase A — H4.6 `department/`

- Files: `department/**` (move + tách), `dto/project-wire.dto.ts`, `project/project.dto.ts`, `organization.repo.ts`,
  `organization.service.ts`, `organization.module.ts`, `organization-http.module.ts`, `employee/employee.repo.ts`,
  `employee/employee-directory.service.ts`, `mappers/organization.http-errors.ts` (+ spec), ledger, test construct.
- Depends on: Task 1.
- Acceptance: một writer mỗi bảng; `department.*` < 400 dòng; service ≤ 6 dependency; không import riêng chéo capability.
- Verify: Checkpoint A.

### Task 3: Phase B — H4.7 root contract, `Page<T>`, E4

- Files: `src/core/application/pagination.ts` (+ spec), `department-query.service.ts`, `cost-center.service.ts`,
  `job-title.service.ts`, `organization.errors.ts`, `organization.repo.ts`, `module-graph.spec.ts` (comment E4), test import.
- Depends on: Task 2.
- Acceptance: không còn `Page` cục bộ trong `organization`; `OrganizationRepo` chỉ Organization; ba export E4 đúng.
- Verify: Checkpoint B.

### Task 4: consolidation

- Files: comment `organization.module.ts`, `ARCHITECTURE.md`, `docs/rules/module-structure.md`, item này, `items/README.md`,
  `docs/roadmap.md`, metadata Wave 2 (`e632dd6`), tracker ngoài repo.
- Depends on: Task 3.
- Acceptance: tài liệu hiện hành mô tả đúng cây cuối; bằng chứng lịch sử có ngày giữ nguyên; diff cuối đã tự review.
- Verify: full gate một lần trên cây cuối (bảng dưới).

## Verification and handoff

Môi trường: Windows 11, Git Bash, pnpm 11.1.3, cây làm việc chưa commit trên `e632dd6`, 19/10/2026. Integration dùng
PostgreSQL 17 (`postgres:17-alpine`) trong container riêng của lượt (`127.0.0.1:55433`), role
`LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`.

| Lệnh / kiểm tra                                                                                                                      | Revision / môi trường      | Kết quả                                                                                                                                                                                                                                                                                          | Chưa chạy / giới hạn |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Baseline (code chưa sửa): 14 suite integration; ba gate + unit organization/onboarding/installation/data-import/identity-access/core | `e632dd6`                  | 14 suite/239 test; 30 suite/569 test                                                                                                                                                                                                                                                             | —                    |
| Characterization mới trên code **chưa sửa**                                                                                          | `e632dd6` + test           | 13/13 xanh; ba suite đầy đủ 88/88                                                                                                                                                                                                                                                                | —                    |
| Checkpoint A (H4.6): typecheck, ESLint, ba gate + unit; 14 suite integration                                                         | cây sau Phase A            | exit 0; unit 31 suite/569 test; integration 14 suite/252 test                                                                                                                                                                                                                                    | —                    |
| Checkpoint A — quét                                                                                                                  | cây sau Phase A            | ghi `departments` chỉ `department.repo.ts`, `department_head_periods` chỉ `department-head.repo.ts`; 33/33 SQL template và mọi lệnh Prisma của repo cũ có nguyên văn ở chủ mới; root 6 file/0 controller; file lớn nhất `department.repo.ts` 306 dòng; không import riêng chéo capability (gate) | —                    |
| Checkpoint B (H4.7): typecheck, ESLint, ba gate + unit                                                                               | cây sau Phase B            | exit 0; 31 suite/572 test (+3 `pageOf`)                                                                                                                                                                                                                                                          | —                    |
| Checkpoint B — quét                                                                                                                  | cây sau Phase B            | 0 `Page`/`pageOf` cục bộ trong `organization`; ledger structure không còn mục `organization`; `LEGACY_PRIVATE_EXPORTS` đúng ba entry E4; method facade đều có consumer trừ `lockEmployeeForUpdate` (giữ, xem spec)                                                                               | —                    |
| `pnpm check`                                                                                                                         | cây cuối                   | exit 0: rules 97 tệp/811 link 0 lỗi, format, prisma, lint, typecheck, unit 60 suite/859 test (+1 suite, +3 test so với Wave 2), script 18 + 19, test discovery, build                                                                                                                            | —                    |
| `pnpm test:e2e`                                                                                                                      | cây cuối                   | exit 0; 14 suite/274 test                                                                                                                                                                                                                                                                        | —                    |
| `pnpm test:integration`                                                                                                              | cây cuối, PostgreSQL riêng | exit 0; 46 suite/623 test (610 + 13), 291 s; không `42501`; 0 database `slm_*_test` sót; container đã xóa                                                                                                                                                                                        | remote CI chưa chạy  |
| `pnpm openapi:export` + `cmp` + inventory                                                                                            | cây cuối                   | `openapi.json` byte-identical `14fd428b…` (`cmp` với `e632dd6`, git không đổi); 60 operation, 61 schema; 9 route Department giữ operationId, status, security                                                                                                                                    | —                    |
| `pnpm rules:check`, `pnpm rules:format`, Prettier, `git diff --check`, tracker `prettier --check`                                    | cây cuối                   | exit 0; Prettier sạch; `git diff --check` sạch; tracker `prettier --check` sạch                                                                                                                                                                                                                  | —                    |

**Kiểm soát còn lại / giới hạn:** E4 vẫn là ngoại lệ (ba repo export) tới G3; F-26 còn 4 bản `*Page` ngoài
`organization`; `lockEmployeeForUpdate` chưa có consumer production; các export quy ước không có consumer (schema zod của
DTO, type tham số lỗi/bộ lọc, ở cả capability Wave 2) không đổi trong lượt này; remote CI, Owner review chưa có.

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ (remote CI, Owner review).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
