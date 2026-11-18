-- MF2-D review (b), MF2-E: the sweepers and the list of late departures read only the departures that are not closed or cancelled, in the order
-- of their id (the late ones by `revocation_due_on`, the ones to announce by `block_announced_at`, the ones with no lock by `account_lock_at`).
-- Most rows of the table are closed or cancelled, so they were found by walking the whole primary key and discarding the rest. A partial index
-- holds only the open ones, in id order. Expand only: an index is added, nothing is changed or dropped; safe to run twice.
CREATE INDEX IF NOT EXISTS "offboarding_cases_open_idx" ON "offboarding_cases" ("id")
    WHERE "closed_at" IS NULL AND "state" IN ('HANDING_OVER', 'LEFT');
