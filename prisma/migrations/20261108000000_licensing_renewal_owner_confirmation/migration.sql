-- The head of the department that owns the subscription confirms the proposal of the IT Admin (QĐ-94d(2), QĐ-96g): a decision is
-- now written with the role OWNER_DEPARTMENT_HEAD. The two roles of before stay valid for the cases already decided. The column is
-- text and the rule a CHECK, so this only widens it: every row written until now still satisfies it.
ALTER TABLE "subscription_renewals" DROP CONSTRAINT "subscription_renewals_decider_role";
ALTER TABLE "subscription_renewals"
    ADD CONSTRAINT "subscription_renewals_decider_role" CHECK (
        "decider_role" IS NULL OR "decider_role" IN ('SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE', 'OWNER_DEPARTMENT_HEAD')
    );
