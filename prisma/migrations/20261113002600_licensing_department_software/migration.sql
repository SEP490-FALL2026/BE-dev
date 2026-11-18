-- DS.1 (QĐ-110s, QĐ-110t, QĐ-111c, SPEC P16 to P18): the list of software of a department, and the proposals of its head to add to it. Two new
-- tables and one new enum: nothing existing changes, so it runs on a database that holds data, and no row is written here. No privilege is granted here.
--
-- The list only guides (the person who asks for software sees it first); nothing is granted by it. A place of the list is an application of the catalog,
-- alone or with one of its plans: one row for each (department, application, plan), and NULLS NOT DISTINCT makes an application alone count as one
-- place (a plain unique index would let a second "application alone" in, NULL being distinct from NULL). Whether the plan belongs to the application
-- and whether the application is still offered is judged by the service in the transaction that writes (a CHECK cannot read another table).
-- The proposals are history: a proposal is decided once and kept; at most one is open (PENDING) for a place, a partial unique index that the
-- database decides, so two proposals sent together leave one and a conflict for the other (MIN-4), never a check before the insert. The predicate is the
-- literal PENDING: it guards the writes, whatever form the statement takes. Each column of a CHECK is asked on its own, a CHECK passes on NULL.

CREATE TYPE "DepartmentSoftwareProposalState" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "department_software_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "plan_id" UUID,
    "note" TEXT,
    -- A value, not a foreign key: the history outlives the account (as the audit trail does).
    "added_by_app_user_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_software_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "department_software_entries_note_check" CHECK (
        "note" IS NULL OR ("note" IS NOT NULL AND btrim("note") <> '' AND char_length("note") <= 500)
    )
);

CREATE UNIQUE INDEX "department_software_entries_place_key"
    ON "department_software_entries"("department_id", "application_id", "plan_id") NULLS NOT DISTINCT;
CREATE INDEX "department_software_entries_department_id_added_at_id_idx"
    ON "department_software_entries"("department_id", "added_at" DESC, "id" DESC);
CREATE INDEX "department_software_entries_organization_id_idx" ON "department_software_entries"("organization_id");
CREATE INDEX "department_software_entries_application_id_idx" ON "department_software_entries"("application_id");
CREATE INDEX "department_software_entries_plan_id_idx" ON "department_software_entries"("plan_id");

CREATE TABLE "department_software_proposals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "plan_id" UUID,
    "reason" TEXT NOT NULL,
    "state" "DepartmentSoftwareProposalState" NOT NULL DEFAULT 'PENDING',
    "proposed_by_employee_id" UUID NOT NULL,
    "proposed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_app_user_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_reason" TEXT,

    CONSTRAINT "department_software_proposals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "department_software_proposals_reason_check" CHECK (
        "reason" IS NOT NULL AND btrim("reason") <> '' AND char_length("reason") <= 500
    ),
    -- Open: nobody has decided. Decided: who and when are both there. A rejection says why (one to 500 characters); an acceptance has no reason.
    CONSTRAINT "department_software_proposals_decision_check" CHECK (
        ("state" = 'PENDING' AND "decided_at" IS NULL AND "decided_by_app_user_id" IS NULL AND "decision_reason" IS NULL)
        OR ("state" = 'ACCEPTED' AND "decided_at" IS NOT NULL AND "decided_by_app_user_id" IS NOT NULL AND "decision_reason" IS NULL)
        OR (
            "state" = 'REJECTED' AND "decided_at" IS NOT NULL AND "decided_by_app_user_id" IS NOT NULL
            AND "decision_reason" IS NOT NULL AND btrim("decision_reason") <> '' AND char_length("decision_reason") <= 500
        )
    )
);

CREATE UNIQUE INDEX "department_software_proposals_one_open_key"
    ON "department_software_proposals"("department_id", "application_id", "plan_id") NULLS NOT DISTINCT
    WHERE "state" = 'PENDING';
CREATE INDEX "department_software_proposals_department_id_proposed_at_id_idx"
    ON "department_software_proposals"("department_id", "proposed_at" DESC, "id" DESC);
CREATE INDEX "department_software_proposals_organization_id_idx" ON "department_software_proposals"("organization_id");
CREATE INDEX "department_software_proposals_application_id_idx" ON "department_software_proposals"("application_id");
CREATE INDEX "department_software_proposals_plan_id_idx" ON "department_software_proposals"("plan_id");
CREATE INDEX "department_software_proposals_proposed_by_employee_id_idx" ON "department_software_proposals"("proposed_by_employee_id");

ALTER TABLE "department_software_entries" ADD CONSTRAINT "department_software_entries_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_software_entries" ADD CONSTRAINT "department_software_entries_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_software_entries" ADD CONSTRAINT "department_software_entries_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_software_entries" ADD CONSTRAINT "department_software_entries_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "department_software_proposals" ADD CONSTRAINT "department_software_proposals_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_software_proposals" ADD CONSTRAINT "department_software_proposals_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_software_proposals" ADD CONSTRAINT "department_software_proposals_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_software_proposals" ADD CONSTRAINT "department_software_proposals_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_software_proposals" ADD CONSTRAINT "department_software_proposals_proposed_by_employee_id_fkey"
    FOREIGN KEY ("proposed_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
