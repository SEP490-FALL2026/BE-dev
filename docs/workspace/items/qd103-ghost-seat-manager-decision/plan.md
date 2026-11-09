# Plan: qd103-ghost-seat-manager-decision

- Spec: `spec.md` cùng thư mục; revision đầu vào: Docs `9c7f386`, BE `46b6a94e` (đọc ở `712044f9`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: subagent chat review (W6, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `in-progress` (đã chạy kiểm tra cục bộ; flow chưa chạy được, gate baseline đỏ như ghi ở Verification) trên nhánh `feat/mf5` (worktree `Code/be-mf5`), 09/11/2026; Task 1–9 làm theo DELTA của Owner (xem TẠM CHỌN cuối plan: g3-g4, W5, flow chưa chạy được). PR: chưa có, chưa push.
- Giao code: **ba lượt** — Phase 1 dữ liệu + định tuyến + chờ trưởng phòng + tạm dừng (Task 1–3, Checkpoint A), Phase 2 quyết định, thu hồi có ân hạn,
  trả lại, kết cục (Task 4–6, Checkpoint B), Phase 3 nhắc + dashboard + flow (Task 7–9, Checkpoint C). Ước ~62 file.

## Before coding

Đọc spec `qd103-revocation-grace-notice` (_Behavior_ 3–4, 6: `notice`, `withdrawRevocationReason`, lý do đã gỡ), `qd103-ghost-seat-g1-g2` (trạng thái,
listener `SKIP LOCKED`, thứ tự khóa), `qd103-ghost-seat-g3-g4` (`paused_at`, `ghost-seat-exemption.repo.ts`, `PersonnelApi`); `src/modules/optimization/README.md`;
`src/modules/licensing/handover/handover-confirmer.policy.ts:33-80` (nguồn `GHOST_SEAT` ⟹ trưởng phòng đã quyết xác nhận — không sửa); mẫu thông báo chờ
phòng `src/modules/budgets/budget/budget-notifier.service.ts:88,235`; mẫu job `src/modules/licensing/expiry/expiry-reminder.job.ts`;
`src/modules/dashboards/manager/manager-dashboard.service.ts:60-80`; flow `test/support/flows/flow-template.ts` (đăng ký sweeper), `flow-clock.ts`;
W5 `licensing.extension-points.ts` (`RevocationDecisionContributions`). Lệnh đã kiểm trong `package.json`: `db:migrate:deploy`, `prisma:generate`, `test`,
`test:integration`, `test:http`, `test:flows`, `openapi:export`, `arch:check`, `arch:capabilities`, `rules:check`, `test:gates`.

## Design review

Audit `design-audit-w6.md` (08/11/2026) — hạng mục này: 1 Cao (DA6-02 nhánh `G3`/`G4`) · 7 TB (DA6-19…DA6-25, DA6-29 phần) · 1 Thấp (DA6-34).
Mọi finding đã kiểm với nguồn trước khi sửa (`EP-10:252,258,259,262,305,306,312`, QT 5.4–5.5 và A.4, `SBF-04.md` bước 5 và 5.2, `QĐ-64a`, `QĐ-90c`,
`QĐ-66r`, code `handover-confirmer.policy.ts:35`, `seed-steps.ts`, `flow-template.ts`).

| Finding                                                 | Mức  | Kết quả                                                                                      | Sửa ở                      |
| ------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- | -------------------------- |
| DA6-02 listener đóng `ACCEPTED` khi claim               | Cao  | đúng — nhánh `G3`/`G4` chỉ `COMPLETED`; claim không đổi khuyến nghị                          | _Behavior_ 6; Task 6       |
| DA6-19 CHECK `PAUSED` thất bại trên dữ liệu có sẵn      | TB   | đúng — `paused_at`, `pause_transfer_id` chuyển sang migration g3-g4                          | _Ownership_                |
| DA6-20 `MONITOR` hết tạm dừng tới trưởng phòng          | TB   | đúng (`FR-4.12`, `QĐ-09`) — về `OPEN`, `routed_at NULL`                                      | _Behavior_ 3; Task 3       |
| DA6-21 mất trưởng phòng sau định tuyến                  | TB   | đúng (`US-10-06` AC-9, `SBF-04` _kể cả trưởng phòng nghỉ_) — `WAITING_FOR_HEAD`, hạn giữ     | _Behavior_ 2; Task 2       |
| DA6-22 Q-87 hạn từ `effective_on`                       | TB   | đúng (`US-10-06` AC-16, AC-19) — hạn từ lúc vào hàng; Q-87 thành _theo nguồn_                | _Behavior_ 3; Task 3       |
| DA6-23 thiếu thứ tự khóa và test đua                    | TB   | đúng — khuyến nghị trước licensing; listener `SKIP LOCKED`; 3 test đua                       | _Behavior_ 4, 7; Task 5, 6 |
| DA6-24 sửa fixture `shared-demo-v3` đã áp               | TB   | đúng — bỏ seed; flow dùng world riêng + sweeper; kịch bản bàn giao W7 `qd103-seed-demo-v4`   | Task 9                     |
| DA6-25 mở lại tác vụ sau đóng thất bại mất trưởng phòng | TB   | đúng (`QĐ-64a`, QT 5.5) — dùng lại quyết định _Thu hồi_ cuối, `notBefore` cũ, không `notice` | _Behavior_ 6; Task 6       |
| DA6-29 thiếu hồi quy `R-J07` trên đường MF-5            | TB   | đúng — flow khẳng định cam kết _Đã giải phóng_ + `G1` hôm sau                                | test matrix; Task 9        |
| DA6-34 số dòng `organization-read.api.ts`               | Thấp | đúng — `:121`, `:142`, `:162`                                                                | _Ownership_                |
| Bỏ sót: `RevocationDecisionContributions` (W5 hẹn W6)   | —    | thêm — `RECLAIM_DECIDED` không tác vụ sống bị loại khỏi số seat cần                          | _Behavior_ 6; Task 6       |
| Q-87, Q-89, Q-95, Q-96                                  | —    | theo nguồn (`EP-10:259,262`; `BRD:640`; `MF-5.md:60`; `SBF-04.md` _gộp theo tuần_)           | _Behavior_ 1, 3, 6         |
| Q-88, Q-90, Q-94                                        | —    | kỹ thuật, giữ; Q-88 lệch chữ L4-08(5) — chat review sửa LEDGER                               | _Behavior_ 4, 5, 8         |

## Tasks

### Phase 1 — dữ liệu, định tuyến, chờ trưởng phòng, tạm dừng/tiếp tục

### Task 1: migration `optimization_ghost_seat_decisions_values` + `optimization_ghost_seat_decisions`

- Files: `prisma/migrations/<ts-1>_optimization_ghost_seat_decisions_values/migration.sql` (`ADD VALUE` `GhostSeatState`, `GhostSeatCloseReason`),
  `prisma/migrations/<ts>_optimization_ghost_seat_decisions/migration.sql` (cột định tuyến + CHECK, `ghost_seat_decisions` + CHECK `INV-09` + trigger
  append-only, `ghost_seat_returns` UNIQUE, enum `GhostSeatChoice`), `prisma/models/optimization.prisma`, `src/modules/optimization/ghost-seat/ghost-seat-state.policy.ts`
  (+ spec: tập _chưa quyết_, tập `KPI-5` thêm `KEPT`), `test/integration/optimization/ghost-seat-decisions-migration.integration-spec.ts` (mới).
- Depends on: `qd103-ghost-seat-g3-g4` Checkpoint B.
- Acceptance: test matrix _DB_, phần DB của AC-4; migration chạy được trên DB đã có dòng `PAUSED`.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`;
  `pnpm test:integration -- test/integration/optimization/ghost-seat-decisions-migration.integration-spec.ts`.

### Task 2: tham số + mã thông báo + định tuyến + mất/có trưởng phòng

- Files: `src/modules/operating-parameters/parameter-definitions.policy.ts` (+ spec) (`GHOST_SEAT_DECISION_WORKING_DAYS`, `GHOST_SEAT_REVOCATION_GRACE_DAYS`),
  `src/modules/notifications/public/notifications.types.ts`, `src/modules/notifications/inbox/inbox.policy.ts` (+ spec) (6 mã),
  `src/modules/optimization/decision/decision-routing.service.ts`, `decision-routing.policy.ts` (+ spec: gộp tuần, mất/có trưởng phòng), `decision.repo.ts`,
  `decision-follow-up.job.ts`, `optimization.module.ts`, `docs/rules/security-jobs.md`; test `test/integration/optimization/ghost-seat-routing.integration-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: test matrix _định tuyến, AC-16, Q-96_, `US-10-03` AC-13 (vế hàng đợi), AC-9/`US-10-08` AC-4, _mất trưởng phòng (DA6-21)_.
- Verify: `pnpm exec jest src/modules/optimization/decision src/modules/operating-parameters src/modules/notifications/inbox`;
  `pnpm test:integration -- test/integration/optimization/ghost-seat-routing.integration-spec.ts`.

### Task 3: tạm dừng / tiếp tục khi điều chuyển

- Files: `decision/decision-routing.service.ts`, `decision-routing.policy.ts` (+ spec: hạn từ lúc vào hàng, `MONITOR` về `OPEN`), `decision.repo.ts`; test
  `test/integration/optimization/ghost-seat-transfer-pause.integration-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix AC-15 tạm dừng (vế job), AC-19 (Q-87), _`MONITOR` tiếp tục (DA6-20)_, AC-15 kết thúc/hủy chuyển, Q-89.
- Verify: `pnpm exec jest src/modules/optimization/decision`;
  `pnpm test:integration -- test/integration/optimization/ghost-seat-transfer-pause.integration-spec.ts test/integration/personnel/personnel-api-overlap.integration-spec.ts`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` — chưa
có operation mới); `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`. Commit `feat(qd103-w6): manager-decision P1`.

### Phase 2 — hàng đợi, quyết định, thu hồi có ân hạn, trả lại, kết cục

### Task 4: hàng đợi + `Get` cho trưởng phòng

- Files: `decision/decision.controller.ts`, `decision.dto.ts`, `decision-queue.service.ts`, `decision.errors.ts`, `decision.http-errors.ts`,
  `board/board.controller.ts`, `board.service.ts` (quyền người quyết); `test/support/api-coverage-manifest.ts`,
  `test/support/openapi-example-route-codes-optimization.ts`, registry danh sách; test `test/http/optimization/ghost-seat-queue.http-spec.ts` (mới).
- Depends on: Checkpoint A.
- Acceptance: test matrix `US-10-06` AC-1, AC-6/`US-10-04` AC-10.
- Verify: `pnpm exec jest src/modules/optimization/decision`; `pnpm test:http -- test/http/optimization/ghost-seat-queue.http-spec.ts`.

### Task 5: quyết định Giữ / Thu hồi / Miễn trừ (hàng loạt, tự quyết, luật 1 tháng, `timing` + `notice`, thứ tự khóa)

- Files: `decision/decision.service.ts`, `decision.policy.ts` (+ spec: người quyết, lý do, miễn trừ 12 tháng lịch, `LEFT_TO_EXPIRE`, mốc ân hạn, khử trùng
  và sắp `id`), `decision.controller.ts`, `decision.dto.ts`, `decision.repo.ts`, `decision.errors.ts`, `decision.http-errors.ts`,
  `optimization-audit-event.mapper.ts`; test `test/integration/optimization/ghost-seat-decision.integration-spec.ts` (mới),
  `test/http/optimization/ghost-seat-decision.http-spec.ts` (mới).
- Depends on: Task 4; `qd103-revocation-grace-notice` Checkpoint A.
- Acceptance: test matrix AC-2/AC-16, `US-10-07` AC-18, AC-3, AC-4, AC-5 (Q-94), AC-8, `US-10-03` AC-13/AC-20, AC-15 (vế 409), AC-17/AC-18, _đua_ (vế
  quyết định ↔ job tạm dừng).
- Verify: `pnpm exec jest src/modules/optimization/decision`;
  `pnpm test:integration -- test/integration/optimization/ghost-seat-decision.integration-spec.ts`;
  `pnpm test:http -- test/http/optimization/ghost-seat-decision.http-spec.ts test/http/licensing/provisioning.http-spec.ts`.

### Task 6: IT trả lại + kết cục `G3`/`G4` (listener, mở lại sau đóng thất bại) + `RevocationDecisionContributions`

- Files: `decision/decision-return.service.ts`, `decision.controller.ts`, `decision-revocation.contribution.ts` (mới), `ghost-seat/ghost-seat-revocation.listener.ts`,
  `board/board-reclaim.service.ts` (`G3`/`G4` sau `CLOSED_FAILED` — Q-95, DA6-25), `optimization.module.ts`; test
  `test/integration/optimization/ghost-seat-return.integration-spec.ts` (mới).
- Depends on: Task 5.
- Acceptance: test matrix AC-10 (2 dòng), AC-11/AC-12, _trả lại khi đang làm_, _đua_ (vế trả lại ↔ hoàn tất), `US-10-07` AC-1/AC-2/AC-19, AC-12/AC-13
  (Q-95, DA6-25), _W5 contribution_, `US-07-05` AC-20.
- Verify: `pnpm test:integration -- test/integration/optimization/ghost-seat-return.integration-spec.ts test/integration/licensing/provisioning-revocation-withdraw.integration-spec.ts test/integration/licensing/handover-duty-sources.integration-spec.ts`;
  `pnpm test:http -- test/http/optimization/ghost-seat-board.http-spec.ts`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ `ghostSeatQueueList`, `ghostSeatDecisionCreate`, `ghostSeatRecommendationReturn` + đổi
`ghostSeatRecommendationGet`/`Reclaim`; `pnpm arch:capabilities --module optimization` (`decision` L3 không import L3 khác; miễn trừ qua `ghost-seat` L0);
`pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`. Commit `feat(qd103-w6): manager-decision P2`.

### Phase 3 — quá hạn, nhắc miễn trừ, báo cáo, dashboard, flow

### Task 7: quá hạn + nhắc miễn trừ + `ghostSeatDecisionList`/`ghostSeatExemptionList`

- Files: `decision/decision-follow-up.job.ts`, `decision-routing.service.ts` (quá hạn, nhắc), `decision.controller.ts`, `decision-queue.service.ts`,
  `decision.dto.ts`; test `test/integration/optimization/ghost-seat-follow-up.integration-spec.ts` (mới), `test/http/optimization/ghost-seat-decision.http-spec.ts`.
- Depends on: Checkpoint B.
- Acceptance: test matrix AC-14 (Q-90), `US-10-08` AC-1/AC-6/AC-7, `US-10-03` AC-13/AC-20 (vế báo cáo Super Admin).
- Verify: `pnpm test:integration -- test/integration/optimization/ghost-seat-follow-up.integration-spec.ts`;
  `pnpm test:http -- test/http/optimization/ghost-seat-decision.http-spec.ts`.

### Task 8: dashboard trưởng phòng + facade + README

- Files: `src/modules/optimization/public/optimization.api.ts`, `public/optimization.types.ts`, `src/modules/dashboards/manager/manager-dashboard.service.ts`
  (+ spec), `manager-dashboard.dto.ts`, `src/modules/optimization/README.md`; test `test/http/dashboards/dashboards.http-spec.ts`.
- Depends on: Task 7.
- Acceptance: test matrix _dashboard_.
- Verify: `pnpm exec jest src/modules/dashboards/manager`; `pnpm test:http -- test/http/dashboards/dashboards.http-spec.ts`.

### Task 9: flow `@MF5` (không seed)

- Files: `test/flows/mf5-ghost-seat.flow-spec.ts` (mới, `@MF5`: IT tạo nguồn + import qua API trên dữ liệu đã seed, chạy sweeper lượt tuần/định tuyến,
  `H1` Thu hồi, claim sớm 409, sau ân hạn hoàn tất ⟹ `ACCEPTED`, cam kết _Đã giải phóng_, lượt ngày sau `G1`; Giữ; Miễn trừ), `test/support/flows/flow-template.ts`
  (đăng ký `InternalRulesSweeper`, `UsageRulesSweeper`, `DecisionFollowUpSweeper`), `test/support/flows/` helper nếu cần. **Không** sửa
  `src/cli/seed/fixture/shared-demo-v3/` (đã áp); kịch bản seed MF-5 (nguồn Figma, import có thông báo, `E1` 65 ngày, `H1` 70 ngày, hồ sơ bẫy `TC-2`, một
  người đã nghỉ còn seat) bàn giao W7 `qd103-seed-demo-v4` qua tracker.
- Depends on: Task 8.
- Acceptance: test matrix _flow `@MF5`_; flow `mf5-rightsizing*` (nhãn `@SBF20` từ W5) không đổi.
- Verify: `pnpm test:flows -- test/flows/mf5-ghost-seat.flow-spec.ts test/flows/mf2-offboarding.flow-spec.ts test/flows/mf2-abrupt-departure.flow-spec.ts test/flows/mf3-transfer.flow-spec.ts`.

### Checkpoint C (hết lượt 3)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ thêm `ghostSeatDecisionList`, `ghostSeatExemptionList`, đổi `managerDashboardGet`;
`pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`; tự review spec _Behavior_ 1–12. Commit
`feat(qd103-w6): manager-decision P3`.

## Verification and handoff

Môi trường: PostgreSQL native, DB tạm theo UUID (`TEST_DATABASE_ADMIN_URL`), nhánh `feat/mf5` (worktree `Code/be-mf5`, HEAD ban đầu `0df8bc8f`), 09/11/2026. Máy bị các worktree khác chiếm CPU nên vài lần `globalSetup` hết 60 s (chạy lại là qua).

| Lệnh / kiểm tra AC                                                                                                                                               | Revision / môi trường | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Giới hạn / việc còn lại                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec jest src/modules/optimization src/modules/operating-parameters src/modules/notifications/inbox src/modules/dashboards src/modules/personnel/transfer` | P3                    | 21 suite · 230 test xanh (policy: `decision`, `decision-routing`, `ghost-seat-state`, tham số, hộp thư, dashboard trưởng phòng)                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                 |
| `pnpm test:integration -- test/integration/optimization test/integration/personnel/personnel-api-overlap.integration-spec.ts`                                    | P3                    | 12 suite · 72 test xanh: migration quyết định (5: CHECK hạn/phòng, `return_count`, 23505 trả lại lần hai, INV-09, 3–1000 ký tự, 55000 append-only, cặp cột `PAUSED`), định tuyến (4), tạm dừng/tiếp tục (5), `PersonnelApi` overlap (1), quyết định (9: Thu hồi → ân hạn → claim 409 `NOT_BEFORE` → claim 200 sau mốc → hoàn tất → `ACCEPTED`; Giữ; Miễn trừ 12/13 tháng; hàng loạt Q-94; người quyết; tự quyết; R-J06; hàng đợi + `Get`; 409 `PAUSED`), trả lại/kết cục (6), nhắc quá hạn/miễn trừ/báo cáo/dashboard (4), g1-g2 hồi quy (5 file) | một lần chạy cuối chỉ lặp lại thư mục `optimization` (11 suite · 71 test) sau khi sửa tên FK trong migration                                                      |
| Hồi quy `provisioning-revocation-open`, `-withdraw`, `handover-duty-sources`, `operating-parameters-http` (integration)                                          | P2                    | 4 suite · 79 test; `operating-parameters-http` lần đầu đỏ ở `parameters.size` (stale 22 từ nền, nay 26 = số định nghĩa) → sửa kỳ vọng, chạy lại 27/27 xanh                                                                                                                                                                                                                                                                                                                                                                                        | sửa test nền ngoài vùng ở một dòng, ghi ở TẠM CHỌN                                                                                                                |
| `pnpm test:http -- ghost-seat-board dashboards api-inventory openapi-response-examples openapi-export provisioning.http-spec`                                    | P3                    | sau khi cập nhật manifest/mã lỗi/message ví dụ và `openapi.json`: board 9 · dashboards · api-inventory · response-examples · provisioning · openapi-export đều xanh (lượt chạy cuối: `openapi-export` + `api-inventory` + `openapi-response-examples` 3 suite · 20 test)                                                                                                                                                                                                                                                                          | bốn operation mới + `ghostSeatRecommendationGet`/`Reclaim` đã vào manifest; test `http` riêng cho hàng đợi/quyết định không viết (ca HTTP chạy trong integration) |
| `pnpm typecheck`                                                                                                                                                 | P3                    | đỏ **7 lỗi, đúng danh sách nền** (`budgets/proposal.repo`, `catalog/subscription-change`, `catalog/subscription-period`, `licensing/provisioning.service` ×3, `seat-baseline-phase.listener`); **0 lỗi mới**                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                 |
| `pnpm exec eslint` trên mọi file đổi + `prettier --check`                                                                                                        | P3                    | 0 lỗi, 0 cảnh báo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `pnpm format:check` toàn repo vẫn đỏ ở 14 file nền, không file nào của hạng mục                                                                                   |
| `pnpm test:gates`                                                                                                                                                | P3                    | 326 xanh · 5 đỏ, **trùng tên với nền** (`migration-order` 15 chữ số, model `PoolGrantAvoidedCost` chưa có chủ, SQL `shared-pool-capacity.repo`, `SeatBaselinePhaseListener` ×2); module-layout, capability-graph, policy-ownership, test-support… xanh                                                                                                                                                                                                                                                                                            | —                                                                                                                                                                 |
| `pnpm arch:check` · `arch:docs:check` · `rules:check` · `prisma:validate` · `test:discovery`                                                                     | P3                    | xanh (sau `arch:graph`, `arch:routes` = 361 operation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                                 |
| `pnpm arch:capabilities --module optimization`                                                                                                                   | P3                    | 5 capability, không vòng: `ghost-seat`, `rule-run` L0 · `internal-rules` L1 · `board`, `decision` L3 (`decision` chỉ import `ghost-seat`)                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                 |
| `pnpm openapi:export`                                                                                                                                            | P3                    | chỉ chạy với `TS_NODE_TRANSPILE_ONLY=1` (typecheck nền đỏ); `openapi.json` nền đã cũ nên diff gồm cả thay đổi của hạng mục khác                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                 |
| Drift schema↔migration (DB tạm `drift_mf5_*`, `migrate deploy` + `migrate diff`, đã xóa)                                                                         | P3                    | bảng/enum/cột/FK mới không lệch (đã đổi tên FK về `*_id_fkey` cho khớp Prisma); còn lệch nền `pool_grant_avoided_costs`, `budget_proposal_lines`, `provisioning_tasks.purchased_at`                                                                                                                                                                                                                                                                                                                                                               | migration chạy được; "DB đã có dòng `PAUSED`" không dựng riêng (cột mới nullable, CHECK chỉ ràng cặp)                                                             |
| `pnpm test:flows -- test/flows/mf5-ghost-seat.flow-spec.ts …`                                                                                                    | —                     | **không chạy được**: globalSetup seed `POST /budget-proposals` → 500 (`priorityRank`, nền `budgets/**`)                                                                                                                                                                                                                                                                                                                                                                                                                                           | flow đã viết (`@MF5`) nhưng chưa chạy; luồng liền mạch được chứng minh bằng integration ở trên                                                                    |
| `pnpm check` và full suite                                                                                                                                       | —                     | CHƯA chạy (đúng chỉ dẫn)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                 |

Test matrix: đã phủ mọi dòng trừ **W5 contribution** (không làm — W5 chưa có), `US-07-05` AC-20 (nhóm `R4`, không thay đổi — kết cục thu hồi theo từng `Assignment` có sẵn của g1-g2/SBF-18, chưa có test riêng ở đây) và **đua** (trả lại ↔ hoàn tất, quyết định ↔ job tạm dừng): thứ tự khóa được bảo đảm bằng thiết kế (`lockMany` tăng dần, job `SKIP LOCKED`, kiểm điều chuyển trước transaction) nhưng chưa có test đồng thời. Hai commit đầu (P1, P2) chứa cả mã dùng chung với P3 (job nhắc, `ghostSeatDecisionList`/`ExemptionList`) vì chung file `module`, `controller`, `repo`.

**TẠM CHỌN** (thiếu luật thật hoặc phụ thuộc hạng mục chưa có; chọn đơn giản nhất, chờ Owner / chat review xác nhận):

- g3-g4 và vendor-usage-import chưa làm: không có job phát hiện `G3`/`G4`; test chèn khuyến nghị bằng `seedRecommendation`. Evidence `G3`/`G4` vẫn là `{ group }` + catchall (codec g1-g2). Phần tối thiểu của g3-g4 tạo ở đây: cột `paused_at`, `pause_transfer_id` (chỉ CHECK cặp cùng có/không, **không** CHECK `PAUSED ⟺ paused_at` vì dòng `PAUSED` đã có từ g1-g2 không có hai cột này), bảng `ghost_seat_exemptions` (hình dạng theo spec g3-g4, ghi ở đây, g3-g4 đọc), repo dùng chung `ghost-seat/ghost-seat-decision.repo.ts` (L0, gồm quyết định + trả lại + miễn trừ). Migration của g3-g4 phải bỏ các cột/bảng này và `LEFT_TO_EXPIRE` (đã thêm ở `*_values` của hạng mục này; `ADD VALUE IF NOT EXISTS` nên không lỗi nếu trùng).
- `*_values` thêm `AWAITING_DECISION`, `WAITING_FOR_HEAD`, `RETURNED_TO_HEAD`, `EXEMPTED` và `LEFT_TO_EXPIRE`; `PAUSED`, `KEPT`, `NEGATED`, `TRANSFER_SEAT_REVOKED` đã có từ `20261109200100` nên không thêm lại. Timestamp `20261109200300` / `20261109200400`.
- `PersonnelApi.getTransfersInOverlap` và `getTransfersByIds` thêm tối thiểu (`TransferQueryService` → `TransferRepo`, vị từ `status IN (PENDING, EFFECTIVE) AND effective_on <= onDate AND closed_at IS NULL`). Điều chuyển "đã đóng" = `CANCELLED` hoặc `closed_at` có giá trị. Kiểm lại điều chuyển lúc quyết định chạy **trước** transaction chính (mỗi mục một transaction riêng, `SKIP LOCKED`) để trạng thái `PAUSED` được lưu cùng lúc câu trả lời 409.
- W5 `RevocationDecisionContributions` chưa có ⟹ **không** đăng ký (Task 6 phần W5, dòng test matrix "W5 contribution" chưa làm). W4 K4 / giải phóng cam kết không làm. `src/modules/requests/**` và `budgets/**` không sửa.
- Hàng đợi `ghostSeatQueueList` trả danh sách **phẳng** phân trang, sắp theo người giữ (các dòng của một người liền nhau) kèm `holderCount`, không mảng lồng (tránh gate `NESTED_ARRAYS`). `previousDecision` chỉ là quyết định gần nhất của chính khuyến nghị này (chưa có `previous_recommendation_id` của g3-g4).
- Người giữ không có chỗ ở (placement) hôm nay ⟹ khuyến nghị `OPEN` không được định tuyến (chờ). Phòng không có trưởng phòng ⟹ `WAITING_FOR_HEAD` (`GHOST_SEAT_NEW` giữ qua `holdForDepartment`, Super Admin nhận `GHOST_SEAT_WAITING_FOR_HEAD` một lần mỗi phòng mỗi ngày); `decider_department_id` luôn được đặt khi định tuyến, kể cả `WAITING_FOR_HEAD`.
- Thông báo dùng id thay vì tên (`applicationId`, `employeeId`, `departmentId`, `weekKey`, `decisionDueOn`, `exemptUntil`) theo luật hộp thư; `GHOST_SEAT_RETURNED` khi phòng không có trưởng phòng được giữ qua `holdForDepartment`.
- Lỗi lô: một mục sai ⟹ cả lô bị từ chối; mã/HTTP lấy theo mục sai đầu tiên (`NOT_DECIDER` 403, `NOT_FOUND` 404, `PAUSED`/`NOT_DECIDABLE`/`SEAT_NOT_REVOCABLE` 409, `EXEMPTION_*` 422) và `error.details.items[]` nêu từng mục. Kiểm người quyết đi trước kiểm trạng thái (người không phải trưởng phòng không biết trạng thái). Khuyến nghị `PAUSED` hay `RECLAIM_DECIDED` đều không có thể quyết.
- `LEFT_TO_EXPIRE` không ghi `ghost_seat_decisions` (đúng spec) nhưng ghi audit `GHOST_SEAT.LEFT_TO_EXPIRE` và, nếu là quyết lại sau trả lại, báo `REVOCATION_CANCELLED` cho người giữ.
- Quyết lại sau trả lại: `notice` không gửi lần hai; `REVOCATION_CANCELLED` (eventKey theo khuyến nghị) gửi khi Giữ/Miễn trừ/`LEFT_TO_EXPIRE` một khuyến nghị đã `return_count = 1`.
- IT trả lại: `revocation_task_id` về `NULL`, `overdue_noticed_at` về `NULL` (hạn mới từ hôm nay, đếm lại quá hạn); khi phòng không có trưởng phòng ⟹ `WAITING_FOR_HEAD` với `return_count = 1` rồi có trưởng phòng ⟹ `RETURNED_TO_HEAD`.
- `ghostSeatRecommendationReclaim` mở lại `G3`/`G4`: tác vụ phải `CLOSED_FAILED`/`CANCELLED` (hoặc không có tác vụ), dùng quyết định `RECLAIM` cuối; `canReclaim` trong wire vẫn chỉ đúng cho `G2 OPEN` (cần đọc tác vụ để biết "không sống", chưa làm ở bảng).
- `ghostSeatRecommendationGet` cho MANAGER: người không phải trưởng phòng hiện tại của `decider_department_id` ⟹ 403 `GHOST_SEAT.NOT_DECIDER`; IT_ADMIN đọc mọi khuyến nghị như cũ.
- `ghostSeatExemptionList` (MANAGER phòng mình theo `decider_department_id`, IT_ADMIN đọc tất cả); `ghostSeatDecisionList` (SUPER_ADMIN, lọc `selfDecided`). Nhắc miễn trừ gửi cho trưởng phòng **hiện tại** của phòng người giữ (placement hôm nay), không phải phòng quyết.
- Job `DecisionFollowUpSweeper` mỗi giờ (lần đầu sau 6 phút); thứ tự: tạm dừng → tiếp tục → định tuyến → theo dõi trưởng phòng → quá hạn (ngày làm việc) → miễn trừ. Cửa sổ ngày nghỉ để tính hạn: 120 ngày.
- Thông số `GHOST_SEAT_DECISION_WORKING_DAYS` (1–20, mặc định 5) và `GHOST_SEAT_REVOCATION_GRACE_DAYS` (0–30, mặc định 7); test `parameter-definitions` và `operating-parameters-http` cập nhật danh sách khóa.
- Flow `@MF5` (`test/flows/mf5-ghost-seat.flow-spec.ts`) đã viết nhưng **chưa chạy được** (seed `POST /budget-proposals` 500 ở nền); khuyến nghị `G4` chèn thẳng bảng vì g3-g4/usage import chưa có. `InternalRulesSweeper` và `DecisionFollowUpSweeper` thêm vào `SWEEPER_OVERRIDES` và hai lượt `ghostSeatRules` / `ghostSeatQueue` đăng ký ở `FlowWorld`. Luồng liền mạch được chứng minh bằng integration (`ghost-seat-decision` test đầu tiên).
- Test `http` riêng cho hàng đợi/quyết định không viết: các ca HTTP chạy trong integration (server thật + PostgreSQL) cùng các test `openapi-*`, `api-inventory`.

- [x] AC trong scope có bằng chứng (bảng trên; riêng flow `@MF5`, W5 contribution và test đua chưa).
- [x] Spec/plan phản ánh implementation cuối (xem TẠM CHỌN: g3-g4, W5, hàng đợi phẳng).
- [x] `pnpm check` và full suite CHƯA chạy (ghi rõ).
