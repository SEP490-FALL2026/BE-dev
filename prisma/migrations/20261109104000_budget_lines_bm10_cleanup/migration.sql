-- BM-10 dòng: thêm loại, ZBB, xếp hạng, cờ vượt + check legacy data + backfill

-- Thêm enum loại dòng
CREATE TYPE "BudgetLineType" AS ENUM ('RENEW', 'CHANGE', 'NEW', 'CANCEL');

-- Check legacy data trước (transaction sẽ rollback nếu fail)
DO $$
BEGIN
  -- Nếu còn phiên bản REVISION (từ mô hình cũ)
  IF EXISTS(SELECT 1 FROM budget_versions WHERE kind = 'REVISION') THEN
    RAISE EXCEPTION 'Migration blocked: database contains REVISION budget versions. Please clean legacy data before proceeding.';
  END IF;

  -- Nếu còn phiên bản SUPERSEDED
  IF EXISTS(SELECT 1 FROM budget_versions WHERE state = 'SUPERSEDED') THEN
    RAISE EXCEPTION 'Migration blocked: database contains SUPERSEDED budget versions. Please clean legacy data before proceeding.';
  END IF;

  -- Nếu còn thay đổi khoảng mua (legacy dời window)
  IF EXISTS(SELECT 1 FROM budget_version_line_changes) THEN
    RAISE EXCEPTION 'Migration blocked: database contains budget_version_line_changes. Please clean legacy data before proceeding.';
  END IF;
END $$;

-- Proposal lines: add nullable, backfill, then tighten (order matters on a database that already holds multi-line proposals)
ALTER TABLE budget_proposal_lines
  ADD COLUMN line_type "BudgetLineType" NOT NULL DEFAULT 'NEW',
  ADD COLUMN zbb jsonb,
  ADD COLUMN priority_rank int,
  ADD COLUMN over_ceiling_minor bigint;

-- position starts at 1 (budget_proposal_lines_position_check), unique per proposal, so it is a valid initial rank
UPDATE budget_proposal_lines SET priority_rank = "position";

ALTER TABLE budget_proposal_lines ALTER COLUMN priority_rank SET NOT NULL;

ALTER TABLE budget_proposal_lines
  ADD CONSTRAINT budget_proposal_lines_priority_rank_unique UNIQUE (proposal_id, priority_rank),
  ADD CONSTRAINT budget_proposal_lines_priority_rank_min CHECK (priority_rank >= 1);

-- Version lines copy the rank of the proposal line they came from; Finance-added lines stay NULL
ALTER TABLE budget_version_lines
  ADD COLUMN line_type "BudgetLineType" NOT NULL DEFAULT 'NEW',
  ADD COLUMN zbb jsonb,
  ADD COLUMN priority_rank int;

UPDATE budget_version_lines vl
   SET priority_rank = pl.priority_rank
  FROM budget_proposal_lines pl
 WHERE pl.proposal_id = vl.proposal_id
   AND pl."position" = vl.proposal_position;

-- Thêm CHECK constraint trên budget_versions để SUPERSEDED không dùng được nữa
ALTER TABLE budget_versions
  ADD CONSTRAINT budget_versions_no_superseded
    CHECK (state <> 'SUPERSEDED');
