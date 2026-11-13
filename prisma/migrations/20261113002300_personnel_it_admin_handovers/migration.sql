-- X-IT.3 (QĐ-110j, QĐ-111g, SPEC P5, R-8, R-26): what an IT Admin who leaves still answers for in the catalog, kept once when the departure or the
-- transfer is recorded, and the hand-over of all of it. A new table: nothing existing changes, so it runs on a database that holds data, and
-- no row is written here (the files recorded before this release have no item; a hand-over of theirs creates it). No privilege is granted here.
--
-- Exactly one of the two sources is set, and each source has at most one row (a unique index on each: NULLs are distinct, so the other column of
-- a row does not collide). The row exists only when the person answered for something when the file was recorded. The hand-over is written
-- all together, and the latest one is kept: who took everything, when, and how many subscriptions and applications were moved. Each column is asked on its own:
-- a CHECK passes on NULL.

CREATE TABLE "it_admin_handovers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "offboarding_case_id" UUID,
    "department_transfer_id" UUID,
    "subscriptions_at_record" INTEGER NOT NULL,
    "applications_at_record" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMPTZ(3),
    "done_to_employee_id" UUID,
    "done_subscriptions" INTEGER,
    "done_applications" INTEGER,

    CONSTRAINT "it_admin_handovers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "it_admin_handovers_one_source" CHECK (
        ("offboarding_case_id" IS NOT NULL) <> ("department_transfer_id" IS NOT NULL)
    ),
    CONSTRAINT "it_admin_handovers_counts" CHECK (
        "subscriptions_at_record" >= 0 AND "applications_at_record" >= 0
        AND "subscriptions_at_record" + "applications_at_record" > 0
    ),
    CONSTRAINT "it_admin_handovers_done" CHECK (
        ("done_at" IS NULL) = ("done_to_employee_id" IS NULL)
        AND ("done_at" IS NULL) = ("done_subscriptions" IS NULL)
        AND ("done_at" IS NULL) = ("done_applications" IS NULL)
        AND ("done_subscriptions" IS NULL OR "done_subscriptions" >= 0)
        AND ("done_applications" IS NULL OR "done_applications" >= 0)
    )
);

CREATE UNIQUE INDEX "it_admin_handovers_offboarding_case_id_key" ON "it_admin_handovers"("offboarding_case_id");
CREATE UNIQUE INDEX "it_admin_handovers_department_transfer_id_key" ON "it_admin_handovers"("department_transfer_id");
CREATE INDEX "it_admin_handovers_organization_id_idx" ON "it_admin_handovers"("organization_id");
CREATE INDEX "it_admin_handovers_done_to_employee_id_idx" ON "it_admin_handovers"("done_to_employee_id");

ALTER TABLE "it_admin_handovers" ADD CONSTRAINT "it_admin_handovers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "it_admin_handovers" ADD CONSTRAINT "it_admin_handovers_offboarding_case_id_fkey"
    FOREIGN KEY ("offboarding_case_id") REFERENCES "offboarding_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "it_admin_handovers" ADD CONSTRAINT "it_admin_handovers_department_transfer_id_fkey"
    FOREIGN KEY ("department_transfer_id") REFERENCES "department_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "it_admin_handovers" ADD CONSTRAINT "it_admin_handovers_done_to_employee_id_fkey"
    FOREIGN KEY ("done_to_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
