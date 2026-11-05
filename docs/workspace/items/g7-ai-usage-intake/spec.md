# Spec: g7-ai-usage-intake — danh sách cho phép, lô usage AI theo ngày, ảnh chụp trạng thái công cụ, đọc usage

- Phụ trách: Cursor/dev được Owner giao.
- Thiết kế ban đầu bởi: Owner + Claude (phiên 05/11/2026).
- Thiết kế: `ready`. Owner review: thiết kế đã duyệt 05/11/2026 (DESIGN.md); spec chưa review.
- Nguồn: Docs `3d73a7f` + thay đổi chưa commit 05/11/2026 (`QĐ-101`, BRD v4.1, US đã sửa) — `BE-UserStory/src/EP-09.md`
  (`US-09-01`, `US-09-02`, `US-09-03`, `US-09-04`, `US-09-05`, `US-09-07`, `US-09-09`), `QĐ-32c`, `QĐ-62q`, `QĐ-101a`,
  `QĐ-101c`, `QĐ-101d`, `QĐ-101e`, `QĐ-101g`, `ADR-13`, `INV-17`, `BR-45.10`. BE `3e4553b9` (code đọc ở `808318a4`).
- Nhóm roadmap: G7 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · [Test plan](test-plan.md) · [DESIGN.md](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md) §0, §1,
  §2.2, §2.4, §2.5, §2.7, §4, §7, §11, §12 (S2a). Tool phía máy: `Code/Tools/workstreams/ai-collector/be-integration/`.

## Business outcome

Collector trên máy đã xác nhận gửi lô tuần `days[].tools[]` và ảnh chụp trạng thái; BE lưu mỗi (đăng ký, công cụ, ngày) một
dòng theo luật "bản dựng sau cùng thắng", trả kết quả từng ngày, lưu lý do từ chối; IT Admin đọc usage/ảnh chụp/lý do từ chối
theo máy, nhân viên đọc của chính mình. Kiểm bằng HTTP + PostgreSQL.

## Sizing decision

- Container: G7 (yêu cầu trực tiếp của Owner, DESIGN.md §12 lát S2a).
- Mode: `grouped-stories`.
- Outcome and owner: cổng nhận collector AI và hình chiếu đọc của nó; module mới `usage` (T6), capability `allowlist`,
  `intake-gate`, `ai-usage`, `tool-status`.
- Boundaries: 6 bảng ở mục Data; 9 operation HTTP; một transaction mỗi lô; đọc devices/catalog/organization qua facade;
  quyền: credential `AI_COLLECTOR`, IT_ADMIN, chính nhân viên.
- Not larger: lô trình duyệt (`g7-browser-usage-intake`), gán seat/G3–G4 (`g7-g3-g4-decisions`), xóa theo thời hạn lưu
  (`g7-usage-downstream-retention`) là outcome và test matrix riêng.
- Not smaller: allowlist "hiệu lực tại ngày", cổng theo ngày và đọc usage dùng chung bảng và policy cửa sổ; tách thì lô
  không kiểm được `NOT_IN_ALLOWLIST` và không ai đọc được dữ liệu vừa nhận.
- Siblings: `g7-device-registry-acknowledgement`, `g7-device-credential-enrollment` (phụ thuộc), `g7-browser-usage-intake`,
  `g7-g3-g4-decisions`, `g7-vendor-usage-import-identity`, `g7-usage-downstream-retention`.
- Scope map: [G7](../../../roadmap.md#work-item-decomposition-g7).

## Primary Story/AC

| Story    | AC                                                                             | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-09-01 | AC-2; vế _dữ liệu sau 15/09 bị từ chối_ của AC-10                              | partial  | AC-1, AC-3→AC-5, AC-7→AC-9, AC-12, vế còn lại AC-10: `g7-device-registry-acknowledgement`; AC-6, AC-11, AC-13, vế credential AC-10: `g7-device-credential-enrollment`                                                                                                                                                    |
| US-09-02 | AC-7                                                                           | partial  | AC-1→AC-6 (mục `WEB_DOMAIN`): `g7-browser-usage-intake`                                                                                                                                                                                                                                                                  |
| US-09-03 | AC-2; vế _cổng nhận_ của AC-3, AC-8→AC-11                                      | partial  | AC-1, AC-4→AC-7, vế trạng thái AC-3, AC-8→AC-11: `g7-device-registry-acknowledgement`                                                                                                                                                                                                                                    |
| US-09-04 | AC-12; vế _cổng nhận_ của AC-2, AC-9, AC-11                                    | partial  | AC-1, AC-3→AC-8, AC-10, vế trạng thái AC-2, AC-9, AC-11: `g7-device-registry-acknowledgement`                                                                                                                                                                                                                            |
| US-09-05 | AC-3, AC-9; vế _collector AI/ảnh chụp_ của AC-1, AC-4, AC-6, AC-8, AC-10→AC-14 | partial  | AC-2, vế credential/429 AC-13: `g7-device-credential-enrollment`; vế trình duyệt AC-1, AC-4, AC-8, AC-10→AC-12, AC-14: `g7-browser-usage-intake`; vế gán Assignment AC-1, AC-5, AC-7: `g7-g3-g4-decisions`; vế hàng đợi AC-6: `g7-vendor-usage-import-identity`; vế cảnh báo AC-11: `g7-device-registry-acknowledgement` |
| US-09-07 | AC-2, AC-3, AC-5; vế _từ chối + lý do, lần gửi gần nhất_ của AC-1              | partial  | AC-4, vế đếm theo trạng thái AC-1: `g7-device-registry-acknowledgement` (O-6)                                                                                                                                                                                                                                            |
| US-09-09 | AC-9, AC-10; vế _máy chủ_ của AC-2, AC-8                                       | partial  | AC-4→AC-6, vế tại máy AC-2, AC-8: `t1-ai-collector-uploader` (O-7)                                                                                                                                                                                                                                                       |

## Size exception

- Cohesion: một cổng nhận (credential AI → trạng thái đăng ký → cửa sổ → allowlist tại ngày) ghi một tập bảng usage và một
  hình chiếu đọc; bảy Story chỉ đóng góp _vế cổng_ của cùng luồng `SBF-05a d_gate → s_acc/s_rej`.
- Why not split: tách allowlist/lô/ảnh chụp/đọc làm mỗi lát dựng lại `DeviceIntakeContext`, policy cửa sổ và test 403/từ
  chối giống nhau; lát đọc không có dữ liệu để kiểm nếu thiếu lát ghi.
- Checkpoints: Phase A (level A: migration → allowlist → lô → ảnh chụp → đọc) và Phase B (level B) ở [plan](plan.md).
- Maximum scope: không lô trình duyệt, không mục `WEB_DOMAIN`, không gán seat/rule, không xóa theo thời hạn lưu, không màn
  tổng hợp toàn tổ chức, không route ngoài bảng API.
- Accepted by: Owner — ranh giới lát S2a duyệt 05/11/2026 (DESIGN.md §12); ngoại lệ này chờ Owner xác nhận khi review spec.

## Supporting references

`US-09-06`, `US-14-05` (không route nào mở cho MANAGER), `US-12-15`, `FR-4.3a`, `FR-4.14a`, `FR-10.1`, `ADR-13` quyết định 3,
spec sibling [registry](../g7-device-registry-acknowledgement/spec.md).

## Explicit out of scope

Mã đăng ký, credential, `@DeviceAuthenticated`, `GET /device-session` (lát này chỉ thêm field `allowlist`), xoay vòng, throttle/429 theo credential
(`g7-device-credential-enrollment`); `POST /browser-usage-batches`, mục `WEB_DOMAIN` (`g7-browser-usage-intake`); cửa sổ bao
phủ/G3–G4 (`g7-g3-g4-decisions`); job xóa 6 tháng (`g7-usage-downstream-retention`); tool phía máy (T1).

## Dependencies and blockers

- **Chặn — hợp đồng từ S1a/S1b** (đã đồng bộ 05/11 — [ALIGNMENT](../../../reviews/g7-usage-design-2026-11-05/ALIGNMENT-2026-11-05.md)):
  - S1b: `@DeviceAuthenticated({ collectorKind: 'AI_COLLECTOR' })` + `@CurrentDevice()` → `{ credentialId, collectorKind }`;
    guard trả 401 `DEVICE.CREDENTIAL_INVALID|REVOKED|EXPIRED`, 403 `DEVICE.WRONG_COLLECTOR_KIND`, 503
    `TOKEN_VERIFICATION_UNAVAILABLE` (S1b sở hữu các mã này). `DevicesApi.getIntakeContext(tx, credentialId)` khóa đăng ký
    `FOR SHARE`, trả `DeviceIntakeContext { organizationId, deviceId, registrationId, credentialId, state, acceptFromAt,
acceptUntilAt, toolStatusAcknowledged, timeZone }` — cửa sổ **cùng hàm** `sessionWindowOf` của `GET /device-session`;
    `toolStatusAcknowledged` = `ACTIVE` và bản thông báo hiện hành có `includesToolStatus` (S1a O-2); credential bị thu hồi giữa
    guard và transaction ⟹ `DeviceCredentialRevokedError` (map 401 `DEVICE.CREDENTIAL_REVOKED`).
    `DevicesApi.recordAccepted(tx, credentialId, at)` (`lastAcceptedAt`).
  - S1a: `DevicesApi.deviceExists(deviceId, tx?)`, `DevicesApi.holderRegistrationIds(deviceId, employeeId, tx?)`,
    `DeviceNotFoundError` (`devices/public/devices.errors.ts`; S1a sở hữu 404 `DEVICE.NOT_FOUND`).
  - Lát này **khai và bind** `CollectorAllowlistHook` (`devices/public/devices.extension-points.ts`, binder
    `usage/allowlist/allowlist-session.listener.ts`) và thêm field `allowlist` vào `DeviceSession` của S1b trong cùng PR (gate
    `extension-wiring` đòi Hook có đúng một binder). Không thêm `toolStatusAccepted` vào phiên (O-3).
- Catalog: facade đọc mới `CatalogApi.getCollectorApplications(ids, tx)` → `{ id, name, kind, isCommunicationService,
retiredAt }` (cột có ở `prisma/models/catalog.prisma:126-150`).
- Migration là Task 1, trước mọi code.

## Ownership: module, data, API

- `src/modules/usage/` mới, **T6**: `scripts/arch/tiers.cjs:9` thành `['personnel', 'onboarding', 'installation', 'ai-assist',
'usage']`; bảng tầng `ARCHITECTURE.md:53`, `docs/rules/module-structure.md:38`. Import xuống: `devices` (T5), `catalog`
  (T4), `organization` (T2, `OrganizationReadApi.getOrganization` `organization-read.api.ts:167`), `audit` (T1).
- `PRISMA_MODEL_OWNER` (`test/gates/architecture-boundaries.gate-spec.ts:32`): 6 model → `'usage'`. H7
  (`src/infrastructure/database/database-role-judgement.ts:13`): `collector_allowlist_versions`, `collector_allowlist_entries` =
  `['INSERT', 'SELECT']`; bảng khác DML thường (job thời hạn lưu cần DELETE).
- Sửa trong `devices` (cùng PR, Task 2): `public/devices.extension-points.ts` (`CollectorAllowlistHook extends
Hook<CollectorAllowlistReader>`, `currentAllowlist(organizationId, tx?) → { version: number|null, entries: {kind, key}[] }`),
  `credential/session/{credential-session.service,credential-session.dto}.ts` (field `allowlist`).
- `device_id`, `registration_id`, `credential_id`, `application_id` là **giá trị không FK** (tiền lệ `ai_invocations`,
  `prisma/models/ai-assist.prisma:15-18`): usage có vòng đời/thời hạn lưu riêng; FK chỉ trong module.

## Behavior and design

### Data (migration `<ts>_usage_ai_intake`; mọi id `@db.Uuid` `@default(uuid(7))`, thời điểm `@db.Timestamptz(3)`, `@map` snake_case)

```prisma
enum AiToolKey { CLAUDE_CODE CODEX ANTIGRAVITY_CLI }            enum UsageCoverage { COVERED PARTIAL NOT_OBSERVABLE }
enum CollectorAllowlistEntryKind { AI_TOOL }                     // WEB_DOMAIN: g7-browser-usage-intake thêm
enum ToolAuthStatus { LOGGED_IN LOGGED_OUT UNKNOWN NOT_SUPPORTED } enum ToolQuotaStatus { OK NOT_SUPPORTED FAILED }
enum ToolQuotaWindowCode { PRIMARY SECONDARY SESSION WEEKLY_ALL WEEKLY_MODEL FIVE_HOUR DAILY WEEKLY }
enum IntakeEndpoint { AI_USAGE_BATCH AI_TOOL_STATUS_SNAPSHOT }
enum IntakeRejectionReason { NOT_ACKNOWLEDGED COLLECTION_STOPPED TOOL_STATUS_NOT_ACKNOWLEDGED OUTSIDE_WINDOW NOT_IN_ALLOWLIST
  FUTURE_GENERATED_AT FUTURE_OBSERVED_AT INVALID_COVERAGE INVALID_QUOTA }
model CollectorAllowlistVersion { id; organizationId; versionNumber Int; reason String; publishedByAppUserId; publishedAt @default(now())
  entries CollectorAllowlistEntry[]; @@unique([organizationId, versionNumber]) }                         // append-only
model CollectorAllowlistEntry { id; versionId; kind CollectorAllowlistEntryKind; key String; applicationId
  version CollectorAllowlistVersion @relation(fields: [versionId], references: [id], onDelete: Restrict)
  @@unique([versionId, kind, key]); @@unique([versionId, applicationId]) }                              // append-only
model AiUsageDay { id; organizationId; deviceId; registrationId; credentialId; tool AiToolKey; applicationId
  usageDate DateTime @db.Date; coverage UsageCoverage; responses Int; totalTokens BigInt; generatedAt; contentHash String
  receivedAt; @@unique([registrationId, tool, usageDate]); @@index([deviceId, usageDate]) }
model ToolStatusSnapshot { id; organizationId; deviceId; registrationId; credentialId; tool AiToolKey; observedAt
  authStatus ToolAuthStatus; quotaStatus ToolQuotaStatus; receivedAt @default(now()); windows ToolStatusWindow[]
  @@unique([registrationId, tool, observedAt]); @@index([deviceId, tool, observedAt]) }
model ToolStatusWindow { snapshotId; code ToolQuotaWindowCode; usedPercent Int @db.SmallInt; resetsAt DateTime?
  snapshot ToolStatusSnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade); @@id([snapshotId, code]) }
model IntakeRejection { id; organizationId; deviceId; registrationId String?; credentialId; endpoint IntakeEndpoint
  usageDate DateTime? @db.Date; reasonCode IntakeRejectionReason; rejectedAt @default(now()); @@index([deviceId, rejectedAt]) }
```

```sql
ALTER TABLE ai_usage_days ADD CONSTRAINT ai_usage_days_counts CHECK (responses >= 0 AND total_tokens >= 0
  AND (coverage <> 'NOT_OBSERVABLE' OR (responses = 0 AND total_tokens = 0)));
ALTER TABLE tool_status_windows ADD CONSTRAINT tool_status_windows_percent CHECK (used_percent BETWEEN 0 AND 100);
CREATE FUNCTION usage_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
-- BEFORE UPDATE OR DELETE FOR EACH ROW + BEFORE TRUNCATE FOR EACH STATEMENT trên collector_allowlist_versions và _entries.
```

### Danh sách cho phép (US-09-02 AC-7; lệch DESIGN — D-1)

- `POST /collector-allowlist-versions` (IT_ADMIN): IT khai `aiTools` (khóa ↔ ứng dụng); BE kiểm từng ứng dụng qua
  `CatalogApi.getCollectorApplications`: không có ⟹ 422 `COLLECTOR_ALLOWLIST.APPLICATION_NOT_FOUND`; `kind = INTERNAL`,
  `isCommunicationService` hoặc `retiredAt` ⟹ 422 `COLLECTOR_ALLOWLIST.APPLICATION_NOT_ELIGIBLE` (`QĐ-62o`; 02 AC-2, AC-5); tập
  mục y hệt bản hiện hành ⟹ 409 `COLLECTOR_ALLOWLIST.UNCHANGED`. Số phiên bản = max + 1 dưới advisory lock
  `collector-allowlist:<org>`. Audit `COLLECTOR_ALLOWLIST.PUBLISHED` (`reason`, số phiên bản, khóa thêm/bớt).
- `ANTIGRAVITY_CLI` mang `experimental = true` (hằng `AI_TOOL_EXPERIMENTAL` ở `allowlist/allowlist.policy.ts`, không lưu).
- **Hiệu lực tại ngày** (`allowlist-facts.service.ts`): khóa K hợp lệ cho ngày local D ⟺ có phiên bản chứa K mà
  `[publishedAt, publishedAt bản kế)` giao `[đầu D, đầu D+1)` theo `Organization.timeZone`; `applicationId` từ bản giao muộn
  nhất. Một câu SQL `LEAD(published_at)` cho cả lô. Session đọc bản hiện hành: `{ version: number|null, entries: [{kind, key}] }`.

### Cổng nhận (thứ tự DESIGN §1)

Guard S1b (401, 403 kind) → pipe Zod strict (422 cả request) → service, một transaction từ `getIntakeContext`:
`AWAITING_ACKNOWLEDGEMENT` ⟹ ghi `intake_rejections` (date NULL, `NOT_ACKNOWLEDGED`), commit, rồi ném 403
`DEVICE.NOT_ACKNOWLEDGED`; `COLLECTION_STOPPED` ⟹ tương tự 403 `DEVICE.COLLECTION_STOPPED` (credential giữ — 04 AC-12). Ảnh
chụp thêm: `toolStatusAcknowledged = false` ⟹ 403 `DEVICE.TOOL_STATUS_NOT_ACKNOWLEDGED` (03 AC-11).

**Từng ngày** (`ai-usage/ai-usage-day.policy.ts`, thuần, thứ tự cố định; ngày bị từ chối ⟹ một dòng `intake_rejections`):
(1) `generatedAt > now + 5 phút` ⟹ mọi ngày `FUTURE_GENERATED_AT`; (2) `date` < ngày local của `acceptFromAt` hoặc > ngày local
của `min(acceptUntilAt, generatedAt)` ⟹ `OUTSIDE_WINDOW` (05 AC-14, 01 AC-10, 03 AC-3); (3) có `tool` không hợp lệ tại `date`
⟹ `NOT_IN_ALLOWLIST` (cả ngày); (4) `NOT_OBSERVABLE` có số ≠ 0, hoặc `COVERED` khi ngày không nằm trọn trong
`[acceptFromAt, min(acceptUntilAt, generatedAt)]` ⟹ `INVALID_COVERAGE` (ngày biên chỉ `PARTIAL`); (5) còn lại upsert; ngày
`ACCEPTED` nếu ít nhất một dòng ghi/đổi, ngược lại `UNCHANGED`. `generatedAt` cũ hơn bản đã lưu ⟹ `UNCHANGED` (O-4).

**Upsert "bản dựng sau cùng thắng"** (05 AC-10, AC-12; DESIGN §2.7 — một dòng mỗi (đăng ký, tool, ngày) nên nhiều credential
hợp nhất tự nhiên): một câu `INSERT … SELECT FROM unnest(…) ORDER BY tool, usage_date ON CONFLICT (registration_id, tool,
usage_date) DO UPDATE SET … WHERE ai_usage_days.content_hash <> EXCLUDED.content_hash AND ai_usage_days.generated_at <=
EXCLUDED.generated_at RETURNING tool, usage_date`; `content_hash` =
SHA-256 của `coverage|responses|totalTokens`. Tool vắng trong ngày ⟹ không đụng dòng cũ. Có ngày `ACCEPTED` ⟹
`recordAccepted`. Thứ tự khóa: đăng ký `FOR SHARE` → `ai_usage_days` → `intake_rejections` → credential. Không Audit từng lô;
token không vào log/audit.

**Ảnh chụp** (`tool-status/tool-status.policy.ts`): `observedAt > now + 5 phút` ⟹ `FUTURE_OBSERVED_AT`; ngoài `[acceptFromAt,
acceptUntilAt]` ⟹ `OUTSIDE_WINDOW`; tool không hợp lệ tại ngày của `observedAt` ⟹ `NOT_IN_ALLOWLIST`; `OK` mà `windows` rỗng,
`≠ OK` mà có `windows`, `code` trùng hoặc ngoài tập của tool ⟹ `INVALID_QUOTA`. Tập mã (rút từ `Tools/…/provider_status.py:105-128`,
`:295-311`, `:448-467`): `CODEX` {`PRIMARY`, `SECONDARY`} · `CLAUDE_CODE` {`SESSION`, `WEEKLY_ALL`, `WEEKLY_MODEL`} ·
`ANTIGRAVITY_CLI` {`FIVE_HOUR`, `DAILY`, `WEEKLY`} (O-2). Hợp lệ ⟹ `INSERT … ON CONFLICT (registration_id, tool, observed_at) DO
NOTHING` + cửa sổ ⟹ `ACCEPTED`/`UNCHANGED`; không đổi `ai_usage_days` (05 AC-13, 09-09 AC-10).

### API (`/api/v1`; DTO `z.strictObject`; 422 `VALIDATION_ERROR` mọi route có đầu vào; 413 parser 100 KiB)

| operationId · route · truy cập                                                                                    | message success                      |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `aiUsageBatchCreate` · `POST /ai-usage-batches` · `@DeviceAuthenticated({ collectorKind: 'AI_COLLECTOR' })` · 200 | `AI_USAGE_BATCH.PROCESSED`           |
| `aiToolStatusSnapshotCreate` · `POST /ai-tool-status-snapshots` · như trên · 200                                  | `AI_TOOL_STATUS_SNAPSHOT.PROCESSED`  |
| `collectorAllowlistVersionCreate` · `POST /collector-allowlist-versions` · IT_ADMIN · 201                         | `COLLECTOR_ALLOWLIST.PUBLISHED`      |
| `collectorAllowlistEntryList` · `GET /collector-allowlist-entries` · IT_ADMIN                                     | `COLLECTOR_ALLOWLIST.ENTRIES_LISTED` |
| `deviceUsageList` · `GET /devices/{id}/usage` · IT_ADMIN                                                          | `DEVICE_USAGE.LISTED`                |
| `deviceToolStatusList` · `GET /devices/{id}/tool-status` · IT_ADMIN                                               | `DEVICE_TOOL_STATUS.LISTED`          |
| `deviceIntakeRejectionList` · `GET /devices/{id}/intake-rejections` · IT_ADMIN                                    | `DEVICE_INTAKE_REJECTION.LISTED`     |
| `myDeviceUsageList` · `GET /me/devices/{id}/usage` · `@AuthenticatedOnly()`                                       | `MY_DEVICE_USAGE.LISTED`             |
| `myDeviceToolStatusList` · `GET /me/devices/{id}/tool-status` · `@AuthenticatedOnly()`                            | `MY_DEVICE_TOOL_STATUS.LISTED`       |

Lỗi (một mã ↔ một status ↔ một chủ): **lát này sở hữu** 403 `DEVICE.NOT_ACKNOWLEDGED`, `DEVICE.COLLECTION_STOPPED`,
`DEVICE.TOOL_STATUS_NOT_ACKNOWLEDGED` (`intake-gate/intake-gate.errors.ts`, lô trình duyệt dùng lại) và 422/409
`COLLECTOR_ALLOWLIST.*`; **dùng lại** 404 `DEVICE.NOT_FOUND` (ném `DeviceNotFoundError` của S1a; với `/me` cả khi người gọi chưa
từng giữ máy — không lộ tồn tại), 401 `DEVICE.CREDENTIAL_*` / 403 `DEVICE.WRONG_COLLECTOR_KIND` / 503 của guard S1b; 401/403
guard người dùng như hiện có. Lỗi bọc `{ success: false, error: { code, message, requestId, details? } }` (`api-contract.md`).

**Request fields** (organization, thiết bị, đăng ký, nhân viên, `applicationId`, semantics token, thời điểm server: BE — F-2):

| route · field                      | kiểu & ràng buộc                                                               | bắt buộc (ca vắng)                     | nguồn                         | dùng ở                              |
| ---------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------- | ----------------------------- | ----------------------------------- |
| batch `generatedAt`                | ISO instant có offset                                                          | có                                     | tool (lúc dựng lô)            | bản sau cùng; cửa sổ; 05 AC-12      |
| `days[]`                           | 1–14, `date` không trùng                                                       | có                                     | tool                          | 05 AC-12 (lô tuần theo ngày)        |
| `days[].date`                      | `businessDateSchema`                                                           | có                                     | tool (ngày local, TZ session) | cửa sổ; khóa dòng; 09-09 AC-9       |
| `days[].tools[]`                   | 1–10, `tool` không trùng                                                       | có                                     | tool                          | tool vắng = không thu (DESIGN §2.4) |
| `tools[].tool`                     | `AiToolKey`                                                                    | có                                     | tool (khóa trong session)     | allowlist tại ngày; 02 AC-7         |
| `tools[].coverage`                 | `COVERED`·`PARTIAL`·`NOT_OBSERVABLE`                                           | có                                     | tool (theo client)            | `FR-4.3a`; 05 AC-14                 |
| `tools[].responses`                | int 0–1 000 000                                                                | có                                     | tool                          | ngày hoạt động 09-09 AC-9           |
| `tools[].totalTokens`              | int 0–2^53−1                                                                   | có                                     | tool (semantics từng tool)    | hiển thị IT/nhân viên; 09-09 AC-9   |
| snapshot `snapshots[]`             | 1–20                                                                           | có                                     | tool                          | 07 AC-5; 09-09 AC-10                |
| `tool`, `observedAt`               | `AiToolKey`; ISO instant có offset                                             | có                                     | tool                          | khóa dòng; thời điểm quan sát       |
| `auth.status`                      | `LOGGED_IN`·`LOGGED_OUT`·`UNKNOWN`·`NOT_SUPPORTED`                             | có                                     | tool                          | 07 AC-5; 09-09 AC-10                |
| `quota.status`, `quota.windows[]`  | `OK`·`NOT_SUPPORTED`·`FAILED`; 0–3 `{code, usedPercent 0–100, resetsAt\|null}` | có (`resetsAt` null = tool không biết) | tool                          | 07 AC-5 (phần trăm, đặt lại)        |
| allowlist `reason`                 | trim 1–1000                                                                    | có                                     | IT Admin                      | Audit; 02 AC-6/AC-7                 |
| allowlist `aiTools[]`              | 0–3 `{tool, applicationId uuid}`, không trùng tool/ứng dụng                    | có (rỗng = bỏ hết)                     | IT Admin                      | 02 AC-7                             |
| GET usage `from`, `to`             | `businessDateSchema`, `from ≤ to`                                              | không — vắng: không lọc                | IT / nhân viên                | màn usage theo máy                  |
| GET rejections `reasonCode`        | `IntakeRejectionReason`                                                        | không — vắng: mọi lý do                | IT Admin                      | 07 AC-1 (từ chối theo lý do)        |
| mọi GET `page`, `pageSize`; `{id}` | int ≥1, ≤100 (mặc định 1/20); uuid thiết bị                                    | không / có                             | client                        | API-LIST-DETAIL.1                   |

Zod (dự kiến; `ai-usage/ai-usage.dto.ts`, `tool-status/tool-status.dto.ts`, `allowlist/allowlist.dto.ts`):

```ts
const aiToolKey = z.enum(['CLAUDE_CODE', 'CODEX', 'ANTIGRAVITY_CLI']);
const instant = z.iso.datetime({ offset: true });
// distinct(item, min, max, key) = z.array(item).min(min).max(max).refine(no two keys equal, '<key> must not repeat')
const aiUsageTool = z.strictObject({
  tool: aiToolKey,
  coverage: z.enum(['COVERED', 'PARTIAL', 'NOT_OBSERVABLE']),
  responses: z.number().int().min(0).max(1_000_000),
  totalTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
const aiUsageDay = z.strictObject({ date: businessDateSchema('date'), tools: distinct(aiUsageTool, 1, 10, 'tool') });
export const aiUsageBatchBodySchema = z.strictObject({
  generatedAt: instant,
  days: distinct(aiUsageDay, 1, 14, 'date'),
});

const quotaWindow = z.strictObject({
  code: z.enum(TOOL_QUOTA_WINDOW_CODES),
  usedPercent: percent,
  resetsAt: instant.nullable(),
});
const quota = z.strictObject({
  status: z.enum(['OK', 'NOT_SUPPORTED', 'FAILED']),
  windows: z.array(quotaWindow).max(3),
});
const auth = z.strictObject({ status: z.enum(['LOGGED_IN', 'LOGGED_OUT', 'UNKNOWN', 'NOT_SUPPORTED']) });
const snapshot = z.strictObject({ tool: aiToolKey, observedAt: instant, auth, quota });
export const toolStatusBatchBodySchema = z.strictObject({ snapshots: z.array(snapshot).min(1).max(20) });

const aiToolMapping = z.strictObject({ tool: aiToolKey, applicationId: z.uuid() });
export const allowlistVersionBodySchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
  aiTools: distinct(aiToolMapping, 0, 3, 'tool').refine(uniqueBy('applicationId'), 'applicationId must not repeat'),
});
```

**Response** (Date → ISO; `totalTokens` BigInt → number):

| schema · field                                                                                                                                                                          | tiêu thụ                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `AiUsageBatchResult.results[≤14]`: `date`, `outcome` (`ACCEPTED`·`UNCHANGED`·`REJECTED`), `reasonCode\|null`                                                                            | tool (gửi lại/dừng); 05 AC-10, AC-12, AC-14                            |
| `ToolStatusBatchResult.results[≤20]`: `tool`, `observedAt`, `outcome`, `reasonCode\|null`                                                                                               | tool; 05 AC-13                                                         |
| `CollectorAllowlistVersion` (POST): `id`, `versionNumber`, `publishedAt`, `entries[≤3]{kind, key, application{id,name}, experimental}`                                                  | màn allowlist; 02 AC-7                                                 |
| `CollectorAllowlistEntry` (trang): `versionNumber`, `publishedAt`, `kind`, `key`, `application{id,name}`, `experimental`                                                                | màn allowlist; 02 AC-7 (nhãn thử nghiệm)                               |
| `DeviceUsageDay` (trang): `date`, `tool`, `experimental`, `coverage`, `responses`, `totalTokens`, `active` (`responses ≥ 1`), `generatedAt`, `registrationId`                           | IT: 05 AC-12 (bản thắng), 09-09 AC-8/AC-9; tách người giữ khi bàn giao |
| `MyDeviceUsageDay`: như trên **không** `registrationId`                                                                                                                                 | `FR-10.1`; 09-09 AC-9                                                  |
| `DeviceToolStatusRow` (trang; bản mới nhất mỗi tool, mỗi cửa sổ một dòng): `tool`, `observedAt`, `authStatus`, `quotaStatus`, `windowCode\|null`, `usedPercent\|null`, `resetsAt\|null` | 07 AC-5 (IT và chính nhân viên)                                        |
| `IntakeRejection` (trang): `id`, `endpoint`, `date\|null`, `reasonCode`, `rejectedAt`                                                                                                   | 07 AC-1; 05 AC-11                                                      |

Không tham số sắp xếp/lọc theo token, phản hồi hay phần trăm (07 AC-2); không trường IP, URL, tên gói.

**Collection (API-LIST-DETAIL.1).** Mọi GET là trang flat (không mảng lồng ⟹ không cần `NESTED_ARRAYS`), `select` trực
tiếp, đếm + trang cùng `RepeatableRead`, số câu lệnh hằng (tên ứng dụng đọc lô một lần/trang). Thứ tự: entries `kind, key, id`
của bản hiện hành; usage `usage_date DESC, tool, id`; tool-status `tool, window_code NULLS FIRST, snapshot_id` trên `DISTINCT ON
(tool) … ORDER BY tool, observed_at DESC, id DESC`; rejections `rejected_at DESC, id`. `/me/*` lọc `registration_id =
ANY(holderRegistrationIds)`. Không detail riêng: dòng là đơn vị nhỏ nhất.

### Câu hỏi mở (mặc định đang dùng)

- **O-1** Trường lạ ⟹ 422 cả lô, chưa lưu lý do `SCHEMA_VIOLATION` mà 05 AC-4/AC-8 cần cho trạng thái. Level B: parse từng ngày
  ở service nếu gate dialect cho phép; nếu không, ghi một dòng (date NULL) khi route thiết bị trả 422.
- **O-2** Codex nhiều `limit_id`: chỉ gửi `codex`. Claude: `session` ⟹ `SESSION`; `weekly*` không scope ⟹ `WEEKLY_ALL`, có scope
  ⟹ `WEEKLY_MODEL`; nhiều bucket cùng mã (agy, Claude theo model) ⟹ gửi bucket `usedPercent` lớn nhất. Mã Claude weekly-all chưa
  thấy ở fixture — chốt khi pin.
- **O-3** (đã chốt ở lượt đồng bộ) **Không** thêm `toolStatusAccepted` vào phiên: T1 không đọc nó (T-O3 — thử POST, 403
  `DEVICE.TOOL_STATUS_NOT_ACKNOWLEDGED` thì bỏ ảnh chụp lần đó; probe chỉ chạy cục bộ như `local-report`), nên field không có nơi
  dùng (F-5). Cái giá: mỗi lần gửi trước khi xác nhận bản có mục ảnh chụp để lại một dòng rejection — đúng ý `US-09-03` AC-11.
- **O-4** `generatedAt` cũ hơn ⟹ `UNCHANGED`, không lưu lý do (không phải vi phạm).
- **O-5** Tự phát hành allowlist khi catalog đổi (ứng dụng thành liên lạc/ngừng dùng — 02 AC-7 vế "thôi theo dõi") là level B
  qua `Listeners` catalog mở; level A: IT phát hành tay.
- **O-6** US-09-07 AC-4 và vế đếm AC-1 dựa `deviceList?state=` của registry; điều phối viên xác nhận chủ.
- **O-7** Phần tại máy (09-09 AC-2, AC-4→AC-6, AC-8 vế tại máy) nằm ở spec Tools `Code/Tools/workstreams/ai-collector/
be-integration/`; checker cấm link ra ngoài repo, nên điều phối viên lập hạng mục khung `t1-ai-collector-uploader` trỏ tới đó.

## Test matrix

Ca chi tiết ở [test-plan](test-plan.md).

| AC / rủi ro                              | Tình huống                                         | Cấp test    | Kết quả mong đợi                      | Bằng chứng sau implement |
| ---------------------------------------- | -------------------------------------------------- | ----------- | ------------------------------------- | ------------------------ |
| 05 AC-3, 03 AC-2, 01 AC-2, 04 AC-12      | chưa xác nhận / đã dừng                            | http + int  | 403 đúng mã + một dòng rejection      | planned                  |
| 05 AC-10, AC-12; DESIGN §2.7             | gửi lại, `T2` rồi `T1` muộn, hai credential        | unit + int  | `UNCHANGED`, giữ `T2`, không nhân đôi | planned                  |
| 05 AC-14, 01 AC-10, 03 AC-3              | ngày trước ack / sau dừng / biên `COVERED`         | unit        | `OUTSIDE_WINDOW` / `INVALID_COVERAGE` | planned                  |
| 02 AC-7, 09-09 AC-8                      | khóa ngoài allowlist tại ngày; agy thử nghiệm      | unit + int  | `NOT_IN_ALLOWLIST`; `experimental`    | planned                  |
| 05 AC-13, 03 AC-11, 07 AC-5, 09-09 AC-10 | ảnh chụp trước/sau thông báo có mục; mã cửa sổ sai | http + unit | 403 / `INVALID_QUOTA` / nhận tách     | planned                  |
| 07 AC-2, AC-3; field ma                  | quyền GET; tham số sort lạ; OpenAPI ↔ bảng field   | http        | 403/422; tập field khớp bảng          | planned                  |

## Definition of Done

- [ ] Level A: Task 1–6 của plan xanh bằng bộ kiểm nhanh; demo tool → BE → đọc chạy trên BE local.
- [ ] Level B: Task 7–10; `pnpm test:http`, integration `test/integration/usage/*` (Owner chạy lúc audit), `pnpm openapi:export`.
- [ ] `tiers.cjs`, bảng tầng, `PRISMA_MODEL_OWNER`, H7, manifest API/ví dụ, module card `usage/README.md`, `routes.md`/
      `module-graph.md` sinh lại; báo FE 9 operation mới.

## Changes and acceptance

05/11/2026: tạo spec `ready` (Claude). Lệch DESIGN: **D-1** allowlist AI khai trong phiên bản (IT chọn khóa ↔ ứng dụng, BE kiểm
theo catalog) thay vì cột catalog — không đổi DTO/trigger catalog đang bận ở C1; bỏ `requiresReacknowledgement` khỏi body
allowlist (cờ thuộc phiên bản thông báo — `QĐ-62q`; không nơi dùng, F-1). **D-2** cửa sổ quota ở bảng con thay `windows Json`
(CHECK phần trăm, đọc flat). **D-3** dòng usage khóa theo đăng ký thay vì thiết bị (bàn giao trong ngày không đè người trước).
**D-4** GET trả trang flat thay vì mảng lồng (gate `NESTED_ARRAYS` chỉ co lại). Chưa review, chưa nghiệm thu.

05/11/2026 (Claude, lượt đồng bộ chéo — [ALIGNMENT](../../../reviews/g7-usage-design-2026-11-05/ALIGNMENT-2026-11-05.md)): tên
hợp đồng ở _Dependencies_ khớp S1a/S1b (facade, `CurrentDevice`, `DeviceIntakeContext`, lỗi công khai); chủ mã lỗi: S1b giữ 401,
403 kind và 503, lát này giữ ba 403 cổng, S1a giữ 404 `DEVICE.NOT_FOUND`; lát này khai + bind `CollectorAllowlistHook` và thêm
`allowlist` vào phiên (S1b O-3); O-3 chốt không thêm `toolStatusAccepted`; migration sau S1b; tầng `usage` = T6 khớp
`tiers.cjs:9`; khóa công cụ, mã cửa sổ, field lô/ảnh chụp đối chiếu T1 — khớp.

05/11/2026 (Claude Code, Đợt 1 bước 16): mức A đã chạy kiểm tại chỗ (`verified-local`; chưa review, chưa nghiệm thu, chưa kiểm trên CI). Migration
`20261107000300_usage_ai_intake`; module `usage` (T6); 9 operation; `CollectorAllowlistHook` khai ở `devices` và bind ở `usage`; `GET /device-session` có
`allowlist`. Lệch spec: (1) `POST /ai-usage-batches` không nhận `Idempotency-Key`: "gửi lại cùng nội dung ⟹ `UNCHANGED`" đạt nhờ `content_hash` + `generated_at`,
header bị bỏ qua nếu tool gửi; (2) `allowlist.entries` của phiên là mảng lồng nên được ghi vào `NESTED_ARRAYS` (bounded 3, `AI_TOOL_KEYS`) kèm sự kiện sổ
đăng ký `added` — _cần Owner đồng ý_ như mục tương tự của AI assist; (3) lệnh `ops:record-super-admin-event` import `UsageModule` để graph có đủ người đăng
ký hook (gate `extension-wiring`), thay vì thêm ngoại lệ; (4) thông điệp thành công của nhóm thiết bị chuyển sang `openapi-example-messages-devices.ts` vì
`openapi-example-manifest.ts` chạm trần 400 dòng; (5) `catalog` thêm `CatalogApi.getCollectorApplications` (đọc `kind`, `isCommunicationService`, `retiredAt`);
(6) task 7–10 (mức B) chưa làm, nhưng đã có sẵn: test HTTP, test integration (11 ca) và các test policy; chưa có test đếm câu lệnh (Task 8).

05/11/2026 (Claude Code, demo bước 17): sửa luật upsert sau khi demo thật cho thấy tool gửi lại cả cửa sổ với `generatedAt` mới mỗi lần nên luôn bị ghi
`ACCEPTED`. Nay dòng chỉ bị thay khi `content_hash` khác **và** bản dựng mới hơn hoặc cùng thời điểm; cùng số liệu gửi lại ở bản dựng sau ⟹ `UNCHANGED`
(không cập nhật `generated_at`). Test integration có thêm ca này.

06/11/2026 (Claude Code, FIX-DOT-1 G-L2): cùng `content_hash` ở bản dựng sau ⟹ vẫn `UNCHANGED` nhưng `generated_at` được nâng lên, để bản khác số liệu dựng giữa hai lần
(đến muộn) không ghi đè bản đã thấy cùng số liệu muộn hơn. Câu `UPDATE … FROM unnest(…)` chạy ngay sau upsert trong cùng transaction; test integration có thêm ca.
