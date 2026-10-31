-- The standard toolset, the proportional cost allocation of a subscription and the move of a service account to another
-- department are removed (g0-g6-final-business-baseline-remediation, Task 1.4; F04, F05, F06, F42; P03-D06 = A,
-- P03-D07 = A; spec L.5 and L.10), together with the job title catalogue that the standard toolset still keyed on (the
-- four `job_title_id` columns went in `20261029100200_job_title_history_names`). DB-05: this drops populated tables and
-- columns and cannot be undone by a down migration; the way back is the protected `pg_dump` taken before this deploy
-- (spec L.5), and only for an operator who chose to roll back across this boundary on purpose.
--
-- The compatibility image stays valid on this schema: its `@ignore`d models and columns name none of them (the static gate
-- `src/contract-objects-unused.spec.ts` proves it), so a recovery to that image reads and writes everything it supports.

-- 1. A proposal to move a service account that still waits is cancelled by the running release with the fixed reason of
-- spec L.5 BEFORE the deploy (`pnpm ops:preflight` is `BLOCKED` otherwise). Nothing is written while one remains.
DO $$
DECLARE
    pending_moves TEXT;
BEGIN
    SELECT string_agg(m."id"::text, ', ' ORDER BY m."id")
      INTO pending_moves
      FROM "service_account_moves" m
     WHERE m."status" = 'PENDING';

    IF pending_moves IS NOT NULL THEN
        RAISE EXCEPTION 'Waiting proposals to move a service account to another department: %. Nothing was changed. Cancel them with the fixed reason of the spec on the running release, then run `pnpm ops:preflight`.',
                        pending_moves
            USING ERRCODE = '23503';
    END IF;
END
$$;

-- 2. The move of a service account (F06).
DROP TABLE "service_account_moves";
DROP FUNCTION service_account_move_guard();
DROP TYPE "ServiceAccountMoveStatus";
DROP TYPE "ServiceAccountMoveConfirmerRole";

-- 3. The standard toolset (F04): heads, versions and items, and the functions of their triggers.
DROP TABLE "standard_toolset_items";
DROP TABLE "standard_toolset_versions";
DROP TABLE "standard_toolsets";
DROP FUNCTION standard_toolset_item_guard();
DROP FUNCTION standard_toolset_version_guard();
DROP FUNCTION standard_toolset_head_guard();
DROP FUNCTION standard_toolset_reject_change();

-- 4. The proportional cost allocation of a subscription (F05): lines, versions and heads, and their functions.
DROP TABLE "subscription_cost_allocation_lines";
DROP TABLE "subscription_cost_allocation_versions";
DROP TABLE "subscription_cost_allocations";
DROP FUNCTION subscription_cost_allocation_check_total();
DROP FUNCTION subscription_cost_allocation_version_guard();
DROP FUNCTION subscription_cost_allocation_head_guard();
DROP FUNCTION subscription_cost_allocation_reject_change();

-- 5. "Outside the standard toolset" on a request (F04): the two columns and the rule that read one of them.
ALTER TABLE "access_requests" DROP CONSTRAINT "access_requests_outside_standard_reason_check";
ALTER TABLE "access_requests" DROP COLUMN "outside_standard", DROP COLUMN "outside_standard_reason";

-- 6. The job title catalogue (F03): its last reader, the standard toolset, is gone.
DROP TABLE "job_titles";
DROP TYPE "JobTitleStatus";
