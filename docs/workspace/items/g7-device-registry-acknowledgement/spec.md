# Spec: g7-device-registry-acknowledgement — sổ thiết bị, `BM-06`, thông báo theo dõi, xác nhận chủ động, yêu cầu dừng

- Phụ trách: Cursor/dev được Owner giao.
- Thiết kế ban đầu bởi: Owner + Claude (phiên 05/11/2026).
- Thiết kế: `ready`. Owner review: thiết kế đã duyệt 05/11/2026 (DESIGN.md); spec chưa review.
- Nguồn: Docs `3d73a7f` + thay đổi chưa commit 05/11/2026 (`QĐ-101`, BRD v4.1, US đã sửa) — `EP-09.md` (`US-09-01`,
  `US-09-03`, `US-09-04`, `US-09-08`); `QĐ-32c`, `QĐ-62q`, `QĐ-66ad`, `QĐ-66ae`, `QĐ-96j`, `QĐ-100q`, `QĐ-100z`, `QĐ-101e`,
  `QĐ-101g`. BE `3e4553b9`; code đối chiếu ở `808318a4` (có module `ai-assist`).
- Nhóm roadmap: G7 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · [Test plan](test-plan.md) · [DESIGN.md](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md)
  §0 (F-1…F-6), §1, §3, §7, §11, §12 (S1a). Lát sau: [`g7-device-credential-enrollment`](../g7-device-credential-enrollment/spec.md).

## Business outcome

IT Admin ghi sổ máy công ty dùng riêng một người (không IP), đổi người giữ/ngừng dùng máy, lưu bản ký `BM-06`; Super Admin
phát hành phiên bản thông báo năm mục; mỗi tài khoản thấy máy của mình và xác nhận chủ động; đăng ký tự kết thúc khi đổi người
giữ, ngừng dùng, nghỉ việc. Kiểm bằng HTTP + PostgreSQL: trạng thái thu thập của từng máy đúng sau từng sự kiện.

**Mức ưu tiên (Owner 05/11 chiều — FE tối nay, demo mai).** Mỗi task ở [plan](plan.md) mang **A** (tối nay, để collector
enroll và gửi được) hoặc **B** (sau demo). A vẫn là logic thật, không mock. Bảng API dưới đây ghi mức từng route.

## Sizing decision

- Container: G7 (yêu cầu trực tiếp của Owner, DESIGN.md §12 lát S1a).
- Mode: `grouped-stories`.
- Outcome and owner: vòng đời một đăng ký thiết bị và trạng thái thu thập của nó; module mới `devices`, capability
  `registry`, `notice`, `acknowledgement`, `my-devices`, `stop-request`.
- Boundaries: 6 bảng mới ở mục Data + một cột/CHECK của `document_attachments`; 16 operation HTTP; một sweeper SLA (B);
  quyền IT_ADMIN, SUPER_ADMIN, mọi tài khoản cho `/me`.
- Not larger: credential/mã đăng ký/`@DeviceAuthenticated()` là ranh giới bảo mật riêng (`g7-device-credential-enrollment`);
  cổng nhận dữ liệu thuộc `g7-ai-usage-intake`, `g7-browser-usage-intake`.
- Not smaller: trạng thái thu thập là hàm của đăng ký, `BM-06`, xác nhận, phiên bản thông báo và yêu cầu dừng; tách thì mỗi
  lát viết lại cùng hình chiếu trạng thái và ma trận test.
- Siblings: `g7-device-credential-enrollment`, `g7-ai-usage-intake`, `g7-browser-usage-intake`, `g7-usage-downstream-retention`;
  A-05: `a05-k4-device-registry-contract`, `a05-bm06-signature-record` (O-1).
- Scope map: [G7](../../../roadmap.md#work-item-decomposition-g7).

## Primary Story/AC

| Story    | AC                                 | Coverage | Phần còn lại thuộc                                                                                                                                                              |
| -------- | ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-09-01 | AC-1, AC-3→AC-5, AC-7→AC-10, AC-12 | partial  | AC-2: `g7-ai-usage-intake`; AC-6, AC-11, AC-13 và vế _credential thu hồi_ của AC-10: `g7-device-credential-enrollment`; vế _dữ liệu bị từ chối_ của AC-10: `g7-ai-usage-intake` |
| US-09-03 | AC-1, AC-3→AC-5, AC-7→AC-11        | partial  | AC-2 và vế _cổng nhận từ chối/tiếp tục nhận_ của AC-3, AC-8, AC-9, AC-10, AC-11: `g7-ai-usage-intake`; AC-6 (câu chữ văn bản `BM-06`): ngoài BE — FE/biểu mẫu giấy              |
| US-09-04 | AC-1→AC-11                         | partial  | AC-12 và vế _cổng từ chối/nhận lại_ của AC-2, AC-9, AC-11: `g7-ai-usage-intake`; vế _credential được giữ_ của AC-12: `g7-device-credential-enrollment`                          |
| US-09-08 | AC-1, AC-3, AC-4, AC-6, AC-7       | partial  | AC-2, AC-5 và vế _credential thu hồi_ của AC-1, AC-3, AC-6, AC-7: `g7-device-credential-enrollment`                                                                             |

Vế sở hữu ở đây: **trạng thái** mà cổng nhận và credential đọc, cùng mọi thao tác web. Cảnh báo dashboard `US-12-15` không thuộc
lát nào ở G7 (ghi ở _Explicit out of scope_).

## Size exception

- Cohesion: một vòng đời đăng ký (đăng ký → `BM-06` → xác nhận → dừng → kết thúc) trên `device_registrations` + hai cột hình
  chiếu; cùng actor (IT Admin, chính nhân viên) và một hàm trạng thái.
- Why not split: `US-09-03`/`US-09-04` không kiểm được nếu thiếu sổ; `US-09-08` chỉ là một nguyên nhân kết thúc đăng ký.
- Checkpoints: A1 (migration, sổ, kết thúc đăng ký) → A2 (thông báo, `BM-06`, xác nhận, `/me/devices`) → B ([plan](plan.md)).
- Maximum scope: không credential/session thiết bị, intake, allowlist, `US-09-07`, `US-12-15`; không route ngoài bảng API.
- Accepted by: Owner — ranh giới S1a duyệt 05/11/2026 (DESIGN.md §12); ngoại lệ chờ Owner xác nhận khi review spec.

## Supporting references

`US-04-04` AC-8 (O-1); `US-09-02`, `US-09-05`, `US-09-07`, `US-12-15`; `ADR-04`; A-05 Q1–Q8
([contract](../a05-k4-device-registry-contract/spec.md)); [`qd96-100-departure-day-access-block`](../qd96-100-departure-day-access-block/spec.md).

## Explicit out of scope

Credential/mã/`GET /device-session` (S1b); usage/tool-status/intake-rejections (lát intake); allowlist; thời hạn lưu; cảnh báo
`US-12-15` (chưa có lát; FE lọc `deviceList?state=AWAITING_ACKNOWLEDGEMENT` thay tạm); văn bản `BM-06`; thu hồi khóa K4.

## Dependencies and blockers

- Không chặn phần A. Task B4 (đăng ký kết thúc **hết ngày làm việc cuối**) chờ Phần A của `qd96-100-departure-day-access-block`
  (`employee_access_blocks`, facade `IdentityAccessApi`); trước khi có, AC-1/AC-6 của `US-09-08` chỉ đạt qua credential S1b đọc
  `employees.status` (xem S1b) — ghi rõ khi demo.
- Migration là task đầu; S1b phụ thuộc migration + `registry` của lát này.

## Ownership: module, data, API

- `src/modules/devices/` (mới). `scripts/arch/tiers.cjs:8` → `['budgets', 'requests', 'data-import', 'devices']` (T5, không cạnh
  cùng tầng). Import xuống: `audit`, `notifications` (T1), `organization`, `identity-access` (T2), `operating-parameters` (T3,
  B), `catalog`, `licensing` (T4, B). `personnel` (T6) gọi `DevicesApi`. Bảng tầng ở `docs/rules/module-structure.md` và
  `ARCHITECTURE.md` sửa theo.
- Capability (không vòng): `notice/` (L0) ← `registry/` (đăng ký, bản ký, kết thúc đăng ký) ← `acknowledgement/` ←
  `my-devices/`; `stop-request/` ← `registry/`. File gốc `devices-collection-state.policy.ts` (hàm trạng thái dùng chung,
  S1b đọc lại).
- `PRISMA_MODEL_OWNER` (`test/gates/architecture-boundaries.gate-spec.ts:32`): 6 model → `'devices'`. H7
  `RUNTIME_TABLE_EXCEPTIONS` (`src/infrastructure/database/database-role-judgement.ts:13`): `monitoring_notice_versions`,
  `device_acknowledgements`, `device_signature_records` = `['INSERT', 'SELECT']`.
- Module khác: `catalog/contract` (mở `SIGNATURE_RECORD`, `CatalogApi.attachSignatureRecord`), `personnel/offboarding` (listener
  `onLeft` gọi `DevicesApi`), `licensing/public` (`DeviceRegistryHook`, B).
- Facade `public/devices.api.ts` `DevicesApi.endRegistrationsOfHolder(tx, { employeeId, end: { at: Date } | { afterDay:
BusinessDate }, cause })` (idempotent). S1b thêm `getIntakeContext`, `recordAccepted`; S2a thêm `CollectorAllowlistHook`.
- Facade đọc cho `g7-ai-usage-intake` (A, task A3): `DevicesApi.deviceExists(deviceId, tx?): Promise<boolean>` (máy có trong sổ,
  kể cả đã ngừng dùng) và `DevicesApi.holderRegistrationIds(deviceId, employeeId, tx?): Promise<readonly string[]>` (mọi đăng ký
  của máy mà người đó từng giữ, cả đã kết thúc — `FR-10.1`; rỗng khi không có). `public/devices.errors.ts` export
  `DeviceNotFoundError`: mã 404 `DEVICE.NOT_FOUND` **chỉ do lát này sở hữu**; lát khác ném lại lớp này và map về đúng mã đó
  (mẫu `catalog/vendor/vendor.http-errors.ts:26-28`), không tạo lớp/mã riêng.

## Behavior and design

### Data (migration `<ts>_devices_registry_and_acknowledgement`, task A1)

```prisma
enum DeviceRegistrationEndCause { HOLDER_CHANGED DEVICE_RETIRED DEPARTURE EMPLOYEE_LEFT }
enum DeviceStopRequestState { OPEN COMPLETED INVALID }
enum DeviceStopInvalidReason { DUPLICATE ALREADY_STOPPED REGISTRATION_ENDED IT_ADMIN }
model ManagedDevice { // @@map("managed_devices"); id String @id @default(uuid(7)) @db.Uuid; mọi id/FK @db.Uuid
  id String @id; organizationId String; assetCode String; normalizedAssetCode String; hostname String; os String
  retiredAt DateTime? @db.Timestamptz(3); retirementReason String?; createdByAppUserId String
  createdAt DateTime @default(now()) @db.Timestamptz(3); updatedAt DateTime @updatedAt @db.Timestamptz(3)
  @@unique([organizationId, normalizedAssetCode]) }
model DeviceRegistration { // @@map("device_registrations")
  id String @id; organizationId String; deviceId String /* FK managed_devices */; holderEmployeeId String /* FK employees, Restrict */
  validFrom DateTime @db.Date; validUntil DateTime? @db.Date /* loại trừ */; endedAt DateTime? @db.Timestamptz(3)
  endCause DeviceRegistrationEndCause?
  acknowledgedFrom DateTime? @db.Timestamptz(3)    // đầu chuỗi xác nhận còn hiệu lực (hình chiếu)
  collectionStoppedAt DateTime? @db.Timestamptz(3) // dừng đã hoàn tất, chưa bật lại (hình chiếu)
  createdByAppUserId String; createdAt DateTime @default(now()) @db.Timestamptz(3)
  @@index([holderEmployeeId]); @@index([deviceId]) }
model DeviceSignatureRecord { id; organizationId; registrationId; documentId String @unique; noticeVersionId; signerEmployeeId
  recordedByAppUserId; recordedAt @default(now()) @@index([registrationId, recordedAt]) }            // append-only
model MonitoringNoticeVersion { id; organizationId; versionNumber Int; collected String; notCollected String; purpose String
  retention String; stopRight String; includesToolStatus Boolean; requiresReacknowledgement Boolean
  publishedByAppUserId; publishedAt @default(now()) @@unique([organizationId, versionNumber]) }    // append-only
model DeviceAcknowledgement { id; organizationId; registrationId; noticeVersionId; employeeId; appUserId
  acknowledgedAt @default(now()) @@index([registrationId, acknowledgedAt]) }                        // append-only
model DeviceStopRequest { id; organizationId; registrationId; requesterEmployeeId; requestedAt; dueAt DateTime?
  state DeviceStopRequestState; invalidReason DeviceStopInvalidReason?; invalidNote String?; handledByAppUserId String?
  handledAt DateTime?; selfHandled Boolean @default(false); overdueNoticedAt DateTime? @@index([state, dueAt]) }
```

SQL ngoài Prisma (cùng migration; `btree_gist` đã có từ `20261012092159_organization_foundation`):

```sql
ALTER TABLE device_registrations
  ADD CONSTRAINT device_registrations_no_overlap EXCLUDE USING gist
      (device_id WITH =, daterange(valid_from, valid_until, '[)') WITH &&),
  ADD CONSTRAINT device_registrations_end_complete CHECK ((valid_until IS NULL) = (ended_at IS NULL)
      AND (ended_at IS NULL) = (end_cause IS NULL) AND (valid_until IS NULL OR valid_until >= valid_from)),
  ADD CONSTRAINT device_registrations_one_projection CHECK (acknowledged_from IS NULL OR collection_stopped_at IS NULL);
CREATE UNIQUE INDEX device_registrations_one_open ON device_registrations (device_id) WHERE ended_at IS NULL;
ALTER TABLE managed_devices ADD CONSTRAINT managed_devices_retired_complete CHECK ((retired_at IS NULL) = (retirement_reason IS NULL));
ALTER TABLE device_stop_requests ADD CONSTRAINT device_stop_requests_outcome CHECK (
  (state = 'OPEN' AND handled_at IS NULL AND invalid_reason IS NULL AND due_at IS NOT NULL)
  OR (state = 'COMPLETED' AND handled_at IS NOT NULL AND handled_by_app_user_id IS NOT NULL AND invalid_reason IS NULL)
  OR (state = 'INVALID' AND handled_at IS NOT NULL AND invalid_reason IS NOT NULL
      AND (invalid_reason <> 'IT_ADMIN' OR invalid_note IS NOT NULL)));
CREATE UNIQUE INDEX device_stop_requests_one_open ON device_stop_requests (registration_id) WHERE state = 'OPEN';
CREATE FUNCTION device_registrations_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A device registration is never deleted'
     USING ERRCODE = '55000', CONSTRAINT = 'device_registrations_kept'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.device_id, NEW.holder_employee_id, NEW.valid_from, NEW.created_by_app_user_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.device_id, OLD.holder_employee_id, OLD.valid_from, OLD.created_by_app_user_id, OLD.created_at)
     OR (OLD.ended_at IS NOT NULL AND (NEW.ended_at, NEW.valid_until, NEW.end_cause) IS DISTINCT FROM (OLD.ended_at, OLD.valid_until, OLD.end_cause))
  THEN RAISE EXCEPTION 'A device registration keeps who and when, and ends once'
     USING ERRCODE = '55000', CONSTRAINT = 'device_registrations_fixed'; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER device_registrations_guard BEFORE UPDATE OR DELETE ON device_registrations FOR EACH ROW EXECUTE FUNCTION device_registrations_guard();
CREATE FUNCTION devices_append_only() RETURNS trigger AS $$ BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000'; END; $$ LANGUAGE plpgsql;
-- cho monitoring_notice_versions, device_acknowledgements, device_signature_records:
-- BEFORE UPDATE OR DELETE FOR EACH ROW + BEFORE TRUNCATE FOR EACH STATEMENT EXECUTE FUNCTION devices_append_only();
-- catalog: bản ký có chủ là người ký, không phải hợp đồng
ALTER TABLE document_attachments ADD COLUMN signer_employee_id uuid;
ALTER TABLE document_attachments DROP CONSTRAINT document_attachments_owner_state,
  DROP CONSTRAINT document_attachments_purpose_fits_owner;
ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_owner_state CHECK (
    (status = 'READY') = (contract_id IS NOT NULL OR signer_employee_id IS NOT NULL)
    AND (status = 'READY') = (attached_at IS NOT NULL) AND NOT (contract_id IS NOT NULL AND signer_employee_id IS NOT NULL)),
  ADD CONSTRAINT document_attachments_purpose_fits_owner CHECK (
    (contract_id IS NULL OR purpose IN ('CONTRACT_ATTACHMENT', 'PURCHASE_DOCUMENT'))
    AND (signer_employee_id IS NULL OR purpose = 'SIGNATURE_RECORD'));
```

CHECK cũ ở `prisma/migrations/20261020250000_catalog_contracts_and_documents/migration.sql:43-51`; trigger
`document_attachment_guard` không đổi (READY không sửa được nên `signer_employee_id` cố định sau khi gắn).

### Trạng thái thu thập (`devices-collection-state.policy.ts`)

`collectionStateOf({ retiredAt, registration })`: `RETIRED` · `UNREGISTERED` (không đăng ký mở) · `COLLECTION_STOPPED`
(`collection_stopped_at` ≠ NULL) · `ACTIVE` (`acknowledged_from` ≠ NULL) · `AWAITING_ACKNOWLEDGEMENT`. SQL list dùng cùng
`CASE`. Ghi hình chiếu trong transaction của sự kiện: xác nhận ⟹ `acknowledged_from = COALESCE(acknowledged_from, now)`,
`collection_stopped_at = NULL`; dừng hoàn tất (B) ⟹ `collection_stopped_at = now`, `acknowledged_from = NULL`; phát hành phiên
bản `requiresReacknowledgement = true` ⟹ mọi đăng ký mở `acknowledged_from = NULL` (`QĐ-62q`); bản chỉ sửa câu chữ không đổi gì.

### API (`/api/v1`; DTO `z.strictObject`; `{id}` uuid; 422 `VALIDATION_ERROR` mọi route có đầu vào)

| Mức | operationId · route · truy cập · status                                                                           | message                              |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| A   | `deviceCreate` · `POST /devices` · `@RequireRoles('IT_ADMIN')` · 201                                              | `DEVICE.REGISTERED`                  |
| A   | `deviceList` · `GET /devices` · IT_ADMIN                                                                          | `DEVICE.LISTED`                      |
| A   | `deviceGet` · `GET /devices/{id}` · IT_ADMIN                                                                      | `DEVICE.FETCHED`                     |
| B   | `deviceUpdate` · `PATCH /devices/{id}` · IT_ADMIN                                                                 | `DEVICE.UPDATED`                     |
| A   | `deviceHolderChange` · `POST /devices/{id}/holder-changes` · IT_ADMIN · 201                                       | `DEVICE.HOLDER_CHANGED`              |
| A   | `deviceRetire` · `POST /devices/{id}/retirements` · IT_ADMIN · 201                                                | `DEVICE.RETIRED`                     |
| A   | `deviceSignatureRecordCreate` · `POST /device-registrations/{id}/signature-records` · IT_ADMIN · 201              | `DEVICE_SIGNATURE_RECORD.RECORDED`   |
| A   | `monitoringNoticeCurrentGet` · `GET /monitoring-notices/current` · `@AuthenticatedOnly()`                         | `MONITORING_NOTICE.FETCHED`          |
| A   | `monitoringNoticeVersionCreate` · `POST /monitoring-notice-versions` · SUPER_ADMIN · 201                          | `MONITORING_NOTICE.PUBLISHED`        |
| A   | `myDeviceList` · `GET /me/devices` · AuthenticatedOnly                                                            | `MY_DEVICE.LISTED`                   |
| A   | `myDeviceAcknowledgementCreate` · `POST /me/device-registrations/{id}/acknowledgements` · AuthenticatedOnly · 201 | `DEVICE_ACKNOWLEDGEMENT.RECORDED`    |
| B   | `myDeviceHistoryList` · `GET /me/devices/{id}/history` · AuthenticatedOnly                                        | `MY_DEVICE.HISTORY_LISTED`           |
| B   | `myDeviceStopRequestCreate` · `POST /me/device-registrations/{id}/stop-requests` · AuthenticatedOnly · 201        | `DEVICE_STOP_REQUEST.RECEIVED`       |
| B   | `deviceStopRequestList` · `GET /device-stop-requests` · IT_ADMIN                                                  | `DEVICE_STOP_REQUEST.LISTED`         |
| B   | `deviceStopRequestComplete` · `POST /device-stop-requests/{id}/completions` · IT_ADMIN · 201                      | `DEVICE_STOP_REQUEST.COMPLETED`      |
| B   | `deviceStopRequestCloseInvalid` · `POST /device-stop-requests/{id}/invalid-closures` · IT_ADMIN · 201             | `DEVICE_STOP_REQUEST.CLOSED_INVALID` |

**Request fields** (tổ chức, người thao tác, thời điểm, trạng thái, người ký = holder: server suy ra — F-2):

| Mức | route · field                                                           | kiểu & ràng buộc                                                   | bắt buộc (ca vắng)           | nguồn                     | dùng ở                                           |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- | ------------------------- | ------------------------------------------------ |
| A   | POST devices `assetCode`                                                | trim 1–60; duy nhất theo `searchKey` trong tổ chức                 | có                           | IT Admin (nhãn tài sản)   | 09-01 AC-1, AC-3; port K4 `findDeviceByAssetTag` |
| A   | `hostname`                                                              | trim 1–63                                                          | có                           | IT Admin                  | 09-01 AC-1, AC-12                                |
| A   | `os`                                                                    | trim 1–60                                                          | có                           | IT Admin                  | 09-01 AC-1                                       |
| A   | `holderEmployeeId`                                                      | uuid; nhân viên `ACTIVE` và `workState ∈ {WORKING, ON_LONG_LEAVE}` | có                           | IT Admin chọn             | 09-01 AC-1, AC-5, AC-9                           |
| A   | `handedOverOn`                                                          | ngày `YYYY-MM-DD`, ≤ hôm nay (TZ tổ chức), ≥ `hireDate`            | không — vắng: hôm nay        | IT Admin (ngày bàn giao)  | 09-01 AC-1 (_từ 01/09_)                          |
| A   | holder-changes `holderEmployeeId`                                       | như trên; khác người giữ hiện tại                                  | có                           | IT Admin                  | 09-01 AC-10; 09-08 AC-7 (đăng ký lại)            |
| A   | retirements `reason`                                                    | trim 1–1000                                                        | có                           | IT Admin                  | Audit; DESIGN §3                                 |
| A   | signature-records `documentId`                                          | uuid tệp `SIGNATURE_RECORD` `PENDING_ATTACH` do chính IT Admin tải | có                           | IT Admin (vừa tải lên)    | 09-03 AC-7, AC-10; `QĐ-66ad`                     |
| A   | signature-records `noticeVersionId`                                     | uuid phiên bản đã phát hành của tổ chức                            | có                           | IT Admin (bản in `BM-06`) | 09-03 AC-7 (bản ký kèm phiên bản — L8)           |
| A   | notice `collected`, `notCollected`, `purpose`, `retention`, `stopRight` | trim 1–4000 mỗi trường                                             | có                           | Super Admin               | 09-03 AC-5, AC-11                                |
| A   | notice `includesToolStatus`                                             | boolean                                                            | có                           | Super Admin               | 09-03 AC-11; cổng ảnh chụp S2a (`QĐ-101e`) — O-2 |
| A   | notice `requiresReacknowledgement`                                      | boolean                                                            | có                           | Super Admin               | 09-03 AC-3, AC-8 (`QĐ-62q`)                      |
| A   | acknowledgements `noticeVersionId`                                      | uuid = phiên bản hiện hành                                         | có                           | nhân viên (màn đã đọc)    | 09-03 AC-1; 09-04 AC-11; chống xác nhận bản cũ   |
| A   | GET devices `search`                                                    | trim 1–100; khớp `assetCode`/`hostname` qua `searchKey`            | không — vắng: không lọc      | IT Admin                  | màn sổ                                           |
| A   | GET devices `holderEmployeeId`                                          | uuid                                                               | không — vắng: mọi người      | IT Admin                  | 09-01 AC-5                                       |
| A   | GET devices `state`                                                     | enum 5 giá trị của `collectionStateOf`                             | không — vắng: mọi trạng thái | IT Admin                  | 09-01 AC-2, 09-03 AC-9 (máy chưa xác nhận)       |
| A   | mọi list `page`, `pageSize`                                             | int ≥ 1; `pageSize` ≤ 100 (`/me/devices` ≤ 50)                     | không — 1 / 20               | client                    | API-LIST-DETAIL.1                                |
| B   | PATCH `assetCode?`, `hostname?`, `os?`                                  | như POST; ít nhất một                                              | không — vắng: giữ nguyên     | IT Admin                  | 09-01 AC-4 (sửa)                                 |
| B   | PATCH `reason`                                                          | trim 1–1000                                                        | có                           | IT Admin                  | Audit before/after                               |
| B   | stop-requests body `{}`                                                 | —                                                                  | —                            | —                         | 09-04 AC-1                                       |
| B   | invalid-closures `reason`                                               | trim 1–1000                                                        | có                           | IT Admin                  | 09-04 AC-6                                       |
| B   | GET stop-requests `state`                                               | `OPEN`·`COMPLETED`·`INVALID`                                       | không — vắng: `OPEN`         | IT Admin                  | 09-04 AC-3, AC-5                                 |

```ts
const text = (max: number) => z.string().trim().min(1).max(max);
export const deviceCreateBodySchema = z.strictObject({
  assetCode: text(60),
  hostname: text(63),
  os: text(60),
  holderEmployeeId: z.uuid(),
  handedOverOn: businessDateSchema('handedOverOn must be a date').optional(),
});
export const holderChangeBodySchema = z.strictObject({ holderEmployeeId: z.uuid() });
export const retirementBodySchema = z.strictObject({ reason: text(1000) });
export const signatureRecordBodySchema = z.strictObject({ documentId: z.uuid(), noticeVersionId: z.uuid() });
export const noticeVersionBodySchema = z.strictObject({
  collected: text(4000),
  notCollected: text(4000),
  purpose: text(4000),
  retention: text(4000),
  stopRight: text(4000),
  includesToolStatus: z.boolean(),
  requiresReacknowledgement: z.boolean(),
});
export const acknowledgementBodySchema = z.strictObject({ noticeVersionId: z.uuid() });
```

**Response** (bọc envelope; Date → ISO; `holder` = `{ id, employeeCode, fullName }` đọc lô qua `OrganizationReadApi.getEmployees`):

| Mức | schema · field                                                                                                                                                                                                                                                                                                                                                                       | tiêu thụ                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| A   | `DeviceSummary`: `id`, `assetCode`, `hostname`, `os`, `holder\|null`, `registrationId\|null`, `registeredFrom\|null`, `state`, `signatureRecorded`, `retiredAt\|null`                                                                                                                                                                                                                | màn sổ; 09-01 AC-1, AC-5; nút "tạo mã" S1b cần `registrationId` + `signatureRecorded` (09-01 AC-13) |
| A   | `DeviceDetail` = summary + `acknowledgedFrom\|null`, `latestAcknowledgement {noticeVersionNumber, acknowledgedAt}\|null`, `latestSignatureRecord {id, documentId, noticeVersionNumber, recordedAt}\|null`, `lastEnd {holder, validUntil, endedAt, endCause}\|null`, `retirementReason\|null`                                                                                         | 09-03 AC-1, AC-7, AC-10; 09-08 AC-1, AC-7                                                           |
| B   | `DeviceDetail.openStopRequest {id, requestedAt, dueAt}\|null`                                                                                                                                                                                                                                                                                                                        | 09-04 AC-3                                                                                          |
| A   | `SignatureRecord`: `id`, `registrationId`, `documentId`, `noticeVersionNumber`, `recordedAt`                                                                                                                                                                                                                                                                                         | 09-03 AC-7                                                                                          |
| A   | `MonitoringNotice`: `id`, `versionNumber`, 5 mục, `includesToolStatus`, `requiresReacknowledgement`, `publishedAt`                                                                                                                                                                                                                                                                   | 09-03 AC-1 (id để xác nhận), AC-5, AC-11                                                            |
| A   | `MyDevice`: `registrationId`, `deviceId`, `assetCode`, `hostname`, `os`, `validFrom`, `endedAt\|null`, `acknowledgementState` (`UNACKNOWLEDGED`·`ACKNOWLEDGED`·`STOPPED`·`ENDED`), `acknowledgedVersionNumber\|null`, `signatureRecorded`, `canAcknowledge`, `blockedReason` (`SIGNATURE_RECORD_MISSING`·`NOTICE_NOT_PUBLISHED`·`REGISTRATION_ENDED`·`ALREADY_ACKNOWLEDGED`)`\|null` | 09-01 AC-12; 09-03 AC-10 (nút khóa + lý do); 09-04 AC-11                                            |
| B   | `MyDevice.stopRequest {id, state, requestedAt, handledAt\|null, invalidReason\|null}\|null`                                                                                                                                                                                                                                                                                          | 09-04 AC-1, AC-10                                                                                   |
| A   | `Acknowledgement`: `id`, `registrationId`, `noticeVersionNumber`, `acknowledgedAt`                                                                                                                                                                                                                                                                                                   | 09-03 AC-1                                                                                          |
| B   | `MyDeviceHistoryItem`: `kind`, `at`, `registrationId`, `noticeVersionNumber\|null`, `documentId\|null`, `invalidReason\|null`, `endCause\|null`                                                                                                                                                                                                                                      | `FR-10.1`; 09-03 AC-7                                                                               |
| B   | `StopRequestSummary`: `id`, `registrationId`, `device {id, assetCode, hostname}`, `requester`, `requestedAt`, `dueAt\|null`, `overdue`, `state`, `handledAt\|null`, `handledBy {id, fullName}\|null`, `invalidReason\|null`, `invalidNote\|null`, `selfHandled`                                                                                                                      | 09-04 AC-1→AC-7, AC-10                                                                              |

Không trường IP, URL, credential ở bất kỳ schema nào (09-01 AC-6 kiểm ở S1b).

**Response theo operation** (`data` phẳng, không bọc khóa — cùng quy ước `IssuedDeviceCredential` của S1b; demo T1 đọc
`data.id`, `data.registrationId`): `deviceCreate`/`deviceGet`/`deviceUpdate`/`deviceHolderChange`/`deviceRetire` ⟹ `DeviceDetail`;
`deviceList` ⟹ `{ items: DeviceSummary[], pagination }`; `deviceSignatureRecordCreate` ⟹ `SignatureRecord`;
`monitoringNoticeVersionCreate`/`monitoringNoticeCurrentGet` ⟹ `MonitoringNotice`; `myDeviceList` ⟹ `{ items: MyDevice[],
pagination }`; `myDeviceAcknowledgementCreate` ⟹ `Acknowledgement`; (B) `myDeviceStopRequestCreate` ⟹ `MyDevice.stopRequest`
(`{ id, state, requestedAt, handledAt, invalidReason }`); `deviceStopRequestList` ⟹ trang `StopRequestSummary`;
`completions`/`invalid-closures` ⟹ `StopRequestSummary`; `myDeviceHistoryList` ⟹ trang `MyDeviceHistoryItem`.

**Collection.** `deviceList`: summary riêng, thứ tự `normalized_asset_code, id`, đếm + trang cùng `RepeatableRead`, holder đọc lô
một lần/trang, `signatureRecorded` bằng `EXISTS`; `deviceGet` = `summary.extend`. `myDeviceList`: các đăng ký có `holder =
principal.employeeId`, thứ tự `ended_at NULLS FIRST, valid_from DESC, id`. B: history `UNION ALL` theo `at DESC, kind, source_id`;
stop-requests `OPEN` theo `requested_at, id`, còn lại `handled_at DESC, id`. Không mảng lồng. Thêm vào
`test/support/api-collection-registry.ts`; số câu lệnh hằng theo cỡ trang (`test/support/query-count.ts`).

### Luật, lỗi (một mã ↔ một status), Audit

- Đăng ký (A): người giữ không có ⟹ 422 `DEVICE.HOLDER_NOT_FOUND`; `TERMINATED` hoặc `workState ∈ {HANDING_OVER, LEFT}` ⟹ 409
  `DEVICE.HOLDER_NOT_WORKING` (09-01 AC-9; O-3); mã tài sản trùng ⟹ 409 `DEVICE.ASSET_CODE_TAKEN`; đua (`23P01` của
  `no_overlap` / `23505` của `one_open`) ⟹ 409 `DEVICE.REGISTRATION_OVERLAP` (09-01 AC-3); `handedOverOn` ngoài khoảng ⟹ 422
  `DEVICE.HANDOVER_DATE_INVALID`; máy ngừng dùng ⟹ 409 `DEVICE.ALREADY_RETIRED`; cùng người giữ ⟹ 409 `DEVICE.HOLDER_UNCHANGED`; 404
  `DEVICE.NOT_FOUND`, `DEVICE_REGISTRATION.NOT_FOUND` (cũng là câu trả lời khi `/me/…/{id}` không phải của người gọi — 09-03
  AC-4, 09-04 AC-4). Không có đường đăng ký máy cá nhân/dùng chung (09-01 AC-7, AC-8).
- `holder-changes` hiệu lực **ngay** (M7): kết thúc đăng ký mở (`HOLDER_CHANGED`), tạo đăng ký mới `valid_from = hôm nay`,
  `AWAITING_ACKNOWLEDGEMENT`. Máy không có đăng ký mở ⟹ chỉ tạo mới (đăng ký lại — `QĐ-100z`). `retirements`: kết thúc đăng
  ký mở (`DEVICE_RETIRED`), ghi `retired_at`, `retirement_reason`.
- **Kết thúc đăng ký** (một service `registry/registration-end.service.ts`, A): `ended_at = at` (hoặc đầu ngày `afterDay + 1`
  theo TZ, B), `valid_until = max(valid_from, businessDateAt(ended_at, tz))`, Audit `DEVICE_REGISTRATION.ENDED`; S1b chèn thu hồi
  credential ở đây; B chèn tự đóng yêu cầu dừng `OPEN` (`INVALID`/`REGISTRATION_ENDED`). Không có đường mở lại.
- Bản ký (A): đăng ký phải mở (409 `DEVICE_REGISTRATION.ENDED`); phiên bản không có ⟹ 422
  `DEVICE_SIGNATURE_RECORD.NOTICE_VERSION_NOT_FOUND`; gọi `CatalogApi.attachSignatureRecord(tx, actor, { documentId,
signerEmployeeId })` — giữ mã catalog có sẵn (`DOCUMENT.NOT_FOUND` 404 kể cả tệp người khác tải, `DOCUMENT.ALREADY_ATTACHED`/
  `NOT_READY_TO_ATTACH` 409) + mới 422 `DOCUMENT.PURPOSE_MISMATCH` (không phải `SIGNATURE_RECORD`; `documentAttach` vào hợp đồng
  cũng trả mã này cho `SIGNATURE_RECORD`).
- Catalog (A): `contract.policy.ts:38,53` cho `SIGNATURE_RECORD` qua `assertPurposeAvailable`; `mayOpen` (`:122`) nhận thêm
  `purpose`, `signerEmployeeId`, `actorEmployeeId`: bản ký `READY` mở cho IT_ADMIN, **Finance ⟹ `FORBIDDEN`** (403
  `AUTHORIZATION.FORBIDDEN`). B: `documentGet`/`documentLink` (`documents.controller.ts:190-216`) đổi `@RequireRoles('IT_ADMIN',
'FINANCE')` → `@AuthenticatedOnly()` để chính người ký mở được (09-03 AC-7, O-1); tệp hợp đồng giữ luật cũ (người khác 403).
- Thông báo (A): `includesToolStatus` từ `false` (bản hiện hành) sang `true` mà `requiresReacknowledgement = false` ⟹ 422
  `MONITORING_NOTICE.REACKNOWLEDGEMENT_REQUIRED` (09-03 AC-11); chưa có bản ⟹ `GET current` 404 `MONITORING_NOTICE.NOT_PUBLISHED`.
  `versionNumber = max + 1` dưới `pg_advisory_xact_lock(hashtext('monitoring-notice:' || org))`.
- Xác nhận (A; chỉ chính holder, người khác ⟹ 404): đăng ký kết thúc ⟹ 409 `DEVICE_REGISTRATION.ENDED`; chưa có bản ký ⟹ 409
  `DEVICE_REGISTRATION.SIGNATURE_RECORD_MISSING`; không phải bản hiện hành ⟹ 409 `DEVICE_ACKNOWLEDGEMENT.NOTICE_NOT_CURRENT`; đang
  `ACTIVE` ⟹ 409 `DEVICE_ACKNOWLEDGEMENT.ALREADY_ACKNOWLEDGED`. Sau `COLLECTION_STOPPED`, xác nhận mới = bật lại, không cần bản ký
  mới (09-04 AC-11).
- Yêu cầu dừng (B): đăng ký kết thúc ⟹ 409 `DEVICE_REGISTRATION.ENDED`; đang `COLLECTION_STOPPED` ⟹ dòng `INVALID`
  `ALREADY_STOPPED`; đã có `OPEN` ⟹ dòng `INVALID` `DUPLICATE` (201, 09-04 AC-10); còn lại `OPEN`, `due_at` = `requested_at` +
  N ngày làm việc (tham số mới `DEVICE_STOP_REQUEST_WORKING_DAYS`, 1–30, mặc định 2). `completions`: chỉ `OPEN` (409
  `DEVICE_STOP_REQUEST.NOT_OPEN`), `selfHandled = handler.employeeId = requester` (AC-7). `invalid-closures`: chỉ khi yêu cầu
  không hợp lệ theo `judgeStopRequestValidity`, nếu không 409 `DEVICE_STOP_REQUEST.REQUEST_VALID` (AC-6, O-4); 404
  `DEVICE_STOP_REQUEST.NOT_FOUND`. Sweeper SLA `stop-request/stop-request.job.ts` (mỗi giờ, `FOR UPDATE SKIP LOCKED`, đặt
  `overdue_noticed_at`, inbox `DEVICE_STOP_REQUEST_OVERDUE` tới `OrganizationReadApi.getItAdminInCharge`, `eventKey`
  `device-stop-overdue:<id>`, lỗi qua `describeForOperator`) — đăng ký ở `docs/rules/security-jobs.md`.
- Audit (key before/after **không** khớp `/pass|hash|token|secret|cookie|credential|authorization|pepper/i` — `audit.api.ts:8`):
  `DEVICE.REGISTERED|UPDATED|HOLDER_CHANGED|RETIRED`, `DEVICE_REGISTRATION.ENDED`, `DEVICE_SIGNATURE_RECORD.RECORDED`,
  `MONITORING_NOTICE.PUBLISHED`, `DEVICE_ACKNOWLEDGEMENT.RECORDED`, `DEVICE_STOP_REQUEST.*` (B).

**Khóa.** (hồ sơ personnel) → `managed_devices FOR UPDATE` → `device_registrations FOR UPDATE` → (S1b `device_credentials`).
Xác nhận: đăng ký `FOR UPDATE` rồi đọc bản hiện hành. Phát hành: advisory lock → insert → reset đăng ký mở theo `ORDER BY id FOR
UPDATE`. Port K4 (B) khóa đăng ký `FOR SHARE` sau khóa của licensing.

### Nối `MF-2` (`QĐ-96j`, `QĐ-100q`, `QĐ-100z`)

- A: `personnel/offboarding/device-registration.listener.ts` thêm `PersonnelFileHook` với `onLeft` (mẫu
  `personnel/role-duties/role-duties.listener.ts:45`; gọi ở `offboarding-left.service.ts:80`) ⟹ `DevicesApi.endRegistrationsOfHolder(tx,
{ employeeId, end: { at: now }, cause: 'EMPLOYEE_LEFT' })` — phủ nghỉ đột ngột và _đã nghỉ việc_ (09-08 AC-3).
- B: hết ngày làm việc cuối (09-08 AC-1, AC-6): sweeper `registry/registration-departure.job.ts` mỗi giờ đọc
  `IdentityAccessApi` (dòng `employee_access_blocks`, `blocked_from <= today`) cho holder của đăng ký mở ⟹ `end: { afterDay:
blocked_from − 1 }`, `DEPARTURE`; _chặn ngay_ cùng đường (`blocked_from = today`). Không chờ sweeper để từ chối thiết bị: S1b
  đọc cùng dòng chặn khi xác thực. Hủy bàn giao không mở lại đăng ký (09-08 AC-7); điều chuyển phòng không chạm (AC-4).

### `DeviceRegistryPort` (B; A-05 Q1–Q8)

`DeviceRegistryHook extends Hook<DeviceRegistryPort>` ở `licensing/public/licensing.extension-points.ts`; kiểu port
(`licensing/device-binding/device-binding.types.ts:13-74`) chuyển sang `licensing/public/`; `devices/registry/device-registry-port.listener.ts`
bind (`ACTIVE`→`CONFIRMED`, `COLLECTION_STOPPED`→`STOPPED`, còn lại `UNCONFIRMED`). Q1 Hook; Q2 `requireAcknowledgement = false`;
Q5 kéo; Q6 `assetCode` duy nhất; Q7 catalog giữ tệp; Q3/Q4/Q8 giữ mặc định A-05.

### Câu hỏi mở (mặc định đang dùng)

- **O-1** `US-04-04` AC-8 trùng `US-09-03` AC-7; đề xuất chuyển AC-8 về lát này, `a05-bm06-signature-record` → `superseded`.
  Mặc định: chỉ claim `US-09-03` AC-7.
- **O-2** `includesToolStatus` không có trong body DESIGN §3 nhưng cần cho cổng ảnh chụp S2a (`QĐ-101e`) và để chặn 09-03 AC-11;
  mặc định: thêm.
- **O-3** Người `HANDING_OVER` không nhận đăng ký mới — mặc định từ chối.
- **O-4** Yêu cầu `OPEN` luôn hợp lệ theo cấu trúc; IT chỉ đóng _không hợp lệ_ khi `judgeStopRequestValidity` nói vậy.
- **O-5** BRD 7.5: bản ký/xác nhận xóa cùng dữ liệu; H7 `INSERT, SELECT` phải nới ở `g7-usage-downstream-retention`.

## Test matrix

Ca chi tiết ở [test-plan](test-plan.md) (TP-xx), gồm chống field ma.

| AC / rủi ro                         | Tình huống                                 | Cấp test       | Kết quả mong đợi                 | Bằng chứng sau implement |
| ----------------------------------- | ------------------------------------------ | -------------- | -------------------------------- | ------------------------ |
| 09-01, 09-03 (A)                    | TP-01→TP-14                                | unit/int/http  | như test-plan                    | planned                  |
| 09-04, 09-08 AC-1/AC-6, port K4 (B) | TP-20→TP-27                                | unit/int/http  | như test-plan                    | planned                  |
| Field ma                            | request/response devices so với bảng field | http (OpenAPI) | thêm field ⟹ đỏ tới khi sửa spec | planned                  |

## Definition of Done

- [ ] Mọi AC/vế primary của mức đã giao có test đỏ-trước/xanh-sau; vế sibling ghi đúng chủ; mức B ghi rõ nếu chưa làm.
- [ ] Bộ kiểm nhanh xanh; test theo file của `test/integration/devices/*`, `test/http/devices/*`, catalog documents.
- [ ] `tiers.cjs` + bảng tầng, `PRISMA_MODEL_OWNER`, H7, `api-coverage-manifest`, `openapi-example-route-codes-devices.ts`,
      `api-collection-registry`, `devices/README.md`, `catalog`/`personnel` README, `routes.md`/`module-graph.md` sinh lại.
- [ ] Báo FE: 11 operation mức A; mức B sau demo; `documentGet`/`documentLink` đổi truy cập ở B.

## Changes and acceptance

05/11/2026 (Claude): spec `ready` từ DESIGN.md; bản dở của agent trước được sửa: thêm mức A/B; sửa CHECK
`document_attachments_owner_state`/`purpose_fits_owner` (bản cũ bỏ sót — READY bắt buộc có `contract_id`); `tiers.cjs:8`;
message `*.FETCHED` theo quy ước; nối `MF-2` qua `PersonnelFileHook.onLeft` thay vì sửa `leaveInTx`; `valid_to` → `valid_until`
(loại trừ). Lệch DESIGN: O-2; `GET /me/devices/{id}/history` ở đây (B); detail không có credential (S1b có `…/credentials`).
Chưa review, chưa nghiệm thu.

05/11/2026 (Claude, lượt đồng bộ chéo — [ALIGNMENT](../../../reviews/g7-usage-design-2026-11-05/ALIGNMENT-2026-11-05.md)): thêm
facade đọc `deviceExists`/`holderRegistrationIds` và `DeviceNotFoundError` công khai mà S2a dùng (S1a là chủ duy nhất của 404
`DEVICE.NOT_FOUND`); ghi response theo operation (`data` phẳng) cho demo T1; `includesToolStatus` (O-2) là đầu vào của
`getIntakeContext` (S1b) và cổng ảnh chụp (S2a); thứ tự migration S1a → S1b → S2a; tầng `devices` = T5 khớp `tiers.cjs:8`.

05/11/2026 (Claude Code, Đợt 1 bước 14): mức A `verified-local` (chưa review, chưa nghiệm thu, chưa kiểm trên CI). Đã làm A1→A6: migration
`20261107000000_devices_registry_and_acknowledgement`, module `devices`, 10 operation mức A (`deviceCreate`, `deviceList`, `deviceGet`,
`deviceHolderChange`, `deviceRetire`, `deviceSignatureRecordCreate`, `monitoringNoticeVersionCreate`, `monitoringNoticeCurrentGet`,
`myDeviceList`, `myDeviceAcknowledgementCreate`) và nối `onLeft`. Lệch spec: (1) bảng API ghi "11 operation mức A" nhưng bảng chỉ có 10 dòng
mức A — đã làm đủ 10; (2) không khai FK tới `organizations` cho 6 bảng mới (cột `organization_id` là giá trị uuid), chỉ FK `device_id`,
`holder_employee_id`, `registration_id`, `notice_version_id`; (3) `document_id` của bản ký không có FK sang `document_attachments`
(catalog giữ tệp, bản ký chỉ gọi tên); (4) `documentGet`/`documentLink` mở bản ký cho IT Admin, Finance 403 (mức A); phần cho chính người ký mở
là mức B; (5) TP-08: khóa máy `FOR UPDATE` trước đăng ký (đúng thứ tự khóa của spec) nên hai `holder-changes` song song cho cùng một người
trả 201 + 409 `DEVICE.HOLDER_UNCHANGED`; `DEVICE.REGISTRATION_OVERLAP` chỉ còn khi ngày bàn giao lùi chồng lên lịch sử; (6) khóa phát hành
thông báo khóa MỌI đăng ký mở (không chỉ đăng ký đã xác nhận) để một xác nhận chưa commit không lọt qua lần xóa — test đua đỏ trước, xanh sau;
(7) `CatalogApi.attachSignatureRecord` ném `DocumentAttachRefusedError` (public) thay vì lỗi riêng của catalog; devices ánh xạ về các mã
`DOCUMENT.*` đã có. Câu hỏi mở O-1…O-5 giữ mặc định như đã ghi.
