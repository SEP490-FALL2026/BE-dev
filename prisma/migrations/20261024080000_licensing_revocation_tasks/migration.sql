-- The work that makes a revocation real (g6-revocation-by-grant-kind, US-07-05): a task of kind REVOKE in the same queue as the
-- grant. The assignment stays whole until a person has removed the real account (K2), cancelled the renewal (K1) or revoked
-- the right outside the system (K5); only then does the seat go back. A seat has one live revocation task however many
-- reasons ask for it (QĐ-64a): the first reason is on the task, the later ones are rows of their own.

-- 1. The sources that can ask for a revocation, how a revocation is completed, and what is known of the access of a K1 seat.
CREATE TYPE "RevocationSource" AS ENUM (
    'RETURN', 'MANAGER_NOT_NEEDED', 'TRANSFER_REVIEW', 'GHOST_SEAT', 'DEPARTURE', 'ABRUPT_DEPARTURE',
    'TIME_LIMITED_EXPIRY', 'SUBSCRIPTION_REDUCTION', 'SUBSCRIPTION_CANCELLATION', 'SUBSCRIPTION_EXPIRED',
    'NOT_LEGALIZED', 'RE_EXECUTION'
);
CREATE TYPE "RevocationCompletion" AS ENUM ('ACCOUNT_REMOVED', 'ALREADY_GONE', 'RENEWAL_CANCELLED', 'OFF_SYSTEM_REVOKED');
CREATE TYPE "AccessState" AS ENUM ('CUT', 'UNTIL_PAID_END');

-- 2. The task: a revocation has no request, and carries what was decided when it was done.
ALTER TABLE "provisioning_tasks" ALTER COLUMN "request_id" DROP NOT NULL;
ALTER TABLE "provisioning_tasks"
    ADD COLUMN "revocation_source" "RevocationSource",
    ADD COLUMN "completion" "RevocationCompletion",
    ADD COLUMN "paid_through_on" DATE,
    ADD COLUMN "access_state" "AccessState",
    ADD COLUMN "access_cut_on" DATE,
    ADD COLUMN "access_evidence" TEXT,
    ADD COLUMN "completion_note" TEXT;

-- A grant answers for a request and a revocation for none.
ALTER TABLE "provisioning_tasks"
    ADD CONSTRAINT "provisioning_tasks_kind_request" CHECK (("kind" = 'GRANT') = ("request_id" IS NOT NULL));

-- The columns of a revocation say the same thing as its state. A grant has none of them. A revocation always has the
-- source that opened it; it has a completion once completed and not before; the completion of K1 says until when the
-- right was paid and what is known of the access, and a cut access says since when and by what evidence.
ALTER TABLE "provisioning_tasks"
    ADD CONSTRAINT "provisioning_tasks_revocation_columns" CHECK (
        (
            "kind" = 'GRANT'
            AND "revocation_source" IS NULL AND "completion" IS NULL AND "paid_through_on" IS NULL
            AND "access_state" IS NULL AND "access_cut_on" IS NULL AND "access_evidence" IS NULL
            AND "completion_note" IS NULL
        )
        OR (
            "kind" = 'REVOKE'
            AND "revocation_source" IS NOT NULL
            AND (
                ("status" <> 'COMPLETED'
                    AND "completion" IS NULL AND "paid_through_on" IS NULL AND "access_state" IS NULL
                    AND "access_cut_on" IS NULL AND "access_evidence" IS NULL AND "completion_note" IS NULL)
                OR ("status" = 'COMPLETED'
                    AND "completion" IS NOT NULL
                    AND (
                        ("completion" = 'RENEWAL_CANCELLED'
                            AND "paid_through_on" IS NOT NULL AND "access_state" IS NOT NULL
                            AND (
                                ("access_state" = 'UNTIL_PAID_END'
                                    AND "access_cut_on" IS NULL AND "access_evidence" IS NULL)
                                OR ("access_state" = 'CUT'
                                    AND "access_cut_on" IS NOT NULL
                                    AND "access_evidence" IS NOT NULL AND length(btrim("access_evidence")) > 0)
                            ))
                        OR ("completion" <> 'RENEWAL_CANCELLED'
                            AND "paid_through_on" IS NULL AND "access_state" IS NULL
                            AND "access_cut_on" IS NULL AND "access_evidence" IS NULL)
                    )
                    AND ("completion" <> 'ALREADY_GONE'
                         OR ("completion_note" IS NOT NULL AND length(btrim("completion_note")) > 0))
                    AND ("completion_note" IS NULL OR length(btrim("completion_note")) > 0))
            )
        )
    );

-- 3. One grant for an assignment, and one live revocation: after one was closed as failed or cancelled the source may open
-- another, and a completed one is the end of the seat. Neither is a kind of unique the model can say, so the table keeps
-- an ordinary index for the lookup.
DROP INDEX "provisioning_tasks_assignment_id_kind_key";
CREATE INDEX "provisioning_tasks_assignment_id_kind_idx" ON "provisioning_tasks"("assignment_id", "kind");
CREATE UNIQUE INDEX "provisioning_tasks_one_grant_per_assignment"
    ON "provisioning_tasks"("assignment_id") WHERE "kind" = 'GRANT';
CREATE UNIQUE INDEX "provisioning_tasks_one_live_revocation_per_assignment"
    ON "provisioning_tasks"("assignment_id") WHERE "kind" = 'REVOKE' AND "status" NOT IN ('CLOSED_FAILED', 'CANCELLED');

-- 4. A completed task is the end of the work, but for one line: a K1 seat whose access runs to the end of the paid period may
-- be cut earlier, once, with the day and the evidence. Everything else of the task stays as it was. This is the latest
-- definition of the function (20261024030100) with that line added.
CREATE OR REPLACE FUNCTION "provisioning_task_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A provisioning task is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_kept';
    END IF;
    IF OLD."status" IN ('COMPLETED', 'CLOSED_FAILED', 'CANCELLED') THEN
        IF OLD."status" = 'COMPLETED' AND OLD."kind" = 'REVOKE'
           AND OLD."access_state" = 'UNTIL_PAID_END' AND NEW."access_state" = 'CUT'
           AND (to_jsonb(NEW) - 'access_state' - 'access_cut_on' - 'access_evidence' - 'updated_at')
               = (to_jsonb(OLD) - 'access_state' - 'access_cut_on' - 'access_evidence' - 'updated_at') THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'A task that is completed, closed as failed or cancelled is never changed'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_final';
    END IF;
    IF NEW."max_attempts" IS DISTINCT FROM OLD."max_attempts" THEN
        RAISE EXCEPTION 'The most tries of a task are fixed when it is made'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_max_attempts_fixed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. The reasons that asked for a revocation: one row for each source (and what it refers to), the first of them also on the
-- task. A reason is a fact of what was decided and by whom, so it is never changed or deleted.
CREATE TABLE "provisioning_task_reasons" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "source" "RevocationSource" NOT NULL,
    "decided_by_employee_id" UUID,
    "decided_role" TEXT NOT NULL,
    "reference_kind" TEXT,
    "reference_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provisioning_task_reasons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provisioning_task_reasons_role_not_blank" CHECK (length(btrim("decided_role")) > 0),
    CONSTRAINT "provisioning_task_reasons_note_not_blank" CHECK ("note" IS NULL OR length(btrim("note")) > 0),
    CONSTRAINT "provisioning_task_reasons_reference_pair" CHECK (("reference_kind" IS NULL) = ("reference_id" IS NULL))
);

CREATE INDEX "provisioning_task_reasons_task_id_idx" ON "provisioning_task_reasons"("task_id");
CREATE UNIQUE INDEX "provisioning_task_reasons_one_per_source_reference"
    ON "provisioning_task_reasons"("task_id", "source", COALESCE("reference_id", '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE "provisioning_task_reasons" ADD CONSTRAINT "provisioning_task_reasons_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "provisioning_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provisioning_task_reasons" ADD CONSTRAINT "provisioning_task_reasons_decided_by_employee_id_fkey"
    FOREIGN KEY ("decided_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "provisioning_task_reason_reject_change"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'A reason for a revocation is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_reasons_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "provisioning_task_reasons_immutable"
    BEFORE UPDATE OR DELETE ON "provisioning_task_reasons"
    FOR EACH ROW EXECUTE FUNCTION "provisioning_task_reason_reject_change"();
