-- M07 (QĐ-100q): the day an employee's access stops is kept apart from the state of their departure case, so a person who is handing
-- over is refused from the day after their last working day without anybody marking them as left.
CREATE TABLE "employee_access_blocks" (
    "employee_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "blocked_from" DATE NOT NULL,
    "cause" TEXT NOT NULL,
    "source_case_id" UUID,
    -- Set when the departure was cancelled after the block took effect: the block stays until the Super Admin unlocks the account.
    "releasable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "employee_access_blocks_pkey" PRIMARY KEY ("employee_id"),
    CONSTRAINT "employee_access_blocks_cause_check" CHECK ("cause" IN ('DEPARTURE_LAST_DAY', 'DEPARTURE_BLOCK_NOW'))
);

ALTER TABLE "employee_access_blocks"
    ADD CONSTRAINT "employee_access_blocks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "employee_access_blocks_organization_id_idx" ON "employee_access_blocks"("organization_id");

-- A case that is handing over today blocks the person from the day after its last working day.
INSERT INTO "employee_access_blocks" ("employee_id", "organization_id", "blocked_from", "cause", "source_case_id")
SELECT c."employee_id", c."organization_id", c."last_working_day" + 1, 'DEPARTURE_LAST_DAY', c."id"
  FROM "offboarding_cases" c
 WHERE c."state" = 'HANDING_OVER'
ON CONFLICT ("employee_id") DO NOTHING;
