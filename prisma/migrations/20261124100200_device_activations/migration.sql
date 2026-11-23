-- The right of a machine to run software bought once (redesign wave 2): how a K4 plan is bound (to an account, to a machine by a key, or
-- bundled with the machine), how many machines a key may be on, and the rows that say which machine holds which key.
-- Expand only. The one backfill: every K4 plan that exists is bound to an account, which is what it does today.

-- CreateEnum
CREATE TYPE "PlanKeyBinding" AS ENUM ('ACCOUNT', 'DEVICE_KEY', 'DEVICE_BUNDLED');

-- CreateEnum
CREATE TYPE "DeviceActivationOrigin" AS ENUM ('OPERATION', 'INITIAL');

-- CreateEnum
CREATE TYPE "DeviceActivationEndCause" AS ENUM ('DEACTIVATED', 'MOVED', 'DEVICE_DISPOSED', 'DEVICE_LOST', 'DEVICE_VOIDED');

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "key_binding" "PlanKeyBinding";

-- AlterTable
ALTER TABLE "license_keys" ADD COLUMN     "initial_activations_used" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "max_activations" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "device_activations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "license_key_id" UUID,
    "origin" "DeviceActivationOrigin" NOT NULL,
    "moved_from_activation_id" UUID,
    "activated_on" DATE NOT NULL,
    "activated_at" TIMESTAMPTZ(3) NOT NULL,
    "activated_by_app_user_id" UUID NOT NULL,
    "over_activation_cap" BOOLEAN NOT NULL DEFAULT false,
    "deactivated_on" DATE,
    "deactivated_at" TIMESTAMPTZ(3),
    "end_cause" "DeviceActivationEndCause",
    "license_released" BOOLEAN,
    "closed_by_app_user_id" UUID,

    CONSTRAINT "device_activations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_activations_moved_from_activation_id_key" ON "device_activations"("moved_from_activation_id");

-- CreateIndex
CREATE INDEX "device_activations_license_key_id_idx" ON "device_activations"("license_key_id");

-- CreateIndex
CREATE INDEX "device_activations_plan_id_deactivated_at_idx" ON "device_activations"("plan_id", "deactivated_at");

-- CreateIndex
CREATE INDEX "device_activations_device_id_deactivated_at_idx" ON "device_activations"("device_id", "deactivated_at");

-- AddForeignKey
ALTER TABLE "device_activations" ADD CONSTRAINT "device_activations_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "managed_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_activations" ADD CONSTRAINT "device_activations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_activations" ADD CONSTRAINT "device_activations_license_key_id_fkey" FOREIGN KEY ("license_key_id") REFERENCES "license_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_activations" ADD CONSTRAINT "device_activations_moved_from_activation_id_fkey" FOREIGN KEY ("moved_from_activation_id") REFERENCES "device_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot say (ADR-0005).

-- Every K4 plan so far is bound to an account. This runs before the trigger below is replaced, so the backfill is not judged as a change of binding.
UPDATE "plans" SET "key_binding" = 'ACCOUNT' WHERE "provisioning_type" = 'K4';

-- plans: only a K4 plan has a binding (K1 and K2 never go to a machine); a plan bundled with the machine has no price and no console.
ALTER TABLE "plans" ADD CONSTRAINT "plans_key_binding_k4"
  CHECK (("provisioning_type" = 'K4') = ("key_binding" IS NOT NULL));
ALTER TABLE "plans" ADD CONSTRAINT "plans_device_bundled_shape"
  CHECK ("key_binding" IS DISTINCT FROM 'DEVICE_BUNDLED' OR ("reference_price_minor" IS NULL AND "has_admin_console" = false));

-- The guard of a plan (migration 20261113004300) with three cases more, judged when a plan goes from one binding to another: a plan
-- that has a perpetual purchase, an assignment of a person or an activation of a machine keeps its binding. Each case has its own reason
-- (the word after `plan_change_blocked:` is the one the application answers with); none reuses `PERPETUAL_SUBSCRIPTIONS`, which means
-- another thing in `plans_change_keeps_perpetual`. A change from or to no binding is the change of the provisioning type and is judged
-- by the cases that were already there. Every old case stays.
CREATE OR REPLACE FUNCTION "plans_keep_children_valid"() RETURNS trigger AS $$
BEGIN
    -- An active subscription of a per-seat plan has its quantity (subscriptions_fit_plan).
    IF NEW."pricing_model" IS DISTINCT FROM OLD."pricing_model" AND NEW."pricing_model" = 'PER_SEAT'
       AND EXISTS (
           SELECT 1 FROM "subscriptions" s
            WHERE s."plan_id" = NEW."id" AND s."status" = 'ACTIVE' AND s."purchased_quantity" IS NULL
       ) THEN
        RAISE EXCEPTION 'plan_change_blocked: ACTIVE_SUBSCRIPTION_WITHOUT_QUANTITY'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_active_quantity';
    END IF;

    -- The keys kept for a K4 purchase belong to K4 (US-04-07).
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND OLD."provisioning_type" = 'K4'
       AND EXISTS (
           SELECT 1
             FROM "license_keys" k
             JOIN "subscriptions" s ON s."id" = k."subscription_id"
            WHERE s."plan_id" = NEW."id"
       ) THEN
        RAISE EXCEPTION 'plan_change_blocked: LICENSE_KEYS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_license_keys';
    END IF;

    -- A perpetual purchase of an application that is not licensed belongs to the K4 plan (subscriptions_fit_plan): the plan cannot stop being K4 under it.
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND OLD."provisioning_type" = 'K4'
       AND EXISTS (SELECT 1 FROM "applications" a WHERE a."id" = NEW."application_id" AND a."kind" <> 'LICENSED')
       AND EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."plan_id" = NEW."id" AND s."kind" = 'PERPETUAL') THEN
        RAISE EXCEPTION 'plan_change_blocked: PERPETUAL_SUBSCRIPTIONS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_perpetual';
    END IF;

    -- A plan bought once (K4) has no subscription over a term (B-5): a plan of seats cannot enter K4 with one hanging on it.
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND NEW."provisioning_type" = 'K4'
       AND EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."plan_id" = NEW."id" AND s."kind" = 'TERM') THEN
        RAISE EXCEPTION 'plan_change_blocked: TERM_SUBSCRIPTIONS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_terms';
    END IF;

    -- A K5 plan of an internal application has no subscription (subscriptions_fit_plan).
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND NEW."provisioning_type" = 'K5'
       AND EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."plan_id" = NEW."id") THEN
        RAISE EXCEPTION 'plan_change_blocked: SUBSCRIPTIONS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_no_subscription';
    END IF;

    -- A subscription that rests on a contract is of a shared stock (K2 or K4, QĐ-111t): the plan cannot leave K2 and K4 under the link. The rule is
    -- judged when a subscription is linked and never again, so without this the link of a subscription of a plan that became K1 or K3 would stay.
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND NEW."provisioning_type" NOT IN ('K2', 'K4')
       AND EXISTS (
           SELECT 1
             FROM "contract_subscriptions" l
             JOIN "subscriptions" s ON s."id" = l."subscription_id"
            WHERE s."plan_id" = NEW."id"
       ) THEN
        RAISE EXCEPTION 'plan_change_blocked: CONTRACT_LINKS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_contract_links';
    END IF;

    -- The binding of a K4 plan cannot move while something rests on it: a perpetual purchase, an assignment of a person, an activation of a machine.
    IF NEW."key_binding" IS NOT NULL AND OLD."key_binding" IS NOT NULL AND NEW."key_binding" IS DISTINCT FROM OLD."key_binding" THEN
        IF EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."plan_id" = NEW."id" AND s."kind" = 'PERPETUAL') THEN
            RAISE EXCEPTION 'plan_change_blocked: KEY_BINDING_PURCHASES'
                USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_key_binding';
        END IF;
        IF EXISTS (SELECT 1 FROM "license_assignments" a WHERE a."plan_id" = NEW."id") THEN
            RAISE EXCEPTION 'plan_change_blocked: KEY_BINDING_ASSIGNMENTS'
                USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_key_binding_assignments';
        END IF;
        IF EXISTS (SELECT 1 FROM "device_activations" d WHERE d."plan_id" = NEW."id") THEN
            RAISE EXCEPTION 'plan_change_blocked: DEVICE_ACTIVATIONS'
                USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_device_activations';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The same trigger on one column more: it did not run when only the binding changed.
DROP TRIGGER IF EXISTS "plans_keep_children_valid" ON "plans";
CREATE TRIGGER "plans_keep_children_valid"
    BEFORE UPDATE OF "pricing_model", "provisioning_type", "key_binding" ON "plans"
    FOR EACH ROW EXECUTE FUNCTION "plans_keep_children_valid"();

-- license_keys: how many machines a key may be on at once, and how many it was already on when it was entered.
ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_max_activations_range" CHECK ("max_activations" BETWEEN 1 AND 100000);
ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_initial_activations_used_range" CHECK ("initial_activations_used" BETWEEN 0 AND 100000);

-- The guard of the vault (migration 20261110030100) with three rules more: `initial_activations_used` is written once with the key; the
-- cap of a key only goes up; and a key is given to a person only when its plan is bound to an account (S-4: otherwise a lot of 25 could
-- hand out 50, once to people and once to machines, because the two capacity triggers count apart). Every old rule stays.
CREATE OR REPLACE FUNCTION "license_key_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A license key is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'license_key_kept';
    END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
        OR NEW."subscription_id" IS DISTINCT FROM OLD."subscription_id"
        OR NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint"
        OR NEW."masked" IS DISTINCT FROM OLD."masked"
        OR NEW."imported_by_app_user_id" IS DISTINCT FROM OLD."imported_by_app_user_id"
        OR NEW."imported_at" IS DISTINCT FROM OLD."imported_at"
        OR NEW."initial_activations_used" IS DISTINCT FROM OLD."initial_activations_used" THEN
        RAISE EXCEPTION 'Only the status of a license key changes'
            USING ERRCODE = '55000', CONSTRAINT = 'license_key_columns_fixed';
    END IF;
    IF NEW."max_activations" < OLD."max_activations" THEN
        RAISE EXCEPTION 'The cap of activations of a license key only goes up'
            USING ERRCODE = '55000', CONSTRAINT = 'license_key_max_activations_raise_only';
    END IF;
    IF NEW."cipher_key_id" IS DISTINCT FROM OLD."cipher_key_id" AND NEW."ciphertext" IS NOT DISTINCT FROM OLD."ciphertext" THEN
        RAISE EXCEPTION 'The key id of a license key changes only with its ciphertext'
            USING ERRCODE = '55000', CONSTRAINT = 'license_key_sealed_together';
    END IF;
    IF OLD."withdrawn_at" IS NOT NULL AND (
        NEW."withdrawn_at" IS DISTINCT FROM OLD."withdrawn_at"
        OR NEW."withdrawn_by_app_user_id" IS DISTINCT FROM OLD."withdrawn_by_app_user_id"
        OR NEW."withdrawal_reason" IS DISTINCT FROM OLD."withdrawal_reason"
        OR NEW."status" IS DISTINCT FROM OLD."status"
        OR NEW."assignment_id" IS DISTINCT FROM OLD."assignment_id") THEN
        RAISE EXCEPTION 'A license key withdrawn from the store stays withdrawn'
            USING ERRCODE = '55000', CONSTRAINT = 'license_key_withdrawal_fixed';
    END IF;
    IF OLD."assignment_id" IS NOT NULL AND NEW."assignment_id" IS NOT NULL
        AND NEW."assignment_id" IS DISTINCT FROM OLD."assignment_id" THEN
        RAISE EXCEPTION 'A license key goes back to the store before it is assigned again'
            USING ERRCODE = '55000', CONSTRAINT = 'license_key_one_assignment_at_a_time';
    END IF;
    IF NEW."assignment_id" IS NOT NULL AND NEW."assignment_id" IS DISTINCT FROM OLD."assignment_id"
        AND NOT EXISTS (
            SELECT 1 FROM "license_assignments" a
             WHERE a."id" = NEW."assignment_id" AND a."subscription_id" = NEW."subscription_id"
        ) THEN
        RAISE EXCEPTION 'A license key is assigned only to an assignment of its own purchase'
            USING ERRCODE = '23514', CONSTRAINT = 'license_key_assignment_of_purchase';
    END IF;
    IF NEW."assignment_id" IS NOT NULL AND NEW."assignment_id" IS DISTINCT FROM OLD."assignment_id"
        AND NOT EXISTS (
            SELECT 1
              FROM "subscriptions" s
              JOIN "plans" p ON p."id" = s."plan_id"
             WHERE s."id" = NEW."subscription_id" AND p."key_binding" = 'ACCOUNT'
        ) THEN
        RAISE EXCEPTION 'A license key is given to a person only when its plan is bound to an account'
            USING ERRCODE = '23514', CONSTRAINT = 'license_key_assignment_plan_account';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- device_activations: a closed row is complete (the day, the time and the cause together, and not before it opened); the license is
-- told released or lost exactly on a closed row of a key, and a move always releases it.
ALTER TABLE "device_activations" ADD CONSTRAINT "device_activations_closed_complete" CHECK (
  ("deactivated_at" IS NULL) = ("deactivated_on" IS NULL)
  AND ("deactivated_at" IS NULL) = ("end_cause" IS NULL)
  AND ("deactivated_on" IS NULL OR "deactivated_on" >= "activated_on"));
ALTER TABLE "device_activations" ADD CONSTRAINT "device_activations_release" CHECK (
  (("license_released" IS NOT NULL) = ("deactivated_at" IS NOT NULL AND "license_key_id" IS NOT NULL))
  AND ("end_cause" IS DISTINCT FROM 'MOVED' OR "license_released" = true));
-- A machine has one open activation for a plan at a time.
CREATE UNIQUE INDEX "device_activations_one_open" ON "device_activations" ("device_id", "plan_id") WHERE "deactivated_at" IS NULL;

-- How many licenses of a purchase are taken: the activations of its keys that are open, and the closed ones whose license was lost
-- with the machine (not released back to the lot).
CREATE FUNCTION device_activation_occupied(purchase uuid) RETURNS bigint AS $$
  SELECT count(*)
    FROM device_activations a
    JOIN license_keys k ON k.id = a.license_key_id
   WHERE k.subscription_id = purchase AND (a.deactivated_at IS NULL OR a.license_released = false);
$$ LANGUAGE sql STABLE;

-- An activation goes only to a plan bound to a machine; a key is there exactly when the plan is not bundled; the key is of a purchase
-- of the same plan and not withdrawn.
CREATE FUNCTION device_activations_guard() RETURNS trigger AS $$
DECLARE
  binding "PlanKeyBinding";
  key_plan uuid;
  key_withdrawn timestamptz;
BEGIN
  SELECT p.key_binding INTO binding FROM plans p WHERE p.id = NEW.plan_id;
  IF binding IS NULL OR binding NOT IN ('DEVICE_KEY', 'DEVICE_BUNDLED') THEN
    RAISE EXCEPTION 'An activation goes only to a plan bound to a machine'
      USING ERRCODE = '23514', CONSTRAINT = 'device_activations_plan_device_bound';
  END IF;
  IF (NEW.license_key_id IS NULL) <> (binding = 'DEVICE_BUNDLED') THEN
    RAISE EXCEPTION 'An activation has a key exactly when its plan is not bundled with the machine'
      USING ERRCODE = '23514', CONSTRAINT = 'device_activations_key_fits_plan';
  END IF;
  IF NEW.license_key_id IS NOT NULL THEN
    SELECT s.plan_id, k.withdrawn_at INTO key_plan, key_withdrawn
      FROM license_keys k JOIN subscriptions s ON s.id = k.subscription_id
     WHERE k.id = NEW.license_key_id;
    IF key_plan IS DISTINCT FROM NEW.plan_id OR key_withdrawn IS NOT NULL THEN
      RAISE EXCEPTION 'An activation uses a key of its own plan that was not withdrawn'
        USING ERRCODE = '23514', CONSTRAINT = 'device_activations_key_usable';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER device_activations_guard BEFORE INSERT ON "device_activations"
  FOR EACH ROW EXECUTE FUNCTION device_activations_guard();

-- INV-01 for the lot of keys: the licenses taken never pass the licenses bought. Read after the row of the purchase is locked, so it is
-- right only under READ COMMITTED (as license_assignment_check_capacity); any other isolation is refused instead of counting a stale picture.
CREATE FUNCTION device_activations_check_lot_capacity() RETURNS trigger AS $$
DECLARE
  purchase uuid;
  licenses INTEGER;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'The licenses of a purchase are counted under READ COMMITTED only'
      USING ERRCODE = '55000', CONSTRAINT = 'device_activations_capacity_isolation';
  END IF;
  SELECT k.subscription_id INTO purchase FROM license_keys k WHERE k.id = NEW.license_key_id;
  SELECT s.purchased_quantity INTO licenses FROM subscriptions s WHERE s.id = purchase FOR UPDATE;
  IF licenses IS NULL THEN
    RAISE EXCEPTION 'The number of licenses of the purchase is not known'
      USING ERRCODE = '23514', CONSTRAINT = 'device_activations_lot_capacity';
  END IF;
  IF device_activation_occupied(purchase) > licenses THEN
    RAISE EXCEPTION 'The licenses of the purchase are all taken'
      USING ERRCODE = '23514', CONSTRAINT = 'device_activations_lot_capacity';
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER device_activations_lot_capacity AFTER INSERT ON "device_activations"
  FOR EACH ROW WHEN (NEW.license_key_id IS NOT NULL) EXECUTE FUNCTION device_activations_check_lot_capacity();

-- An activation is never deleted; a closed one does not change; an open one changes only the columns that close it.
CREATE FUNCTION device_activations_kept() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'An activation of a machine is never deleted'
     USING ERRCODE = '55000', CONSTRAINT = 'device_activations_kept'; END IF;
  IF OLD.deactivated_at IS NOT NULL AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*)
  THEN RAISE EXCEPTION 'An activation that was closed does not change any more'
     USING ERRCODE = '55000', CONSTRAINT = 'device_activations_closed_fixed'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.device_id, NEW.plan_id, NEW.license_key_id, NEW.origin, NEW.moved_from_activation_id,
      NEW.activated_on, NEW.activated_at, NEW.activated_by_app_user_id, NEW.over_activation_cap)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.device_id, OLD.plan_id, OLD.license_key_id, OLD.origin, OLD.moved_from_activation_id,
      OLD.activated_on, OLD.activated_at, OLD.activated_by_app_user_id, OLD.over_activation_cap)
  THEN RAISE EXCEPTION 'An open activation changes only the columns that close it'
     USING ERRCODE = '55000', CONSTRAINT = 'device_activations_open_fixed'; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER device_activations_kept BEFORE UPDATE OR DELETE ON "device_activations"
  FOR EACH ROW EXECUTE FUNCTION device_activations_kept();
