-- The head who decided "still needed" may change their mind to "not needed" until the old seat has been taken back
-- (g0-g6-final-business-baseline-remediation, spec G, F43, T-6): "still needed" waits for the new Request of the receiving
-- department, and "not needed" opens the revocation at once. Every other decision stays written once; the tool, the review and the
-- place of a line never change; no line is deleted. Only a rule is relaxed (a function replaced), no column is added, and the
-- compatibility image never writes this change, so it stays valid on this schema.
CREATE OR REPLACE FUNCTION "transfer_review_item_guard"() RETURNS trigger AS $$
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
    IF OLD."decision" = 'STILL_NEEDED' AND NEW."decision" = 'NOT_NEEDED' AND OLD."revocation_task_id" IS NULL THEN
        RETURN NEW;
    END IF;
    IF OLD."decision" <> 'PENDING' THEN
        RAISE EXCEPTION 'A decision about a tool is written once and never changed'
            USING ERRCODE = '55000', CONSTRAINT = 'transfer_review_item_decision_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
