# Plan: g7-device-registry-acknowledgement

- [Spec](spec.md); [Test plan](test-plan.md); revision đầu vào: Docs `3d73a7f` + thay đổi chưa commit 05/11/2026, BE `3e4553b9`
  (đối chiếu code `808318a4`).
- Phụ trách: Cursor/dev được Owner giao. Thiết kế ban đầu bởi: Owner + Claude (phiên 05/11/2026).
- Owner review: chưa review. Peer review: không bắt buộc.
- Triển khai: `in-progress` — mức A đã chạy kiểm tại chỗ (`verified-local`, 05/11/2026, nhánh `feat/qd96-100-alignment`, chưa commit), mức B `not-started`. PR: chưa có.

## Before coding

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/{module-structure,api-contract,security-jobs}.md`, DESIGN.md §0–§3, §7, §11.
Đọc mẫu: controller/DTO/http-errors `src/modules/catalog/contract/{contracts.controller,contract.dto,contract.http-errors}.ts`;
listener hook `src/modules/personnel/role-duties/role-duties.listener.ts`; tài liệu tệp `catalog/contract/document.service.ts:265-345`.
**Mức A** làm tối nay (FE + collector enroll), **mức B** sau demo; không đổi thứ tự A vì B. Bộ kiểm nhanh mỗi task:
`pnpm typecheck && pnpm lint && pnpm arch:check && pnpm rules:check`; test theo file `pnpm test -- <file>`, `pnpm test:http --
<file>`, `pnpm test:integration -- <file>`; `pnpm check`/full suite để Owner chạy lúc audit. Không chạy migration lên DB dùng chung.

## Tasks

### Phase A1 — dữ liệu, sổ thiết bị, kết thúc đăng ký (mức A)

### Task A1: migration + model + đăng ký module

- Files: `prisma/models/devices.prisma` (mới, 6 model + 3 enum theo spec), `prisma/models/catalog.prisma` (`signerEmployeeId`),
  `prisma/migrations/<ts>_devices_registry_and_acknowledgement/migration.sql` (bảng + SQL của spec mục Data, gồm đổi CHECK
  `document_attachments`), `scripts/arch/tiers.cjs:8`, `docs/rules/module-structure.md` + `ARCHITECTURE.md` (bảng tầng),
  `test/gates/architecture-boundaries.gate-spec.ts:32` (6 model → `devices`), `src/infrastructure/database/database-role-judgement.ts:13`
  (3 bảng append-only), `src/modules/devices/{devices.module.ts,README.md}`, `src/app/app.module.ts`.
- Depends on: none.
- Acceptance: schema hợp lệ; append-only/exclusion/partial unique/CHECK có trong SQL; H7 judgement biết 3 bảng mới. Timestamp
  migration này nhỏ hơn mọi migration của S1b (`_audit_actor_device`, `_devices_credentials` dùng `devices_append_only()` định
  nghĩa ở đây) và S2a (`_usage_ai_intake`).
- Verify: `pnpm prisma:validate && pnpm prisma:generate && pnpm typecheck`; `pnpm test:integration -- devices-schema` (TP-01,
  TP-02 trên DB tạm của test harness) đỏ trước/xanh sau; `pnpm test:gates -- architecture-boundaries`.

### Task A2: sổ thiết bị — tạo, đọc, đổi người giữ, ngừng dùng

- Files: `src/modules/devices/devices-collection-state.policy.ts(+spec)`, `registry/{registry.controller,registry.dto,
registry.repo,registry.service,registry.policy(+spec),registry.errors,registry.http-errors,registration-end.service}.ts`,
  `test/support/openapi-example-route-codes-devices.ts`, `test/support/api-coverage-manifest.ts`, `test/support/api-collection-registry.ts`.
- Depends on: A1.
- Acceptance: `deviceCreate`, `deviceList`, `deviceGet`, `deviceHolderChange`, `deviceRetire` theo bảng field; mã lỗi spec; kết
  thúc đăng ký qua một service; 09-01 AC-1, AC-3, AC-4, AC-5, AC-9, AC-10 (vế đăng ký).
- Verify: `pnpm test -- devices-collection-state registry.policy`; `pnpm test:http -- devices-registry` (TP-03→TP-07);
  `pnpm test:integration -- devices-registry` (TP-08 đua).

### Task A3: nối nghỉ việc (`onLeft`)

- Files: `src/modules/devices/public/{devices.api,devices.errors,devices.types}.ts`, `devices.module.ts` (export facade),
  `src/modules/personnel/offboarding/device-registration.listener.ts`, `personnel.module.ts`, `personnel/README.md`.
- Depends on: A2.
- Acceptance: `markLeft`/ghi _đã nghỉ việc_ ⟹ đăng ký mở của người đó kết thúc `EMPLOYEE_LEFT` cùng transaction (09-08 AC-3);
  gọi lại không đổi gì; điều chuyển không chạm (AC-4). Facade còn có `deviceExists`, `holderRegistrationIds` (spec mục
  Ownership) và `DeviceNotFoundError` công khai mà `registry.http-errors.ts` map về 404 `DEVICE.NOT_FOUND` — S2a dùng lại.
- Verify: `pnpm test:integration -- devices-departure` (TP-09); `pnpm arch:check`.

### Checkpoint A1

Bộ kiểm nhanh xanh; `pnpm arch:capabilities --module devices` không vòng; tự review diff với bảng field.

### Phase A2 — thông báo, `BM-06`, xác nhận, `/me/devices` (mức A)

### Task A4: phiên bản thông báo

- Files: `src/modules/devices/notice/{notice.controller,notice.dto,notice.repo,notice.service,notice.policy(+spec),notice.errors,
notice.http-errors}.ts`.
- Depends on: A1.
- Acceptance: `monitoringNoticeVersionCreate` (SUPER_ADMIN), `monitoringNoticeCurrentGet`; số phiên bản dưới advisory lock;
  `requiresReacknowledgement` reset đăng ký mở; 422 `REACKNOWLEDGEMENT_REQUIRED` (09-03 AC-3, AC-5, AC-8, AC-11).
- Verify: `pnpm test -- notice.policy`; `pnpm test:http -- devices-notice` (TP-10).

### Task A5: bản ký `BM-06` (catalog + devices)

- Files: `src/modules/catalog/contract/{contract.policy(+spec),contract.errors,contract.http-errors,document.service,document.repo}.ts`,
  `catalog/public/catalog.api.ts` (`attachSignatureRecord(tx, actor, { documentId, signerEmployeeId })`), `catalog/README.md`,
  `src/modules/devices/registry/{signature-record.service,registry.controller}.ts`.
- Depends on: A2, A4.
- Acceptance: tải `SIGNATURE_RECORD` được; gắn vào đăng ký mở với phiên bản; Finance mở bản ký ⟹ 403; gắn bản ký vào hợp đồng
  ⟹ 422 `DOCUMENT.PURPOSE_MISMATCH`; tệp hợp đồng giữ hành vi cũ (09-03 AC-7 vế IT, AC-10 vế mở nút).
- Verify: `pnpm test -- contract.policy`; `pnpm test:http -- devices-signature-record` (TP-11) + test documents hiện có của
  catalog chạy lại theo file.

### Task A6: xác nhận chủ động + `/me/devices`

- Files: `src/modules/devices/acknowledgement/{acknowledgement.controller,acknowledgement.dto,acknowledgement.repo,
acknowledgement.service,acknowledgement.policy(+spec),acknowledgement.http-errors}.ts`, `my-devices/{my-devices.controller,
my-devices.dto,my-devices.repo,my-devices.service}.ts`.
- Depends on: A4, A5.
- Acceptance: chỉ holder xác nhận; chặn khi chưa bản ký/không phải bản hiện hành/đã `ACTIVE`/đăng ký kết thúc; hình chiếu
  `acknowledged_from`; `myDeviceList` với `canAcknowledge` + `blockedReason` (09-01 AC-12, 09-03 AC-1, AC-4, AC-10).
- Verify: `pnpm test -- acknowledgement.policy`; `pnpm test:http -- devices-acknowledgement` (TP-12, TP-13);
  `pnpm test:integration -- devices-acknowledgement-race` (TP-14).

### Checkpoint A2 (bàn giao FE + S1b)

Bộ kiểm nhanh xanh; `pnpm openapi:export` có 11 operation mức A; test field ma (TP-15) xanh; `pnpm arch:routes && pnpm
arch:graph` sinh lại `docs/generated/*`. Báo FE danh sách operation A.

### Phase B — sau demo

### Task B1: yêu cầu dừng + SLA

- Files: `src/modules/devices/stop-request/*` (controller, dto, repo, service, policy+spec, `stop-request.job.ts`), tham số
  `DEVICE_STOP_REQUEST_WORKING_DAYS` ở `operating-parameters`, mã inbox `DEVICE_STOP_REQUEST_OVERDUE` ở `notifications`,
  `registration-end.service.ts` (tự đóng `OPEN`), `docs/rules/security-jobs.md`.
- Depends on: A6.
- Acceptance: 09-04 AC-1→AC-11 (vế S1a); hình chiếu `collection_stopped_at`.
- Verify: `pnpm test -- stop-request.policy`; `pnpm test:http -- devices-stop-request` (TP-20, TP-21);
  `pnpm test:integration -- devices-stop-request-sweeper` (TP-22).

### Task B2: lịch sử `/me` + `BM-06` cho chính nhân viên + `PATCH /devices`

- Files: `my-devices/*` (history), `catalog/contract/documents.controller.ts:190-216` (`@AuthenticatedOnly()`), `mayOpen`
  (người ký), `registry/*` (`deviceUpdate`).
- Depends on: A6.
- Acceptance: 09-03 AC-7 (vế `E1` mở), `FR-10.1`, 09-01 sửa có lý do; báo FE đổi truy cập `documentGet`/`documentLink`.
- Verify: `pnpm test:http -- devices-history documents` (TP-23, TP-24).

### Task B3: kết thúc đăng ký hết ngày làm việc cuối / chặn ngay

- Files: `registry/registration-departure.job.ts`, `devices-calendar.policy.ts` (đầu ngày theo TZ), `devices.module.ts`.
- Depends on: A3; Phần A của `qd96-100-departure-day-access-block` (facade đọc `employee_access_blocks`).
- Acceptance: 09-08 AC-1, AC-6 (vế đăng ký), AC-7; `valid_until = lastWorkingDay + 1`, `ended_at` = đầu ngày đó.
- Verify: `pnpm test:integration -- devices-departure-sweeper` (TP-25, đồng hồ giả, chạy hai lần).

### Task B4: `DeviceRegistryPort` cho licensing

- Files: `licensing/public/{licensing.extension-points,licensing-device-registry.types}.ts`, `licensing/device-binding/*`
  (import kiểu mới), `devices/registry/device-registry-port.listener.ts`, `test/support/device-registry-contract-double.ts`.
- Depends on: A2.
- Acceptance: contract test A-05 chạy với port thật (TP-26).
- Verify: `pnpm test:integration -- device-registry-port`.

### Checkpoint B

Bộ kiểm nhanh xanh; Owner chạy `pnpm check`, `pnpm test:http`, `pnpm test:integration` lúc audit.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                  | Revision / môi trường        | Kết quả thực chạy                                        | Giới hạn / việc còn lại                                                        |
| --------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Bộ kiểm nhanh + test theo file mỗi task                                                             | —                            | chưa chạy                                                | full suite do Owner                                                            |
| `pnpm typecheck`, `pnpm arch:check`, `pnpm lint` (file chạm), `pnpm rules:check`                    | BE `808318a4` + working tree | sạch; `rules:format` còn 9 file của hạng mục khác        | `pnpm lint` toàn bộ còn báo suppression cũ của `requests`/`budgets` (đợt khác) |
| `pnpm test:gates`                                                                                   | như trên                     | 16 suite / 329 test xanh                                 | —                                                                              |
| `pnpm test -- src/modules/devices src/modules/catalog/contract`                                     | như trên                     | 5 suite / 78 test xanh                                   | —                                                                              |
| `pnpm test:http -- test/http/devices test/http/catalog/document test/http/personnel`                | như trên                     | 9 suite / 228 test xanh                                  | `test/http/platform`: đỏ do hạng mục khác (gỡ plan-line, budgets)              |
| `pnpm test:integration -- test/integration/devices` (DB `slm-test-db`)                              | như trên                     | 2 file / 20 test xanh (TP-01→TP-14, TP-17; TP-15 ở http) | TP-16 (đếm câu lệnh) chưa viết                                                 |
| `pnpm test:integration -- test/integration/catalog/document test/integration/personnel/offboarding` | như trên                     | 6 suite / 71 test xanh                                   | —                                                                              |

- [ ] AC trong scope có bằng chứng; mức B ghi rõ trạng thái.
- [ ] Spec/plan/test-plan khớp implementation; FE nhận danh sách operation mức A.
- [ ] Diff tự review; `security-jobs.md` (B), module card cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể.
