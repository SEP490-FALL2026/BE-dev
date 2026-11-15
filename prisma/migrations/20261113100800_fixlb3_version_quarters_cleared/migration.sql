-- FIX-LB3 LBG-03 (QĐ-111ac, no quarter: one amount for the year): the forecast by quarter is no longer written, but a draft or a version
-- sent back to Finance that an older release left can still hold it, and the first change of its base made the total differ from the
-- quarters, which "budget_versions_quarters_check" refuses. Only data changes, no column is dropped (expand-contract): the four quarters
-- of the versions Finance can still change are emptied. A version that was sent, approved, refused or closed keeps what it holds.
UPDATE "budget_versions"
   SET "q1_minor" = NULL, "q2_minor" = NULL, "q3_minor" = NULL, "q4_minor" = NULL
 WHERE "state" IN ('DRAFT', 'CHANGES_REQUESTED')
   AND ("q1_minor" IS NOT NULL OR "q2_minor" IS NOT NULL OR "q3_minor" IS NOT NULL OR "q4_minor" IS NOT NULL);
