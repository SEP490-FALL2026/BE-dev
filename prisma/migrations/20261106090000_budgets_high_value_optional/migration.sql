-- M-A13 (QĐ-97c): no version sets a high-value threshold any more; the column stays for history and is written NULL.
ALTER TABLE budget_versions ALTER COLUMN high_value_percent DROP NOT NULL;
