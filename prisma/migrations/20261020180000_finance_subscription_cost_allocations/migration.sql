-- The cost allocation of a subscription (g3-shared-cost-allocation, US-04-08, INV-03): Finance spreads the cost of a
-- subscription that is not billed per seat over Cost Centers, in ratios that add up to exactly 100%. Every declaration
-- is a version that is never changed or deleted; the head row says which version is current. The ratio is a whole
-- number of hundredths of a percent (6000 is 60%): no float, and no money column, because the cost it divides is the
-- expense's to hold. The subscription is a catalog table and the Cost Center an organization table: foreign keys only.

-- CreateTable
CREATE TABLE "subscription_cost_allocations" (
    "subscription_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_cost_allocations_pkey" PRIMARY KEY ("subscription_id"),
    CONSTRAINT "subscription_cost_allocations_current_version_range" CHECK ("current_version" >= 0)
);

CREATE TABLE "subscription_cost_allocation_versions" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    -- A value, not a foreign key: the history outlives the account (as the audit trail does).
    "declared_by_app_user_id" UUID NOT NULL,
    "declared_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_cost_allocation_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_cost_allocation_versions_version_positive" CHECK ("version" >= 1)
);

CREATE TABLE "subscription_cost_allocation_lines" (
    "version_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "cost_center_id" UUID NOT NULL,
    -- The share in hundredths of a percent: 6000 is 60%. A line of nothing is no line.
    "ratio_bp" INTEGER NOT NULL,

    CONSTRAINT "subscription_cost_allocation_lines_pkey" PRIMARY KEY ("version_id", "position"),
    CONSTRAINT "subscription_cost_allocation_lines_position_range" CHECK ("position" BETWEEN 1 AND 20),
    CONSTRAINT "subscription_cost_allocation_lines_ratio_range" CHECK ("ratio_bp" BETWEEN 1 AND 10000)
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_cost_allocation_versions_subscription_id_versi_key"
    ON "subscription_cost_allocation_versions"("subscription_id", "version");
CREATE UNIQUE INDEX "subscription_cost_allocation_lines_version_id_cost_center_i_key"
    ON "subscription_cost_allocation_lines"("version_id", "cost_center_id");
CREATE INDEX "subscription_cost_allocation_lines_cost_center_id_idx"
    ON "subscription_cost_allocation_lines"("cost_center_id");

-- AddForeignKey
ALTER TABLE "subscription_cost_allocations" ADD CONSTRAINT "subscription_cost_allocations_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_cost_allocations" ADD CONSTRAINT "subscription_cost_allocations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_cost_allocation_versions" ADD CONSTRAINT "subscription_cost_allocation_versions_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscription_cost_allocations"("subscription_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_cost_allocation_lines" ADD CONSTRAINT "subscription_cost_allocation_lines_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "subscription_cost_allocation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_cost_allocation_lines" ADD CONSTRAINT "subscription_cost_allocation_lines_cost_center_id_fkey"
    FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A recorded version and its lines are history that the reports will read: no writer changes or deletes them (the head
-- is the only row that moves).
CREATE FUNCTION "subscription_cost_allocation_reject_change"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'A recorded cost allocation version is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = 'subscription_cost_allocation_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscription_cost_allocation_versions_immutable"
    BEFORE UPDATE OR DELETE ON "subscription_cost_allocation_versions"
    FOR EACH ROW EXECUTE FUNCTION "subscription_cost_allocation_reject_change"();

CREATE TRIGGER "subscription_cost_allocation_lines_immutable"
    BEFORE UPDATE OR DELETE ON "subscription_cost_allocation_lines"
    FOR EACH ROW EXECUTE FUNCTION "subscription_cost_allocation_reject_change"();

-- INV-03: the ratios of a version add up to exactly 100% (10 000). The lines arrive after the version, so the sum is
-- checked when the transaction commits, for every line and for the version itself (a version without a line adds up to
-- nothing). A writer other than the application cannot store a version that does not add up.
CREATE FUNCTION "subscription_cost_allocation_check_total"() RETURNS trigger AS $$
DECLARE
    target UUID;
    total BIGINT;
BEGIN
    IF TG_TABLE_NAME = 'subscription_cost_allocation_versions' THEN
        target := NEW."id";
    ELSE
        target := NEW."version_id";
    END IF;

    SELECT COALESCE(SUM("ratio_bp"), 0) INTO total
      FROM "subscription_cost_allocation_lines" WHERE "version_id" = target;
    IF total <> 10000 THEN
        RAISE EXCEPTION 'The ratios of a cost allocation add up to % hundredths of a percent, not 10000', total
            USING ERRCODE = '23514', CONSTRAINT = 'subscription_cost_allocation_total_100';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "subscription_cost_allocation_lines_total"
    AFTER INSERT ON "subscription_cost_allocation_lines"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "subscription_cost_allocation_check_total"();

CREATE CONSTRAINT TRIGGER "subscription_cost_allocation_versions_total"
    AFTER INSERT ON "subscription_cost_allocation_versions"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "subscription_cost_allocation_check_total"();
