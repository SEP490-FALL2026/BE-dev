-- Multi-item request tickets (QĐ-115aa): append-only ticket envelope and immutable ticket link on access_requests.
-- Reversal SQL (before any ticket row is written):
--   DROP TRIGGER IF EXISTS "request_tickets_immutable" ON "request_tickets";
--   DROP FUNCTION IF EXISTS "request_tickets_immutable"();
--   DROP TRIGGER IF EXISTS "access_requests_ticket_immutable" ON "access_requests";
--   DROP FUNCTION IF EXISTS "access_requests_ticket_immutable"();
--   ALTER TABLE "access_requests"
--     DROP CONSTRAINT IF EXISTS "access_requests_ticket_kind",
--     DROP CONSTRAINT IF EXISTS "access_requests_ticket_position_range",
--     DROP CONSTRAINT IF EXISTS "access_requests_ticket_pair",
--     DROP CONSTRAINT IF EXISTS "access_requests_ticket_id_fkey";
--   DROP INDEX IF EXISTS "access_requests_ticket_id_ticket_position_key";
--   DROP INDEX IF EXISTS "access_requests_ticket_id_idx";
--   ALTER TABLE "access_requests" DROP COLUMN IF EXISTS "ticket_position", DROP COLUMN IF EXISTS "ticket_id";
--   DROP TABLE IF EXISTS "request_tickets";

-- AlterTable
ALTER TABLE "access_requests" ADD COLUMN     "ticket_id" UUID,
ADD COLUMN     "ticket_position" SMALLINT;

-- CreateTable
CREATE TABLE "request_tickets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "requester_employee_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "request_tickets_requester_employee_id_submitted_at_id_idx" ON "request_tickets"("requester_employee_id", "submitted_at" DESC, "id");

-- CreateIndex
CREATE INDEX "access_requests_ticket_id_idx" ON "access_requests"("ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_requests_ticket_id_ticket_position_key" ON "access_requests"("ticket_id", "ticket_position");

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "request_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_tickets" ADD CONSTRAINT "request_tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_tickets" ADD CONSTRAINT "request_tickets_requester_employee_id_fkey" FOREIGN KEY ("requester_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_tickets" ADD CONSTRAINT "request_tickets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ticket link invariants on access_requests: pair nullability, 1..6 position range, and only PAID_IN_CATALOG GRANT items may belong to a ticket.
ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_ticket_pair" CHECK (("ticket_id" IS NULL) = ("ticket_position" IS NULL)),
    ADD CONSTRAINT "access_requests_ticket_position_range" CHECK ("ticket_position" IS NULL OR "ticket_position" BETWEEN 1 AND 6),
    ADD CONSTRAINT "access_requests_ticket_kind" CHECK ("ticket_id" IS NULL OR ("type" = 'GRANT' AND "branch" = 'PAID_IN_CATALOG'));

-- An item cannot join, leave, or move between tickets or positions after creation.
CREATE FUNCTION "access_requests_ticket_immutable"() RETURNS trigger AS $$
BEGIN
    IF NEW."ticket_id" IS DISTINCT FROM OLD."ticket_id"
       OR NEW."ticket_position" IS DISTINCT FROM OLD."ticket_position" THEN
        RAISE EXCEPTION 'access_requests ticket link is immutable once created'
            USING ERRCODE = 'restrict_violation', CONSTRAINT = 'access_requests_ticket_immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "access_requests_ticket_immutable"
    BEFORE UPDATE OF "ticket_id", "ticket_position" ON "access_requests"
    FOR EACH ROW EXECUTE FUNCTION "access_requests_ticket_immutable"();

-- Request tickets are append-only envelopes.
CREATE FUNCTION "request_tickets_immutable"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'request_tickets is append-only (% rejected)', TG_OP
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'request_tickets_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "request_tickets_immutable"
    BEFORE UPDATE OR DELETE ON "request_tickets"
    FOR EACH ROW EXECUTE FUNCTION "request_tickets_immutable"();
