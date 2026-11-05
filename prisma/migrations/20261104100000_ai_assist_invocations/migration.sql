-- The records of the AI summary of the approval queue (US-15-05): one row for each call made on behalf of one person, and, apart,
-- what was said to the model and what came back. The person and the organization are values with no foreign key (the record of a
-- call outlives the account, as `in_app_notifications` does).

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('ACCESS_REQUEST_QUEUE_SUMMARY');

-- CreateEnum
CREATE TYPE "AiInvocationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'NO_VALID_OUTPUT', 'STALE', 'FAILED');

-- CreateTable
CREATE TABLE "ai_invocations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "actor_app_user_id" UUID NOT NULL,
    "actor_employee_id" UUID NOT NULL,
    "status" "AiInvocationStatus" NOT NULL,
    "source_revision" TEXT NOT NULL,
    "config_hash" TEXT,
    "model_id" TEXT,
    "model_revision" TEXT,
    "prompt_version" TEXT,
    "schema_version" TEXT,
    "latency_ms" INTEGER,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_invocations_pkey" PRIMARY KEY ("id"),
    -- A call in a final state says when it ended.
    CONSTRAINT "ai_invocations_final_state_finished_at_check" CHECK (
      "status" NOT IN ('COMPLETED', 'NO_VALID_OUTPUT', 'STALE', 'FAILED') OR "finished_at" IS NOT NULL
    )
);

-- CreateTable
CREATE TABLE "ai_invocation_contents" (
    "invocation_id" UUID NOT NULL,
    "context" JSONB NOT NULL,
    "prompt_text" TEXT,
    "raw_response" TEXT,
    "parsed" JSONB,
    "result" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_invocation_contents_pkey" PRIMARY KEY ("invocation_id")
);

-- AddForeignKey
ALTER TABLE "ai_invocation_contents" ADD CONSTRAINT "ai_invocation_contents_invocation_id_fkey" FOREIGN KEY ("invocation_id") REFERENCES "ai_invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Asking again for the same queue revision gives back the call that is already live or already answered (the same request twice
-- is not two calls to the model); a call that failed, found nothing valid or went stale does not hold the place.
CREATE UNIQUE INDEX "ai_invocations_active_per_revision" ON "ai_invocations"("organization_id", "actor_app_user_id", "feature", "source_revision")
  WHERE "status" IN ('PENDING', 'RUNNING', 'COMPLETED');
