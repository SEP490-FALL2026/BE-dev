# Plan: g7-device-credential-enrollment

- [Spec](spec.md); [Test plan](test-plan.md); revision đầu vào: Docs `3d73a7f` + thay đổi chưa commit 05/11/2026, BE `3e4553b9`
  (đối chiếu code `808318a4`).
- Phụ trách: Cursor/dev được Owner giao. Thiết kế ban đầu bởi: Owner + Claude (phiên 05/11/2026).
- Owner review: chưa review. Peer review: nên có một lượt review bảo mật (guard, verifier, enroll) trước merge.
- Triển khai: `in-progress` — mức A đã chạy kiểm tại chỗ (`verified-local`, 05/11/2026, nhánh `feat/qd96-100-alignment`, chưa commit), mức B `not-started`. PR: chưa có.

## Before coding

Đọc spec, DESIGN.md §1–§2.3, §11; `src/infrastructure/security/**` (đặc biệt `access-declaration.guard.ts`,
`authentication.guard.ts`, `security.module.ts`), `test/http/platform/api-inventory.http-spec.ts:12-21,98-106`,
`test/support/openapi-inventory.ts:95-125`, `identity-access/accounts/action-token.policy.ts` (mẫu token + SHA-256). Cần S1a
Task A1, A2, A5 xong. Bộ kiểm nhanh mỗi task: `pnpm typecheck && pnpm lint && pnpm arch:check && pnpm rules:check`; test theo
file; full suite để Owner. Mức **A** tối nay; **B** sau demo.

## Tasks

### Phase A1 — dữ liệu và hạ tầng xác thực (mức A)

### Task A1: migration credential + `AuditActorKind.DEVICE`

- Files: `prisma/migrations/<ts>_audit_actor_device/migration.sql` (chỉ `ADD VALUE`), `prisma/migrations/<ts+1>_devices_credentials/
migration.sql`, `prisma/models/devices.prisma` (3 model, 2 enum), `prisma/models/audit.prisma:1-5`,
  `src/modules/audit/public/audit.types.ts:1`, `src/modules/audit/audit-event.dto.ts:52`, `test/gates/architecture-boundaries.gate-spec.ts:32`,
  `src/infrastructure/database/database-role-judgement.ts:13` (`device_enrollment_uses`), `docs/adr/<n>-device-credential-channel.md` (O-4).
- Depends on: S1a Task A1.
- Acceptance: CHECK/trigger theo spec; H7 biết bảng append-only mới; Audit Trail chấp nhận `DEVICE`. Timestamp: sau migration
  S1a (`devices_append_only()` có sẵn), `_audit_actor_device` < `_devices_credentials` < `_usage_ai_intake` của S2a.
- Verify: `pnpm prisma:validate && pnpm prisma:generate && pnpm typecheck`; `pnpm test:integration -- devices-credential-schema`
  (TC-01).

### Task A2: khai báo truy cập `device` + guard + throttle

- Files: `src/infrastructure/security/decorators/device-authenticated.decorator.ts`, `tokens/device-credential-verifier.port.ts`,
  `models/current-device.ts`, `guards/device-authentication.guard.ts(+spec)`, `guards/credential-throttler.guard.ts(+spec)`,
  `guards/access-declaration.guard.ts:61-65`, `guards/authentication.guard.ts:105-109`, `guards/access-guards.spec.ts`,
  `security.module.ts`, `src/app/app.module.ts:52`, `src/app/configure-application.ts:70` (`addBearerAuth(…, 'deviceCredential')`),
  `test/support/openapi-inventory.ts:107-111`, `src/infrastructure/http/errors/access-errors.ts` (3 lỗi 401 thiết bị).
- Depends on: none (port chưa có implementation thì module devices bind ở A3; test dùng verifier giả).
- Acceptance: route `device` qua đúng một khai báo; route người dùng không đổi hành vi; tracker theo credential; OpenAPI có
  security `deviceCredential` cho route thiết bị; `@DeviceAuthenticated({ collectorKind })` sai loại ⟹ 403
  `DEVICE.WRONG_COLLECTOR_KIND` trước pipe; CSDL lỗi khi xác thực ⟹ 503 `TOKEN_VERIFICATION_UNAVAILABLE`, không 401;
  `@CurrentDevice()` trả `{ credentialId, collectorKind }`.
- Verify: `pnpm test -- access-guards device-authentication credential-throttler access.decorators`; `pnpm test:http --
api-inventory openapi-presentation` (TC-02).

### Task A3: policy + verifier + thu hồi theo đăng ký

- Files: `src/modules/devices/credential/{credential.policy(+spec),credential.repo,credential-verifier.service,
credential-revocation.service,credential.errors}.ts`, `devices.module.ts` (provide `DEVICE_CREDENTIAL_VERIFIER`),
  `src/modules/devices/registry/registration-end.service.ts` (gọi `revokeAllOfRegistration`).
- Depends on: A1, A2; S1a A2.
- Acceptance: ma trận INVALID/REVOKED/EXPIRED theo spec bước 3 (secret khớp trước khi lộ trạng thái); holder `TERMINATED` ⟹
  REVOKED; `isAccessBlocked` dùng nếu facade đã có (feature-detect bằng type, không try/catch); kết thúc đăng ký thu hồi mọi
  credential cùng thời điểm.
- Verify: `pnpm test -- credential.policy`; `pnpm test:integration -- devices-credential-verifier` (TC-03, TC-04).

### Checkpoint A1

Bộ kiểm nhanh xanh; `pnpm arch:capabilities --module devices` không vòng (`registry` → `credential`, không ngược lại).

### Phase A2 — mã, enroll, phiên, xoay, thu hồi IT (mức A)

### Task A4: tạo mã (IT) + enroll (public)

- Files: `credential/credential.controller.ts` (`deviceEnrollmentCodeCreate`), `credential/enrollment/{device-enrollment.controller,
credential-enrollment.service,credential-enrollment.dto}.ts`, `credential/credential.http-errors.ts`,
  `test/http/platform/api-inventory.http-spec.ts:12-21` (`DeviceEnrollmentController.create` vào `PUBLIC_ALLOWLIST`),
  `test/support/{api-coverage-manifest,openapi-example-route-codes-devices}.ts`.
- Depends on: A3; S1a A5 (bản ký).
- Acceptance: 09-01 AC-13 (mã một lần 24 h, băm; hai mã hai credential; chưa `BM-06` ⟹ 409); idempotent theo key; tranh chấp
  `maxUses` đúng.
- Verify: `pnpm test:http -- devices-enrollment` (TC-05→TC-08); `pnpm test:integration -- devices-enrollment-race` (TC-09).

### Task A5: phiên + xoay vòng

- Files: `credential/session/{device-session.controller,credential-session.service,credential-session.dto}.ts`,
  `devices-collection-state.policy.ts` (đọc lại, không sửa hành vi), `public/{devices.api,devices.types,devices.errors}.ts`
  (`getIntakeContext`, `recordAccepted`, `DeviceIntakeContext`, `DeviceCredentialRevokedError`).
- Depends on: A3.
- Acceptance: `deviceSessionGet` theo bảng response; luật xoay vòng DESIGN §2.3; token người dùng ⟹ 401 và ngược lại;
  `getIntakeContext` dùng chung `sessionWindowOf` với phiên (spec mục _Facade cho lát nhận_).
- Verify: `pnpm test -- credential.policy` (luật xoay); `pnpm test:http -- devices-session` (TC-10→TC-13);
  `pnpm test:integration -- devices-intake-context` (TC-17).

### Task A6: danh sách + thu hồi bởi IT

- Files: `credential/credential.controller.ts` (`deviceCredentialList`, `deviceCredentialRevocationCreate`), `credential.repo.ts`,
  `test/support/api-collection-registry.ts`.
- Depends on: A3.
- Acceptance: thu hồi tức thì (request kế tiếp 401 REVOKED); list summary + `query-count`.
- Verify: `pnpm test:http -- devices-credential-admin` (TC-14, TC-15).

### Checkpoint A2 (bàn giao tool + FE)

Bộ kiểm nhanh xanh; TC-16 (field ma + không IP) xanh; `pnpm openapi:export`; `pnpm arch:routes && pnpm arch:graph`. Gửi workstream
tool: luồng enroll (`Idempotency-Key`), phiên, xoay, ánh xạ 401 (`CREDENTIAL_REVOKED`, `CREDENTIAL_EXPIRED` ⟹ xóa credential và
trạng thái gửi, cần mã mới; `CREDENTIAL_INVALID` ⟹ giữ file, dừng, báo IT; 429/503 ⟹ lùi) — khớp bảng lỗi T1
(`Code/Tools/workstreams/ai-collector/be-integration/spec.md`).

### Phase B — sau demo

### Task B1: thu hồi theo ngày cuối thành dòng + `acceptUntilAt` tương lai

- Files: S1a `registry/registration-departure.job.ts` (gọi `revokeAllOfRegistration` qua `registration-end.service.ts`),
  `credential/session/credential-session.service.ts`.
- Depends on: S1a B3; facade chặn của `qd96-100-departure-day-access-block`.
- Acceptance: 09-08 AC-5 (Audit `revokedAt` = mốc kết thúc) cho nhịp ngày cuối; phiên trả `acceptUntilAt` = đầu ngày chặn.
- Verify: `pnpm test:integration -- devices-departure-sweeper` (TC-20).

### Task B2: dừng thu thập giữ credential

- Files: test only (`test/http/devices/devices-stop-keeps-credential.http-spec.ts`).
- Depends on: S1a B1.
- Acceptance: 09-04 AC-12 vế credential.
- Verify: `pnpm test:http -- devices-stop-keeps-credential` (TC-21).

## Verification and handoff

| Lệnh / kiểm tra AC                                                     | Revision / môi trường        | Kết quả thực chạy                   | Giới hạn / việc còn lại                                      |
| ---------------------------------------------------------------------- | ---------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| Bộ kiểm nhanh + test theo file mỗi task                                | —                            | chưa chạy                           | full suite + review bảo mật do Owner                         |
| `pnpm typecheck`, `pnpm arch:check`, eslint file chạm                  | BE `808318a4` + working tree | sạch                                | `pnpm lint` toàn bộ còn báo suppression cũ của hạng mục khác |
| `pnpm test -- src/infrastructure/security src/modules/devices`         | như trên                     | guard, throttle, policy xanh        | —                                                            |
| `pnpm test:http -- test/http/devices test/http/platform`               | như trên                     | 56 + 185 test xanh                  | —                                                            |
| `pnpm test:integration -- test/integration/devices` (DB `slm-test-db`) | như trên                     | 4 file / 35 test xanh (TC-01→TC-17) | B1/B2 chưa làm                                               |

- [ ] AC trong scope có bằng chứng; mức B ghi rõ trạng thái.
- [ ] Spec/plan/test-plan khớp implementation; tool + FE nhận hợp đồng.
- [ ] Không token/mã/secret trong log, Audit, snapshot test; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể.
