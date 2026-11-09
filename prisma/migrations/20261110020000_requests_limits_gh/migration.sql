-- The limits of a request for new access, per beneficiary (BR-MF1-01, QĐ-103c, QĐ-104b, QĐ-106g, QĐ-108c).
-- GH-3: a person who already uses many paid applications may still ask, with a reason; the request (or the line of a group) carries
-- the flag, how many they used and the reason, fixed when it was sent. An exemption says why a request is left out of GH-1/GH-2
-- (a request again in the overlap of a transfer, a request again after a role ended); nothing sets it in this release.
-- Only additions: every row that exists reads as not flagged and not exempt.

ALTER TABLE "access_requests"
    ADD COLUMN "many_paid_software" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "many_paid_software_count" SMALLINT,
    ADD COLUMN "many_paid_software_reason" TEXT,
    ADD COLUMN "limit_exemption" TEXT;

ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_many_paid_software_pair" CHECK (
        "many_paid_software" = ("many_paid_software_reason" IS NOT NULL)
        AND "many_paid_software" = ("many_paid_software_count" IS NOT NULL)
        AND ("many_paid_software_count" IS NULL OR "many_paid_software_count" >= 0)
        AND ("many_paid_software_reason" IS NULL OR length(btrim("many_paid_software_reason")) BETWEEN 1 AND 1000)
    ),
    ADD CONSTRAINT "access_requests_limit_exemption_known" CHECK (
        "limit_exemption" IS NULL OR "limit_exemption" IN ('TRANSFER_OVERLAP', 'ROLE_ENDED')
    );

ALTER TABLE "access_request_lines"
    ADD COLUMN "many_paid_software" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "many_paid_software_count" SMALLINT,
    ADD COLUMN "many_paid_software_reason" TEXT,
    ADD COLUMN "limit_exemption" TEXT;

ALTER TABLE "access_request_lines"
    ADD CONSTRAINT "access_request_lines_many_paid_software_pair" CHECK (
        "many_paid_software" = ("many_paid_software_reason" IS NOT NULL)
        AND "many_paid_software" = ("many_paid_software_count" IS NOT NULL)
        AND ("many_paid_software_count" IS NULL OR "many_paid_software_count" >= 0)
        AND ("many_paid_software_reason" IS NULL OR length(btrim("many_paid_software_reason")) BETWEEN 1 AND 1000)
    ),
    ADD CONSTRAINT "access_request_lines_limit_exemption_known" CHECK (
        "limit_exemption" IS NULL OR "limit_exemption" IN ('TRANSFER_OVERLAP', 'ROLE_ENDED')
    );
