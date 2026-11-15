-- BG-1 (QĐ-111z): a budget cycle begins as a draft that Finance edits or deletes freely until it opens it, so `opened_at` and
-- `opened_by_employee_id` may be NULL (NULL = draft). A cycle that exists today was opened: it keeps both. Nothing is dropped:
-- `published_*` and `budget_department_ceilings` are no longer written (QĐ-111aa: the division of the ceiling among departments is gone).
ALTER TABLE "budget_cycles" ALTER COLUMN "opened_at" DROP NOT NULL;
ALTER TABLE "budget_cycles" ALTER COLUMN "opened_by_employee_id" DROP NOT NULL;
ALTER TABLE "budget_cycles" ADD CONSTRAINT "budget_cycles_opened_check" CHECK (("opened_at" IS NULL) = ("opened_by_employee_id" IS NULL));
