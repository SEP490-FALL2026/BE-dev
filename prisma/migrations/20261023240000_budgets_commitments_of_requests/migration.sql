-- A commitment is held for a request and made on the snapshot of the decision that approved it (US-06-04, US-06-09 AC-4). The
-- keys keep a commitment from outliving the request or the check it points at; no code of the budgets reads the tables.

-- AlterTable
ALTER TABLE "budget_commitments" ADD COLUMN "snapshot_check_id" UUID;

-- AddForeignKey
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_snapshot_check_id_fkey" FOREIGN KEY ("snapshot_check_id") REFERENCES "request_budget_checks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
