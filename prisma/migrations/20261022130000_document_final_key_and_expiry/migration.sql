-- A file that was looked at cannot be replaced by an old upload link, and a file whose upload never came is given up
-- (post-merge review SEC-01 and DB-13). The bytes that pass the check are copied once to a key no upload link reaches;
-- a file whose upload never arrived ends as EXPIRED, with an event in the audit trail.

ALTER TYPE "DocumentStatus" ADD VALUE 'EXPIRED';

ALTER TABLE "document_attachments" ADD COLUMN "final_object_key" TEXT;
CREATE UNIQUE INDEX "document_attachments_final_object_key_key" ON "document_attachments"("final_object_key");

-- A file uploaded before this migration is kept where it is: its key is its final key.
ALTER TABLE "document_attachments" DISABLE TRIGGER "document_attachments_guard";
UPDATE "document_attachments" SET "final_object_key" = "object_key" WHERE "status" IN ('PENDING_ATTACH', 'READY');
ALTER TABLE "document_attachments" ENABLE TRIGGER "document_attachments_guard";

-- Exactly the files that were uploaded and kept have a final key.
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_final_key_when_kept" CHECK (
    ("status" IN ('PENDING_ATTACH', 'READY')) = ("final_object_key" IS NOT NULL)
);

-- The guard of migration 20261020250000 with the new state and the final key: set once when the file is uploaded, never
-- changed; a file that expired, like one that was quarantined, stays as it is.
CREATE OR REPLACE FUNCTION "document_attachment_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A document is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'document_attachments_kept';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."purpose", NEW."file_name", NEW."content_type", NEW."size_bytes",
        NEW."object_key", NEW."uploaded_by_app_user_id", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."purpose", OLD."file_name", OLD."content_type", OLD."size_bytes",
        OLD."object_key", OLD."uploaded_by_app_user_id", OLD."created_at") THEN
        RAISE EXCEPTION 'What was declared of a document never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'document_attachments_declared';
    END IF;

    IF OLD."final_object_key" IS NOT NULL AND NEW."final_object_key" IS DISTINCT FROM OLD."final_object_key" THEN
        RAISE EXCEPTION 'Where a kept file is stored never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'document_attachments_final_key_fixed';
    END IF;

    IF OLD."status"::text IN ('READY', 'QUARANTINED', 'EXPIRED') OR NOT (
           (OLD."status"::text = 'AWAITING_UPLOAD' AND NEW."status"::text IN ('AWAITING_UPLOAD', 'PENDING_ATTACH', 'QUARANTINED', 'EXPIRED'))
        OR (OLD."status"::text = 'PENDING_ATTACH' AND NEW."status"::text IN ('PENDING_ATTACH', 'READY'))
    ) THEN
        RAISE EXCEPTION 'A document moves one way and an attached, quarantined or expired one stays as it is'
            USING ERRCODE = '55000', CONSTRAINT = 'document_attachments_one_way';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
