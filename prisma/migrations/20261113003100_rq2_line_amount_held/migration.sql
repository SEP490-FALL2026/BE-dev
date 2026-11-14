-- RQ-2.4 (QĐ-111k, M-13, R-46, expand): the part of the year after of each person of a request for a group, kept when the spend is approved.
-- It is a row of the shares of the person (one for each year), but no commitment holds it until the job of 01/01 makes one, so it is marked: a share
-- that is held is given back to a commitment when the person leaves; one that is not held has nothing to give back. Every row that is already
-- there was written for a commitment: the default keeps it held. Nothing is dropped and no row changes; safe to run twice.

ALTER TABLE "access_request_line_amounts" ADD COLUMN IF NOT EXISTS "held" BOOLEAN NOT NULL DEFAULT TRUE;
