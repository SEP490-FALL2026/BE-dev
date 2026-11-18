# Plan: qd103-subscription-adjustment-point

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `712044f9`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W5, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **bốn lượt** — Phase 1 dữ liệu + catalog (Task 1–3, Checkpoint A), Phase 2 capability mới + kỳ đang chạy (Task 4–7, Checkpoint B),
  Phase 3 gỡ luồng cũ + contract (Task 8–10, Checkpoint C), Phase 4 seed + flow (Task 11–12, Checkpoint D). Ước ~125 file.

## Before coding

Đọc `src/modules/licensing/README.md` (thứ tự capability, lock order), `src/modules/catalog/README.md` (`isPrimaryForPlan`, chuỗi kỳ),
`docs/rules/module-structure.md` (≤ 25 file/thư mục: `catalog/subscription` và `personnel/offboarding` đã 25 — chỉ sửa file có sẵn, file mới vào
`subscription/pool/` hoặc capability mới; nhóm chỉ thấy trong capability; R6 không vòng), `docs/decisions/0019-module-tiers-and-public-api.md`
(licensing T4 → catalog T4; `requests` T5, `personnel` T6 đăng ký extension point của licensing), `docs/rules/database-business.md` (DB-05, DB-16,
append-only), `src/core/extension/hook.ts`. Đối chiếu `file:dòng` ở spec trên `712044f9`. Lệnh đã kiểm trong `package.json`: `db:migrate:deploy`,
`prisma:generate`, `typecheck`, `test:integration`, `test:http`, `test:flows`, `test:gates`, `arch:check`, `arch:capabilities`, `openapi:export`,
`rules:check`. Phase 2 trở đi cần W4 PASS (`addPoolSeat`, `isLive`, `capacityOf`, `claimDocument`): chưa PASS thì dừng sau Checkpoint A và báo.

## Design review

Audit `design-audit-w5.md` (08/11/2026) — hạng mục này: 5 Cao (DA5-06 phần) · 8 TB · 5 Thấp (gồm phần chung DA5-03, 13, 34, 40). Mọi finding đã kiểm với nguồn trước khi sửa.

| Finding                                                              | Mức  | Kết quả                                                                                                                          | Sửa ở                                      |
| -------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| DA5-01 quyết định thu hồi chưa thành tác vụ không bị loại            | Cao  | đã sửa — `RevocationDecisionContributions` (personnel đăng ký; W6 thêm `MF-5`); fixture AC-22 khôi phục                          | spec _Behavior_ 4, Task 4                  |
| DA5-02 `renew()` nối vào kỳ cũ (`assignment-renewal.service.ts:71`)  | Cao  | đã sửa — kỳ đang chạy, hai bản ghi qua R; thu hồi thất bại chuyển kỳ hoặc _kẹt_ có thông báo                                     | spec _Behavior_ 8, Task 7                  |
| DA5-03 sau `CANCEL` vẫn cấp được, ngõ cụt                            | Cao  | đã sửa — `stopGrants` (cột catalog) ⟹ ra khỏi `isLive`/`capacityOf`; thay `CANCEL` một lần (Q-81); vế sự cố ở `alerts-incidents` | spec _Behavior_ 6, Task 6                  |
| DA5-04 `subscription_quantity_events` thiếu đường, thiếu giá quy đổi | Cao  | đã sửa — event ở mọi đường, cột giá tháng quy đổi + chu kỳ, backfill mọi kỳ giao tháng migration                                 | spec _Ownership_, _Behavior_ 10, Task 1, 3 |
| DA5-06 (phần AP) chụp số cần lúc mở                                  | Cao  | đã sửa — `opening_seats_needed`                                                                                                  | spec _Behavior_ 3, Task 5                  |
| DA5-13 quyền ghi khác quyền đóng                                     | Thấp | đã sửa — cùng luật: người phụ trách, không dùng được ⟹ IT Admin bất kỳ (Q-72)                                                    | spec _Behavior_ 5                          |
| DA5-25 `approvedAwaitingGrant` đếm trùng                             | TB   | đã sửa — chỉ thuê bao chính, khử trùng                                                                                           | spec _Behavior_ 4                          |
| DA5-26 thiếu mốc; R của `END_DATE`                                   | TB   | đã sửa — `renewalDayOf` chung, `NO_ADJUSTMENT_ANCHOR`                                                                            | spec _Behavior_ 1–2                        |
| DA5-27 UNIQUE theo `anchor_date`                                     | TB   | đã sửa — `(subscription_id, period_start)`; job làm mới mốc của điểm mở chưa ghi (catalog không ghi bảng licensing)              | spec _Ownership_, _Behavior_ 3; Task 5     |
| DA5-28 CHECK không đọc bảng khác; tệp không thành `READY`            | TB   | đã sửa — cột `subscription_id` trên `document_attachments`, sửa hai CHECK, FK + UNIQUE                                           | spec _Ownership_, Task 1                   |
| DA5-29 bỏ khóa cũ ở Phase 1                                          | TB   | đã sửa — bỏ ở Task 8; `activeNotices` theo điểm mở; thêm file registry                                                           | Task 2, 8                                  |
| DA5-30 đường dẫn sai/thiếu                                           | TB   | đã sửa — dùng `migration-preflight-judgement.policy.ts`; thêm file test/support; grep gồm `test scripts`                         | Task 8, 9                                  |
| DA5-31 mốc hóa đơn chỉ khớp đầu kỳ                                   | TB   | đã sửa — điểm chi phối                                                                                                           | spec _Behavior_ 13, Task 6                 |
| DA5-32 `effectiveOn` chưa nghĩa                                      | Thấp | đã sửa — bỏ (= R), gửi ⟹ 400                                                                                                     | spec _Behavior_ 5                          |
| DA5-33 thiếu mức dùng                                                | Thấp | đã sửa — `usage.status = NOT_AVAILABLE`; ledger W6 (việc chat review)                                                            | spec _Behavior_ 4                          |
| DA5-34 DB-05                                                         | Thấp | đã sửa — dòng _Không hoàn tác_                                                                                                   | spec _Ownership_                           |
| DA5-40 file chung giữa hạng mục                                      | TB   | đã sửa — giao tuần tự (bảng ở REVISION-NOTES)                                                                                    | —                                          |
| DA5-44 PATCH tăng tự do                                              | Thấp | đã sửa — đòi lý do; cấp cho Request qua `addPoolSeat`                                                                            | spec _Behavior_ 9                          |

Không sửa: không có. Câu: Q-53, 54, 73, 75, 76 theo nguồn; Q-74 kỹ thuật; Q-72 tạm chọn đổi; Q-81 mới.

## Tasks

### Phase 1 — dữ liệu và catalog

### Task 1: migration `subscription_adjustment_values` + `subscription_adjustment_points`

- Files: `prisma/migrations/<ts-1>_subscription_adjustment_values/migration.sql` (`ADD VALUE 'VENDOR_EVIDENCE'`), `prisma/migrations/<ts>_subscription_adjustment_points/migration.sql`
  (4 enum, bảng điểm + CHECK + trigger kết quả, `subscription_quantity_events` + trigger append-only + backfill, cột `document_attachments.subscription_id` + hai CHECK,
  `subscriptions.grants_stopped_at`),
  `prisma/models/licensing.prisma`, `prisma/models/catalog.prisma`; test `test/integration/licensing/subscription-adjustment-migration.integration-spec.ts` (mới, mẫu
  `test/integration/catalog/shared-pool-subscription-fields-migration.integration-spec.ts`).
- Depends on: none (W1 đã có).
- Acceptance: test matrix _migration_ (vế expand): CHECK, UNIQUE `(subscription_id, period_start)`, trigger chỉ cho một lần thay `CANCEL`, backfill gồm kỳ hết hạn giữa
  tháng migration, UPDATE/DELETE event bị chặn, `document_attachments` `subscription_id` chỉ với `VENDOR_EVIDENCE`.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`; `pnpm test:integration -- test/integration/licensing/subscription-adjustment-migration.integration-spec.ts`.

### Task 2: tham số mới và mã thông báo mới (chưa xóa gì)

- Files: `src/modules/operating-parameters/parameter-definitions.policy.ts` (+ spec), `src/modules/notifications/public/notifications.types.ts`,
  `src/modules/notifications/inbox/inbox.policy.ts` (+ spec), `src/modules/notifications/README.md`;
  test `test/integration/operating-parameters/operating-parameters-http.integration-spec.ts`.
- Depends on: Task 1.
- Acceptance: 4 khóa mới đọc/ghi được, khóa cũ **còn** (sweep cũ còn đọc tới Task 8); 3 mã mới có tham số inbox (`subscriptionId`, `adjustmentId`).
- Verify: `pnpm exec jest src/modules/operating-parameters src/modules/notifications/inbox`;
  `pnpm test:integration -- test/integration/operating-parameters/operating-parameters-http.integration-spec.ts`.

### Task 3: catalog — mốc, R, kỳ tại chỗ, chuỗi, lịch sử số seat, PATCH giữa kỳ, tệp bằng chứng

- Files: `src/modules/catalog/subscription/{subscription.policy.ts,subscription.policy.spec.ts,subscription.dto.ts,subscription-view.service.ts,subscription-notice.service.ts,subscription-change.service.ts,subscription.service.ts,subscription-period.service.ts,subscription.http-errors.ts}`,
  `src/modules/catalog/subscription/pool/{subscription-pool.service.ts,subscription-quantity-event.repo.ts}` (repo mới), `src/modules/catalog/public/{subscription-period.api.ts,subscription-period.types.ts,catalog.api.ts}`;
  test `test/integration/catalog/subscription-mid-term-reduction.integration-spec.ts` (mới), `test/integration/catalog/subscription-quantity-events.integration-spec.ts` (mới),
  cập nhật `test/integration/catalog/catalog-subscription-read-model.integration-spec.ts`.
- Depends on: Task 2.
- Acceptance: test matrix _mốc / R_, _R-G01 / DA5-44_, _lịch sử số seat_ (vế catalog); facade trả mốc/R hiện hành; `nextOf`, `lockChain` khóa kỳ theo thứ tự
  chuỗi; `stopGrants`/`resumeGrants` đổi `isLive`.
- Verify: `pnpm exec jest src/modules/catalog/subscription`;
  `pnpm test:integration -- test/integration/catalog/subscription-mid-term-reduction.integration-spec.ts test/integration/catalog/subscription-quantity-events.integration-spec.ts test/integration/catalog/catalog-subscription-read-model.integration-spec.ts`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` trên DB sạch (DB-16);
`openapi:export` diff chỉ ở `subscription*`, `operatingParameter*`. Ghi _Verification_.

### Phase 2 — capability `licensing/subscription-adjustment`, kỳ đang chạy (cần W4 PASS)

### Task 4: số seat cần + hai extension point

- Files: `src/modules/licensing/subscription-adjustment/seats-needed/{subscription-adjustment-seats-needed.service.ts,subscription-adjustment-seats-needed.policy.ts,subscription-adjustment-seats-needed.policy.spec.ts}`,
  `src/modules/licensing/subscription-adjustment/{subscription-adjustment.repo.ts,subscription-adjustment.types.ts}`, `src/modules/licensing/public/licensing.extension-points.ts`,
  `src/modules/requests/grant-queue/{pending-grant-demand.listener.ts,grant-queue.repo.ts}` (listener mới), `src/modules/requests/requests.module.ts`,
  `src/modules/personnel/revocation-decisions/{revocation-decisions.listener.ts,revocation-decisions.repo.ts}` (capability mới L0, đọc bảng nghỉ việc/rà soát bằng SQL),
  `src/modules/personnel/personnel.module.ts`, `src/modules/licensing/licensing.module.ts`;
  test `test/integration/licensing/subscription-adjustment-seats-needed.integration-spec.ts` (mới).
- Depends on: Checkpoint A; W4 PASS.
- Acceptance: test matrix AC-2, AC-22, _quyết định sau R_, _R-E02 / trùng_, `QĐ-106i`(2), _hook chưa bind_; gate `extension-wiring` thấy hai binder.
- Verify: `pnpm exec jest src/modules/licensing/subscription-adjustment src/modules/requests/grant-queue src/modules/personnel/revocation-decisions`;
  `pnpm test:integration -- test/integration/licensing/subscription-adjustment-seats-needed.integration-spec.ts`; `pnpm test:gates`.

### Task 5: mở điểm (job) + đọc

- Files: `src/modules/licensing/subscription-adjustment/opening/{subscription-adjustment-opening.service.ts,subscription-adjustment-opening.policy.ts,subscription-adjustment-opening.policy.spec.ts}`,
  `src/modules/licensing/subscription-adjustment/{subscription-adjustment.job.ts,subscription-adjustments.controller.ts,subscription-adjustment.dto.ts,subscription-adjustment.mapper.ts,seats-needed.json.ts,seats-needed.json.spec.ts}`,
  `src/modules/licensing/licensing.module.ts`; test `test/integration/licensing/subscription-adjustment-opening.integration-spec.ts`,
  `test/http/licensing/subscription-adjustments.http-spec.ts` (mới).
- Depends on: Task 4.
- Acceptance: test matrix AC-1/R-G02, AC-5/AC-26, AC-17/L3-10, R-K03/L3-20, _mốc đổi khi mở_; `opening_seats_needed` có giá trị; quyền đọc.
- Verify: `pnpm exec jest src/modules/licensing/subscription-adjustment`;
  `pnpm test:integration -- test/integration/licensing/subscription-adjustment-opening.integration-spec.ts`;
  `pnpm test:http -- test/http/licensing/subscription-adjustments.http-spec.ts`.

### Task 6: ghi kết quả, kỳ mới, ngừng cấp sau `CANCEL`, thay `CANCEL`, mốc hóa đơn

- Files: `src/modules/licensing/subscription-adjustment/record/{subscription-adjustment-record.service.ts,subscription-adjustment-record.policy.ts,subscription-adjustment-record.policy.spec.ts}`,
  `src/modules/licensing/subscription-adjustment/{subscription-adjustment.errors.ts,subscription-adjustment.http-errors.ts,subscription-adjustments.controller.ts}` (Record),
  `src/modules/licensing/public/licensing.api.ts` (`adjustmentQuantityFor`), `src/modules/catalog/public/subscription-period.api.ts` (`stopGrants`, `resumeGrants`),
  `src/modules/catalog/subscription/pool/subscription-pool.policy.ts` (+ spec, `isLive` loại `grants_stopped_at`), `src/modules/licensing/shared-pool/shared-pool-capacity.repo.ts`
  (W4 — chỉ khi không đi qua `isLive`), `src/modules/budgets/purchase-invoice/purchase-invoice.policy.ts` (+ spec, W4);
  test `test/integration/licensing/subscription-adjustment-record.integration-spec.ts` (mới), http-spec Task 5 thêm ca.
- Depends on: Task 5.
- Acceptance: test matrix AC-4/AC-15, AC-12, AC-13, AC-10/L3-14, _DA5-03 / Q-81_, `RESULT_MISMATCH`, _AC-20 / AC-23 / Q-72_, _ghi lần hai / đua_, L3-11,
  US-11-03 AC-1/AC-5, Q-53, AC-19, _Q-43 → điểm chi phối_.
- Verify: `pnpm exec jest src/modules/licensing/subscription-adjustment src/modules/catalog/subscription/pool src/modules/budgets/purchase-invoice`;
  `pnpm test:integration -- test/integration/licensing/subscription-adjustment-record.integration-spec.ts`;
  `pnpm test:http -- test/http/licensing/subscription-adjustments.http-spec.ts`; `pnpm arch:capabilities --module licensing`.

### Task 7: kỳ đang chạy — Request tiếp tục, thu hồi thất bại, Assignment kẹt (DA5-02)

- Files: `src/modules/licensing/assignment/renewal/{assignment-renewal.service.ts,assignment-period-move.service.ts}` (move mới),
  `src/modules/licensing/public/{licensing-renewal.types.ts,licensing.errors.ts}` (`NEXT_PERIOD_FULL`), `src/modules/licensing/provisioning/tasks/provisioning-decision.service.ts`
  (đóng thất bại `REVOKE` ⟹ move), `src/modules/licensing/subscription-adjustment/stranded/subscription-adjustment-stranded.service.ts` (mới, bước job),
  `src/modules/requests/renewal-apply/renewal-apply.service.ts`, `src/modules/requests/renewal-request/renewal-request.http-errors.ts`;
  test `test/integration/licensing/subscription-adjustment-period-carry.integration-spec.ts` (mới), cập nhật `test/integration/licensing/renewal-request.integration-spec.ts`,
  `test/integration/licensing/provisioning-failure-http.integration-spec.ts`.
- Depends on: Task 6.
- Acceptance: test matrix _DA5-02 renew_, _DA5-02 thu hồi thất bại_; lock order chuỗi kỳ → Assignment; flow `SBF-03`, `MF-2`, `MF-3` không đổi hợp đồng.
- Verify: `pnpm exec jest src/modules/licensing/assignment src/modules/licensing/provisioning src/modules/requests/renewal-apply`;
  `pnpm test:integration -- test/integration/licensing/subscription-adjustment-period-carry.integration-spec.ts test/integration/licensing/renewal-request.integration-spec.ts test/integration/licensing/provisioning-failure-http.integration-spec.ts`;
  `pnpm test:flows -- test/flows/mf2-offboarding.flow-spec.ts test/flows/mf3-transfer.flow-spec.ts`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh §4.5; DB-16 trên DB sạch; `openapi:export` thêm đúng 3 operation (lỗi có ví dụ); hai đường ghi kỳ mới (cũ + mới) cùng tồn tại tạm —
ghi trong _Verification_ rằng Phase 3 gỡ đường cũ.

### Phase 3 — gỡ luồng cũ, phòng sở hữu, contract

### Task 8: xóa `licensing/subscription-renewal/`, hook cũ, khóa tham số cũ, mã cũ

- Files: xóa 35 file `src/modules/licensing/subscription-renewal/**`; `src/modules/licensing/licensing.module.ts`; `src/modules/licensing/public/{licensing.extension-points.ts,licensing.types.ts,licensing.api.ts}`,
  xóa `src/modules/licensing/public/licensing-subscription-renewal.types.ts`; `src/modules/personnel/transfer-review/{post-setup-review.listener.ts (xóa),post-setup-review.service.ts}`,
  `src/modules/personnel/personnel.module.ts`; `src/modules/licensing/seat-baseline/seat-baseline.service.ts`; `src/modules/operating-parameters/parameter-definitions.policy.ts`
  (bỏ `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`), `src/modules/catalog/plan-terms/plan-terms.service.ts:235` + `subscription-notice.service.ts` (`activeNotices` theo điểm mở),
  notifications (xóa 4 mã); xóa `test/integration/licensing/subscription-renewal-{decision,outcome,owner-confirmation,sweep,pool-fields}.integration-spec.ts`,
  `test/http/licensing/subscription-renewals.http-spec.ts`, `test/support/renewal-harness.ts`; cập nhật `test/support/{api-coverage-manifest.ts,openapi-example-manifest.ts,openapi-example-route-codes-licensing.ts,ai-summary-harness.ts}`,
  `test/support/api-collection-registry-nested-first-half.ts:76,114` (ví dụ int-list mới), `test/gates/architecture-boundaries.gate-spec.ts`,
  `test/integration/licensing/seat-baseline-closed-listener.integration-spec.ts`, `test/integration/personnel/transfer-review-still-needed.integration-spec.ts`,
  `test/integration/licensing/final-vocabulary-compatibility.integration-spec.ts`.
- Depends on: Checkpoint B.
- Acceptance: test matrix _xóa operation_ (7 route 404), L3-29, L3-03 (khóa cũ 404); `grep -rn "subscription-renewal\|RENEWAL_ALERT_DAYS" src test` rỗng.
- Verify: `pnpm typecheck`; `pnpm test:gates`; `pnpm exec jest src/modules/personnel/transfer-review src/modules/licensing src/modules/catalog/plan-terms`;
  `pnpm test:integration -- test/integration/licensing/seat-baseline-closed-listener.integration-spec.ts test/integration/personnel/transfer-review-still-needed.integration-spec.ts`.

### Task 9: bỏ phòng sở hữu, `allowsMidTermReduction`, CLI, cổng preflight

- Files: `src/modules/catalog/subscription/{subscription.dto.ts,subscription.mapper.ts,subscription.repo.ts,subscription.service.ts,subscription.types.ts,subscription.policy.ts,seat-target.service.ts,subscription-facts.service.ts,subscription-period.service.ts,subscription-obligation.service.ts}` (+ spec),
  `src/modules/catalog/public/{catalog.types.ts,subscription-period.types.ts,catalog.api.ts}`, xóa `src/modules/catalog/subscription-owner-assignment/`, `src/modules/catalog/public/subscription-owner-assignment.{api,errors,types}.ts`,
  `src/cli/assign-subscription-owner/` (4 file), `src/cli/commands.ts`, `package.json`, `src/infrastructure/database/database-role-judgement.ts`,
  `src/modules/installation/migration-preflight/{migration-preflight.repo.ts,migration-preflight-judgement.policy.ts,migration-preflight-contract-gates.policy.spec.ts}`,
  `src/modules/installation/public/{migration-preflight.types.ts,migration-preflight-report.mapper.ts}`, `src/modules/licensing/assignment/baseline-target.policy.spec.ts`,
  `src/modules/data-import/seat-baseline-import/*` (3 file đọc `ownerDepartment`); test/support `owned-subscriptions.ts`, `expansion-world.ts`, `subscription-http-harness.ts`,
  `seat-baseline-harness.ts`, `request-harness.ts`, `api-collection-registry-exceptions.ts`, `flows/flow-calls.ts`; xóa `test/integration/catalog/subscription-owner-{assignment-cli,expansion,preflight,department}.integration-spec.ts`,
  `test/integration/licensing/assignment-owner-department-guard.integration-spec.ts`; cập nhật ~15 integration/http còn `ownerDepartment` (danh sách `grep` ở dưới),
  `test/integration/platform/final-release-*.integration-spec.ts`, `test/gates/{operational-commands,module-graph}.gate-spec.ts`, `test/support/process-graphs.ts`,
  `docs/rules/operational-commands.md`, `docs/guides/containers.md`.
- Depends on: Task 8.
- Acceptance: test matrix _xóa operation / L3-06_, R-G01 (không còn cờ); `grep -rn "ownerDepartment\|allowsMidTermReduction" src test scripts --include=*.ts` chỉ còn `src/generated`
  trước Task 10 (HEAD `712044f9`: 41 file src/scripts ngoài `src/generated`, 29 file test).
- Verify: `pnpm typecheck`; `pnpm exec jest src/modules/catalog src/modules/installation src/cli`;
  `pnpm test:integration -- test/integration/platform/final-release-guards.integration-spec.ts test/integration/platform/final-release-upgrade.integration-spec.ts`; `pnpm test:gates`.

### Task 10: migration contract

- Files: `prisma/migrations/<ts+1>_subscription_adjustment_contract/migration.sql`, `prisma/models/{licensing,catalog,organization}.prisma`; test migration Task 1 thêm ca contract.
- Depends on: Task 9.
- Acceptance: test matrix _migration_ (vế contract); dòng DB-05 có trong spec.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`; `pnpm test:integration -- test/integration/licensing/subscription-adjustment-migration.integration-spec.ts`;
  `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` (DB sạch).

### Checkpoint C (hết lượt 3)

Kiểm tra nhanh §4.5; `migrate diff` trên DB sạch; `openapi:export` diff = 7 xóa + 6 đổi; `pnpm arch:capabilities --module licensing` không vòng.

### Phase 4 — seed, flow, README

### Task 11: seed không gửi phòng sở hữu

- Files: `src/cli/seed/fixture/demo-fixture.types.ts`, `src/cli/seed/fixture/shared-demo-v3/catalog.ts`, `src/cli/seed/fixture/shared-demo-v3.spec.ts`,
  `src/cli/seed/steps/catalog.steps.ts` (+ spec, khóa idempotent), `src/cli/seed/fixture/shared-demo-v3/README.md`.
- Depends on: Checkpoint C.
- Acceptance: test matrix _L4-18 + seed_ (vế seed).
- Verify: `pnpm exec jest src/cli/seed`;
  `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`.

### Task 12: flow `@SBF20`, README

- Files: `test/flows/mf5-rightsizing.flow-spec.ts`, `test/flows/mf5-rightsizing-edges.flow-spec.ts` (đổi tên `sbf20-adjustment*.flow-spec.ts`, nhãn `@SBF20`),
  `test/support/flows/{flow-template.ts,flow-world.ts}`, `test/flows/f0-auth-roles.flow-spec.ts`, `src/modules/licensing/README.md`, `src/modules/catalog/README.md`,
  `src/modules/personnel/README.md` (`revocation-decisions`).
- Depends on: Task 11.
- Acceptance: test matrix L4-18; README nêu capability, lock order điểm → chuỗi kỳ → plan, hai extension point.
- Verify: `pnpm test:flows -- test/flows/sbf20-adjustment.flow-spec.ts test/flows/sbf20-adjustment-edges.flow-spec.ts test/flows/f0-auth-roles.flow-spec.ts`; `pnpm rules:check`.

### Checkpoint D (hết lượt 4)

Kiểm tra nhanh §4.5; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` trên DB sạch; tự review spec mục 1–14;
danh sách test cũ xóa/đổi kỳ vọng kèm lý do vào _Verification_.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
