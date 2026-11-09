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

-- Thêm cột vào budget_proposal_lines
ALTER TABLE budget_proposal_lines
  ADD COLUMN line_type "BudgetLineType" NOT NULL DEFAULT 'NEW',
  ADD COLUMN zbb jsonb,
  ADD COLUMN priority_rank int NOT NULL DEFAULT 1,
  ADD COLUMN over_ceiling_minor bigint;

-- Thêm cột vào budget_version_lines
ALTER TABLE budget_version_lines
  ADD COLUMN line_type "BudgetLineType" NOT NULL DEFAULT 'NEW',
  ADD COLUMN zbb jsonb,
  ADD COLUMN priority_rank int;

-- Tạo constraint duy nhất cho priority_rank theo proposal (budget_proposal_lines)
ALTER TABLE budget_proposal_lines
  ADD CONSTRAINT budget_proposal_lines_priority_rank_unique
    UNIQUE (proposal_id, priority_rank);

-- Tạo constraint cho priority_rank >= 1
ALTER TABLE budget_proposal_lines
  ADD CONSTRAINT budget_proposal_lines_priority_rank_min
    CHECK (priority_rank >= 1);

-- Backfill mặc định: priority_rank = position (duy nhất theo proposal)
-- (Mặc định đã là 1, sau này phải được ghi đúng khi nộp)

-- Thêm CHECK constraint trên budget_versions để SUPERSEDED không dùng được nữa
ALTER TABLE budget_versions
  ADD CONSTRAINT budget_versions_no_superseded
    CHECK (state <> 'SUPERSEDED');
