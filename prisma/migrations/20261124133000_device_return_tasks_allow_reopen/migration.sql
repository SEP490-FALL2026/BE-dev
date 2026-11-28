-- Allow multiple device_return_tasks per registration over time (e.g. cancelled offboarding followed by a new
-- departure case), while preserving the partial unique index `device_return_tasks_one_open` on (device_id) WHERE state = 'OPEN'.
DROP INDEX "device_return_tasks_registration_id_key";
CREATE INDEX "device_return_tasks_registration_id_idx" ON "device_return_tasks"("registration_id");
