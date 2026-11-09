# Spec: qd103-vendor-usage-import — nhập usage nhà cung cấp (`SBF-04a`): mẫu nguồn, bao phủ, độ mới, xem trước → xác nhận, khớp danh tính

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: subagent của chat review (`SEP-Start 114`), đợt W6 của tracker
  `docs/reviews/qd103-108-alignment-2026-11-08/README.md`, 08/11/2026.
- Thiết kế: `ready` (đã sửa theo audit thiết kế W6 `design-audit-w6.md`, chờ chat review duyệt). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-4.1`→`FR-4.8`, `FR-4.10`, `FR-4.11`, `FR-4.16`, `INV-10`, `INV-11`, `INV-12`, `BR-17.8`; QT v1.7 mục 5.2;
  sơ đồ `SBF-04a` v1.0 bước `a_up`→`d_match`, `a_notice`, `d_ok`; `QĐ-101h`, `QĐ-101b`, `QĐ-28a`, `QĐ-31b`, `QĐ-35c`, `QĐ-101i`, `QĐ-62o`),
  BE `46b6a94e` (đọc ở `712044f9`). Ledger: L4-01, L4-02, L4-03 (giữ). Luật R-J01 (tiền đề `G3`/`G4`). Theo nguồn: Q-85 (vế lần nhập đầu);
  theo phạm vi tracker: Q-84; kỹ thuật (chốt ở đây): Q-85 vế _người được cấp sau_, gắn danh tính lúc đọc, độ mới theo loại nguồn.
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (đợt W6).
- Kế hoạch: `plan.md` cùng thư mục.

## Business outcome

IT Admin khai **nguồn usage** của một ứng dụng bằng bản ghi cấu hình (không viết mã — `FR-4.2`): loại định danh, múi giờ, dạng báo cáo,
phân loại sự kiện, định nghĩa _hoạt động_ (bắt buộc), ma trận năng lực. Ứng dụng nhóm liên lạc bị chặn (mặc định _không thu_ — `US-08-02` AC-3).
Mỗi lần nhập (JSON chuẩn hóa hoặc CSV theo mẫu — `QĐ-101h`) có **cửa sổ bao phủ bắt buộc**, đi qua **xem trước → xác nhận**; trước khi ghi,
người giữ quyền của ứng dụng **đã được báo** (lần đầu: IT xác nhận hoặc hệ thống gửi; người được cấp sau: hệ thống gửi ở lần xác nhận kế).
Khớp danh tính _một định danh, một nhân viên_, gắn nhân viên **lúc đọc** qua ánh xạ còn hiệu lực (sửa được ánh xạ sai); bản ghi chưa khớp vào
**hàng đợi**, không dùng để kết luận (`INV-12`); hoạt động không có Assignment thành **phát hiện sai lệch** (`FR-4.8`). Usage nhà cung cấp và
collector (`L4-03`, giữ nguyên) đọc qua **một** API bằng chứng cho rule `G3`/`G4`.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (W6).
- Mode: `technical-enabler`
- Outcome and owner: module `usage` (T6 — `scripts/arch/tiers.cjs:10`), capability mới `vendor-source/` (L3), `vendor-import/` (L3), `identity/` (L3),
  `usage-evidence/` (L0, không controller, chỉ facade dùng); facade mới `usage/public/usage-evidence.api.ts` (hiện `public/` trống).
- Boundaries: 1 migration (enum mới bằng `CREATE TYPE` cùng bảng ⟹ không `*_values`); 15 operation mới; 1 đổi; 1 extension point
  `UsageImportListeners`; hàm facade mới ở `organization`, `licensing`, `devices`; 1 mã thông báo. Ước ~72 file, 6 task ⟹ **2 phase**.
- Not larger: rule `G3`/`G4`, cổng 2–7, mức tin cậy ở `qd103-ghost-seat-g3-g4`; luồng `SBF-08` cho sai lệch (ngoài phạm vi — Q-84); bật thu thập
  ứng dụng liên lạc (`US-01-08`, chưa có trong BE); kết nối API nhà cung cấp và collector mới (`SBF-05a` — chờ nghiên cứu, README §1).
- Not smaller: khớp danh tính, cửa sổ bao phủ, thông báo theo dõi và xem trước phải ghi cùng lúc, nếu không dữ liệu nhập được mà không dùng được
  (TC-4) hoặc ghi trước khi báo (`US-08-05` AC-3).
- Siblings: `qd103-ghost-seat-g3-g4` (đọc `UsageEvidenceApi`, bind `UsageImportListeners`).
- Scope map: n/a

## Primary Story/AC

| Story | AC                | Coverage | Phần còn lại thuộc                                                          |
| ----- | ----------------- | -------- | --------------------------------------------------------------------------- |
| —     | L4-01, L4-02 (đủ) | n/a      | dùng bằng chứng: `qd103-ghost-seat-g3-g4`; `SBF-08` sai lệch: NGOÀI-PHẠM-VI |

## Supporting references

`US-08-01` AC-1, AC-2 (thông điệp giới hạn), `US-08-02` AC-1 (xem trước nêu số quyền bị ảnh hưởng, nhóm phát hiện được, định nghĩa), AC-3
(ứng dụng liên lạc), `US-08-04` AC-1 (lưu chuỗi gốc), AC-2, AC-4 (gợi ý chỉ mã NV + email), AC-7 (_bỏ qua_ ở lại hàng đợi), `US-08-05` AC-1→AC-4,
`US-08-07` AC-3 (chồng lấn); `US-10-02` AC-3, AC-14, `US-10-03` AC-3, AC-4, AC-9, AC-10, `US-10-04` AC-4, `US-12-15` dòng 23. Spec cũ (§4 luật 9):
`g7-vendor-usage-import-identity` — **còn dùng** tên bảng/enum, preview 24 h + `previewVersion`, thứ tự khớp, chunk ≤ 5 000, 50 000 dòng, schema
`saas-sentry.vendor-usage-report/0.1-proposal`; **bỏ** _chỉ gửi qua hệ thống_, _từ chối `auth_only`_, `employee_id` gắn lúc ghi; CSV mẫu mới ở đây.

## Explicit out of scope

- Kết nối API nhà cung cấp, GitHub commit (`QĐ-28a`), tiện ích trình duyệt; collector AI giữ nguyên (`L4-03`), chỉ được **đọc** thêm.
- Hồ sơ sai lệch `SBF-08` (Q-84: chỉ danh sách phát hiện + số đếm dashboard IT — LEDGER). Bật thu thập ứng dụng liên lạc (`US-01-08` — LEDGER).
- Thông báo **ngay lúc cấp** cho người mới (`US-08-05` AC-4 vế _thời điểm được cấp_): cần hook ở `provisioning`; W6 báo ở lần xác nhận kế, trước khi
  ghi dữ liệu của họ (AC-3 giữ) — lệch ghi LEDGER. Thời hạn giữ dòng thô `usage_import_rows.cells` — LEDGER.

## Dependencies and blockers

W4 PASS, không chờ W5. Giao **sau** `qd103-revocation-grace-notice`, **trước** `qd103-ghost-seat-g3-g4`; song song được với `qd103-ghost-seat-g1-g2`.

## Ownership: module, data, API

- Migration `<ts>_usage_vendor_sources` (task đầu):
  - `usage_sources`: `id`, `organization_id`, `application_id` (FK `applications`), `name` (1–120, UNIQUE (org, application, name)),
    `identifier_type UsageIdentifierType {EMAIL, USERNAME, ACCOUNT_ID}`, `report_shape UsageReportShape {AGGREGATE, EVENT}`, `template jsonb`
    (codec `vendor-source-template.json.ts`), `time_zone text NOT NULL`, `activity_definition text NOT NULL` CHECK 3–500 (`INV-11`),
    `definition_strictness {STRICT, LOOSE}`, `evidence_direction UsageEvidenceDirection {POSITIVE_ONLY, POSITIVE_AND_NEGATIVE}`, `cap_member_list`,
    `cap_last_activity`, `cap_event_detail` boolean NOT NULL, `cap_max_history_days int NULL`, `retired_at`, `created_by_app_user_id`, `created_at`,
    `updated_at`. **Không** cột độ mới (DA6-09 — hằng theo loại nguồn, _Behavior_ 10).
  - `usage_imports`: `id`, `organization_id`, `source_id` FK, `format {JSON, CSV}`, `status UsageImportStatus {PREVIEW, COMPLETED, CANCELLED}`,
    `coverage_from`, `coverage_to date NOT NULL` (`INV-10`) CHECK `from <= to AND to - from <= 366`, `coverage_basis {DECLARED, DERIVED}`,
    `content_hash`, `preview_version int`, `summary jsonb`, `result jsonb`, `confirm_key text NULL UNIQUE`, `notice_mode {CONFIRMED_DELIVERED,
SYSTEM_SENT} NULL`, `notice_at NULL`, `expires_at`, `uploaded_by_app_user_id`, `confirmed_by_app_user_id`, `confirmed_at`, `cancelled_at`;
    CHECK trạng thái ↔ cột (mẫu `seat_baseline_imports`, `prisma/models/data-import.prisma:62`).
  - `usage_import_rows` (PK `(import_id, line_number)`): `cells jsonb` (codec `vendor-import-row-cells.json.ts`), `identifier_raw`,
    `identifier_normalized`, `outcome {MATCHED, UNMATCHED, AMBIGUOUS, NOT_A_PERSON, INVALID}`, `employee_id NULL` (chỉ cho xem trước), `match_method NULL`,
    `errors jsonb` (codec `vendor-import-row-errors.json.ts`).
  - `usage_activity_days`: `id`, `organization_id`, `source_id`, `import_id`, `application_id`, `identifier_type`, `normalized_identifier`,
    `activity_date date`, `event_class UsageEventClass {VALUE, PASSIVE, AUTH_ONLY}`, `basis {ACTIVE_DATE, LAST_ACTIVITY}`, `superseded_by_import_id NULL`;
    **không** `employee_id` (gắn lúc đọc — L4-02, DA6-11); UNIQUE `(import_id, identifier_type, normalized_identifier, activity_date, event_class)`;
    index `(application_id, identifier_type, normalized_identifier, activity_date)`; trigger chỉ cho UPDATE `superseded_by_import_id` NULL→giá trị.
  - `usage_identity_mappings`: `id`, `organization_id`, `application_id`, `identifier_type`, `normalized_identifier`, `raw_identifier` (`US-08-04` AC-1),
    `employee_id`, `method UsageMatchMethod {EXACT_EMAIL, ACCOUNT_IDENTIFIER, ALIAS_RULE, MANUAL}`, `confidence {HIGH, MEDIUM}`,
    `confirmed_by_app_user_id NULL` (CHECK `method <> 'MANUAL' OR confirmed_by… IS NOT NULL`), `created_at`, `ended_at NULL`, `ended_by_app_user_id NULL`,
    `end_reason NULL` (CHECK cặp); partial UNIQUE `(organization_id, application_id, identifier_type, normalized_identifier) WHERE ended_at IS NULL`.
  - `usage_unmatched_identities`: `id`, `organization_id`, `application_id`, `source_id`, `identifier_type`, `normalized_identifier`, `raw_identifier`,
    `reason {NOT_FOUND, AMBIGUOUS}`, `status {OPEN, DISMISSED, RESOLVED}`, `candidate_employee_ids uuid[]` (≤ 10), `first_import_id`, `last_import_id`,
    `resolved_mapping_id NULL`, `handled_by_app_user_id NULL`, `handled_at NULL`, `note NULL`; partial UNIQUE `status <> 'RESOLVED'` theo (org, app, type, identifier).
  - `usage_no_assignment_findings` (`FR-4.8`, Q-84): `id`, `organization_id`, `application_id`, `employee_id`, `first_activity_date`,
    `last_activity_date`, `last_import_id`, `status {OPEN, CLOSED}`, `closed_at`, `closed_reason`; partial UNIQUE mở `(org, application, employee)`.
- `usage/`: `vendor-source/` (controller, dto, service, policy + spec, repo, template codec + spec, errors, http-errors), `vendor-import/` (nhóm `parse/`,
  `preview/`, `confirmation/`, `match/`), `identity/` (controller hàng đợi, ánh xạ, phát hiện sai lệch), `usage-evidence/` (L0: service, repo, policy +
  spec), `usage.module.ts`, `usage-audit-event.mapper.ts`, `README.md`. Mỗi thư mục ≤ 25 file.
- `usage/public/usage-evidence.api.ts` + `usage-evidence.types.ts` (`UsageEvidenceApi.evidenceFor`, `openFindingCount`),
  `usage/public/usage.extension-points.ts` (`UsageImportListeners`, moment `CONFIRMED { importId, sourceId, applicationId, coverageTo }`).
- Facade khác: `organization/public/organization-read.api.ts` thêm `findEmployeesByWorkEmails(normalizedEmails, tx?)` (gồm người `TERMINATED`; trả
  `employeeCode`, `workEmail`, không họ tên); `licensing/public/licensing.api.ts` thêm `listAssignmentIntervals({ planIds, employeeIds, from, to }, tx?)`,
  `findHoldersByAccountIdentifiers(planIds, normalizedIdentifiers, tx?)`, `listCurrentHolders(applicationId, asOf, tx?)` (người nhận thông báo theo dõi);
  `devices/public/devices.api.ts` thêm `registrationHolders(registrationIds, tx?)` (hiện chỉ `holderRegistrationIds` :43). Đọc cờ liên lạc qua
  `CatalogApi.getCollectorApplications` (`catalog/public/catalog.api.ts:81` — `isCommunicationService`, kiểu ứng dụng).
- Mã thông báo `USAGE_TRACKING_NOTICE` (params `applicationName`, `activityDefinition`, `dataKinds`, `purpose`, `retentionMonths`, `viewPath` — `US-08-05` AC-2)
  ở `notifications/public/notifications.types.ts:50-123`; cột `code` là `String` ⟹ không migration.
- Operation mới (IT_ADMIN, 15): `usageSourceCreate`, `usageSourceList`, `usageSourceGet`, `usageSourceUpdate`, `usageImportUpload`, `usageImportGet`,
  `usageImportRowList`, `usageImportConfirm`, `usageImportCancel`, `usageUnmatchedIdentityList`, `usageUnmatchedIdentityResolve`,
  `usageUnmatchedIdentityDismiss`, `usageIdentityMappingList`, `usageIdentityMappingEnd`, `usageNoAssignmentFindingList`. Đổi: `itAdminDashboardGet`
  (`discrepancies` `notAvailable` → `counted` — `dashboards/it-admin/it-admin-dashboard.service.ts:67`).

## Behavior and design

1. **Nguồn** (`FR-4.2`, `FR-4.4`, `FR-4.16`): ứng dụng phải là SaaS bên ngoài đang dùng (nội bộ ⟹ 422 `USAGE_SOURCE.APPLICATION_INTERNAL` — `QĐ-62o`);
   ứng dụng mang cờ liên lạc ⟹ 422 `USAGE_SOURCE.COMMUNICATION_APP` (`US-08-02` AC-3, `BR-17.8` — DA6-06), cả ở `usageImportUpload`. `template` theo
   `report_shape`: `AGGREGATE` cần cột định danh + (`activeDates` hoặc `lastActivityDate`); `EVENT` cần định danh, ngày, loại sự kiện và bảng phân loại
   `eventType → VALUE|PASSIVE|AUTH_ONLY|IGNORED`. Cờ năng lực phải khớp mẫu (có cột ngày ⟹ `cap_last_activity` hoặc `cap_event_detail`; khai năng lực
   mà mẫu thiếu cột ⟹ 422 `USAGE_SOURCE.TEMPLATE_CAPABILITY_MISMATCH`). Đọc trả `detectableGroups` (`FR-4.4`: chỉ thành viên ⟹ `G1,G2`; + ngày cuối
   hoặc chi tiết sự kiện ⟹ `G1→G4`) và `limitation` (câu `US-08-01` AC-2). Sửa nguồn chỉ áp cho lần nhập sau (audit trước/sau); nguồn có lần nhập
   `COMPLETED` không đổi `identifier_type`, `application_id` (409 `USAGE_SOURCE.IN_USE`).
2. **Tải lên** (`usageImportUpload`, multipart `file` + `sourceId`, `coverageFrom?`, `coverageTo?`): UTF-8 (±BOM), ≤ 10 MB (413), ≤ 50 000 dòng
   (422 `FILE_TOO_MANY_ROWS`), JSON đúng `schema` (422 `SCHEMA_UNSUPPORTED`), `source.application` khác nguồn ⟹ 422 `SOURCE_MISMATCH`. Chỉ ghi `PREVIEW`
   (24 h) + dòng tạm; `summary` nêu cửa sổ, số chưa khớp, **số quyền bị ảnh hưởng**, nhóm phát hiện được, định nghĩa hoạt động (`US-08-02` AC-1).
3. **Cửa sổ bao phủ** (`FR-4.3`, `INV-10`): khai ⟹ `DECLARED`; không khai ⟹ min/max ngày (`DERIVED`) — chỉ `EVENT` hoặc `AGGREGATE` có `activeDates`;
   `lastActivityDate` không khai cửa sổ ⟹ 422 `WINDOW_REQUIRED`. Ngày `> coverage_to` ⟹ dòng `INVALID`; ngày `< coverage_from` ⟹ `INVALID`, **trừ**
   `basis = LAST_ACTIVITY` (báo cáo tổng hợp: ngày cuối trước cửa sổ là sự thật hợp lệ — lưu, dùng làm ngày cuối — DA6-10). Cửa sổ dài hơn
   `cap_max_history_days` ⟹ cảnh báo trong `summary`.
4. **Phân loại** (`FR-4.11`): `AUTH_ONLY` lưu nhưng **không** là hoạt động (vẫn là _xuất hiện_ — g3-g4); `IGNORED` bỏ; loại chưa phân loại ⟹ confirm 422
   `EVENT_TYPE_UNMAPPED` (`details.eventTypes`) — không đoán (TC-2).
5. **Khớp danh tính** (`FR-4.5`, `FR-4.6`; QT 5.2): (0) JSON `identity.status = NOT_A_PERSON` ⟹ bỏ; (1) ánh xạ còn hiệu lực; (2) `EXACT_EMAIL`
   (`normalized_work_email`, gồm người đã nghỉ) / `ACCOUNT_IDENTIFIER` (`normalized_account_identifier` của Assignment trên plan của ứng dụng) — `HIGH`;
   (3) `ALIAS_RULE` (bỏ `+tag`, tên miền cũ → `getCompanyEmailDomains`) — `MEDIUM`. ≥ 2 ứng viên ⟹ `AMBIGUOUS`; 0 ⟹ `NOT_FOUND`; cả hai vào
   `usage_unmatched_identities` (mở hoặc cập nhật `last_import_id`). Khớp mới ở bước 2–3 ghi ánh xạ (kèm `raw_identifier`) khi xác nhận.
6. **Xác nhận** (`usageImportConfirm` `{ previewVersion, notice? }` + `Idempotency-Key`): khóa **nguồn** `FOR UPDATE` (xếp hàng theo nguồn — DA6-12)
   rồi import `FOR UPDATE`; tính lại preview; lệch ⟹ 409 `PREVIEW_STALE`; cùng key ⟹ kết quả cũ; khác key ⟹ 409 `ALREADY_CONFIRMED`; hết hạn/hủy ⟹
   409 `NOT_OPEN`. **Thông báo theo dõi trước khi ghi** (`US-08-05`): lần `COMPLETED` đầu của ứng dụng cần `notice` — `CONFIRMED_DELIVERED` (IT xác
   nhận đã báo) hoặc `SYSTEM_SENT`; thiếu ⟹ 422 `TRACKING_NOTICE_REQUIRED`. **Mọi** lần xác nhận (kể cả lần đầu `CONFIRMED_DELIVERED`) gửi
   `USAGE_TRACKING_NOTICE` tới mọi người đang giữ quyền của ứng dụng (`listCurrentHolders`), `eventKey = USAGE_TRACKING_NOTICE:<applicationId>` —
   người đã nhận thì `notifyInApp` trả `false` (`notifications.api.ts:53`), người mới cấp nhận lần đầu (DA6-08). Ghi `notice_at` rồi mới ghi
   `usage_activity_days` theo chunk ≤ 5 000; dòng chưa khớp vẫn ghi (gắn lúc đọc), không dùng để kết luận (`INV-12`).
7. **Chồng lấn** (`US-08-07` AC-3): cùng nguồn, ngày trong cửa sổ của hai lần nhập ⟹ lần có `coverage_to` lớn hơn thắng (bằng nhau: xác nhận sau
   thắng); ngày của lần thua trong khoảng chồng lấn đặt `superseded_by_import_id`. Khóa nguồn ⟹ hai xác nhận song song nối tiếp. Bản chụp không đổi.
8. **Sai lệch `FR-4.8`** (Q-84): sau ghi, mỗi nhân viên đã khớp có ngày `VALUE|PASSIVE` mà **không** Assignment nào của plan thuộc ứng dụng phủ ngày
   đó (`listAssignmentIntervals`) ⟹ upsert phát hiện `OPEN`; không tạo Assignment. Lần nhập sau thấy Assignment phủ ⟹ `CLOSED`.
9. **Hàng đợi** (`identity/`, `US-08-04`): danh sách mặc định `OPEN` + `DISMISSED` (_bỏ qua_ ở lại hàng đợi — AC-7); ứng viên chỉ `{ employeeCode,
workEmail }`, không họ tên (AC-4). `Resolve { employeeId }` ⟹ ánh xạ `MANUAL` (`raw_identifier`, người xác nhận); định danh đã có ánh xạ hiệu lực
   ⟹ 409 `USAGE_IDENTITY.ALREADY_MAPPED`; `Dismiss { note }` ⟹ `DISMISSED` (vẫn chặn kết luận); đã `RESOLVED` ⟹ 409 `ALREADY_HANDLED`.
   `usageIdentityMappingEnd { reason }` (sửa ánh xạ sai — DA6-11) ⟹ `ended_at`, định danh về hàng đợi `OPEN`; đọc lại tự gắn đúng người. Mỗi thao tác audit.
10. **Bằng chứng** (`UsageEvidenceApi.evidenceFor({ applicationId, employeeIds, asOf })`; một số câu lệnh cố định): nguồn nhà cung cấp (lần nhập
    `COMPLETED` gần nhất, cửa sổ hợp nhất, `ageDays = asOf − coverage_to`, `stale = ageDays > 7`, độ chặt, định nghĩa, `canConcludeAbsence = true`
    chỉ khi `POSITIVE_AND_NEGATIVE` **và** (`cap_last_activity` hoặc `cap_event_detail`) — DA6-14, `detectableGroups`) và collector (`ai_usage_days`,
    người giữ thiết bị theo ngày qua `devices`; `responses > 0` = hoạt động; `COVERED|PARTIAL` = bao phủ; `stale = ageDays > 14`; luôn
    `canConcludeAbsence = false` — `FR-4.14a`). Ngưỡng 7/14 là hằng theo loại nguồn trong `usage-evidence.policy.ts` (`QĐ-101b`; QT A.4 _quy tắc_ —
    DA6-09). Theo nhân viên (nối ánh xạ còn hiệu lực lúc đọc): ngày hoạt động không bị thay thế, `appeared` (có bất kỳ dòng, kể cả `AUTH_ONLY`),
    `lastAuthOnlyDate`, phương pháp khớp yếu nhất, `mappingChangedOn`; định danh `OPEN|DISMISSED` của ứng dụng kèm ngày cuối và `candidateEmployeeIds`.
    Chỉ trả ngày, **không** khối lượng.
11. **Sự kiện**: emit `UsageImportListeners.CONFIRMED` trong `tx` xác nhận (g3-g4 bind để đóng khuyến nghị bị phủ định).
12. **Quyền và riêng tư**: mọi operation chỉ `IT_ADMIN` (trưởng phòng không thấy dữ liệu thô — `QĐ-101i`, `US-10-04` AC-10); audit
    `USAGE_SOURCE.*`, `USAGE_IMPORT.*`, `USAGE_IDENTITY.*`.

## Test matrix

| AC / rủi ro               | Tình huống (gồm từ chối, edge case)                                                                | Cấp test           | Kết quả mong đợi                                                                                        | Bằng chứng sau implement |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| `INV-11`, `FR-4.16`       | tạo nguồn thiếu `activityDefinition`; ứng dụng nội bộ                                              | http + DB          | 400 / 422 `APPLICATION_INTERNAL`; INSERT thẳng thiếu cột ⟹ 23502                                        |                          |
| `US-08-02` AC-3           | tạo nguồn cho Slack mang cờ liên lạc; upload vào nguồn của Slack (cờ bật sau khi tạo)              | http               | 422 `COMMUNICATION_APP` cả hai, không ghi                                                               |                          |
| `FR-4.4`, `US-08-01` AC-2 | nguồn chỉ thành viên; + ngày cuối; `POSITIVE_ONLY`; khai `cap_last_activity` mà mẫu thiếu cột ngày | unit + http        | `[G1,G2]` + câu giới hạn / `[G1..G4]` / `canConcludeAbsence=false` / 422 `TEMPLATE_CAPABILITY_MISMATCH` |                          |
| `INV-10`, `FR-4.3`        | `lastActivityDate` không khai cửa sổ; cửa sổ 400 ngày; ngày `ACTIVE_DATE` ngoài cửa sổ             | http + DB          | 422 `WINDOW_REQUIRED` / 422 `WINDOW_INVALID` / dòng `INVALID`                                           |                          |
| `FR-4.10` (DA6-10)        | `AGGREGATE` cửa sổ 90 ngày, `lastActivityDate` 150 ngày trước; ngày cuối sau `coverage_to`         | integration        | lưu `LAST_ACTIVITY` / `INVALID`                                                                         |                          |
| `FR-4.3` suy ra           | CSV `EVENT` không khai cửa sổ, ngày 01/06→31/08                                                    | integration        | `DERIVED` 01/06–31/08                                                                                   |                          |
| `FR-4.11`                 | `login` phân loại `AUTH_ONLY`; `export` chưa phân loại                                             | integration        | lưu, không là hoạt động, `appeared = true` / confirm 422 `EVENT_TYPE_UNMAPPED`                          |                          |
| `FR-4.5` khớp             | email chính xác; `+tag`; tài khoản = `account_identifier`; email người đã nghỉ                     | unit + integration | `EXACT_EMAIL HIGH` / `ALIAS_RULE MEDIUM` / `ACCOUNT_IDENTIFIER HIGH` / khớp                             |                          |
| `FR-4.6`, `INV-12`        | M365: 200 subject, 12 không khớp, 1 khớp 2 người                                                   | integration        | 12 `NOT_FOUND` + 1 `AMBIGUOUS` vào hàng đợi; `evidenceFor` không gán ngày của họ                        |                          |
| `US-08-04` AC-1, AC-4     | `Resolve` `baovh` → `SE183866`; xem gợi ý ứng viên                                                 | http               | ánh xạ `MANUAL`, `raw_identifier = baovh`, người xác nhận / chỉ mã NV + email                           |                          |
| QT 5.2, AC-7              | `Resolve` định danh đã ánh xạ người khác; `Dismiss` rồi list; `Dismiss` → `Resolve`; xử lý lần hai | http               | 409 `ALREADY_MAPPED` / còn trong list / `RESOLVED` / 409 `ALREADY_HANDLED`                              |                          |
| sửa ánh xạ (DA6-11)       | ánh xạ `MANUAL` sai `x1 → E1`; `MappingEnd` rồi `Resolve x1 → E2`                                  | integration        | `evidenceFor(E1)` mất ngày của `x1`, `evidenceFor(E2)` có; `mappingChangedOn`                           |                          |
| preview → confirm         | upload không ghi ngày; `previewVersion` cũ; cùng key; khác key; sau 24 h                           | http + integration | 0 ngày / 409 `PREVIEW_STALE` / kết quả cũ / 409 `ALREADY_CONFIRMED` / 409 `NOT_OPEN`                    |                          |
| đua (DA6-12)              | hai confirm đồng thời cùng import; hai import chồng lấn cùng nguồn xác nhận đồng thời              | integration        | một ghi + idempotent/409; ngày chồng lấn chỉ của import `coverage_to` lớn hơn                           |                          |
| `US-08-05` AC-1→AC-3      | lần đầu thiếu `notice`; `SYSTEM_SENT` 70 người giữ; `CONFIRMED_DELIVERED`                          | http + integration | 422 / 70 nhận (đủ 6 params), `notice_at` < mọi `created_at` của ngày / không 422                        |                          |
| `US-08-05` AC-4 (DA6-08)  | lần nhập hai có `E9` mới được cấp sau lần đầu                                                      | integration        | `E9` nhận 1 `USAGE_TRACKING_NOTICE` trước khi ngày của `E9` được ghi; người cũ không nhận lại           |                          |
| chồng lấn                 | lần 1 01/06–31/07, lần 2 15/07–31/08 cùng nguồn, giá trị khác ngày 20/07                           | integration        | ngày 15/07–31/07 của lần 1 `superseded_by` lần 2                                                        |                          |
| `FR-4.8` (Q-84)           | `E9` có hoạt động Figma 10/08 không Assignment; lần sau có Assignment phủ                          | integration        | phát hiện `OPEN`, không Assignment mới / `CLOSED`                                                       |                          |
| chuỗi gia hạn             | `listAssignmentIntervals` trả 2 mắt xích nối `predecessorId`                                       | integration        | đủ khoảng, `usableOn` theo `QĐ-77n`                                                                     |                          |
| độ mới (DA6-09)           | Figma bao phủ cuối 01/09, `asOf` 09/09; collector cuối 01/09, `asOf` 12/09 và 16/09                | unit + integration | Figma `stale` (8 > 7) / collector không / có (`US-10-02` AC-14)                                         |                          |
| năng lực (DA6-14)         | nguồn chỉ thành viên đã xác nhận import                                                            | unit               | `canConcludeAbsence = false`, `detectableGroups = [G1,G2]`                                              |                          |
| bằng chứng dương          | collector `stale` có hoạt động 30/08 của `E1`                                                      | integration        | ngày 30/08 vẫn trả về                                                                                   |                          |
| riêng tư                  | `evidenceFor` không trả `responses`, token, sự kiện thô; `H1` gọi `usageImportGet`                 | unit + http        | chỉ ngày + siêu dữ liệu / 403                                                                           |                          |
| giới hạn file             | 50 001 dòng; 11 MB; UTF-16 không BOM; schema lạ                                                    | http               | 422 / 413 / 415 hoặc 422 / 422 `SCHEMA_UNSUPPORTED`                                                     |                          |
| hiệu năng                 | 50 000 dòng xác nhận                                                                               | integration        | xong trong timeout test, chunk ≤ 5 000                                                                  |                          |
| dashboard                 | `itAdminDashboardGet` có 2 phát hiện mở                                                            | http               | `discrepancies` `counted` = 2                                                                           |                          |
| `L4-03` giữ               | test intake collector hiện có                                                                      | integration + http | xanh, không đổi                                                                                         |                          |
| migration                 | CHECK cửa sổ; trigger `usage_activity_days` sửa cột khác `superseded_by`; UNIQUE ánh xạ hiệu lực   | integration (DB)   | 23514 / 55000 / 23505                                                                                   |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI thêm đúng 15 operation + đổi `itAdminDashboardGet` (lỗi có ví dụ); gate `api-coverage-manifest`, ví dụ mã lỗi
      (`test/support/openapi-example-route-codes-*.ts`) và registry danh sách cập nhật; codec cho mọi cột JSON.
- [ ] README `usage` (bảng, luồng, thông báo theo dõi, quyền riêng tư, gắn lúc đọc, facade, extension point), `organization`, `licensing` cập nhật.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W6 (subagent soạn, scratch). Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W6 (`design-audit-w6.md`): DA6-06 chặn ứng dụng liên lạc, DA6-07 AC `EP-08`, DA6-08 báo người được cấp sau,
  DA6-09 độ mới hằng theo loại nguồn, DA6-10 ngày cuối trước cửa sổ, DA6-11 gắn lúc đọc + kết thúc ánh xạ, DA6-12 khóa nguồn, DA6-14 năng lực,
  DA6-32, DA6-37. Thiết kế `ready`, chờ chat review duyệt.
