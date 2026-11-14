-- MF2-D review (b) / MF2-G review (f), D-52, D-70: the partial index of the departures that are open (`offboarding_cases_open_idx`, migration
-- 20261113001300) was never used by the SQL Prisma sends. Its predicate named the states (`state IN ('HANDING_OVER', 'LEFT')`), and the reads of the
-- late departures, of the block moment and of the closing compare the state with a parameter cast (`CAST($1::text AS "OffboardingState")`), which
-- the planner does not treat as a constant, so it cannot prove that the query implies the predicate: on a table of 300 000 closed departures the
-- reads walked it whole (a parallel sequential scan, 22 to 27 ms; measured with EXPLAIN (ANALYZE, BUFFERS) on the very SQL Prisma logs). The
-- predicate is now only `closed_at IS NULL`, which every one of those reads states itself and the planner matches as it is: the index holds the open
-- departures and the cancelled ones (a cancelled case is never closed), in id order. The index was added in this same release, so dropping it is
-- dropping nothing anyone relies on. Safe to run twice.
DROP INDEX IF EXISTS "offboarding_cases_open_idx";
CREATE INDEX IF NOT EXISTS "offboarding_cases_open_idx" ON "offboarding_cases" ("id") WHERE "closed_at" IS NULL;
