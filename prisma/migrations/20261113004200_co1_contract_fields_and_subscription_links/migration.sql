-- CO-1.1 (QĐ-111t, US-04-13): a contract with a vendor, a number, the days it is in effect and a note, and the link of a subscription of a
-- shared stock (K2 or K4) to the contract it rests on. Until now a contract was a name that never changed, so what was written of it could not
-- be corrected and nothing hung on it.
--
-- Expand only: seven columns that may be empty (the rows made when a contract was only a name keep none of them and read as incomplete), one
-- table, and the guard of the contract replaced by one that lets those fields change while who made the contract, where and when still never
-- change and no contract is ever deleted. Nothing is dropped from a table and no row is changed except `updated_at`, which starts at the day the
-- contract was made. There is no column for a kind of contract (QĐ-111t removes the box). Safe to run twice: every step checks first.

-- The guard of a contract. It replaces `contracts_immutable` (which refused every change) by what is still true: a contract is never deleted and
-- its origin never changes; and the vendor of a contract that has subscriptions linked does not change (the application says so first; this
-- is the last word when two requests meet).
CREATE OR REPLACE FUNCTION "contract_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A contract is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'contracts_never_deleted';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."created_by_app_user_id", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."created_by_app_user_id", OLD."created_at") THEN
        RAISE EXCEPTION 'Who made a contract, where and when never change'
            USING ERRCODE = '55000', CONSTRAINT = 'contracts_origin_kept';
    END IF;

    IF NEW."vendor_id" IS DISTINCT FROM OLD."vendor_id"
       AND EXISTS (SELECT 1 FROM "contract_subscriptions" l WHERE l."contract_id" = OLD."id") THEN
        RAISE EXCEPTION 'The vendor of a contract with subscriptions linked does not change'
            USING ERRCODE = '55000', CONSTRAINT = 'contracts_vendor_locked';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The links, before the guard that reads them.
CREATE TABLE IF NOT EXISTS "contract_subscriptions" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    -- A value, not a foreign key: the record outlives the account (as the audit trail does).
    "linked_by_app_user_id" UUID NOT NULL,
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_subscriptions_pkey" PRIMARY KEY ("id")
);

-- A subscription has at most one contract.
CREATE UNIQUE INDEX IF NOT EXISTS "contract_subscriptions_subscription_id_key" ON "contract_subscriptions"("subscription_id");
CREATE INDEX IF NOT EXISTS "contract_subscriptions_contract_id_linked_at_idx" ON "contract_subscriptions"("contract_id", "linked_at");

ALTER TABLE "contract_subscriptions" DROP CONSTRAINT IF EXISTS "contract_subscriptions_contract_id_fkey";
ALTER TABLE "contract_subscriptions" ADD CONSTRAINT "contract_subscriptions_contract_id_fkey"
    FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_subscriptions" DROP CONSTRAINT IF EXISTS "contract_subscriptions_subscription_id_fkey";
ALTER TABLE "contract_subscriptions" ADD CONSTRAINT "contract_subscriptions_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only a subscription of a shared stock (K2 or K4) rests on a contract, and the contract and the subscription have the same vendor (the
-- application of the plan). A contract with no vendor (an old one, a name only) takes none until the IT Admin gives it one.
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

    IF plan_type IS NULL OR plan_type NOT IN ('K2', 'K4') THEN
        RAISE EXCEPTION 'Only a subscription of a shared stock (K2 or K4) rests on a contract'
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

DROP TRIGGER IF EXISTS "contract_subscriptions_check" ON "contract_subscriptions";
CREATE TRIGGER "contract_subscriptions_check"
    BEFORE INSERT ON "contract_subscriptions"
    FOR EACH ROW EXECUTE FUNCTION "contract_subscription_check"();

ALTER TABLE "contracts"
    ADD COLUMN IF NOT EXISTS "vendor_id" UUID,
    ADD COLUMN IF NOT EXISTS "number" TEXT,
    ADD COLUMN IF NOT EXISTS "number_key" TEXT,
    ADD COLUMN IF NOT EXISTS "effective_from" DATE,
    ADD COLUMN IF NOT EXISTS "effective_to" DATE,
    ADD COLUMN IF NOT EXISTS "note" TEXT;

-- The contract is no longer a record that never changes: the guard above takes the place of the one that refused every change. It is put in
-- place after the one write of this migration (`updated_at` below), which it would refuse for the vendor column it reads not being there yet.
DROP TRIGGER IF EXISTS "contracts_immutable" ON "contracts";
DROP TRIGGER IF EXISTS "contracts_guard" ON "contracts";

-- `updated_at` starts, for the contracts that exist, at the day each was made: the one write of this migration, and only when the column is new.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'contracts' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE "contracts" ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
        UPDATE "contracts" SET "updated_at" = "created_at";
    END IF;
END
$$;

CREATE TRIGGER "contracts_guard"
    BEFORE UPDATE OR DELETE ON "contracts"
    FOR EACH ROW EXECUTE FUNCTION "contract_guard"();
DROP FUNCTION IF EXISTS "contract_reject_change"();

ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_vendor_id_fkey";
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The number is optional and kept both as written and as `searchKey` reads it, and the key is what is unique in the organization.
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_number_given";
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_number_given" CHECK (
    ("number" IS NULL AND "number_key" IS NULL)
    OR ("number" IS NOT NULL AND "number_key" IS NOT NULL AND length(btrim("number")) BETWEEN 1 AND 100 AND length("number_key") > 0)
);
-- A day to which a contract is in effect needs the day from which, and is not before it. An empty "to" is a contract that never ends.
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_effective_range";
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_effective_range" CHECK (
    "effective_to" IS NULL OR ("effective_from" IS NOT NULL AND "effective_to" >= "effective_from")
);
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_note_bounded";
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_note_bounded" CHECK (
    "note" IS NULL OR (length(btrim("note")) > 0 AND length("note") <= 2000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "contracts_organization_id_number_key_key" ON "contracts"("organization_id", "number_key");
CREATE INDEX IF NOT EXISTS "contracts_vendor_id_idx" ON "contracts"("vendor_id");
