# Plan: qd103-department-effective-year

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `d9c46552`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W2, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `verified` (08/11/2026, kiểm tra nhanh §4.5, chưa commit lúc ghi). PR: chưa có.

## Before coding

Đọc `src/modules/organization/README.md`, ADR-0019 (`docs/decisions/0019-module-tiers-and-public-api.md` — Hook không có
giá trị thay thế), `src/core/extension/hook.ts`, `test/support/process-graphs.ts`, `docs/rules/module-structure.md`,
`src/modules/organization/department-management/department-head.service.ts:66-100`.

## Design review

Audit thiết kế bằng subagent chỉ-đọc 08/11/2026: hạng mục này có 1 Cao (DA2-01), 5 TB (DA2-02 chéo, 09, 10, 12, 13), 1 Thấp
(DA2-11) + luật bỏ sót 1, 8 ⟹ đã sửa hết: DA2-01/02 (cửa sổ = kỳ `Y+1` chưa từng phát hành), DA2-09 + luật 8
(`headedUnitsFor`/`requireHeadFor` cho mọi việc B3, Task 3–4), DA2-10 (hook union có `tx`, chỉ ở `departmentCreate`, bỏ
_chưa bind ⟹ từ chối_), DA2-11 (ghi câu tạm chọn), DA2-12 (backfill theo placement/nhiệm kỳ), DA2-13 (test + file cụ thể).
Luật bỏ sót 1 (`QĐ-108e` nhắc Finance) đặt ở job của `qd103-budget-baseline-annual-check` Task 4. Finding không sửa: không có.

## Tasks

### Task 1: migration `departments.effective_from`

- Files: `prisma/models/organization.prisma`, `prisma/migrations/<ts>_department_effective_from/migration.sql`,
  `test/integration/organization/department-effective-from-migration.integration-spec.ts` (mới, theo mẫu
  `cost-center-link-migration.integration-spec.ts`).
- Depends on: `qd103-budget-cycle-ceilings` Task 1.
- Acceptance: cột NOT NULL; backfill = min(ngày tạo, placement sớm nhất, nhiệm kỳ trưởng phòng sớm nhất); test matrix _migration_.
- Verify: `pnpm db:migrate:deploy` trên DB test;
  `pnpm test:integration -- test/integration/organization/department-effective-from-migration.integration-spec.ts`.

### Task 2: luật tạo phòng theo kỳ + hook + tập phòng chia Trần

- Files: `organization/department-management/{department.service.ts, department.service.spec.ts, department.dto.ts,
department.mapper.ts}`, `organization/department/{department.policy.ts(+spec), department.errors.ts}`,
  `organization/public/organization.extension-points.ts`, `organization/organization.module.ts`,
  `budgets/cycle/department-creation-window.listener.ts` (+ spec), `budgets/cycle/cycle.repo.ts` (`ceilingDepartments`),
  README hai module; `test/support/process-graphs.ts` chỉ khi gate báo graph thiếu binder.
- Depends on: Task 1.
- Acceptance: test matrix R-I10 (tạo, response), AC-16, concurrency, QT 4.3; gate `extension-wiring` xanh.
- Verify: `pnpm exec jest src/modules/organization/department-management src/modules/organization/department src/modules/budgets/cycle`;
  `pnpm test:integration -- test/integration/organization/department-creation-window.integration-spec.ts` (mới);
  `pnpm test:http -- test/http/organization/departments.http-spec.ts`; `pnpm test:gates`.

### Task 3: phòng chưa hiệu lực — xếp người, điều chuyển, gán trưởng phòng

- Files: `organization/employee/{employee-first-placement.policy.ts(+spec), employee-first-placement.service.ts,
employee.repo.ts}`, `organization/department-management/department-head.service.ts` (+ spec),
  `personnel/transfer/{transfer-preconditions.service.ts, transfer.policy.ts(+spec)}`.
- Depends on: Task 2.
- Acceptance: test matrix R-I10 (xếp người, điều chuyển, gán trưởng phòng); test MF-3 hiện có của file đã đổi vẫn xanh.
- Verify: `pnpm exec jest src/modules/organization/employee src/modules/organization/department-management src/modules/personnel/transfer`;
  `pnpm test:http -- test/http/organization/first-placement.http-spec.ts`;
  `pnpm test:integration -- test/integration/organization/department-head-http.integration-spec.ts test/integration/personnel/transfer-not-yet-effective.integration-spec.ts` (file sau mới).

### Task 4: trưởng phòng của (Cost Center, năm) cho mọi việc B3

- Files: `budgets/budget/budget-facts.service.ts` (`headedUnitsFor`, `requireHeadFor`) + spec,
  `budgets/proposal/{proposal-sender.service.ts, proposal.service.ts, proposal-view.service.ts}`,
  `budgets/attachment/{budget-attachment-declaration.service.ts, budget-attachment-link.service.ts,
budget-attachment-query.service.ts}`, `budgets/budget-view/budget-view.service.ts`, `budgets/budget/budget.dto.ts`
  (`costCenterId` tùy chọn ở submit/`budgetMine`).
- Depends on: Task 3.
- Acceptance: test matrix R-I05 (cả 5 dòng); test đính kèm/đề xuất hiện có xanh.
- Verify: `pnpm exec jest src/modules/budgets/budget src/modules/budgets/proposal src/modules/budgets/attachment src/modules/budgets/budget-view`;
  `pnpm test:integration -- test/integration/budgets/new-department-head-b3.integration-spec.ts test/integration/budgets/budget-proposal-attachments.integration-spec.ts test/integration/requests/budget-proposals.integration-spec.ts` (file đầu mới).

### Checkpoint

Kiểm tra nhanh tracker §4.5. Tự review diff.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                            | Revision / môi trường            | Kết quả thực chạy                                 | Giới hạn / việc còn lại                     |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| `prisma migrate deploy` + `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`                                       | DB sạch (Docker Postgres)        | _No difference detected_                          | —                                           |
| `department-effective-from-migration` (5 test)                                                                                                | integration                      | xanh                                              | —                                           |
| `department-creation-window` (7), `department-not-yet-effective` (5), `new-department-head-b3` (4)                                            | integration                      | xanh                                              | transfer reschedule chưa kiểm ngày hiệu lực |
| Integration các file bị ảnh hưởng (organization, budgets, installation, identity-access, dashboards, data-import, requests, department-tools) | integration, `--maxWorkers=2..3` | 16 file đỏ do fixture đã sửa, rồi xanh (190 test) | không chạy full suite                       |
| jest `organization personnel budgets identity-access data-import requests cli`                                                                | unit                             | 203 file / 2598 test xanh                         | —                                           |
| `test:gates` (module-graph, extension-wiring, collection contract)                                                                            | gates                            | 330 xanh                                          | —                                           |
| `test:http` organization, budgets, personnel, platform                                                                                        | http                             | xanh (sau khi sửa ví dụ lỗi)                      | —                                           |
| typecheck, lint, `arch:check`, `rules:check`, `arch:graph`, `openapi:export`                                                                  | local                            | xanh                                              | —                                           |

Lệch spec / câu tạm chọn: (1) cột `effective_from` có `DEFAULT CURRENT_DATE` (đường cài đặt và fixture SQL = hiệu lực hôm nay), không chỉ NOT NULL; (2) nhập tay / import nhân viên vào phòng chưa hiệu lực báo `DEPARTMENT_INACTIVE` (dùng lại lý do sẵn có) thay vì mã mới; (3) [R2: đã đổi] không nới `MANAGER` ở token; route B3 admit người có grant, service xét đơn vị — QUESTIONS W2-N5; (4) `ceilingDepartments(tx, year)` đổi chữ ký; (5) [đã sửa ở R2] reschedule transfer kiểm `effective_from`; (6) [R2] MANAGER không mở rộng ở token, `RequireRolesOrGrants` cho route B3.

- [x] AC trong scope có bằng chứng.
- [x] Spec/plan phản ánh implementation cuối.
- [x] `pnpm check` và full suite CHƯA chạy.
