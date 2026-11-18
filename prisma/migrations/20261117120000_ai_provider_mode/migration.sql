-- Where the answers of an AI call come from (US-15-05 AC-16, AC-17; QĐ-102f): the AI service or the simulation that calls no model,
-- fixed when the call is made. Hand-written SQL (ADR-0005): Prisma cannot express the partial unique index.

-- CreateEnum
CREATE TYPE "AiProviderMode" AS ENUM ('MODEL', 'SIMULATED');

-- AlterTable: every call made before this migration went to the AI service. The default only fills those rows and is dropped at
-- once, so an insert that does not say its mode is refused instead of silently becoming MODEL.
ALTER TABLE "ai_invocations" ADD COLUMN "provider_mode" "AiProviderMode" NOT NULL DEFAULT 'MODEL';
ALTER TABLE "ai_invocations" ALTER COLUMN "provider_mode" DROP DEFAULT;

-- The call kept for a queue revision is kept per mode: asking again after the Super Admin changed the mode makes a new call
-- instead of giving back the answer of the other source. The condition is the one of the index it replaces.
DROP INDEX "ai_invocations_active_per_revision";
CREATE UNIQUE INDEX "ai_invocations_active_per_revision" ON "ai_invocations"("organization_id", "actor_app_user_id", "feature", "source_revision", "provider_mode")
  WHERE "status" IN ('PENDING', 'RUNNING', 'COMPLETED');
