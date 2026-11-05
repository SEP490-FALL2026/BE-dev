# Spec: g7-vendor-usage-import-identity — nguồn usage nhà cung cấp, import báo cáo JSON, khớp danh tính, thông báo theo dõi

- Phụ trách: Cursor/dev được Owner giao.
- Thiết kế ban đầu bởi: Owner + Claude (phiên 05/11/2026).
- Thiết kế: `draft` — **spec dang dở, chưa review** (agent viết spec dừng giữa chừng; điều phối viên hạ `ready` → `draft` 05/11/2026, plan khung). Owner review: thiết kế đã duyệt 05/11/2026 (DESIGN.md); spec chưa review.
- Nguồn: Docs `3d73a7f` + thay đổi chưa commit 05/11/2026 (`QĐ-101`, BRD v4.1, US đã sửa) — BRD `FR-4.1`→`FR-4.8`,
  `FR-4.10`, `FR-4.11`, `FR-4.16`, `FR-7.1`→`FR-7.7`, `FR-10.4`, `INV-10`→`INV-12`, Phụ lục D.1; `EP-08` (`US-08-01`→`US-08-05`,
  `US-08-07`); `QĐ-101h`, `QĐ-28a`, `QĐ-35c`, `QĐ-100af`. BE `3e4553b9` (đối chiếu thêm HEAD `808318a4` ngày 05/11: chỉ thêm
  module `ai-assist` ở T6, không đổi file nào spec này trích). Tool: `Code/Tools/workstreams/vendor-sources`
  (`src/core/report.mjs`, `spec.md` §2–§4).
- Thiết kế gốc: [DESIGN.md](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md) §0 (F-1…F-6), §4, §7, §10, §11.
- Nhóm roadmap: G7 — chỉ là planning container (xem `## Sizing decision`). [Kế hoạch](plan.md) · [Test plan](test-plan.md).

## Business outcome

IT Admin khai một nguồn usage nhà cung cấp cho một ứng dụng, tải **báo cáo JSON chuẩn hóa** do vendor-sources sinh, xem
trước (chưa khớp, cửa sổ, số quyền bị ảnh hưởng, nhóm phát hiện được, định nghĩa hoạt động, nhãn mô phỏng), gửi thông báo
theo dõi cho người giữ seat rồi xác nhận; hệ thống ghi `usage_records` theo từng ngày hoạt động gắn Assignment hiệu lực tại
ngày đó, đưa định danh chưa khớp vào hàng đợi để IT gán tay/bỏ qua. Kiểm bằng HTTP + integration trên Postgres thật.

## Sizing decision

- Container: G7 (thiết kế G7 05/11/2026, lát S3a của DESIGN.md §12).
- Mode: `grouped-stories`.
- Outcome and owner: bằng chứng usage nhà cung cấp vào kho usage có danh tính đã khớp; module mới `usage` (T6), capability
  `usage-source`, `usage-import`, `usage-identity`, `usage-record`, `usage-tracking-notice`.
- Boundaries: một migration (8 bảng); ghi trong transaction xác nhận import / gán tay / gửi thông báo; 16 route IT_ADMIN;
  một sweeper theo giờ (người mới giữ seat); đọc catalog/licensing/organization qua facade, ghi thông báo qua notifications.
- Not larger: mẫu CSV (`g7-vendor-usage-csv-template`); rule G1–G4, ngày hoạt động cuối theo chuỗi, cổng độ mới
  (`g7-g1-g2-recommendations`, `g7-g3-g4-decisions`); xóa theo hạn lưu (`g7-usage-downstream-retention`); collector.
- Not smaller: cổng thông báo (US-08-05) chặn đúng bước ghi của xác nhận; khớp danh tính và hàng đợi (US-08-04) dùng chung
  khóa định danh và hàm gắn Assignment với xác nhận (US-08-03); tách ra thì mỗi phần không có đường kiểm chứng riêng.
- Siblings: `g7-vendor-usage-csv-template`, `g7-ai-usage-intake`, `g7-browser-usage-intake`, `g7-g3-g4-decisions`,
  `g7-usage-downstream-retention`.
- Scope map: [G7](../../../roadmap.md#work-item-decomposition-g7) — dòng map do điều phối viên đăng ký.

## Size exception

- Cohesion: sáu Story là sáu bước của một luồng `SBF-04a` (nguồn → tải → khớp → cổng thông báo → ghi/gắn → hàng đợi) trên
  cùng bảng `usage_records`; mỗi Story chỉ giữ AC của vế lưu trữ/khớp, vế rule ở sibling.
- Why not split: tách cổng thông báo hay hàng đợi khỏi xác nhận sẽ phải dựng xác nhận giả để test; khóa định danh và chính
  sách gắn Assignment bị hai hạng mục cùng sửa.
- Checkpoints: bốn phase của [plan](plan.md) (A nền + facade, B nguồn + policy thuần, C thông báo + import, D hàng đợi +
  chống field ma), mỗi phase một checkpoint gate xanh.
- Maximum scope: chỉ nguồn `VENDOR_REPORT`; không CSV, không PATCH nguồn, không rule/tầng/mức tin cậy, không đọc
  `assignment_usage_states`, không màn trưởng phòng, không xóa theo hạn lưu, không gợi ý khớp mờ (`OQ-E-03`).
- Accepted by: Owner duyệt thành phần lát S3a ở DESIGN.md §12 ngày 05/11/2026; ngoại lệ kích thước chờ Owner xác nhận khi
  review spec.

## Primary Story/AC

| Story    | AC                    | Coverage | Phần còn lại thuộc                                                                                           |
| -------- | --------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| US-08-01 | AC-8                  | partial  | AC-1→AC-5, AC-7: `g7-vendor-usage-csv-template`; AC-6: `g7-browser-usage-intake`; AC-9: `g7-ai-usage-intake` |
| US-08-02 | AC-1→AC-3, AC-5, AC-6 | partial  | AC-4: `g7-g3-g4-decisions`; AC-7: `g7-vendor-usage-csv-template`                                             |
| US-08-03 | AC-1, AC-3            | partial  | AC-2: `g7-vendor-usage-csv-template`; AC-4: `g7-g3-g4-decisions`                                             |
| US-08-04 | AC-1, AC-3→AC-7       | partial  | AC-2: `g7-g3-g4-decisions`                                                                                   |
| US-08-05 | AC-1→AC-6             | full     | —                                                                                                            |
| US-08-07 | AC-3                  | partial  | AC-1, AC-2, AC-4: `g7-g3-g4-decisions`                                                                       |

`US-08-06` là `RESEARCH-DEPENDENT` — không claim (scope map: `deferred`/`not affected` do điều phối viên chọn).

## Supporting references

`FR-4.4` (policy `usage-capability.policy.ts` dựng ở đây, `US-08-01` AC-2 do CSV claim); `US-08-01` AC-7 (route POST/GET chỉ
IT_ADMIN — test quyền ở đây, AC do CSV claim cùng PATCH); `US-08-02` AC-7 vế JSON (từ chối JSON sai cấu trúc — làm ở đây,
CSV claim cả AC); `US-08-03` AC-2 vế JSON (bỏ `signals`, từ chối báo cáo `auth_only`); `US-08-03` AC-4 (ghi đúng mắt xích
Assignment, đọc chuỗi ở rule); `FR-7.4` (cảnh báo trùng theo `contentHash`); `US-02-01` AC-6 (`normalizeEmail` của
`src/core/email.ts:17`); `BR-17.8`; ADR-0005, ADR-0018, ADR-0019; `QĐ-100af` (hạn lưu 6 tháng).

## Explicit out of scope

- Nguồn `VENDOR_CSV`, mẫu cột, `PATCH /usage-sources/{id}`, khai cửa sổ tay (`g7-vendor-usage-csv-template`).
- Tính lại tình trạng sử dụng/tầng/mức tin cậy, cổng 6, hợp nhất đa nguồn (`g7-g3-g4-decisions`); hàng đợi sai lệch IT
  của `US-07-06`/`SBF-08` (ở đây chỉ lưu bản ghi `NO_ASSIGNMENT`).
- Nguồn collector (`AI_COLLECTOR`, `BROWSER_EXTENSION`): hạng mục collector tự thêm giá trị enum và dòng seed.
- Gợi ý ứng viên khớp mờ (`OQ-E-03`); xác nhận "đã thông báo ngoài hệ thống" (Câu hỏi mở Q2); xóa theo hạn lưu.

## Dependencies and blockers

Không phụ thuộc lát G7 khác (S3a chạy trước S2a được). **Bootstrap module `usage`** là task riêng làm idempotent: lát nào tới
trước (`g7-vendor-usage-import-identity` hoặc `g7-ai-usage-intake`) tạo khung; lát sau chỉ thêm capability. Bảng
`usage_sources` **do lát này tạo**; lát collector thêm giá trị enum sau. Migration là Task 1, đi trước mọi code.

## Ownership: module, data, API

- Module `usage` (T6, thêm vào `scripts/arch/tiers.cjs:9`) đọc: `catalog` (T4, `CatalogApi`), `licensing` (T4, facade mới
  `LicensingUsageApi`), `organization` (T2, `OrganizationReadApi`), `notifications` (T1), `audit` (T1).
- Facade thêm ở module dưới (task riêng): `CatalogApi.getUsageApplicationFacts(ids, tx?)` → `{ id, name, kind,
isCommunicationService, retired, planIds }` (`prisma/models/catalog.prisma:126-165`); `LicensingUsageApi`
  (`public/licensing-usage.api.ts`): `personalAssignmentsForUsage({ planIds, employeeIds?, accountIdentifiers?, from, to },
tx?)`, `serviceAccountIdentifiers(planIds, identifiers, tx?)`, `holdersOf(planIds, onDate, tx?)` — "giữ seat tại ngày d" =
  `validFrom ≤ d`, `validUntil` null hoặc `> d`, `failedAt`/`cancelledAt` null (như `HOLDING`,
  `licensing/assignment/assignment.repo.ts:38-42`); khóa tài khoản là `normalizedAccountIdentifier`
  (`prisma/models/licensing.prisma:35`, chuẩn hóa bằng `normalizeAccountIdentifier`, `licensing/public/account-identifier.policy.ts`);
  `OrganizationReadApi.findEmployeesByNormalizedWorkEmails(emails, tx?)` (cột `normalized_work_email`,
  `prisma/models/organization.prisma:244`); `NotificationsApi.emailStatesByIds(ids)` + mã in-app `USAGE_TRACKING_STARTED` +
  mẫu mail `USAGE_TRACKING_NOTICE` (`notifications/public/notifications.types.ts`, `email/email-templates.mapper.ts`).
- Bảng mới (module `usage`): `usage_sources`, `usage_imports`, `usage_import_rows`, `usage_records`,
  `usage_identity_mappings`, `usage_unmatched_identities`, `usage_tracking_notices`, `usage_tracking_notice_recipients`.
- Route mới (`/api/v1`, tất cả `@RequireRoles('IT_ADMIN')`; Finance/Manager/Employee/Super Admin/Spending Approver ⟹ 403):

| Method + path                                 | operationId                        | message                                   | Status |
| --------------------------------------------- | ---------------------------------- | ----------------------------------------- | ------ |
| `POST /usage-sources`                         | `usageSourceCreate`                | `USAGE_SOURCE.CREATED`                    | 201    |
| `GET /usage-sources`                          | `usageSourceList`                  | `USAGE_SOURCE.LISTED`                     | 200    |
| `GET /usage-sources/{id}`                     | `usageSourceGet`                   | `USAGE_SOURCE.FETCHED`                    | 200    |
| `POST /usage-imports` (multipart)             | `usageImportUpload`                | `USAGE_IMPORT.UPLOADED`                   | 201    |
| `GET /usage-imports/{id}`                     | `usageImportGet`                   | `USAGE_IMPORT.FETCHED`                    | 200    |
| `GET /usage-imports/{id}/rows`                | `usageImportRowList`               | `USAGE_IMPORT.ROWS_LISTED`                | 200    |
| `POST /usage-imports/{id}/preview-refreshes`  | `usageImportPreviewRefresh`        | `USAGE_IMPORT.PREVIEW_REFRESHED`          | 201    |
| `POST /usage-imports/{id}/confirmations`      | `usageImportConfirm`               | `USAGE_IMPORT.CONFIRMED`                  | 201    |
| `POST /usage-imports/{id}/cancellations`      | `usageImportCancel`                | `USAGE_IMPORT.CANCELLED`                  | 201    |
| `GET /unmatched-identities`                   | `unmatchedIdentityList`            | `UNMATCHED_IDENTITY.LISTED`               | 200    |
| `POST /unmatched-identities/{id}/resolutions` | `unmatchedIdentityResolve`         | `UNMATCHED_IDENTITY.RESOLVED`             | 201    |
| `POST /unmatched-identities/{id}/dismissals`  | `unmatchedIdentityDismiss`         | `UNMATCHED_IDENTITY.DISMISSED`            | 201    |
| `GET /identity-mappings`                      | `identityMappingList`              | `IDENTITY_MAPPING.LISTED`                 | 200    |
| `GET /usage-tracking-notices`                 | `usageTrackingNoticeList`          | `USAGE_TRACKING_NOTICE.LISTED`            | 200    |
| `POST /usage-tracking-notices`                | `usageTrackingNoticeSend`          | `USAGE_TRACKING_NOTICE.SENT`              | 201    |
| `GET /usage-tracking-notices/{id}/recipients` | `usageTrackingNoticeRecipientList` | `USAGE_TRACKING_NOTICE.RECIPIENTS_LISTED` | 200    |

## Behavior and design

### Request — bảng field (F-1…F-4; mọi body/query `z.strictObject`; `page` ≥ 1 mặc định 1, `pageSize` 1–100 mặc định 50)

| Route / field                                          | Kiểu & ràng buộc                                            | Bắt buộc? (ca vắng)               | Nguồn                       | Dùng ở                                    |
| ------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------- | --------------------------- | ----------------------------------------- |
| `POST /usage-sources` `kind`                           | `literal('VENDOR_REPORT')` (CSV thêm biến thể ở sibling)    | có                                | IT chọn loại nguồn          | US-08-01; chọn parser lúc upload          |
| ″ `applicationId`                                      | uuid                                                        | có                                | IT chọn từ catalog          | US-08-01 AC-8, BR-17.8                    |
| `GET /usage-sources` `applicationId`                   | uuid                                                        | không (vắng = mọi ứng dụng)       | màn ứng dụng                | màn nguồn của ứng dụng (US-08-01)         |
| `POST /usage-imports` `file`                           | multipart, ≤ 10 MiB, UTF-8 JSON (±BOM)                      | có                                | file của vendor-sources     | US-08-02 AC-1, AC-7                       |
| ″ `sourceId`                                           | uuid (text field ≤ 64 byte)                                 | có                                | IT chọn nguồn               | binding, US-08-02                         |
| `GET /usage-imports/{id}/rows` `outcome`               | enum outcome dòng (bảng dưới)                               | không (vắng = mọi dòng)           | màn xem trước               | US-08-02 AC-1 (lọc chưa khớp)             |
| `POST …/confirmations` `previewVersion`                | int > 0                                                     | có                                | FE đọc từ preview           | chống xác nhận preview cũ (US-02-01 AC-9) |
| ″ `idempotencyKey`                                     | string 8–128                                                | có                                | FE sinh một lần mỗi lần bấm | ghi một lần (US-02-01 AC-8)               |
| `GET /unmatched-identities` `applicationId`            | uuid                                                        | không (vắng = mọi ứng dụng)       | màn hàng đợi                | US-08-04                                  |
| ″ `status`                                             | `OPEN`\|`DISMISSED`\|`RESOLVED`                             | không (vắng = `OPEN`+`DISMISSED`) | màn hàng đợi                | US-08-04 AC-7 (mục bỏ qua vẫn ở hàng đợi) |
| `POST …/resolutions` `employeeId`                      | uuid                                                        | có                                | IT chọn nhân viên           | US-08-04 AC-1, AC-6                       |
| `POST …/dismissals` `reason`                           | string trim 1–500                                           | có                                | IT                          | US-08-04 AC-7 (hiện ở hàng đợi + audit)   |
| `GET /identity-mappings` `applicationId`, `employeeId` | uuid                                                        | không (vắng = không lọc)          | màn ánh xạ                  | US-08-04 AC-1 (giải trình)                |
| ″ `method`                                             | `EXACT_EMAIL`\|`ACCOUNT_IDENTIFIER`\|`ALIAS_RULE`\|`MANUAL` | không                             | màn ánh xạ                  | US-08-04                                  |
| `GET /usage-tracking-notices` `applicationId`          | uuid                                                        | có                                | màn ứng dụng                | US-08-05 AC-2                             |
| `POST /usage-tracking-notices` `applicationId`         | uuid                                                        | có                                | IT bấm "gửi thông báo"      | US-08-05 AC-1, AC-2                       |

Không nhận: `organizationId`, id người thao tác (lấy từ principal), `employeeRef` của báo cáo, timezone (lấy
`Organization.timeZone`), trạng thái/tầng/mức tin cậy. `preview-refreshes`, `cancellations`, `{id}` của GET: không body.

```ts
export const usageSourceCreateSchema = z.strictObject({ kind: z.literal('VENDOR_REPORT'), applicationId: z.uuid() });
export const usageImportUploadSchema = z.strictObject({ sourceId: z.uuid() });
export const usageImportConfirmSchema = z.strictObject({
  previewVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
});
export const unmatchedResolveSchema = z.strictObject({ employeeId: z.uuid() });
export const unmatchedDismissSchema = z.strictObject({ reason: z.string().trim().min(1).max(500) });
export const trackingNoticeSendSchema = z.strictObject({ applicationId: z.uuid() });
```

### Báo cáo JSON: BE đọc gì, bỏ gì

Chỉ nhận `schema === 'saas-sentry.vendor-usage-report/0.1-proposal'` (khác ⟹ 422 `USAGE_IMPORT.SCHEMA_UNSUPPORTED`). Khóa
cấp trên và trong object được đọc là tập đóng của `REPORT_SCHEMA` (`report.mjs:156-182`); khóa lạ ⟹ 422
`USAGE_IMPORT.REPORT_INVALID` (`details.path` chỉ gồm tên khóa/chỉ số, không giá trị).

| Đọc                                                                                                                                  | Dùng                                                                                                        | Bỏ qua (nhận, không lưu)                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `contentHash`                                                                                                                        | cảnh báo trùng (`FR-7.4`)                                                                                   | `idempotencyKey`, `unresolvedCount`, `droppedFields`                                           |
| `source.vendor`, `product`, `adapter`, `tenantRef`, `scope.fingerprint`, `runMode`                                                   | `bindingKey` = sha256 của chúng; `runMode = fixture` ⟹ `simulated` (US-08-02 AC-2); `adapter` là nhãn nguồn | `adapterVersion`, `apiVersion`, `sourceKind`, `scope.kind/repoCount`                           |
| `window.start`, `end`, `timezone`                                                                                                    | cửa sổ bao phủ (`INV-10`), nhãn múi giờ ngày                                                                | `utcStart`, `utcEnd`, `period`                                                                 |
| `capabilities.*`                                                                                                                     | nhóm phát hiện được (`FR-4.4`)                                                                              | —                                                                                              |
| `activityDefinition.*`                                                                                                               | `INV-11`, `FR-4.16`; `eventClass = auth_only` ⟹ 422 `USAGE_IMPORT.AUTH_ONLY_REPORT`                         | —                                                                                              |
| `coverage.status`                                                                                                                    | lưu cho rule (G3/G4 cần `COMPLETE`)                                                                         | mọi khóa khác của `coverage`, `provenance`                                                     |
| `subjects[].externalId`, `externalIdType`, `externalLogin`, `externalLoginKind`                                                      | khóa định danh, chuỗi gốc                                                                                   | `account`, `seat`, `confidenceFactors`                                                         |
| `subjects[].identity.status`                                                                                                         | chỉ `CONCEALED`/`BOT` ⟹ `NOT_A_PERSON`                                                                      | `identity.employeeRef` (map của người vận hành — BE tự khớp)                                   |
| `subjects[].activity.activeDates` → nếu vắng `lastActivityDate` → nếu vắng ngày local (`Organization.timeZone`) của `lastActivityAt` | ngày hoạt động (`ACTIVE_DATE` / `LAST_ACTIVITY`)                                                            | `activeDays`, `windowState`, `nullReason`, `signals` (auth-only không là hoạt động, `FR-4.11`) |

Kiểm cả file: `start ≤ end`, `end ≤ hôm nay(org) + 1`, ≤ 366 ngày (sai ⟹ `USAGE_IMPORT.WINDOW_INVALID`, `details.reason`);
`evidenceDirection = positive_and_negative_when_complete` mà `coverage.status ≠ COMPLETE` ⟹ `REPORT_INVALID`; tổng số
"dòng" = số cặp (định danh, ngày) > **50 000** ⟹ `USAGE_IMPORT.FILE_TOO_MANY_ROWS` (`details.maxRows`). Từng dòng:
`activeDates` ngoài cửa sổ, `lastActivityDate` sau `window.end`, định danh rỗng/giống secret (`looksLikeSecret`, chuỗi gốc
bị che), định danh trùng trong file ⟹ dòng `ERROR` (mã ổn định). Ngày trước `hôm nay − 6 tháng` không ghi
(`datesOutsideRetention`, `QĐ-100af`).

### Khớp danh tính (policy thuần `usage-identity-matching.policy.ts`)

Khóa = (`identifierType`, `normalizedIdentifier`): `upn` ⟹ kind `email`, giá trị `normalizeAccountIdentifier`; id opaque
(`github_user_id`, `figma_user_id`, `canva_user_id`, `claude_user_id`, `atlassian_account_id`, `google_profile_id`) so
**chính xác** (trim, không gập chữ — tool V21-1); `upn_sha256`, `guest_upn_sha256` chỉ khớp tay. Thứ tự: (0) `CONCEALED`,
`BOT`, `concealed_hash`, `unassigned_seat`, `non_user_assignee`, `canva_invitation` ⟹ `NOT_A_PERSON`; (1) ánh xạ đã có của
(ứng dụng, khóa) ⟹ `MATCHED` theo phương pháp đã lưu; (2) email (externalId kind `email`, hoặc `externalLogin` khi
`externalLoginKind = company_email`) bằng `lower(trim(workEmail))` **hoặc** khóa tài khoản (email/`externalLogin` khác) bằng
`normalizedAccountIdentifier` của Assignment `PERSONAL` của ứng dụng ⟹ một người: `EXACT_EMAIL` (khớp email) /
`ACCOUNT_IDENTIFIER` (chỉ khớp tài khoản); (3) `normalizeEmail` (bỏ `+tag`) bằng `normalized_work_email` ⟹ `ALIAS_RULE`
(CF-1); bước nào ra ≥ 2 người ⟹ `AMBIGUOUS` (ứng viên ≤ 10); khớp tài khoản dịch vụ (`SERVICE`) mà không khớp người ⟹
`SERVICE_ACCOUNT` (không hàng đợi, `FR-4.9` cổng 2); còn lại ⟹ `UNMATCHED`. Mọi nhân viên (kể cả đã nghỉ) đều là ứng viên.

### Gắn Assignment và chồng lấn (policy thuần)

- `usage-attribution.policy.ts`: với người đã khớp và mỗi ngày `d`, chọn Assignment `PERSONAL` của các plan thuộc ứng dụng
  giữ seat tại `d` (định nghĩa ở trên); nhiều cái ⟹ `validFrom` sớm nhất rồi `id`. Không có ⟹ `NO_ASSIGNMENT` (sai lệch
  `FR-4.8`, không tạo Assignment). Gắn đúng mắt xích tại ngày (`FR-4.7`); đọc chuỗi là việc của rule. Chụp lúc xác nhận.
- `usage-supersede.policy.ts` (US-08-07 AC-3): trong một nguồn, ngày `d` thuộc import có cửa sổ phủ `d` với `coverageTo` lớn
  nhất, hòa thì xác nhận sau thắng; bản ghi của import thua tại `d` (chỉ trong giao cửa sổ) nhận `superseded_by_import_id`.
  Không xóa bản ghi nào; mỗi bản ghi giữ `import_id` (nguồn của dòng).

### Luồng

1. **Tạo nguồn**: ứng dụng phải tồn tại (404 `APPLICATION.NOT_FOUND`), không `INTERNAL` (422
   `USAGE_SOURCE.APPLICATION_INTERNAL`, AC-8), không `isCommunicationService` (409 `USAGE_SOURCE.APPLICATION_COMMUNICATION`,
   BR-17.8 — chưa có cờ "bật có chủ đích", Q1), chưa retire (409 `USAGE_SOURCE.APPLICATION_RETIRED`). Audit
   `USAGE_SOURCE.CREATED`.
2. **Upload** (tx ngắn): kiểm lại ứng dụng; đọc + kiểm báo cáo; nguồn đã bind mà `bindingKey` khác ⟹ 409
   `USAGE_IMPORT.SOURCE_MISMATCH`; khớp + gắn thử (đọc, không khóa); lưu `usage_imports` (`PREVIEW`, hạn 24 h) +
   `usage_import_rows`; audit `USAGE_IMPORT.UPLOADED`. Không ghi `usage_records`, mapping, hàng đợi.
3. **Preview-refresh / cancel**: như `data-import/employee-import` (tính lại, tăng `previewVersion`; hủy hai lần như một;
   hủy import đã xác nhận ⟹ 409 `USAGE_IMPORT.NOT_OPEN`).
4. **Xác nhận** (một tx; thứ tự khóa: `usage_imports` → `usage_sources` `FOR UPDATE`): đã `COMPLETED` cùng key ⟹ trả lại
   (`replayed`), khác key ⟹ 409 `ALREADY_CONFIRMED`; hủy/hết hạn ⟹ 409 `NOT_OPEN`; `previewVersion` lệch hoặc khớp/gắn tính
   lại khác preview ⟹ 409 `PREVIEW_STALE` (không ghi gì); ứng dụng chưa từng có `usage_tracking_notices` ⟹ 409
   `USAGE_IMPORT.TRACKING_NOTICE_MISSING` (US-08-05 AC-1); người đã khớp chưa có recipient ⟹ gửi bù trong tx (trigger
   `IMPORT_CONFIRMATION`); ghi mapping tự động (`ON CONFLICT DO NOTHING`), upsert hàng đợi (`last_seen_*`), `usage_records`
   (chunk ≤ 5 000), supersede, bind nguồn lần đầu; `COMPLETED` + `result`; audit `USAGE_IMPORT.CONFIRMED` (người xác nhận).
5. **Gán tay** (tx: khóa mục hàng đợi → ánh xạ): mục `RESOLVED` ⟹ 409 `UNMATCHED_IDENTITY.ALREADY_RESOLVED` (AC-6 — ánh
   xạ cũ giữ nguyên; vi phạm unique cũng trả mã này); nhân viên không có ⟹ 404 `EMPLOYEE.NOT_FOUND`; tạo mapping `MANUAL`
   (người xác nhận = principal, CHECK bắt buộc — AC-5); gửi bù thông báo nếu thiếu; cập nhật `usage_records` `UNMATCHED`
   của khóa thành `ATTRIBUTED`/`NO_ASSIGNMENT` (AC-1 "tính lại"); mục ⟹ `RESOLVED`; audit `UNMATCHED_IDENTITY.RESOLVED`.
6. **Bỏ qua**: mục `OPEN` ⟹ `DISMISSED` (vẫn liệt kê, gán tay sau vẫn được); `RESOLVED` ⟹ 409 `ALREADY_RESOLVED`.
7. **Gửi thông báo** (`POST /usage-tracking-notices`): kiểm ứng dụng như (1); người nhận = `holdersOf(planIds, hôm nay)` trừ
   người đã có recipient; tạo notice (trigger `IT_ADMIN`) + recipient; mỗi người: `notifyInApp` mã `USAGE_TRACKING_STARTED`
   (`subject {APPLICATION, id}`, params `{ applicationId, startsOn, retentionMonths: 6 }`, eventKey
   `usage-tracking:<applicationId>`) và, khi có email công việc, `enqueueEmail` mẫu `USAGE_TRACKING_NOTICE` (nội dung Phụ lục
   D.1). "Đã thông báo" = bản in-app ghi trong tx; mail lỗi không làm mất trạng thái đó và hiện `email.status = FAILED`
   (AC-5); thư lời mời không bao giờ là recipient (AC-6). Không người giữ ⟹ notice 0 người, ứng dụng vẫn thành "đã theo dõi".
8. **Sweeper** `UsageTrackingNoticeSweeper` (API, mỗi giờ, lần đầu sau 5 phút, timer unref): mỗi ứng dụng đã theo dõi một tx,
   gửi cho người giữ seat hôm nay chưa có recipient (trigger `NEW_HOLDER`, actor `SYSTEM`) — US-08-05 AC-4 (≤ 1 giờ, Q3); lỗi
   ghi một dòng `describeForOperator`. Chạy tay: `UsageTrackingNoticeService.noticeNewHolders(now)`.

### Data

Code Prisma và SQL thật ở [data-model.md](data-model.md). Tóm tắt: 8 bảng, id `uuid(7)`; `usage_sources` (nguồn, bind một luồng
báo cáo ở lần xác nhận đầu); `usage_imports` (cửa sổ, định nghĩa hoạt động, năng lực, chiều bằng chứng **NOT NULL** —
`INV-10`, `INV-11`; preview 24 h); `usage_import_rows`; `usage_records` (một ngày của một định danh theo một import; gắn
Assignment/nhân viên hoặc `UNMATCHED`; `superseded_by_import_id`); `usage_identity_mappings` (unique theo ứng dụng + khóa —
AC-6; `MANUAL` ⟺ có người xác nhận — AC-5; append-only); `usage_unmatched_identities` (một dòng mỗi khóa, ứng viên ≤ 10);
`usage_tracking_notices` + `usage_tracking_notice_recipients` (unique ứng dụng + người; append-only). Trigger
`usage_records_require_notice` từ chối bản ghi trước thông báo của ứng dụng/người (AC-3). H7: ba bảng append-only vào
`RUNTIME_TABLE_EXCEPTIONS` (`src/infrastructure/database/database-role-judgement.ts:209-221`).

### Response — field ⟹ màn/AC tiêu thụ

| Schema                          | Field ⟹ dùng ở                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UsageSourceSummary`            | `id`, `kind`, `application{id,name}` (màn nguồn); `adapter`\|null (nhãn nguồn); `simulated`\|null (AC-2); `lastImport{id, confirmedAt, coverageFrom, coverageTo}`\|null (độ mới, `US-08-07`); `createdAt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `UsageSourceDetail` = summary + | `activityDefinition{code,text,eventClass,strictness,evidenceDirection}`\|null, `capabilities{memberList,lastActivity,eventDetail,maxHistoryDays}`\|null, `detectableGroups` (`G1`…`G5`, maxItems 5), `positiveEvidenceOnly`\|null — của import xác nhận mới nhất (`FR-4.4`, `FR-4.16`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `UsageImport`                   | `id`, `source{id,kind,application{id,name}}`, `fileName`, `status`, `previewVersion`, `simulated` (AC-2), `coverage{from,to,days,status,timezone}` (AC-1), `activityDefinition`, `capabilities`, `detectableGroups`, `positiveEvidenceOnly` (AC-1), `summary{rows, records, byOutcome{MATCHED,UNMATCHED,AMBIGUOUS,SERVICE_ACCOUNT,NOT_A_PERSON,ERROR}, unmatchedIdentities, affectedAssignments, noAssignmentRecords, datesOutsideRetention, supersedes, supersededOnArrival, duplicateOfImportId}` (AC-1, `FR-7.2`, `FR-7.4`, US-08-07 AC-3), `trackingNotice{applicationTracked, employeesWithoutNotice}` (US-08-05 AC-1), `result{records, attributed, noAssignment, unmatched, mappingsCreated, queueItems, noticesSent}`\|null, `createdAt`, `expiresAt`, `confirmedAt`, `cancelledAt`; confirm trả `{ import, replayed }` |
| `UsageImportRow`                | `lineNumber`, `identifierType`, `identifier` (chuỗi gốc), `login`\|null, `outcome`, `matchMethod`\|null, `employee{id,employeeCode,workEmail}`\|null, `candidates[{id,employeeCode,workEmail}]` (≤ 10), `dates{count,first,last,attributed,noAssignment}`, `errors[{code}]` (≤ 5) — US-08-02 AC-1, US-08-04 AC-3/AC-4 (không họ tên)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `UnmatchedIdentitySummary`      | `id`, `application{id,name}`, `identifierType`, `identifier`, `login`, `reason`, `status`, `candidates` (≤ 10), `recordCount`, `firstSeenAt`, `lastSeenAt`, `dismissal{reason,dismissedAt}`\|null — US-08-04 AC-3, AC-4, AC-7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `IdentityMapping`               | `id`, `application{id,name}`, `identifierType`, `identifier`, `login`, `employee{id,employeeCode,workEmail}`, `method`, `confidence` (`HIGH`; `ALIAS_RULE` ⟹ `MEDIUM`, tính từ method), `confirmedBy{employeeId,employeeCode,fullName}`\|null (AC-1 "tên IT Admin"), `createdAt`; resolve trả `{ mapping, attached{attributed,noAssignment}, noticeSent }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `UsageTrackingNotice`           | `id`, `application{id,name}`, `trigger`, `sentAt`, `sentBy{employeeId,employeeCode,fullName}`\|null, `recipientCount` — AC-2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `UsageTrackingNoticeRecipient`  | `employee{id,employeeCode,workEmail}`, `inAppNotifiedAt` (AC-2), `email{status: PENDING\|SENT\|FAILED\|CANCELLED\|NOT_SENT}` (AC-5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Collection (API-LIST-DETAIL.1): `usageSourceList` (`createdAt desc, id`), `usageImportRowList` (`lineNumber`),
`unmatchedIdentityList` (`lastSeenAt desc, id`), `identityMappingList` (`createdAt desc, id`), `usageTrackingNoticeList`
(`sentAt desc, id`), `usageTrackingNoticeRecipientList` (`employeeId`): summary riêng, `pageSize ≤ 100`, đếm + trang trong
một transaction `RepeatableRead`, `select` trực tiếp; tên ứng dụng/nhân viên/`recordCount`/`lastImport`/trạng thái mail
đọc theo lô một câu mỗi trang (số câu lệnh hằng số — `test/support/query-count.ts`). Mảng lồng có `maxItems` và mục
`NESTED_ARRAYS` + ledger `added` (plan Task 10).

### Lỗi (một mã ↔ một status; mapper ở `*.http-errors.ts`)

404 `APPLICATION.NOT_FOUND`, `EMPLOYEE.NOT_FOUND`, `USAGE_SOURCE.NOT_FOUND`, `USAGE_IMPORT.NOT_FOUND`,
`UNMATCHED_IDENTITY.NOT_FOUND`, `USAGE_TRACKING_NOTICE.NOT_FOUND` · 409 `USAGE_SOURCE.APPLICATION_COMMUNICATION`,
`USAGE_SOURCE.APPLICATION_RETIRED`, `USAGE_IMPORT.SOURCE_MISMATCH`, `USAGE_IMPORT.PREVIEW_STALE` (`details.previewVersion`),
`USAGE_IMPORT.ALREADY_CONFIRMED`, `USAGE_IMPORT.NOT_OPEN` (`details.state`), `USAGE_IMPORT.TRACKING_NOTICE_MISSING`,
`UNMATCHED_IDENTITY.ALREADY_RESOLVED` · 422 `VALIDATION_ERROR`, `USAGE_SOURCE.APPLICATION_INTERNAL`,
`USAGE_IMPORT.FILE_REQUIRED`, `FILE_NOT_JSON`, `SCHEMA_UNSUPPORTED`, `REPORT_INVALID`, `FILE_TOO_MANY_ROWS`,
`WINDOW_INVALID`, `AUTH_ONLY_REPORT` · 413 `HTTP_PAYLOAD_TOO_LARGE`, 400 `HTTP_BAD_REQUEST` (multer:
`{ fileSize: 10 MiB, files: 1, fields: 1, fieldSize: 64, parts: 2 }`, như `seat-baseline-imports.controller.ts:42-44`).
File 10 MiB đọc trong bộ nhớ (memory storage); không đổi giới hạn JSON 100 KiB toàn cục.

## Test matrix

Chi tiết từng ca (tên, cấp, input, kỳ vọng) ở [test-plan.md](test-plan.md). Tóm tắt: unit policy (đọc báo cáo, khớp, gắn,
chồng lấn, nhóm phát hiện được); integration Postgres (CHECK, trigger thông báo, append-only + H7, unique hàng đợi/mapping,
hai xác nhận đồng thời, 50 000 dòng trong `DB_TRANSACTION_TIMEOUT_MS`, sweeper); HTTP (quyền 5 vai, multipart, mã lỗi,
envelope, OpenAPI); chống field ma; contract với fixture sinh từ vendor-sources.

| AC / rủi ro              | Tình huống                                                                | Cấp                   | Kết quả                                                 | Bằng chứng |
| ------------------------ | ------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------- | ---------- |
| US-08-01 AC-8            | tạo nguồn cho ứng dụng `INTERNAL`                                         | http                  | 422 `USAGE_SOURCE.APPLICATION_INTERNAL`, không dòng nào | chưa chạy  |
| US-08-02 AC-1            | báo cáo M365 200 subject, 90 ngày, 12 chưa khớp                           | integration           | preview đúng số; 0 `usage_records`                      | chưa chạy  |
| US-08-02 AC-2            | `runMode: fixture`                                                        | http                  | `simulated: true` ở import và nguồn                     | chưa chạy  |
| US-08-02 AC-3            | ứng dụng liên lạc                                                         | http                  | 409 `APPLICATION_COMMUNICATION` ở tạo nguồn và upload   | chưa chạy  |
| US-08-02 AC-5, AC-6      | hủy preview; Finance/Manager tải file                                     | integration/http      | không ghi; 403                                          | chưa chạy  |
| US-08-03 AC-1, AC-3      | A1 01/01–31/03, A2 từ 01/05; ngày không có Assignment                     | unit + integration    | 20/03 gắn A1; `NO_ASSIGNMENT`, không tạo Assignment     | chưa chạy  |
| US-08-04 AC-1, AC-3→AC-7 | gán tay, khớp hai người, ẩn họ tên, không người xác nhận, gán lại, bỏ qua | unit/integration/http | như test-plan                                           | chưa chạy  |
| US-08-05 AC-1→AC-6       | chặn lần đầu, gửi 70 người, trigger, người mới, mail lỗi, thư mời         | integration           | như test-plan                                           | chưa chạy  |
| US-08-07 AC-3            | hai file chồng lấn khác giá trị 20/07                                     | unit + integration    | file kết thúc 31/08 thắng, có `import_id`               | chưa chạy  |
| Field ma, race, H7       | OpenAPI ↔ bảng field; hai xác nhận; quyền runtime                         | http/integration      | như test-plan                                           | chưa chạy  |

## Definition of Done

- [ ] Mọi AC primary có test đỏ-trước/xanh-sau theo test-plan; AC `partial` chỉ vế đã ghi.
- [ ] `pnpm typecheck`, `lint`, `arch:check`, `rules:check`, gate theo file và test theo file xanh; Owner chạy full suite.
- [ ] `openapi.json`, `docs/generated/routes.md`, module card `src/modules/usage/README.md`, `docs/rules/security-jobs.md`
      (sweeper), manifest OpenAPI/API coverage, `NESTED_ARRAYS` cập nhật; báo FE 16 operation mới.
- [ ] Không tăng nợ lint/ledger; không cột IP/user agent; token/secret không vào log/audit.

## Câu hỏi mở (đề xuất mặc định — không tự đổi nghiệp vụ)

- Q1 `BR-17.8` "cờ liên lạc **chưa bật có chủ đích**": catalog không có cờ bật. Mặc định: chặn mọi ứng dụng
  `isCommunicationService`; fixture M365 của AC-1 dùng ứng dụng không mang cờ.
- Q2 US-08-05 cho IT "xác nhận đã thông báo" ngoài hệ thống: DESIGN §4 chỉ có gửi. Mặc định: chỉ gửi qua hệ thống
  (bản ghi theo người nhận mới chứng minh AC-3/AC-5).
- Q3 AC-4 "tại thời điểm được cấp": mặc định sweeper ≤ 1 giờ + gửi bù trong xác nhận/gán tay; phương án khác là
  `Listeners` ở licensing khi cấp (chạm mọi đường tạo Assignment).
- Q4 Phạm vi ánh xạ theo **ứng dụng** (không theo nhà cung cấp): GitHub và Copilot không dùng chung ánh xạ. Mặc định giữ.
- Q5 Ngày của nguồn UTC/`vendor-unspecified` khác `Organization.timeZone`: mặc định nhận nguyên ngày, hiện
  `coverage.timezone`; không dời ngày.
- Q6 "50 000 dòng" = cặp (định danh, ngày). Tổ chức lớn cần tách cửa sổ; nếu xác nhận 50 000 dòng vượt
  `DB_TRANSACTION_TIMEOUT_MS` (mặc định 10 s) cần Owner chọn hạ trần hay tăng timeout riêng.
- Q7 Bản ghi thông báo append-only; xóa theo hạn lưu (`US-08-05` data) để `g7-usage-downstream-retention` quyết.

## Changes and acceptance

05/11/2026 — lập spec từ DESIGN.md. Lệch DESIGN: (1) `PATCH /usage-sources` chuyển sang `g7-vendor-usage-csv-template`
(nguồn báo cáo không có gì sửa — F-1); (2) thêm `POST /usage-imports/{id}/preview-refreshes` (mẫu employee import) cho
`PREVIEW_STALE`; (3) thêm `GET /usage-tracking-notices/{id}/recipients` (mảng người nhận không có trần); (4) thêm phương
pháp `ACCOUNT_IDENTIFIER` (khớp tài khoản Assignment, không phải email); (5) định nghĩa hoạt động, năng lực, chiều bằng chứng,
cửa sổ lưu **trên từng import** (NOT NULL — `INV-10`/`INV-11`), nguồn hiển thị import xác nhận mới nhất và bind một luồng báo
cáo; (6) bổ sung mã `USAGE_IMPORT.*` của file. Chưa nghiệm thu.
