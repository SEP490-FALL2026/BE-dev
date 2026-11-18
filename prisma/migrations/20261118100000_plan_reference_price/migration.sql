-- QĐ-113a: a paid plan (K1, K2, K4) may carry a reference price in dong, before tax. It is the fallback of the price of a request when the plan has no
-- subscription with a price (K1/K2: the price of one seat for one month; K4: the price of one purchase). Expand only: two nullable columns, no row
-- changes meaning, nothing is dropped. Safe to run twice.
--
-- The rules the row keeps whoever writes it: both columns or none; above zero (a price of 0 is no price, as a request counts it); dong only (the reporting currency is fixed to it, QĐ-111an); and only
-- for the kinds that are paid for (K1, K2, K4: not K3, which cannot be declared yet, and not K5, which costs nothing). The service clears the price when
-- the kind moves to K5 and when it moves between K2 and K4 (the price means another thing there); the CHECK is the last line if it did not.

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "reference_price_minor" BIGINT;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "reference_price_currency" CHAR(3);

ALTER TABLE "plans" DROP CONSTRAINT IF EXISTS "plans_reference_price_whole";
ALTER TABLE "plans" ADD CONSTRAINT "plans_reference_price_whole" CHECK (
  ("reference_price_minor" IS NULL) = ("reference_price_currency" IS NULL)
);

ALTER TABLE "plans" DROP CONSTRAINT IF EXISTS "plans_reference_price_valid";
ALTER TABLE "plans" ADD CONSTRAINT "plans_reference_price_valid" CHECK (
  "reference_price_minor" IS NULL
  OR ("reference_price_minor" > 0 AND "reference_price_currency" = 'VND' AND "provisioning_type" IN ('K1', 'K2', 'K4'))
);
