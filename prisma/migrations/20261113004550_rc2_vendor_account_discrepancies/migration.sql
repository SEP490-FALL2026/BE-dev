-- RC-2.1 (QĐ-111y, R-18, C-4): what the review of the accounts at the vendor (`SBF-08`) keeps for each difference between what the company has on
-- record (`internal_value`) and what the vendor shows (`vendor_value`): the two values as they were when it was seen, the day of the evidence, and
-- the one decision of the IT Admin. It is made from what was already found (an account with activity and no seat, a vendor identifier nobody
-- owns), from an invoice whose count or price Finance suspects (RC-1) and from a tool the collector sees that is not on the allowlist; one row for
-- each thing seen, so seeing it again only moves the day of the evidence. The evidence is deleted after 24 months (US-14-04 AC-2), so a row may be
-- deleted; one that was decided is never changed. The application, the vendor and the person are values of other contexts, with no foreign key.
-- Expand only; safe to run twice.

CREATE TABLE IF NOT EXISTS "vendor_account_discrepancies" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL,
    "source" "VendorAccountDiscrepancySource" NOT NULL,
    -- What was seen: the finding, the identifier, the case of the invoice or the key of the tool; one row each.
    "source_ref" text NOT NULL,
    "application_id" uuid,
    "vendor_id" uuid,
    "employee_id" uuid,
    -- The account at the vendor as it was written, or the key of the tool; never the name of a person.
    "identity" text,
    "internal_value" text NOT NULL,
    "vendor_value" text NOT NULL,
    "evidence_on" date NOT NULL,
    "first_seen_at" timestamptz(3) NOT NULL,
    "last_seen_at" timestamptz(3) NOT NULL,
    "state" "VendorAccountDiscrepancyState" NOT NULL DEFAULT 'OPEN',
    "decision" "VendorAccountDecision",
    "decision_note" text,
    "decided_by_employee_id" uuid,
    "decided_at" timestamptz(3),
    -- The case outside the process an `OUT_OF_PROCESS` decision opened (`SBF-07a`).
    "out_of_process_case_id" uuid,
    CONSTRAINT "vendor_account_discrepancies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendor_account_discrepancies_text_check" CHECK (
        char_length(btrim("source_ref")) BETWEEN 1 AND 200 AND char_length(btrim("internal_value")) BETWEEN 1 AND 500
        AND char_length(btrim("vendor_value")) BETWEEN 1 AND 500 AND ("identity" IS NULL OR char_length(btrim("identity")) BETWEEN 1 AND 320)),
    -- Open means nobody has decided; decided means who, when, what and why, and a case only for `OUT_OF_PROCESS`.
    CONSTRAINT "vendor_account_discrepancies_state_check" CHECK (
        ("state" = 'OPEN' AND "decision" IS NULL AND "decision_note" IS NULL AND "decided_by_employee_id" IS NULL AND "decided_at" IS NULL
            AND "out_of_process_case_id" IS NULL)
        OR ("state" = 'DECIDED' AND "decision" IS NOT NULL AND "decision_note" IS NOT NULL
            AND char_length(btrim("decision_note")) BETWEEN 1 AND 1000 AND "decided_by_employee_id" IS NOT NULL AND "decided_at" IS NOT NULL
            AND (("decision" = 'OUT_OF_PROCESS') = ("out_of_process_case_id" IS NOT NULL)))
    )
);

-- One row for each thing seen.
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_account_discrepancies_source_key" ON "vendor_account_discrepancies" ("organization_id", "source", "source_ref");
CREATE INDEX IF NOT EXISTS "vendor_account_discrepancies_state_seen_idx"
    ON "vendor_account_discrepancies" ("organization_id", "state", "first_seen_at" DESC, "id");
CREATE INDEX IF NOT EXISTS "vendor_account_discrepancies_evidence_on_idx" ON "vendor_account_discrepancies" ("evidence_on");

-- An open row only learns it was seen again and moves once to decided; a decided one never changes; what it was opened with never changes.
CREATE OR REPLACE FUNCTION vendor_account_discrepancies_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'vendor_account_discrepancies is never truncated' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."state" <> 'OPEN' THEN
    RAISE EXCEPTION 'a decided difference of an account at the vendor is never changed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW."id", NEW."organization_id", NEW."source", NEW."source_ref", NEW."first_seen_at")
     IS DISTINCT FROM
     (OLD."id", OLD."organization_id", OLD."source", OLD."source_ref", OLD."first_seen_at") THEN
    RAISE EXCEPTION 'what a difference of an account at the vendor was opened with never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS vendor_account_discrepancies_guard ON "vendor_account_discrepancies";
CREATE TRIGGER vendor_account_discrepancies_guard BEFORE UPDATE ON "vendor_account_discrepancies"
    FOR EACH ROW EXECUTE FUNCTION vendor_account_discrepancies_guard();
DROP TRIGGER IF EXISTS vendor_account_discrepancies_no_truncate ON "vendor_account_discrepancies";
CREATE TRIGGER vendor_account_discrepancies_no_truncate BEFORE TRUNCATE ON "vendor_account_discrepancies"
    FOR EACH STATEMENT EXECUTE FUNCTION vendor_account_discrepancies_guard();
