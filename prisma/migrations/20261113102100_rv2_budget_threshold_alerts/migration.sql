-- RV-2 (QĐ-111af, R-5, R-28; MAJ-10): the alerts of 80 and 100 percent of the base of a budget, told once each time the use goes over. A row is one alert that was told: the Cost Center, the
-- year, the threshold and the EFFECTIVE base the use went over (the base of the version with the adjustments), so that the use going over the same base twice is told once, and the use
-- going over a base that an adjustment raised is told again (R-28). It is written `ON CONFLICT DO NOTHING` in the transaction of the change that crossed the threshold, so two changes that
-- cross it together tell it once. The id of the Cost Center is a value of another context, not a foreign key.
-- Expand only: one new table, nothing read or written before changes. Safe to run twice.

CREATE TABLE IF NOT EXISTS "budget_threshold_alerts" (
    "id" uuid NOT NULL,
    "cost_center_id" uuid NOT NULL,
    "year" integer NOT NULL,
    "threshold" integer NOT NULL,
    "base_minor" bigint NOT NULL,
    "created_at" timestamptz(3) NOT NULL,
    CONSTRAINT "budget_threshold_alerts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_threshold_alerts_year_check" CHECK ("year" BETWEEN 2000 AND 9999),
    CONSTRAINT "budget_threshold_alerts_threshold_check" CHECK ("threshold" IN (80, 100)),
    CONSTRAINT "budget_threshold_alerts_base_check" CHECK ("base_minor" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "budget_threshold_alerts_key"
    ON "budget_threshold_alerts" ("cost_center_id", "year", "threshold", "base_minor");
