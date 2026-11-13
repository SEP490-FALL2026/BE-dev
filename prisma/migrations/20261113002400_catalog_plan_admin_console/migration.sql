-- X-IT.4a (QĐ-110k, QĐ-110u, R-53, SPEC P29): a K4 plan says whether the company administers it through a console of the vendor; a plan that does
-- needs at least two IT Admins who administer it there (judged by the application, X-IT.4b/X-IT.5). Expand only: one column with a default, no row
-- changes meaning, nothing is dropped. Safe to run twice.
--
-- Only a K4 plan may be true: a CHECK on the row (asked on each column: `NOT "has_admin_console"` is never NULL, the kind is NOT NULL). A K2 plan
-- needs its admins whatever this says, and a K1 or K5 plan never does, so the flag is not stored for them.

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "has_admin_console" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "plans" DROP CONSTRAINT IF EXISTS "plans_admin_console_k4_only";
ALTER TABLE "plans" ADD CONSTRAINT "plans_admin_console_k4_only" CHECK (
  NOT "has_admin_console" OR "provisioning_type" = 'K4'
);

-- A K4 plan that already has a workspace profile is one the company administers (SPEC §6). The trigger of a workspace profile has let only K2 and
-- K3 plans have one, so this finds no row today; it is written so a profile that exists is never left behind a flag that says "no".
UPDATE "plans" SET "has_admin_console" = true
 WHERE "provisioning_type" = 'K4'
   AND NOT "has_admin_console"
   AND EXISTS (SELECT 1 FROM "plan_workspace_profiles" w WHERE w."plan_id" = "plans"."id");
