-- K1-GR (QĐ-111az, R-19, US-07-01 AC-7): the checklist the IT Admin ticks to complete the GRANT of a K1 seat is kept on the task, in the same column
-- as the one of a K1 revocation (`k1_checklist`, 20261113001400): the variant `GRANT` and the two steps with their order and the instant each was
-- ticked (the evidence is the `evidence` column). Only the CHECK of that column changes: it asked that the checklist belong to a revocation, and now
-- it belongs to a revocation or a grant (an extension and a task of no kind have none). No column is added, nothing is backfilled (a K1 grant
-- completed before the checklist has none), nothing is dropped and no task, seat or notice is changed. Safe to run twice: the check is dropped if
-- present and added again; every row that has a checklist today is a revocation, so the looser check holds for it.
--
-- As for the revocation, the checklist is written in the transaction of the completion, before the task is marked completed (a completed task
-- is never changed again, `provisioning_task_guard`).
ALTER TABLE "provisioning_tasks" DROP CONSTRAINT IF EXISTS "provisioning_tasks_k1_checklist_check";
ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_k1_checklist_check" CHECK (
  "k1_checklist" IS NULL
  OR ("kind" IS NOT NULL AND "kind" IN ('REVOKE', 'GRANT') AND jsonb_typeof("k1_checklist") = 'object')
);
