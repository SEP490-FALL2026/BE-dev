-- The terms of a plan (g3-vendor-terms-checklist, US-04-11, FR-1.10): the link, the date IT last reviewed them and the
-- points of the six-point checklist, kept as the text IT read. Nothing here is a legal conclusion and no column could hold
-- one. The sharing policy (point 1) is a column of the plan and is entered there only. The numeric install limit (point 4)
-- exists for K4 plans only (QĐ-66al); other plans keep it as text. Opinions of the Business Owner are only added to.

-- CreateTable
CREATE TABLE "plan_terms" (
    "plan_id" UUID NOT NULL,
    "terms_url" TEXT,
    "last_reviewed_on" DATE,
    "ai_training_note" TEXT,
    "storage_location_note" TEXT,
    "install_limit_max_devices" INTEGER,
    "install_limit_note" TEXT,
    "commercial_use_note" TEXT,
    "cancellation_refund_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_terms_pkey" PRIMARY KEY ("plan_id"),
    CONSTRAINT "plan_terms_text_length" CHECK (
        char_length("terms_url") <= 2000 AND char_length("ai_training_note") <= 2000
        AND char_length("storage_location_note") <= 2000 AND char_length("install_limit_note") <= 2000
        AND char_length("commercial_use_note") <= 2000 AND char_length("cancellation_refund_note") <= 2000
    ),
    CONSTRAINT "plan_terms_install_limit_positive" CHECK ("install_limit_max_devices" IS NULL OR "install_limit_max_devices" >= 1)
);

CREATE TABLE "plan_term_opinions" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "business_owner_employee_id" UUID NOT NULL,
    "opinion" TEXT NOT NULL,
    -- A value, not a foreign key: the record outlives the account (as the audit trail does).
    "recorded_by_app_user_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_term_opinions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_term_opinions_length" CHECK (char_length("opinion") BETWEEN 1 AND 2000)
);

-- CreateIndex
CREATE INDEX "plan_term_opinions_plan_id_recorded_at_idx" ON "plan_term_opinions"("plan_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "plan_terms" ADD CONSTRAINT "plan_terms_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan_term_opinions" ADD CONSTRAINT "plan_term_opinions_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan_term_opinions" ADD CONSTRAINT "plan_term_opinions_business_owner_employee_id_fkey"
    FOREIGN KEY ("business_owner_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A K5 plan has no terms, and only a K4 plan keeps the install limit as a number. An unknown plan is left to the foreign key.
CREATE FUNCTION "plan_terms_fit_plan"() RETURNS trigger AS $$
DECLARE
    plan_type "ProvisioningType";
BEGIN
    SELECT p."provisioning_type" INTO plan_type FROM "plans" p WHERE p."id" = NEW."plan_id";
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF plan_type = 'K5' THEN
        RAISE EXCEPTION 'A K5 plan of an internal application has no terms'
            USING ERRCODE = '23514', CONSTRAINT = 'plan_terms_plan_has_terms';
    END IF;
    IF NEW."install_limit_max_devices" IS NOT NULL AND plan_type <> 'K4' THEN
        RAISE EXCEPTION 'Only a K4 plan keeps the install limit as a number'
            USING ERRCODE = '23514', CONSTRAINT = 'plan_terms_numeric_limit_only_k4';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plan_terms_fit_plan"
    BEFORE INSERT OR UPDATE OF "plan_id", "install_limit_max_devices" ON "plan_terms"
    FOR EACH ROW EXECUTE FUNCTION "plan_terms_fit_plan"();

-- A plan that keeps a numeric install limit stays a K4 plan.
CREATE FUNCTION "plans_keep_terms_kind"() RETURNS trigger AS $$
BEGIN
    IF NEW."provisioning_type" <> 'K4' AND EXISTS (
        SELECT 1 FROM "plan_terms" t WHERE t."plan_id" = NEW."id" AND t."install_limit_max_devices" IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'The plan keeps a numeric install limit, which only a K4 plan has'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_keep_terms_kind';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plans_keep_terms_kind"
    BEFORE UPDATE OF "provisioning_type" ON "plans"
    FOR EACH ROW EXECUTE FUNCTION "plans_keep_terms_kind"();

-- An opinion recorded is part of the review trail: no writer changes or deletes it.
CREATE FUNCTION "plan_term_opinions_reject_change"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'A recorded opinion is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = 'plan_term_opinions_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plan_term_opinions_immutable"
    BEFORE UPDATE OR DELETE ON "plan_term_opinions"
    FOR EACH ROW EXECUTE FUNCTION "plan_term_opinions_reject_change"();
