-- The review of the tools outside the standard toolset that the new head of a department makes after a transfer
-- (g6-transfer-tool-review, US-03-07): one review for each placement a transfer opened, one line for each tool outside the
-- standard toolset. A decision is written once; who decides is read from the organization when asked, never stored.

-- CreateEnum
CREATE TYPE "TransferReviewStatus" AS ENUM ('OPEN', 'COMPLETED', 'SUPERSEDED');
CREATE TYPE "TransferReviewDecision" AS ENUM ('PENDING', 'STILL_NEEDED', 'NOT_NEEDED', 'NEEDS_NEW_TOOL');

-- CreateTable
CREATE TABLE "transfer_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "transfer_id" UUID,
    "placement_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "job_title_id" UUID NOT NULL,
    "effective_on" DATE NOT NULL,
    "due_on" DATE NOT NULL,
    "status" "TransferReviewStatus" NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "overdue_noticed_at" TIMESTAMPTZ(3),

    CONSTRAINT "transfer_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transfer_reviews_due_not_before_effective" CHECK ("due_on" >= "effective_on"),
    -- A review that is completed says when, and only a completed one does.
    CONSTRAINT "transfer_reviews_completed_together" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL))
);

CREATE TABLE "transfer_review_items" (
    "review_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    -- Why the seat was given, as the Assignment kept it when the review was opened: the head reads it to decide.
    "grant_reason" TEXT,
    "decision" "TransferReviewDecision" NOT NULL DEFAULT 'PENDING',
    "decided_by_employee_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "new_tool_note" TEXT,
    "revocation_task_id" UUID,

    CONSTRAINT "transfer_review_items_pkey" PRIMARY KEY ("review_id", "assignment_id"),
    CONSTRAINT "transfer_review_items_position_positive" CHECK ("position" >= 1),
    -- The decision, the person who made it and the moment come together.
    CONSTRAINT "transfer_review_items_decided_together" CHECK (
        ("decision" = 'PENDING') = ("decided_by_employee_id" IS NULL) AND ("decision" = 'PENDING') = ("decided_at" IS NULL)
    ),
    -- The need for a new tool may carry a note, and no other decision does; a note is never blank.
    CONSTRAINT "transfer_review_items_note_for_new_tool" CHECK (
        "new_tool_note" IS NULL
        OR ("decision" = 'NEEDS_NEW_TOOL' AND length(btrim("new_tool_note")) > 0 AND length("new_tool_note") <= 500)
    ),
    -- Only a tool that is no longer needed has a revocation, and it always has one.
    CONSTRAINT "transfer_review_items_revocation_for_not_needed" CHECK (
        ("decision" = 'NOT_NEEDED') = ("revocation_task_id" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "transfer_reviews_placement_id_key" ON "transfer_reviews"("placement_id");
CREATE INDEX "transfer_reviews_due_on_id_idx" ON "transfer_reviews"("due_on", "id");
CREATE INDEX "transfer_reviews_employee_id_idx" ON "transfer_reviews"("employee_id");
CREATE INDEX "transfer_reviews_department_id_idx" ON "transfer_reviews"("department_id");
CREATE INDEX "transfer_review_items_assignment_id_idx" ON "transfer_review_items"("assignment_id");

-- AddForeignKey
ALTER TABLE "transfer_reviews" ADD CONSTRAINT "transfer_reviews_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_reviews" ADD CONSTRAINT "transfer_reviews_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_reviews" ADD CONSTRAINT "transfer_reviews_transfer_id_fkey"
    FOREIGN KEY ("transfer_id") REFERENCES "department_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_reviews" ADD CONSTRAINT "transfer_reviews_placement_id_fkey"
    FOREIGN KEY ("placement_id") REFERENCES "employee_placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_reviews" ADD CONSTRAINT "transfer_reviews_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_reviews" ADD CONSTRAINT "transfer_reviews_job_title_id_fkey"
    FOREIGN KEY ("job_title_id") REFERENCES "job_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_review_items" ADD CONSTRAINT "transfer_review_items_review_id_fkey"
    FOREIGN KEY ("review_id") REFERENCES "transfer_reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_review_items" ADD CONSTRAINT "transfer_review_items_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_review_items" ADD CONSTRAINT "transfer_review_items_decided_by_employee_id_fkey"
    FOREIGN KEY ("decided_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_review_items" ADD CONSTRAINT "transfer_review_items_revocation_task_id_fkey"
    FOREIGN KEY ("revocation_task_id") REFERENCES "provisioning_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A decision is written once and kept; the tool and the review a line belongs to never change; no line is deleted.
CREATE FUNCTION "transfer_review_item_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A line of a transfer review is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'transfer_review_item_kept';
    END IF;
    IF NEW."review_id" IS DISTINCT FROM OLD."review_id" OR NEW."assignment_id" IS DISTINCT FROM OLD."assignment_id"
       OR NEW."plan_id" IS DISTINCT FROM OLD."plan_id" OR NEW."position" IS DISTINCT FROM OLD."position"
       OR NEW."grant_reason" IS DISTINCT FROM OLD."grant_reason" THEN
        RAISE EXCEPTION 'A line of a transfer review keeps its review, its seat and its place'
            USING ERRCODE = '55000', CONSTRAINT = 'transfer_review_item_identity_fixed';
    END IF;
    IF OLD."decision" <> 'PENDING' THEN
        RAISE EXCEPTION 'A decision about a tool is written once and never changed'
            USING ERRCODE = '55000', CONSTRAINT = 'transfer_review_item_decision_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transfer_review_items_guard"
    BEFORE UPDATE OR DELETE ON "transfer_review_items"
    FOR EACH ROW EXECUTE FUNCTION "transfer_review_item_guard"();

-- A review keeps who and where it is about, ends only once (completed or superseded) and is never deleted.
CREATE FUNCTION "transfer_review_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A transfer review is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'transfer_review_kept';
    END IF;
    IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR NEW."employee_id" IS DISTINCT FROM OLD."employee_id"
       OR NEW."placement_id" IS DISTINCT FROM OLD."placement_id" OR NEW."department_id" IS DISTINCT FROM OLD."department_id"
       OR NEW."job_title_id" IS DISTINCT FROM OLD."job_title_id" OR NEW."effective_on" IS DISTINCT FROM OLD."effective_on"
       OR NEW."due_on" IS DISTINCT FROM OLD."due_on" OR NEW."transfer_id" IS DISTINCT FROM OLD."transfer_id" THEN
        RAISE EXCEPTION 'A transfer review keeps its person, its department and its deadline'
            USING ERRCODE = '55000', CONSTRAINT = 'transfer_review_identity_fixed';
    END IF;
    IF OLD."status" <> 'OPEN' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
        RAISE EXCEPTION 'A transfer review that ended is never reopened'
            USING ERRCODE = '55000', CONSTRAINT = 'transfer_review_status_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transfer_reviews_guard"
    BEFORE UPDATE OR DELETE ON "transfer_reviews"
    FOR EACH ROW EXECUTE FUNCTION "transfer_review_guard"();
