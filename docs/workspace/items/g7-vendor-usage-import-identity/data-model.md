# Data model: g7-vendor-usage-import-identity

Phụ lục của [spec](spec.md) (mục _Data_) — code thật cho Task 1 của [plan](plan.md). File Prisma mới
`prisma/models/usage.prisma`; migration `<ts>_usage_vendor_import_identity` (tên theo `DB-15`, sau migration cuối đã merge).
Quan hệ ngược (`UsageSource[]` …) thêm vào `Organization`, `Application`, `Employee`, `LicenseAssignment` cho Prisma hợp lệ.

## Prisma

```prisma
enum UsageSourceKind {
  VENDOR_REPORT
}

enum UsageImportStatus {
  PREVIEW
  COMPLETED
  CANCELLED
}

enum UsageCoverageStatus {
  COMPLETE
  PARTIAL
  NONE
}

enum UsageEventClass {
  VALUE_CREATING
  PASSIVE
  AUTH_ONLY
  MIXED
}

enum UsageDefinitionStrictness {
  STRICT
  LOOSE
  VENDOR_UNDEFINED
}

enum UsageEvidenceDirection {
  POSITIVE_ONLY
  POSITIVE_AND_NEGATIVE
}

enum UsageMatchMethod {
  EXACT_EMAIL
  ACCOUNT_IDENTIFIER
  ALIAS_RULE
  MANUAL
}

enum UsageRecordAttribution {
  ATTRIBUTED
  NO_ASSIGNMENT
  UNMATCHED
}

enum UsageRecordBasis {
  ACTIVE_DATE
  LAST_ACTIVITY
}

enum UnmatchedIdentityReason {
  NOT_FOUND
  AMBIGUOUS
}

enum UnmatchedIdentityStatus {
  OPEN
  DISMISSED
  RESOLVED
}

enum UsageTrackingNoticeTrigger {
  IT_ADMIN
  NEW_HOLDER
  IMPORT_CONFIRMATION
  IDENTITY_RESOLUTION
}

// A source of vendor usage for one application. A report source is bound to one feed of the vendor-sources tool by its
// first confirmed import (binding key, adapter, simulated are set together, once).
model UsageSource {
  id                 String          @id @default(uuid(7)) @db.Uuid
  organizationId     String          @map("organization_id") @db.Uuid
  applicationId      String          @map("application_id") @db.Uuid
  kind               UsageSourceKind
  bindingKey         String?         @map("binding_key")
  adapter            String?
  simulated          Boolean?
  createdByAppUserId String          @map("created_by_app_user_id") @db.Uuid
  createdAt          DateTime        @default(now()) @map("created_at") @db.Timestamptz(3)

  organization Organization  @relation(fields: [organizationId], references: [id])
  application  Application   @relation(fields: [applicationId], references: [id], onDelete: Restrict)
  imports      UsageImport[]

  @@unique([organizationId, bindingKey])
  @@index([organizationId, applicationId])
  @@index([organizationId, createdAt(sort: Desc), id])
  @@map("usage_sources")
}

// One uploaded file: a preview until it is confirmed (then its records exist) or cancelled. Window, definition and
// capabilities are the file's own and never null (INV-10, INV-11).
model UsageImport {
  id                     String                    @id @default(uuid(7)) @db.Uuid
  organizationId         String                    @map("organization_id") @db.Uuid
  sourceId               String                    @map("source_id") @db.Uuid
  applicationId          String                    @map("application_id") @db.Uuid
  uploadedByAppUserId    String                    @map("uploaded_by_app_user_id") @db.Uuid
  fileName               String                    @map("file_name")
  fileSha256             String                    @map("file_sha256")
  reportContentHash      String                    @map("report_content_hash")
  bindingKey             String                    @map("binding_key")
  adapter                String
  simulated              Boolean
  status                 UsageImportStatus         @default(PREVIEW)
  previewVersion         Int                       @default(1) @map("preview_version")
  coverageFrom           DateTime                  @map("coverage_from") @db.Date
  coverageTo             DateTime                  @map("coverage_to") @db.Date
  coverageStatus         UsageCoverageStatus       @map("coverage_status")
  dayTimeZone            String                    @map("day_time_zone")
  activityDefinitionCode String                    @map("activity_definition_code")
  activityDefinitionText String                    @map("activity_definition_text")
  eventClass             UsageEventClass           @map("event_class")
  strictness             UsageDefinitionStrictness
  evidenceDirection      UsageEvidenceDirection    @map("evidence_direction")
  capMemberList          Boolean                   @map("cap_member_list")
  capLastActivity        Boolean                   @map("cap_last_activity")
  capEventDetail         Boolean                   @map("cap_event_detail")
  capMaxHistoryDays      Int?                      @map("cap_max_history_days")
  summary                Json
  result                 Json?
  confirmKey             String?                   @map("confirm_key")
  createdAt              DateTime                  @default(now()) @map("created_at") @db.Timestamptz(3)
  expiresAt              DateTime                  @map("expires_at") @db.Timestamptz(3)
  confirmedAt            DateTime?                 @map("confirmed_at") @db.Timestamptz(3)
  confirmedByAppUserId   String?                   @map("confirmed_by_app_user_id") @db.Uuid
  cancelledAt            DateTime?                 @map("cancelled_at") @db.Timestamptz(3)

  source  UsageSource      @relation(fields: [sourceId], references: [id], onDelete: Restrict)
  rows    UsageImportRow[]
  records UsageRecord[]    @relation("RecordImport")

  @@index([sourceId, status, coverageTo])
  @@index([organizationId, reportContentHash])
  @@map("usage_imports")
}

// One subject of the file and what the preview made of it. `activity` and `errors` have a codec each (.json.ts).
model UsageImportRow {
  importId             String            @map("import_id") @db.Uuid
  lineNumber           Int               @map("line_number")
  identifierType       String            @map("identifier_type")
  identifier           String
  login                String?
  outcome              String
  matchMethod          UsageMatchMethod? @map("match_method")
  employeeId           String?           @map("employee_id") @db.Uuid
  candidateEmployeeIds String[]          @map("candidate_employee_ids") @db.Uuid
  activity             Json
  errors               Json

  import UsageImport @relation(fields: [importId], references: [id], onDelete: Cascade)

  @@id([importId, lineNumber])
  @@index([importId, outcome])
  @@map("usage_import_rows")
}

// One day of activity of one vendor identity, as one confirmed import said it. Attached to the Assignment in force on
// that day when the identity is matched (FR-4.7); superseded, never deleted, when a later-ending window of the same
// source covers the day (QĐ-28a). Deleted only by the retention job.
model UsageRecord {
  id                   String                 @id @default(uuid(7)) @db.Uuid
  organizationId       String                 @map("organization_id") @db.Uuid
  sourceId             String                 @map("source_id") @db.Uuid
  importId             String                 @map("import_id") @db.Uuid
  applicationId        String                 @map("application_id") @db.Uuid
  identifierType       String                 @map("identifier_type")
  normalizedIdentifier String                 @map("normalized_identifier")
  activityDate         DateTime               @map("activity_date") @db.Date
  basis                UsageRecordBasis
  attribution          UsageRecordAttribution
  employeeId           String?                @map("employee_id") @db.Uuid
  assignmentId         String?                @map("assignment_id") @db.Uuid
  attributedAt         DateTime?              @map("attributed_at") @db.Timestamptz(3)
  recordedAt           DateTime               @map("recorded_at") @db.Timestamptz(3)
  supersededByImportId String?                @map("superseded_by_import_id") @db.Uuid

  import       UsageImport        @relation("RecordImport", fields: [importId], references: [id], onDelete: Restrict)
  employee     Employee?          @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  assignment   LicenseAssignment? @relation(fields: [assignmentId], references: [id], onDelete: Restrict)

  @@unique([importId, identifierType, normalizedIdentifier, activityDate])
  @@index([assignmentId, activityDate])
  @@index([organizationId, applicationId, identifierType, normalizedIdentifier])
  @@index([sourceId, activityDate])
  @@map("usage_records")
}

// One vendor identity of one application = one employee (INV-12, US-08-04 AC-6). Added, never changed (trigger).
model UsageIdentityMapping {
  id                    String           @id @default(uuid(7)) @db.Uuid
  organizationId        String           @map("organization_id") @db.Uuid
  applicationId         String           @map("application_id") @db.Uuid
  identifierType        String           @map("identifier_type")
  normalizedIdentifier  String           @map("normalized_identifier")
  identifier            String
  login                 String?
  employeeId            String           @map("employee_id") @db.Uuid
  method                UsageMatchMethod
  confirmedByAppUserId  String?          @map("confirmed_by_app_user_id") @db.Uuid
  confirmedByEmployeeId String?          @map("confirmed_by_employee_id") @db.Uuid
  createdByImportId     String?          @map("created_by_import_id") @db.Uuid
  createdAt             DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)

  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Restrict)

  @@unique([organizationId, applicationId, identifierType, normalizedIdentifier])
  @@index([employeeId])
  @@index([organizationId, createdAt(sort: Desc), id])
  @@map("usage_identity_mappings")
}

// The queue of vendor identities that matched nobody or two people (FR-4.6). One row per identity; a dismissed one stays.
model UsageUnmatchedIdentity {
  id                   String                  @id @default(uuid(7)) @db.Uuid
  organizationId       String                  @map("organization_id") @db.Uuid
  applicationId        String                  @map("application_id") @db.Uuid
  identifierType       String                  @map("identifier_type")
  normalizedIdentifier String                  @map("normalized_identifier")
  identifier           String
  login                String?
  reason               UnmatchedIdentityReason
  candidateEmployeeIds String[]                @map("candidate_employee_ids") @db.Uuid
  status               UnmatchedIdentityStatus @default(OPEN)
  firstSeenImportId    String                  @map("first_seen_import_id") @db.Uuid
  lastSeenImportId     String                  @map("last_seen_import_id") @db.Uuid
  firstSeenAt          DateTime                @map("first_seen_at") @db.Timestamptz(3)
  lastSeenAt           DateTime                @map("last_seen_at") @db.Timestamptz(3)
  resolvedMappingId    String?                 @map("resolved_mapping_id") @db.Uuid
  dismissedByAppUserId String?                 @map("dismissed_by_app_user_id") @db.Uuid
  dismissedAt          DateTime?               @map("dismissed_at") @db.Timestamptz(3)
  dismissReason        String?                 @map("dismiss_reason")

  @@unique([organizationId, applicationId, identifierType, normalizedIdentifier])
  @@index([organizationId, status, lastSeenAt(sort: Desc), id])
  @@map("usage_unmatched_identities")
}

// A sending of the tracking notice of one application (FR-10.4). Added, never changed (trigger).
model UsageTrackingNotice {
  id               String                     @id @default(uuid(7)) @db.Uuid
  organizationId   String                     @map("organization_id") @db.Uuid
  applicationId    String                     @map("application_id") @db.Uuid
  trigger          UsageTrackingNoticeTrigger
  sentByAppUserId  String?                    @map("sent_by_app_user_id") @db.Uuid
  sentByEmployeeId String?                    @map("sent_by_employee_id") @db.Uuid
  sentAt           DateTime                   @map("sent_at") @db.Timestamptz(3)
  recipientCount   Int                        @map("recipient_count")

  recipients UsageTrackingNoticeRecipient[]

  @@index([applicationId, sentAt(sort: Desc), id])
  @@map("usage_tracking_notices")
}

// Who was told, once per application and person; told = the in-app notice written in the same transaction.
model UsageTrackingNoticeRecipient {
  noticeId        String    @map("notice_id") @db.Uuid
  organizationId  String    @map("organization_id") @db.Uuid
  applicationId   String    @map("application_id") @db.Uuid
  employeeId      String    @map("employee_id") @db.Uuid
  inAppNotifiedAt DateTime  @map("in_app_notified_at") @db.Timestamptz(3)
  emailOutboxId   String?   @map("email_outbox_id") @db.Uuid

  notice UsageTrackingNotice @relation(fields: [noticeId], references: [id], onDelete: Restrict)

  @@id([noticeId, employeeId])
  @@unique([applicationId, employeeId])
  @@map("usage_tracking_notice_recipients")
}
```

`organizationId`, `applicationId` của các bảng còn lại có FK `RESTRICT` tới `organizations`/`applications` trong SQL (Prisma
không cần quan hệ ngược cho các cột chỉ để kiểm). `email_outbox_id` là giá trị, không FK (bảng của notifications).

## SQL thêm trong migration (ADR-0005)

```sql
ALTER TABLE usage_sources ADD CONSTRAINT usage_sources_binding_ck CHECK
  ((binding_key IS NULL) = (adapter IS NULL) AND (binding_key IS NULL) = (simulated IS NULL));

ALTER TABLE usage_imports
  ADD CONSTRAINT usage_imports_window_ck CHECK (coverage_to >= coverage_from AND coverage_to - coverage_from <= 366),
  ADD CONSTRAINT usage_imports_negative_ck CHECK (evidence_direction <> 'POSITIVE_AND_NEGATIVE' OR coverage_status = 'COMPLETE'),
  ADD CONSTRAINT usage_imports_state_ck CHECK (
    (status = 'COMPLETED') = (confirmed_at IS NOT NULL AND confirm_key IS NOT NULL AND confirmed_by_app_user_id IS NOT NULL)
    AND (status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
  ADD CONSTRAINT usage_imports_text_ck CHECK (length(activity_definition_text) BETWEEN 1 AND 2000
    AND length(activity_definition_code) BETWEEN 1 AND 100);

ALTER TABLE usage_records ADD CONSTRAINT usage_records_attribution_ck CHECK (
  (attribution = 'ATTRIBUTED' AND employee_id IS NOT NULL AND assignment_id IS NOT NULL AND attributed_at IS NOT NULL) OR
  (attribution = 'NO_ASSIGNMENT' AND employee_id IS NOT NULL AND assignment_id IS NULL AND attributed_at IS NOT NULL) OR
  (attribution = 'UNMATCHED' AND employee_id IS NULL AND assignment_id IS NULL AND attributed_at IS NULL));

ALTER TABLE usage_identity_mappings ADD CONSTRAINT usage_identity_mappings_manual_ck CHECK
  ((method = 'MANUAL') = (confirmed_by_app_user_id IS NOT NULL AND confirmed_by_employee_id IS NOT NULL));

ALTER TABLE usage_unmatched_identities ADD CONSTRAINT usage_unmatched_state_ck CHECK (
  cardinality(candidate_employee_ids) <= 10
  AND (reason <> 'AMBIGUOUS' OR cardinality(candidate_employee_ids) >= 2)
  AND (status = 'RESOLVED') = (resolved_mapping_id IS NOT NULL)
  AND (status = 'DISMISSED') = (dismissed_at IS NOT NULL AND dismiss_reason IS NOT NULL AND dismissed_by_app_user_id IS NOT NULL));

-- Closed set of identifier kinds of this item; g7-vendor-usage-csv-template widens it (DROP + ADD of the same names).
ALTER TABLE usage_records ADD CONSTRAINT usage_records_identifier_type_ck CHECK (identifier_type IN ('email',
  'github_user_id','figma_user_id','canva_user_id','claude_user_id','atlassian_account_id','google_profile_id',
  'upn_sha256','guest_upn_sha256'));
-- the same CHECK, named <table>_identifier_type_ck, on usage_import_rows, usage_identity_mappings, usage_unmatched_identities

-- No usage row exists before the application was told, nor a person's row before that person was told (US-08-05 AC-3).
CREATE FUNCTION usage_records_require_notice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usage_tracking_notices n
                  WHERE n.application_id = NEW.application_id AND n.sent_at <= NEW.recorded_at) THEN
    RAISE EXCEPTION 'usage record before tracking notice' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usage_tracking_notice_recipients r
       WHERE r.application_id = NEW.application_id AND r.employee_id = NEW.employee_id
         AND r.in_app_notified_at <= NEW.attributed_at) THEN
    RAISE EXCEPTION 'usage record before tracking notice' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER usage_records_require_notice BEFORE INSERT OR UPDATE OF employee_id, attributed_at ON usage_records
  FOR EACH ROW EXECUTE FUNCTION usage_records_require_notice();

-- Append-only: a mapping, a notice and its recipients are evidence (FR-4.5, FR-10.4).
CREATE FUNCTION usage_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'P0001'; END $$;
CREATE TRIGGER usage_identity_mappings_append_only BEFORE UPDATE OR DELETE ON usage_identity_mappings
  FOR EACH ROW EXECUTE FUNCTION usage_append_only();
CREATE TRIGGER usage_identity_mappings_no_truncate BEFORE TRUNCATE ON usage_identity_mappings
  FOR EACH STATEMENT EXECUTE FUNCTION usage_append_only();
-- the same two triggers on usage_tracking_notices and usage_tracking_notice_recipients
```

Ghi chú implement: một `now` (một `Date`) mỗi transaction cho `in_app_notified_at`, `sent_at`, `recorded_at`, `attributed_at`
để điều kiện `<=` của trigger tất định. Repo dịch lỗi `P0001` của trigger thành `UsageTrackingNoticeMissingError` (409) — chỉ
xảy ra khi có lỗi lập trình hoặc ghi đua, vì service đã kiểm trước.

H7: `RUNTIME_TABLE_EXCEPTIONS` (`src/infrastructure/database/database-role-judgement.ts:209-221`) thêm
`usage_identity_mappings`, `usage_tracking_notices`, `usage_tracking_notice_recipients` = `['INSERT', 'SELECT']`. Bảng còn lại
DML thường (`usage_records` cần `UPDATE` khi gán tay và `DELETE` cho job hạn lưu). Không sequence mới.
