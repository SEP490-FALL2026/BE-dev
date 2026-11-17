-- PF-1.1 (QĐ-111at, QĐ-111av, SPEC FE PF-1): what a person edits on their own account, and the queue of pictures to delete. Expand only: four nullable
-- columns on app_users (every row stands as it was: no picture, no phone) and one new table; nothing is dropped, backfilled or rewritten.

ALTER TABLE "app_users"
  ADD COLUMN IF NOT EXISTS "avatar_object_key" TEXT,
  ADD COLUMN IF NOT EXISTS "avatar_content_type" TEXT,
  ADD COLUMN IF NOT EXISTS "avatar_updated_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "work_phone" TEXT;

-- The three columns of the picture are set together or none is (a key without a type could not be shown), and the phone is the digits of a
-- number with an optional leading plus, the same shape the route accepts (8 to 15 digits).
ALTER TABLE "app_users" DROP CONSTRAINT IF EXISTS "app_users_avatar_complete";
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_avatar_complete" CHECK (
  ("avatar_object_key" IS NULL) = ("avatar_content_type" IS NULL) AND ("avatar_object_key" IS NULL) = ("avatar_updated_at" IS NULL)
);
ALTER TABLE "app_users" DROP CONSTRAINT IF EXISTS "app_users_work_phone_shape";
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_work_phone_shape" CHECK ("work_phone" IS NULL OR "work_phone" ~ '^\+?[0-9]{8,15}$');

-- CreateTable
CREATE TABLE IF NOT EXISTS "avatar_purges" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purged_at" TIMESTAMPTZ(3),

    CONSTRAINT "avatar_purges_pkey" PRIMARY KEY ("id")
);

-- The sweeper reads the ones still to do, oldest first.
CREATE INDEX IF NOT EXISTS "avatar_purges_pending_idx" ON "avatar_purges" ("requested_at") WHERE "purged_at" IS NULL;
