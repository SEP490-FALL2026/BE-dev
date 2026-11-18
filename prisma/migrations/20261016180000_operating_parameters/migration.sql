-- Slice G2 (US-01-04): the operating parameters the Super Admin sets, and the days nobody works.

-- CreateTable
CREATE TABLE "parameter_values" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ(3),
    "changed_by" UUID,

    CONSTRAINT "parameter_values_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "parameter_values_organization_id_key_idx" ON "parameter_values"("organization_id", "key");

ALTER TABLE "parameter_values"
  ADD CONSTRAINT "parameter_values_period_check"
  CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from");

-- One current value per key: the new value closes the old one in the same transaction.
CREATE UNIQUE INDEX "parameter_values_one_current"
  ON "parameter_values"("organization_id", "key") WHERE "valid_to" IS NULL;

-- CreateTable
CREATE TABLE "non_working_dates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "non_working_dates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "non_working_dates_organization_id_date_key" ON "non_working_dates"("organization_id", "date");
