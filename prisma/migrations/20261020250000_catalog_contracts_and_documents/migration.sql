-- Contracts and the files kept for them (g3-contract-documents, US-04-04): a contract is a name for now (the Story of the
-- contract itself is not written, OQ-B-17); a file is private, moves one way (awaiting its upload, uploaded and waiting for its
-- owner, attached to a contract for good, or quarantined when what was stored is not what was declared) and has at most one
-- owner. The bytes live in the object storage; this table keeps only where and what they are. No link is ever stored.

-- CreateEnum
CREATE TYPE "DocumentPurpose" AS ENUM (
    'CONTRACT_ATTACHMENT', 'PURCHASE_DOCUMENT', 'TAX_PAYMENT_PROOF', 'SIGNATURE_RECORD', 'IMPORT_SOURCE', 'COST_STATEMENT'
);
CREATE TYPE "DocumentStatus" AS ENUM ('AWAITING_UPLOAD', 'PENDING_ATTACH', 'READY', 'QUARANTINED');

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    -- A value, not a foreign key: the record outlives the account (as the audit trail does).
    "created_by_app_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contracts_name_given" CHECK (length(btrim("name")) > 0)
);

CREATE TABLE "document_attachments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purpose" "DocumentPurpose" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "object_key" TEXT NOT NULL,
    "uploaded_by_app_user_id" UUID NOT NULL,
    "contract_id" UUID,
    "attached_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_attachments_name_given" CHECK (length(btrim("file_name")) > 0),
    CONSTRAINT "document_attachments_size_positive" CHECK ("size_bytes" > 0),
    -- Attached and owned are one fact: a file is READY exactly when it has its one owner and the time it got it.
    CONSTRAINT "document_attachments_owner_state" CHECK (
        ("status" = 'READY') = ("contract_id" IS NOT NULL)
        AND ("contract_id" IS NULL) = ("attached_at" IS NULL)
    ),
    -- Only the purposes whose file belongs to a contract can have one for an owner.
    CONSTRAINT "document_attachments_purpose_fits_owner" CHECK (
        "contract_id" IS NULL OR "purpose" IN ('CONTRACT_ATTACHMENT', 'PURCHASE_DOCUMENT')
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "document_attachments_object_key_key" ON "document_attachments"("object_key");
CREATE INDEX "document_attachments_contract_id_idx" ON "document_attachments"("contract_id");
CREATE INDEX "document_attachments_uploaded_by_app_user_id_status_idx"
    ON "document_attachments"("uploaded_by_app_user_id", "status");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_contract_id_fkey"
    FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A contract is a record: never changed, never deleted.
CREATE FUNCTION "contract_reject_change"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'A contract is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = 'contracts_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "contracts_immutable"
    BEFORE UPDATE OR DELETE ON "contracts"
    FOR EACH ROW EXECUTE FUNCTION "contract_reject_change"();

-- A file is never deleted, what was declared of it never changes, and it moves one way: awaiting its upload to uploaded or
-- quarantined, uploaded to attached. An attached file and a quarantined one stay as they are.
CREATE FUNCTION "document_attachment_guard"() RETURNS trigger AS $$
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

    IF OLD."status" IN ('READY', 'QUARANTINED') OR NOT (
           (OLD."status" = 'AWAITING_UPLOAD' AND NEW."status" IN ('AWAITING_UPLOAD', 'PENDING_ATTACH', 'QUARANTINED'))
        OR (OLD."status" = 'PENDING_ATTACH' AND NEW."status" IN ('PENDING_ATTACH', 'READY'))
    ) THEN
        RAISE EXCEPTION 'A document moves one way and an attached or quarantined one stays as it is'
            USING ERRCODE = '55000', CONSTRAINT = 'document_attachments_one_way';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "document_attachments_guard"
    BEFORE UPDATE OR DELETE ON "document_attachments"
    FOR EACH ROW EXECUTE FUNCTION "document_attachment_guard"();
