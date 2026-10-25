-- A head sends requests for the people of the department (US-03-02): the requests of one go share a code, and a person who
-- is not staff comes with the day the access ends.

-- AlterTable
ALTER TABLE "access_requests" ADD COLUMN "delegated_batch_id" UUID;
ALTER TABLE "access_requests" ADD COLUMN "expected_end_date" DATE;

-- CreateIndex
CREATE INDEX "access_requests_delegated_batch_id_idx" ON "access_requests"("delegated_batch_id") WHERE "delegated_batch_id" IS NOT NULL;
