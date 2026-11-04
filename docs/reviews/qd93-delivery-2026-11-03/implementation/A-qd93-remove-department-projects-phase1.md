# A-qd93-remove-department-projects-phase1 (subagent implement, 02/11/2026)

Nhánh `feat/qd93-remove-department-projects` (cha: `feat/qd93-direct-manager-spending-approver-roles` @ 99b7234e). Chỉ Phase 1.

## Trạng thái đầu
HEAD c3ab636f (1A.1, 1A.2, 1B.1 đỏ + thay test, 1B.2). 12 file chưa commit của 1B.3 (registry, gate, manifest, openapi, docs/generated).
Đối chiếu `git diff` với plan 1B.3: đúng hướng (xóa 4 mục NESTED, `closed` events, regex `REMOVED_OPERATION_FINDING`, manifest, 301 operations).

## Việc đã làm (theo thứ tự)
1. `pnpm typecheck` xanh; `pnpm lint` đỏ: prettier (events, gate-spec), 4 biến thừa của 1B.1 (`request`, `unique`, `auditOf`,
   `rowCount`), và eslint-suppressions còn mục `proposal.service.ts complexity` không còn xảy ra (1A.2 làm giảm nợ) ->
   `pnpm lint:prune`; `lint-debt.gate-spec.ts` CEILINGS hạ 59/112/37 -> 58/111/36 (luật "chỉ hạ").
2. `finding` `QĐ-93h` viết lại bằng chữ `QĐ-93h` (events + regex gate).
3. Gate `architecture-boundaries`: thử bỏ `Project`/`ProjectDepartment` khỏi `PRISMA_MODEL_OWNER` -> đỏ ("assigns every Prisma model to an
   owning module") -> hoàn nguyên, để phase 2 (đúng điều kiện plan).
4. `test:http` toàn `test/http/platform/*` + 3 file project -> `openapi-request-rules` đỏ: sàn lá ngày 92 -> 91 (mất 1 lá ngày của
   body dự án đã gỡ, `hrBasis` dự án). Đã hạ sàn, ghi trong bảng ánh xạ.
5. Thêm ca integration "LD-12 retired (QĐ-93h)" vào `organization-identity-read-contracts.integration-spec.ts` (plan 1B.1 yêu cầu
   ca `departmentGet` không chạm project; `request-project-label-retired` đã có cho `departmentGet`/`departmentUpdate`).
6. Sửa chú thích `department-harness.ts` và tiêu đề describe của `department-contract-http`.
7. Commit: `040d1d43` (1B.1 follow-up: biến thừa, lint-debt, ca mới), `8b2d04dc` (1B.3).
8. Drift DB-16 cục bộ: tạo `slm_qd93_p1_drift` trên slm-test-db, `migrate deploy` (tới `20261102082906_identity_direct_roles`),
   `migrate diff --from-config-datasource --to-schema prisma --exit-code` -> `No difference detected`; đã DROP DATABASE.

## Kết quả lệnh (log: a5-http.log, a5-int.log, a5-unit.log, a5-final.log cùng thư mục)
- `pnpm typecheck`, `lint`, `arch:check` (1591 modules, không vi phạm), `rules:check` (0 errors), `test:gates` (16 suite, 326 test),
  `openapi:export` (không drift), `arch:docs:check`: exit 0.
- `pnpm test:http -- <15 file>`: 15 suite 288 test (1 file chạy lại sau khi hạ sàn: 12/12).
- `pnpm test:integration -- <8 file>` + `organization-identity-read-contracts` chạy lại: 117/117 và 9/9.
- `pnpm test -- <11 spec>`: 142/142. `pnpm prisma:validate` xanh.
- rg acceptance 1A.2/1B.2: `projectLabel` chỉ còn `RETIRED_DRAFT_BODY_KEYS` + 2 spec; không còn `ProjectService|project/`,
  `project_label|project_departments|ProjectStatus|FROM projects|JOIN projects` trong `src`.

## Lệch spec / ghi chú
- Gate `architecture-boundaries` còn `Project`/`ProjectDepartment` trong `PRISMA_MODEL_OWNER` đến phase 2.
- Không chạy toàn bộ `test:integration`/`test:e2e` (D-S26 phải hỏi Owner): harness `request-harness.ts`, `department-harness.ts` đổi và dùng
  ở nhiều file.
- `plan.md` "Triển khai" đặt `in-progress` (gate `rules:check` chỉ nhận danh sách cố định).
