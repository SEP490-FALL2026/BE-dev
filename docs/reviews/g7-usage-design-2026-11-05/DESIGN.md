# G7 Usage/Telemetry + Contract list — thiết kế đã duyệt (05/11/2026)

> **Trạng thái:** Owner duyệt Phần 1–5 và thứ tự lát ngày 05/11/2026 (phiên thiết kế). Đây là đầu vào chung cho các
> spec/plan `c1-…`, `g7-…` trong `docs/workspace/items/`. Spec của từng lát là nguồn chi tiết; nếu spec làm rõ hoặc
> đổi điều gì ở đây thì ghi lại ở spec và sửa mục tương ứng của tài liệu này.
>
> **Pin:** Docs `3d73a7f` + thay đổi **chưa commit** ngày 05/11/2026 (`QĐ-101a`→`QĐ-101l`, BRD v4.1 có `FR-1.13`,
> US: `US-04-13` mới, AC mới/sửa ở EP-04/08/09/10/14, `US-09-05`/`US-09-09` BASELINED cho 3 công cụ). BE `3e4553b9`.
> Tool: `Code/Tools/workstreams/*` theo báo cáo `NOTE MD/TOOLS_STATUS_AND_BE_INTEGRATION_HANDOFF_2026-11-04.md`.

Căn cứ: BRD 4.0→4.1, sổ QĐ (QĐ-32c, QĐ-35b, QĐ-62q, QĐ-66ad/ae, QĐ-77e, QĐ-96j, QĐ-101), US EP-04/08/09/10/14, MF-5,
SBF-04/04a/05/05a, báo cáo tool 04/11, BE `db9e098f`. Review v1: 8 High, 14 Medium, 9 Low — xử lý ở mục 9.

## 0. Luật "không có field ma"
| Mã | Luật |
|---|---|
| F-1 | Mỗi field request có **nguồn** (ai biết), **nơi dùng** (AC/màn/rule cụ thể), và BE **không tự suy ra được**. Thiếu một ⟹ bỏ. |
| F-2 | Không nhận từ client: `organizationId`; id người thao tác; thiết bị/đăng ký/nhân viên của thiết bị (từ credential + đăng ký hiệu lực); mốc thời gian server; giá trị tính (status, tier, confidence, savings, totals, `applicationId` từ allowlist, semantics token); timezone (từ `Organization.timeZone`). |
| F-3 | Field tùy chọn phải ghi ca vắng mặt. Không field "để dành". |
| F-4 | Body `z.strictObject`; với dữ liệu thiết bị field lạ ⟹ từ chối bản ghi đó (ADR-13). |
| F-5 | Field response phải có màn/AC tiêu thụ. |
| F-6 | Ngày local theo `Organization.timeZone`. |

## 1. Kiến trúc
`devices` (T5), `usage` (T6), `optimization` (T7), `dashboards` → T8. `@DeviceAuthenticated()` + `Bearer sstd_<id>_<secret>` (QĐ-32c), throttle theo credential, audit `actorKind DEVICE`.
Cổng nhận theo từng bản ghi: credential hợp lệ & đúng `collectorKind` → đăng ký hiệu lực → xác nhận phiên bản hiện hành → yêu cầu dừng chưa hoàn tất → schema strict → thời điểm trong cửa sổ nhận.

## 2. API thiết bị (tool → BE)

### 2.1 `POST /api/v1/device-enrollments` — `@Public`, throttle chặt
Header `Idempotency-Key` (tool sinh ngẫu nhiên một lần cho mỗi lần cài; dùng: retry mất response và phân biệt nhiều profile).
Body `{ enrollmentCode }`.
- Mã có `maxUses` (AI_COLLECTOR = 1; BROWSER_EXTENSION do IT chọn 1–5 vì policy trình duyệt phát một mã cho mọi profile), TTL 24 h, hash.
- Cùng mã + cùng key ⟹ trả lại cùng credential với secret mới (không tốn lượt). Key mới ⟹ tốn một lượt; hết lượt/hết hạn/sai ⟹ 404 `DEVICE_ENROLLMENT.CODE_INVALID`.
- Tiêu thụ nguyên tử (`UPDATE … SET uses = uses + 1 WHERE uses < maxUses AND expiresAt > now()`); bảng `(codeId, idempotencyKey)` unique.
Response 201 `{ token, expiresAt }`.

### 2.2 `GET /api/v1/device-session`
`{ state, expiresAt, timezone, acceptFromAt, acceptUntilAt|null, activityThresholdMinutes, allowlist: { version, entries:[{ kind: AI_TOOL|WEB_DOMAIN, key }] } }`
- `state` ∈ ACTIVE | AWAITING_ACKNOWLEDGEMENT | COLLECTION_STOPPED (401 cho revoked/expired, mã `DEVICE.CREDENTIAL_REVOKED|CREDENTIAL_EXPIRED`).
- `acceptFromAt` (instant) = max(thời điểm xác nhận phiên bản hiện hành, hiện tại − 6 tháng). `acceptUntilAt` = thời điểm hoàn tất dừng / kết thúc đăng ký nếu đã biết. Tool lọc event theo instant; ngày biên gửi coverage PARTIAL (H3).
- `activityThresholdMinutes` chỉ cho extension: dưới N không gửi dòng domain (US-09-06 AC-8).

### 2.3 `POST /api/v1/device-session/rotations` — body `{}`
Response `{ token, expiresAt }`. Quy tắc: xác thực bằng secret hiện hành ⟹ secret hiện hành thành "cũ" (ân hạn 24 h tính từ lần xoay này). Xác thực bằng secret cũ trong ân hạn ⟹ thay secret hiện hành chưa được dùng, **không** kéo dài ân hạn. Secret hiện hành đã dùng thành công một lần ⟹ secret cũ hết hiệu lực ngay.

### 2.4 `POST /api/v1/ai-usage-batches` — credential `AI_COLLECTOR`
```
{ generatedAt,
  days: [ { date, tools: [ { tool, coverage: COVERED|PARTIAL|NOT_OBSERVABLE, responses, totalTokens } ] } ] }
```
| Field | Nguồn | Dùng |
|---|---|---|
| `generatedAt` | tool | phiên bản của ngày: lớn hơn ⟹ thay; bằng + cùng nội dung ⟹ không đổi; bằng + khác ⟹ bản đến sau thắng; > giờ server + 5 phút ⟹ từ chối ngày đó |
| `date` | tool | ≤ 14 ngày/batch, không trùng, trong [acceptFromAt, acceptUntilAt] theo ngày local |
| `tool` | tool | `AI_TOOL` key có trong allowlist **hiệu lực tại `date`** ⟹ BE suy `applicationId`, semantics token |
| `coverage` | tool (theo client) | coverage theo (thiết bị, tool, ngày) (H1). NOT_OBSERVABLE: version lạ / nguồn lỗi; `responses`, `totalTokens` phải 0 |
| `responses` | tool | số response/bước (gồm subagent, không gồm workflow local-only). COVERED + 0 = đã quét, không dùng. ≥1 ⟹ ngày hoạt động |
| `totalTokens` | tool, theo semantics của tool (Codex input+output; Claude gồm cache; agy input+output+cache_read) | hiển thị cho nhân viên/IT; không cộng chéo tool; không null |
Tool không có trong `tools` của một ngày ⟹ ngày đó tool **không được thu** (ngoài coverage), không phải "không dùng".
Response 200 `{ results: [ { date, outcome: ACCEPTED|UNCHANGED|REJECTED, reasonCode? } ] }` — xét từng ngày (M1); ngày bị từ chối lưu vào `intake_rejections` (US-09-07 AC-1, US-09-05 AC-11).
Lỗi cả request: 401; 403 `DEVICE.NOT_ACKNOWLEDGED` | `DEVICE.COLLECTION_STOPPED` | `DEVICE.WRONG_COLLECTOR_KIND`; 413; 422 khi envelope sai (không phải từng ngày).

### 2.5 `POST /api/v1/ai-tool-status-snapshots` — `AI_COLLECTOR`; chỉ nhận khi phiên bản thông báo đã xác nhận có mục quota (QĐ-62q)
```
{ snapshots: [ { tool, observedAt,
    auth:  { status: LOGGED_IN|LOGGED_OUT|UNKNOWN|NOT_SUPPORTED },
    quota: { status: OK|NOT_SUPPORTED|FAILED, windows: [ { code, usedPercent, resetsAt|null } ] } } ] }
```
`code` là enum đóng theo từng tool, ghi trong spec từ `provider_status.py`: Codex `PRIMARY|SECONDARY`, Claude `SESSION|WEEKLY_ALL|WEEKLY_MODEL`, agy `GROUP_<n>`→ chốt ở spec sau khi pin. `usedPercent` 0–100 (agy: 100 − remaining×100). `quota.status≠OK` ⟹ `windows` rỗng. Tối đa 20/request; khóa (thiết bị, tool, observedAt). *(Bỏ `planLabel`, `toolVersion`, `probeStatus` gộp.)*

### 2.6 `POST /api/v1/browser-usage-batches` — `BROWSER_EXTENSION`
```
{ generatedAt, days: [ { date, domains: [ { domain, coverage, activeMinutes } ] } ] }
```
`domain` = `WEB_DOMAIN` key có trong allowlist hiệu lực tại `date` **và** extension có host permission; không có permission ⟹ `coverage: NOT_OBSERVABLE`, `activeMinutes: 0`. `activeMinutes` làm tròn xuống từ ms; < N ⟹ không gửi dòng (AC-8). Nhiều profile/máy: đọc hợp nhất [lớn nhất, tổng] (QĐ-32c).

### 2.7 Hợp nhất nhiều credential
AI: theo (thiết bị, tool, ngày) lấy bản `generatedAt` mới nhất trên mọi credential của thiết bị (cùng log local ⟹ không cộng) (M2). Extension: [max, sum].

## 3. API web — thiết bị
| Route | Vai | Body / response chính |
|---|---|---|
| `POST /devices` | IT_ADMIN | `{ assetCode, hostname, os, holderEmployeeId, handedOverOn? }` — ca vắng: hôm nay; ≤ hôm nay; chỉ máy công ty một người (điểm mù máy cá nhân ghi ở màn) |
| `GET /devices` / `{id}` | IT_ADMIN | list: `search`, `holderEmployeeId`, `state`; detail có đăng ký, BM-06, xác nhận, yêu cầu dừng, credential |
| `PATCH /devices/{id}` | IT_ADMIN | `{ assetCode?, hostname?, os?, reason }` |
| `POST /devices/{id}/holder-changes` | IT_ADMIN | `{ holderEmployeeId }` — hiệu lực **ngay**, không lùi ngày (M7) |
| `POST /devices/{id}/retirements` | IT_ADMIN | `{ reason }` — hiệu lực ngay |
| `POST /device-registrations/{id}/signature-records` | IT_ADMIN | `{ documentId, noticeVersionId }` (L8) |
| `POST /device-registrations/{id}/enrollment-codes` | IT_ADMIN | `{ collectorKind, maxUses? }` — `maxUses` chỉ BROWSER_EXTENSION (ca vắng: 1) ⟹ `{ code, expiresAt }` |
| `GET /device-registrations/{id}/credentials` | IT_ADMIN | `{ id, collectorKind, issuedAt, expiresAt, lastAcceptedAt, revokedAt, revocationReason }` |
| `POST /device-credentials/{id}/revocations` | IT_ADMIN | `{ reason }` |
| `GET /device-stop-requests` | IT_ADMIN | hàng đợi, hạn 2 ngày làm việc (US-09-04 AC-5) |
| `POST /device-stop-requests/{id}/completions` | IT_ADMIN | `{}` — cờ tự xử lý nếu là máy của chính mình (AC-7) |
| `POST /device-stop-requests/{id}/invalid-closures` | IT_ADMIN | `{ reason }` — chỉ yêu cầu không hợp lệ (AC-6) |
| `GET /devices/{id}/usage?from&to`, `/tool-status`, `/intake-rejections` | IT_ADMIN | |
| `GET /monitoring-notices/current` | mọi tài khoản | |
| `POST /monitoring-notice-versions` | SUPER_ADMIN | `{ collected, notCollected, purpose, retention, stopRight, requiresReacknowledgement }` (US-09-03 AC-5) |
| `GET /me/devices` | mọi tài khoản | mỗi máy: `signatureRecorded`, `acknowledgementState`, `canAcknowledge`, `blockedReason`, `stopRequest` |
| `GET /me/devices/{id}/usage`, `/tool-status`, `/history` | mọi tài khoản | FR-10.1: usage, xác nhận, yêu cầu dừng của chính mình |
| `POST /me/device-registrations/{id}/acknowledgements` | mọi tài khoản | `{ noticeVersionId }` — phải là bản hiện hành; cũng dùng để bật lại |
| `POST /me/device-registrations/{id}/stop-requests` | mọi tài khoản | `{}` — trùng/đã dừng ⟹ tự đóng không hợp lệ (AC-10) |
Tự động: hết ngày làm việc cuối / đổi người giữ / retire ⟹ kết thúc đăng ký + revoke credential (QĐ-96j, QĐ-100z).

## 4. API web — usage, import, danh tính
| Route | Vai | Body |
|---|---|---|
| `POST/GET/PATCH /usage-sources` | IT_ADMIN | chỉ nguồn vendor: `{ kind: VENDOR_REPORT|VENDOR_CSV, applicationId, activityDefinition*, activityStrictness*, evidenceDirection*, capabilities*, csvTemplate* }` — `*` chỉ bắt buộc với CSV; với JSON lấy từ report. Nguồn AI_COLLECTOR/BROWSER_EXTENSION do hệ thống seed (định nghĩa QĐ-101). Ngưỡng lỗi thời theo loại nguồn (tham số), không nhập theo nguồn |
| `POST /usage-imports` (multipart `file`, `sourceId`, `coverageFrom?`, `coverageTo?`) | IT_ADMIN | coverage chỉ cho CSV khi file không tự nói |
| `GET /usage-imports/{id}`, `/rows`; `POST /{id}/confirmations { previewVersion, idempotencyKey }`; `/cancellations` | IT_ADMIN | confirm bị chặn ⟹ 409 `USAGE_IMPORT.TRACKING_NOTICE_MISSING` khi chưa thông báo người giữ seat (US-08-05) |
| `GET /usage-tracking-notices?applicationId`; `POST /usage-tracking-notices { applicationId }` | IT_ADMIN | gửi thông báo theo dõi cho người giữ seat; người mới được cấp ⟹ tự gửi; thư lỗi không tính |
| `GET /unmatched-identities`; `POST /{id}/resolutions { employeeId }`; `/dismissals { reason }`; `GET /identity-mappings` | IT_ADMIN | |
| `GET /collector-allowlist`; `POST /collector-allowlist-versions { reason, requiresReacknowledgement }` | IT_ADMIN | phiên bản **sinh từ catalog** (ứng dụng IT đánh dấu theo dõi trên thiết bị + `Application.domains` + tool key), tự loại app liên lạc (US-09-02); thêm loại dữ liệu ⟹ phải có thông báo cần xác nhận lại |

## 5. API web — khuyến nghị
| Route | Vai | Ghi chú |
|---|---|---|
| `GET /ghost-seat-recommendations` | IT_ADMIN | bảng 4 nhóm (US-10-05) |
| `GET /department-ghost-seat-recommendations` | MANAGER (phòng mình) | nhóm theo nhân viên; mỗi dòng: nhân viên (mã, email công ty), ứng dụng, assignment, nhóm, tầng, **trạng thái hoạt động + số ngày không hoạt động**, ngày hoạt động cuối, nguồn + ngày import, cửa sổ bao phủ, cách khớp danh tính, định nghĩa hoạt động, nhãn collector `P-05`, mức tin cậy + câu lý do, tiết kiệm tiềm năng + thời điểm có thể thành thực, quyết định trước, lý do IT trả lại, ghi chú miễn trừ trước, hạn quyết. **Không** token, phút, phiên, dòng theo ngày/sự kiện (QĐ-77e/QĐ-101i, US-10-04 AC-1) |
| `POST /ghost-seat-recommendations/{id}/decisions` | MANAGER | `{ decision, reason, exemptUntil? }` — `exemptUntil` bắt buộc khi EXEMPT, ≤ 12 tháng |
| `POST /ghost-seat-recommendation-decisions` | MANAGER | `{ recommendationIds[≤50], decision, reason, exemptUntil? }` (US-10-06 AC-5) |
| `POST /ghost-seat-recommendations/{id}/send-backs` | IT_ADMIN | `{ reason }`, tối đa 1 lần |
| `POST /ghost-seat-recommendations/{id}/reclaims` | IT_ADMIN | `{}` — chỉ G2 |
| Nối rightsizing | nội bộ | `RenewalUsageReader` + facade cho ND−60: theo thuê bao — seat trống (G1), seat đã quyết thu hồi, G2, G3/G4 đang mở, ngày hoạt động cuối từng seat (MF-5 bước 1, 10; US-10-05 AC-2) |
| Chạy rule | CLI `rules:run` | demo |

## 6. Hợp đồng — lát C1 (đã duyệt; căn cứ `QĐ-101k`, BRD `FR-1.13`, `US-04-13`, `US-04-04` AC-13)

**Hợp đồng là gì.** Bản ghi `Contract` chỉ cho văn bản đã ký với nhà cung cấp/đại lý, là "bìa hồ sơ" của tờ hợp đồng:
loại, số, nhà cung cấp, hiệu lực, tệp gốc, thuê bao nào mua theo nó. Ngày gia hạn/ND/số ngày báo trước/giá ở
`Subscription`; điều khoản ở `PlanTerms`. Mua click-through và phần mềm nội bộ không có Contract.
`kind`: `FRAMEWORK` (khung nhiều năm, nhiều thuê bao/kỳ) · `TERM` (một kỳ; gia hạn bằng văn bản mới ⟹ hợp đồng mới) ·
`PERPETUAL_PURCHASE` (mua vĩnh viễn, `validTo` trống).

**Data (migration).**
- `contracts`: thêm `kind` (enum, NULL cho hợp đồng cũ), `contract_number` (NULL; unique partial theo
  `(organization_id, normalized_contract_number)` khi khác NULL — chuẩn hóa bằng `searchKey`), `vendor_id` (FK, NULL cho
  hợp đồng cũ), `valid_from` (date, NULL cũ), `valid_to` (date NULL), `updated_at`. CHECK: `valid_to >= valid_from`;
  `kind = PERPETUAL_PURCHASE ⟹ valid_to IS NULL`; `kind IN (TERM, FRAMEWORK) ⟹ valid_to IS NOT NULL`.
- Trigger `contracts_immutable` (`prisma/migrations/20261020250000_catalog_contracts_and_documents/migration.sql:67-77`)
  đổi thành: cấm DELETE; cho UPDATE các cột trên; cấm đổi `vendor_id` khi có `subscriptions.contract_id` trỏ tới; cấm
  đổi `organization_id`, `created_by_app_user_id`, `created_at`.
- `subscriptions.contract_id` (FK NULL) + index. Ràng buộc cùng nhà cung cấp kiểm ở service (plan → application →
  vendor), và `PERPETUAL_PURCHASE` chỉ gắn `SubscriptionKind = PERPETUAL`. Kiểm tra trigger cột bất biến của
  subscription không chặn cột mới.
- **Không** thêm `notes`, tiền, số ngày báo trước.

**Trạng thái hiển thị (tính, không lưu):** `INCOMPLETE` (thiếu `kind`/`vendor_id`/`valid_from`) · `NOT_YET_EFFECTIVE`
(hôm nay < `validFrom`, theo `Organization.timeZone`) · `EXPIRED` (`validTo` < hôm nay) · `IN_EFFECT`.

**API (`/api/v1`, vai):**
| Route | Vai | Request | Response / ghi chú |
|---|---|---|---|
| `GET /contracts` | IT_ADMIN, FINANCE | query: `search` (≤100; tên, số hợp đồng, tên vendor qua `searchKey`), `vendorId`, `kind`, `status`, `validToFrom`, `validToTo` (lọc ngày hết hiệu lực), `hasDocuments` (bool), `sortBy` ∈ `name`\|`contractNumber`\|`vendorName`\|`validTo`\|`createdAt` (mặc định `name`), `sortOrder` ∈ `asc`\|`desc` (mặc định `asc`), `page`, `pageSize` ≤ 100 | `{ items: ContractSummary[], pagination }`; summary `{ id, kind, name, contractNumber, vendor{id,name}\|null, validFrom, validTo, status, subscriptionCount, documentCount, createdAt }` — số đếm là cột màn danh sách (US-04-13); luôn thêm `id` làm khóa phụ; NULL xếp cuối; đếm + trang cùng transaction RepeatableRead; đếm bằng subquery (không N+1) |
| `GET /contracts/{id}` | IT_ADMIN, FINANCE | — | summary + `createdBy`, `updatedAt` |
| `POST /contracts` | IT_ADMIN | `{ kind, name, contractNumber?, vendorId, validFrom, validTo? }` | 201; `contractNumber` vắng = hợp đồng không có số; `validTo` theo luật `kind` |
| `PATCH /contracts/{id}` | IT_ADMIN | `{ kind?, name?, contractNumber?, vendorId?, validFrom?, validTo?, reason }` (ít nhất một field ngoài `reason`) | audit before/after + `reason`; vendor đổi khi đã gắn thuê bao ⟹ 409 `CONTRACT.VENDOR_LOCKED` |
| `GET /contracts/{id}/documents` | IT_ADMIN, FINANCE | `purpose?` (`CONTRACT_ATTACHMENT`\|`PURCHASE_DOCUMENT`), `page`, `pageSize` | chỉ tệp `READY` đã gắn; summary `{ id, purpose, fileName, contentType, sizeBytes, uploadedBy, attachedAt }`; sắp `attachedAt desc, id`; mở/tải dùng `GET /documents/{id}` + `POST /documents/{id}/links` có sẵn |
| `GET /contracts/{id}/subscriptions` | IT_ADMIN, FINANCE | `page`, `pageSize` | summary thuê bao `{ id, application{id,name}, plan{id,name}, kind, status, startDate, endDate, purchasedQuantity, ownerDepartment{id,name} }` |
| `PATCH /subscriptions/{id}` (có sẵn) | IT_ADMIN | thêm `contractId: uuid\|null` | gắn/đổi/bỏ; kiểm cùng vendor, `PERPETUAL_PURCHASE`; audit |

**Lỗi mới:** 404 `CONTRACT.NOT_FOUND` (có sẵn), 409 `CONTRACT.VENDOR_LOCKED`, 409 `CONTRACT.NUMBER_TAKEN`, 422
`CONTRACT.VALIDITY_INVALID` (ngày/loại không hợp), 422 `CONTRACT.VENDOR_MISMATCH` (gắn thuê bao khác vendor), 422
`CONTRACT.KIND_MISMATCH` (`PERPETUAL_PURCHASE` với thuê bao kỳ), 422 `VALIDATION_ERROR` (sortBy/sortOrder lạ). Quy ước
sort mới ghi vào `docs/rules/api-contract.md`. Manager/Employee/Super Admin/Spending Approver ⟹ 403.

## 7. Data model — sửa so với Phần 2
- `device_usage_days` → `ai_usage_days` (device, credential, tool, date, coverage, responses, totalTokens, generatedAt, contentHash) và `web_usage_days` (device, credential, domain, date, coverage, activeMinutes, generatedAt). Bỏ sessions, tokens Json, toolVersions, evidenceLevel, revision.
- `device_coverage_days` bỏ: coverage nằm theo tool/domain.
- `device_credentials`: bỏ instanceId, collectorVersion; thêm `lastAcceptedAt`, `revocationReason`. Thêm `device_enrollment_uses (codeId, idempotencyKey unique, credentialId)`; `device_enrollment_codes.maxUses, uses`.
- Thêm `device_stop_requests` (registration, requestedAt, handledBy, completedAt, outcome COMPLETED|INVALID, reason, selfHandled).
- Thêm `intake_rejections` (device, credential, endpoint, date?, reasonCode, at).
- `tool_status_snapshots`: auth status, quota status, windows Json; không planLabel/toolVersion.
- `usage_sources`: bỏ vendorId, staleAfterDays; thêm capabilities.
- `monitoring_notice_versions`: 5 trường nội dung.

## 8. Thay đổi phía tool (spec riêng)
- Collector: uploader HTTPS theo tuần (cho phép gửi bù/hằng ngày), dựng `days[].tools[]` từ ledger (coverage theo client), cắt theo `acceptFromAt/UntilAt`; bỏ binding store theo token (`store.py:33-41`); cho agy CLI lên wire (hiện `EXPERIMENTAL_PROVIDERS` chặn); map lỗi theo envelope BE `error.code`; status snapshot theo 2.5.
- Extension: enroll với `Idempotency-Key`; gửi phút/ngày theo 2.6; ngưỡng N từ session; map `error.code` (hiện đọc `body.error` chuỗi).

## 9. Xử lý review v1
H1 coverage theo tool/domain ✔ · H2 yêu cầu dừng do IT xử lý ✔ · H3 cửa sổ theo instant ✔ · H4 field trưởng phòng theo US-10-04 AC-1 (không volume) ✔ · H5 quota gắn thông báo cần xác nhận lại, bỏ planLabel ✔ · H6 capabilities ✔ · H7 cổng thông báo theo ứng dụng ✔ · H8 enrollment idempotent + maxUses ✔ · M1 kết quả theo ngày ✔ · M2 hợp nhất AI ✔ · M3 lệch đồng hồ ✔ · M4 ngưỡng N ở tool theo AC-8 ✔ · M5 quota windows theo tool ✔ · M6 allowlist sinh từ catalog ✔ · M7 không lùi ngày ✔ · M8 field response ✔ · M9 usage-sources rút gọn ✔ · M10 xoay vòng ✔ · M11 giữ gửi tuần (quyết định Owner), API không ép chu kỳ · M12 quyết định hàng loạt ✔ · M13 thông báo có cấu trúc ✔ · M14 nối ND−60 ✔ · L1 totalTokens không null ✔ · L2 bỏ NOT_COLLECTED ✔ · L3 bỏ sessions ✔ · L4 agy cần sửa tool ✔ · L5 bỏ version ✔ · L6 map lỗi ✔ · L7 ghi điểm mù ✔ · L8 BM-06 kèm phiên bản ✔ · L9 số đếm là cột màn ✔.
Sau đồng bộ docs: gửi lại theo ngày "bản dựng sau cùng thắng" (QĐ-101a), CF-5 theo loại nguồn (QĐ-101b), US-09-05/09-09 BASELINED cho 3 công cụ.

## 10. Phần 4 — Rule engine (module `optimization`)

**Lịch và chống chạy trùng.** Sweeper `*.job.ts` mỗi giờ: tới lịch theo `RULE_SCHEDULE_G1_G2` (mặc định hằng ngày) / `RULE_SCHEDULE_G3_G4` (mặc định hằng tuần) thì claim `rule_runs (org, ruleSet, runDate)` bằng unique insert; instance thua thì bỏ. CLI `rules:run --set G1_G2|G3_G4` cho demo.

**Gán hoạt động vào seat (FR-4.7, FR-4.8).**
- Vendor: `usage_records` gán Assignment hiệu lực tại `activityDate` lúc confirm import; chưa khớp danh tính ⟹ hàng đợi, không dùng.
- Collector: (thiết bị, ngày) ⟹ nhân viên qua đăng ký hiệu lực; tool/domain ⟹ ứng dụng qua allowlist ⟹ Assignment của nhân viên với ứng dụng đó hiệu lực tại ngày. Không có Assignment ⟹ dòng *dùng trên máy công ty nhưng không có seat* cho IT (read model, FR-4.8), không kết luận.

**G1/G2 (hằng ngày, "xác định từ dữ liệu nội bộ", không mức tin cậy).**
- G1: thuê bao `per_seat` còn hiệu lực có `purchasedQuantity − seat đang gán > 0` ⟹ một khuyến nghị/thuê bao kèm số seat trống; vào kho cho IT, không qua trưởng phòng (QĐ-100c).
- G2: Assignment còn hiệu lực của người đã qua ngày làm việc cuối ⟹ thẳng IT. Cổng 8 chặn sinh lại khi đang có khuyến nghị mở (kể cả đang thực thi thu hồi).

**G3/G4 (hằng tuần, theo từng Assignment `per_seat`).**
1. Tám cổng theo thứ tự (FR-4.9); trượt ⟹ `assignment_usage_states.evidenceState = GATED` + `gateReason`. Cổng 6 theo loại nguồn (QĐ-101b), dừng G3/G4 cả ứng dụng khi nguồn vendor lỗi thời (SBF-04).
2. Nguồn kết luận được = nguồn vendor của ứng dụng còn mới, `POSITIVE_AND_NEGATIVE`, coverage COMPLETE. Không có ⟹ `NO_SOURCE`/`INSUFFICIENT_EVIDENCE`; chỉ collector ⟹ `INSUFFICIENT_EVIDENCE` (FR-4.14a); chưa khớp danh tính ⟹ `IDENTITY_UNMATCHED`.
3. Ngày hoạt động cuối = lớn nhất trên mọi nguồn còn mới và đã khớp, gồm bằng chứng dương của collector (QĐ-28a); `AUTH_ONLY` không tính (FR-4.11).
4. Cửa sổ bao phủ < ngưỡng tầng ⟹ `INSUFFICIENT_EVIDENCE` lý do cửa sổ ngắn (US-10-03 AC-9).
5. Chưa từng hoạt động từ ngày dùng được ⟹ G3; hoạt động cuối quá ngưỡng ⟹ G4. Tầng 30–59 MONITOR (chỉ IT), ≥ 60 REVIEW, ≥ 90 / chưa từng / đã nghỉ ACTION. Ngưỡng ứng dụng > tổ chức > mặc định (FR-4.13).
6. Tin cậy: HIGH, mỗi CF hạ một bậc (1 ⟹ MEDIUM, ≥ 2 ⟹ LOW): CF-1 bí danh · CF-2 định nghĩa lỏng · CF-4 bao phủ < 80 % · CF-5 dữ liệu cũ (vendor 4–7, collector 8–14 ngày) · CF-6 vượt ngưỡng < 14 ngày · CF-7 mâu thuẫn. CF-3 không xảy ra vì FR-4.14a chặn ở bước 2 (ghi rõ trong spec).
7. Tiết kiệm tiềm năng = đơn giá seat × kỳ sau điểm điều chỉnh, kèm `realizableOn` (cam kết kỳ: sau kỳ; linh hoạt: kỳ thanh toán sau; gói cá nhân: kỳ không còn bị trừ; vĩnh viễn: không có).
8. Dữ liệu mới có hoạt động ⟹ khuyến nghị cũ `INVALIDATED`, không thông báo.
9. REVIEW/ACTION vào hàng đợi trưởng phòng; ACTION thêm IT; thông báo gộp theo tuần (eventKey theo người nhận + tuần). Phòng chưa có trưởng phòng ⟹ chờ. Chuyển phòng khi đang chờ ⟹ `PAUSED` (QĐ-90c), vẫn là "mở" ở cổng 8.

**Quyết định và thực thi.** Hạn 5 ngày làm việc, quá hạn chỉ nhắc. KEEP ⟹ đóng. EXEMPT ⟹ cổng 7 tới `exemptUntil`, hết hạn mở lại kèm ghi chú miễn trừ trước. RECLAIM ⟹ IT trả lại tối đa 1 lần; nếu không, sau ân hạn 7 ngày tạo `ProvisioningTask` thu hồi qua facade licensing (SBF-18); tác vụ xong ⟹ `EXECUTED`, seat về kho. G2 ⟹ IT bấm thu hồi, tạo tác vụ ngay.

**Nối ra ngoài.** `RenewalUsageReader.seatUsageOf` = `lastActivityOn` + `flagged`; facade ND−60 theo thuê bao (G1, seat đã quyết thu hồi, G2, G3/G4 mở, ngày hoạt động cuối từng seat); dashboards thay `NOT_AVAILABLE`. *Tránh được* ghi ở MF-1 (ngoài G7); *thực* chờ hóa đơn G8.

**Thời hạn lưu.** Job hằng ngày xóa `ai_usage_days`, `web_usage_days`, `usage_records`, `tool_status_snapshots`, `intake_rejections` quá 6 tháng hoặc 30 ngày sau ngày làm việc cuối; không khôi phục (QĐ-100af). Tổng hợp 24 tháng: hoãn.

## 11. Phần 5 — Lỗi, giới hạn, test

**Giới hạn body 100 KiB:** AI ≤ 14 ngày × ≤ 10 tool; trình duyệt ≤ 7 ngày × ≤ 100 domain/ngày; snapshot ≤ 20; mọi mảng lồng có `maxItems`.
**Mã lỗi:** `DEVICE.*` (CREDENTIAL_REVOKED, CREDENTIAL_EXPIRED, NOT_ACKNOWLEDGED, COLLECTION_STOPPED, WRONG_COLLECTOR_KIND), `DEVICE_ENROLLMENT.CODE_INVALID`, reasonCode theo ngày (OUTSIDE_WINDOW, NOT_IN_ALLOWLIST, FUTURE_GENERATED_AT, INVALID_COVERAGE), `USAGE_IMPORT.*` (PREVIEW_STALE, TRACKING_NOTICE_MISSING, ALREADY_CONFIRMED), `RECOMMENDATION.*` (NOT_OPEN, DECISION_FORBIDDEN, SEND_BACK_USED, EXEMPTION_TOO_LONG), `CONTRACT.*` (VENDOR_LOCKED, NUMBER_TAKEN, VALIDITY_INVALID). Token thiết bị không bao giờ vào log/audit.

**Test bắt buộc:**
- Unit policy: 8 cổng, tầng, CF, gán seat theo ngày, hợp nhất credential, cửa sổ instant, quy tắc `generatedAt`, xoay vòng.
- Integration (Postgres thật): partial unique cổng 8, `maxUses` tranh chấp, `rule_runs` hai instance, append-only + H7, xóa theo thời hạn lưu.
- HTTP: token sai/thu hồi/hết hạn/sai kind; chưa xác nhận; dừng chưa hoàn tất vẫn nhận, hoàn tất thì 403; field lạ bị từ chối; kết quả từng ngày; enrollment idempotent; token người dùng gọi route thiết bị ⟹ 401 và ngược lại.
- **Chống field ma:** test so từng request schema (OpenAPI) với bảng field trong spec — thêm field phải sửa spec; response trưởng phòng không có key `totalTokens|responses|activeMinutes`; không có cột IP.
- Contract test với tool: fixture JSON sinh từ collector/extension sau khi sửa tool, chạy qua BE local.

## 12. Thứ tự lát implement
| Lát | Nội dung | Phụ thuộc |
|---|---|---|
| C1 | Hợp đồng: field mới, list/detail/documents/subscriptions, gắn thuê bao | độc lập |
| S1a | Sổ thiết bị, BM-06, thông báo, xác nhận, yêu cầu dừng, `/me/devices`; bind `DeviceRegistryPort` | — |
| S1b | Credential: mã đăng ký, `@DeviceAuthenticated`, session, xoay vòng, thu hồi tự động (ADR mới) | S1a |
| S2a | Allowlist version, AI usage batch, status snapshot, intake rejections | S1b |
| S2b | Browser batch | S2a |
| S3a | Usage sources, import JSON, danh tính, thông báo theo dõi theo ứng dụng | — |
| S3b | Import CSV theo mẫu | S3a |
| S4a | G1/G2 + bảng IT | S3a |
| S4b | G3/G4, hàng đợi trưởng phòng, quyết định, thu hồi, miễn trừ | S2a, S3a, S4a |
| S4c | `RenewalUsageReader`, ND−60, dashboards, job thời hạn lưu | S4b |
| T1/T2 | Tool: uploader collector, sửa extension | S2a/S2b |
