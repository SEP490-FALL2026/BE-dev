-- The substitute decides a version of the budget in the place of the spending approver when the approver sent the proposal
-- behind it (US-06-08 AC-11): the record of the decision keeps which of the two decided.
ALTER TABLE "budget_version_decisions" DROP CONSTRAINT "budget_version_decisions_role_check";
ALTER TABLE "budget_version_decisions"
    ADD CONSTRAINT "budget_version_decisions_role_check" CHECK (
        "decider_role" IN ('SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE')
    );
