-- The draft of a paid request (g0-g6-final-business-baseline-remediation, Task 1.6; F27, F29; P03-D01 = A; spec L.1). The value
-- `AccessRequestState.DRAFT` is already in the schema (`20261028100000_final_vocabulary_values`: an enum value cannot be
-- used in the migration that adds it). A draft is a request saved before the finance gates: it has no Cost Center, no
-- submission moment, no step, no budget check, no commitment and no batch item, and nothing counts it as work.
--
-- The compatibility image stays valid on this schema: it never writes a draft, it always writes the Cost Center and the
-- submission moment of a request, and it reads a draft as it reads any row it does not show (it filters it out).

-- 1. A request carries its Cost Center unless it is a draft.
ALTER TABLE "access_requests" ALTER COLUMN "cost_center_id" DROP NOT NULL;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_cost_center_unless_draft" CHECK (
    "state" = 'DRAFT' OR "cost_center_id" IS NOT NULL
);

-- 2. It carries its submission moment unless it is a draft (the default stays: a request that is submitted is stamped by it).
ALTER TABLE "access_requests" ALTER COLUMN "submitted_at" DROP NOT NULL;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_submitted_unless_draft" CHECK (
    ("state" = 'DRAFT') = ("submitted_at" IS NULL)
);

-- 3. A draft has no work: no approval step, no budget check, no commitment and no spend batch item. The trigger reads the
-- request under a share lock, so a draft submitted in between (it changes state under the row lock) is not missed.
CREATE FUNCTION access_requests_draft_has_no_work() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM "access_requests" r WHERE r."id" = NEW."request_id" AND r."state" = 'DRAFT' FOR SHARE;
    IF FOUND THEN
        RAISE EXCEPTION 'a draft request has no steps, checks, commitments or batch items'
            USING ERRCODE = '23514', CONSTRAINT = 'access_requests_draft_has_no_work';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER access_requests_draft_has_no_work
    BEFORE INSERT ON "access_request_steps"
    FOR EACH ROW EXECUTE FUNCTION access_requests_draft_has_no_work();
CREATE TRIGGER access_requests_draft_has_no_work
    BEFORE INSERT ON "request_budget_checks"
    FOR EACH ROW EXECUTE FUNCTION access_requests_draft_has_no_work();
CREATE TRIGGER access_requests_draft_has_no_work
    BEFORE INSERT ON "budget_commitments"
    FOR EACH ROW EXECUTE FUNCTION access_requests_draft_has_no_work();
CREATE TRIGGER access_requests_draft_has_no_work
    BEFORE INSERT ON "spend_batch_items"
    FOR EACH ROW EXECUTE FUNCTION access_requests_draft_has_no_work();

-- 4. A draft is judged by the rules of a request only when it is sent (F71, found in the review of the stage): it is saved with its
-- branch and its plan but with the price columns at the default of a request not priced yet, which `access_requests_pricing_check`
-- allows only for the free internal branch, and a draft of a group may name a plan whose branch is not paid (the send refuses it
-- then). Both constraints are rewritten from their own current definition as "a draft, or what they said", and the migration stops if
-- one is not in the shape it extends. Only a relaxation: every row the compatibility image writes is a request, not a draft.
DO $$
DECLARE
    constraint_name TEXT;
    old_definition TEXT;
BEGIN
    FOREACH constraint_name IN ARRAY ARRAY['access_requests_pricing_check', 'access_requests_group_check'] LOOP
        SELECT pg_get_constraintdef(c."oid") INTO old_definition
          FROM pg_constraint c WHERE c."conrelid" = 'access_requests'::regclass AND c."conname" = constraint_name;
        IF old_definition IS NULL OR left(old_definition, 7) <> 'CHECK (' OR position('DRAFT' IN old_definition) > 0 THEN
            RAISE EXCEPTION '% is not in the shape this migration extends', constraint_name;
        END IF;
        EXECUTE format('ALTER TABLE "access_requests" DROP CONSTRAINT %I', constraint_name);
        EXECUTE format(
            'ALTER TABLE "access_requests" ADD CONSTRAINT %I CHECK (("state" = ''DRAFT'') OR %s)',
            constraint_name, substr(old_definition, 7)
        );
    END LOOP;
END
$$;
