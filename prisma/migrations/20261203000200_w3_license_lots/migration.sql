-- W3-24, W3-25 (P12a M6): a purchase of licenses of a K4 plan is a lot, not a subscription. A lot has its own count of licenses, its price,
-- its purpose and who answers for it; the keys of the store belong to a lot; a purchase invoice can be of a lot; a lot's cost that no invoice
-- carries (a license left over, given for the first time) is a charge.
-- Every perpetual purchase that is active becomes a lot with the SAME id as the subscription it was, so the `lotId` the machines of wave 2 already
-- show does not change. The six functions of the activations are written again over the lots and keep every rule they had.
-- Reversal (before any lot is written): drop the new triggers, tables and columns, set `license_keys.subscription_id` NOT NULL again, then restore
-- the functions from migrations 20261124100200 (device_activation_occupied, device_activations_guard, device_activations_check_lot_capacity,
-- license_key_guard), 20261203000100 (license_assignment_check_capacity, purchase_invoices_guard), 20261124133500 (plans_keep_children_valid).

-- 1. Check before: what cannot be turned into a lot stops the migration, with the subscription named (K-A7).
DO $$
DECLARE
    offender RECORD;
BEGIN
    FOR offender IN
        SELECT s."id", s."status"::text AS "status", s."unit_price_minor",
               (SELECT count(*) FROM "license_keys" k WHERE k."subscription_id" = s."id") AS "keys"
          FROM "subscriptions" s JOIN "plans" p ON p."id" = s."plan_id"
         WHERE s."kind" = 'PERPETUAL' AND p."provisioning_type" = 'K4'
           AND ((s."status" = 'ACTIVE' AND s."unit_price_minor" IS NULL)
                OR (s."status" = 'DRAFT' AND EXISTS (SELECT 1 FROM "license_keys" k WHERE k."subscription_id" = s."id")))
         LIMIT 1
    LOOP
        RAISE EXCEPTION 'subscription % (% perpetual purchase, % keys, price %) cannot become a lot: give an active one its unit price, remove the keys of a draft',
            offender."id", offender."status", offender."keys", offender."unit_price_minor"
            USING ERRCODE = '23514', CONSTRAINT = 'license_lots_convertible';
    END LOOP;
    FOR offender IN
        SELECT s."id" FROM "subscriptions" s
         WHERE s."kind" = 'TERM' AND EXISTS (SELECT 1 FROM "license_keys" k WHERE k."subscription_id" = s."id")
         LIMIT 1
    LOOP
        RAISE EXCEPTION 'subscription % is a term subscription and holds license keys: keys belong to a perpetual purchase only', offender."id"
            USING ERRCODE = '23514', CONSTRAINT = 'license_lots_convertible';
    END LOOP;
END $$;

-- 2. The tables and the columns.
CREATE TABLE "license_lots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "workspace_id" UUID,
    "purchased_on" DATE NOT NULL,
    "license_count" INTEGER NOT NULL,
    "unit_price_minor" BIGINT NOT NULL,
    "original_unit_price_minor" BIGINT,
    "original_currency" CHAR(3),
    "invoice_actual_minor" BIGINT,
    "purpose" TEXT NOT NULL,
    "request_id" UUID,
    "contract_id" UUID,
    "responsible_it_admin_employee_id" UUID,
    "legacy_subscription_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_lots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "license_lots_license_count_check" CHECK ("license_count" > 0),
    CONSTRAINT "license_lots_unit_price_check" CHECK ("unit_price_minor" >= 0),
    CONSTRAINT "license_lots_original_price_check" CHECK (
        ("original_unit_price_minor" IS NULL) = ("original_currency" IS NULL)
        AND ("original_unit_price_minor" IS NULL OR "original_unit_price_minor" >= 0)
    ),
    CONSTRAINT "license_lots_purpose_check" CHECK ("purpose" IN ('OPENING', 'REQUEST', 'REPLACEMENT', 'STOCK')),
    CONSTRAINT "license_lots_request_check" CHECK (("purpose" = 'REQUEST') = ("request_id" IS NOT NULL)),
    CONSTRAINT "license_lots_note_check" CHECK ("note" IS NULL OR char_length(btrim("note")) BETWEEN 1 AND 1000)
);

CREATE TABLE "license_lot_charges" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "license_lot_id" UUID NOT NULL,
    "license_key_id" UUID NOT NULL,
    "commitment_id" UUID,
    "cost_center_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_lot_charges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "license_lot_charges_month_check" CHECK (EXTRACT(day FROM "month") = 1),
    CONSTRAINT "license_lot_charges_amount_check" CHECK ("amount_minor" > 0)
);

ALTER TABLE "license_keys"
    ADD COLUMN "license_lot_id" UUID,
    ADD COLUMN "cost_borne" BOOLEAN;
ALTER TABLE "purchase_invoices" ADD COLUMN "license_lot_id" UUID;

CREATE UNIQUE INDEX "license_lots_legacy_subscription_id_key" ON "license_lots"("legacy_subscription_id");
CREATE INDEX "license_lots_plan_id_idx" ON "license_lots"("plan_id");
CREATE INDEX "license_lots_workspace_id_idx" ON "license_lots"("workspace_id");
CREATE INDEX "license_lots_contract_id_idx" ON "license_lots"("contract_id");
CREATE INDEX "license_lots_responsible_it_admin_employee_id_idx" ON "license_lots"("responsible_it_admin_employee_id");
-- One lot of a request per Request (F14).
CREATE UNIQUE INDEX "license_lots_request_key" ON "license_lots"("request_id") WHERE "purpose" = 'REQUEST';

CREATE UNIQUE INDEX "license_lot_charges_license_key_id_key" ON "license_lot_charges"("license_key_id");
CREATE INDEX "license_lot_charges_license_lot_id_idx" ON "license_lot_charges"("license_lot_id");
CREATE INDEX "license_lot_charges_cost_center_id_month_idx" ON "license_lot_charges"("cost_center_id", "month");

CREATE INDEX "license_keys_license_lot_id_status_idx" ON "license_keys"("license_lot_id", "status");
-- One purchase invoice in force per lot (F14): a returned one does not count.
CREATE UNIQUE INDEX "purchase_invoices_license_lot_open_key" ON "purchase_invoices"("license_lot_id")
    WHERE "license_lot_id" IS NOT NULL AND "state" <> 'RETURNED';

ALTER TABLE "license_lots" ADD CONSTRAINT "license_lots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_lots" ADD CONSTRAINT "license_lots_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_lots" ADD CONSTRAINT "license_lots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_lots" ADD CONSTRAINT "license_lots_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_lots" ADD CONSTRAINT "license_lots_responsible_it_admin_employee_id_fkey" FOREIGN KEY ("responsible_it_admin_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_lots" ADD CONSTRAINT "license_lots_legacy_subscription_id_fkey" FOREIGN KEY ("legacy_subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "license_lot_charges" ADD CONSTRAINT "license_lot_charges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_lot_charges" ADD CONSTRAINT "license_lot_charges_license_lot_id_fkey" FOREIGN KEY ("license_lot_id") REFERENCES "license_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_lot_charges" ADD CONSTRAINT "license_lot_charges_license_key_id_fkey" FOREIGN KEY ("license_key_id") REFERENCES "license_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_lot_charges" ADD CONSTRAINT "license_lot_charges_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "budget_commitments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_lot_charges" ADD CONSTRAINT "license_lot_charges_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_license_lot_id_fkey" FOREIGN KEY ("license_lot_id") REFERENCES "license_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_license_lot_id_fkey" FOREIGN KEY ("license_lot_id") REFERENCES "license_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. The data: each perpetual purchase of a K4 plan that is active becomes a lot with the same id. The count is the most of what was bought,
-- the keys not withdrawn and what the activations of wave 2 already take (read before the function changes, so it is the old count), and at least
-- one. A draft perpetual purchase with no key becomes no lot.
INSERT INTO "license_lots" ("id", "organization_id", "plan_id", "workspace_id", "purchased_on", "license_count", "unit_price_minor",
                            "purpose", "contract_id", "responsible_it_admin_employee_id", "legacy_subscription_id", "created_at", "updated_at")
SELECT s."id", s."organization_id", s."plan_id",
       CASE WHEN p."has_admin_console"
            THEN COALESCE(s."workspace_id", (SELECT w."id" FROM "workspaces" w WHERE w."vendor_id" = a."vendor_id" ORDER BY w."created_at", w."id" LIMIT 1))
            ELSE s."workspace_id" END,
       COALESCE(s."start_date", (s."created_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
       GREATEST(COALESCE(s."purchased_quantity", 0),
                (SELECT count(*) FROM "license_keys" k WHERE k."subscription_id" = s."id" AND k."withdrawn_at" IS NULL),
                device_activation_occupied(s."id"), 1),
       s."unit_price_minor", 'OPENING',
       (SELECT cs."contract_id" FROM "contract_subscriptions" cs WHERE cs."subscription_id" = s."id"),
       s."responsible_it_admin_employee_id", s."id", s."created_at", now()
  FROM "subscriptions" s
  JOIN "plans" p ON p."id" = s."plan_id"
  JOIN "applications" a ON a."id" = p."application_id"
 WHERE s."kind" = 'PERPETUAL' AND s."status" = 'ACTIVE' AND p."provisioning_type" = 'K4'
   AND p."key_binding" IS DISTINCT FROM 'DEVICE_BUNDLED';

-- What the migration left out (a draft with no key, a purchase of a bundled plan) is named, for whoever reads the log.
DO $$
DECLARE
    skipped TEXT;
BEGIN
    SELECT string_agg(s."id"::text, ', ') INTO skipped
      FROM "subscriptions" s JOIN "plans" p ON p."id" = s."plan_id"
     WHERE s."kind" = 'PERPETUAL' AND p."provisioning_type" = 'K4'
       AND NOT EXISTS (SELECT 1 FROM "license_lots" l WHERE l."id" = s."id");
    IF skipped IS NOT NULL THEN
        RAISE NOTICE 'perpetual purchases of K4 plans that became no lot: %', skipped;
    END IF;
END $$;

-- Every key already in the store was entered by the owner of the cost: it is borne. The guard of wave 2 does not fix these two columns, so they can be written.
UPDATE "license_keys" k SET "license_lot_id" = k."subscription_id" WHERE EXISTS (SELECT 1 FROM "license_lots" l WHERE l."id" = k."subscription_id");
UPDATE "license_keys" SET "cost_borne" = true;
ALTER TABLE "license_keys" ALTER COLUMN "cost_borne" SET NOT NULL;
ALTER TABLE "license_keys" ALTER COLUMN "subscription_id" DROP NOT NULL;
ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_lot_or_subscription" CHECK ("license_lot_id" IS NOT NULL OR "subscription_id" IS NOT NULL);

-- 4. The six functions of the activations over the lots. Every rule they had stays.

-- The licenses of a lot that are taken: the open activations of its keys and the closed ones whose license was lost with the machine, the keys
-- given to a person, and the old rights with no key of the subscription the lot came from (QĐ-115s).
CREATE OR REPLACE FUNCTION device_activation_occupied(purchase uuid) RETURNS bigint AS $$
  SELECT
    (SELECT count(*)
       FROM device_activations a
       JOIN license_keys k ON k.id = a.license_key_id
      WHERE k.license_lot_id = purchase AND (a.deactivated_at IS NULL OR a.license_released = false))
    + (SELECT count(*) FROM license_keys k WHERE k.license_lot_id = purchase AND k.status = 'ASSIGNED')
    + (SELECT count(*)
         FROM license_lots l
         JOIN license_assignments a ON a.subscription_id = l.legacy_subscription_id AND a.plan_id = l.plan_id
        WHERE l.id = purchase AND a.failed_at IS NULL AND a.cancelled_at IS NULL
          AND (a.valid_until IS NULL OR a.valid_until > CURRENT_DATE)
          AND NOT EXISTS (SELECT 1 FROM license_keys k WHERE k.assignment_id = a.id));
$$ LANGUAGE sql STABLE;

-- An activation goes only to a plan bound to a machine; a key is there exactly when the plan is not bundled; the key is of a lot of the same plan
-- and not withdrawn.
CREATE OR REPLACE FUNCTION device_activations_guard() RETURNS trigger AS $$
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
    SELECT l.plan_id, k.withdrawn_at INTO key_plan, key_withdrawn
      FROM license_keys k JOIN license_lots l ON l.id = k.license_lot_id
     WHERE k.id = NEW.license_key_id;
    IF key_plan IS DISTINCT FROM NEW.plan_id OR key_withdrawn IS NOT NULL THEN
      RAISE EXCEPTION 'An activation uses a key of its own plan that was not withdrawn'
        USING ERRCODE = '23514', CONSTRAINT = 'device_activations_key_usable';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- INV-01 for the lot of keys: the licenses taken never pass the licenses bought. The row of the lot is locked first (tier 6a), so it is right only
-- under READ COMMITTED; any other isolation is refused instead of counting a stale picture.
CREATE OR REPLACE FUNCTION device_activations_check_lot_capacity() RETURNS trigger AS $$
DECLARE
  purchase uuid;
  licenses INTEGER;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'The licenses of a purchase are counted under READ COMMITTED only'
      USING ERRCODE = '55000', CONSTRAINT = 'device_activations_capacity_isolation';
  END IF;
  SELECT k.license_lot_id INTO purchase FROM license_keys k WHERE k.id = NEW.license_key_id;
  SELECT l.license_count INTO licenses FROM license_lots l WHERE l.id = purchase FOR UPDATE;
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

-- The guard of the vault (migration 20261124100200) with the lot: `license_lot_id` is fixed with the key; `cost_borne` changes only from false to
-- true; a key is given to the right of its own purchase (the same plan as the lot and no subscription, or the one the lot came from) and to a
-- person only when the plan of the lot is bound to an account. A key with no lot is judged as before, by its subscription. Every old rule stays.
CREATE OR REPLACE FUNCTION "license_key_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A license key is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'license_key_kept';
    END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
        OR NEW."subscription_id" IS DISTINCT FROM OLD."subscription_id"
        OR NEW."license_lot_id" IS DISTINCT FROM OLD."license_lot_id"
        OR NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint"
        OR NEW."masked" IS DISTINCT FROM OLD."masked"
        OR NEW."imported_by_app_user_id" IS DISTINCT FROM OLD."imported_by_app_user_id"
        OR NEW."imported_at" IS DISTINCT FROM OLD."imported_at"
        OR NEW."initial_activations_used" IS DISTINCT FROM OLD."initial_activations_used" THEN
        RAISE EXCEPTION 'Only the status of a license key changes'
            USING ERRCODE = '55000', CONSTRAINT = 'license_key_columns_fixed';
    END IF;
    IF NEW."cost_borne" IS DISTINCT FROM OLD."cost_borne" AND NOT (OLD."cost_borne" = false AND NEW."cost_borne" = true) THEN
        RAISE EXCEPTION 'The cost of a license key is borne once and stays borne'
            USING ERRCODE = '55000', CONSTRAINT = 'license_key_cost_borne_once';
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
            SELECT 1
              FROM "license_assignments" a
              LEFT JOIN "license_lots" l ON l."id" = NEW."license_lot_id"
             WHERE a."id" = NEW."assignment_id"
               AND CASE WHEN NEW."license_lot_id" IS NOT NULL
                        THEN a."plan_id" = l."plan_id" AND (a."subscription_id" IS NULL OR a."subscription_id" = l."legacy_subscription_id")
                        ELSE a."subscription_id" = NEW."subscription_id" END
        ) THEN
        RAISE EXCEPTION 'A license key is assigned only to an assignment of its own purchase'
            USING ERRCODE = '23514', CONSTRAINT = 'license_key_assignment_of_purchase';
    END IF;
    IF NEW."assignment_id" IS NOT NULL AND NEW."assignment_id" IS DISTINCT FROM OLD."assignment_id"
        AND NOT EXISTS (
            SELECT 1
              FROM "plans" p
             WHERE p."key_binding" = 'ACCOUNT'
               AND p."id" = CASE WHEN NEW."license_lot_id" IS NOT NULL
                                 THEN (SELECT l."plan_id" FROM "license_lots" l WHERE l."id" = NEW."license_lot_id")
                                 ELSE (SELECT s."plan_id" FROM "subscriptions" s WHERE s."id" = NEW."subscription_id") END
        ) THEN
        RAISE EXCEPTION 'A license key is given to a person only when its plan is bound to an account'
            USING ERRCODE = '23514', CONSTRAINT = 'license_key_assignment_plan_account';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- INV-01 for an assignment: as in migration 20261203000100 (the line of a plan of seats, the quantity of the period for a period with no line),
-- except that the rights of a K4 plan are not counted here: the licenses of a lot are counted through the lot (`license_lots_capacity`), and a
-- right of the lot that came from a purchase is not counted by the frozen quantity of the subscription nor locks `subscriptions` after the lot
-- and the key (that would lock in the order 6a, 7b, 6).
CREATE OR REPLACE FUNCTION "license_assignment_check_capacity"() RETURNS trigger AS $$
DECLARE
    period_seats INTEGER;
    peak BIGINT;
    line RECORD;
    unknown BOOLEAN;
    plan_type "ProvisioningType";
BEGIN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'The seats of a subscription are counted under READ COMMITTED only'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_capacity_isolation';
    END IF;

    SELECT p."provisioning_type" INTO plan_type FROM "plans" p WHERE p."id" = NEW."plan_id";
    IF plan_type = 'K4' THEN
        RETURN NULL;
    END IF;

    SELECT l."id", l."ledger_opened_on" INTO line
      FROM "subscription_lines" l
     WHERE l."subscription_id" = NEW."subscription_id" AND l."plan_id" = NEW."plan_id"
       FOR UPDATE;

    IF NOT FOUND THEN
        SELECT s."purchased_quantity" INTO period_seats FROM "subscriptions" s WHERE s."id" = NEW."subscription_id" FOR UPDATE;
        IF period_seats IS NULL THEN
            RAISE EXCEPTION 'The number of seats of the subscription is not known'
                USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_seat_capacity';
        END IF;

        SELECT COALESCE(MAX(per_day."occupied"), 0) INTO peak FROM (
            SELECT (
                SELECT count(*) FROM "license_assignments" b
                 WHERE b."subscription_id" = NEW."subscription_id"
                   AND b."valid_from" <= d."day"
                   AND (b."valid_until" IS NULL OR d."day" < b."valid_until")
            ) AS "occupied"
            FROM (
                SELECT NEW."valid_from" AS "day"
                UNION
                SELECT a."valid_from"
                  FROM "license_assignments" a
                 WHERE a."subscription_id" = NEW."subscription_id"
                   AND a."valid_from" > NEW."valid_from"
                   AND (NEW."valid_until" IS NULL OR a."valid_from" < NEW."valid_until")
            ) d
        ) per_day;

        IF peak > period_seats THEN
            RAISE EXCEPTION 'The seats of the subscription are all taken: % assignments for % seats', peak, period_seats
                USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_seat_capacity';
        END IF;
        RETURN NULL;
    END IF;

    SELECT s."purchased_quantity" INTO period_seats FROM "subscriptions" s WHERE s."id" = NEW."subscription_id";

    SELECT COALESCE(MAX(per_day."occupied" - per_day."seats"), 0), COALESCE(bool_or(per_day."seats" IS NULL), false)
      INTO peak, unknown
      FROM (
        SELECT (
                SELECT count(*) FROM "license_assignments" b
                 WHERE b."subscription_id" = NEW."subscription_id" AND b."plan_id" = NEW."plan_id"
                   AND b."valid_from" <= d."day"
                   AND (b."valid_until" IS NULL OR d."day" < b."valid_until")
               ) AS "occupied",
               CASE WHEN line."ledger_opened_on" IS NOT NULL AND line."ledger_opened_on" <= d."day"
                    THEN (SELECT COALESCE(sum(c."delta"), 0) FROM "seat_changes" c
                           WHERE c."subscription_line_id" = line."id" AND c."effective_on" <= d."day")
                    ELSE period_seats END AS "seats"
          FROM (
            SELECT NEW."valid_from" AS "day"
            UNION
            SELECT a."valid_from"
              FROM "license_assignments" a
             WHERE a."subscription_id" = NEW."subscription_id" AND a."plan_id" = NEW."plan_id"
               AND a."valid_from" > NEW."valid_from"
               AND (NEW."valid_until" IS NULL OR a."valid_from" < NEW."valid_until")
            UNION
            SELECT c."effective_on" FROM "seat_changes" c
             WHERE c."subscription_line_id" = line."id" AND c."effective_on" > NEW."valid_from"
               AND (NEW."valid_until" IS NULL OR c."effective_on" < NEW."valid_until")
          ) d
      ) per_day;

    IF unknown THEN
        RAISE EXCEPTION 'The number of seats of the subscription is not known'
            USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_seat_capacity';
    END IF;
    IF peak > 0 THEN
        RAISE EXCEPTION 'The seats of the subscription are all taken: % assignments over the seats', peak
            USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_seat_capacity';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- The plan keeps its children valid: the function of migration 20261124133500 with every rule it has (entering K4 bound to an account is not blocked,
-- a binding does not move under purchases, rights or activations), the keys read through the lots, a lot counted as a purchase of the plan, and one more
-- rule: a plan that has lots does not leave K4.
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

    -- The keys kept for a K4 purchase belong to K4 (US-04-07): the keys of its lots, and the older ones by their subscription.
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND OLD."provisioning_type" = 'K4'
       AND EXISTS (
           SELECT 1
             FROM "license_keys" k
             LEFT JOIN "license_lots" l ON l."id" = k."license_lot_id"
             LEFT JOIN "subscriptions" s ON s."id" = k."subscription_id"
            WHERE COALESCE(l."plan_id", s."plan_id") = NEW."id"
       ) THEN
        RAISE EXCEPTION 'plan_change_blocked: LICENSE_KEYS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_license_keys';
    END IF;

    -- A plan that has lots stays K4: a lot is a purchase of a plan bought once.
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND OLD."provisioning_type" = 'K4'
       AND EXISTS (SELECT 1 FROM "license_lots" l WHERE l."plan_id" = NEW."id") THEN
        RAISE EXCEPTION 'plan_change_blocked: LICENSE_LOTS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_license_lots';
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

    -- The binding of a K4 plan cannot move while something rests on it: a perpetual purchase or a lot, an assignment of a person, an activation of a machine.
    IF NEW."key_binding" IS DISTINCT FROM OLD."key_binding" THEN
        IF NEW."key_binding" IS NOT NULL AND NEW."key_binding" IS DISTINCT FROM COALESCE(OLD."key_binding", 'ACCOUNT') THEN
            IF EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."plan_id" = NEW."id" AND s."kind" = 'PERPETUAL')
               OR EXISTS (SELECT 1 FROM "license_lots" l WHERE l."plan_id" = NEW."id") THEN
                RAISE EXCEPTION 'plan_change_blocked: KEY_BINDING_PURCHASES'
                    USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_key_binding';
            END IF;
            IF EXISTS (SELECT 1 FROM "license_assignments" a WHERE a."plan_id" = NEW."id") THEN
                RAISE EXCEPTION 'plan_change_blocked: KEY_BINDING_ASSIGNMENTS'
                    USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_key_binding_assignments';
            END IF;
        END IF;
        IF EXISTS (SELECT 1 FROM "device_activations" d WHERE d."plan_id" = NEW."id") THEN
            RAISE EXCEPTION 'plan_change_blocked: DEVICE_ACTIVATIONS'
                USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_device_activations';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only a subscription of seats rests on a contract from now on: a lot has its own contract column (`license_lots.contract_id`). The links that
-- exist stay as history. The other rule of the function (the same vendor) is that of migration 20261113004200.
CREATE OR REPLACE FUNCTION "contract_subscription_check"() RETURNS trigger AS $$
DECLARE
    plan_type TEXT;
    subscription_vendor UUID;
    contract_vendor UUID;
BEGIN
    SELECT p."provisioning_type"::text, a."vendor_id"
      INTO plan_type, subscription_vendor
      FROM "subscriptions" s
      JOIN "plans" p ON p."id" = s."plan_id"
      JOIN "applications" a ON a."id" = p."application_id"
     WHERE s."id" = NEW."subscription_id";

    IF plan_type IS NULL OR plan_type <> 'K2' THEN
        RAISE EXCEPTION 'Only a subscription of seats (K2) rests on a contract'
            USING ERRCODE = '55000', CONSTRAINT = 'contract_subscriptions_shared_stock_only';
    END IF;

    SELECT c."vendor_id" INTO contract_vendor FROM "contracts" c WHERE c."id" = NEW."contract_id";

    IF contract_vendor IS NULL OR subscription_vendor IS DISTINCT FROM contract_vendor THEN
        RAISE EXCEPTION 'A contract and the subscriptions on it have the same vendor'
            USING ERRCODE = '55000', CONSTRAINT = 'contract_subscriptions_same_vendor';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. The new triggers and checks.

-- A lot is of a K4 plan that is not bundled with the machine; of the workspace of the vendor of the plan (always, when the plan has an admin console);
-- its purpose fits the binding of the plan; its contract is of the vendor (QĐ-115au).
CREATE FUNCTION "license_lots_guard"() RETURNS trigger AS $$
DECLARE
    plan_type "ProvisioningType";
    plan_binding "PlanKeyBinding";
    plan_console BOOLEAN;
    plan_vendor UUID;
    workspace_vendor UUID;
    contract_vendor UUID;
BEGIN
    SELECT p."provisioning_type", p."key_binding", p."has_admin_console", a."vendor_id"
      INTO plan_type, plan_binding, plan_console, plan_vendor
      FROM "plans" p JOIN "applications" a ON a."id" = p."application_id" WHERE p."id" = NEW."plan_id";
    IF plan_type IS DISTINCT FROM 'K4' OR plan_binding IS NOT DISTINCT FROM 'DEVICE_BUNDLED' THEN
        RAISE EXCEPTION 'A lot is of a K4 plan whose license is not bundled with the machine'
            USING ERRCODE = '23514', CONSTRAINT = 'license_lots_plan_k4';
    END IF;
    IF NEW."workspace_id" IS NULL THEN
        IF plan_console THEN
            RAISE EXCEPTION 'A lot of a plan with an admin console is in a workspace'
                USING ERRCODE = '23514', CONSTRAINT = 'license_lots_workspace_required';
        END IF;
    ELSE
        SELECT w."vendor_id" INTO workspace_vendor FROM "workspaces" w WHERE w."id" = NEW."workspace_id";
        IF workspace_vendor IS DISTINCT FROM plan_vendor THEN
            RAISE EXCEPTION 'The workspace of a lot is of the vendor of its plan'
                USING ERRCODE = '23514', CONSTRAINT = 'license_lots_workspace_vendor';
        END IF;
    END IF;
    IF (NEW."purpose" = 'REQUEST' AND plan_binding IS DISTINCT FROM 'ACCOUNT')
       OR (NEW."purpose" = 'STOCK' AND plan_binding IS DISTINCT FROM 'DEVICE_KEY') THEN
        RAISE EXCEPTION 'The purpose of a lot fits the binding of its plan'
            USING ERRCODE = '23514', CONSTRAINT = 'license_lots_purpose_binding';
    END IF;
    IF NEW."contract_id" IS NOT NULL THEN
        SELECT c."vendor_id" INTO contract_vendor FROM "contracts" c WHERE c."id" = NEW."contract_id";
        IF contract_vendor IS DISTINCT FROM plan_vendor THEN
            RAISE EXCEPTION 'The contract of a lot is of the vendor of its plan'
                USING ERRCODE = '23514', CONSTRAINT = 'license_lots_contract_vendor';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "license_lots_guard" BEFORE INSERT OR UPDATE OF "plan_id", "workspace_id", "purpose", "contract_id" ON "license_lots"
    FOR EACH ROW EXECUTE FUNCTION "license_lots_guard"();

-- What a lot is for and where it came from do not change after it is written.
CREATE FUNCTION "license_lots_fixed"() RETURNS trigger AS $$
BEGIN
    IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
       OR NEW."plan_id" IS DISTINCT FROM OLD."plan_id"
       OR NEW."purpose" IS DISTINCT FROM OLD."purpose"
       OR NEW."request_id" IS DISTINCT FROM OLD."request_id"
       OR NEW."legacy_subscription_id" IS DISTINCT FROM OLD."legacy_subscription_id"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'The plan, the purpose and the origin of a lot never change'
            USING ERRCODE = '55000', CONSTRAINT = 'license_lots_fixed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "license_lots_fixed" BEFORE UPDATE ON "license_lots"
    FOR EACH ROW EXECUTE FUNCTION "license_lots_fixed"();

-- A charge is written once.
CREATE FUNCTION "license_lot_charges_immutable"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'a charge of a lot is never changed or deleted'
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'license_lot_charges_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "license_lot_charges_immutable" BEFORE UPDATE OR DELETE ON "license_lot_charges"
    FOR EACH ROW EXECUTE FUNCTION "license_lot_charges_immutable"();

-- A key entered against the subscription a lot was born from is of that lot: the routes of wave 2 still name the subscription, and the capacity of the
-- lot, the activations and the guard of the keys all read the lot.
CREATE FUNCTION "license_keys_take_lot"() RETURNS trigger AS $$
BEGIN
    IF NEW."license_lot_id" IS NULL AND NEW."subscription_id" IS NOT NULL THEN
        SELECT l."id" INTO NEW."license_lot_id" FROM "license_lots" l WHERE l."legacy_subscription_id" = NEW."subscription_id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "license_keys_take_lot" BEFORE INSERT ON "license_keys"
    FOR EACH ROW EXECUTE FUNCTION "license_keys_take_lot"();

-- A key given to a person takes a license of its lot: the licenses taken never pass the licenses bought. Read after the row of the lot is locked
-- (tier 6a), so under READ COMMITTED only.
CREATE FUNCTION "license_lots_check_capacity"() RETURNS trigger AS $$
DECLARE
    licenses INTEGER;
BEGIN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'The licenses of a lot are counted under READ COMMITTED only'
            USING ERRCODE = '55000', CONSTRAINT = 'license_lots_capacity_isolation';
    END IF;
    SELECT l."license_count" INTO licenses FROM "license_lots" l WHERE l."id" = NEW."license_lot_id" FOR UPDATE;
    IF device_activation_occupied(NEW."license_lot_id") > licenses THEN
        RAISE EXCEPTION 'The licenses of the lot are all taken'
            USING ERRCODE = '23514', CONSTRAINT = 'license_lots_capacity';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "license_lots_capacity" AFTER UPDATE OF "status" ON "license_keys"
    FOR EACH ROW WHEN (NEW."status" = 'ASSIGNED' AND OLD."status" IS DISTINCT FROM 'ASSIGNED' AND NEW."license_lot_id" IS NOT NULL)
    EXECUTE FUNCTION "license_lots_check_capacity"();

-- A purchase invoice is of a request, of a subscription or of a lot; the lot is there exactly when it is of a lot (N2).
ALTER TABLE "purchase_invoices" DROP CONSTRAINT "purchase_invoices_link_check";
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_link_check" CHECK (
    ("link_kind" = 'REQUEST' AND "request_id" IS NOT NULL AND "subscription_id" IS NULL AND "license_lot_id" IS NULL)
    OR ("link_kind" = 'SUBSCRIPTION' AND "subscription_id" IS NOT NULL AND "request_id" IS NULL AND "provisioning_task_id" IS NULL AND "license_lot_id" IS NULL)
    OR ("link_kind" = 'LICENSE_LOT' AND "license_lot_id" IS NOT NULL AND "subscription_id" IS NULL)
);

-- What a purchase invoice says never changes: the function of migration 20261203000100 with the lot added.
CREATE OR REPLACE FUNCTION purchase_invoices_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'purchase_invoices is never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."state" <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'a signed or returned purchase invoice is never changed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW."id", NEW."organization_id", NEW."link_kind", NEW."request_id", NEW."provisioning_task_id", NEW."subscription_id", NEW."vendor_id",
      NEW."number", NEW."issued_on", NEW."service_month", NEW."label", NEW."period_index", NEW."period_count", NEW."quantity",
      NEW."unit_price_original_minor", NEW."unit_price_original_currency", NEW."net_minor", NEW."deductible_tax_minor",
      NEW."non_deductible_tax_minor", NEW."match_result", NEW."payment_source", NEW."flags", NEW."charged_cost_center_id",
      NEW."submitted_by_employee_id", NEW."submitted_at", NEW."resubmission_of_id",
      NEW."expected_quantity", NEW."expected_unit_price_original_minor", NEW."expected_unit_price_original_currency",
      NEW."seat_purchase_id", NEW."subscription_line_ids", NEW."license_lot_id")
     IS DISTINCT FROM
     (OLD."id", OLD."organization_id", OLD."link_kind", OLD."request_id", OLD."provisioning_task_id", OLD."subscription_id", OLD."vendor_id",
      OLD."number", OLD."issued_on", OLD."service_month", OLD."label", OLD."period_index", OLD."period_count", OLD."quantity",
      OLD."unit_price_original_minor", OLD."unit_price_original_currency", OLD."net_minor", OLD."deductible_tax_minor",
      OLD."non_deductible_tax_minor", OLD."match_result", OLD."payment_source", OLD."flags", OLD."charged_cost_center_id",
      OLD."submitted_by_employee_id", OLD."submitted_at", OLD."resubmission_of_id",
      OLD."expected_quantity", OLD."expected_unit_price_original_minor", OLD."expected_unit_price_original_currency",
      OLD."seat_purchase_id", OLD."subscription_line_ids", OLD."license_lot_id") THEN
    RAISE EXCEPTION 'what a purchase invoice says never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
