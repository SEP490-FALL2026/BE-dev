-- Redesign wave 3, W3-10 (M4, part 1): the workspace the company holds at a vendor (QĐ-115c, QĐ-116o, QĐ-118f). The profile that sat on a plan
-- moves to one workspace per vendor: two new tables and a backfill from the old profiles. The old tables (`plan_workspace_profiles`,
-- `plan_workspace_admins`) stay untouched as old data and stop being the source. No column of `plans` or `subscriptions` changes here (part 2).
--
-- Reverse (the data of the old profiles is untouched): DROP TABLE "workspace_admins"; DROP TABLE "workspaces";
--
-- Check before anything is written. A plan the company administers at the vendor (a K2 plan, a K4 plan with an admin console, or any plan that
-- has a profile) whose application names no vendor cannot be given a workspace. The migration stops and names the plan. For the Owner to run on
-- the demo database first:
--   SELECT a.id, a.name, p.id AS plan_id, p.provisioning_type FROM applications a JOIN plans p ON p.application_id = a.id
--    WHERE a.vendor_id IS NULL AND (p.provisioning_type = 'K2' OR (p.provisioning_type = 'K4' AND p.has_admin_console)
--      OR EXISTS (SELECT 1 FROM plan_workspace_profiles w WHERE w.plan_id = p.id));
DO $$
DECLARE
    bad RECORD;
BEGIN
    SELECT a.id AS application_id, a.name AS application_name, p.id AS plan_id
      INTO bad
      FROM "applications" a
      JOIN "plans" p ON p."application_id" = a."id"
     WHERE a."vendor_id" IS NULL
       AND (p."provisioning_type" = 'K2'
            OR (p."provisioning_type" = 'K4' AND p."has_admin_console")
            OR EXISTS (SELECT 1 FROM "plan_workspace_profiles" w WHERE w."plan_id" = p."id"))
     ORDER BY p."id"
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'A plan that needs a workspace belongs to an application with no vendor: plan_id=% application_id=% (%): name the vendor of the application first',
            bad.plan_id, bad.application_id, bad.application_name
            USING ERRCODE = '23514', CONSTRAINT = 'workspaces_vendor_required';
    END IF;
END $$;

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "owner_account_email" TEXT,
    "primary_owner_employee_id" UUID,
    "responsible_it_admin_employee_id" UUID,
    "owner_limit" INTEGER,
    "admin_limit" INTEGER,
    "owner_transfer_procedure" TEXT,
    "emergency_identity" TEXT,
    "emergency_occupies_seat" BOOLEAN,
    "emergency_holder_employee_id" UUID,
    "emergency_last_reviewed_on" DATE,
    "admin_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_admins" (
    "workspace_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,

    CONSTRAINT "workspace_admins_pkey" PRIMARY KEY ("workspace_id","employee_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_organization_id_vendor_id_normalized_name_key" ON "workspaces"("organization_id", "vendor_id", "normalized_name");

-- CreateIndex
CREATE INDEX "workspaces_vendor_id_idx" ON "workspaces"("vendor_id");

-- CreateIndex
CREATE INDEX "workspaces_responsible_it_admin_employee_id_idx" ON "workspaces"("responsible_it_admin_employee_id");

-- CreateIndex
CREATE INDEX "workspace_admins_employee_id_idx" ON "workspace_admins"("employee_id");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_primary_owner_employee_id_fkey" FOREIGN KEY ("primary_owner_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_responsible_it_admin_employee_id_fkey" FOREIGN KEY ("responsible_it_admin_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_emergency_holder_employee_id_fkey" FOREIGN KEY ("emergency_holder_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_admins" ADD CONSTRAINT "workspace_admins_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_admins" ADD CONSTRAINT "workspace_admins_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot say (ADR-0005): the same limits the profile of a plan had. Each column is asked on its own: a CHECK passes on NULL.
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_name_check" CHECK (btrim("name") <> '' AND char_length("name") <= 200);
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_account_email_check" CHECK (
    "owner_account_email" IS NULL OR (btrim("owner_account_email") <> '' AND char_length("owner_account_email") <= 320)
);
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_admin_note_check" CHECK (
    "admin_note" IS NULL OR (btrim("admin_note") <> '' AND char_length("admin_note") <= 2000)
);

-- Backfill: one workspace for each vendor that has at least one profile of a plan or one K2 subscription, named as the vendor.
--   admins   = every admin of every profile of the vendor (OWNER if the person is OWNER on any plan);
--   primary owner, email, limits, procedure, emergency account (as a whole), note = those of the profile created first that has a value; notes that
--   differ are joined by a line break in the order they were created;
--   the IT Admin in charge = the one in charge of the K2 subscription created first that is still live (none: NULL, which raises the flag).
-- A vendor that has two workspaces is made by hand later: no vendor does in the demo data.
WITH "profile" AS (
    SELECT w.*, a."vendor_id" AS "profile_vendor_id"
      FROM "plan_workspace_profiles" w
      JOIN "plans" p ON p."id" = w."plan_id"
      JOIN "applications" a ON a."id" = p."application_id"
), "vendor_ids" AS (
    SELECT "profile_vendor_id" AS "vendor_id" FROM "profile"
    UNION
    SELECT a."vendor_id"
      FROM "subscriptions" s
      JOIN "plans" p ON p."id" = s."plan_id"
      JOIN "applications" a ON a."id" = p."application_id"
     WHERE p."provisioning_type" = 'K2' AND a."vendor_id" IS NOT NULL
)
INSERT INTO "workspaces" (
    "id", "organization_id", "vendor_id", "name", "normalized_name", "owner_account_email", "primary_owner_employee_id",
    "responsible_it_admin_employee_id", "owner_limit", "admin_limit", "owner_transfer_procedure", "emergency_identity",
    "emergency_occupies_seat", "emergency_holder_employee_id", "emergency_last_reviewed_on", "admin_note"
)
SELECT gen_random_uuid(), v."organization_id", v."id", v."name", v."normalized_name",
       (SELECT x."owner_account_email" FROM "profile" x WHERE x."profile_vendor_id" = v."id" AND x."owner_account_email" IS NOT NULL
         ORDER BY x."created_at", x."plan_id" LIMIT 1),
       (SELECT x."primary_owner_employee_id" FROM "profile" x WHERE x."profile_vendor_id" = v."id" ORDER BY x."created_at", x."plan_id" LIMIT 1),
       resp."employee_id",
       (SELECT x."owner_limit" FROM "profile" x WHERE x."profile_vendor_id" = v."id" AND x."owner_limit" IS NOT NULL ORDER BY x."created_at", x."plan_id" LIMIT 1),
       (SELECT x."admin_limit" FROM "profile" x WHERE x."profile_vendor_id" = v."id" AND x."admin_limit" IS NOT NULL ORDER BY x."created_at", x."plan_id" LIMIT 1),
       (SELECT x."owner_transfer_procedure" FROM "profile" x WHERE x."profile_vendor_id" = v."id" AND x."owner_transfer_procedure" IS NOT NULL
         ORDER BY x."created_at", x."plan_id" LIMIT 1),
       em."emergency_identity", em."emergency_occupies_seat", em."emergency_holder_employee_id", em."emergency_last_reviewed_on",
       (SELECT string_agg(n."note", E'\n' ORDER BY n."first_at", n."note")
          FROM (SELECT x."admin_note" AS "note", min(x."created_at") AS "first_at"
                  FROM "profile" x WHERE x."profile_vendor_id" = v."id" AND x."admin_note" IS NOT NULL GROUP BY x."admin_note") n)
  FROM "vendors" v
  LEFT JOIN LATERAL (
      SELECT x."emergency_identity", x."emergency_occupies_seat", x."emergency_holder_employee_id", x."emergency_last_reviewed_on"
        FROM "profile" x WHERE x."profile_vendor_id" = v."id" AND x."emergency_identity" IS NOT NULL
       ORDER BY x."created_at", x."plan_id" LIMIT 1
  ) em ON true
  LEFT JOIN LATERAL (
      SELECT s."responsible_it_admin_employee_id" AS "employee_id"
        FROM "subscriptions" s
        JOIN "plans" p ON p."id" = s."plan_id"
        JOIN "applications" a ON a."id" = p."application_id"
       WHERE a."vendor_id" = v."id" AND p."provisioning_type" = 'K2' AND s."responsible_it_admin_employee_id" IS NOT NULL
         AND (s."status" = 'DRAFT'
              OR (NOT EXISTS (SELECT 1 FROM "subscriptions" n WHERE n."renewed_from_id" = s."id")
                  AND (s."kind" = 'PERPETUAL' OR s."end_date" IS NULL OR s."end_date" >= CURRENT_DATE)))
       ORDER BY s."created_at", s."id" LIMIT 1
  ) resp ON true
 WHERE v."id" IN (SELECT "vendor_id" FROM "vendor_ids");

INSERT INTO "workspace_admins" ("workspace_id", "employee_id", "role")
SELECT ws."id", m."employee_id",
       (CASE WHEN bool_or(m."role" = 'OWNER') THEN 'OWNER' ELSE 'ADMIN' END)::"WorkspaceRole"
  FROM "workspaces" ws
  JOIN "applications" a ON a."vendor_id" = ws."vendor_id"
  JOIN "plans" p ON p."application_id" = a."id"
  JOIN "plan_workspace_admins" m ON m."plan_id" = p."id"
 GROUP BY ws."id", m."employee_id";
