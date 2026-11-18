-- RQ-3.2 (QĐ-111l, R-46, expand): the renewal of a right that goes on with no end (Dùng lâu dài, K2 and K5) has no new end date. The column that kept the
-- day the holder asked for becomes nullable; every row that is there keeps its day, the order check ("new end after the previous one") and the trigger that
-- keeps what was asked unchanged both read a null as no end (a null is never distinct from itself in the trigger, and a check on null passes).
-- Nothing is dropped and no row changes; safe to run twice.

ALTER TABLE "access_request_renewals" ALTER COLUMN "new_expected_end_date" DROP NOT NULL;
