-- The K4 key pool (qd103-k4-key-pool, BR-MF1-09, QĐ-103d, QĐ-103v, Q-10 B). A key has two states: in the store (free) or assigned to
-- exactly one assignment. Withdrawing a key from the store is an act with a reason, not a third state: the key stays IN_STORE, is
-- never counted or given out again, and the withdrawal is fixed once made. RETIRED is gone.

ALTER TABLE "license_keys"
    ADD COLUMN "assignment_id" UUID,
    ADD COLUMN "withdrawn_at" TIMESTAMPTZ(3),
    ADD COLUMN "withdrawn_by_app_user_id" UUID,
    ADD COLUMN "withdrawal_reason" TEXT;

-- Data. Nothing in the application assigned or retired a key before this migration, so such rows can only have been written by hand.
-- A RETIRED key may not be given out: it becomes a withdrawn one. An ASSIGNED key names no assignment, so nobody can tell whom it went
-- to: it is withdrawn too rather than handed out a second time. Both stay in the list with the reason below.
DO $$
DECLARE
    retired integer;
    assigned integer;
BEGIN
    UPDATE "license_keys"
       SET "status" = 'IN_STORE', "withdrawn_at" = now(), "withdrawal_reason" = 'RETIRED before the key pool (QĐ-103v, L3-21)'
     WHERE "status" = 'RETIRED';
    GET DIAGNOSTICS retired = ROW_COUNT;
    UPDATE "license_keys"
       SET "status" = 'IN_STORE', "withdrawn_at" = now(),
           "withdrawal_reason" = 'ASSIGNED before the key pool with no assignment recorded (QĐ-103d)'
     WHERE "status" = 'ASSIGNED';
    GET DIAGNOSTICS assigned = ROW_COUNT;
    IF retired + assigned > 0 THEN
        RAISE NOTICE 'k4_key_pool: % RETIRED and % ASSIGNED license keys were withdrawn from the store', retired, assigned;
    END IF;
END;
$$;

-- Two states only. The column is cast through text: every row is IN_STORE now.
ALTER TABLE "license_keys" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "LicenseKeyStatus" RENAME TO "LicenseKeyStatus_old";
CREATE TYPE "LicenseKeyStatus" AS ENUM ('IN_STORE', 'ASSIGNED');
ALTER TABLE "license_keys" ALTER COLUMN "status" TYPE "LicenseKeyStatus" USING ("status"::text::"LicenseKeyStatus");
ALTER TABLE "license_keys" ALTER COLUMN "status" SET DEFAULT 'IN_STORE';
DROP TYPE "LicenseKeyStatus_old";

ALTER TABLE "license_keys"
    -- An assigned key is given to one assignment, a key in the store to none.
    ADD CONSTRAINT "license_keys_assigned_has_assignment" CHECK (("status" = 'ASSIGNED') = ("assignment_id" IS NOT NULL)),
    -- A withdrawn key stays in the store and is never assigned.
    ADD CONSTRAINT "license_keys_withdrawn_in_store" CHECK ("withdrawn_at" IS NULL OR "status" = 'IN_STORE'),
    -- A withdrawal always has its reason (1 to 500 characters, not blank), and a reason comes only with a withdrawal.
    ADD CONSTRAINT "license_keys_withdrawal_reason" CHECK (
        ("withdrawn_at" IS NULL) = ("withdrawal_reason" IS NULL)
        AND ("withdrawal_reason" IS NULL OR (btrim("withdrawal_reason") <> '' AND char_length("withdrawal_reason") <= 500))
    ),
    ADD CONSTRAINT "license_keys_withdrawn_by_only_when_withdrawn" CHECK (
        "withdrawn_by_app_user_id" IS NULL OR "withdrawn_at" IS NOT NULL
    );

-- One key per assignment.
CREATE UNIQUE INDEX "license_keys_assignment_id_key" ON "license_keys"("assignment_id");

ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The guard of the vault, extended: a key is never deleted and only its status, its assignment and its withdrawal move; a key goes
-- between the store and one assignment of its own purchase, never straight from one assignment to another; a withdrawal, once made,
-- is fixed and the key stays out of use.
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
        OR NEW."imported_at" IS DISTINCT FROM OLD."imported_at" THEN
        RAISE EXCEPTION 'Only the status of a license key changes'
            USING ERRCODE = '55000', CONSTRAINT = 'license_key_columns_fixed';
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
