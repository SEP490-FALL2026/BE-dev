-- Branch (c): software that is not in the catalog yet (US-05-06, US-05-02 AC-8). A new branch, the state while the IT Admin
-- assesses it, and the kind of that step. The tables and constraints that use them come in the next migration, because a
-- value added to an enum cannot be used in the transaction that adds it.
ALTER TYPE "AccessRequestBranch" ADD VALUE 'NEW_SOFTWARE';
ALTER TYPE "AccessRequestState" ADD VALUE 'AWAITING_IT_ASSESSMENT';
ALTER TYPE "AccessRequestStepKind" ADD VALUE 'IT_ASSESSMENT';
