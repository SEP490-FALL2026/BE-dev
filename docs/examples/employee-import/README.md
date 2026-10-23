# Employee import examples

CSV/XLSX files are preserved as reusable examples, not an implemented API contract.
They predate the G2 import: `/api/v1/employee-imports` (preview, confirm, cancel) now exists and expects the
columns `employee_code`, `full_name`, `work_email`, `employment_type`, `hire_date`, `department_code`,
`job_title`. These files still use the old `costCenterCode`/`managerEmployeeCode`/`departmentLabel`
columns and a `COMPANY` cost center, which is no longer a Cost Center (Docs `72e1480`, QD-86b).

- employees-15.csv and employees-15.xlsx: sample inputs.
- employees-invalid.csv: invalid input examples.
- expected-results.json: historical expectations; review against the new US before use.

Do not infer authorization, preview/commit semantics or current response fields from
these examples. Build the new contract from approved requirements and test it.
