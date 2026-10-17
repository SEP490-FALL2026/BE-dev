-- Slice G2 (R-10, QĐ-68): a job title can be deactivated and reactivated, and two titles that differ
-- only in case or whitespace are one title (US-02-07).
--
-- The name rule is the one in src/modules/organization/job-title-name.ts: accents composed (NFC), the ends
-- trimmed, every run of whitespace inside collapsed to one space, lower case; the diacritics are kept.
-- The whitespace set is written out ([\t\n\v\f\r \u00a0 ...]) because PostgreSQL's own \s and
-- [[:space:]] do not cover the no-break and ideographic spaces people paste, and the migration must agree
-- with the code whatever the database locale is.

-- CreateEnum
CREATE TYPE "JobTitleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- Stop, naming the titles, if two existing titles become one under the new rule. The installations that
-- exist today hold only the title the installation command created, so this is a guard, not an expectation;
-- the migration changes nothing when it fires (the whole script is one transaction).
DO $$
DECLARE
  clash text;
BEGIN
  SELECT string_agg(format('%L', names), '; ')
    INTO clash
    FROM (
      SELECT array_to_string(array_agg(name ORDER BY name), ' = ') AS names
        FROM job_titles
       GROUP BY organization_id,
                lower(regexp_replace(regexp_replace(normalize(name, NFC),
                  '^[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$', '', 'g'),
                  '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g'))
      HAVING count(*) > 1
    ) clashes;

  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'Job title names collide under the new normalization rule: %. Rename one of each pair, then run this migration again.', clash;
  END IF;
END
$$;

-- AlterTable
ALTER TABLE "job_titles"
  ADD COLUMN "status" "JobTitleStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Raised by every rename, deactivation and reactivation, so a later import preview can tell it went stale.
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Recompute every normalized name with the new rule. The unique index on (organization_id, normalized_name)
-- stays; the check above guarantees the new values do not collide.
UPDATE "job_titles"
   SET "normalized_name" = lower(regexp_replace(regexp_replace(normalize("name", NFC),
         '^[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$', '', 'g'),
         '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g'));
