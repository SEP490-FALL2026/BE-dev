# Plan: ghi điều chuyển phòng hoặc chức vụ có ngày hiệu lực và căn cứ

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng (24/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, uncommitted). PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, [module structure](../../../rules/module-structure.md), [database rules](../../../rules/database-business.md), [API contract](../../../rules/api-contract.md) và mã của `organization/department` (`DepartmentHeadService`, `department-head.repo.ts`), `organization/employee` và `organization.service.ts` ở BE `7920ee5`. Đối chiếu: `employees.status` hiện chỉ `ACTIVE`/`TERMINATED` và chưa có mã nào ghi `TERMINATED`; giai đoạn trưởng phòng đã hỗ trợ ngày tương lai (`makeRoomForHead`); `employee_placements` chỉ có ràng buộc không giao nhau và phòng đang hoạt động; chưa có hàm ngày làm việc. Hạng mục này mở ngữ cảnh `personnel` nên có phase nền riêng. Tên migration `20261024081000`…`20261024081200` là tạm thời; migration là task riêng đi trước mã dùng nó. Nếu `g5-step-sla-and-alerts` đã tạo `src/core/working-days.ts` thì dùng lại.

## Tasks

### Phase 1: nền của ngữ cảnh `personnel`

### Task 1: thiết kế `ready`

- Status: `done`
- Files: `spec.md`, `plan.md`, `docs/roadmap.md` (scope map G6 do người tích hợp dán)
- Depends on: none
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: ADR và khung module

- Status: `done`: ADR-0017 `Proposed` và mục ở `docs/README.md`; một Nest module `PersonnelModule` (không có `personnel-http.module.ts`, xem spec); `PRISMA_MODEL_OWNER`, `PUBLIC_ROOT_CONTRACT_FILES`, `PUBLIC_CONTRACT_EXPORTS`, `INTRA_MODULE_CONTRACTS` cập nhật.
- Files: `docs/decisions/0017-personnel-context.md`, `src/modules/personnel/personnel.module.ts`, `src/modules/personnel/personnel-http.module.ts`, `src/app/app.module.ts`, `test/gates/architecture-boundaries.gate-spec.ts` (`PRISMA_MODEL_OWNER`), `test/gates/architecture-structure.gate-spec.ts` (`INTRA_MODULE_CONTRACTS`), `docs/rules/module-structure.md` (chỉ nếu ví dụ cần cập nhật), `ARCHITECTURE.md` (bản đồ module)
- Depends on: Task 1
- Acceptance: ADR `Proposed` ghi hướng phụ thuộc `personnel → organization, identity-access, licensing, requests, catalog, operating-parameters, audit` và lý do không đặt trong `organization`; module rỗng nhưng khởi động được, không vòng phụ thuộc
- Verify: `pnpm exec jest test/gates/module-graph.gate-spec.ts test/gates/architecture-boundaries.gate-spec.ts test/gates/architecture-structure.gate-spec.ts` → xanh

### Task 3: migration `work_state` và thông báo thay đổi tổ chức

- Status: `done`: tên thật `20261024140000_organization_employee_work_state`, `20261024140100_organization_change_announcements`; kiểm bằng `department-transfer-integrity` (`55000`, `23514`), migration áp vào CSDL rỗng không drift.
- Files: `prisma/migrations/20261024081000_organization_employee_work_state/migration.sql`, `prisma/migrations/20261024081100_organization_change_announcements/migration.sql`, `prisma/models/organization.prisma`
- Depends on: Task 1
- Acceptance: enum và cột `work_state` điền ngược đúng, `CHECK` với `status`, trigger đồ thị chuyển; bảng `organization_change_announcements` điền ngược mọi dòng sẵn có là đã thông báo; trigger bảo vệ lịch sử `employee_placements`
- Verify: nhóm test _what the database refuses_ (`23514`, `55000`) xanh; `pnpm prisma:validate`; `migrate diff --exit-code` = 0 trên CSDL kiểm thử riêng

### Task 4: quy tắc thuần và hàm ngày làm việc

- Status: `done` một phần theo thiết kế: `grounds.policy.ts`, `personnel-self-action.policy.ts`, `transfer.policy.ts` và spec; `src/core/working-days.ts` đã có từ G5 và hàm bao của `operating-parameters` chưa xây vì chưa có người dùng (thuộc `g6-service-account-handover`).
- Files: `src/core/working-days.ts` (+ spec), `src/modules/personnel/policies/grounds.policy.ts` (+ spec), `src/modules/personnel/policies/personnel-self-action.policy.ts` (+ spec), `src/modules/personnel/transfer/transfer.policy.ts` (+ spec), `operating-parameters/non-working-dates.service.ts` (hàm bao `addWorkingDays`, `subtractWorkingDays`)
- Depends on: Task 2
- Acceptance: căn cứ (loại, số hiệu, người ban hành, ngày; nhận ra mã `BM09-…`), tự ghi, một điều chuyển chờ, ngày hiệu lực, chức vụ, successor; ngày làm việc bỏ thứ Bảy, Chủ nhật và ngày không làm việc
- Verify: unit test của từng policy xanh; `policy-ownership.spec.ts` xanh

### Task 5: hàm ghi lịch sử của `organization` và bộ phát sự kiện

- Status: `done` với khác biệt: facade thứ hai `OrganizationHistoryService` (`OrganizationService` đã 399 dòng), sổ người nghe và sweeper ở `organization/change-announcement/`, sweeper đăng ký ở `OrganizationHttpModule`; không có `rescheduleStructureChange` (xem spec). Đọc `import-lookup.repo.ts` theo ngày hôm nay; `department-head.service.ts` giữ nguyên có chủ ý.
- Files: `organization/employee/employee.repo.ts`, `organization/department/department-head.repo.ts`, `organization/public/organization.api.ts`, `organization/public/organization.types.ts`, `organization/change-announcement/organization-change.service.ts`, `organization/change-announcement/organization-change.job.ts`, `organization/organization.module.ts`, rà `import-lookup.repo.ts` và `department-head.service.ts` (đọc theo ngày hôm nay)
- Depends on: Task 3, Task 4
- Acceptance: `scheduleStructureChange`, `rescheduleStructureChange`, `cancelStructureChange`, `scheduleHeadHandover`, `shiftScheduledHeadHandover`, `undoScheduledHeadHandover`, `setEmployeeWorkState`; `registerChangeListener` và sweeper phát đúng một lần mỗi thay đổi, mỗi thay đổi một transaction, lỗi listener lùi và thử lại
- Verify: integration test bộ phát (hai lần chạy, listener lỗi, gán trưởng phòng qua `US-03-06`) xanh; test hồi quy `department-head`, `employee-import` xanh

### Checkpoint 1

Gate chạy xanh trên cây làm việc (`pnpm check` phần liên quan, integration trên CSDL riêng), tự review diff theo spec; ADR-0017 ghi trong index ADR.

### Phase 2: ghi điều chuyển

### Task 6: migration điều chuyển

- Status: `done`: `20261024140200_personnel_department_transfers` (kèm thay trigger `department_head_requires_membership` bằng bản `range_agg` và mở rộng trigger lịch sử placement).
- Files: `prisma/migrations/20261024081200_personnel_department_transfers/migration.sql`, `prisma/models/personnel.prisma`
- Depends on: Task 3
- Acceptance: `department_transfers` và `department_transfer_changes` với `CHECK` trạng thái, unique một phần một điều chuyển chờ mỗi nhân viên, bảng thay đổi chỉ thêm
- Verify: nhóm test _what the database refuses_ xanh; `migrate diff --exit-code` = 0

### Task 7: dịch vụ ghi và API

- Status: `done` với khác biệt: `PersonnelFileHooks` có, `PersonnelFileDeadlines` chưa xây (chưa ai dùng). Sáu route (ghi, danh sách, chi tiết, nhật ký, đổi ngày, hủy) cùng một lúc vì cùng một repo và một bộ DTO.
- Files: `personnel/transfer/transfer.service.ts`, `transfer.repo.ts`, `transfer.dto.ts`, `transfer.http-errors.ts`, `transfer.mapper.ts`, `transfer.controller.ts`, `personnel/public/personnel.extension-points.ts`, `personnel/personnel-file-deadlines.service.ts`, `personnel/mappers/personnel-audit-event.mapper.ts`, `catalog.service.ts` (`getApplicationsOwnedBy`), `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 5, Task 6
- Acceptance: ghi, đọc danh sách/chi tiết, thứ tự khóa phòng → nhân viên → tài khoản, trưởng phòng đi cùng, cảnh báo Business Owner, registry `PersonnelFileHooks` và `PersonnelFileDeadlines` (rỗng/đọc được, chưa hook nào), `403` cho vai khác, AC-1→AC-8, AC-11, AC-13→AC-18, AC-22 ở ma trận test
- Verify: integration PostgreSQL và e2e của các AC đó xanh; `pnpm openapi:export` không lệch; test đếm câu lệnh của danh sách

### Checkpoint 2

Gate xanh; tự review diff theo AC; bàn giao cho `g5-step-reassignment-and-controlled-wait` hợp đồng `OrganizationChangeListener` (tệp types và ví dụ listener giả của test).

### Phase 3: đổi ngày và hủy

### Task 8: đổi ngày và hủy điều chuyển chưa hiệu lực

- Status: `done`: `transfer-change.service.ts`, cùng bộ test `department-transfer-change`.
- Files: `transfer.service.ts`, `transfer.repo.ts`, `transfer.dto.ts`, `transfer.controller.ts`, `transfer.http-errors.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`
- Depends on: Task 7
- Acceptance: đổi ngày và hủy chỉ khi chưa hiệu lực, lý do và căn cứ bắt buộc, chỉ định trưởng phòng dời/hủy theo và kiểm lại, lịch sử đổi phân trang, một điều chuyển chờ mỗi nhân viên giữ ở CSDL; AC-19→AC-21 ở ma trận test
- Verify: integration PostgreSQL của AC-19→AC-21 xanh; e2e kiểm kê và OpenAPI xanh

### Task 9: tài liệu và hồi quy

- Status: `done`: ARCHITECTURE.md, AGENTS.md, `docs/rules/security-jobs.md`, roadmap, README của items, spec và plan, ghi chú cho sáu hạng mục anh em.
- Files: `docs/rules/operational-commands.md` (không đổi nếu không có lệnh), `ARCHITECTURE.md`, `spec.md`/`plan.md` của hạng mục, ghi chú FE trong spec
- Depends on: Task 8
- Acceptance: tài liệu mô tả đúng module `personnel` và sự kiện; ghi cho hạng mục sau (`g6-transfer-tool-review`, `g6-offboarding-record`, `g6-leaver-request-closure`) các hàm dùng lại
- Verify: `pnpm rules:check`, `pnpm rules:format` → xanh; `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` xanh

### Checkpoint 3

Gate đầy đủ xanh trên revision cuối; tự review diff theo spec và AC.

## Verification and handoff

Chạy từ gốc BE theo [CONTRIBUTING](../../../../CONTRIBUTING.md) và [test guide](../../../../test/README.md): `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` (CSDL riêng), `pnpm openapi:export`.

| Lệnh / kiểm tra AC                                           | Revision / môi trường                                                                                                                                     | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Giới hạn / việc còn lại                                                                                                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`                                             | cây làm việc local, chưa commit (BE `7920ee5` cộng thay đổi G5/G6 chưa commit)                                                                            | xanh                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                            |
| `pnpm lint`, `pnpm format:check`                             | như trên                                                                                                                                                  | xanh                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                            |
| `pnpm exec jest --runInBand`                                 | như trên                                                                                                                                                  | 186 suite, 2810 ca xanh (mới: `grounds.policy`, `personnel-self-action.policy`, `transfer.policy`, 57 ca; kiểm cấu trúc, đồ thị module, chính sách dùng chung xanh)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                                                            |
| `pnpm openapi:export` rồi `pnpm test:e2e`                    | như trên, 241 thao tác                                                                                                                                    | 33 suite, 871 ca xanh (mới: `department-transfers.e2e-spec.ts`: 401, 403 cho sáu vai trên cả sáu route, 422)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                            |
| Tích hợp của hạng mục (PostgreSQL thật, CSDL riêng)          | như trên                                                                                                                                                  | `department-transfer-record` 22 ca, `department-transfer-change` 18 ca, `department-transfer-integrity` 10 ca: xanh                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | AC-5 và AC-6 chỉ một phần (xem spec)                                                                                                                                                                         |
| Tích hợp hồi quy (24 suite, 497 ca)                          | như trên                                                                                                                                                  | xanh: `organization`, `organization-concurrency`, `organization-identity-read-contracts`, `departments-http`, `department-tools-http`, `employee-manual-http`, `employee-maintenance-http`, `employee-imports-http`, `employee-import-seats-http`, `step-reassignment` (+ constraints), `auth-http`, `access-request-http`, `service-account-request`, `unit-only-cost-attribution`, `license-assignment-*`, `standard-toolset-http`, `application-owners-*`, `group-request-submit`, `password-self-service-http`, `account-management-http`, `onboarding-http`; một ca của `organization` (liệt kê khóa của `EmployeeRecord`) phải thêm `workState` | Chọn vì các suite này đổi `employees.status`/placement/giai đoạn trưởng phòng hay đọc qua `emitChange`, nơi trigger và bảng thông báo mới can thiệp; toàn bộ tích hợp do điều phối viên chạy một lần cuối G6 |
| Drift migration                                              | CSDL tạm trong container test, `prisma migrate deploy` ba migration mới rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` | không lệch (`No difference detected`), CSDL tạm đã xóa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —                                                                                                                                                                                                            |
| `pnpm prisma:validate`, `pnpm build`, `pnpm test:discovery`  | như trên                                                                                                                                                  | xanh (186 unit, 33 e2e, 180 tích hợp)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                                                                                                            |
| `pnpm rules:check`, `pnpm rules:format`, `pnpm format:check` | như trên                                                                                                                                                  | xanh (`rules:check`: 273 tệp, 0 lỗi)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                            |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối (mục _Như đã xây và khác biệt_ của spec); chưa có peer review.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`docs/rules/security-jobs.md`, ARCHITECTURE.md); phần chưa kiểm chứng ghi rõ trong spec.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
