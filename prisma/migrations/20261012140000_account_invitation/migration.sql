-- CreateEnum
CREATE TYPE "AccountActionPurpose" AS ENUM ('INVITE');

-- CreateEnum
CREATE TYPE "AccountActionTokenRevokedReason" AS ENUM ('SUPERSEDED', 'ACCOUNT_LOCKED');

-- CreateEnum
CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "account_action_tokens" (
    "token_hash" TEXT NOT NULL,
    "app_user_id" UUID NOT NULL,
    "purpose" "AccountActionPurpose" NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" "AccountActionTokenRevokedReason",
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_action_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "recipient" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "action_token_hash" TEXT NOT NULL,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL,
    "lease_id" UUID,
    "lease_expires_at" TIMESTAMPTZ(3),
    "payload_ciphertext" BYTEA,
    "payload_key_id" TEXT,
    "last_error_code" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_action_tokens_app_user_id_idx" ON "account_action_tokens"("app_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_action_token_hash_key" ON "email_outbox"("action_token_hash");

-- CreateIndex
CREATE INDEX "email_outbox_status_next_attempt_at_idx" ON "email_outbox"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "account_action_tokens" ADD CONSTRAINT "account_action_tokens_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most one usable token per account and purpose. "Usable" is stored state only: PostgreSQL
-- requires index predicates to be immutable, so expiry cannot appear here. An expired but
-- unconsumed token keeps its place until it is redeemed, replaced or revoked.
CREATE UNIQUE INDEX "account_action_tokens_one_usable"
  ON "account_action_tokens" ("app_user_id", "purpose")
  WHERE "consumed_at" IS NULL AND "revoked_at" IS NULL;

-- QĐ-52d, QĐ-67e: at most one effective FINANCE grant per organization, whatever the holder's
-- account state. Zero is allowed.
CREATE UNIQUE INDEX "role_grants_one_finance"
  ON "role_grants" ("organization_id")
  WHERE "role" = 'FINANCE' AND "revoked_at" IS NULL;

-- FR-8.7: SUPER_ADMIN is never combined with IT_ADMIN or FINANCE on one account.
CREATE FUNCTION role_grants_forbid_combination() RETURNS trigger AS $$
BEGIN
  IF NEW.revoked_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'SUPER_ADMIN' AND EXISTS (
    SELECT 1 FROM role_grants g
    WHERE g.app_user_id = NEW.app_user_id AND g.id <> NEW.id AND g.revoked_at IS NULL
      AND g.role IN ('IT_ADMIN', 'FINANCE')
  ) THEN
    RAISE EXCEPTION 'forbidden role combination' USING ERRCODE = '23514';
  END IF;

  IF NEW.role IN ('IT_ADMIN', 'FINANCE') AND EXISTS (
    SELECT 1 FROM role_grants g
    WHERE g.app_user_id = NEW.app_user_id AND g.id <> NEW.id AND g.revoked_at IS NULL
      AND g.role = 'SUPER_ADMIN'
  ) THEN
    RAISE EXCEPTION 'forbidden role combination' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER role_grants_forbid_combination
  BEFORE INSERT OR UPDATE OF role, revoked_at ON role_grants
  FOR EACH ROW EXECUTE FUNCTION role_grants_forbid_combination();
