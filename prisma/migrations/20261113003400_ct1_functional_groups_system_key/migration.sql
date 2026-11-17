-- CT-1.1 (QĐ-111d, QĐ-111e, QĐ-111f, QĐ-111bf, MAJ-7): the field "Loại" of an application is its functional group, always one; the two groups the
-- system relies on (Liên lạc, Khác) are marked by a `system_key`; the communication questions are no longer asked (their columns keep a default
-- of false and stop being written) and the sensitivity of the data may be left empty. Expand only: one column, one index, defaults, a dropped NOT NULL
-- and updates of values; nothing is dropped. Safe to run twice.
--
-- The group of an application stays nullable here: `functional_group_id SET NOT NULL` is the migration after the code that sets it on every
-- road that makes an application (CT-1.7).

ALTER TABLE "functional_groups" ADD COLUMN IF NOT EXISTS "system_key" TEXT;

-- At most one group of each system key in an organization; a group with no key is any number (NULLs are never equal).
CREATE UNIQUE INDEX IF NOT EXISTS "functional_groups_organization_id_system_key_key"
    ON "functional_groups"("organization_id", "system_key");

ALTER TABLE "functional_groups" DROP CONSTRAINT IF EXISTS "functional_groups_system_key_known";
ALTER TABLE "functional_groups" ADD CONSTRAINT "functional_groups_system_key_known" CHECK (
    "system_key" IS NULL OR "system_key" IN ('COMMUNICATION', 'OTHER')
);

-- The communication answers are not asked: a new application is not a communication service until it stands in the group Liên lạc. The CHECK
-- `applications_communication_flag` (flag = any of the three) still holds for a row with all four false.
ALTER TABLE "applications" ALTER COLUMN "comm_person_to_person_messaging" SET DEFAULT false;
ALTER TABLE "applications" ALTER COLUMN "comm_calls_or_meetings" SET DEFAULT false;
ALTER TABLE "applications" ALTER COLUMN "comm_mailbox" SET DEFAULT false;
ALTER TABLE "applications" ALTER COLUMN "is_communication_service" SET DEFAULT false;

-- QĐ-111f: the sensitivity of the data may be left empty.
ALTER TABLE "applications" ALTER COLUMN "data_sensitivity" DROP NOT NULL;

-- The seven standard groups of every organization. The search key of each name is written out as `searchKey` makes it (accents removed, lower
-- case); the test of this migration compares them with the list in the code. A group the organization made under one of the names is adopted,
-- never made twice; the two fixed groups are always active.
DO $$
DECLARE
    org RECORD;
BEGIN
    FOR org IN SELECT "id" FROM "organizations" LOOP
        UPDATE "functional_groups" SET "system_key" = 'OTHER', "status" = 'ACTIVE', "updated_at" = now()
         WHERE "organization_id" = org."id" AND "normalized_name" = 'khac' AND "system_key" IS NULL
           AND NOT EXISTS (SELECT 1 FROM "functional_groups" k WHERE k."organization_id" = org."id" AND k."system_key" = 'OTHER');
        UPDATE "functional_groups" SET "system_key" = 'COMMUNICATION', "status" = 'ACTIVE', "updated_at" = now()
         WHERE "organization_id" = org."id" AND "normalized_name" = 'lien lac (email, chat, hop)' AND "system_key" IS NULL
           AND NOT EXISTS (SELECT 1 FROM "functional_groups" k WHERE k."organization_id" = org."id" AND k."system_key" = 'COMMUNICATION');

        INSERT INTO "functional_groups" ("id", "organization_id", "name", "normalized_name", "status", "system_key", "updated_at")
        SELECT gen_random_uuid(), org."id", seed."name", seed."normalized_name", 'ACTIVE', seed."system_key", now()
          FROM (VALUES
              ('Trợ lý AI', 'tro ly ai', NULL),
              ('Thiết kế & sáng tạo', 'thiet ke & sang tao', NULL),
              ('Lập trình & kỹ thuật', 'lap trinh & ky thuat', NULL),
              ('Văn phòng & cộng tác', 'van phong & cong tac', NULL),
              ('Chuyên ngành', 'chuyen nganh', NULL),
              ('Khác', 'khac', 'OTHER'),
              ('Liên lạc (email, chat, họp)', 'lien lac (email, chat, hop)', 'COMMUNICATION')
          ) AS seed("name", "normalized_name", "system_key")
         WHERE NOT EXISTS (
                   SELECT 1 FROM "functional_groups" g
                    WHERE g."organization_id" = org."id" AND g."normalized_name" = seed."normalized_name")
        ON CONFLICT DO NOTHING;
    END LOOP;
END
$$;

-- A communication service stands in Liên lạc whatever group it had: the usage rules read the group from now on (CT-1.8), so the ones the flag
-- kept out of collection stay out. An application with no group goes to Khác.
UPDATE "applications" a SET "functional_group_id" = g."id", "updated_at" = now()
  FROM "functional_groups" g
 WHERE g."organization_id" = a."organization_id" AND g."system_key" = 'COMMUNICATION'
   AND a."is_communication_service" AND a."functional_group_id" IS DISTINCT FROM g."id";

UPDATE "applications" a SET "functional_group_id" = g."id", "updated_at" = now()
  FROM "functional_groups" g
 WHERE g."organization_id" = a."organization_id" AND g."system_key" = 'OTHER'
   AND a."functional_group_id" IS NULL;

-- An application that stood in a group that is the older, inactive Khác of the organization already moved with it (the group is the fixed one now).
