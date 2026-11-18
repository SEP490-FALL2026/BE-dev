# Plan: qd103-ghost-seat-g1-g2

- Spec: `spec.md` cùng thư mục; revision đầu vào: Docs `9c7f386`, BE `46b6a94e` (đọc ở `712044f9`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: subagent chat review (W6, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `in-progress` (đã chạy kiểm tra cục bộ, còn gate baseline đỏ và flow mf2 chưa chạy được) trên nhánh `feat/mf5` (base `95aab022`), chưa push, chưa review. PR: chưa có.
- Giao code: **hai lượt** — Phase 1 tầng + module + `G1` (Task 1–3, Checkpoint A), Phase 2 `G2` + bảng IT + `KPI-5` (Task 4–6, Checkpoint B). Ước ~58 file.

## Before coding

Đọc `docs/rules/module-structure.md` (bảng tầng :31-39, L0–L3, hậu tố `.job.ts`/`.listener.ts`/`.json.ts`, extension point `static binds`),
`docs/decisions/0019-module-tiers-and-public-api.md`, `scripts/arch/tiers.cjs`, `ARCHITECTURE.md:46-54`, `docs/rules/security-jobs.md`,
`docs/rules/database-business.md` (codec JSON, `*_values`); mẫu job `src/modules/licensing/expiry/expiry-reminder.job.ts`; mẫu section dashboard
`src/modules/dashboards/section/dashboard-section.policy.ts:33-45`; W4 `licensing/shared-pool/` (sức chứa); `provisioning/tasks/provisioning.service.ts:75-95`
(claim phát `AFTER_WORK` `IN_PROGRESS`). Đối chiếu `file:dòng` ở spec. Lệnh đã kiểm trong `package.json`: `db:migrate:deploy`, `prisma:generate`, `test`,
`test:integration`, `test:http`, `test:e2e`, `test:flows`, `openapi:export`, `arch:check`, `arch:capabilities`, `arch:graph`, `rules:check`, `test:gates`.
Không thêm file vào thư mục đã 25 file (`licensing/assignment/` 19 lúc đọc — kiểm lại sau W4). Nếu W4 `shared-pool` chưa có: dừng ở Task 3 và báo.

## Design review

Audit `design-audit-w6.md` (08/11/2026) — hạng mục này: 3 Cao (DA6-02, DA6-03, DA6-04) · 6 TB (DA6-17, DA6-23 phần listener, DA6-26, DA6-27,
DA6-29 phần, DA6-37 phần) · 6 Thấp (DA6-34…DA6-40). Mọi finding đã kiểm với nguồn trước khi sửa (`EP-07:265,268`, `EP-10:42,84,212,313`,
`SBF-04.md:43,99`, `QĐ-108i`, `QĐ-77l`, BRD `KPI-5`/`FR-4.12`, code `provisioning.service.ts:84-90`, `handover-confirmer.policy.ts:56-58`).

| Finding                                                      | Mức  | Kết quả                                                                                              | Sửa ở                     |
| ------------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------- | ------------------------- |
| DA6-02 listener đóng `ACCEPTED` lúc claim (`IN_PROGRESS`)    | Cao  | đúng (đã kiểm `provisioning.service.ts:84-90`) — chỉ `COMPLETED`; test claim / claim + đóng thất bại | _Behavior_ 5; Task 4      |
| DA6-03 bỏ qua `G2` khi có tác vụ `MF-2`                      | Cao  | đúng (`US-07-05` AC-12/15 > sơ đồ) — `G2` `RECLAIM_DECIDED` gắn tác vụ; không cần Owner              | _Behavior_ 3; Task 4      |
| DA6-04 `G3`/`G4` `RECLAIM_DECIDED` ⟹ 23505 mỗi ngày          | Cao  | đúng — không tạo `G2`, đặt `holder_left_on`; `TC-1` đếm cả nhãn này                                  | _Ownership_, _Behavior_ 3 |
| DA6-17 không có facade liệt kê seat                          | TB   | đúng — `LicensingApi.listSeatsForRules` (+ `getRevocationTaskStatuses`)                              | _Ownership_; Task 4       |
| DA6-23 thứ tự khóa listener ↔ service                        | TB   | đúng — listener `SKIP LOCKED` + đối soát lượt ngày; service khóa khuyến nghị trước                   | _Behavior_ 5–6; Task 4    |
| DA6-26 nguồn `DEPARTURE` luôn mở duty bàn giao               | TB   | đúng — Q-83 cần Owner; tạm chọn `ABRUPT_DEPARTURE`                                                   | _Behavior_ 4; Task 5      |
| DA6-27 `K1` đang chấm dứt ⟹ `G2` sinh lại mỗi ngày           | TB   | đúng (`QĐ-77l`, `EP-10:313`) — một `G2` `RECLAIM_DECIDED` tới khi Assignment kết thúc                | _Behavior_ 3, 5; Task 4   |
| DA6-29 thiếu `mf2-abrupt-departure` ở Checkpoint B           | TB   | đúng — thêm                                                                                          | Checkpoint B              |
| DA6-34 số dòng `organization-read.api.ts`                    | Thấp | đúng — `getItAdminInCharge` :130                                                                     | _Behavior_ 3              |
| DA6-35 Q-12 ghi _theo nguồn_                                 | Thấp | đúng — QUESTIONS vẫn `TẠM CHỌN (chờ Owner): A`                                                       | đầu spec                  |
| DA6-36 thiếu `ARCHITECTURE.md`; `rules:format` chỉ `--check` | Thấp | đúng — thêm vào Task 2; dùng `prettier --write`                                                      | Task 2                    |
| DA6-37 codec JSON                                            | Thấp | đúng — `evidence` union theo `group`; codec `detail` của lý do bỏ qua                                | _Ownership_; Task 1, 2    |
| DA6-38 `PAUSED` hết Assignment — hai job đua                 | Thấp | đúng — lượt ngày bỏ qua `PAUSED`                                                                     | _Behavior_ 6              |
| DA6-39 `KPI-5` đếm tầng _Theo dõi_                           | Thấp | đúng — mẫu số chỉ `REVIEW`/`ACTION` (kỹ thuật)                                                       | _Behavior_ 8              |
| DA6-40 thiếu câu giới hạn phần mềm nội bộ                    | Thấp | đúng — `limitation` trong tóm tắt                                                                    | _Behavior_ 7              |
| Q-82                                                         | —    | đổi — `SUPERSEDED` (tính `KPI-5`), bỏ `HOLDER_LEFT`; vẫn chờ Owner (trái chữ cổng 8)                 | _Behavior_ 3              |
| Kiến trúc: enum khai trước cho hạng mục sau                  | —    | đổi — enum chỉ giá trị của hạng mục này; g3-g4 và manager-decision thêm bằng `*_values`              | _Ownership_; Task 1       |

## Tasks

### Phase 1 — tầng T7/T8, module `optimization`, bảng khuyến nghị, lượt chạy, `G1`

### Task 1: migration `optimization_ghost_seats`

- Files: `prisma/migrations/<ts>_optimization_ghost_seats/migration.sql` (7 enum `CREATE TYPE` chỉ giá trị của hạng mục, 3 bảng, CHECK chủ thể/trạng
  thái, partial UNIQUE cổng 8, trigger bất biến `evidence` và append-only `ghost_seat_rule_skips`), `prisma/models/optimization.prisma` (mới),
  `test/integration/optimization/ghost-seat-migration.integration-spec.ts` (mới).
- Depends on: none (W4 PASS).
- Acceptance: test matrix dòng _DB_.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`;
  `pnpm test:integration -- test/integration/optimization/ghost-seat-migration.integration-spec.ts`.

### Task 2: tầng T7/T8, khung module, capability `ghost-seat/` và `rule-run/`

- Files: `scripts/arch/tiers.cjs` (`['optimization']` trước `['dashboards']`), `ARCHITECTURE.md` (bảng tầng :46-54), `docs/rules/module-structure.md`
  (bảng tầng :31-39), `src/modules/optimization/README.md`, `optimization.module.ts`, `optimization-audit-event.mapper.ts` (+ spec),
  `ghost-seat/ghost-seat.repo.ts`, `ghost-seat.service.ts`, `ghost-seat-state.policy.ts` (+ spec: chuyển trạng thái, tập lý do `KPI-5`),
  `ghost-seat-evidence.json.ts` (+ spec: union theo `group`), `ghost-seat-skip-detail.json.ts` (+ spec), `ghost-seat.types.ts`, `rule-run/rule-run.repo.ts`,
  `rule-run.service.ts`, `rule-run.policy.ts` (+ spec: `period_key`, nhận lại sau 2 h), `src/app/app.module.ts`.
- Depends on: Task 1.
- Acceptance: test matrix _kiến trúc_; _lượt chạy_ (vế claim, nhận lại, `attempt = 3`, `WEEKLY`) ở mức unit + integration service; bảng tầng của
  `ARCHITECTURE.md` và `module-structure.md` khớp `tiers.cjs`.
- Verify: `pnpm exec jest src/modules/optimization`; `pnpm arch:check`; `pnpm arch:capabilities --module optimization`; `pnpm arch:graph`;
  `pnpm exec prettier --write ARCHITECTURE.md docs/rules/module-structure.md src/modules/optimization/README.md`; `pnpm rules:check`; `pnpm test:gates`.

### Task 3: `G1` + job `internal-rules.job.ts`

- Files: `src/modules/optimization/internal-rules/internal-rules.service.ts`, `internal-rules.policy.ts` (+ spec: cổng 1, `INTERNAL_SOFTWARE`,
  hành động theo `K2`/`K4`), `internal-rules.repo.ts`, `internal-rules.job.ts`, `src/modules/licensing/public/licensing.api.ts`
  (`listSharedPoolVacancies`), `src/modules/licensing/shared-pool/shared-pool-capacity.repo.ts` (truy vấn theo thuê bao), `docs/rules/security-jobs.md`;
  `test/support/ghost-seat-world.ts` (mới: thuê bao/Assignment/người nghỉ có đáp án biết trước); test
  `test/integration/optimization/ghost-seat-g1.integration-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix `US-10-01` AC-1, Q-12, AC-9, AC-7, AC-8 (vế `G1`), `G1` vòng đời, _lượt chạy_ (hai instance), _lỗi một đối tượng_.
- Verify: `pnpm exec jest src/modules/optimization/internal-rules`;
  `pnpm test:integration -- test/integration/optimization/ghost-seat-g1.integration-spec.ts`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` — chưa
có operation mới); `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`; `pnpm arch:graph` (ảnh tầng mới).
Commit `feat(qd103-w6): ghost-seat-g1-g2 P1`.

### Phase 2 — `G2`, thay thế, kết cục thu hồi, bảng IT, `KPI-5`

### Task 4: `G2` + thay thế (`QĐ-108i`, Q-82) + `listSeatsForRules` + listener kết cục + lượt ngày dọn

- Files: `internal-rules/internal-rules.service.ts`, `internal-rules.policy.ts` (+ spec: cổng 8, thay `PAUSED`/chưa quyết, nhánh `RECLAIM_DECIDED`,
  trạng thái lúc tạo theo `liveRevocation`/`terminatingUntil`), `internal-rules.repo.ts`, `ghost-seat/ghost-seat-revocation.listener.ts` (bind
  `RevocationListeners`, chỉ `COMPLETED`, `SKIP LOCKED`), `ghost-seat/ghost-seat.service.ts`, `src/modules/licensing/public/licensing.api.ts`
  (`listSeatsForRules`, `getRevocationTaskStatuses`), `src/modules/licensing/public/licensing.types.ts`, `src/modules/licensing/assignment/rule-seats.repo.ts`
  (mới), `src/modules/notifications/public/notifications.types.ts`, `src/modules/notifications/inbox/inbox.policy.ts` (`GHOST_SEAT_G2_DETECTED`),
  `optimization.module.ts`; test `test/integration/optimization/ghost-seat-g2.integration-spec.ts` (mới), `test/integration/licensing/rule-seats.integration-spec.ts` (mới).
- Depends on: Checkpoint A.
- Acceptance: test matrix AC-2, AC-6/`US-10-02` AC-11, AC-4, `QĐ-108i`/Q-82, DA6-04, AC-12 `US-07-05` (DA6-03), DA6-02 claim, AC-20 `K1` (DA6-27),
  AC-10, _kết cục_, _khóa (DA6-23)_, DA6-38, AC-8 (vế `G2`).
- Verify: `pnpm exec jest src/modules/optimization src/modules/notifications/inbox`;
  `pnpm test:integration -- test/integration/optimization/ghost-seat-g2.integration-spec.ts test/integration/licensing/rule-seats.integration-spec.ts`.

### Task 5: capability `board/` — danh sách, chi tiết, tóm tắt, thu hồi `G2`, lượt chạy, `KPI-5`

- Files: `src/modules/optimization/board/board.controller.ts`, `board.dto.ts`, `board.service.ts`, `board.policy.ts` (+ spec: phạm vi `MINE|ALL`,
  `KPI-5` mẫu số/tử số, `limitation`), `board-reclaim.service.ts`, `board.errors.ts`, `board.http-errors.ts`; `test/support/api-coverage-manifest.ts`,
  `test/support/openapi-example-route-codes-optimization.ts` (mới), registry danh sách (`test/support/api-collection-registry*.ts`);
  test `test/http/optimization/ghost-seat-board.http-spec.ts` (mới), `test/integration/optimization/ghost-seat-g2-reclaim.integration-spec.ts` (mới).
- Depends on: Task 4; `qd103-revocation-grace-notice` (đọc `notBefore` của tác vụ).
- Acceptance: test matrix `US-10-05` AC-5/AC-8, AC-18 vế `G2`, _reclaim phủ định_, _bảng IT_, `KPI-5` (DA6-39), AC-8 nội bộ (DA6-40).
- Verify: `pnpm exec jest src/modules/optimization/board`;
  `pnpm test:integration -- test/integration/optimization/ghost-seat-g2-reclaim.integration-spec.ts`;
  `pnpm test:http -- test/http/optimization/ghost-seat-board.http-spec.ts`.

### Task 6: facade `OptimizationApi`, dashboard IT, `TC-1`, README

- Files: `src/modules/optimization/public/optimization.api.ts`, `public/optimization.types.ts`, `src/modules/dashboards/it-admin/it-admin-dashboard.service.ts`
  (+ spec), `it-admin-dashboard.dto.ts`, `src/modules/dashboards/dashboards.module.ts`, `src/modules/optimization/README.md`; test
  `test/integration/optimization/ghost-seat-tc1.integration-spec.ts` (mới, bộ đáp án `ghost-seat-world.ts`), `test/http/dashboards/dashboards.http-spec.ts`.
- Depends on: Task 5.
- Acceptance: test matrix `TC-1`, _dashboard IT_; `public/` ≤ 8 phụ thuộc.
- Verify: `pnpm exec jest src/modules/dashboards/it-admin`;
  `pnpm test:integration -- test/integration/optimization/ghost-seat-tc1.integration-spec.ts`;
  `pnpm test:http -- test/http/dashboards/dashboards.http-spec.ts`; `pnpm arch:check`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ 6 operation mới + `itAdminDashboardGet`; `pnpm arch:capabilities --module optimization`
(`ghost-seat`, `rule-run` L0; `internal-rules` L1; `board` L3); `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`;
hồi quy `pnpm test:integration -- test/integration/licensing/provisioning-revocation-open.integration-spec.ts`,
`pnpm test:e2e -- test/e2e/offboarding-revocation.e2e-spec.ts`, `pnpm test:flows -- test/flows/mf2-offboarding.flow-spec.ts test/flows/mf2-abrupt-departure.flow-spec.ts`
(listener mới không đổi luồng `MF-2`); tự review spec _Behavior_ 1–10. Commit `feat(qd103-w6): ghost-seat-g1-g2 P2`.

## Verification and handoff

Môi trường: PostgreSQL native, DB tạm theo UUID (`TEST_DATABASE_ADMIN_URL`), nhánh `feat/mf5` trên `95aab022` (baseline đã đỏ ở một số cổng — xem cột giới hạn).

| Lệnh / kiểm tra AC                                                                                     | Revision / môi trường | Kết quả thực chạy                                                                                                                                                                                                                                                                                                       | Giới hạn / việc còn lại                                                                                                        |
| ------------------------------------------------------------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test:integration -- test/integration/optimization` (5 file: migration, G1, G2, G2-reclaim, TC-1) | `feat/mf5` P2         | 5 suite · 38 test xanh (DB: 6 · G1: 9 · G2: 13 · reclaim/board/KPI-5/runs: 9 · TC-1: 1)                                                                                                                                                                                                                                 | không đếm câu lệnh bằng `QueryCounter` (không nối PgRelay): "không N+1" chứng minh bằng thiết kế (một truy vấn gộp cho mỗi lô) |
| `pnpm test:integration -- test/integration/licensing/rule-seats.integration-spec.ts`                   | P2                    | 3 test xanh (vacancies, chuỗi Assignment, task standing)                                                                                                                                                                                                                                                                | —                                                                                                                              |
| `pnpm exec jest src/modules/optimization src/modules/notifications/inbox src/modules/dashboards`       | P2                    | 110 test xanh                                                                                                                                                                                                                                                                                                           | —                                                                                                                              |
| `pnpm test:http -- ghost-seat-board dashboards api-inventory openapi-response-examples openapi-export` | P2                    | 5 suite · 78 test xanh (7 operation mới + `itAdminDashboardGet.ghostSeats`)                                                                                                                                                                                                                                             | 7 operation, không 6: thêm `ghostSeatRuleSkipList` (lý do bỏ qua phân trang riêng vì gate collection cấm mảng lồng mới)        |
| Hồi quy `provisioning-revocation-open` + `-complete` (integration)                                     | P2                    | 33 test xanh                                                                                                                                                                                                                                                                                                            | cần sửa `poolGrantAvoidedCosts` (optional) ở `provisioning.dto.ts` — baseline `95aab022` trả 500 ở mọi GET task                |
| Hồi quy `test:e2e offboarding-revocation`                                                              | P2                    | 5 test xanh                                                                                                                                                                                                                                                                                                             | —                                                                                                                              |
| Hồi quy `test:flows mf2-offboarding mf2-abrupt-departure`                                              | P2                    | **không chạy được**: globalSetup seed `POST /budget-proposals` → 500 (lỗi baseline nhánh budget, `priorityRank`)                                                                                                                                                                                                        | chờ sửa budget; listener mới chỉ bind `RevocationListeners`, luồng `MF-2` đã phủ bởi e2e + integration ở trên                  |
| `pnpm arch:check` · `arch:docs:check` · `rules:check` · `prisma:validate` · `test:discovery`           | P2                    | xanh                                                                                                                                                                                                                                                                                                                    | —                                                                                                                              |
| `pnpm arch:capabilities --module optimization`                                                         | P2                    | `ghost-seat`, `rule-run` L0 · `internal-rules` L1 · `board` L3, không vòng                                                                                                                                                                                                                                              | —                                                                                                                              |
| `pnpm test:gates`                                                                                      | P2                    | 324 xanh · 7 đỏ, **cả 7 là baseline** (không phải của hạng mục): `migration-order` (`202611091040000_…` 15 chữ số), collection `provisioningTaskList#owner-decision` (`purchase`), model `PoolGrantAvoidedCost` chưa có chủ, raw SQL `shared-pool-capacity.repo.ts` đọc `subscriptions`, `SeatBaselinePhaseListener` ×2 | gate của hạng mục (module-layout, module-graph, test-support, capability-graph, policy-ownership) xanh                         |
| `pnpm typecheck`                                                                                       | P2                    | đỏ **6 lỗi baseline** (`proposal.repo`, `subscription-change`, `subscription-period`, `provisioning.service`, `seat-baseline-phase.listener`), 0 lỗi ở file của hạng mục                                                                                                                                                | —                                                                                                                              |
| `pnpm lint` / `eslint` trên file đổi                                                                   | P2                    | file của hạng mục sạch; còn lỗi prettier ở `provisioning.dto.ts` (dòng của mf1) và 60+ lỗi baseline ở `requests/`, `budgets/`                                                                                                                                                                                           | không reformat file của agent khác                                                                                             |
| `pnpm format:check`                                                                                    | P2                    | đỏ ở 16 file baseline (không phải của hạng mục)                                                                                                                                                                                                                                                                         | —                                                                                                                              |
| Drift schema↔migration (DB tạm, `migrate deploy` + `migrate diff`)                                     | P2                    | 3 bảng/8 enum/chỉ mục `ghost_seat_*` không lệch; còn lệch baseline `pool_grant_avoided_costs`, `budget_proposal_lines`, `provisioning_tasks.purchased_at`                                                                                                                                                               | —                                                                                                                              |
| `pnpm openapi:export`                                                                                  | P2                    | chỉ chạy được với `TS_NODE_TRANSPILE_ONLY=true` (typecheck baseline đỏ); `openapi.json` baseline đã cũ nên diff gồm cả thay đổi của hạng mục khác                                                                                                                                                                       | —                                                                                                                              |

TẠM CHỌN của hạng mục (ghi để Owner / chat review xác nhận):

- W4/W5 chưa có: `K4` chưa hỗ trợ — không sinh `G1` cho kho `K4`, `REGRANT_BEFORE_PURCHASE` chỉ còn trong codec; không giải phóng cam kết; không điểm điều chỉnh, bỏ `nextAdjustmentPoint`.
- Truy vấn kho Trống tự viết (`LicensingGhostSeatApi.listSharedPoolVacancies`): hai lần đọc cố định (catalog: thuê bao ACTIVE, chưa có kỳ kế tiếp, `end_date IS NULL OR >= asOf`; licensing: `HOLDING` = chưa kết thúc, chưa lỗi/hủy — gồm cả seat bắt đầu trong tương lai như `countSeatsOfSubscriptions`). Không dựa `shared-pool-capacity.repo.ts`.
- Facade mới `LicensingGhostSeatApi` (file riêng) thay vì thêm vào `LicensingApi`, để tránh xung đột merge với hạng mục grace-notice; không có `usableOn`/`notUsableReason`/`notBefore` trong `RuleSeat` (thuộc `g3-g4`/`grace-notice`).
- Enum khai sớm `G3`/`G4`, `PAUSED`, `KEPT`/`NEGATED`/`TRANSFER_SEAT_REVOKED` (spec bảo thêm sau bằng `*_values`) vì luật thay thế `G2` (Q-82), DA6-04 và `KPI-5` phải kiểm trên DB thật; codec bằng chứng đọc `G3`/`G4` như object có `group` (hạng mục sau thay hình dạng). Hạng mục sau **không** cần `ALTER TYPE ADD VALUE` cho các giá trị này (sẽ lỗi nếu thêm lại không `IF NOT EXISTS`).
- Cột thêm `department_id` (phòng sở hữu seat của `G2`) cho `departmentScope MINE`; `G1` không phòng nên hiện ở cả `MINE` lẫn `ALL`. Không FK sang bảng của module khác (Prisma buộc model module kia nhắc tới module này); chỉ FK nội bộ, `superseded_by_id` hoãn tới cuối transaction.
- Codec `rule-run-skip-detail.json.ts` đặt trong `rule-run/` (không phải `ghost-seat/`) để `ghost-seat` và `rule-run` cùng L0.
- Thông báo `GHOST_SEAT_G2_DETECTED` mang `recommendationId`, `employeeId`, `applicationId` — không `employeeName`/`applicationName` như spec, vì gate hộp thư chỉ gọi người bằng id (`inbox.policy.spec`). Không IT Admin phụ trách phòng ⟹ không gửi.
- `leftOn` trong bằng chứng `G2` là `null` (chưa có facade ngày nghỉ việc ở `personnel`); `holder_left_on` = ngày lượt chạy phát hiện. Người giữ nghỉ = `employees.status <> ACTIVE`.
- Reclaim lỗi cổng (`RevocationRefusedError`, assignment không mở/không tồn tại, seat target) ⟹ 409 `GHOST_SEAT.SEAT_NOT_REVOCABLE`; `ProvisioningAnotherItAdminNeededError` không map (người đã nghỉ nên không xảy ra).
- Audit thêm `GHOST_SEAT.REOPENED` (khi tác vụ đóng thất bại đưa `G2` về `OPEN`), ngoài sáu mã của spec.
- `KPI-5`: biên kỳ tính theo UTC; kỳ tối đa 366 ngày; `422 GHOST_SEAT.PERIOD_INVALID`.
- Lượt chạy `FAILED` với `attempt < 3` cũng được nhận lại (spec chỉ nêu `RUNNING` quá 2 h).
- Sửa ngoài scope để app khởi động được trên baseline: `LicensingModule` thiếu provider `SharedPoolService`/`SharedPoolCapacityRepo` (thêm vào providers); `poolGrantAvoidedCosts` thành `optional` ở DTO task. Hai thay đổi này nên trùng với bản sửa của chat mf1 — gộp khi merge.
- Thêm `OptimizationModule` vào graph `RecordSuperAdminEventCliModule` (gate `extension-wiring`: graph chạm `RevocationListeners` phải mang đủ bên đăng ký).

- [x] AC trong scope có bằng chứng (bảng trên; riêng `mf2-*` flow chưa chạy được).
- [x] Spec/plan phản ánh implementation cuối (7 operation; TẠM CHỌN ở trên).
- [x] `pnpm check` và full suite CHƯA chạy (đúng chỉ dẫn): chỉ chạy bộ kiểm tra nhanh Checkpoint A/B.
