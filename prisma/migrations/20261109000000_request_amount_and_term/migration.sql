-- BR-MF1-06a: Số tiền theo tháng, định giá, ngày cấp quyền
-- Task 1: gói MF1-A — Số tiền, thời hạn, nguồn giá, ngày bắt đầu quyền

-- ALTER enum for price kind
CREATE TYPE public."AccessRequestPriceKind" AS ENUM ('RECURRING', 'ONE_TIME');

-- ALTER access_requests: term_months nullable, add amount_months, price_kind, granted_on
ALTER TABLE public."access_requests" ALTER COLUMN "term_months" DROP NOT NULL;
ALTER TABLE public."access_requests" ADD COLUMN "amount_months" integer;
ALTER TABLE public."access_requests" ADD COLUMN "price_kind" public."AccessRequestPriceKind";
ALTER TABLE public."access_requests" ADD COLUMN "granted_on" date;

-- CHECK: amount_months in 0..12
ALTER TABLE public."access_requests" ADD CONSTRAINT "access_requests_amount_months_check" CHECK ("amount_months" IS NULL OR ("amount_months" >= 0 AND "amount_months" <= 12));

-- ALTER request_supplements: make all amount/date fields nullable, add before/after EndDate
ALTER TABLE public."request_supplements" ALTER COLUMN "before_expected_spend_on" DROP NOT NULL;
ALTER TABLE public."request_supplements" ALTER COLUMN "after_expected_spend_on" DROP NOT NULL;
ALTER TABLE public."request_supplements" ALTER COLUMN "before_budget_year" DROP NOT NULL;
ALTER TABLE public."request_supplements" ALTER COLUMN "after_budget_year" DROP NOT NULL;
ALTER TABLE public."request_supplements" ALTER COLUMN "before_amount_minor" DROP NOT NULL;
ALTER TABLE public."request_supplements" ALTER COLUMN "after_amount_minor" DROP NOT NULL;
ALTER TABLE public."request_supplements" ALTER COLUMN "currency" DROP NOT NULL;
ALTER TABLE public."request_supplements" ADD COLUMN "before_expected_end_date" date;
ALTER TABLE public."request_supplements" ADD COLUMN "after_expected_end_date" date;
