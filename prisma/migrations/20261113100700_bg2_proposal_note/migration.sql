-- BG-2 (QĐ-111ab): BM-10 is one or more files, one amount (kept in "total_minor") and a note. Only added: the lines of a proposal sent
-- before stay as they are and are no longer written. A note is 1 to 1000 characters that are not all blank, or nothing.
ALTER TABLE "budget_proposals" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "budget_proposals" DROP CONSTRAINT IF EXISTS "budget_proposals_note_check";
ALTER TABLE "budget_proposals"
  ADD CONSTRAINT "budget_proposals_note_check" CHECK ("note" IS NULL OR (length(btrim("note")) > 0 AND length("note") <= 1000));
