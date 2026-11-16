-- FIX-RV23 RV2-01 (QĐ-111af "một lần mỗi lần vượt", US-12-21 OQ-111E12-6): the use that went back under a threshold (a release, a reversal, an adjustment that raised the base) and goes over it again is told
-- again. An alert is now one CROSSING: the Cost Center, the year, the threshold and the number of the crossing (`episode`, 1 for the first, one more than the last read under the lock of the budget year);
-- the base the use went over stays on the row as what was told, and is no longer part of the key. The unique key is still the safety net of MAJ-10: two writes of the same crossing write it once.
-- Expand then replace one index: a column with a default, the old rows numbered in the order they were told, the old index dropped and the new one created. Safe to run twice (the numbering runs only while
-- the old index is still there, so a second run leaves the numbers the application wrote).

ALTER TABLE "budget_threshold_alerts" ADD COLUMN IF NOT EXISTS "episode" integer NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF to_regclass('budget_threshold_alerts_key') IS NOT NULL THEN
        UPDATE "budget_threshold_alerts" AS target
           SET "episode" = numbered."episode"
          FROM (
              SELECT "id",
                     (row_number() OVER (PARTITION BY "cost_center_id", "year", "threshold" ORDER BY "created_at", "id"))::integer AS "episode"
                FROM "budget_threshold_alerts"
          ) AS numbered
         WHERE target."id" = numbered."id" AND target."episode" <> numbered."episode";
    END IF;
END $$;

ALTER TABLE "budget_threshold_alerts" DROP CONSTRAINT IF EXISTS "budget_threshold_alerts_episode_check";
ALTER TABLE "budget_threshold_alerts" ADD CONSTRAINT "budget_threshold_alerts_episode_check" CHECK ("episode" >= 1);

DROP INDEX IF EXISTS "budget_threshold_alerts_key";
CREATE UNIQUE INDEX IF NOT EXISTS "budget_threshold_alerts_episode_key"
    ON "budget_threshold_alerts" ("cost_center_id", "year", "threshold", "episode");
