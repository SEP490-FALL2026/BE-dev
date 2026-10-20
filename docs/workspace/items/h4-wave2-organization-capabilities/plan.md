# Plan: organization Wave 2 — capability `job-title`, `employee`, `cost-center` (H4.3b, H4.4, H4.5)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `0d2ac58`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (audit H4.0 mục 9.2, `E4 = A`; làm rõ Prompt 16 trong phiên).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 19/10/2026; bằng chứng chạy trên cây làm việc chưa commit trên `0d2ac58`). Revision:
  commit `e632dd6` trên `dev` = `origin/dev` (Owner commit/push trực tiếp 19/10/2026, không PR); remote CI chưa có
  bằng chứng.

## Before coding

Preflight trên `dev` = `origin/dev` = `0d2ac58`, ahead/behind `0/0`, cây sạch; `0d2ac58` cha `e053664`, chứa đúng H4.2
(`project/`, mapper dùng chung, root 22 file/4 controller), 715 tệp khớp byte với cây H4.2 đã verify; `openapi.json`
`14fd428b…` (60 operation, 61 schema). Inventory: `OrganizationRepo` 399 dòng (7 method Job Title, 10 method Employee,
`createCostCenter`, Organization, `createDepartment`, `lockDepartmentByCode`); `OrganizationService` inject `OrganizationRepo`,
`DepartmentRepo`, `ImportLookupRepo`, `CostCenterRepo`; `JobTitleService`, `EmployeeManualService` inject `OrganizationRepo`
(E4); `DepartmentService` inject `CostCenterRepo`. Baseline: ba gate + unit organization/installation/onboarding/data-import
16 suite/400 test; integration job-title, employee manual/import, onboarding, cost-center, departments, organization,
concurrency, installation 13 suite/218 test.

Sai lệch phát hiện ở preflight: sau khi repo vào capability folder, facade root không được import repo (gate), và E4 cấm
export repo mới — Owner chốt phương án A (spec, _Dependencies and blockers_). Một subagent chỉ đọc lập bản đồ coverage;
khoảng trống chính là chế độ khóa, ba audit payload và vài ca facade.

## Tasks

### Task 1: characterization trên code cũ

- Files: `test/integration/organization-concurrency.integration-spec.ts` (khối `lock modes kept by the Wave 2 move`, 3 test),
  `organization.integration-spec.ts` (3 test), `employee-manual-http`, `job-titles-http`, `cost-centers-http` (audit payload).
- Depends on: none.
- Acceptance: xanh trên code chưa sửa.
- Verify: integration trên PostgreSQL riêng.

### Task 2: Phase A — H4.3b `job-title/`

- Files: `job-title/**`, `organization.repo.ts`, `organization.service.ts`, `organization.module.ts`, `organization.types.ts`,
  `errors/organization.errors.ts`, `mappers/organization.http-errors.ts` (+ spec), `employee-manual.service.ts`,
  `employee-row.validator.ts`, test import/construct.
- Depends on: Task 1.
- Acceptance: `JobTitleRepo` duy nhất ghi `job_titles`; `JobTitleService` qua facade; không root file Job Title.
- Verify: Checkpoint A.

### Task 3: Phase B — H4.4 `employee/`

- Files: `employee/**`, `organization.repo.ts`, `organization.service.ts`, `organization.module.ts`, `organization.errors.ts`,
  `errors/organization.errors.ts`, mapper (+ spec), test import/construct.
- Depends on: Task 2.
- Acceptance: `EmployeeRepo` duy nhất ghi `employees`/`employee_placements`; nhập tay qua facade, cùng thứ tự khóa.
- Verify: Checkpoint B.

### Task 4: Phase C — H4.5 `cost-center/`

- Files: `cost-center/**`, `organization.repo.ts`, `organization.service.ts`, `organization.module.ts`, `department.service.ts`
  (+ spec), `dto/department.dto.ts`, mapper (+ spec), test import/construct.
- Depends on: Task 3.
- Acceptance: `CostCenterRepo` duy nhất ghi `cost_centers`; phòng khóa Cost Center qua `CostCenterService`.
- Verify: Checkpoint C.

### Checkpoint

Sau Task 4: consolidation (comment module, ARCHITECTURE, rule module structure), tự review diff, full gate một lần.

## Verification and handoff

Môi trường: Windows 11, Git Bash, pnpm 11.1.3, cây làm việc chưa commit trên `0d2ac58`, 19/10/2026. Integration dùng
PostgreSQL 17 (`postgres:17-alpine`) trong container riêng của lượt (`127.0.0.1:55439`), role
`LOGIN NOSUPERUSER CREATEDB`, đã xóa sau khi chạy.

| Lệnh / kiểm tra AC                                                                                                                                                                        | Revision / môi trường              | Kết quả thực chạy                                                                                                                                                                                                                                                            | Giới hạn / việc còn lại                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Characterization mới trên code **chưa sửa**: 3 test chế độ khóa, 3 test facade, 3 audit payload                                                                                           | `0d2ac58` + test, PostgreSQL riêng | exit 0; 5 suite/109 test (một fixture sửa: Cost Center `INACTIVE` cần `deactivated_at`)                                                                                                                                                                                      | snapshot RepeatableRead không kiểm được bằng test (giữ bằng code nguyên văn) |
| Checkpoint A (H4.3b): ba gate + unit organization/installation; integration job-titles, migration, organization, employee manual, installation                                            | cây sau Phase A                    | exit 0; unit 13 suite/261; integration 9 suite/102                                                                                                                                                                                                                           | —                                                                            |
| Checkpoint B (H4.4): ba gate + unit organization/installation/onboarding/data-import; integration employee manual/import, organization, onboarding, installation, departments, job-titles | cây sau Phase B                    | exit 0 sau khi gỡ mục `rootControllers` stale (root còn 2 controller); unit 16 suite/400; integration 11 suite/187                                                                                                                                                           | —                                                                            |
| Checkpoint C (H4.5): ba gate + unit; integration cost-centers, departments, organization, installation, onboarding; concurrency                                                           | cây sau Phase C                    | exit 0 sau khi gỡ mục `rootFiles` stale (root còn 10 file); unit 14 suite/270; integration 9 suite/133; concurrency 10/10                                                                                                                                                    | —                                                                            |
| Nội dung move                                                                                                                                                                             | cây cuối vs `HEAD`                 | 14/19 file move chỉ khác import; 5 còn lại chỉ đổi gọi repo → facade cùng tham số/thứ tự, thêm `lockForDepartment`, thêm `createCostCenter` nguyên văn, chuyển hai hằng định dạng mã; 7 method Job Title + select, 10 method Employee + `escapeLikePattern` trùng nguyên văn | —                                                                            |
| Quét                                                                                                                                                                                      | cây cuối                           | một lớp ghi mỗi bảng (`JobTitleRepo`, `EmployeeRepo`, `CostCenterRepo`); mỗi provider khai một lần; root/Department chỉ dùng `*.service.ts`/`*.types.ts` của capability; 0 tham chiếu path cũ trong tài liệu hiện hành                                                       | `OrganizationRepo` export không còn consumer HTTP (giữ theo E4 tới H4.7)     |
| `pnpm check`                                                                                                                                                                              | cây cuối                           | exit 0; rules 95 tệp/796 link/0 lỗi; rules test 18/18; unit 59 suite/856 test; scripts 19/19; discovery 59/14/46; build                                                                                                                                                      | —                                                                            |
| `pnpm test:e2e`                                                                                                                                                                           | cây cuối                           | exit 0; 14 suite/274 test                                                                                                                                                                                                                                                    | —                                                                            |
| `pnpm test:integration`                                                                                                                                                                   | PostgreSQL riêng                   | exit 0; 46 suite/610 test (603 + 7), 273 s; không `42501`; 0 database sót; container đã xóa                                                                                                                                                                                  | remote CI chưa chạy                                                          |
| `pnpm openapi:export` rồi `cmp` + inventory operation/status/security/schema                                                                                                              | cây cuối                           | exit 0; byte-identical `14fd428b…`; 60 operation, 61 schema, inventory trùng                                                                                                                                                                                                 | —                                                                            |
| `pnpm rules:check`, `pnpm rules:format`, Prettier, ESLint, `git diff --check`                                                                                                             | cây cuối                           | exit 0                                                                                                                                                                                                                                                                       | —                                                                            |
| Ledger                                                                                                                                                                                    | cây cuối                           | gỡ `rootControllers.organization` (4) và `rootFiles.organization` (22); cap `department.service.ts` 508 giữ; không mục, allowlist hay export mới                                                                                                                             | —                                                                            |
| Metadata đồng bộ                                                                                                                                                                          | cây cuối                           | `module-structure.md` (tiêu đề + trạng thái chuyển tiếp), `ARCHITECTURE.md` (2 câu + link anchor), comment `organization.module.ts`; dòng roadmap và header plan của H4.3a (`e053664`), H4.2 (`0d2ac58`) nối commit thật                                                     | —                                                                            |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ (remote CI, Owner review).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
