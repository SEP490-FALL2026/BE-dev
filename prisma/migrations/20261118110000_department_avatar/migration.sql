-- QĐ-113c: the picture of a department. Expand only: three nullable columns (every department stands as it was: no picture); nothing is dropped
-- or rewritten. The three are set together or none is, like the picture of a person (app_users_avatar_complete).
ALTER TABLE "departments"
  ADD COLUMN IF NOT EXISTS "avatar_object_key" TEXT,
  ADD COLUMN IF NOT EXISTS "avatar_content_type" TEXT,
  ADD COLUMN IF NOT EXISTS "avatar_updated_at" TIMESTAMPTZ(3);

ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_avatar_complete";
ALTER TABLE "departments" ADD CONSTRAINT "departments_avatar_complete" CHECK (
  ("avatar_object_key" IS NULL) = ("avatar_content_type" IS NULL) AND ("avatar_object_key" IS NULL) = ("avatar_updated_at" IS NULL)
);
