-- The renewal of a pool subscription is written once, at its adjustment point (SBF-20, QĐ-103e, QĐ-104d, QĐ-106i): the IT Admin may
-- raise the seats (INCREASE), and a period with no declared deadline names what its milestone came from (the renewal date, the
-- payment date). A value added to an enum cannot be used in the transaction that adds it, so the constraints, the index and the data
-- that use these values come in the next migration. Like every added value they cannot be taken away again (DB-05).

ALTER TYPE "RenewalChoice" ADD VALUE 'INCREASE';
ALTER TYPE "RenewalNoticeBasis" ADD VALUE 'BY_RENEWAL_DATE';
ALTER TYPE "RenewalNoticeBasis" ADD VALUE 'BY_PAYMENT_DATE';
