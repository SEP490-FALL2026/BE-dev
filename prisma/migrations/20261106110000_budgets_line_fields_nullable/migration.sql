-- QĐ-101n: a line of a budget proposal or version is a plan or a description, the seats, the amount of the year and a note. The purchase
-- window, the service period and the repeat cycle are no longer asked for; the columns stay (history) and are written NULL.
ALTER TABLE budget_proposal_lines ALTER COLUMN window_from DROP NOT NULL;
ALTER TABLE budget_proposal_lines ALTER COLUMN window_to DROP NOT NULL;
ALTER TABLE budget_proposal_lines ALTER COLUMN service_period_months DROP NOT NULL;
ALTER TABLE budget_proposal_lines ALTER COLUMN repeat_cycle DROP NOT NULL;
ALTER TABLE budget_version_lines ALTER COLUMN window_from DROP NOT NULL;
ALTER TABLE budget_version_lines ALTER COLUMN window_to DROP NOT NULL;
ALTER TABLE budget_version_lines ALTER COLUMN service_period_months DROP NOT NULL;
ALTER TABLE budget_version_lines ALTER COLUMN repeat_cycle DROP NOT NULL;
