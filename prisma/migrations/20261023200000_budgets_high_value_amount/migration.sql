-- The high-value threshold of a version is a share of what is left and/or an amount (US-06-09, US-06-12 AC-3, QĐ-82c).
ALTER TABLE budget_versions ADD COLUMN high_value_amount_minor bigint;
ALTER TABLE budget_versions ADD CONSTRAINT budget_versions_high_value_amount_check
  CHECK (high_value_amount_minor IS NULL OR high_value_amount_minor > 0);
