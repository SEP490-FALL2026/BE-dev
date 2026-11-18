-- A subscription has no owning department (the cost follows the person who holds the right). The column, its guard and the evidence
-- table of the owner-assignment command go; the data is recreated from migrations and seed.
DROP TRIGGER subscriptions_owner_immutable ON "subscriptions";
DROP FUNCTION subscriptions_owner_immutable();

DROP TABLE "subscription_owner_assignments";
DROP FUNCTION subscription_owner_assignments_reject_change();
DROP FUNCTION subscription_owner_assignments_require_unowned();

ALTER TABLE "subscriptions" DROP COLUMN "owner_department_id";
