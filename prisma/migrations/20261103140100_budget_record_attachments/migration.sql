-- BLOCKER B1: budget_version_history_shape_check names the kinds it allows, so a row of a new kind
-- fails with 23514 until the check names it. Kinds are compared as text, so the check stays valid even if the two migrations are
-- ever squashed into one transaction; the three old branches are copied unchanged.
ALTER TABLE "budget_version_history" DROP CONSTRAINT "budget_version_history_shape_check";
ALTER TABLE "budget_version_history" ADD CONSTRAINT "budget_version_history_shape_check" CHECK (
    ("kind"::text = 'FIGURES_UPDATED' AND "position" IS NULL AND "from_position" IS NULL AND "to_position" IS NULL
        AND "line_count" IS NULL AND "before" IS NOT NULL AND jsonb_typeof("before") = 'object'
        AND jsonb_typeof("after") = 'object')
    OR ("kind"::text IN ('LINE_UPDATED', 'WINDOW_MOVED') AND "position" IS NOT NULL AND "position" >= 1
        AND "from_position" IS NULL AND "to_position" IS NULL AND "line_count" IS NULL
        AND "before" IS NOT NULL AND jsonb_typeof("before") = 'object' AND jsonb_typeof("after") = 'object')
    OR ("kind"::text IN ('LINES_ADDED', 'LINES_IMPORTED') AND "position" IS NULL AND "from_position" IS NOT NULL
        AND "from_position" >= 1 AND "to_position" IS NOT NULL AND "to_position" >= "from_position"
        AND "line_count" IS NOT NULL AND "line_count" BETWEEN 1 AND 200 AND "before" IS NULL
        AND jsonb_typeof("after") = 'array' AND jsonb_array_length("after") <= 200)
    OR ("kind"::text = 'ATTACHMENT_ADDED' AND "position" IS NULL AND "from_position" IS NULL AND "to_position" IS NULL
        AND "line_count" IS NULL AND "before" IS NULL AND jsonb_typeof("after") = 'object')
    OR ("kind"::text = 'ATTACHMENT_REMOVED' AND "position" IS NULL AND "from_position" IS NULL AND "to_position" IS NULL
        AND "line_count" IS NULL AND "before" IS NOT NULL AND jsonb_typeof("before") = 'object'
        AND jsonb_typeof("after") = 'object')
);

CREATE TYPE "BudgetAttachmentTarget" AS ENUM ('PROPOSAL', 'VERSION');
CREATE TYPE "BudgetAttachmentStatus" AS ENUM
    ('AWAITING_UPLOAD', 'UPLOADED', 'ATTACHED', 'REMOVED', 'QUARANTINED', 'EXPIRED', 'DISCARDED');

CREATE TABLE "budget_attachments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "target" "BudgetAttachmentTarget" NOT NULL,
    "status" "BudgetAttachmentStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "object_key" TEXT NOT NULL,
    "final_object_key" TEXT,
    "uploaded_by_employee_id" UUID NOT NULL,
    "proposal_id" UUID,
    "version_id" UUID,
    "attached_at" TIMESTAMPTZ(3),
    "removed_at" TIMESTAMPTZ(3),
    "removed_by_employee_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budget_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_attachments_file_name_not_blank" CHECK (length(btrim("file_name")) > 0),
    CONSTRAINT "budget_attachments_size_bytes_positive" CHECK ("size_bytes" > 0),
    CONSTRAINT "budget_attachments_target_owner_check" CHECK (
        ("target" = 'PROPOSAL' AND "version_id" IS NULL) OR
        ("target" = 'VERSION' AND "proposal_id" IS NULL AND "version_id" IS NOT NULL)
    ),
    CONSTRAINT "budget_attachments_proposal_status_check" CHECK (
        "target" <> 'PROPOSAL' OR (("status" = 'ATTACHED') = ("proposal_id" IS NOT NULL))
    ),
    CONSTRAINT "budget_attachments_uploaded_target_check" CHECK (
        "status" <> 'UPLOADED' OR "target" = 'PROPOSAL'
    ),
    CONSTRAINT "budget_attachments_removed_target_check" CHECK (
        "status" <> 'REMOVED' OR "target" = 'VERSION'
    ),
    CONSTRAINT "budget_attachments_attached_at_check" CHECK (
        ("status" IN ('ATTACHED', 'REMOVED')) = ("attached_at" IS NOT NULL)
    ),
    CONSTRAINT "budget_attachments_removed_at_check" CHECK (
        ("status" = 'REMOVED') = ("removed_at" IS NOT NULL)
    ),
    CONSTRAINT "budget_attachments_removed_by_check" CHECK (
        ("removed_at" IS NULL) = ("removed_by_employee_id" IS NULL)
    ),
    CONSTRAINT "budget_attachments_final_key_check" CHECK (
        ("status" IN ('UPLOADED', 'ATTACHED', 'REMOVED') AND "final_object_key" IS NOT NULL)
        OR ("status" IN ('AWAITING_UPLOAD', 'QUARANTINED') AND "final_object_key" IS NULL)
        OR ("status" IN ('EXPIRED', 'DISCARDED'))
    )
);

CREATE UNIQUE INDEX "budget_attachments_object_key_key" ON "budget_attachments"("object_key");
CREATE UNIQUE INDEX "budget_attachments_final_object_key_key" ON "budget_attachments"("final_object_key");
CREATE INDEX "budget_attachments_proposal_id_attached_at_id_idx" ON "budget_attachments"("proposal_id", "attached_at", "id");
CREATE INDEX "budget_attachments_version_id_status_attached_at_id_idx" ON "budget_attachments"("version_id", "status", "attached_at", "id");
CREATE INDEX "budget_attachments_status_created_at_idx" ON "budget_attachments"("status", "created_at");
CREATE INDEX "budget_attachments_uploaded_by_status_created_at_idx" ON "budget_attachments"("uploaded_by_employee_id", "status", "created_at");

ALTER TABLE "budget_attachments" ADD CONSTRAINT "budget_attachments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "budget_attachments" ADD CONSTRAINT "budget_attachments_proposal_id_fkey"
    FOREIGN KEY ("proposal_id") REFERENCES "budget_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "budget_attachments" ADD CONSTRAINT "budget_attachments_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "budget_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "budget_attachment_guard"() RETURNS trigger AS $$
DECLARE
    v_version_state "BudgetVersionState";
    v_version_detached_at TIMESTAMPTZ(3);
    v_proposal_state "BudgetProposalState";
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A budget attachment is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'budget_attachments_kept';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW."status"::text <> 'AWAITING_UPLOAD' OR NEW."proposal_id" IS NOT NULL OR NEW."final_object_key" IS NOT NULL THEN
            RAISE EXCEPTION 'A budget attachment is born awaiting upload without proposal or final key'
                USING ERRCODE = '55000', CONSTRAINT = 'budget_attachments_born_awaiting';
        END IF;

        IF NEW."target"::text = 'VERSION' THEN
            SELECT "state", "detached_at" INTO v_version_state, v_version_detached_at
            FROM "budget_versions" WHERE "id" = NEW."version_id";

            IF v_version_state::text NOT IN ('DRAFT', 'CHANGES_REQUESTED') OR v_version_detached_at IS NOT NULL THEN
                RAISE EXCEPTION 'A version attachment can only be declared for an editable version'
                    USING ERRCODE = '55000', CONSTRAINT = 'budget_attachments_target_locked';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- UPDATE
    IF (NEW."id", NEW."organization_id", NEW."target", NEW."file_name", NEW."content_type", NEW."size_bytes",
        NEW."object_key", NEW."uploaded_by_employee_id", NEW."created_at", NEW."version_id")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."target", OLD."file_name", OLD."content_type", OLD."size_bytes",
        OLD."object_key", OLD."uploaded_by_employee_id", OLD."created_at", OLD."version_id") THEN
        RAISE EXCEPTION 'What was declared of a budget attachment never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'budget_attachments_declared';
    END IF;

    IF OLD."final_object_key" IS NOT NULL AND NEW."final_object_key" IS DISTINCT FROM OLD."final_object_key" THEN
        RAISE EXCEPTION 'Where a kept budget attachment is stored never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'budget_attachments_fixed';
    END IF;

    IF OLD."proposal_id" IS NOT NULL AND NEW."proposal_id" IS DISTINCT FROM OLD."proposal_id" THEN
        RAISE EXCEPTION 'The proposal of a budget attachment is set once'
            USING ERRCODE = '55000', CONSTRAINT = 'budget_attachments_fixed';
    END IF;

    IF OLD."status"::text IN ('REMOVED', 'QUARANTINED', 'EXPIRED', 'DISCARDED') OR NOT (
        (OLD."status"::text = 'AWAITING_UPLOAD' AND (
            (NEW."status"::text = 'AWAITING_UPLOAD')
            OR (NEW."status"::text = 'UPLOADED' AND OLD."target"::text = 'PROPOSAL')
            OR (NEW."status"::text = 'ATTACHED' AND OLD."target"::text = 'VERSION')
            OR (NEW."status"::text IN ('QUARANTINED', 'EXPIRED', 'DISCARDED'))
        ))
        OR (OLD."status"::text = 'UPLOADED' AND (
            NEW."status"::text IN ('UPLOADED', 'ATTACHED', 'EXPIRED', 'DISCARDED')
        ))
        OR (OLD."status"::text = 'ATTACHED' AND (
            NEW."status"::text = 'ATTACHED'
            OR (NEW."status"::text = 'REMOVED' AND OLD."target"::text = 'VERSION')
        ))
    ) THEN
        RAISE EXCEPTION 'A budget attachment moves one way and terminal states stay as they are'
            USING ERRCODE = '55000', CONSTRAINT = 'budget_attachments_one_way';
    END IF;

    IF NEW."status"::text IN ('ATTACHED', 'REMOVED') AND NEW."status"::text IS DISTINCT FROM OLD."status"::text THEN
        IF NEW."target"::text = 'VERSION' THEN
            SELECT "state", "detached_at" INTO v_version_state, v_version_detached_at
            FROM "budget_versions" WHERE "id" = NEW."version_id";

            IF v_version_state::text NOT IN ('DRAFT', 'CHANGES_REQUESTED') OR v_version_detached_at IS NOT NULL THEN
                RAISE EXCEPTION 'A version attachment can only be attached or removed on an editable version'
                    USING ERRCODE = '55000', CONSTRAINT = 'budget_attachments_target_locked';
            END IF;
        ELSIF NEW."target"::text = 'PROPOSAL' THEN
            SELECT "state" INTO v_proposal_state
            FROM "budget_proposals" WHERE "id" = NEW."proposal_id";

            IF v_proposal_state::text <> 'SUBMITTED' THEN
                RAISE EXCEPTION 'A proposal attachment can only be attached to a submitted proposal'
                    USING ERRCODE = '55000', CONSTRAINT = 'budget_attachments_target_locked';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "budget_attachment_guard"
    BEFORE INSERT OR UPDATE OR DELETE ON "budget_attachments"
    FOR EACH ROW EXECUTE FUNCTION "budget_attachment_guard"();

