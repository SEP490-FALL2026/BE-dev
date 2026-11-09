# Plan: qd103-grant-from-shared-pool

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `5fd5f594`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W4, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **hai lượt** — Phase 1 catalog (Task 1–3, Checkpoint A), Phase 2 licensing (Task 4–6, Checkpoint B). Ước ~48 file.

## Before coding

Đọc `src/modules/catalog/README.md` (thứ tự khóa `isPrimaryForPlan` :97-103, `lockSeatTarget` :109), `src/modules/licensing/README.md`
(thứ tự capability :76-81, lock order :137-139), `docs/rules/module-structure.md` (≤ 25 file/thư mục — `catalog/subscription` đã đủ 25;
:60-66 nhóm chỉ qua điểm vào, phần mà capability khác dùng là capability; R6 không vòng), `scripts/arch/tiers.cjs` (`catalog`, `licensing`
cùng T4, chỉ `licensing → catalog`), `docs/decisions/0019-module-tiers-and-public-api.md`, `docs/rules/database-business.md`, `src/core/extension/hook.ts`
(`isBound()`; gate `extension-wiring`). Đối chiếu code ở `5fd5f594`: các `file:dòng` trong spec _Ownership_. Lệnh dưới đã kiểm trong
`package.json`: `test`, `test:integration`, `test:http`, `test:e2e`, `test:flows`, `db:migrate:deploy`, `prisma:generate`, `arch:check`,
`arch:capabilities`. Nếu W3 `qd103-request-amount-and-term` chưa code xong `priceOfPlan` kiểu mới: dừng ở Task 2 và báo.

## Design review

Audit `design-audit-w4.md` (08/11/2026) — hạng mục này: 0 Cao · 3 TB · 2 Thấp, cộng một phần DA4-04 (TB, ghi ở `qd103-role-based-access`).

| Finding                                                          | Mức  | Kết quả                                                                                    | Sửa ở                              |
| ---------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| DA4-19 rà soát sau khởi tạo vẫn chạy khi đóng baseline           | TB   | đã sửa — đóng baseline phát `holders: []`; gỡ listener ở W5 (ledger, việc của chat review) | spec _Behavior_ 4, Task 4          |
| DA4-20 `free` đếm cả `DRAFT`                                     | TB   | đã sửa — chỉ _thuê bao cấp được_                                                           | spec _Behavior_ 5, Task 5          |
| DA4-21 cổng Cost Center của phòng sở hữu cũ                      | TB   | đã sửa — `K2`/`K4` bỏ cổng ở mọi đường tăng (`QĐ-103d`(2))                                 | spec _Behavior_ 4, Task 3          |
| DA4-22 thứ tự khóa `complete`                                    | Thấp | đã sửa — `declareIn` plan trước; `complete` thuê bao → plan                                | spec _Behavior_ 1, Task 3          |
| DA4-23 thiếu test `SHOULD_MERGE`, cổng không phòng; mâu thuẫn W2 | Thấp | đã sửa — 2 dòng test; NOTES sửa "không chờ W2"                                             | spec _Test matrix_, _Dependencies_ |
| DA4-04 (phần chung) `pool-grant/` là nhóm của `provisioning`     | TB   | đã sửa — capability `licensing/shared-pool/`                                               | spec _Ownership_, Task 5           |

Không sửa: không có.

## Tasks

### Phase 1 — catalog: phòng sở hữu nullable, chặn trùng, giá theo thuê bao chính, F-012

### Task 1: migration `shared_pool_grant`

- Files: `prisma/migrations/<ts>_shared_pool_grant/migration.sql` (drop NOT NULL, drop guard + hàm, thay hàm chuỗi kỳ, cột
  `provisioning_tasks.purchase_*` + enum + CHECK, bảng `pool_grant_avoided_costs` + trigger append-only), `prisma/models/catalog.prisma`
  (`ownerDepartmentId String?`), `prisma/models/licensing.prisma` (`ProvisioningPurchaseKind`, cột task, model `PoolGrantAvoidedCost`),
  `test/integration/licensing/shared-pool-grant-migration.integration-spec.ts` (mới, mẫu
  `test/integration/catalog/shared-pool-subscription-fields-migration.integration-spec.ts`).
- Depends on: none.
- Acceptance: test matrix _migration_; insert Assignment khác phòng sở hữu thành công; CHECK `purchase_*` và append-only từ chối.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/licensing/shared-pool-grant-migration.integration-spec.ts`.

### Task 2: giá theo thuê bao chính; danh mục xin được không theo phòng; F-012

- Files: `src/modules/catalog/subscription/pool/subscription-pool.policy.ts` (+ spec: `pickPriceSource`, `isLive`),
  `subscription/subscription-facts.service.ts`, `subscription/subscription.repo.ts`, `subscription/subscription-period.service.ts`,
  `subscription/subscription.service.ts` (`complete` chuyển cờ), `public/catalog.api.ts`, `requestable-software/requestable-software.service.ts`,
  `src/modules/requests/access-request/request-facts.service.ts`.
- Depends on: Task 1; W3 `priceOfPlan` kiểu mới.
- Acceptance: test matrix Q-04 C, L2-27 (danh mục + gửi), F-012.
- Verify: `pnpm exec jest src/modules/catalog/subscription src/modules/catalog/requestable-software src/modules/requests/access-request`;
  `pnpm test:integration -- test/integration/requests/request-price-source.integration-spec.ts test/integration/catalog/shared-pool-subscription-http.integration-spec.ts`;
  `pnpm test:http -- test/http/catalog/requestable-software.http-spec.ts`.

### Task 3: chặn trùng + `SeatBaselinePhaseHook`; thứ tự khóa; cổng nghĩa vụ `K2`/`K4`

- Files: `src/modules/catalog/public/catalog.extension-points.ts` (hook), `subscription/pool/subscription-pool.service.ts`
  (`assertNoLiveDuplicate`, `SHOULD_MERGE` cho get/list), `subscription/subscription.service.ts` (`declareIn`: plan `FOR UPDATE` đầu tiên;
  `complete`: thuê bao → plan `FOR UPDATE`), `subscription/subscription.dto.ts` (`ownerDepartmentId` optional, `warnings`), `subscription/subscription.errors.ts`,
  `subscription.http-errors.ts` (`DUPLICATE_PLAN` 409 + ví dụ), `subscription/subscription-obligation.service.ts` (bỏ cổng cho `K2`/`K4`),
  `src/modules/licensing/seat-baseline/seat-baseline-phase.listener.ts` (mới), `licensing.module.ts`, `catalog/README.md`; test
  `test/integration/catalog/subscription-duplicate-plan.integration-spec.ts` (mới, gồm ca _khóa_ create ∥ complete).
- Depends on: Task 2.
- Acceptance: test matrix R-E02 (3 dòng), `SHOULD_MERGE` đọc, _khóa_, _hook_, _cổng CC_ (vế PATCH và `K1`).
- Verify: `pnpm exec jest src/modules/catalog/subscription/pool src/modules/catalog/subscription`;
  `pnpm test:integration -- test/integration/catalog/subscription-duplicate-plan.integration-spec.ts test/integration/catalog/subscription-owner-department.integration-spec.ts test/integration/catalog/subscription-purchase-and-drafts-http.integration-spec.ts test/integration/licensing/seat-baseline-closed-listener.integration-spec.ts`;
  `pnpm arch:check`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`,
`pnpm openapi:export` — diff chỉ ở `subscription*`, `requestable*`). Tự review theo spec mục 1–4, 8. Ghi _Verification_.

### Phase 2 — licensing: cấp không theo phòng, kho dùng chung, tránh được

### Task 4: bỏ guard phòng ở cấp, seat ban đầu và đóng baseline

- Files: `src/modules/licensing/assignment/assignment.policy.ts` (+ spec), `assignment/assignment.service.ts` (bỏ
  `baselineHoldersOfOtherDepartments`), `assignment/assignment-conflicts.repo.ts`, `licensing/seat-baseline/seat-baseline.service.ts` (`holders: []`),
  `src/modules/data-import/seat-baseline-import/seat-baseline-rows.policy.ts` (+ spec); test viết lại
  `test/integration/licensing/assignment-owner-department-guard.integration-spec.ts` (khác phòng ⟹ cấp được, `owning_department_id` = phòng người nhận),
  `test/integration/catalog/department-use-subscriptions.integration-spec.ts`, `test/integration/licensing/seat-baseline-closed-listener.integration-spec.ts` (ca `QĐ-89e`).
- Depends on: Checkpoint A.
- Acceptance: test matrix L2-27 / AC-1, L3-06, `QĐ-89e` (DA4-19).
- Verify: `pnpm exec jest src/modules/licensing/assignment src/modules/licensing/seat-baseline src/modules/data-import/seat-baseline-import`;
  `pnpm test:integration -- test/integration/licensing/assignment-owner-department-guard.integration-spec.ts test/integration/licensing/assignment-writes.integration-spec.ts test/integration/catalog/department-use-subscriptions.integration-spec.ts test/integration/licensing/seat-baseline-closed-listener.integration-spec.ts`;
  `pnpm test:e2e -- test/e2e/seat-baseline-import.e2e-spec.ts`.

### Task 5: capability `shared-pool` + mua thêm ở `provisioningTaskGrant`

- Files: `src/modules/licensing/shared-pool/shared-pool.service.ts`, `shared-pool.policy.ts` (+ spec), `shared-pool-capacity.repo.ts` (mới, 4 file),
  `provisioning/provisioning.dto.ts`, `provisioning.errors.ts`, `provisioning.http-errors.ts`, `tasks/provisioning-grant-planner.service.ts`,
  `tasks/provisioning-grant-writer.service.ts`, `licensing.module.ts`, `src/modules/catalog/public/catalog.api.ts` +
  `catalog/subscription/pool/subscription-pool.service.ts` (`addPoolSeat`); test `test/integration/licensing/provisioning-pool-purchase.integration-spec.ts` (mới),
  cập nhật `test/integration/licensing/provisioning-grant-http.integration-spec.ts`, `test/http/licensing/provisioning.http-spec.ts`.
- Depends on: Task 4.
- Acceptance: test matrix AC-2, `DRAFT`, AC-3/Q-36, AC-4, AC-8, _cổng CC_ (vế `addPoolSeat`), R-E05 phủ định, _đua_; `shared-pool` không import capability licensing nào.
- Verify: `pnpm exec jest src/modules/licensing/shared-pool src/modules/licensing/provisioning`;
  `pnpm test:integration -- test/integration/licensing/provisioning-pool-purchase.integration-spec.ts test/integration/licensing/provisioning-grant-http.integration-spec.ts test/integration/licensing/provisioning-lock-order.integration-spec.ts`;
  `pnpm test:http -- test/http/licensing/provisioning.http-spec.ts`; `pnpm arch:capabilities --module licensing`.

### Task 6: _tránh được_ khi hoàn tất; `facts` ở `reportOutcome`; README; flow + seed

- Files: `licensing/shared-pool/shared-pool-avoided-cost.repo.ts` (mới), `shared-pool.service.ts` (`recordAvoided`), `provisioning/tasks/provisioning.service.ts`
  (`complete`), `public/licensing.extension-points.ts`, `public/licensing.types.ts`, `src/modules/requests/grant/access-request-grant.listener.ts`,
  `src/modules/licensing/README.md`; test `test/integration/licensing/pool-grant-avoided-cost.integration-spec.ts` (mới), `test/flows/mf1-request-contract.flow-spec.ts`
  (ca cấp cho phòng khác); seed: `src/cli/seed/steps/catalog.steps.ts` chỉ sửa nếu `SHOULD_MERGE` làm bước seed đọc response hỏng.
- Depends on: Task 5.
- Acceptance: test matrix R-E06 (3 dòng), _facts_, _hồi quy + seed_.
- Verify: `pnpm test:integration -- test/integration/licensing/pool-grant-avoided-cost.integration-spec.ts test/integration/requests/group-request-grant.integration-spec.ts test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`;
  `pnpm test:flows -- test/flows/mf1-request-contract.flow-spec.ts test/flows/mf1-group-request.flow-spec.ts`;
  `pnpm test:e2e -- test/e2e/paid-request-to-seat.e2e-spec.ts`; `pnpm exec jest src/cli/seed`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ ở operation spec nêu; `pnpm arch:capabilities --module licensing` (`shared-pool` L0,
không vòng); tự review theo spec mục 4–7; ghi _Verification_ và danh sách test cũ đã đổi kỳ vọng (Task 4) kèm lý do.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
