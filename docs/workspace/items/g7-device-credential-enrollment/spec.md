# Spec: g7-device-credential-enrollment — mã đăng ký một lần, credential thiết bị, `@DeviceAuthenticated()`, phiên, xoay vòng, thu hồi

- Phụ trách: Cursor/dev được Owner giao.
- Thiết kế ban đầu bởi: Owner + Claude (phiên 05/11/2026).
- Thiết kế: `ready`. Owner review: thiết kế đã duyệt 05/11/2026 (DESIGN.md); spec chưa review.
- Nguồn: Docs `3d73a7f` + thay đổi chưa commit 05/11/2026 (`QĐ-101`, BRD v4.1, US đã sửa) — `EP-09.md` (`US-09-01` AC-13,
  `US-09-05` AC-13, `US-09-08`, `US-09-09` AC-5); `QĐ-32c`, `QĐ-96j`, `QĐ-100q`, `QĐ-100z`, `QĐ-101g`. BE `3e4553b9`; code đối
  chiếu ở `808318a4`.
- Nhóm roadmap: G7 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · [Test plan](test-plan.md) · [DESIGN.md](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md)
  §0, §1, §2.1–§2.3, §3 (mã, credential), §7, §11, §12 (S1b). Lát trước: [`g7-device-registry-acknowledgement`](../g7-device-registry-acknowledgement/spec.md).

## Business outcome

IT Admin tạo mã đăng ký một lần cho máy đã lưu `BM-06`; collector/tiện ích đổi mã lấy credential `Bearer sstd_<id>_<secret>`,
đọc phiên (trạng thái, cửa sổ nhận), xoay vòng; credential bị thu hồi ngay khi IT thu hồi hoặc đăng ký kết thúc. Kiểm bằng HTTP:
token đúng ⟹ 200; sai/thu hồi/hết hạn ⟹ 401 với mã riêng; token người dùng không mở route thiết bị và ngược lại.

**Mức ưu tiên (Owner 05/11 chiều).** Toàn bộ A trừ: thu hồi theo **hết ngày làm việc cuối** được ghi thành dòng (B, cùng sweeper
S1a B3), test _dừng giữ credential_ (B, chờ yêu cầu dừng S1a B1), `acceptUntilAt` theo lịch chặn tương lai (B). A là logic thật.

## Sizing decision

- Container: G7 (DESIGN.md §12 lát S1b).
- Mode: `grouped-stories`.
- Outcome and owner: danh tính thiết bị — cấp, xác thực, xoay vòng, thu hồi credential; module `devices`, capability
  `credential` (nhóm `enrollment/`, `session/`); hạ tầng `src/infrastructure/security/` (khai báo truy cập thứ tư).
- Boundaries: 3 bảng mới + giá trị `DEVICE` của `AuditActorKind`; 6 operation HTTP; một guard + một tracker throttle; nối vào
  `registration-end.service.ts` của S1a.
- Not larger: cổng nhận lô/ảnh chụp/allowlist (`g7-ai-usage-intake`, `g7-browser-usage-intake`).
- Not smaller: mã, credential, xác thực và thu hồi là một ranh giới bảo mật; tách thì có credential không thu hồi được hoặc route
  không xác thực được.
- Siblings: `g7-device-registry-acknowledgement` (trước), `g7-ai-usage-intake`, `g7-browser-usage-intake`,
  `qd96-100-departure-day-access-block`.
- Scope map: [G7](../../../roadmap.md#work-item-decomposition-g7).

## Primary Story/AC

| Story    | AC                                                                                           | Coverage | Phần còn lại thuộc                                                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-09-01 | AC-11, AC-13; vế _credential/phiên không lưu IP_ của AC-6; vế _credential thu hồi_ của AC-10 | partial  | AC-1, AC-3→AC-5, AC-7→AC-9, AC-12 và vế đăng ký của AC-10: `g7-device-registry-acknowledgement`; AC-2, vế _dữ liệu nhận_ của AC-6, vế _dữ liệu bị từ chối_ của AC-10: `g7-ai-usage-intake` |
| US-09-05 | vế _credential_ của AC-13 (thiếu/thu hồi/hết hạn ⟹ từ chối, không lùi đăng nhập; 429)        | partial  | AC-1→AC-12, AC-14, vế _ảnh chụp_ của AC-13: `g7-ai-usage-intake`, `g7-browser-usage-intake`                                                                                                |
| US-09-08 | AC-2, AC-5; vế _credential_ của AC-1, AC-3, AC-6, AC-7                                       | partial  | AC-4 và vế _đăng ký_ của AC-1, AC-3, AC-6, AC-7: `g7-device-registry-acknowledgement`                                                                                                      |
| US-09-04 | vế _credential được giữ_ của AC-12                                                           | partial  | AC-1→AC-11: `g7-device-registry-acknowledgement`; vế _cổng từ chối_ của AC-12: `g7-ai-usage-intake`; vế _collector xóa hàng đợi_: workstream tool                                          |
| US-09-09 | vế _máy chủ báo_ của AC-5 (phiên `COLLECTION_STOPPED`, 401 `DEVICE.CREDENTIAL_REVOKED`)      | partial  | AC-2, AC-4, AC-6, AC-8→AC-10: `g7-ai-usage-intake`; vế _collector xóa credential/hàng đợi_ của AC-5: workstream tool                                                                       |

## Size exception

- Cohesion: một credential thiết bị — mọi Story trên chỉ claim vế _credential_ (cấp, xác thực, thu hồi, giữ khi dừng).
- Why not split: mỗi vế là một nhánh của cùng `DeviceCredentialVerifier` và `revokeAllOfRegistration`; tách theo Story nhân bản test ma trận 401.
- Checkpoints: Phase A1 (migration, hạ tầng xác thực) → A2 (mã, enroll, phiên, xoay, thu hồi) → B ([plan](plan.md)).
- Maximum scope: không nhận lô/ảnh chụp, không allowlist, không màn `US-09-07`; không route ngoài bảng API.
- Accepted by: Owner — ranh giới S1b duyệt 05/11/2026 (DESIGN.md §12); ngoại lệ chờ Owner xác nhận khi review spec.

## Supporting references

`ADR-13` (lược đồ chặt), `INV-17`, `FR-4.18`, BRD 7.7.7 `ĐK-01…10`; `US-09-06`; `QĐ-28b`. DESIGN §8 (thay đổi phía tool:
`Idempotency-Key`, map `error.code`).

## Explicit out of scope

`POST /ai-usage-batches`, `/ai-tool-status-snapshots`, `/browser-usage-batches`, `intake_rejections`; lúc nào gọi
`recordAccepted` (S2a quyết; ở đây có cột + hàm facade); `allowlist` của phiên (`g7-ai-usage-intake` thêm cùng
`CollectorAllowlistHook`) và `activityThresholdMinutes` (`g7-browser-usage-intake`) — thêm field, không phá hợp đồng; `403
DEVICE.NOT_ACKNOWLEDGED|COLLECTION_STOPPED|TOOL_STATUS_NOT_ACKNOWLEDGED` (cổng nhận, S2a sở hữu); ADR mới cho kênh xác thực
thứ hai (ghi ở `docs/adr/` trong task A1 nếu Owner muốn — câu hỏi mở O-4).

## Dependencies and blockers

- S1a Task A1 (migration), A2 (`registration-end.service.ts`), A5 (bản ký) phải xong trước.
- Chặn theo ngày cuối: Phần A của `qd96-100-departure-day-access-block` cần mở `IdentityAccessApi.isAccessBlocked(employeeId,
now)` (đọc `employee_access_blocks`, `blocked_from <= today` theo TZ). Chưa có ⟹ verifier chỉ xét `employees.status =
TERMINATED`; 09-08 AC-1/AC-6 chưa đạt — ghi khi demo.

## Ownership: module, data, API

- `src/modules/devices/credential/` — `credential.repo.ts` (SQL trên bảng devices, kể cả join `device_registrations`,
  `device_signature_records`), `credential.policy.ts` (định dạng, băm, xoay vòng — thuần), `credential-verifier.service.ts`
  (bind `DEVICE_CREDENTIAL_VERIFIER`), `credential-revocation.service.ts` (S1a `registry` gọi), `credential.controller.ts`
  (IT: mã, danh sách, thu hồi), `enrollment/` (`device-enrollment.controller.ts`, `credential-enrollment.service.ts`),
  `session/` (`device-session.controller.ts`, `credential-session.service.ts`). `credential` không import `registry` (S1a
  `registry` → `credential`).
- Hạ tầng (`src/infrastructure/security/`): `decorators/device-authenticated.decorator.ts`, `tokens/device-credential-verifier.port.ts`,
  `models/current-device.ts`, `guards/device-authentication.guard.ts`, `guards/credential-throttler.guard.ts`; sửa
  `guards/access-declaration.guard.ts:61-65`, `guards/authentication.guard.ts:105-109`, `security.module.ts:51-75`,
  `src/app/app.module.ts:52`, `src/app/configure-application.ts:70`.
- `audit`: `AuditActorKind` thêm `DEVICE` (`prisma/models/audit.prisma:1-5`, `audit/public/audit.types.ts:1`,
  `audit/audit-event.dto.ts:52` — đổi enum response của Audit Trail, báo FE).
- `PRISMA_MODEL_OWNER` + 3 model → `devices`; H7: `device_enrollment_uses` = `['INSERT', 'SELECT']`.

## Behavior and design

### Data (migration `<ts>_devices_credentials`, task A1; `ADD VALUE` ở migration riêng đi trước)

```prisma
enum DeviceCollectorKind { AI_COLLECTOR BROWSER_EXTENSION }
enum DeviceCredentialRevocationCause { IT_ADMIN REGISTRATION_ENDED }
model DeviceEnrollmentCode { // @@map("device_enrollment_codes"); id uuid(7); mọi id @db.Uuid; thời điểm Timestamptz(3)
  id String @id; organizationId String; registrationId String /* FK device_registrations */
  collectorKind DeviceCollectorKind; codeHash String @unique; maxUses Int; uses Int @default(0)
  expiresAt DateTime; createdByAppUserId String; createdAt DateTime @default(now()) @@index([registrationId]) }
model DeviceEnrollmentUse { // @@map("device_enrollment_uses"), append-only
  id String @id; codeId String /* FK */; idempotencyKeyHash String; credentialId String @unique /* FK */
  usedAt DateTime @default(now()) @@unique([codeId, idempotencyKeyHash]) }
model DeviceCredential { // @@map("device_credentials")
  id String @id; organizationId String; registrationId String /* FK */; deviceId String /* FK */; collectorKind DeviceCollectorKind
  secretHash String; secretUsedAt DateTime?; previousSecretHash String?; previousValidUntil DateTime?
  issuedAt DateTime @default(now()); expiresAt DateTime; lastAcceptedAt DateTime?
  revokedAt DateTime?; revocationCause DeviceCredentialRevocationCause?; revocationReason String?; revokedByAppUserId String?
  @@index([registrationId]) }
```

```sql
-- migration <ts>_audit_actor_device (trước): ALTER TYPE "AuditActorKind" ADD VALUE 'DEVICE';
ALTER TABLE device_enrollment_codes ADD CONSTRAINT device_enrollment_codes_uses CHECK (
  uses >= 0 AND uses <= max_uses AND max_uses BETWEEN 1 AND 5 AND (collector_kind <> 'AI_COLLECTOR' OR max_uses = 1));
ALTER TABLE device_credentials
  ADD CONSTRAINT device_credentials_previous CHECK ((previous_secret_hash IS NULL) = (previous_valid_until IS NULL)),
  ADD CONSTRAINT device_credentials_revoked CHECK ((revoked_at IS NULL) = (revocation_cause IS NULL)
    AND ((revocation_cause = 'IT_ADMIN') = (revocation_reason IS NOT NULL AND revoked_by_app_user_id IS NOT NULL))),
  ADD CONSTRAINT device_credentials_expiry CHECK (expires_at > issued_at);
CREATE FUNCTION device_credentials_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A device credential is never deleted'
     USING ERRCODE = '55000', CONSTRAINT = 'device_credentials_kept'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.registration_id, NEW.device_id, NEW.collector_kind, NEW.issued_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.registration_id, OLD.device_id, OLD.collector_kind, OLD.issued_at)
     OR (OLD.revoked_at IS NOT NULL AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*))
  THEN RAISE EXCEPTION 'A device credential keeps whose it is, and a revoked one stays revoked'
     USING ERRCODE = '55000', CONSTRAINT = 'device_credentials_fixed'; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER device_credentials_guard BEFORE UPDATE OR DELETE ON device_credentials FOR EACH ROW EXECUTE FUNCTION device_credentials_guard();
-- device_enrollment_uses: devices_append_only() của S1a (UPDATE/DELETE/TRUNCATE). device_enrollment_codes: DELETE bị từ chối
-- và chỉ cột uses được đổi (trigger device_enrollment_codes_guard, cùng mẫu).
```

### Định dạng và băm (`credential.policy.ts`, thuần, có unit test)

- Mã: 12 ký tự Crockford base32 (`0-9A-HJKMNP-TV-Z`, ~60 bit) `randomBytes`, hiển thị `XXXX-XXXX-XXXX`; chuẩn hóa = upper + bỏ
  `-`/khoảng trắng; lưu `sha256(normalized)` hex. Sai định dạng sau chuẩn hóa ⟹ cùng 404 `DEVICE_ENROLLMENT.CODE_INVALID`.
- Token: `sstd_<credentialId uuid>_<secret>`, `secret = randomBytes(32).toString('base64url')` (43 ký tự); parse bằng
  `/^sstd_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/` (độ dài cố định nên `_` trong
  secret không gây mơ hồ); lưu `sha256(secret)` hex, so bằng `timingSafeEqual`. `Idempotency-Key` lưu `sha256` (nó giữ quyền
  lấy lại credential). TTL mã 24 h; credential 90 ngày từ lần cấp/xoay; ân hạn 24 h.
- Token, mã, secret, hash **không** vào log, Audit, response lỗi (key Audit tránh regex `audit.api.ts:8`: dùng `collectorKind`,
  `expiresAt`, `revokedAt`, `revocationCause`).

### Xác thực thiết bị (hạ tầng + `credential-verifier.service.ts`)

1. `@DeviceAuthenticated(options?: { collectorKind?: 'AI_COLLECTOR' | 'BROWSER_EXTENSION' })` =
   `SetMetadata(IS_DEVICE_AUTHENTICATED_METADATA, options ?? {})` + `ApiBearerAuth('deviceCredential')` +
   `Throttle({ default: { limit: 60, ttl: 3_600_000 } })`. Không `collectorKind` (phiên, xoay vòng) ⟹ mọi loại; có ⟹ sau khi
   verifier trả `OK`, credential khác loại ⟹ 403 `DEVICE.WRONG_COLLECTOR_KIND` (trước pipe Zod — DESIGN §1). Route nhận lô của
   S2a/S2b khai `@DeviceAuthenticated({ collectorKind: … })`. `AccessDeclarationGuard` thêm kind `'device'` (vẫn đúng một khai
   báo); `AuthenticationGuard` bỏ qua route `device` như `public`; `DeviceAuthenticationGuard` (APP_GUARD sau
   AuthenticationGuard, trước AuthorizationGuard) chỉ chạy cho route `device`, gắn `request[AUTHENTICATED_DEVICE]`, đọc bằng
   `@CurrentDevice()` ⟹ `CurrentDevice = { credentialId: string; collectorKind: 'AI_COLLECTOR' | 'BROWSER_EXTENSION' }`
   (`models/current-device.ts`; không id tổ chức/máy/đăng ký — lát nhận đọc chúng dưới khóa qua `getIntakeContext`).
   `SecurityModule.register({ verifierModule, deviceVerifierModule })` (infra không import `devices`).
2. `CredentialThrottlerGuard extends ThrottlerGuard`: `getTracker` = `device:<credentialId>` khi header khớp regex token,
   ngược lại IP như cũ (throttle chạy trước xác thực; id chưa xác thực chỉ chia xô — secret 256 bit nên không đoán được).
3. Verifier (một câu SQL credential + đăng ký + máy): sai định dạng/không có id/secret không khớp hiện hành lẫn _cũ trong ân hạn khi
   hiện hành chưa dùng_ ⟹ `INVALID`; **chỉ sau khi secret khớp**: `revoked_at` ≠ NULL, đăng ký đã kết thúc, máy ngừng dùng, holder
   `TERMINATED` hoặc `IdentityAccessApi.isAccessBlocked` ⟹ `REVOKED`; `now >= expires_at` ⟹ `EXPIRED`. Lần đầu dùng secret hiện
   hành: `UPDATE … SET secret_used_at = now, previous_secret_hash = NULL, previous_valid_until = NULL WHERE id = $1 AND
secret_used_at IS NULL` (secret cũ hết hiệu lực ngay — DESIGN §2.3).
4. Lỗi (lát này là chủ duy nhất, khai ở `src/infrastructure/http/errors/access-errors.ts`): 401 `DEVICE.CREDENTIAL_INVALID`
   (cả thiếu header) · 401 `DEVICE.CREDENTIAL_REVOKED` · 401 `DEVICE.CREDENTIAL_EXPIRED` · 403 `DEVICE.WRONG_COLLECTOR_KIND`; CSDL
   không với tới khi xác thực ⟹ 503 `TOKEN_VERIFICATION_UNAVAILABLE` có sẵn (**không bao giờ 401** — tool xóa credential khi
   401). Không bao giờ thử JWT người dùng (09-05 AC-13). Token người dùng ở route thiết bị ⟹ `CREDENTIAL_INVALID`; token thiết
   bị ở route người dùng ⟹ lỗi JWT hiện có (`INVALID_ACCESS_TOKEN`). Không log từng lần từ chối (cùng lý do
   `authentication.guard.ts:137-141`). Tool xử lý: `REVOKED`/`EXPIRED` ⟹ xóa credential + trạng thái gửi; `INVALID` ⟹ giữ, báo IT.

### API (`/api/v1`)

| operationId · route · truy cập · status                                                                                          | message                          |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `deviceEnrollmentCodeCreate` · `POST /device-registrations/{id}/enrollment-codes` · `@RequireRoles('IT_ADMIN')` · 201            | `DEVICE_ENROLLMENT_CODE.CREATED` |
| `deviceEnrollmentCreate` · `POST /device-enrollments` · `@Public()` + `@Throttle({ default: { limit: 10, ttl: 60_000 } })` · 201 | `DEVICE_ENROLLMENT.COMPLETED`    |
| `deviceSessionGet` · `GET /device-session` · `@DeviceAuthenticated()`                                                            | `DEVICE_SESSION.FETCHED`         |
| `deviceSessionRotationCreate` · `POST /device-session/rotations` · `@DeviceAuthenticated()` · 201                                | `DEVICE_SESSION.ROTATED`         |
| `deviceCredentialList` · `GET /device-registrations/{id}/credentials` · IT_ADMIN                                                 | `DEVICE_CREDENTIAL.LISTED`       |
| `deviceCredentialRevocationCreate` · `POST /device-credentials/{id}/revocations` · IT_ADMIN · 201                                | `DEVICE_CREDENTIAL.REVOKED`      |

Route trả token/mã có `@Header('Cache-Control', 'no-store')` (mẫu `budget-attachment-uploads.controller.ts:46`).

**Request fields** (tổ chức, thiết bị, đăng ký, nhân viên, `collectorKind` của credential, thời điểm: server — F-2):

| route · field                        | kiểu & ràng buộc                                                | bắt buộc (ca vắng) | nguồn                                                        | dùng ở                                                  |
| ------------------------------------ | --------------------------------------------------------------- | ------------------ | ------------------------------------------------------------ | ------------------------------------------------------- |
| enrollment-codes `collectorKind`     | `AI_COLLECTOR` · `BROWSER_EXTENSION`                            | có                 | IT Admin (công cụ sắp cài)                                   | 09-01 AC-13; `QĐ-101g` (một credential mỗi bộ thu thập) |
| enrollment-codes `maxUses`           | int 1–5; chỉ khi `BROWSER_EXTENSION` (với `AI_COLLECTOR` ⟹ 422) | không — vắng: 1    | IT Admin (số hồ sơ trình duyệt dùng chung một mã qua policy) | DESIGN §2.1 (H8); 09-01 AC-13 (hai hồ sơ)               |
| enrollments header `Idempotency-Key` | `^[A-Za-z0-9_-]{16,128}$`                                       | có (vắng ⟹ 422)    | tool, sinh một lần mỗi lần cài                               | retry khi mất response; tách nhiều hồ sơ (DESIGN §2.1)  |
| enrollments `enrollmentCode`         | string trim ≤ 32                                                | có                 | người cài (IT đọc từ màn)                                    | 09-01 AC-13                                             |
| rotations body `{}`                  | `z.strictObject({})`                                            | —                  | —                                                            | DESIGN §2.3                                             |
| revocations `reason`                 | trim 1–1000                                                     | có                 | IT Admin                                                     | 09-01 AC-13 (IT thu hồi); Audit                         |
| credentials `page`, `pageSize`       | int ≥ 1; ≤ 100                                                  | không — 1 / 20     | client                                                       | API-LIST-DETAIL.1                                       |

```ts
export const enrollmentCodeBodySchema = z.discriminatedUnion('collectorKind', [
  z.strictObject({ collectorKind: z.literal('AI_COLLECTOR') }),
  z.strictObject({ collectorKind: z.literal('BROWSER_EXTENSION'), maxUses: z.number().int().min(1).max(5).optional() }),
]);
export const enrollmentBodySchema = z.strictObject({ enrollmentCode: z.string().trim().min(1).max(32) });
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
export const rotationBodySchema = z.strictObject({});
export const credentialRevocationBodySchema = z.strictObject({ reason: z.string().trim().min(1).max(1000) });
```

**Response:**

| schema · field                                                                                                                                                          | tiêu thụ                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `EnrollmentCode`: `code` (`XXXX-XXXX-XXXX`, chỉ trả một lần), `collectorKind`, `maxUses`, `expiresAt`                                                                   | màn IT đọc mã cho người cài; 09-01 AC-13                                                                                     |
| `IssuedDeviceCredential`: `token`, `expiresAt`                                                                                                                          | tool lưu token, hẹn xoay trước hạn (enroll + rotation)                                                                       |
| `DeviceSession`: `state` (`ACTIVE`·`AWAITING_ACKNOWLEDGEMENT`·`COLLECTION_STOPPED`), `expiresAt`, `timezone`, `acceptFromAt\|null`, `acceptUntilAt\|null`               | tool: thu hay không, cắt dữ liệu theo instant (DESIGN §2.2, 09-05 AC-14), xóa hàng đợi khi `COLLECTION_STOPPED` (09-09 AC-5) |
| `DeviceCredentialSummary`: `id`, `collectorKind`, `issuedAt`, `expiresAt`, `lastAcceptedAt\|null`, `revokedAt\|null`, `revocationCause\|null`, `revocationReason\|null` | chi tiết máy của IT: biết hồ sơ nào đã kết nối, thu hồi (09-01 AC-13); `lastAcceptedAt` do S2a ghi (`US-09-07`)              |

`acceptFromAt` = `state = ACTIVE` ? `max(acknowledged_from, now − 6 tháng)` : null. `acceptUntilAt` = `collection_stopped_at` khi
`COLLECTION_STOPPED`, ngược lại null (B: ngày chặn tương lai khi có). `timezone` = `Organization.timeZone`. Không IP, hostname,
holder ở phiên (09-01 AC-6, F-5). `g7-ai-usage-intake` thêm `allowlist: { version: number|null, entries: [{ kind, key }] }`
(tool lấy khóa `AI_TOOL` — T1 bước 3); không thêm `toolStatusAccepted` (T1 không đọc; ảnh chụp chưa được nhận ⟹ 403 của S2a).

### Facade cho lát nhận (`public/devices.api.ts`, A, task A5)

```ts
export type DeviceSessionState = 'ACTIVE' | 'AWAITING_ACKNOWLEDGEMENT' | 'COLLECTION_STOPPED';
export interface DeviceIntakeContext {
  organizationId: string; deviceId: string; registrationId: string; credentialId: string;
  state: DeviceSessionState; acceptFromAt: Date | null; acceptUntilAt: Date | null;
  toolStatusAcknowledged: boolean; // state = ACTIVE và bản thông báo hiện hành có includesToolStatus (S1a O-2)
  timeZone: string;                // Organization.timeZone; wire của phiên gọi là `timezone`
}
// Khóa đăng ký FOR SHARE (thứ tự khóa của S1a); credential đã thu hồi/đăng ký kết thúc giữa guard và transaction ⟹ ném
// DeviceCredentialRevokedError (public/devices.errors.ts) — lát nhận map về đúng 401 DEVICE.CREDENTIAL_REVOKED.
getIntakeContext(tx: DbTx, credentialId: string): Promise<DeviceIntakeContext>;
recordAccepted(tx: DbTx, credentialId: string, at: Date): Promise<void>; // last_accepted_at = max(cũ, at)
```

`state`, `acceptFromAt`, `acceptUntilAt` của context và của `GET /device-session` do **một** hàm `sessionWindowOf` ở
`session/credential-session.service.ts` tính (DESIGN §2.2). `credential` đọc bản thông báo hiện hành bằng SQL của mình
(`credential.repo.ts`), không import `registry`.

### Luật và lỗi

- **Tạo mã** (IT): đăng ký 404 `DEVICE_REGISTRATION.NOT_FOUND`; kết thúc 409 `DEVICE_REGISTRATION.ENDED`; chưa bản ký 409
  `DEVICE_REGISTRATION.SIGNATURE_RECORD_MISSING` (09-01 AC-13; mã của S1a). Mã cũ chưa dùng vẫn sống tới hạn. Audit
  `DEVICE_ENROLLMENT_CODE.CREATED` `{ collectorKind, maxUses, expiresAt }`.
- **Enroll** (một transaction): mã theo hash `FOR UPDATE`, join đăng ký mở, máy chưa ngừng dùng; không thấy/hết hạn ⟹ 404
  `DEVICE_ENROLLMENT.CODE_INVALID`. Có dòng `(codeId, keyHash)` ⟹ credential đó: nếu chưa thu hồi **và** `secret_used_at IS
NULL` (tool chưa từng nhận được) ⟹ secret mới, không tốn lượt; ngược lại 404 (chặn chiếm credential đang chạy bằng mã cũ).
  Không có ⟹ `UPDATE … SET uses = uses + 1 WHERE id = $1 AND uses < max_uses AND expires_at > now()`; 0 dòng ⟹ 404; rồi insert
  credential + use. `23505` của `(codeId, keyHash)` (đua cùng key) ⟹ chạy lại nhánh "có dòng" một lần. Audit
  `DEVICE_CREDENTIAL.ISSUED` actor `DEVICE`, `{ collectorKind, registrationId, expiresAt }`.
- **Xoay vòng** (credential `FOR UPDATE`, xác thực lại dưới khóa): bằng secret hiện hành ⟹ `previous = current`,
  `previous_valid_until = now + 24 h`; bằng secret cũ trong ân hạn (hiện hành chưa dùng) ⟹ chỉ thay hiện hành, **không** gia hạn
  ân hạn; cả hai: `secret_used_at = NULL`, `expires_at = now + 90 ngày`. Audit `DEVICE_CREDENTIAL.ROTATED` `{ expiresAt }`.
- **Thu hồi bởi IT**: 404 `DEVICE_CREDENTIAL.NOT_FOUND`; đã thu hồi 409 `DEVICE_CREDENTIAL.ALREADY_REVOKED`; `revocation_cause =
IT_ADMIN`; trả `DeviceCredentialSummary`.
- **Thu hồi tự động** (A): `CredentialRevocationService.revokeAllOfRegistration(tx, registrationId, at)` gọi trong
  `registration-end.service.ts` của S1a (holder-change, retire, `EMPLOYEE_LEFT`; B: `DEPARTURE`) — `revoked_at = ended_at`,
  `REGISTRATION_ENDED`, Audit `DEVICE_CREDENTIAL.REVOKED` `{ revokedAt, revocationCause }` mỗi credential (09-08 AC-5: thời điểm
  thu hồi = thời điểm kết thúc). Không tự khôi phục; đăng ký lại cần mã mới (`QĐ-100z`, 09-08 AC-7). Dừng thu thập **không** thu hồi
  (09-04 AC-12). Khóa: đăng ký `FOR UPDATE` (S1a) rồi `device_credentials` theo `id`.
- **Khoảng giữa** mốc chặn và dòng thu hồi (sweeper B chưa chạy): verifier đã trả `REVOKED` theo bước 3, nên AC-1/AC-3/AC-6 của
  09-08 đúng ngay tại mốc (khi có facade chặn).

### Câu hỏi mở (mặc định đang dùng)

- **O-1** Phản hồi enroll/rotation là `{ token, expiresAt }` phẳng trong `data` (DESIGN §2.1) — mặc định giữ.
- **O-2** Ngưỡng throttle thiết bị 60/giờ/credential, enroll 10/phút/IP — mặc định như trên (tham số hóa sau).
- **O-3** (đã chốt ở lượt đồng bộ) `allowlist` của phiên do `g7-ai-usage-intake` thêm cùng PR khai + bind
  `CollectorAllowlistHook` (gate `extension-wiring` đòi mỗi Hook có đúng một binder, nên lát này không khai Hook chưa ai bind);
  `activityThresholdMinutes` thuộc `g7-browser-usage-intake`. T1 cần `allowlist` nên demo chạy trên S1a + S1b + S2a mức A.
- **O-4** ADR cho kênh xác thực thiết bị (DESIGN §12 "ADR mới"): mặc định viết `docs/adr/` ngắn ở task A1, Owner duyệt sau.
- **O-5** DESIGN §3 ghi `revocationReason`; tách thành `revocationCause` (enum) + `revocationReason` (chữ của IT) để không trộn.

## Test matrix

Ca ở [test-plan](test-plan.md) (TC-xx); gồm test chống field ma và ma trận 401.

| AC / rủi ro                                     | Tình huống   | Cấp test      | Kết quả mong đợi | Bằng chứng sau implement |
| ----------------------------------------------- | ------------ | ------------- | ---------------- | ------------------------ |
| 09-01 AC-13, 09-05 AC-13, 09-08 (A)             | TC-01→TC-16  | unit/int/http | như test-plan    | planned                  |
| Thu hồi theo ngày cuối, dừng giữ credential (B) | TC-20, TC-21 | int/http      | như test-plan    | planned                  |

## Definition of Done

- [ ] AC/vế primary có test đỏ-trước/xanh-sau; vế sibling ghi đúng chủ.
- [ ] Bộ kiểm nhanh xanh; test theo file `security`, `test/http/devices/*credential*`, `test/integration/devices/*credential*`.
- [ ] `api-inventory.http-spec.ts` (`PUBLIC_ALLOWLIST` + danh sách route `device`), `openapi-inventory.ts:107-111`,
      manifest API/ví dụ, H7, `PRISMA_MODEL_OWNER`, `devices/README.md`, `src/infrastructure/README` nếu có, `routes.md`.
- [ ] Báo FE + workstream tool: 6 operation, mã lỗi 401, scheme `deviceCredential`, enum `AuditActorKind` thêm `DEVICE`.

## Changes and acceptance

05/11/2026 (Claude): tạo spec `ready` từ DESIGN.md. Lệch DESIGN: O-3 (phiên chưa có `allowlist`, `activityThresholdMinutes`),
O-5 (`revocationCause`), thêm 401 `DEVICE.CREDENTIAL_INVALID` (DESIGN §11 chỉ liệt kê REVOKED/EXPIRED), replay enroll chỉ khi
secret chưa từng dùng (siết DESIGN §2.1). Chưa review, chưa nghiệm thu.

05/11/2026 (Claude, lượt đồng bộ chéo — [ALIGNMENT](../../../reviews/g7-usage-design-2026-11-05/ALIGNMENT-2026-11-05.md)):
`@DeviceAuthenticated({ collectorKind? })` + 403 `DEVICE.WRONG_COLLECTOR_KIND` chuyển về lát này (guard chạy trước pipe; một chủ
cho mọi mã `DEVICE.CREDENTIAL_*` và kind); `CurrentDevice = { credentialId, collectorKind }`; facade `getIntakeContext`/
`recordAccepted` theo tên S2a đã dùng, cùng hàm cửa sổ với phiên; 503 `TOKEN_VERIFICATION_UNAVAILABLE` thay vì 401 khi CSDL lỗi;
`allowlist` của phiên giao cho S2a (O-3), `activityThresholdMinutes` cho S2b; không thêm `toolStatusAccepted`; migration sau S1a,
trước S2a.

05/11/2026 (Claude Code, Đợt 1 bước 15): mức A `verified-local` (chưa review bảo mật, chưa nghiệm thu, chưa kiểm trên CI). Migration
`20261107000100_audit_actor_device` và `20261107000200_devices_credentials`; 6 operation; khai báo truy cập thứ tư `@DeviceAuthenticated()`;
`CredentialThrottlerGuard`; facade `getIntakeContext`/`recordAccepted`. Lệch spec: (1) `enrollmentCodeBodySchema` là một `strictObject` +
`superRefine` (không `discriminatedUnion`) vì `createZodDto` không nhận union; AI collector kèm `maxUses` vẫn 422; (2) `holder TERMINATED` đọc qua
`OrganizationReadApi.getEmployee` (module `devices` không đọc bảng `employees`); (3) `IdentityAccessApi.isAccessBlocked` chưa có nên verifier chưa xét
mốc chặn theo ngày cuối (09-08 AC-1/AC-6 chưa đạt, như đã ghi ở _Dependencies_); (4) `sessionWindowOf` ở `session/credential-session.policy.ts` (hàm
thuần), service gọi nó; (5) test hết hạn đặt `expires_at = issued_at + 1ms` (trigger cấm đổi `expires_at` của mã nên không có ca "mã hết hạn" ở tầng
integration); (6) chưa viết ADR kênh xác thực thiết bị (O-4 để Owner quyết); (7) bearer scheme `deviceCredential` khai `bearerFormat: opaque`.

06/11/2026 (Claude Code): verifier xét chặn truy cập theo ngày làm việc cuối. `IdentityAccessApi.isAccessBlocked(employeeId, tx?)` (đọc `employee_access_blocks`,
`blocked_from <= ngày làm việc của tổ chức`, hỏi ngày chỉ khi có dòng chặn) nối vào `CredentialVerifier`: người bị chặn ⟹ `REVOKED` như người đã `TERMINATED` (bước 3);
secret sai vẫn `INVALID`. `devices` import `IdentityAccessFacadeModule` (T5 → T2). Test integration `devices-credential-lifecycle`: trước ngày chặn 200, từ ngày chặn và
`DEPARTURE_BLOCK_NOW` 401 `DEVICE.CREDENTIAL_REVOKED` (cả `GET /device-session` lẫn xoay vòng), gỡ chặn ⟹ 200. Phần "ghi dòng thu hồi tại mốc" và `acceptUntilAt` theo lịch chặn
tương lai vẫn là mức B.

06/11/2026 (Claude Code, FIX-DOT-1 Chat 3): **G-H1** `CredentialThrottlerGuard` đếm mọi request theo địa chỉ; chỉ route `@DeviceAuthenticated` mới thêm id credential
(`<ip>|<id>`), nên token máy giả trên route khác (reset mật khẩu…) không thoát khỏi giới hạn theo IP. **G-M1** bucket `device:<id>` do `DeviceAuthenticationGuard` đếm
(ThrottlerStorage) chỉ sau khi `verify()` OK, giới hạn lấy từ `@Throttle` của route; người biết id không làm collector 429. **G-M2** xoay bằng secret cũ giữ
`previous_secret_hash` và `previous_valid_until` (không gia hạn), nên mất response lần hai vẫn xoay lại được trong ân hạn. **G-L1** `markSecretUsed` thêm
`AND secret_hash = <hash vừa kiểm>`. **G-L3** enroll credential `AI_COLLECTOR` mới ⟹ thu hồi credential AI đang sống của đăng ký, `revocation_cause = REPLACED`
(migration `20261107000400_device_credential_replaced`), Audit `DEVICE_CREDENTIAL.REVOKED` actor `DEVICE`; credential trình duyệt không bị thay. **G-L7** test
`openapi-response-examples` yêu cầu 3 mã 401 thiết bị và không có mã 401 người dùng trên route thiết bị.
