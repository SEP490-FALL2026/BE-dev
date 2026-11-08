# Plan: qd103-revocation-grace-notice

- Spec: `spec.md` cùng thư mục; revision đầu vào: Docs `9c7f386`, BE `46b6a94e` (đọc ở `712044f9`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: subagent chat review (W6, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **một lượt** (Task 1–4, Checkpoint A). Ước ~32 file. Lượt **đầu tiên** của W6 (NOTES §3).

## Before coding

Đọc `src/modules/licensing/README.md` (thứ tự khóa, `RevocationListeners`), `docs/rules/module-structure.md` (≤ 25 file — `provisioning/`
đang 24 file ở `712044f9`, W4 có thể thêm ⟹ file mới chỉ vào nhóm `revocation-withdrawal/`), `docs/rules/database-business.md` (DB-16
append-only, trigger, index partial), `docs/rules/api-contract.md`, migration `20261024080000_licensing_revocation_tasks` (index lý do :129-130,
trigger :137-146) và `20261029101000_provisioning_transfer_cancel_reason` (mẫu guard). Đối chiếu `file:dòng` ở spec _Ownership_ với cây hiện tại
(W4/W5 sửa `provisioning/` trước). Lệnh đã kiểm trong `package.json`: `db:migrate:deploy`, `prisma:generate`, `test`, `test:integration`,
`test:http`, `test:e2e`, `test:flows`, `openapi:export`, `arch:check`, `arch:capabilities`, `rules:check`, `test:gates`. Không chạy `pnpm check`/full
suite (tracker §4.5).

## Design review

Audit `design-audit-w6.md` (08/11/2026) — hạng mục này: 1 Cao (DA6-01) · 2 TB (DA6-28, DA6-29) · 1 Thấp (DA6-33). Mọi finding đã kiểm với nguồn
và code trước khi sửa (index ở `migration.sql:129-130`, `revocation.service.ts:47-52`, `handover-confirmer.policy.ts:73-80`, `failure.policy.ts:71-73`).

| Finding                                                     | Mức  | Kết quả                                                                                           | Sửa ở                                               |
| ----------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| DA6-01 index lý do UNIQUE toàn phần ⟹ 23505 khi mở lại      | Cao  | đúng — đã sửa: DROP + CREATE partial `WHERE withdrawn_at IS NULL`, `find` bỏ lý do đã gỡ; 2 test  | spec _Ownership_ migration, _Behavior_ 1; Task 1, 4 |
| DA6-28 view đọc + bàn giao còn thấy lý do đã gỡ             | TB   | đúng — đã sửa: mọi truy vấn lọc `withdrawn_at IS NULL`; listener bàn giao tính lại từ `remaining` | spec _Behavior_ 6; Task 4                           |
| DA6-29 thiếu hồi quy `mf2-abrupt-departure`, R-J07          | TB   | đúng — đã thêm flow vào Verify Task 4                                                             | spec test matrix _hồi quy R-J07_                    |
| DA6-33 _4 operation_ liệt kê 5; ca hoàn tất không dựng được | Thấp | đúng — sửa thành 5; ca thật: gỡ `DEPARTURE` làm mốc lùi về 08/11                                  | spec _Ownership_, test _AC-18 hoàn tất_             |
| §3 audit: `assertDecidable` chỉ `FAILED`                    | —    | đúng — nới chỉ nhánh `REVOKE` hết lý do, `GRANT` giữ                                              | spec _Behavior_ 5; Task 4                           |
| Q-88 (vế mốc/báo khi quyết lại)                             | —    | kỹ thuật, giữ: `eventKey` theo tham chiếu ⟹ báo một lần                                           | spec _Behavior_ 3                                   |

## Tasks

### Task 1: migration `licensing_revocation_timing`

- Files: `prisma/migrations/<ts>_licensing_revocation_timing/migration.sql` (cột tác vụ + lý do, 2 CHECK, DROP + CREATE index lý do partial,
  `CREATE OR REPLACE` trigger lý do, viết lại `provisioning_task_transition_guard`), `prisma/models/licensing.prisma` (`ProvisioningTask.dueOn/notBefore`,
  `ProvisioningTaskReason.dueOn/notBefore/withdrawnAt/withdrawnByAppUserId/withdrawCause`),
  `test/integration/licensing/revocation-timing-migration.integration-spec.ts` (mới).
- Depends on: none (W4 PASS).
- Acceptance: test matrix _DB guard_, _DB trigger + index_; dữ liệu cũ đọc được, cột mới NULL.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`;
  `pnpm test:integration -- test/integration/licensing/revocation-timing-migration.integration-spec.ts`.

### Task 2: `timing` ở cổng mở, mốc gộp, chặn claim/hoàn tất trước mốc

- Files: `src/modules/licensing/public/licensing.types.ts`, `public/licensing.api.ts`, `provisioning/revocation.service.ts`,
  `provisioning/revocation-open.policy.ts` (+ `revocation-open.policy.spec.ts`: `effectiveTiming`, `assertTiming`), `provisioning/provisioning-task-reason.repo.ts`,
  `provisioning/provisioning-task.repo.ts`, `provisioning/provisioning-task.types.ts`, `provisioning/provisioning-task.mapper.ts`,
  `provisioning/provisioning.errors.ts`, `provisioning/provisioning.http-errors.ts` (409 `NOT_BEFORE` + ví dụ), `provisioning/tasks/provisioning.service.ts` (`claim`),
  `provisioning/revocation-completion/revocation-completion.service.ts`, `provisioning/provisioning.dto.ts` (trường đọc, lọc `claimableNow`),
  `test/support/openapi-example-route-codes-licensing.ts`; test `test/integration/licensing/provisioning-revocation-open.integration-spec.ts` (thêm ca mốc),
  `test/http/licensing/provisioning.http-spec.ts` (409 `NOT_BEFORE`, trường đọc).
- Depends on: Task 1.
- Acceptance: test matrix _mốc gộp_ (2 dòng), _AC-18_, _R-J08_ (2 dòng), _input sai_, _đọc_.
- Verify: `pnpm exec jest src/modules/licensing/provisioning`;
  `pnpm test:integration -- test/integration/licensing/provisioning-revocation-open.integration-spec.ts test/integration/licensing/provisioning-revocation-read-contracts.integration-spec.ts`;
  `pnpm test:http -- test/http/licensing/provisioning.http-spec.ts`.

### Task 3: báo người giữ (opt-in) + mã thông báo

- Files: `provisioning/revocation-recorder.service.ts`, `src/modules/notifications/public/notifications.types.ts`, `src/modules/notifications/inbox/inbox.policy.ts`
  (+ `inbox.policy.spec.ts`), `test/support/revocation-harness.ts` (helper mở có `notice`); test thêm ca vào
  `test/integration/licensing/provisioning-revocation-open.integration-spec.ts`.
- Depends on: Task 2.
- Acceptance: test matrix _AC-2 `US-10-06`_; nơi gọi không truyền `notice` ⟹ 0 thông báo.
- Verify: `pnpm exec jest src/modules/notifications/inbox src/modules/licensing/provisioning`;
  `pnpm test:integration -- test/integration/licensing/provisioning-revocation-open.integration-spec.ts`.

### Task 4: `withdrawRevocationReason` + `REASON_WITHDRAWN` + lọc lý do đã gỡ + cancel thu hồi; hồi quy nơi gọi

- Files: `provisioning/revocation-withdrawal/revocation-withdrawal.service.ts`, `revocation-withdrawal.policy.ts` (+ spec) (mới),
  `public/licensing.api.ts`, `public/licensing.extension-points.ts`, `provisioning/revocation-read.repo.ts`, `provisioning/failure.policy.ts` (+ spec),
  `provisioning/tasks/provisioning-decision.service.ts` (`cancel`), `licensing/handover/handover-revocation.listener.ts`,
  `licensing/handover/handover-confirmer.policy.ts` (+ spec), `src/modules/requests/return-request/return-revocation.listener.ts`, `licensing.module.ts`,
  `src/modules/licensing/README.md`; test `test/integration/licensing/provisioning-revocation-withdraw.integration-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix _AC-22_, _gỡ khi đang làm_, _gỡ còn lý do_, _mở lại cùng tác vụ_, _mở lại sau hủy_, _idempotent_, _đọc lý do đã gỡ_,
  _bàn giao (DA6-28)_, _cancel thu hồi_, _AC-18 hoàn tất_, _hồi quy R-J07_.
- Verify: `pnpm exec jest src/modules/licensing/provisioning src/modules/licensing/handover`;
  `pnpm test:integration -- test/integration/licensing/provisioning-revocation-withdraw.integration-spec.ts test/integration/licensing/provisioning-revocation-complete.integration-spec.ts test/integration/licensing/provisioning-revocation-constraints.integration-spec.ts test/integration/licensing/handover-duty-sources.integration-spec.ts test/integration/licensing/assignment-expiry-queue.integration-spec.ts`;
  `pnpm test:http -- test/http/licensing/provisioning.http-spec.ts test/http/licensing/handover-duties.http-spec.ts`;
  `pnpm test:e2e -- test/e2e/offboarding-revocation.e2e-spec.ts test/e2e/department-transfer-review.e2e-spec.ts`;
  `pnpm test:flows -- test/flows/mf2-offboarding.flow-spec.ts test/flows/mf2-abrupt-departure.flow-spec.ts test/flows/mf3-transfer.flow-spec.ts`;
  `pnpm arch:capabilities --module licensing`.

### Checkpoint A (hết lượt)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` —
diff chỉ ở 5 operation `provisioningTask*` nêu ở spec); `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`;
tự review theo spec _Behavior_ 1–9; ghi _Verification_. Một commit `feat(qd103-w6): qd103-revocation-grace-notice`.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
