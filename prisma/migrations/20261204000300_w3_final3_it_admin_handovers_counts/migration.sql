-- H-5 (FIX-W3-FINAL-3): restore positive responsibility invariant on `it_admin_handovers` by tracking workspaces and license lots.
--
-- Pre-check SELECT before applying on any existing database:
--   SELECT COUNT(*) AS zero_responsibility_handovers
--     FROM "it_admin_handovers"
--    WHERE "subscriptions_at_record" + "applications_at_record" = 0;
--
-- Reversal (only safe if no row relies on workspaces_at_record / license_lots_at_record to satisfy > 0):
--   ALTER TABLE "it_admin_handovers" DROP CONSTRAINT "it_admin_handovers_done";
--   ALTER TABLE "it_admin_handovers" ADD CONSTRAINT "it_admin_handovers_done" CHECK (
--       ("done_at" IS NULL) = ("done_to_employee_id" IS NULL)
--       AND ("done_at" IS NULL) = ("done_subscriptions" IS NULL)
--       AND ("done_at" IS NULL) = ("done_applications" IS NULL)
--       AND ("done_subscriptions" IS NULL OR "done_subscriptions" >= 0)
--       AND ("done_applications" IS NULL OR "done_applications" >= 0)
--   );
--   ALTER TABLE "it_admin_handovers" DROP CONSTRAINT "it_admin_handovers_counts";
--   ALTER TABLE "it_admin_handovers" ADD CONSTRAINT "it_admin_handovers_counts" CHECK (
--       "subscriptions_at_record" >= 0 AND "applications_at_record" >= 0
--   );
--   ALTER TABLE "it_admin_handovers"
--     DROP COLUMN "done_license_lots",
--     DROP COLUMN "done_workspaces",
--     DROP COLUMN "license_lots_at_record",
--     DROP COLUMN "workspaces_at_record";

ALTER TABLE "it_admin_handovers"
  ADD COLUMN "workspaces_at_record" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "license_lots_at_record" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "done_workspaces" INTEGER,
  ADD COLUMN "done_license_lots" INTEGER;

UPDATE "it_admin_handovers"
   SET "done_workspaces" = 0,
       "done_license_lots" = 0
 WHERE "done_at" IS NOT NULL
   AND ("done_workspaces" IS NULL OR "done_license_lots" IS NULL);

DO $$
DECLARE
    zero_count integer;
BEGIN
    SELECT COUNT(*) INTO zero_count
      FROM "it_admin_handovers"
     WHERE "subscriptions_at_record" + "applications_at_record" + "workspaces_at_record" + "license_lots_at_record" = 0;
    IF zero_count > 0 THEN
        RAISE EXCEPTION 'it_admin_handovers has % row(s) with 0 total responsibilities', zero_count;
    END IF;
END $$;

ALTER TABLE "it_admin_handovers" DROP CONSTRAINT "it_admin_handovers_counts";
ALTER TABLE "it_admin_handovers" ADD CONSTRAINT "it_admin_handovers_counts" CHECK (
    "subscriptions_at_record" >= 0
    AND "applications_at_record" >= 0
    AND "workspaces_at_record" >= 0
    AND "license_lots_at_record" >= 0
    AND "subscriptions_at_record" + "applications_at_record" + "workspaces_at_record" + "license_lots_at_record" > 0
);

ALTER TABLE "it_admin_handovers" DROP CONSTRAINT "it_admin_handovers_done";
ALTER TABLE "it_admin_handovers" ADD CONSTRAINT "it_admin_handovers_done" CHECK (
    ("done_at" IS NULL) = ("done_to_employee_id" IS NULL)
    AND ("done_at" IS NULL) = ("done_subscriptions" IS NULL)
    AND ("done_at" IS NULL) = ("done_applications" IS NULL)
    AND ("done_at" IS NULL) = ("done_workspaces" IS NULL)
    AND ("done_at" IS NULL) = ("done_license_lots" IS NULL)
    AND ("done_subscriptions" IS NULL OR "done_subscriptions" >= 0)
    AND ("done_applications" IS NULL OR "done_applications" >= 0)
    AND ("done_workspaces" IS NULL OR "done_workspaces" >= 0)
    AND ("done_license_lots" IS NULL OR "done_license_lots" >= 0)
    AND (
        "done_at" IS NULL
        OR "done_subscriptions" + "done_applications" + "done_workspaces" + "done_license_lots" > 0
    )
);
