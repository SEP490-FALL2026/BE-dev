# Plan: qd103-k4-key-pool

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `5fd5f594` (sau commit `qd103-grant-from-shared-pool`; W2 PASS).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W4, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **hai lượt** — Phase 1 kho khóa + cấp `K4` theo thiết bị (Task 1–3, Checkpoint A), Phase 2 giải phóng cam kết + thu hồi `K4`
  ở mọi nơi gọi (Task 4–6, Checkpoint B). Ước ~45 file (vượt ngưỡng một lượt sau khi thêm hook thiết bị và nơi gọi `SBF-18`).

## Before coding

Đọc `src/modules/licensing/README.md` (capability `license-key`, `device-binding` :106-108, invariants thu hồi :130-146), `src/modules/devices/README.md`,
`docs/rules/module-structure.md` (`licensing/provisioning` gốc 24 file ⟹ code mới vào `tasks/`, `revocation-completion/`, `shared-pool/`;
`personnel/offboarding` đủ 25 — chỉ sửa file có sẵn), `scripts/arch/tiers.cjs` (`devices` T5 import `licensing` T4 được; `licensing` không
import `devices`), `src/core/extension/hook.ts` (`isBound()`, gate `extension-wiring`), `docs/rules/database-business.md` (DB-05). Đối chiếu
code `5fd5f594` theo spec _Ownership_, nhất là `device-binding.types.ts:44-74` (port) và `devices/registry/registry.repo.ts:120-160`.
Đọc tham khảo (không code theo): `docs/workspace/items/a05-k4-key-grant-by-device/spec.md`, `a05-k4-device-revocation/spec.md`.

## Design review

Audit `design-audit-w4.md` (08/11/2026) — hạng mục này: 2 Cao · 1 TB · 3 Thấp, cộng luật chung DA4-09.

| Finding                                                                                  | Mức  | Kết quả                                                                                                        | Sửa ở                                  |
| ---------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| DA4-01 `K4` vẫn bị chặn ở `MF-2` (`isRevocableType`) và `SBF-03a` (`PLAN_NOT_SUPPORTED`) | Cao  | đã sửa — mở `K4` ở cả hai, chú thích `MF-3`, ví dụ expiry; test mỗi nơi gọi                                    | spec _Ownership_, _Behavior_ 4; Task 5 |
| DA4-02 Q-37 trái `US-07-01` AC-10                                                        | Cao  | đã sửa — `DeviceRegistryHook` (licensing mở, `devices` bind), `deviceId` bắt buộc, 422/409 mã ổn định; Q-37 bỏ | spec _Behavior_ 2; Task 3              |
| DA4-17 đường dẫn test `requests/spend-*` sai                                             | TB   | đã sửa — `test/integration/budgets/`                                                                           | Task 4                                 |
| DA4-24 khóa cấm chuyển máy vẫn về _Trống_                                                | Thấp | đã sửa — `keyDisposition` bắt buộc, `WITHDRAW` rút trong cùng transaction (Q-50)                               | spec _Behavior_ 4; Task 5              |
| DA4-25 `ASSIGNED` cũ phá CHECK; `withdrawn_*` không bất biến                             | Thấp | đã sửa — `RAISE EXCEPTION` có hướng dẫn; mở rộng `license_key_guard`                                           | spec _Ownership_; Task 1               |
| DA4-26 thứ tự khóa cấp/thu hồi; `licensing.types.ts` thiếu                               | Thấp | đã sửa — một câu README; thêm `public/licensing.types.ts:260`                                                  | spec _Behavior_ 4; Task 1, 6           |
| DA4-09 (luật chung) enum mới dùng trong cùng migration                                   | TB   | đã áp — tách `<ts>_k4_key_pool_values`                                                                         | Task 1                                 |

Không sửa: không có.

## Tasks

### Phase 1 — kho khóa, hook thiết bị, cấp `K4`

### Task 1: hai migration `k4_key_pool_values` + `k4_key_pool`

- Files: `prisma/migrations/<ts>_k4_key_pool_values/migration.sql` (2 `ADD VALUE`), `prisma/migrations/<ts+1>_k4_key_pool/migration.sql` (kiểm `ASSIGNED`,
  cột, CHECK, guard, chuyển `RETIRED`, dựng lại enum), `prisma/models/licensing.prisma` (`LicenseKey` cột mới + relation Assignment, `LicenseKeyStatus`,
  `RevocationCompletion`), `prisma/models/budgets.prisma` (`CommitmentReleaseReason`), `src/modules/licensing/public/licensing.types.ts` (`RevocationCompletion`),
  `test/integration/licensing/license-key-constraints.integration-spec.ts` (ca CHECK, guard), `test/integration/licensing/k4-key-pool-migration.integration-spec.ts` (mới).
- Depends on: `qd103-grant-from-shared-pool` Checkpoint B.
- Acceptance: test matrix _L3-21 migration_; CHECK từ chối `ASSIGNED` không assignment, rút khi đang gán, sửa `withdrawn_at`.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/licensing/k4-key-pool-migration.integration-spec.ts test/integration/licensing/license-key-constraints.integration-spec.ts`.

### Task 2: kho khóa — đếm, rút khỏi kho, bộ lọc, reveal

- Files: `src/modules/licensing/license-key/license-key.repo.ts`, `license-key.service.ts`, `license-key.policy.ts` (+ spec), `license-key.dto.ts`,
  `license-key.errors.ts`, `license-key.http-errors.ts`, `license-keys.controller.ts`, `src/modules/licensing/device-binding/device-binding.policy.ts` (+ spec),
  `device-binding.types.ts`, `test/support/api-coverage-manifest.ts`.
- Depends on: Task 1.
- Acceptance: test matrix Q-10 B, _bộ lọc + reveal_, _device-binding_, _đua rút/gắn_ (phần rút).
- Verify: `pnpm exec jest src/modules/licensing/license-key src/modules/licensing/device-binding`;
  `pnpm test:integration -- test/integration/licensing/license-key-http.integration-spec.ts test/integration/licensing/license-key-reveal-quota.integration-spec.ts`;
  `pnpm test:http -- test/http/licensing/license-key.http-spec.ts`.

### Task 3: hook thiết bị + cấp `K4` (grant, hoàn tất gắn khóa và thiết bị)

- Files: `src/modules/licensing/public/licensing.extension-points.ts` (`DeviceRegistryHook`), `public/licensing.types.ts`, `licensing.module.ts`,
  `src/modules/devices/registry/key-device-registry.listener.ts` (mới), `devices/registry/registry.repo.ts` (đọc + khóa đăng ký theo thiết bị),
  `devices/devices.module.ts`, `licensing/provisioning/provisioning.policy.ts` (+ spec), `provisioning.dto.ts`, `provisioning.errors.ts`,
  `provisioning.http-errors.ts`, `shared-pool/shared-pool.policy.ts` (+ spec, nhánh `K4`), `shared-pool/shared-pool-capacity.repo.ts`,
  `tasks/provisioning-grant-planner.service.ts`, `tasks/provisioning.service.ts`; test `test/integration/licensing/provisioning-k4-grant.integration-spec.ts` (mới),
  `test/integration/devices/key-device-registry.integration-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix AC-6 (2 dòng, phần licensing), R-E05 `K4`, AC-10 thiết bị, _hoàn tất phủ định_, _đua_; gate `extension-wiring` xanh.
- Verify: `pnpm exec jest src/modules/licensing/provisioning src/modules/licensing/shared-pool src/modules/devices/registry`;
  `pnpm test:integration -- test/integration/licensing/provisioning-k4-grant.integration-spec.ts test/integration/devices/key-device-registry.integration-spec.ts test/integration/licensing/provisioning-grant-http.integration-spec.ts test/integration/licensing/provisioning-lock-order.integration-spec.ts`;
  `pnpm test:gates`; `pnpm arch:check`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` —
diff chỉ ở `licenseKey*`, `provisioningTaskGrant`/`Complete`/`Get`/`List`). Tự review theo spec mục 1, 2, 5, 6. Ghi _Verification_.

### Phase 2 — giải phóng cam kết, thu hồi `K4` ở mọi nơi gọi `SBF-18`

### Task 4: giải phóng toàn bộ cam kết khi cấp từ kho

- Files: `src/modules/requests/grant/access-request-grant.listener.ts` (+ spec), `src/modules/budgets/public/budgets.types.ts`,
  `src/modules/budgets/commitment/commitment.dto.ts` (lý do trong response; Finance không gửi được), `budgets/README.md`;
  test thêm ca vào `test/integration/licensing/provisioning-k4-grant.integration-spec.ts` và `test/integration/budgets/spend-commitment-lifecycle.integration-spec.ts`.
- Depends on: Checkpoint A.
- Acceptance: test matrix AC-6 (cam kết), _phủ định cam kết_.
- Verify: `pnpm exec jest src/modules/requests/grant src/modules/budgets/commitment`;
  `pnpm test:integration -- test/integration/licensing/provisioning-k4-grant.integration-spec.ts test/integration/budgets/spend-commitment-lifecycle.integration-spec.ts`.

### Task 5: thu hồi `K4` về kho / rút; mở `K4` ở nơi gọi

- Files: `src/modules/licensing/provisioning/revocation.policy.ts` (+ spec), `provisioning.dto.ts` (`keyDisposition`), `provisioning.policy.ts` (thẻ thu hồi `K4`),
  `revocation-completion/revocation-completion.service.ts`, `license-key/license-key.repo.ts` (`returnToStore`, `withdraw` trong transaction thu hồi),
  `src/modules/personnel/offboarding/offboarding.policy.ts` (+ spec, `isRevocableType`), `src/modules/requests/return-request/return-request.policy.ts` (+ spec),
  `src/modules/licensing/expiry/expiry.http-errors.ts`, `src/modules/personnel/transfer-review/transfer-review.errors.ts`, `transfer-review-decision.service.ts` (chú thích);
  test `test/integration/licensing/provisioning-revocation-complete.integration-spec.ts`, `provisioning-revocation-open.integration-spec.ts`,
  `test/integration/personnel/offboarding-departure.integration-spec.ts`, `test/integration/requests/return-request.integration-spec.ts`,
  `test/integration/personnel/transfer-review-decide.integration-spec.ts` (ca `K4`).
- Depends on: Task 4.
- Acceptance: test matrix `US-07-05` AC-6, AC-7, _thu hồi phủ định_, R-J08 (`MF-2`, `SBF-03a`, `SBF-03`/`MF-3`).
- Verify: `pnpm exec jest src/modules/licensing/provisioning src/modules/personnel/offboarding src/modules/requests/return-request`;
  `pnpm test:integration -- test/integration/licensing/provisioning-revocation-complete.integration-spec.ts test/integration/licensing/provisioning-revocation-open.integration-spec.ts test/integration/licensing/provisioning-revocation-constraints.integration-spec.ts test/integration/personnel/offboarding-departure.integration-spec.ts test/integration/requests/return-request.integration-spec.ts test/integration/personnel/transfer-review-decide.integration-spec.ts`.

### Task 6: README + hồi quy nơi gọi + seed

- Files: `src/modules/licensing/README.md` (máy trạng thái khóa, một câu thứ tự khóa cấp/thu hồi, hook), `src/modules/devices/README.md`,
  `src/modules/personnel/README.md`, `src/modules/requests/README.md` (`K4` thu hồi/hoàn trả được); không sửa code mới.
- Depends on: Task 5.
- Acceptance: test matrix _hồi quy + seed_; danh sách test cũ đổi kỳ vọng `K4` có lý do trong _Verification_.
- Verify: `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/requests/return-request-handover.integration-spec.ts`;
  `pnpm test:e2e -- test/e2e/offboarding-revocation.e2e-spec.ts test/e2e/department-transfer-review.e2e-spec.ts`;
  `pnpm test:flows -- test/flows/mf2-offboarding.flow-spec.ts test/flows/mf3-transfer.flow-spec.ts`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5 (`openapi:export` diff chỉ ở operation spec nêu). Tự review theo spec mục 3, 4, 7. Seed: fixture không có gói `K4`
⟹ không có task seed (`seed.integration-spec.ts` xanh là đủ). Ghi _Verification_.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
