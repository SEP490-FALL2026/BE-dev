# Plan: g7-ai-usage-intake

- [Spec](spec.md) · [Test plan](test-plan.md); revision đầu vào: Docs `3d73a7f` + thay đổi chưa commit 05/11/2026, BE `3e4553b9`
  (code đọc ở `808318a4`).
- Phụ trách: Cursor/dev được Owner giao. Thiết kế ban đầu bởi: Owner + Claude (phiên 05/11/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `in-progress` — mức A đã chạy kiểm tại chỗ (`verified-local`, 05/11/2026, nhánh `feat/qd96-100-alignment`, chưa commit), mức B `not-started`. PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, `docs/rules/{api-contract,module-structure,database-business,security-jobs}.md`, spec của
[registry](../g7-device-registry-acknowledgement/spec.md) và `g7-device-credential-enrollment`. Đối chiếu tên hợp đồng ở spec mục
_Dependencies_ với code S1a/S1b thật; khác tên thì sửa spec trước. **Level A** (Phase A, tối 05/11): collector gửi được lô tuần và
ảnh chụp, BE lưu theo ngày/công cụ, IT và nhân viên đọc được — logic thật, không mock. **Level B** (Phase B, sau demo): hardening,
test đầy đủ, `SCHEMA_VIOLATION`, tự phát hành allowlist. Bộ kiểm nhanh mỗi task: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`,
`pnpm rules:check` + test theo file; full suite (`pnpm check`, `pnpm test:http`, `pnpm test:integration`) để Owner chạy lúc audit.

## Tasks

### Phase A — level A (demo)

### Task 1: migration, model, tầng, H7

- Files: `prisma/models/usage.prisma` (mới), `prisma/migrations/<ts>_usage_ai_intake/migration.sql`, `scripts/arch/tiers.cjs:9`,
  `ARCHITECTURE.md:53`, `docs/rules/module-structure.md:38`, `src/infrastructure/database/database-role-judgement.ts:13`,
  `test/gates/architecture-boundaries.gate-spec.ts:32`.
- Depends on: migration của S1a và S1b (timestamp lớn hơn `_devices_registry_and_acknowledgement`, `_audit_actor_device`,
  `_devices_credentials`; không FK chéo nên không chặn kỹ thuật, nhưng thứ tự áp dụng phải là S1a → S1b → S2a).
- Acceptance: 6 bảng + enum + CHECK + trigger append-only như spec mục Data; `usage` ở T6; H7 hai bảng allowlist `INSERT, SELECT`;
  6 model → `'usage'`.
- Verify: `pnpm prisma:validate`, `pnpm prisma:generate`, `pnpm db:migrate:deploy` (DB local riêng), `pnpm typecheck`,
  `pnpm test:gates -- test/gates/architecture-boundaries.gate-spec.ts`, `pnpm test -- src/infrastructure/database`.

### Task 2: module `usage` + allowlist (publish, list, hiệu lực tại ngày, Hook session)

- Files: `src/modules/usage/{README.md,usage.module.ts,usage-http.module.ts}`, `usage/allowlist/{allowlist.controller,
allowlist.dto,allowlist.repo,allowlist.policy(+spec),allowlist-publish.service,allowlist-query.service,allowlist-facts.service,
allowlist-session.listener,allowlist.errors,allowlist.http-errors,allowlist-audit-event.mapper}.ts`,
  `src/modules/catalog/public/catalog.api.ts` (+ `getCollectorApplications`, repo của catalog), `src/app/app.module.ts`
  (`UsageHttpModule` cạnh `AiAssistHttpModule`, dòng 46), `test/support/process-graphs.ts` nếu gate wiring đòi;
  `src/modules/devices/public/devices.extension-points.ts` (khai `CollectorAllowlistHook`),
  `src/modules/devices/credential/session/{credential-session.service,credential-session.dto}.ts` (field `allowlist`).
- Depends on: Task 1; phiên của S1b (Task A5).
- Acceptance: POST tạo phiên bản N+1 (advisory lock), 422 `APPLICATION_NOT_FOUND`/`APPLICATION_NOT_ELIGIBLE`, 409 `UNCHANGED`, Audit
  `COLLECTOR_ALLOWLIST.PUBLISHED`; GET trang entries của bản hiện hành; `effectiveKeys(dates)` đúng luật giao khoảng; Hook khai ở
  devices, bind ở usage, trả `{ version, entries }`; `GET /device-session` có `allowlist` (chưa có bản ⟹ `{ version: null,
entries: [] }`); `experimental` chỉ `ANTIGRAVITY_CLI`.
- Verify: `pnpm test -- src/modules/usage/allowlist` (policy: giao khoảng qua nửa đêm TZ, bản kế, không có bản nào), quick set,
  `pnpm test:gates -- test/gates/extension-wiring.gate-spec.ts test/gates/module-layout.gate-spec.ts`.

### Task 3: cổng nhận và policy ngày

- Files: `usage/intake-gate/{intake-gate.errors,intake-gate.http-errors,intake-gate.policy(+spec),intake-rejection.repo}.ts`,
  `usage/ai-usage/{ai-usage-day.policy,ai-usage-day.policy.spec,ai-usage.types}.ts`.
- Depends on: Task 1; `DevicesApi.getIntakeContext` (S1b).
- Acceptance: lớp lỗi 403 ba mã; `judgeIntakeState(context)`; `evaluateDays(input)` trả kết quả từng ngày theo đúng thứ tự (1)→(5)
  của spec (gồm biên `COVERED`, `NOT_OBSERVABLE` có số, `FUTURE_GENERATED_AT`, TZ `Asia/Ho_Chi_Minh`).
- Verify: `pnpm test -- src/modules/usage/ai-usage src/modules/usage/intake-gate` → ca TP-U1…U9 của test-plan xanh; quick set.

### Checkpoint A1

Quick set xanh; `pnpm test -- src/modules/usage`; tự review diff Task 1–3 theo spec (tên bảng, enum, mã lỗi).

### Task 4: `POST /ai-usage-batches`

- Files: `usage/ai-usage/{ai-usage.controller,ai-usage.dto,ai-usage.repo,ai-usage-batch.service,ai-usage.http-errors}.ts`,
  `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts`, `test/http/platform/api-inventory.http-spec.ts`
  (thêm `aiUsageBatchCreate`, `aiToolStatusSnapshotCreate` vào danh sách route `device` của S1b TC-02).
- Depends on: Task 2, Task 3; `@DeviceAuthenticated`, `@CurrentDevice`, `DevicesApi.recordAccepted` (S1b).
- Acceptance: một transaction; 403 + dòng rejection khi chưa xác nhận/đã dừng (commit trước khi ném); upsert một câu
  `unnest … ON CONFLICT … WHERE` như spec; kết quả từng ngày; rejection mỗi ngày bị từ chối; `recordAccepted` khi có ngày nhận.
- Verify: quick set; `pnpm test -- src/modules/usage/ai-usage`; `pnpm openapi:export` rồi xem diff `openapi.json`; thử tay bằng
  demo script (T1 spec) trên BE local.

### Task 5: `POST /ai-tool-status-snapshots`

- Files: `usage/tool-status/{tool-status.controller,tool-status.dto,tool-status.repo,tool-status-snapshot.service,
tool-status.policy,tool-status.policy.spec,tool-status.http-errors}.ts`, hai manifest.
- Depends on: Task 3, Task 4 (dùng chung gate).
- Acceptance: 403 `TOOL_STATUS_NOT_ACKNOWLEDGED`; `INVALID_QUOTA` theo tập mã của tool; `ON CONFLICT DO NOTHING`; bảng con cửa sổ.
- Verify: `pnpm test -- src/modules/usage/tool-status`; quick set; `pnpm openapi:export`.

### Task 6: năm route đọc

- Files: `usage/ai-usage/ai-usage-query.service.ts` (+ route GET ở `ai-usage.controller.ts`), `usage/tool-status/
tool-status-query.service.ts`, `usage/intake-gate/{intake-rejection.controller,intake-rejection-query.service}.ts`, hai manifest.
- Depends on: Task 4, Task 5; `DevicesApi.deviceExists`, `holderRegistrationIds`, `DeviceNotFoundError` (S1a Task A3).
- Acceptance: 5 operation đúng bảng API; trang flat, `RepeatableRead`, thứ tự có `id`; `/me/*` chỉ đăng ký mình giữ, còn lại 404
  `DEVICE.NOT_FOUND` (ném `DeviceNotFoundError` của S1a, không lớp/mã riêng); không tham số sort.
- Verify: quick set; `pnpm test:gates -- test/gates/api-collection-contract.gate-spec.ts`; `pnpm openapi:export`;
  `pnpm test:http -- test/http/platform/api-inventory.http-spec.ts`.

### Checkpoint A (demo tối 05/11)

Quick set + gate trên xanh; demo tool → BE → GET chạy trên BE local (script ở `Tools/…/be-integration/plan.md`); ghi kết quả thực
chạy vào bảng dưới. Báo FE 9 operation mới (đường dẫn `openapi.json`).

### Phase B — level B (sau demo)

### Task 7: test HTTP + integration

- Files: `test/http/usage/{ai-usage-batch,tool-status,usage-read,allowlist}.http-spec.ts`,
  `test/integration/usage/{ai-usage-upsert,allowlist-effective,usage-append-only}.integration-spec.ts`.
- Depends on: Task 6.
- Acceptance: ca TP-H*, TP-I* của test-plan, gồm field ma (OpenAPI ↔ bảng field spec) và hai batch đua cùng ngày.
- Verify: `pnpm test:http -- test/http/usage`; `pnpm test:integration -- test/integration/usage` (DB riêng theo test/README).

### Task 8: đếm câu lệnh các collection

- Files: `test/integration/usage/usage-read-query-count.integration-spec.ts`.
- Depends on: Task 7.
- Acceptance: số câu lệnh hằng trên 2 cỡ dữ liệu cho 5 GET (`test/support/query-count.ts`).
- Verify: `pnpm test:integration -- test/integration/usage/usage-read-query-count.integration-spec.ts`.

### Task 9: lưu lý do `SCHEMA_VIOLATION` (spec O-1)

- Files: `ai-usage.dto.ts`, `ai-usage-batch.service.ts`, migration thêm giá trị enum, test.
- Depends on: Task 7; quyết định O-1.
- Acceptance: 05 AC-4/AC-8 — ngày có trường lạ bị từ chối riêng, lý do lưu, ngày khác vẫn xử lý (hoặc phương án Owner chọn).
- Verify: `pnpm test:http -- test/http/usage/ai-usage-batch.http-spec.ts`; `pnpm openapi:export` (dialect gate xanh).

### Task 10: tự phát hành allowlist khi catalog đổi + tài liệu

- Files: `catalog/public/catalog.extension-points.ts` (Listeners mới), service catalog ghi cờ liên lạc/ngừng dùng,
  `usage/allowlist/allowlist-catalog.listener.ts`, `usage/README.md`, `docs/generated/{routes,module-graph}.md` (sinh lại).
- Depends on: Task 7.
- Acceptance: 02 AC-7 vế "thôi theo dõi" — bản mới không còn mục, Audit lý do hệ thống, cùng transaction với catalog.
- Verify: `pnpm test:integration -- test/integration/usage/allowlist-effective.integration-spec.ts`; `pnpm arch:graph`,
  `pnpm arch:routes`; `pnpm test:gates -- test/gates/extension-wiring.gate-spec.ts`.

### Checkpoint B

Owner chạy `pnpm check`, `pnpm test:http`, `pnpm test:integration` lúc audit; tự review diff theo spec/AC.

## Verification and handoff

| Lệnh / kiểm tra AC                                                   | Revision / môi trường        | Kết quả thực chạy                                               | Giới hạn / việc còn lại                        |
| -------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `pnpm typecheck`, `pnpm arch:check`, eslint file chạm                | BE `808318a4` + working tree | sạch cho file của hạng mục                                      | lỗi typecheck còn lại ở file của hạng mục khác |
| `pnpm test -- src/modules/usage`                                     | như trên                     | policy allowlist, ngày, cổng, ảnh chụp xanh                     | —                                              |
| `pnpm test:http -- test/http/usage test/http/platform`               | như trên                     | 29 + 185 test xanh                                              | —                                              |
| `pnpm test:integration -- test/integration/usage` (DB `slm-test-db`) | như trên                     | 1 file / 11 test xanh                                           | Task 8 (đếm câu lệnh) chưa làm                 |
| `pnpm test:gates`                                                    | như trên                     | 329/330, ca đỏ là model `EmployeeAccessBlock` của hạng mục khác | —                                              |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự
      kiện thật.
