-- The renewal of a right that ends on a day (BR-MF1-08, QĐ-108a, QĐ-108b):
-- (1) the approval no longer extends the right by itself: it opens an IT task of the kind EXTEND, which answers for the request like a
--     grant does; the IT Admin completes it and the record that follows the old one is written then. Only relaxations of the
--     constraints of the tasks: every row that exists keeps satisfying them.
-- (2) the window in which a renewal may be sent, recorded once when it opens with the number of days in force then, so a later change
--     of the parameter reaches only the windows not yet open. Rows are facts: never changed or deleted.

-- 1a. A grant and an extension answer for a request; a revocation for none.
ALTER TABLE "provisioning_tasks" DROP CONSTRAINT "provisioning_tasks_kind_request";
ALTER TABLE "provisioning_tasks"
    ADD CONSTRAINT "provisioning_tasks_kind_request" CHECK (("kind" IN ('GRANT', 'EXTEND')) = ("request_id" IS NOT NULL));

-- 1b. An extension has none of the columns of a revocation, as a grant has none: the branch of the grant is widened to the two kinds.
-- The constraint is rewritten from its own current definition, and the migration stops unless the branch is there exactly once.
DO $$
DECLARE
    old_definition TEXT;
    anchor CONSTANT TEXT := '(kind = ''GRANT''::"ProvisioningTaskKind")';
    widened CONSTANT TEXT := '(kind = ANY (ARRAY[''GRANT''::"ProvisioningTaskKind", ''EXTEND''::"ProvisioningTaskKind"]))';
BEGIN
    SELECT pg_get_constraintdef(c."oid") INTO old_definition
      FROM pg_constraint c
     WHERE c."conrelid" = 'provisioning_tasks'::regclass AND c."conname" = 'provisioning_tasks_revocation_columns';
    IF old_definition IS NULL
       OR (length(old_definition) - length(replace(old_definition, anchor, ''))) / length(anchor) <> 1 THEN
        RAISE EXCEPTION 'provisioning_tasks_revocation_columns is not in the shape this migration widens';
    END IF;
    ALTER TABLE "provisioning_tasks" DROP CONSTRAINT "provisioning_tasks_revocation_columns";
    EXECUTE 'ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_revocation_columns" '
        || replace(old_definition, anchor, widened);
END
$$;

-- 1c. One open extension for a seat, as there is one open grant.
CREATE UNIQUE INDEX "provisioning_tasks_one_open_extension_per_assignment" ON "provisioning_tasks"("assignment_id")
    WHERE "kind" = 'EXTEND' AND "status" NOT IN ('COMPLETED', 'CLOSED_FAILED', 'CANCELLED');

-- 2. The window of the renewal of a right, recorded when it opened (BR-MF1-08a).
CREATE TABLE "assignment_renewal_windows" (
    "assignment_id" UUID NOT NULL,
    "expected_end_date" DATE NOT NULL,
    "organization_id" UUID NOT NULL,
    "window_days" SMALLINT NOT NULL,
    "opens_on" DATE NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_renewal_windows_pkey" PRIMARY KEY ("assignment_id", "expected_end_date"),
    CONSTRAINT "assignment_renewal_windows_days" CHECK ("window_days" BETWEEN 1 AND 365),
    CONSTRAINT "assignment_renewal_windows_opens_on" CHECK ("opens_on" = "expected_end_date" - "window_days")
);

ALTER TABLE "assignment_renewal_windows"
    ADD CONSTRAINT "assignment_renewal_windows_assignment_id_fkey" FOREIGN KEY ("assignment_id")
        REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "assignment_renewal_window_guard"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'An opened renewal window is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = 'assignment_renewal_windows_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assignment_renewal_windows_immutable"
    BEFORE UPDATE OR DELETE ON "assignment_renewal_windows"
    FOR EACH ROW EXECUTE FUNCTION "assignment_renewal_window_guard"();
