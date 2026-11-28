-- Redesign wave 3, W3-11 (M4, part 2): a subscription belongs to a workspace (QĐ-115c), and says how its seats are counted (QĐ-115g), the least number
-- of seats the vendor sells across the workspace, and whether the vendor invoices after the period. Expand only: four columns that are nullable or have
-- a default, a trigger, and a backfill of `workspace_id` from the workspaces of part 1. Nothing is dropped.
--
-- Reverse: DROP TRIGGER "subscriptions_workspace_vendor" ON "subscriptions"; DROP FUNCTION "subscriptions_workspace_vendor"();
-- ALTER TABLE "subscriptions" DROP COLUMN "workspace_id", DROP COLUMN "seat_counting", DROP COLUMN "minimum_seats_total", DROP COLUMN "invoiced_later";

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "workspace_id" UUID,
ADD COLUMN "seat_counting" TEXT NOT NULL DEFAULT 'FIXED',
ADD COLUMN "minimum_seats_total" INTEGER,
ADD COLUMN "invoiced_later" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "subscriptions_workspace_id_idx" ON "subscriptions"("workspace_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot say (ADR-0005). Each column is asked on its own: a CHECK passes on NULL.
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_seat_counting_check" CHECK ("seat_counting" IN ('FIXED', 'MEMBERS'));
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_minimum_seats_total_check" CHECK ("minimum_seats_total" IS NULL OR "minimum_seats_total" > 0);
-- A subscription counted by its members commits for one month only (C4), and its payment day is read from the month grid of `renewal_date`.
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_members_monthly" CHECK ("seat_counting" <> 'MEMBERS' OR "commitment_term_months" = 1);
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_members_payment_day" CHECK (
  "seat_counting" <> 'MEMBERS' OR "status" <> 'ACTIVE' OR "renewal_date" IS NOT NULL
);

-- The vendor of the workspace is the vendor of the application of the plan (C2). A subscription with no workspace (older data) is not judged here:
-- the application judges every new write.
CREATE FUNCTION "subscriptions_workspace_vendor"() RETURNS trigger AS $$
DECLARE
  workspace_vendor uuid;
  plan_vendor uuid;
BEGIN
  IF NEW."workspace_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT w."vendor_id" INTO workspace_vendor FROM "workspaces" w WHERE w."id" = NEW."workspace_id";
  SELECT a."vendor_id" INTO plan_vendor
    FROM "plans" p JOIN "applications" a ON a."id" = p."application_id" WHERE p."id" = NEW."plan_id";
  IF workspace_vendor IS DISTINCT FROM plan_vendor THEN
    RAISE EXCEPTION 'The workspace of a subscription is held at the vendor of its plan'
      USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_workspace_vendor';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscriptions_workspace_vendor" BEFORE INSERT OR UPDATE OF "workspace_id", "plan_id" ON "subscriptions"
  FOR EACH ROW EXECUTE FUNCTION "subscriptions_workspace_vendor"();

-- Backfill: a subscription of a plan the company administers at the vendor (a K2 plan, a K4 plan with an admin console) takes the workspace of the
-- vendor. Part 1 made one workspace for each vendor that has a K2 subscription, so every such subscription finds it.
UPDATE "subscriptions" s
   SET "workspace_id" = w."id"
  FROM "plans" p
  JOIN "applications" a ON a."id" = p."application_id"
  JOIN "workspaces" w ON w."vendor_id" = a."vendor_id"
 WHERE p."id" = s."plan_id"
   AND (p."provisioning_type" = 'K2' OR (p."provisioning_type" = 'K4' AND p."has_admin_console"))
   AND s."workspace_id" IS NULL;
