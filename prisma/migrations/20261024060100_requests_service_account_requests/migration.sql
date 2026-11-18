-- A request for a service account (US-05-21): the purpose of the non-human subject, the identifier the sender expects it to
-- have at the vendor, the person who answers for it, and the verdict of the IT Admin on whether it really is a non-human
-- subject. A service account is owned by a department, so the request carries what every request carries (its department and
-- the Unit Cost Center of that department on the day it was sent); this table holds only what is particular to it.

-- CreateEnum
CREATE TYPE "ServiceAccountBoundaryState" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "access_request_service_accounts" (
    "request_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "expected_identifier" TEXT NOT NULL,
    "responsible_employee_id" UUID NOT NULL,
    "boundary_state" "ServiceAccountBoundaryState" NOT NULL DEFAULT 'PENDING',
    "boundary_reason" TEXT,
    "boundary_decided_by_employee_id" UUID,
    "boundary_decided_at" TIMESTAMPTZ(3),
    "boundary_self_executed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "access_request_service_accounts_pkey" PRIMARY KEY ("request_id")
);

-- CreateIndex
CREATE INDEX "access_request_service_accounts_responsible_employee_id_idx" ON "access_request_service_accounts"("responsible_employee_id");

-- CreateIndex
CREATE INDEX "access_request_service_accounts_boundary_state_idx" ON "access_request_service_accounts"("boundary_state");

-- AddForeignKey
ALTER TABLE "access_request_service_accounts" ADD CONSTRAINT "access_request_service_accounts_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_service_accounts" ADD CONSTRAINT "access_request_service_accounts_responsible_employee_id_fkey" FOREIGN KEY ("responsible_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_service_accounts" ADD CONSTRAINT "access_request_service_accounts_boundary_decided_by_employ_fkey" FOREIGN KEY ("boundary_decided_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints Prisma cannot express (ADR-0005).

-- The purpose and the identifier say something, and so does a reason that is given.
ALTER TABLE "access_request_service_accounts"
    ADD CONSTRAINT "access_request_service_accounts_text_check" CHECK (
        btrim("purpose") <> '' AND btrim("expected_identifier") <> ''
        AND ("boundary_reason" IS NULL OR btrim("boundary_reason") <> '')
    ),
    -- The verdict and the columns that record it say the same thing: nobody has decided yet; or an IT Admin accepted, at a
    -- time, with no reason to give; or an IT Admin refused, at a time, and said why (US-05-21 AC-3).
    ADD CONSTRAINT "access_request_service_accounts_boundary_check" CHECK (
        ("boundary_state" = 'PENDING'
            AND "boundary_decided_by_employee_id" IS NULL AND "boundary_decided_at" IS NULL
            AND "boundary_reason" IS NULL AND NOT "boundary_self_executed")
        OR ("boundary_state" = 'ACCEPTED'
            AND "boundary_decided_by_employee_id" IS NOT NULL AND "boundary_decided_at" IS NOT NULL
            AND "boundary_reason" IS NULL)
        OR ("boundary_state" = 'REJECTED'
            AND "boundary_decided_by_employee_id" IS NOT NULL AND "boundary_decided_at" IS NOT NULL
            AND "boundary_reason" IS NOT NULL)
    );

-- What is fixed when the request is sent never changes, and a verdict that is written never changes or goes (INV-05): a
-- mistake is put right by a new request, and the audit trail keeps what was decided.
CREATE FUNCTION "access_request_service_account_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'The detail of a request for a service account is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'access_request_service_accounts_immutable';
    END IF;

    IF (NEW."request_id", NEW."purpose", NEW."expected_identifier", NEW."responsible_employee_id")
       IS DISTINCT FROM
       (OLD."request_id", OLD."purpose", OLD."expected_identifier", OLD."responsible_employee_id") THEN
        RAISE EXCEPTION 'What a request for a service account asks for never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'access_request_service_accounts_immutable';
    END IF;

    IF OLD."boundary_state" <> 'PENDING' THEN
        RAISE EXCEPTION 'The verdict on the boundary of a service account is written once'
            USING ERRCODE = '55000', CONSTRAINT = 'access_request_service_accounts_verdict_is_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "access_request_service_accounts_immutable"
    BEFORE UPDATE OR DELETE ON "access_request_service_accounts"
    FOR EACH ROW EXECUTE FUNCTION "access_request_service_account_reject_change"();

-- A request of the kind SERVICE_ACCOUNT has exactly one row of detail when the transaction commits, and a request of any
-- other kind has none. The two are written together, so the check waits for the commit.
CREATE FUNCTION "access_request_service_account_detail_check"() RETURNS trigger AS $$
DECLARE
    subject UUID;
    kind "AccessRequestType";
    detailed BOOLEAN;
BEGIN
    -- One function serves both tables, and each branch names a field that only its table has.
    IF TG_TABLE_NAME = 'access_requests' THEN
        subject := NEW."id";
    ELSE
        subject := NEW."request_id";
    END IF;
    SELECT r."type" INTO kind FROM "access_requests" r WHERE r."id" = subject;
    SELECT EXISTS (SELECT 1 FROM "access_request_service_accounts" d WHERE d."request_id" = subject) INTO detailed;

    IF (kind = 'SERVICE_ACCOUNT') IS DISTINCT FROM detailed THEN
        RAISE EXCEPTION 'A request for a service account has its detail, and no other request has one'
            USING ERRCODE = '23514', CONSTRAINT = 'access_requests_service_account_detail';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "access_requests_service_account_detail"
    AFTER INSERT OR UPDATE OF "type" ON "access_requests"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "access_request_service_account_detail_check"();

CREATE CONSTRAINT TRIGGER "access_request_service_accounts_detail"
    AFTER INSERT ON "access_request_service_accounts"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "access_request_service_account_detail_check"();
