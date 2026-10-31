-- The chain of the periods of a subscription (QĐ-16, US-11-03 AC-1, AC-4): the period a renewal makes names the one it
-- continues. A period has at most one successor (the unique index), the link is set when the row is made and never moved,
-- and both periods are terms of the same plan for the same owner department, the new one starting later.

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "renewed_from_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_renewed_from_id_key" ON "subscriptions"("renewed_from_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_renewed_from_id_fkey" FOREIGN KEY ("renewed_from_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_renewed_from_not_self" CHECK (
    "renewed_from_id" IS NULL OR "renewed_from_id" <> "id"
);

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
    SELECT s."organization_id", s."plan_id", s."owner_department_id", s."kind", s."start_date"
      INTO previous
      FROM "subscriptions" s
     WHERE s."id" = NEW."renewed_from_id"
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF previous."kind" <> 'TERM' OR NEW."kind" <> 'TERM'
       OR previous."organization_id" <> NEW."organization_id"
       OR previous."plan_id" <> NEW."plan_id"
       OR previous."owner_department_id" <> NEW."owner_department_id" THEN
        RAISE EXCEPTION 'A renewed period is a term of the same plan for the same owner department'
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
