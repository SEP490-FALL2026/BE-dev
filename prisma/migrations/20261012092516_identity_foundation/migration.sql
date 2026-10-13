-- CreateEnum
CREATE TYPE "AppUserStatus" AS ENUM ('ACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "ActivationState" AS ENUM ('INVITED', 'ACTIVATED');

-- CreateEnum
CREATE TYPE "EmailVerificationSource" AS ENUM ('BOOTSTRAP_ASSERTED', 'INVITATION_REDEEMED');

-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('SUPER_ADMIN', 'IT_ADMIN', 'FINANCE', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "SessionRevokedReason" AS ENUM ('LOGOUT', 'REPLAY_DETECTED', 'ACCOUNT_LOCKED');

-- CreateTable
CREATE TABLE "app_users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "login_email" TEXT NOT NULL,
    "normalized_login_email" TEXT NOT NULL,
    "status" "AppUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "activation_state" "ActivationState" NOT NULL DEFAULT 'INVITED',
    "email_verification_source" "EmailVerificationSource",
    "email_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_credentials" (
    "app_user_id" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "hash_policy_version" INTEGER NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("app_user_id")
);

-- CreateTable
CREATE TABLE "role_grants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "app_user_id" UUID NOT NULL,
    "role" "AppRole" NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by" UUID,

    CONSTRAINT "role_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "app_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_refreshed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" "SessionRevokedReason",

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "token_hash" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "replaced_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "login_throttles" (
    "organization_id" UUID NOT NULL,
    "email_key_hash" TEXT NOT NULL,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMPTZ(3) NOT NULL,
    "blocked_until" TIMESTAMPTZ(3),

    CONSTRAINT "login_throttles_pkey" PRIMARY KEY ("organization_id","email_key_hash")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_employee_id_key" ON "app_users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_organization_id_normalized_login_email_key" ON "app_users"("organization_id", "normalized_login_email");

-- CreateIndex
CREATE INDEX "role_grants_app_user_id_idx" ON "role_grants"("app_user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_app_user_id_idx" ON "auth_sessions"("app_user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- AddForeignKey
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FR-8.10(a) / I-5: at most one effective SUPER_ADMIN grant per organization, regardless of
-- whether the account is invited, locked or its employee left (FR-8.10(b)).
CREATE UNIQUE INDEX "role_grants_one_super_admin"
  ON "role_grants" ("organization_id")
  WHERE "role" = 'SUPER_ADMIN' AND "revoked_at" IS NULL;

-- I-5: an account holds a given role at most once at a time.
CREATE UNIQUE INDEX "role_grants_one_effective_per_role"
  ON "role_grants" ("app_user_id", "role")
  WHERE "revoked_at" IS NULL;
