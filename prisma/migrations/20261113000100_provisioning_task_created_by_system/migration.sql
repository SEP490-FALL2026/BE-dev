-- A task the system makes on a rule nobody decides in the moment (the revocation when a grace ends, QĐ-110p) has no account behind it:
-- it is marked as made by the system rather than pointing at an account that does not exist (T-10, QĐ-110 mục G). Exactly one of the
-- two says who made a task, so no task is anonymous and none has two makers.
ALTER TABLE "provisioning_tasks" ADD COLUMN "created_by_system" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "provisioning_tasks" ALTER COLUMN "created_by_app_user_id" DROP NOT NULL;
ALTER TABLE "provisioning_tasks"
    ADD CONSTRAINT "provisioning_tasks_creator_check" CHECK (
        ("created_by_system" AND "created_by_app_user_id" IS NULL)
        OR (NOT "created_by_system" AND "created_by_app_user_id" IS NOT NULL)
    );
