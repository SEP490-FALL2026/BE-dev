# Plan: qd103-remove-business-owner

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `712044f9`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W5, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **ba lượt** — Phase 1 expand + catalog (Task 1–3, Checkpoint A), Phase 2 requests + personnel + inspect (Task 4–5, Checkpoint B), Phase 3 seed,
  contract, test hỗ trợ (Task 6–8, Checkpoint C). Ước ~140 file (60 test).

## Before coding

Đọc `src/modules/catalog/README.md` (catalog-entry, retirement, plan-terms), `src/modules/requests/README.md` (assessment, `SBF-15`), `src/modules/personnel/README.md`,
`src/modules/installation/README.md` (`ops:inspect`), `docs/rules/module-structure.md` (`personnel/offboarding` đủ 25 — chỉ sửa file có sẵn; `catalog-entry` 24),
`docs/rules/api-contract.md` (lỗi có ví dụ, zod strict ⟹ 400), `docs/rules/database-business.md` (DB-05, DB-16). Danh sách file: `grep -rliE
"business.?owner|businessOwner|BUSINESS_OWNER" src test prisma scripts` trên `712044f9` (HEAD `712044f9`: src 75 + `src/generated` 13, test 60, scripts 1,
prisma/models 4). Bắt đầu sau `qd103-subscription-alerts-incidents` Checkpoint B (tuần tự — cùng sửa `notifications`, seed).

## Design review

Audit `design-audit-w5.md` (08/11/2026) — hạng mục này: 0 Cao · 3 TB · 2 Thấp (gồm phần chung DA5-34, 40). Mọi finding đã kiểm với nguồn trước khi sửa.

| Finding                                                         | Mức  | Kết quả                                                                                                                                | Sửa ở                                           |
| --------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| DA5-37 backfill bỏ sót phần mềm nội bộ/`K4`; Q-70 chặn liên kết | TB   | đã sửa — thứ tự backfill (thuê bao → Business Owner cũ là IT Admin dùng được → NULL); liên kết không chặn, cảnh báo; `ops:inspect` đếm | spec _Ownership_, _Behavior_ 2, 5; Task 1, 4, 5 |
| DA5-38 ô `CLOSED` trước khi có trạng thái                       | TB   | đã sửa — bỏ ô; làm ở `close-kpi4-savings` Task 2                                                                                       | spec _Behavior_ 3, _Test matrix_                |
| DA5-39 thiếu file, số grep sai                                  | Thấp | đã sửa — thêm 7 file catalog, số theo HEAD `712044f9`                                                                                  | spec _Sizing_, _Ownership_; Task 2              |
| DA5-34 DB-05                                                    | Thấp | đã sửa                                                                                                                                 | spec _Ownership_                                |
| DA5-40 file chung với `alerts-incidents`                        | TB   | đã sửa — giao sau `alerts-incidents` Checkpoint B                                                                                      | _Before coding_, Task 1                         |

Không sửa: không có. Câu: Q-66, Q-67 theo nguồn; Q-69 → ledger `NGOÀI-PHẠM-VI`; Q-68 (thêm bước Business Owner cũ), Q-70 (đổi sang không chặn) còn chờ Owner.

## Tasks

### Phase 1 — expand và catalog

### Task 1: migration `application_responsible_it_admin`

- Files: `prisma/migrations/<ts>_application_responsible_it_admin/migration.sql` (cột + FK + index, backfill ba bước, `DROP NOT NULL` hai cột), `prisma/models/catalog.prisma`;
  test `test/integration/catalog/application-responsible-migration.integration-spec.ts` (mới).
- Depends on: `qd103-subscription-alerts-incidents` Checkpoint B.
- Acceptance: test matrix _Q-68 / DA5-37_, _migration_ (vế expand).
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/catalog/application-responsible-migration.integration-spec.ts`;
  `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`.

### Task 2: catalog-entry, plan, gói xin được, nội bộ — trường IT Admin phụ trách; gỡ owner + lịch sử

- Files: `src/modules/catalog/catalog-entry/{application.dto.ts,application.service.ts,application.service.spec.ts,application.policy.ts,application.policy.spec.ts,application-view.service.ts,application-write-guards.service.ts,application.repo.ts,application.types.ts,application.errors.ts,application.http-errors.ts,applications.controller.ts,application-facts.service.ts,application-list.service.ts,application-state.policy.ts,application-state.policy.spec.ts}`,
  xóa `src/modules/catalog/catalog-entry/{application-owner.service.ts,application-owners.controller.ts}`; `src/modules/catalog/plan/{plan.repo.ts,plan-facts.service.ts,plan.types.ts}`,
  `src/modules/catalog/requestable-software/{requestable-software.dto.ts,requestable-software.repo.ts}`, `src/modules/catalog/internal-software-registration/internal-software-registration.service.ts`,
  `src/modules/catalog/public/{catalog.api.ts,catalog.types.ts,subscription-period.api.ts}`, `src/modules/catalog/catalog.module.ts`;
  test cập nhật `test/integration/catalog/application-http.integration-spec.ts`, `test/http/catalog/application-catalog.http-spec.ts`, `test/integration/catalog/requestable-software.integration-spec.ts`;
  xóa `test/integration/catalog/application-owners-http.integration-spec.ts`, `test/http/catalog/application-owners.http-spec.ts`.
- Depends on: Task 1.
- Acceptance: test matrix R-E03 tạo, AC-3/AC-5, AC-2, Q-68 (đọc), _xóa operation_ (hai route owner).
- Verify: `pnpm exec jest src/modules/catalog/catalog-entry src/modules/catalog/plan src/modules/catalog/requestable-software src/modules/catalog/internal-software-registration`;
  `pnpm test:integration -- test/integration/catalog/application-http.integration-spec.ts test/integration/catalog/requestable-software.integration-spec.ts`;
  `pnpm test:http -- test/http/catalog/application-catalog.http-spec.ts`.

### Task 3: ngừng dùng không xác nhận; bỏ ý kiến điều khoản

- Files: `src/modules/catalog/application-retirement/{application-retirement.controller.ts,application-retirement.dto.ts,application-retirement.policy.ts,application-retirement.policy.spec.ts,application-retirement.repo.ts,application-retirement.service.ts}`,
  `src/modules/catalog/plan-terms/{plan-terms.controller.ts,plan-terms.dto.ts,plan-terms.repo.ts,plan-terms.service.ts,plan-terms.types.ts,plan-terms.errors.ts,plan-terms.http-errors.ts}`;
  test `test/integration/catalog/application-retirement-http.integration-spec.ts`, `test/integration/catalog/plan-terms-http.integration-spec.ts`,
  `test/http/catalog/application-retirement.http-spec.ts`, `test/http/catalog/plan-terms.http-spec.ts`.
- Depends on: Task 2.
- Acceptance: test matrix _Q-67 ngừng dùng_, _xóa operation_ (3 route).
- Verify: `pnpm exec jest src/modules/catalog/application-retirement src/modules/catalog/plan-terms`;
  `pnpm test:integration -- test/integration/catalog/application-retirement-http.integration-spec.ts test/integration/catalog/plan-terms-http.integration-spec.ts`;
  `pnpm test:http -- test/http/catalog/application-retirement.http-spec.ts test/http/catalog/plan-terms.http-spec.ts`.

### Checkpoint A (hết lượt 1)

`getApplicationsOwnedBy` giữ làm alias tạm (gọi `getResponsibleItemsOf`) tới Task 5 để `pnpm typecheck` xanh, ghi trong _Verification_. Kiểm tra nhanh §4.5;
`pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` trên DB sạch; `openapi:export` diff chỉ ở `application*`, `planTerm*`, `requestablePlan*`.

### Phase 2 — requests (`SBF-15`), personnel, inspect

### Task 4: đánh giá, đăng ký nội bộ, liên kết gói

- Files: `src/modules/requests/assessment/{assessment.dto.ts,assessment-patch.service.ts,assessment-view.service.ts,assessment.errors.ts,assessment.http-errors.ts,assessment.policy.ts,assessment.policy.spec.ts,catalog-link.service.ts,internal-registration.service.ts}`,
  `src/modules/requests/access-request/{assessment-read.repo.ts,assessment-record.types.ts}`, `src/modules/requests/proposal-review/proposals.controller.ts`;
  test `test/integration/requests/access-request-internal-registration.integration-spec.ts`, `test/integration/requests/access-request-new-software.integration-spec.ts`.
- Depends on: Checkpoint A.
- Acceptance: test matrix L2-36, `QĐ-103p`, _assessment_, Q-70.
- Verify: `pnpm exec jest src/modules/requests/assessment src/modules/requests/access-request`;
  `pnpm test:integration -- test/integration/requests/access-request-internal-registration.integration-spec.ts test/integration/requests/access-request-new-software.integration-spec.ts`.

### Task 5: nghỉ việc, điều chuyển, thông báo, `ops:inspect`; bỏ alias

- Files: `src/modules/personnel/offboarding/{offboarding.dto.ts,offboarding.mapper.ts}`, `src/modules/personnel/offboarding/detail/offboarding-detail.service.ts`,
  `src/modules/personnel/transfer/{transfer.dto.ts,transfer.service.ts,transfer.types.ts,transfers.controller.ts}`, `src/modules/notifications/public/notifications.types.ts`,
  `src/modules/notifications/inbox/inbox.policy.ts` (+ spec), `src/modules/installation/inspect/{inspection-facts.policy.ts,inspection-facts.policy.spec.ts}`, `src/modules/catalog/public/catalog.api.ts` (`countApplicationsWithoutResponsible`),
  `src/cli/inspect/inspect-report.ts` (+ spec), `src/modules/catalog/public/catalog.api.ts` (bỏ alias); test `test/integration/requests/department-transfer-record.integration-spec.ts`,
  `test/integration/requests/offboarding-record.integration-spec.ts`, `test/integration/installation/inspect.integration-spec.ts`.
- Depends on: Task 4.
- Acceptance: test matrix _nghỉ việc_, _điều chuyển_, L3-18 vế BO, `ops:inspect`.
- Verify: `pnpm exec jest src/modules/personnel/offboarding src/modules/personnel/transfer src/modules/notifications/inbox src/modules/installation/inspect src/cli/inspect`;
  `pnpm test:integration -- test/integration/requests/department-transfer-record.integration-spec.ts test/integration/requests/offboarding-record.integration-spec.ts test/integration/installation/inspect.integration-spec.ts`;
  `pnpm typecheck`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh §4.5; `openapi:export` diff thêm `accessRequest*`, `offboardingCaseGet`, `departmentTransferRecord`; flow giữ không vỡ:
`pnpm test:flows -- test/flows/mf2-offboarding.flow-spec.ts test/flows/mf2-abrupt-departure.flow-spec.ts test/flows/mf3-transfer.flow-spec.ts test/flows/mf1-request-contract.flow-spec.ts`.

### Phase 3 — seed, contract, test hỗ trợ

### Task 6: seed (`ops:seed` vỡ từ Task 2)

- Files: `src/cli/seed/fixture/demo-fixture.types.ts`, `src/cli/seed/fixture/shared-demo-v3/catalog.ts`, `src/cli/seed/fixture/shared-demo-v3.spec.ts`,
  `src/cli/seed/steps/catalog.steps.ts` (+ spec), `src/cli/seed/fixture/shared-demo-v3/README.md`.
- Depends on: Checkpoint B.
- Acceptance: test matrix _seed_.
- Verify: `pnpm exec jest src/cli/seed`;
  `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`.

### Task 7: migration contract

- Files: `prisma/migrations/<ts+1>_remove_business_owner/migration.sql`, `prisma/models/{catalog,requests,organization}.prisma`; test Task 1 thêm ca contract.
- Depends on: Task 6.
- Acceptance: test matrix _migration_ (vế contract).
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/catalog/application-responsible-migration.integration-spec.ts`;
  `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`.

### Task 8: test hỗ trợ, gates, README

- Files: `test/support/{api-coverage-manifest.ts,openapi-example-manifest.ts,openapi-example-route-codes-catalog.ts,openapi-example-route-codes-requests.ts,api-collection-registry.ts,api-collection-registry-nested.ts,api-collection-registry-events.ts,devices-harness.ts,expansion-world.ts,legacy-unit-only-fixture.ts,offboarding-harness.ts,seat-baseline-harness.ts,subscription-http-harness.ts,ai-summary-harness.ts}`,
  `test/gates/architecture-boundaries.gate-spec.ts`, fixture ở `test/integration/{catalog,licensing,requests,platform,organization,operating-parameters,onboarding,identity-access,data-import}/*`
  (40 file — `grep` ở _Before coding_), `test/http/catalog/*` (4 file), `scripts/verify/merged-migrations.txt` (chỉ nếu tên migration đổi);
  README `src/modules/{catalog,requests,personnel,notifications,installation}/README.md`.
- Depends on: Task 7.
- Acceptance: test matrix _hồi quy_; grep mục 7 của spec rỗng; danh sách test đổi kỳ vọng kèm lý do trong _Verification_.
- Verify: `pnpm test:gates`; `pnpm test:integration -- test/integration/catalog test/integration/requests/access-request-new-software.integration-spec.ts`;
  `pnpm test:flows -- test/flows/mf1-request-contract.flow-spec.ts`; `pnpm rules:check`.

### Checkpoint C (hết lượt 3)

Kiểm tra nhanh §4.5; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` trên DB sạch; `openapi:export` diff = 5 xóa + 12 đổi;
tự review spec mục 1–8.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
