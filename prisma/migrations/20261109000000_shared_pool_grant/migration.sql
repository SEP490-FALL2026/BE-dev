-- gói 9 MF1-F: cấp từ kho dùng chung, mua thêm khi hết kho (Task 1)
-- - Bỏ NOT NULL từ subscriptions.owner_department_id
-- - Drop trigger guard phòng sở hữu của assignment
-- - Sửa trigger chuỗi kỳ: bỏ điều kiện owner_department_id
-- - Thêm enum + cột mua ở provisioning_tasks
-- - Tạo bảng pool_grant_avoided_costs (append-only)

-- 1. Đổi chuỗi kỳ: bỏ điều kiện owner_department_id
DROP TRIGGER "subscriptions_renewal_chain" ON "subscriptions";
DROP FUNCTION "subscriptions_renewal_chain"();

CREATE FUNCTION "subscriptions_renewal_chain"() RETURNS trigger AS $$
DECLARE
    previous RECORD;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW."renewed_from_id" IS DISTINCT FROM OLD."renewed_from_id" THEN
            RAISE EXCEPTION 'The period a subscription continues is set when it is made and never moved'
                USING ERRCODE = '55000', CONSTRAINT = 'subscriptions_renewed_from_is_final';
        END IF;

        RETURN NEW;
    END IF;

    IF NEW."renewed_from_id" IS NULL THEN
        RETURN NEW;
    END IF;

    -- Locked, so two renewals of one period meet here one after the other (the unique index refuses the second).
    SELECT s."organization_id", s."plan_id", s."kind", s."start_date"
      INTO previous
      FROM "subscriptions" s
     WHERE s."id" = NEW."renewed_from_id"
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF previous."kind" <> 'TERM' OR NEW."kind" <> 'TERM'
       OR previous."organization_id" <> NEW."organization_id"
       OR previous."plan_id" <> NEW."plan_id" THEN
        RAISE EXCEPTION 'A renewed period is a term of the same plan'
            USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_renewal_same_line';
    END IF;

    IF NEW."start_date" IS NULL OR previous."start_date" IS NULL OR NEW."start_date" <= previous."start_date" THEN
        RAISE EXCEPTION 'A renewed period starts after the period it continues'
            USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_renewal_starts_later';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscriptions_renewal_chain"
    BEFORE INSERT OR UPDATE OF "renewed_from_id" ON "subscriptions"
    FOR EACH ROW EXECUTE FUNCTION "subscriptions_renewal_chain"();

-- 2. Gỡ guard phòng sở hữu của assignment
DROP TRIGGER license_assignments_owner_department_guard ON "license_assignments";
DROP FUNCTION license_assignments_owner_department_guard();

-- 3. Bỏ NOT NULL từ owner_department_id
ALTER TABLE "subscriptions" ALTER COLUMN "owner_department_id" DROP NOT NULL;

-- 4. Enum mua thêm ở provisioning_tasks
CREATE TYPE "ProvisioningPurchaseKind" AS ENUM ('POOL_TOP_UP', 'KEY_PURCHASE', 'K1_SUBSCRIPTION');

-- 5. Cột mua thêm ở provisioning_tasks
ALTER TABLE "provisioning_tasks" ADD COLUMN "purchase_kind" "ProvisioningPurchaseKind";
ALTER TABLE "provisioning_tasks" ADD COLUMN "purchase_reason" text;
ALTER TABLE "provisioning_tasks" ADD COLUMN "purchased_at" timestamptz;

-- Check: purchase_kind và purchased_at phải cùng có hoặc cùng NULL
ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_purchase_datetime" CHECK (
    ("purchase_kind" IS NULL) = ("purchased_at" IS NULL)
);

-- Check: chỉ task GRANT được mua
ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_purchase_kind" CHECK (
    "purchase_kind" IS NULL OR "kind" = 'GRANT'
);

-- 6. Bảng tránh được (append-only, trigger chặn UPDATE/DELETE)
CREATE TABLE "pool_grant_avoided_costs" (
    "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL,
    "provisioning_task_id" uuid NOT NULL,
    "assignment_id" uuid NOT NULL,
    "request_id" uuid NOT NULL,
    "plan_id" uuid NOT NULL,
    "provisioning_type" text NOT NULL CHECK ("provisioning_type" IN ('K2', 'K4')),
    "months" smallint CHECK ("months" IS NULL OR ("months" >= 1 AND "months" <= 12)),
    "unit_minor" bigint NOT NULL CHECK ("unit_minor" >= 0),
    "amount_minor" bigint NOT NULL,
    "currency" char(3) NOT NULL,
    "recorded_on" date NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    UNIQUE("provisioning_task_id"),
    CONSTRAINT "pool_grant_avoided_costs_amount" CHECK (
        "amount_minor" = "unit_minor" * COALESCE("months", 1)
    ),
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
    FOREIGN KEY ("provisioning_task_id") REFERENCES "provisioning_tasks"("id") ON DELETE RESTRICT,
    FOREIGN KEY ("assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT,
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT
);

CREATE INDEX "pool_grant_avoided_costs_organization_id" ON "pool_grant_avoided_costs"("organization_id");
CREATE INDEX "pool_grant_avoided_costs_assignment_id" ON "pool_grant_avoided_costs"("assignment_id");
CREATE INDEX "pool_grant_avoided_costs_request_id" ON "pool_grant_avoided_costs"("request_id");
CREATE INDEX "pool_grant_avoided_costs_recorded_on" ON "pool_grant_avoided_costs"("recorded_on");

-- Trigger: chặn UPDATE/DELETE trên pool_grant_avoided_costs (append-only)
CREATE FUNCTION "pool_grant_avoided_costs_immutable"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'pool_grant_avoided_costs_immutable: records are append-only'
        USING ERRCODE = '23514', CONSTRAINT = 'pool_grant_avoided_costs_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "pool_grant_avoided_costs_immutable"
    BEFORE UPDATE OR DELETE ON "pool_grant_avoided_costs"
    FOR EACH ROW EXECUTE FUNCTION "pool_grant_avoided_costs_immutable"();
