-- A vendor's purchase invoice number is taken whatever its case and white space (`INV-001`, `inv - 001` and `Inv-001` are one number) until the
-- invoice carrying it is returned. The key is lower(regexp_replace(number, '[[:space:]]', '', 'g')): the application compares by the very same expression
-- (`PurchaseInvoiceRepo.numberIsOpen`, `InvoiceRepo.exists`), and the number is stored as it was written. The class of white space is [[:space:]], never
-- a backslash class: a JavaScript template literal would turn it into a plain letter.
--
-- Order of the statements, so that a failure leaves the old guard in place:
--   1. refuse to go on when open invoices already share a key (nothing is merged or corrected here: the money of two invoices is for Finance to settle);
--   2. create the new unique index under a new name (it must not contain "resubmission": a clash on it is reported as a taken number);
--   3. only then drop the old index.

DO $$
DECLARE
    clashes text;
BEGIN
    SELECT string_agg(
               format('vendor %s, number %s, %s open rows', vendor_id, normalized_number, open_rows),
               '; ' ORDER BY vendor_id, normalized_number
           )
      INTO clashes
      FROM (
            SELECT organization_id,
                   vendor_id,
                   lower(regexp_replace(number, '[[:space:]]', '', 'g')) AS normalized_number,
                   count(*) AS open_rows
              FROM purchase_invoices
             WHERE state <> 'RETURNED'
             GROUP BY 1, 2, 3
            HAVING count(*) > 1
           ) AS shared;

    IF clashes IS NOT NULL THEN
        RAISE EXCEPTION 'Open purchase invoices share a vendor number once case and white space are ignored: %. Return the extra ones (a RETURNED invoice is outside the index) and deploy again.', clashes;
    END IF;
END
$$;

CREATE UNIQUE INDEX "purchase_invoices_number_open_normalized_key"
    ON "purchase_invoices" ("organization_id", "vendor_id", (lower(regexp_replace("number", '[[:space:]]', '', 'g'))))
 WHERE "state" <> 'RETURNED';

DROP INDEX IF EXISTS "purchase_invoices_number_open_key";
