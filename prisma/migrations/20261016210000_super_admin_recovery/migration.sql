-- Slice G1 (US-01-09 AC-9 → AC-14): the Super Admin is recovered by an approved ticket run by an operator outside the
-- application. A ticket is run at most once to completion: its reference is the key that makes a second run a no-op.

-- A login email confirmed by opening a recovery link (AC-10).
ALTER TYPE "EmailVerificationSource" ADD VALUE IF NOT EXISTS 'RECOVERY_VERIFIED';

-- CreateEnum
CREATE TYPE "RecoveryMode" AS ENUM ('RESET_CREDENTIALS', 'UNLOCK', 'TRANSFER_ROLE');
CREATE TYPE "RecoveryStatus" AS ENUM ('PENDING', 'AWAITING_ACTIVATION', 'COMPLETED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "recovery_tickets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_ref" TEXT NOT NULL,
    "mode" "RecoveryMode" NOT NULL,
    "status" "RecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "target_app_user_id" UUID,
    "successor_employee_id" UUID,
    "recipient_email" TEXT,
    "new_login_email" TEXT,
    "approver_ref" TEXT NOT NULL,
    "operator_ref" TEXT NOT NULL,
    "identity_check_ref" TEXT,
    "environment" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "recovery_tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recovery_tickets_organization_id_ticket_ref_key" ON "recovery_tickets"("organization_id", "ticket_ref");
CREATE INDEX "recovery_tickets_target_app_user_id_idx" ON "recovery_tickets"("target_app_user_id");

ALTER TABLE "recovery_tickets"
  ADD CONSTRAINT "recovery_tickets_environment_check" CHECK ("environment" IN ('LOCAL_TEST', 'SHARED')),
  -- A ticket is completed exactly when it has the moment it completed.
  ADD CONSTRAINT "recovery_tickets_completion_consistent" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL));

-- The link a ticket sent, and the login email it moves the account to once the link is opened.
ALTER TABLE "account_action_tokens"
  ADD COLUMN "recovery_ticket_id" UUID,
  ADD COLUMN "new_login_email" TEXT,
  ADD COLUMN "new_normalized_login_email" TEXT;

CREATE INDEX "account_action_tokens_recovery_ticket_id_idx" ON "account_action_tokens"("recovery_ticket_id");

ALTER TABLE "account_action_tokens"
  ADD CONSTRAINT "account_action_tokens_recovery_ticket_id_fkey"
  FOREIGN KEY ("recovery_ticket_id") REFERENCES "recovery_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "account_action_tokens_new_email_consistent"
  CHECK (("new_login_email" IS NULL) = ("new_normalized_login_email" IS NULL)),
  ADD CONSTRAINT "account_action_tokens_new_email_only_for_recovery"
  CHECK ("new_login_email" IS NULL OR "recovery_ticket_id" IS NOT NULL);
