-- RQ-2 review (QĐ-111k): `20261113003100_rq2_line_amount_held` added `held`, but the guard of the shares of a person (`20261024130100`) compares only the
-- request, the person, the year, the amount and the currency, so `held` could be changed by an UPDATE: a share that no commitment holds turned into
-- one that is would be given back to a commitment that never held it. The guard now keeps `held` as it was written, and says the same about it as
-- about the amount. Same function, same trigger, one more column compared; safe to run twice.

CREATE OR REPLACE FUNCTION access_request_line_amounts_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'The share of a person in a commitment is never deleted'
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_line_amounts_immutable';
  END IF;
  IF (NEW."request_id", NEW."employee_id", NEW."budget_year", NEW."amount_minor", NEW."currency", NEW."held")
     IS DISTINCT FROM (OLD."request_id", OLD."employee_id", OLD."budget_year", OLD."amount_minor", OLD."currency", OLD."held")
     OR (OLD."released_at" IS NOT NULL AND NEW."released_at" IS DISTINCT FROM OLD."released_at") THEN
    RAISE EXCEPTION 'The share of a person in a commitment is never changed, and is given back once'
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_line_amounts_immutable';
  END IF;

  RETURN NEW;
END;
$$;
