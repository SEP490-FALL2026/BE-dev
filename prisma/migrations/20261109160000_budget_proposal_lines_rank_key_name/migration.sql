-- Name the unique key of (proposal_id, priority_rank) as Prisma names it (@@unique), so the schema and the migrations agree.
ALTER TABLE budget_proposal_lines
  RENAME CONSTRAINT budget_proposal_lines_priority_rank_unique TO budget_proposal_lines_proposal_id_priority_rank_key;
