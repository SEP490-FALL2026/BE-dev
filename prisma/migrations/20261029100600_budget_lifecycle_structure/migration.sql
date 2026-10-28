-- The structure of the annual budget lifecycle (g0-g6-final-business-baseline-remediation, Task 1.7; F62, F63, F36, F66, F67;
-- QĐ-91, QĐ-92; spec I, J.1, J.2, J.4, K). The enum values (`BudgetVersionState.EXPIRED`, `BudgetProposalState.CLOSED_FISCAL_YEAR_ENDED`,
-- `BudgetCheckTrigger.FINANCE_OUTCOME_WHILE_WAITING`) and `budget_versions.detached_at` are already in the schema
-- (`20261028100000_final_vocabulary_values`, `20261028110000_budget_version_detached_at`): a value cannot be used in the
-- migration that adds it. This migration adds the columns and rules that use them, reconciles the proposals the release before
-- the compatibility one gave back wrongly (J.2), and creates the two tables of the release (the append-only history of a
-- version, the notices held for a department that has no head yet).
--
-- The compatibility image stays valid on this schema: it writes none of the new columns, never writes `EXPIRED` or
-- `CLOSED_FISCAL_YEAR_ENDED`, no longer returns a proposal when its first version is refused (so no row of the old shape
-- appears after the compatibility release started), and every new rule only constrains columns it does not write.

-- 1. The proposals the release before the compatibility one gave back because their first version was refused, read the way
-- `pnpm ops:preflight` reads them (the same expressions as `migration-preflight.repo.ts` and `judgeLegacyReturns`).
-- A proposal given back with no refusal on its versions was given back by Finance and is left as it is.
CREATE TEMPORARY TABLE "p04_legacy_candidates" ON COMMIT DROP AS
SELECT p."id" AS "proposal_id",
       count(*) AS "refusals",
       bool_and(v."kind" = 'INITIAL' AND v."state" = 'REJECTED'
                AND d."decided_by_employee_id" = p."returned_by_employee_id"
                AND d."reason" IS NOT DISTINCT FROM p."returned_reason"
                AND d."decided_at" = p."returned_at") AS "matches",
       (array_agg(d."id" ORDER BY d."id"))[1] AS "decision_id"
  FROM "budget_proposals" p
  JOIN "budget_versions" v ON v."proposal_id" = p."id"
  JOIN "budget_version_decisions" d ON d."version_id" = v."id" AND d."decision" = 'REJECTED'
 WHERE p."state" = 'RETURNED'
 GROUP BY p."id";

CREATE TEMPORARY TABLE "p04_legacy_neighbours" ON COMMIT DROP AS
SELECT p."id" AS "proposal_id", q."id", q."previous_proposal_id", (q."submitted_at" > p."returned_at") AS "submitted_after"
  FROM "p04_legacy_candidates" c
  JOIN "budget_proposals" p ON p."id" = c."proposal_id"
  JOIN "budget_proposals" q
    ON q."organization_id" = p."organization_id" AND q."cost_center_id" = p."cost_center_id" AND q."year" = p."year"
   AND q."id" <> p."id" AND (q."submitted_at" > p."returned_at" OR q."previous_proposal_id" = p."id");

-- R1: nothing was sent after the return. R2: exactly one proposal sends it again and every proposal sent after the return
-- belongs to the chain of resubmissions that starts at it. Anything else is ambiguous and is never guessed.
CREATE TEMPORARY TABLE "p04_legacy_returns" ON COMMIT DROP AS
WITH RECURSIVE "chain"("proposal_id", "id") AS (
    SELECT n."proposal_id", n."id"
      FROM "p04_legacy_neighbours" n
     WHERE n."previous_proposal_id" = n."proposal_id"
       AND (SELECT count(*) FROM "p04_legacy_neighbours" r
             WHERE r."proposal_id" = n."proposal_id" AND r."previous_proposal_id" = r."proposal_id") = 1
    UNION
    SELECT ch."proposal_id", n."id"
      FROM "chain" ch
      JOIN "p04_legacy_neighbours" n
        ON n."proposal_id" = ch."proposal_id" AND n."submitted_after" AND n."previous_proposal_id" = ch."id"
)
SELECT c."proposal_id", c."decision_id",
       CASE
           WHEN NOT (c."refusals" = 1 AND c."matches") THEN NULL
           WHEN NOT EXISTS (SELECT 1 FROM "p04_legacy_neighbours" n WHERE n."proposal_id" = c."proposal_id" AND n."submitted_after")
               THEN CASE WHEN NOT EXISTS (SELECT 1 FROM "p04_legacy_neighbours" n
                                           WHERE n."proposal_id" = c."proposal_id"
                                             AND n."previous_proposal_id" = c."proposal_id") THEN 'R1' END
           WHEN (SELECT count(*) FROM "p04_legacy_neighbours" n
                  WHERE n."proposal_id" = c."proposal_id" AND n."previous_proposal_id" = c."proposal_id") = 1
                AND NOT EXISTS (SELECT 1 FROM "p04_legacy_neighbours" n
                                 WHERE n."proposal_id" = c."proposal_id" AND n."submitted_after"
                                   AND NOT EXISTS (SELECT 1 FROM "chain" ch
                                                    WHERE ch."proposal_id" = n."proposal_id" AND ch."id" = n."id"))
               THEN 'R2'
       END AS "rule",
       (SELECT n."id" FROM "p04_legacy_neighbours" n
         WHERE n."proposal_id" = c."proposal_id" AND n."previous_proposal_id" = c."proposal_id"
         ORDER BY n."id" LIMIT 1) AS "resender_id"
  FROM "p04_legacy_candidates" c;

-- Nothing is written while an ambiguous proposal remains. `ops:preflight` is `BLOCKED` for the same ids, earlier.
DO $$
DECLARE
    ambiguous TEXT;
BEGIN
    SELECT string_agg(r."proposal_id"::text, ', ' ORDER BY r."proposal_id")
      INTO ambiguous
      FROM "p04_legacy_returns" r
     WHERE r."rule" IS NULL;

    IF ambiguous IS NOT NULL THEN
        RAISE EXCEPTION 'Budget proposals given back by the old path of refusing a version that cannot be reconciled without a guess: %. Nothing was changed. Run `pnpm ops:preflight`; each id needs an Owner/operator decision.', ambiguous
            USING ERRCODE = '23503';
    END IF;
END
$$;

-- 2. The columns. Both successor links are values of the system, never of a client.
ALTER TABLE "budget_proposals"
    ADD COLUMN "successor_of_proposal_id" UUID,
    ADD COLUMN "succeeded_at" TIMESTAMPTZ(3),
    ADD COLUMN "closed_at" TIMESTAMPTZ(3);
ALTER TABLE "budget_versions"
    ADD COLUMN "never_current" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "expired_at" TIMESTAMPTZ(3),
    ADD COLUMN "rejected_predecessor_id" UUID;

-- The old key of "one open proposal" is replaced below, after the rows are reconciled.
DROP INDEX "budget_proposals_open_key";

-- 3. One Audit Trail record for each proposal that changes, written before the row changes (append-only, actor SYSTEM): the
-- returned proposal, and under rule R2 the proposal that sent it again (it stops being a resubmission and becomes the successor).
-- The reason of the refusal stays in `budget_version_decisions` (append-only) and in the audit of the original refusal.
INSERT INTO "audit_events" ("id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action",
                            "resource_type", "resource_id", "before", "after", "correlation_id")
SELECT gen_random_uuid(), p."organization_id", 'SYSTEM'::"AuditActorKind", NULL::uuid, '{}'::text[], 'BUDGET_PROPOSAL.LEGACY_REJECTION_RECONCILED',
       'BudgetProposal', p."id"::text,
       jsonb_strip_nulls(jsonb_build_object(
           'state', p."state", 'returnedReason', p."returned_reason",
           'returnedByEmployeeId', p."returned_by_employee_id", 'returnedAt', p."returned_at",
           'previousProposalId', p."previous_proposal_id")),
       jsonb_strip_nulls(jsonb_build_object(
           'state', 'REVIEWED', 'succeededAt', c."submitted_at", 'successorOfProposalId', NULL,
           'successorProposalId', r."resender_id", 'decisionId', r."decision_id", 'rule', r."rule",
           'migration', '20261029100600_budget_lifecycle_structure')),
       '20261029100600_budget_lifecycle_structure'
  FROM "p04_legacy_returns" r
  JOIN "budget_proposals" p ON p."id" = r."proposal_id"
  LEFT JOIN "budget_proposals" c ON c."id" = r."resender_id" AND r."rule" = 'R2'
UNION ALL
SELECT gen_random_uuid(), c."organization_id", 'SYSTEM'::"AuditActorKind", NULL::uuid, '{}'::text[], 'BUDGET_PROPOSAL.LEGACY_REJECTION_RECONCILED',
       'BudgetProposal', c."id"::text,
       jsonb_strip_nulls(jsonb_build_object('state', c."state", 'previousProposalId', c."previous_proposal_id")),
       jsonb_strip_nulls(jsonb_build_object(
           'state', c."state", 'successorOfProposalId', r."proposal_id", 'decisionId', r."decision_id", 'rule', r."rule",
           'migration', '20261029100600_budget_lifecycle_structure')),
       '20261029100600_budget_lifecycle_structure'
  FROM "p04_legacy_returns" r
  JOIN "budget_proposals" c ON c."id" = r."resender_id" AND r."rule" = 'R2';

-- 4. R2 first: the proposal that sent the returned one again becomes its successor (and stops being a resubmission); then
-- both rules put the returned proposal back to `REVIEWED`, where a refused version leaves it (QĐ-92c(1)).
UPDATE "budget_proposals" c
   SET "previous_proposal_id" = NULL, "successor_of_proposal_id" = r."proposal_id"
  FROM "p04_legacy_returns" r
 WHERE r."rule" = 'R2' AND c."id" = r."resender_id";

UPDATE "budget_proposals" p
   SET "state" = 'REVIEWED', "returned_reason" = NULL, "returned_by_employee_id" = NULL, "returned_at" = NULL,
       "succeeded_at" = c."submitted_at", "updated_at" = CURRENT_TIMESTAMP
  FROM "p04_legacy_returns" r
  LEFT JOIN "budget_proposals" c ON c."id" = r."resender_id" AND r."rule" = 'R2'
 WHERE p."id" = r."proposal_id";

-- 5. A draft version of a proposal that was withdrawn or given back by Finance is detached from it, from the moment of the
-- withdrawal or the return (F36, QĐ-91a: no new state; a draft that no proposal owns anymore can only wait for its year to
-- end). A draft of a proposal put back to `REVIEWED` above is not detached.
UPDATE "budget_versions" v
   SET "detached_at" = COALESCE(p."withdrawn_at", p."returned_at")
  FROM "budget_proposals" p
 WHERE v."proposal_id" = p."id" AND v."state" = 'DRAFT' AND v."detached_at" IS NULL
   AND p."state" IN ('WITHDRAWN', 'RETURNED');

-- 6. The rules of the columns.
-- 6a. Proposals: the state and its columns (the closed state carries its moment and may keep the return it had), the
-- succession (a proposal is a resubmission OR a successor, never both, never of itself, and only a reviewed one has one).
ALTER TABLE "budget_proposals" DROP CONSTRAINT "budget_proposals_state_check";
ALTER TABLE "budget_proposals" ADD CONSTRAINT "budget_proposals_state_check" CHECK (
    (("state" = 'RETURNED') AND "returned_reason" IS NOT NULL AND btrim("returned_reason") <> ''
        AND "returned_by_employee_id" IS NOT NULL AND "returned_at" IS NOT NULL
        AND "withdrawn_at" IS NULL AND "closed_at" IS NULL)
    OR (("state" = 'WITHDRAWN') AND "withdrawn_at" IS NOT NULL AND "returned_reason" IS NULL
        AND "returned_by_employee_id" IS NULL AND "returned_at" IS NULL AND "closed_at" IS NULL)
    OR (("state" IN ('SUBMITTED', 'REVIEWED')) AND "withdrawn_at" IS NULL AND "returned_reason" IS NULL
        AND "returned_by_employee_id" IS NULL AND "returned_at" IS NULL AND "closed_at" IS NULL)
    OR (("state" = 'CLOSED_FISCAL_YEAR_ENDED') AND "closed_at" IS NOT NULL AND "withdrawn_at" IS NULL
        AND ("returned_reason" IS NULL) = ("returned_by_employee_id" IS NULL)
        AND ("returned_reason" IS NULL) = ("returned_at" IS NULL))
);

ALTER TABLE "budget_proposals" ADD CONSTRAINT "budget_proposals_succession_check" CHECK (
    ("successor_of_proposal_id" IS NULL OR "previous_proposal_id" IS NULL)
    AND "successor_of_proposal_id" IS DISTINCT FROM "id"
    AND ("succeeded_at" IS NULL OR "state" = 'REVIEWED')
);

ALTER TABLE "budget_proposals" ADD CONSTRAINT "budget_proposals_successor_of_proposal_id_fkey"
    FOREIGN KEY ("successor_of_proposal_id") REFERENCES "budget_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "budget_proposals_successor_of_proposal_id_key" ON "budget_proposals"("successor_of_proposal_id");

-- One open proposal for each (Cost Center, year): a submitted or reviewed one that no successor has taken over.
CREATE UNIQUE INDEX "budget_proposals_open_key" ON "budget_proposals"("cost_center_id", "year")
    WHERE "state" IN ('SUBMITTED', 'REVIEWED') AND "succeeded_at" IS NULL;

-- A successor of a proposal is made only for the proposal of the same Cost Center and year that a refused version left
-- reviewed and not yet taken over; making it marks the old one as succeeded, in the same statement's transaction.
CREATE FUNCTION budget_proposals_succession_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    prior "budget_proposals"%ROWTYPE;
    latest_state "BudgetVersionState";
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW."successor_of_proposal_id" IS DISTINCT FROM OLD."successor_of_proposal_id" THEN
            RAISE EXCEPTION 'the proposal a proposal succeeds never changes'
                USING ERRCODE = '23514', CONSTRAINT = 'budget_proposals_succession_guard';
        END IF;
        IF OLD."succeeded_at" IS NOT NULL AND NEW."succeeded_at" IS DISTINCT FROM OLD."succeeded_at" THEN
            RAISE EXCEPTION 'the moment a proposal was succeeded never changes'
                USING ERRCODE = '23514', CONSTRAINT = 'budget_proposals_succession_guard';
        END IF;

        RETURN NEW;
    END IF;

    IF NEW."successor_of_proposal_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO prior FROM "budget_proposals" WHERE "id" = NEW."successor_of_proposal_id" FOR UPDATE;
    IF NOT FOUND
       OR prior."organization_id" <> NEW."organization_id" OR prior."cost_center_id" <> NEW."cost_center_id"
       OR prior."year" <> NEW."year" THEN
        RAISE EXCEPTION 'a successor belongs to the Cost Center and the year of the proposal it succeeds'
            USING ERRCODE = '23514', CONSTRAINT = 'budget_proposals_succession_guard';
    END IF;
    IF prior."state" <> 'REVIEWED' OR prior."succeeded_at" IS NOT NULL THEN
        RAISE EXCEPTION 'only a reviewed proposal that has no successor yet can be succeeded'
            USING ERRCODE = '23514', CONSTRAINT = 'budget_proposals_succession_guard';
    END IF;
    SELECT v."state" INTO latest_state
      FROM "budget_versions" v WHERE v."proposal_id" = prior."id" ORDER BY v."number" DESC LIMIT 1;
    IF latest_state IS DISTINCT FROM 'REJECTED' THEN
        RAISE EXCEPTION 'a proposal is succeeded only when the latest version made from it was refused'
            USING ERRCODE = '23514', CONSTRAINT = 'budget_proposals_succession_guard';
    END IF;
    IF NEW."state" <> 'SUBMITTED' THEN
        RAISE EXCEPTION 'a successor is submitted'
            USING ERRCODE = '23514', CONSTRAINT = 'budget_proposals_succession_guard';
    END IF;

    UPDATE "budget_proposals" SET "succeeded_at" = NEW."submitted_at" WHERE "id" = prior."id";

    RETURN NEW;
END;
$$;

CREATE TRIGGER budget_proposals_succession_guard_insert
    BEFORE INSERT ON "budget_proposals"
    FOR EACH ROW EXECUTE FUNCTION budget_proposals_succession_guard();
CREATE TRIGGER budget_proposals_succession_guard_update
    BEFORE UPDATE OF "successor_of_proposal_id", "succeeded_at" ON "budget_proposals"
    FOR EACH ROW EXECUTE FUNCTION budget_proposals_succession_guard();

-- A proposal that says it was succeeded has exactly one successor (a hand-written `succeeded_at` without one is refused).
CREATE FUNCTION budget_proposals_succession_consistent() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."succeeded_at" IS NOT NULL
       AND (SELECT count(*) FROM "budget_proposals" s WHERE s."successor_of_proposal_id" = NEW."id") <> 1 THEN
        RAISE EXCEPTION 'a proposal that was succeeded has exactly one successor'
            USING ERRCODE = '23514', CONSTRAINT = 'budget_proposals_succession_consistent';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER budget_proposals_succession_consistent
    AFTER INSERT OR UPDATE ON "budget_proposals"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION budget_proposals_succession_consistent();

-- 6b. Versions: closing at the end of the year (F62) and the version that follows a refused one (F63).
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_expired_check" CHECK (
    ("state" = 'EXPIRED') = ("expired_at" IS NOT NULL)
);
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_never_current_check" CHECK (
    NOT "never_current" OR "state" = 'EXPIRED'
);
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_detached_check" CHECK (
    "detached_at" IS NULL OR "state" IN ('DRAFT', 'EXPIRED')
);

-- A version is sent before it leaves the draft state; the version that expires without ever having been sent is the one
-- exception (a draft that its year overtook), and it may still carry the sending of a version that was sent.
ALTER TABLE "budget_versions" DROP CONSTRAINT "budget_versions_sent_check";
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_sent_check" CHECK (
    (("state" = 'DRAFT') AND "sent_at" IS NULL AND "sent_by_employee_id" IS NULL)
    OR (("state" = 'EXPIRED') AND ("sent_at" IS NULL) = ("sent_by_employee_id" IS NULL))
    OR (("state" NOT IN ('DRAFT', 'EXPIRED')) AND "sent_at" IS NOT NULL AND "sent_by_employee_id" IS NOT NULL)
);

-- The reason of a revision is asked when it is sent; a revision that expired as a draft never had to give one.
ALTER TABLE "budget_versions" DROP CONSTRAINT "budget_versions_reason_check";
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_reason_check" CHECK (
    (("reason" IS NULL) OR (btrim("reason") <> ''))
    AND ("kind" = 'INITIAL' OR "state" = 'DRAFT' OR ("state" = 'EXPIRED' AND "sent_at" IS NULL) OR "reason" IS NOT NULL)
);

-- A draft that no proposal owns any more does not count as the version in work of its Cost Center and year.
DROP INDEX "budget_versions_in_flight_key";
CREATE UNIQUE INDEX "budget_versions_in_flight_key" ON "budget_versions"("cost_center_id", "year")
    WHERE "state" IN ('DRAFT', 'SENT', 'CHANGES_REQUESTED') AND "detached_at" IS NULL;

ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_rejected_predecessor_id_fkey"
    FOREIGN KEY ("rejected_predecessor_id") REFERENCES "budget_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "budget_versions_rejected_predecessor_id_key" ON "budget_versions"("rejected_predecessor_id");

CREATE FUNCTION budget_versions_rejected_predecessor_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    predecessor "budget_versions"%ROWTYPE;
BEGIN
    IF NEW."rejected_predecessor_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO predecessor FROM "budget_versions" WHERE "id" = NEW."rejected_predecessor_id";
    IF NOT FOUND
       OR predecessor."cost_center_id" <> NEW."cost_center_id" OR predecessor."year" <> NEW."year"
       OR predecessor."proposal_id" IS DISTINCT FROM NEW."proposal_id"
       OR predecessor."state" <> 'REJECTED' OR NEW."kind" <> 'INITIAL' THEN
        RAISE EXCEPTION 'a version follows a refused version of the same proposal, Cost Center and year'
            USING ERRCODE = '23514', CONSTRAINT = 'budget_versions_rejected_predecessor_guard';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER budget_versions_rejected_predecessor_guard
    BEFORE INSERT ON "budget_versions"
    FOR EACH ROW EXECUTE FUNCTION budget_versions_rejected_predecessor_guard();

-- 7. The history of the edits of a version (F66, QĐ-91d, spec J.4): the read model of Finance and of the approver, appended in
-- the transaction of each edit and never changed. `audit_events` is the audit, not this.
CREATE TYPE "BudgetVersionHistoryKind" AS ENUM ('FIGURES_UPDATED', 'LINE_UPDATED', 'LINES_ADDED', 'LINES_IMPORTED', 'WINDOW_MOVED');

CREATE TABLE "budget_version_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "BudgetVersionHistoryKind" NOT NULL,
    "version_state" "BudgetVersionState" NOT NULL,
    "position" INTEGER,
    "from_position" INTEGER,
    "to_position" INTEGER,
    "line_count" INTEGER,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "changed_by_employee_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_version_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_version_history_seq_check" CHECK ("seq" >= 1),
    CONSTRAINT "budget_version_history_shape_check" CHECK (
        ("kind" = 'FIGURES_UPDATED' AND "position" IS NULL AND "from_position" IS NULL AND "to_position" IS NULL
            AND "line_count" IS NULL AND "before" IS NOT NULL AND jsonb_typeof("before") = 'object'
            AND jsonb_typeof("after") = 'object')
        OR ("kind" IN ('LINE_UPDATED', 'WINDOW_MOVED') AND "position" IS NOT NULL AND "position" >= 1
            AND "from_position" IS NULL AND "to_position" IS NULL AND "line_count" IS NULL
            AND "before" IS NOT NULL AND jsonb_typeof("before") = 'object' AND jsonb_typeof("after") = 'object')
        OR ("kind" IN ('LINES_ADDED', 'LINES_IMPORTED') AND "position" IS NULL AND "from_position" IS NOT NULL
            AND "from_position" >= 1 AND "to_position" IS NOT NULL AND "to_position" >= "from_position"
            AND "line_count" IS NOT NULL AND "line_count" BETWEEN 1 AND 200 AND "before" IS NULL
            AND jsonb_typeof("after") = 'array' AND jsonb_array_length("after") <= 200)
    ),
    CONSTRAINT "budget_version_history_after_size_check" CHECK (octet_length("after"::text) <= 262144)
);

CREATE UNIQUE INDEX "budget_version_history_version_id_seq_key" ON "budget_version_history"("version_id", "seq");

ALTER TABLE "budget_version_history" ADD CONSTRAINT "budget_version_history_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget_version_history" ADD CONSTRAINT "budget_version_history_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "budget_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION budget_version_history_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'budget_version_history is append-only (% rejected)', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER budget_version_history_no_update_delete
    BEFORE UPDATE OR DELETE ON "budget_version_history"
    FOR EACH ROW EXECUTE FUNCTION budget_version_history_reject_change();
CREATE TRIGGER budget_version_history_no_truncate
    BEFORE TRUNCATE ON "budget_version_history"
    FOR EACH STATEMENT EXECUTE FUNCTION budget_version_history_reject_change();

-- 8. The notices held for a department that has no head yet (F67, T-11, spec I): written when the event happens, handed to the
-- first head the Super Admin names, once. `event_key` makes writing it again a no-op.
CREATE TABLE "held_department_notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_id" UUID,
    "params" JSONB NOT NULL DEFAULT '{}',
    "event_key" TEXT NOT NULL,
    "held_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(3),
    "delivered_to_employee_id" UUID,

    CONSTRAINT "held_department_notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "held_department_notifications_delivered_together" CHECK (
        ("delivered_at" IS NULL) = ("delivered_to_employee_id" IS NULL)
    ),
    CONSTRAINT "held_department_notifications_subject_together" CHECK (
        ("subject_type" IS NULL) = ("subject_id" IS NULL)
    )
);

CREATE UNIQUE INDEX "held_department_notifications_event_key_key" ON "held_department_notifications"("event_key");
CREATE INDEX "held_department_notifications_department_id_delivered_at_idx"
    ON "held_department_notifications"("department_id", "delivered_at");

ALTER TABLE "held_department_notifications" ADD CONSTRAINT "held_department_notifications_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "held_department_notifications" ADD CONSTRAINT "held_department_notifications_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
