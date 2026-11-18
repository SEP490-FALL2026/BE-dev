-- The head leaves people out of a request for a group in a supplementary file (g5-group-requests, US-06-14 AC-13): the file
-- keeps who was left out, and what it costs before and after. A file may now change the amount without changing the day the
-- money goes out, so a change is a different day or a different amount.

-- CreateTable
CREATE TABLE "request_supplement_drops" (
    "request_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "employee_id" UUID NOT NULL,

    CONSTRAINT "request_supplement_drops_pkey" PRIMARY KEY ("request_id","number","employee_id")
);

-- AddForeignKey
ALTER TABLE "request_supplement_drops" ADD CONSTRAINT "request_supplement_drops_request_id_number_fkey" FOREIGN KEY ("request_id", "number") REFERENCES "request_supplements"("request_id", "number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_supplement_drops" ADD CONSTRAINT "request_supplement_drops_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A file that left people out changes what the request costs even when the day stays; a file written before this one changed the
-- day, which still holds.
ALTER TABLE "request_supplements" DROP CONSTRAINT "request_supplements_change_check";
ALTER TABLE "request_supplements"
    ADD CONSTRAINT "request_supplements_change_check" CHECK (
        "before_expected_spend_on" <> "after_expected_spend_on" OR "before_amount_minor" <> "after_amount_minor"
    );

-- INV-05: who was left out of a file is append-only, like the file.
CREATE FUNCTION request_supplement_drops_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'request_supplement_drops is append-only (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER request_supplement_drops_no_update_delete
  BEFORE UPDATE OR DELETE ON request_supplement_drops
  FOR EACH ROW EXECUTE FUNCTION request_supplement_drops_reject_change();

CREATE TRIGGER request_supplement_drops_no_truncate
  BEFORE TRUNCATE ON request_supplement_drops
  FOR EACH STATEMENT EXECUTE FUNCTION request_supplement_drops_reject_change();
