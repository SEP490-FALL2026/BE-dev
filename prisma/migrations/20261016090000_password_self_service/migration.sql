-- Slice 1c: forgot, reset and change password (US-01-10 AC-3 -> AC-7, AC-12).
-- The new enum values are not used by this migration; code that writes them ships after it.

-- AlterEnum
ALTER TYPE "AccountActionPurpose" ADD VALUE 'RESET_PASSWORD';

-- AlterEnum
ALTER TYPE "AccountActionTokenRevokedReason" ADD VALUE 'CREDENTIAL_CHANGED';

-- AlterEnum
ALTER TYPE "SessionRevokedReason" ADD VALUE 'PASSWORD_CHANGED';
ALTER TYPE "SessionRevokedReason" ADD VALUE 'PASSWORD_RESET';

-- A notice that carries no link (password changed) has no action token. PostgreSQL lets any
-- number of NULLs share a unique index, so the existing unique index keeps real hashes unique.
ALTER TABLE "email_outbox" ALTER COLUMN "action_token_hash" DROP NOT NULL;

-- Counts the reset tokens of one account in the last hour (T-2).
CREATE INDEX "account_action_tokens_app_user_id_purpose_created_at_idx"
  ON "account_action_tokens"("app_user_id", "purpose", "created_at");
