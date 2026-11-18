# Plan: qd103-budget-baseline-annual-check

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `d9c46552`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W2, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `in-progress` (09/11/2026: Task 1, kiểm B4 + `baseReason`, Task 2 (`budgetCycleBaseline`, `budgetCyclePackage`) và phiên bản từ số liệu nền xong; Task 4: job nhắc hạn, 6 mã thông báo, báo trưởng phòng mới xong 09/11/2026). PR: chưa có.

## Before coding

Đọc `src/modules/budgets/README.md` (thứ tự khóa kỳ → proposal → version → năm sau `cycle-ceilings`),
`docs/rules/api-contract.md` (collection/detail), API public của `licensing`, `catalog`, `organization`;
`budgets/version/version-figures.service.ts` (`reserveReason`), `budgets/proposal/budget-head-change.listener.ts`,
`budgets/year-end/year-end.job.ts` (mẫu job), bảng `in_app_notifications` (unique `recipient, event_key`).

## Design review

Audit thiết kế bằng subagent chỉ-đọc 08/11/2026: hạng mục này có 0 Cao (DA2-30 chéo xử lý ở `cycle-ceilings` Task 4 bằng
Trần năm đủ lớn), 7 TB (DA2-14, 15, 16, 17, 18, 19, 31 chéo) + luật bỏ sót 1, 2, 5, 6, 7 ⟹ đã sửa hết: DA2-14 (điều kiện
(a)–(e), `today > hạn nộp`), DA2-15 + luật 5, 6 (Super Admin/Finance nhận, trưởng phòng mới được báo, eventKey theo hạn ⟹
đổi hạn nhắc lại), DA2-16 (tập B4 + khác đồng tiền — tạm chọn), DA2-17 + luật 4 (tổng đề xuất vs Trần năm ở đây; dòng gắn
cờ/thứ hạng chuyển `lines-cleanup` Task 4 vì cờ/hạng sinh ở đó), DA2-18 + luật 2 (`baseReason` — tạm chọn), DA2-19 (test),
DA2-31 (Verify đúng file, manifest), luật 1 (`BUDGET_COST_CENTER_SETUP_DUE`), luật 7 (Người duyệt chi đọc số liệu nền).
Phụ thuộc `department-effective-year` giữ, ghi lý do (AC-16, kế nhiệm). Finding không sửa: không có.

## Tasks

### Task 1: migration `budget_versions.origin`, `base_reason`

- Files: `prisma/models/budgets.prisma`, `prisma/migrations/<ts>_budget_version_origin/migration.sql`.
- Depends on: `qd103-budget-cycle-ceilings` Task 1.
- Acceptance: enum `BudgetVersionOrigin` + cột default `PROPOSAL`; `base_reason text NULL`; dòng cũ `PROPOSAL`.
- Verify: `pnpm db:migrate:deploy` trên DB test; `pnpm prisma:generate`.

### Task 2: số liệu nền và gói tổng hợp (đọc)

- Files: `budgets/cycle/{baseline.service.ts, package.service.ts, cycle-read.policy.ts(+spec), cycle.controller.ts,
cycle.dto.ts}`, hàm public mới ở `licensing/public`/`catalog/public` nếu thiếu, `test/support/api-coverage-manifest.ts`.
- Depends on: Task 1; `qd103-department-effective-year` Task 2 (`ceilingDepartments` có ngày hiệu lực).
- Acceptance: test matrix R-I03, AC-12, quyền.
- Verify: `pnpm exec jest src/modules/budgets/cycle`;
  `pnpm test:integration -- test/integration/budgets/budget-cycle-baseline.integration-spec.ts test/integration/budgets/budget-cycle-package.integration-spec.ts` (mới);
  `pnpm test:http -- test/http/budgets/budget-cycles.http-spec.ts`.

### Task 3: kiểm B4 khi gửi; `baseReason`; phiên bản từ số liệu nền

- Files: `budgets/version/{version.service.ts, version-creation.service.ts, version-figures.service.ts,
version-history-snapshot.json.ts}`, `budgets/budget/{budget.policy.ts(+spec), budget.dto.ts, budget.errors.ts,
budget.http-errors.ts}`.
- Depends on: Task 2.
- Acceptance: test matrix R-I06, QĐ-100v, R-I05 (lập `BASELINE`), AC-5; test hiện có của phiên bản xanh (fixture kỳ có Trần năm đủ lớn).
- Verify: `pnpm exec jest src/modules/budgets/version src/modules/budgets/budget`;
  `pnpm test:integration -- test/integration/budgets/budget-annual-check.integration-spec.ts test/integration/budgets/budget-baseline-version.integration-spec.ts` (mới) `test/integration/requests/budget-versions.integration-spec.ts test/integration/requests/budget-decisions.integration-spec.ts test/integration/budgets/budget-version-history.integration-spec.ts`;
  `pnpm test:e2e -- test/e2e/budget-version.e2e-spec.ts test/e2e/department-without-head-journey.e2e-spec.ts`;
  `pnpm test:flows -- test/flows/mf4-budget.flow-spec.ts`.

### Task 4: job nhắc hạn, nhắc Cost Center, báo trưởng phòng mới

- Files: `budgets/cycle/{cycle-deadline.job.ts, cycle-deadline.service.ts(+spec)}`,
  `budgets/proposal/budget-head-change.listener.ts`, `budgets/budget/budget-notifier.service.ts`,
  `notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts` (6 mã mới).
- Depends on: Task 3.
- Acceptance: test matrix R-I05 (job, đổi hạn), AC-1, AC-4, QĐ-108e.
- Verify: `pnpm exec jest src/modules/budgets/cycle src/modules/budgets/proposal`;
  `pnpm test:integration -- test/integration/budgets/budget-cycle-deadline.integration-spec.ts` (mới).

### Checkpoint

Sau Task 3 và Task 4: kiểm tra nhanh tracker §4.5; `openapi:export` drift đúng các operation đã ghi. Tự review diff.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                          | Revision / môi trường | Kết quả thực chạy                                                                                                                    | Giới hạn / việc còn lại |
| ----------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `prisma migrate deploy` + `migrate diff --from-config-datasource --to-schema prisma --exit-code`            | DB sạch               | _No difference detected_                                                                                                             | —                       |
| jest `src/modules/budgets` (gồm `annualCheck` unit)                                                         | unit                  | 17 file / 230 test xanh (trước khi thêm unit mới), `budget.policy.spec` 56 xanh                                                      | —                       |
| `budget-annual-check.integration-spec` (mới, 6 test) + `budget-version-history`, `requests/budget-versions` | integration           | 3 file / 53 test xanh                                                                                                                | —                       |
| integration `budgets` + `requests` (lượt rộng)                                                              | integration           | 122/124 file xanh; 2 file đỏ do PATCH `base` thiếu `baseReason` ⟹ sửa helper `updateVersion` (mặc định lý do khi có `base`) rồi xanh | —                       |
| `test:http` platform + budgets; `test:gates`; lint, typecheck, arch:check, rules:check, openapi:export      | local                 | xanh                                                                                                                                 | —                       |

Phần đã làm: Task 1 (migration `budget_version_origin`), Task 3 (kiểm B4 lúc gửi: khóa kỳ `FOR UPDATE` trước đề xuất/phiên bản, `BUDGET.OVER_ANNUAL_CEILING`, `CYCLE_CURRENCY_MISMATCH`, `CYCLE_NOT_PUBLISHED`; `baseReason` bắt buộc khi đổi `base`, lưu cột và lịch sử).
Đợt 2 (reads): `budgetCycleBaseline` và `budgetCyclePackage` (`BaselineService`, `PackageService`, `baseline.policy`; đọc qua `CatalogApi.getBaselineSubscriptions`, `LicensingApi.countSeatsOfSubscriptions`, `OrganizationReadApi.getUnitCostCenterIds`; dạng map theo id nên không vào registry mảng). Test: `baseline.policy.spec` (8), `budget-cycle-baseline.integration-spec` (7), `budget-cycles.http-spec` (thêm 401/403/422). Đã sửa thêm: `lockByCode` chỉ đọc `effective_from` khi có `onDay` (CLI `ops:assign-subscription-owner` chạy trên schema cũ). Đợt 2b: `budgetVersionCreate` `source: BASELINE` (`VersionBaselineCreationService`, `BaselineService.requireVersionAllowed`, `baselineVersionRefusal`; 409 `BUDGET.BASELINE_VERSION_NOT_ALLOWED` với `details.reason` ∈ CYCLE_NOT_PUBLISHED, BEFORE_DEADLINE, HAS_HEAD, HAS_SUCCESSOR, HAS_PROPOSAL; `FINANCE.SETUP_INCOMPLETE` khi thiếu Cost Center); test `budget-baseline-version.integration-spec` (9) + unit policy. Còn lại (cũ): (`source: BASELINE`, `BUDGET.BASELINE_VERSION_NOT_ALLOWED`), Task 4 (job nhắc hạn, 6 mã thông báo, báo trưởng phòng mới).

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy.
