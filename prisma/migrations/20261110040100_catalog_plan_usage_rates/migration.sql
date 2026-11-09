-- KPI-3 of a plan priced per seat (QĐ-109d, AF-08): the seats with activity in the 30 days before the last weekly pass of the usage rules
-- (MF-5) and the seats that pass could judge. Written by that pass through the catalog facade, read by the budget (ZBB of Renew/Change
-- lines, the baseline). A new table: nothing existing changes, so it runs on a database that holds data. No privilege is granted here.

CREATE TABLE "plan_usage_rates" (
    "plan_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "active_seats" INTEGER NOT NULL,
    "assessed_seats" INTEGER NOT NULL,
    "assessed_on" DATE NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_usage_rates_pkey" PRIMARY KEY ("plan_id"),
    CONSTRAINT "plan_usage_rates_counts" CHECK ("active_seats" >= 0 AND "assessed_seats" >= "active_seats" AND "assessed_seats" > 0)
);

CREATE INDEX "plan_usage_rates_organization_id_idx" ON "plan_usage_rates"("organization_id");

ALTER TABLE "plan_usage_rates" ADD CONSTRAINT "plan_usage_rates_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan_usage_rates" ADD CONSTRAINT "plan_usage_rates_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
