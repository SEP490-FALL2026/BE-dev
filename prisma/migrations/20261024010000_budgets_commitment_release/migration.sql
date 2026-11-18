-- Money held for a request goes back to the budget, in whole or in part, and never comes back (US-06-06).

-- CreateEnum
CREATE TYPE "CommitmentReleaseReason" AS ENUM ('REQUEST_CANCELLED', 'REQUEST_WITHDRAWN', 'GRANT_FAILED', 'PARTICIPANT_WITHDRAWN', 'REMAINDER');

-- AlterTable
ALTER TABLE "budget_commitments" ADD COLUMN "released_minor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "budget_commitments" ADD COLUMN "released_at" TIMESTAMPTZ(3);

-- A commitment holds its amount less what went back, and is released when nothing is left to hold.
ALTER TABLE "budget_commitments"
    ADD CONSTRAINT "budget_commitments_release_check" CHECK (
        "released_minor" >= 0
        AND (
            ("state" = 'RELEASED' AND "released_minor" = "amount_minor" AND "released_at" IS NOT NULL)
            OR ("state" <> 'RELEASED' AND "released_minor" < "amount_minor" AND "released_at" IS NULL)
        )
    );

-- CreateTable
CREATE TABLE "budget_commitment_releases" (
    "id" UUID NOT NULL,
    "commitment_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reason" "CommitmentReleaseReason" NOT NULL,
    "reason_text" TEXT,
    "released_by_employee_id" UUID,
    "released_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budget_commitment_releases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_commitment_releases_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "budget_commitment_releases_text_check" CHECK ("reason_text" IS NULL OR char_length("reason_text") <= 1000),
    -- Finance lets the remainder go with a reason and under its own name; the other releases are the event itself.
    CONSTRAINT "budget_commitment_releases_remainder_check" CHECK (
        "reason" <> 'REMAINDER'
        OR ("reason_text" IS NOT NULL AND btrim("reason_text") <> '' AND "released_by_employee_id" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "budget_commitment_releases_commitment_id_released_at_idx" ON "budget_commitment_releases"("commitment_id", "released_at");

-- AddForeignKey
ALTER TABLE "budget_commitment_releases" ADD CONSTRAINT "budget_commitment_releases_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "budget_commitments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_commitment_releases" ADD CONSTRAINT "budget_commitment_releases_released_by_employee_id_fkey" FOREIGN KEY ("released_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- INV-05: what went back to the budget is kept as it was written.
CREATE FUNCTION budget_commitment_releases_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'budget_commitment_releases is append-only (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER budget_commitment_releases_no_update_delete
  BEFORE UPDATE OR DELETE ON budget_commitment_releases
  FOR EACH ROW EXECUTE FUNCTION budget_commitment_releases_reject_change();

CREATE TRIGGER budget_commitment_releases_no_truncate
  BEFORE TRUNCATE ON budget_commitment_releases
  FOR EACH STATEMENT EXECUTE FUNCTION budget_commitment_releases_reject_change();

-- A commitment keeps what it is for, only goes from held to released or to an expense, and never goes back (US-06-06 AC-4).
CREATE FUNCTION budget_commitments_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.request_id <> OLD.request_id OR NEW.cost_center_id <> OLD.cost_center_id OR NEW.year <> OLD.year
     OR NEW.currency <> OLD.currency OR NEW.amount_minor <> OLD.amount_minor THEN
    RAISE EXCEPTION 'budget_commitments keeps the request, the Cost Center, the year and the amount it was made for (UPDATE rejected)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state <> 'HELD' THEN
    RAISE EXCEPTION 'a commitment that is % does not change again (UPDATE rejected)', OLD.state
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.released_minor < OLD.released_minor THEN
    RAISE EXCEPTION 'what went back to the budget does not come back (UPDATE rejected)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER budget_commitments_guard_row
  BEFORE UPDATE ON budget_commitments
  FOR EACH ROW EXECUTE FUNCTION budget_commitments_guard();
