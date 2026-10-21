-- The vault of the license keys of K4 purchases (g3-license-key-vault, US-04-12 AC-1→AC-4, AC-9→AC-12, QĐ-54b). A key is
-- kept only as ciphertext; the fingerprint (HMAC of the key with a stable secret) finds a key imported twice and tells
-- nothing of it. Keys are never deleted and nothing but their status moves: assigning and retiring a key belong to the
-- device-dependent work, which finds the status values here already.

-- CreateEnum
CREATE TYPE "LicenseKeyStatus" AS ENUM ('IN_STORE', 'ASSIGNED', 'RETIRED');

-- CreateTable
CREATE TABLE "license_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "masked" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "cipher_key_id" TEXT NOT NULL,
    "status" "LicenseKeyStatus" NOT NULL DEFAULT 'IN_STORE',
    "imported_by_app_user_id" UUID NOT NULL,
    "imported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_keys_pkey" PRIMARY KEY ("id"),
    -- An HMAC-SHA256 in hex, never a key that was not hashed.
    CONSTRAINT "license_keys_fingerprint_shape" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "license_keys_masked_shape" CHECK (char_length("masked") BETWEEN 1 AND 16),
    -- iv (12) + auth tag (16) + at least one byte of key: a shorter value cannot be a sealed key.
    CONSTRAINT "license_keys_ciphertext_length" CHECK (octet_length("ciphertext") >= 29),
    CONSTRAINT "license_keys_cipher_key_id_shape" CHECK ("cipher_key_id" ~ '^[A-Za-z0-9._-]{1,32}$')
);

-- CreateIndex
CREATE UNIQUE INDEX "license_keys_organization_id_fingerprint_key" ON "license_keys"("organization_id", "fingerprint");
CREATE INDEX "license_keys_subscription_id_status_idx" ON "license_keys"("subscription_id", "status");

-- AddForeignKey
ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A key is never deleted, and only its status moves. The ciphertext may be sealed again, and then the key id may follow
-- it; a key id relabelled with no new ciphertext would leave a key that cannot be opened.
CREATE FUNCTION "license_key_guard"() RETURNS trigger AS $$
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "license_keys_guard"
    BEFORE UPDATE OR DELETE ON "license_keys"
    FOR EACH ROW EXECUTE FUNCTION "license_key_guard"();
