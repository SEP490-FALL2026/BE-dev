-- MF-2 K1-CL (QĐ-111az, R-1, R-19, R-35, P25): the checklist the IT Admin ticks to complete the revocation of a K1 seat is kept on the task as
-- JSON (the variant and the steps with their order and the instant each was ticked; the evidence is the `evidence` column). Expand only: the
-- column is nullable and nothing is backfilled (a K1 revocation completed before the checklist has none), nothing is dropped and no task, seat
-- or notice is changed. Safe to run twice: the column and the check are added if absent.
--
-- The checklist is written in the same transaction as the completion, before the task is marked completed (a completed task is never changed
-- again, `provisioning_task_guard`), so the check asks only that it belongs to a revocation and is an object.
ALTER TABLE "provisioning_tasks" ADD COLUMN IF NOT EXISTS "k1_checklist" JSONB;

ALTER TABLE "provisioning_tasks" DROP CONSTRAINT IF EXISTS "provisioning_tasks_k1_checklist_check";
ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_k1_checklist_check" CHECK (
  "k1_checklist" IS NULL
  OR ("kind" IS NOT NULL AND "kind" = 'REVOKE' AND jsonb_typeof("k1_checklist") = 'object')
);
