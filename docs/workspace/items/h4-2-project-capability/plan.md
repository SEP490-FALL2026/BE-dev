# Plan: H4.2 — tách capability `project` khỏi root `organization`

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `e053664`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (audit H4.0 mục 9.2, `E4 = A`).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 19/10/2026; bằng chứng chạy trên cây làm việc chưa commit trên `e053664`). Revision:
  commit `0d2ac58` trên `dev` = `origin/dev` (Owner commit/push trực tiếp 19/10/2026, không PR); remote CI chưa có
  bằng chứng.

## Before coding

Preflight trên `dev` = `origin/dev` = `e053664`, ahead/behind `0/0`, cây sạch; `e053664` cha `c4a8d5c`, gồm đúng 19
path H4.3a + 14B, và 708 tệp khớp byte với cây H4.3a đã verify. Xác nhận trên code thật: controller/service Project ở
root; persistence Project (6 method + `toProject`) trong `DepartmentRepo`; `ProjectRecord`/`ProjectStatus` trong
`department.types.ts`; DTO/schema Project trong `dto/department.dto.ts`; lỗi Project trong `errors/department.errors.ts`;
`DepartmentService.profile` gọi `repo.listProjects`; `toProjectWire` có hai consumer; `ProjectService` đã dùng
`core/normalizeDisplayName`; `organization-audit.ts` (5 consumer) và `organization.http-errors.ts` (5 controller) là file
private ở root. Root: 5 controller / 26 file; `department.repo.ts` 497/507, `department.service.ts` 518/519. Baseline:
ba gate + unit `organization` 9 suite/230 test; integration `departments-http`, `organization`,
`organization-concurrency` 3 suite/63 test. `openapi.json` `14fd428b…`, 60 operation, 61 schema.

Sai lệch phát hiện ở preflight: gate coi mọi tệp trong `errors/` là tệp lỗi nghiệp vụ và cấm `ApiException`/`HttpStatus`,
nên đặt HTTP mapper ở `errors/` (như prompt) đòi ledger hoặc nới gate. Owner chốt `mappers/` trong phiên.

## Tasks

### Task 1: characterization trên code cũ

- Files: `test/integration/organization/departments-http.integration-spec.ts` (khối `project contract kept by the H4.2 move`, 6 test),
  `src/modules/organization/project.service.spec.ts` (6 test; sau move ở `project/`).
- Depends on: none.
- Acceptance: wire, list/filter/thứ tự, chuẩn hóa, no-op, audit trường đổi, lỗi, hồ sơ phòng; thứ tự lock/kiểm/ghi/audit
  trong transaction — xanh trên code chưa sửa, cùng characterization H4.1 của error/wire mapper.
- Verify: integration trên PostgreSQL riêng; `pnpm exec jest <spec>`.

### Task 2: move file và adapter dùng chung

- Files: `project/projects.controller.ts`, `project/project.service.ts` (+ spec), `mappers/audit-event.mapper.ts`,
  `mappers/organization.http-errors.ts` (+ spec), consumer organization.
- Depends on: Task 1.
- Acceptance: chỉ đổi đường dẫn import; không wrapper ở root; typecheck sạch.
- Verify: `tsc --noEmit`; diff nội dung cũ ↔ mới chỉ khác dòng import.

### Task 3: types, errors, DTO, repo

- Files: `project/project.types.ts`, `project/project.errors.ts`, `project/project.dto.ts`, `project/project.repo.ts`;
  `department.types.ts`, `errors/department.errors.ts`, `dto/department.dto.ts`, `department.repo.ts`.
- Depends on: Task 2.
- Acceptance: chuyển nguyên văn; `projectSchema` một định nghĩa; `DepartmentRepo` không còn query Project.
- Verify: diff nguyên văn; quét 0 hit.

### Task 4: service, DI và consumer Department

- Files: `project/project.service.ts`, `organization-http.module.ts`, `department.service.ts` (+ spec),
  `department.types.ts`, `departments.controller.ts`.
- Depends on: Task 3.
- Acceptance: `ProjectService` inject `ProjectRepo`; `DepartmentService.profile` gọi `ProjectService.list(id)`;
  `ProjectRepo`/`ProjectService` đăng ký một lần, không export; `department.service.ts` không vượt cap.
- Verify: unit `organization` + ba gate.

### Task 5: ratchet gate

- Files: `test/gates/architecture-structure.gate-spec.ts`.
- Depends on: Task 4.
- Acceptance: root 4 controller / 22 file; mục oversized `department.repo.ts` gỡ; cap `department.service.ts` 508.
- Verify: ba architecture spec.

### Checkpoint

Sau Task 5: OpenAPI export + inventory, integration focused, tự review diff, rồi full gate.

## Verification and handoff

Môi trường: Windows 11, Git Bash, pnpm 11.1.3, cây làm việc chưa commit trên `e053664`, 19/10/2026. Integration dùng
PostgreSQL 17 (`postgres:17-alpine`) trong container riêng của lượt (`127.0.0.1:55438`), role
`LOGIN NOSUPERUSER CREATEDB`, đã xóa sau khi chạy.

| Lệnh / kiểm tra AC                                                                                                                                                            | Revision / môi trường                  | Kết quả thực chạy                                                                                                                                                                                                                                                                                              | Giới hạn / việc còn lại                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Characterization trên code **chưa sửa**: 6 integration (`project contract kept by the H4.2 move`) + 6 unit `ProjectService`; H4.1 error/wire mapper trong unit `organization` | `e053664` + test mới, PostgreSQL riêng | exit 0; integration 6/6; unit 6/6                                                                                                                                                                                                                                                                              | —                                                                                                                     |
| Sau move: ba gate + unit `organization`                                                                                                                                       | cây cuối                               | exit 0; 236 test (230 + 6)                                                                                                                                                                                                                                                                                     | lần đầu đỏ: `department.service.ts` 521 > cap 519 — chuyển hai view type sang `department.types.ts`, file còn 508     |
| Nội dung file move và symbol move                                                                                                                                             | cây cuối vs `HEAD`                     | 5 file move chỉ khác dòng import và token `DepartmentRepo` → `ProjectRepo`; 6 method repo, hai lớp lỗi, `projectSchema`, 4 schema request, 5 lớp DTO và `ProjectRecord` trùng nguyên văn                                                                                                                       | —                                                                                                                     |
| Quét                                                                                                                                                                          | cây cuối                               | 0 file Project/adapter còn ở root; 0 query Project ngoài `project/project.repo.ts`; 0 `DepartmentRepo` trong `project/`; `projectSchema`, `toProjectWire`, `organizationAuditEvent`, `toOrganizationApiException` mỗi thứ một định nghĩa; root chỉ import `project.service`/`project.types` (cùng Nest module) | —                                                                                                                     |
| Integration focused: `departments-http`, `organization`, `organization-concurrency`, `cost-centers-http`, `job-titles-http`                                                   | PostgreSQL riêng                       | exit 0; 5 suite/126 test                                                                                                                                                                                                                                                                                       | —                                                                                                                     |
| `pnpm check`                                                                                                                                                                  | cây cuối                               | exit 0; rules 93 tệp/776 link/0 lỗi; rules test 18/18; unit 59 suite/856 test; scripts 19/19; discovery 59/14/46; build                                                                                                                                                                                        | lần đầu fail lint (`HeadPeriodRecord` không còn dùng sau khi chuyển view type) — bỏ import, cap hạ 508, chạy lại xanh |
| `pnpm test:e2e`                                                                                                                                                               | cây cuối                               | exit 0; 14 suite/274 test                                                                                                                                                                                                                                                                                      | —                                                                                                                     |
| `pnpm test:integration`                                                                                                                                                       | PostgreSQL riêng                       | exit 0; 46 suite/603 test (597 + 6), 386 s; không `42501`; 0 database sót; container đã xóa                                                                                                                                                                                                                    | remote CI chưa chạy                                                                                                   |
| `pnpm openapi:export` rồi `cmp` + inventory operation/status/security/schema                                                                                                  | cây cuối                               | exit 0; byte-identical `14fd428b…`; 60 operation, 61 schema, inventory trùng                                                                                                                                                                                                                                   | —                                                                                                                     |
| `pnpm rules:check`, `pnpm rules:format`, Prettier, ESLint, `git diff --check`                                                                                                 | cây cuối                               | exit 0                                                                                                                                                                                                                                                                                                         | —                                                                                                                     |
| Ledger                                                                                                                                                                        | cây cuối                               | `rootControllers.organization` 5 → 4, `rootFiles.organization` 26 → 22, mục oversized `department.repo.ts` (497 → 394 dòng) gỡ, cap `department.service.ts` 519 → 508; không mục mới, không allowlist hay export mới                                                                                           | `DepartmentService` 7 dependency (tín hiệu review, H4.6)                                                              |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ (remote CI, Owner review).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
