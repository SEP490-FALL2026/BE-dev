-- The notice of a department head about a change that is coming for one of their people, and the verification the IT Admin makes
-- before the official event is recorded (g6-hr-notices-and-verification, US-03-10, US-03-11, BM-09). A notice has no legal effect: it
-- is a row of its own and never touches the person. The IT Admin rejects it, or checks it against an authoritative basis and records the
-- event through the transfer, the long leave or the departure, which name the notice in `notice_id`. No column keeps a reason for
-- leaving and none keeps the file of a basis.

-- CreateEnum
CREATE TYPE "PersonnelNoticeKind" AS ENUM (
  'DEPARTMENT_TRANSFER_OUT', 'DEPARTMENT_TRANSFER_IN', 'JOB_TITLE_CHANGE', 'DEPARTURE', 'ABRUPT_DEPARTURE', 'LONG_LEAVE'
);
CREATE TYPE "PersonnelNoticeStatus" AS ENUM ('PENDING_VERIFICATION', 'RECORDED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "VerificationMethod" AS ENUM ('ATTACHED_DOCUMENT', 'EMAIL_FROM_ISSUER', 'DIRECT_CONTACT');
CREATE TYPE "PersonnelNoticeEventKind" AS ENUM ('DEPARTMENT_TRANSFER', 'LONG_LEAVE', 'OFFBOARDING_CASE');

-- The numbers of the codes `BM09-<year>-<six digits>`: a notice is told apart from a document by this form.
CREATE SEQUENCE "personnel_notice_seq" AS INTEGER MINVALUE 1 MAXVALUE 999999;

-- CreateTable
CREATE TABLE "personnel_notices" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" "PersonnelNoticeKind" NOT NULL,
    "proposed_on" DATE NOT NULL,
    -- The department the person would go to: only for the two kinds of transfer.
    "target_department_id" UUID,
    -- What the head wrote. It is information, never the basis of anything.
    "note" TEXT,
    "sender_employee_id" UUID NOT NULL,
    "sender_department_id" UUID NOT NULL,
    "status" "PersonnelNoticeStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "reject_reason" TEXT,
    "recorded_event_kind" "PersonnelNoticeEventKind",
    "recorded_event_id" UUID,
    -- The IT Admin in charge of the department when the notice was sent (a value: it may have been replaced since).
    "default_it_admin_employee_id" UUID,
    -- Fixed when the notice is sent from the parameter of the working days an IT Admin has to handle it.
    "due_on" DATE NOT NULL,
    "handled_by_app_user_id" UUID,
    "handled_at" TIMESTAMPTZ(3),
    "overdue_noticed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personnel_notices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "personnel_notices_code_form_check" CHECK ("code" ~ '^BM09-[0-9]{4}-[0-9]{6}$'),
    CONSTRAINT "personnel_notices_note_length_check" CHECK ("note" IS NULL OR (btrim("note") <> '' AND char_length("note") <= 500)),
    CONSTRAINT "personnel_notices_target_check"
      CHECK (("kind" IN ('DEPARTMENT_TRANSFER_OUT', 'DEPARTMENT_TRANSFER_IN')) = ("target_department_id" IS NOT NULL)),
    -- The status says what else the row holds: a rejection has its reason, a recording the event it made or found, and only a
    -- notice that waits has none of them.
    CONSTRAINT "personnel_notices_status_check" CHECK (
      CASE "status"
        WHEN 'PENDING_VERIFICATION' THEN "reject_reason" IS NULL AND "recorded_event_kind" IS NULL AND "recorded_event_id" IS NULL
          AND "handled_by_app_user_id" IS NULL AND "handled_at" IS NULL
        WHEN 'RECORDED' THEN "reject_reason" IS NULL AND "recorded_event_kind" IS NOT NULL AND "recorded_event_id" IS NOT NULL
          AND "handled_by_app_user_id" IS NOT NULL AND "handled_at" IS NOT NULL
        WHEN 'REJECTED' THEN "reject_reason" IS NOT NULL AND btrim("reject_reason") <> '' AND "recorded_event_kind" IS NULL
          AND "recorded_event_id" IS NULL AND "handled_by_app_user_id" IS NOT NULL AND "handled_at" IS NOT NULL
        WHEN 'WITHDRAWN' THEN "reject_reason" IS NULL AND "recorded_event_kind" IS NULL AND "recorded_event_id" IS NULL
          AND "handled_by_app_user_id" IS NOT NULL AND "handled_at" IS NOT NULL
      END)
);

-- What the IT Admin checked before a notice was recorded: written once with the recording and never changed.
CREATE TABLE "personnel_notice_verifications" (
    "id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    -- Where the check was made: the number of the document, the mail, the person spoken to. The file itself is not kept.
    "reference" TEXT NOT NULL,
    "verified_by_app_user_id" UUID NOT NULL,
    "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personnel_notice_verifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "personnel_notice_verifications_reference_check" CHECK (btrim("reference") <> '')
);

-- The event a notice led to names it. Optional: an event recorded straight from a document has no notice.
ALTER TABLE "department_transfers" ADD COLUMN "notice_id" UUID;
ALTER TABLE "employee_leaves" ADD COLUMN "notice_id" UUID;
ALTER TABLE "offboarding_cases" ADD COLUMN "notice_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "personnel_notices_code_key" ON "personnel_notices"("code");
-- A head sends one notice of a kind for a person while one of that kind waits.
CREATE UNIQUE INDEX "personnel_notices_one_pending_per_employee_kind"
  ON "personnel_notices"("employee_id", "kind") WHERE "status" = 'PENDING_VERIFICATION';
CREATE INDEX "personnel_notices_status_due_on_id_idx" ON "personnel_notices"("status", "due_on", "id");
CREATE INDEX "personnel_notices_sender_employee_id_created_at_id_idx"
  ON "personnel_notices"("sender_employee_id", "created_at", "id");
CREATE INDEX "personnel_notices_employee_id_idx" ON "personnel_notices"("employee_id");
CREATE INDEX "personnel_notices_organization_id_idx" ON "personnel_notices"("organization_id");
CREATE UNIQUE INDEX "personnel_notice_verifications_notice_id_key" ON "personnel_notice_verifications"("notice_id");
CREATE UNIQUE INDEX "department_transfers_notice_id_key" ON "department_transfers"("notice_id");
CREATE UNIQUE INDEX "employee_leaves_notice_id_key" ON "employee_leaves"("notice_id");
CREATE UNIQUE INDEX "offboarding_cases_notice_id_key" ON "offboarding_cases"("notice_id");

-- AddForeignKey (the accounts that handled are values: the history outlives the account)
ALTER TABLE "personnel_notices"
  ADD CONSTRAINT "personnel_notices_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personnel_notices"
  ADD CONSTRAINT "personnel_notices_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personnel_notices"
  ADD CONSTRAINT "personnel_notices_sender_employee_id_fkey"
  FOREIGN KEY ("sender_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personnel_notices"
  ADD CONSTRAINT "personnel_notices_target_department_id_fkey"
  FOREIGN KEY ("target_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personnel_notices"
  ADD CONSTRAINT "personnel_notices_sender_department_id_fkey"
  FOREIGN KEY ("sender_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personnel_notice_verifications"
  ADD CONSTRAINT "personnel_notice_verifications_notice_id_fkey"
  FOREIGN KEY ("notice_id") REFERENCES "personnel_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_transfers"
  ADD CONSTRAINT "department_transfers_notice_id_fkey"
  FOREIGN KEY ("notice_id") REFERENCES "personnel_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_leaves"
  ADD CONSTRAINT "employee_leaves_notice_id_fkey"
  FOREIGN KEY ("notice_id") REFERENCES "personnel_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offboarding_cases"
  ADD CONSTRAINT "offboarding_cases_notice_id_fkey"
  FOREIGN KEY ("notice_id") REFERENCES "personnel_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A notice is never deleted. While it waits only its outcome and the mark of the reminder may change; once it is recorded, rejected
-- or withdrawn it is a fact and never changes again.
CREATE FUNCTION "personnel_notices_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'personnel_notices keeps its history (% rejected)', TG_OP
            USING ERRCODE = '55000', CONSTRAINT = 'personnel_notices_kept';
    END IF;
    IF OLD."status" <> 'PENDING_VERIFICATION' THEN
        RAISE EXCEPTION 'a notice that was handled cannot change again'
            USING ERRCODE = '55000', CONSTRAINT = 'personnel_notices_kept';
    END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."code" IS DISTINCT FROM OLD."code"
       OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR NEW."employee_id" IS DISTINCT FROM OLD."employee_id"
       OR NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."proposed_on" IS DISTINCT FROM OLD."proposed_on"
       OR NEW."target_department_id" IS DISTINCT FROM OLD."target_department_id" OR NEW."note" IS DISTINCT FROM OLD."note"
       OR NEW."sender_employee_id" IS DISTINCT FROM OLD."sender_employee_id"
       OR NEW."sender_department_id" IS DISTINCT FROM OLD."sender_department_id"
       OR NEW."default_it_admin_employee_id" IS DISTINCT FROM OLD."default_it_admin_employee_id"
       OR NEW."due_on" IS DISTINCT FROM OLD."due_on" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'what a notice says never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'personnel_notices_kept';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "personnel_notices_no_rewrite"
    BEFORE UPDATE OR DELETE ON "personnel_notices"
    FOR EACH ROW EXECUTE FUNCTION "personnel_notices_guard"();
CREATE TRIGGER "personnel_notices_no_truncate"
    BEFORE TRUNCATE ON "personnel_notices"
    FOR EACH STATEMENT EXECUTE FUNCTION "personnel_notices_guard"();

-- The verification is written once and never changed or deleted.
CREATE FUNCTION "personnel_notice_verification_guard"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'a notice verification is never changed or deleted (% rejected)', TG_OP
        USING ERRCODE = '55000', CONSTRAINT = 'personnel_notice_verifications_kept';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "personnel_notice_verifications_no_rewrite"
    BEFORE UPDATE OR DELETE ON "personnel_notice_verifications"
    FOR EACH ROW EXECUTE FUNCTION "personnel_notice_verification_guard"();
CREATE TRIGGER "personnel_notice_verifications_no_truncate"
    BEFORE TRUNCATE ON "personnel_notice_verifications"
    FOR EACH STATEMENT EXECUTE FUNCTION "personnel_notice_verification_guard"();
