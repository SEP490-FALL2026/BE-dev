-- Two roll-forward corrections of personnel and licensing (g0-g6-final-business-baseline-remediation, Task 5.4; F47, F48; spec G, K).
-- No merged migration is edited (DB-15); each correction is added here (DB-05).
--
-- The compatibility image stays valid on this schema: the new tables are written only by the release that reads them, and the
-- announcements added below are rows the compatibility image reads like any other.

-- 1. F47: `20261024140100_organization_change_announcements` marked what the organization already had as told with the
-- date of the DATABASE SESSION (`CURRENT_DATE`), while the application reads days in the calendar of the organization. A change
-- whose day had come in the organization's calendar at the moment that migration ran, but not in the session's, was left
-- unmarked and would be told as new. Mark it now, as of the moment that migration finished (so a change that took effect
-- afterwards is still told by the ordinary sweep) and in the calendar of the organization. A mark that already exists stays. A
-- database that never recorded the migration (baselined) gets none: nothing is guessed.
INSERT INTO "organization_change_announcements" ("id", "organization_id", "kind", "subject_id", "effective_on")
SELECT gen_random_uuid(), p."organization_id", 'PLACEMENT_START', p."id", p."valid_from"
  FROM "employee_placements" p
  JOIN "organizations" o ON o."id" = p."organization_id"
  JOIN "_prisma_migrations" m ON m."migration_name" = '20261024140100_organization_change_announcements'
                             AND m."finished_at" IS NOT NULL AND m."rolled_back_at" IS NULL
 WHERE p."valid_from" <= (m."finished_at" AT TIME ZONE o."time_zone")::date
   AND EXISTS (SELECT 1 FROM "employee_placements" q WHERE q."employee_id" = p."employee_id" AND q."valid_to" = p."valid_from")
ON CONFLICT ("kind", "subject_id") DO NOTHING;

INSERT INTO "organization_change_announcements" ("id", "organization_id", "kind", "subject_id", "effective_on")
SELECT gen_random_uuid(), h."organization_id", 'HEAD_PERIOD_START', h."id", h."valid_from"
  FROM "department_head_periods" h
  JOIN "organizations" o ON o."id" = h."organization_id"
  JOIN "_prisma_migrations" m ON m."migration_name" = '20261024140100_organization_change_announcements'
                             AND m."finished_at" IS NOT NULL AND m."rolled_back_at" IS NULL
 WHERE h."valid_from" <= (m."finished_at" AT TIME ZONE o."time_zone")::date
ON CONFLICT ("kind", "subject_id") DO NOTHING;

INSERT INTO "organization_change_announcements" ("id", "organization_id", "kind", "subject_id", "effective_on")
SELECT gen_random_uuid(), h."organization_id", 'HEAD_PERIOD_END', h."id", h."valid_to"
  FROM "department_head_periods" h
  JOIN "organizations" o ON o."id" = h."organization_id"
  JOIN "_prisma_migrations" m ON m."migration_name" = '20261024140100_organization_change_announcements'
                             AND m."finished_at" IS NOT NULL AND m."rolled_back_at" IS NULL
 WHERE h."valid_to" IS NOT NULL AND h."valid_to" <= (m."finished_at" AT TIME ZONE o."time_zone")::date
ON CONFLICT ("kind", "subject_id") DO NOTHING;

-- 2. F48: the code of a `BM-09` notice and of a `BM-11` report carries the year (`BM09-<year>-<6 digits>`), but the sequences
-- behind them never restart and stop at 999999. Each year has its own counter; the application takes the next number under the
-- lock of the counter row of the year (and lifts the old sequence to it, so the compatibility image, which still draws from
-- the sequence, never hands out a number the new counter did).
CREATE TABLE "personnel_notice_counters" (
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "personnel_notice_counters_pkey" PRIMARY KEY ("year"),
    CONSTRAINT "personnel_notice_counters_year_check" CHECK ("year" BETWEEN 2000 AND 2200),
    CONSTRAINT "personnel_notice_counters_value_check" CHECK ("last_value" BETWEEN 0 AND 999999)
);

CREATE TABLE "saas_issue_counters" (
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "saas_issue_counters_pkey" PRIMARY KEY ("year"),
    CONSTRAINT "saas_issue_counters_year_check" CHECK ("year" BETWEEN 2000 AND 2200),
    CONSTRAINT "saas_issue_counters_value_check" CHECK ("last_value" BETWEEN 0 AND 999999)
);
