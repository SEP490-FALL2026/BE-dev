import { Client } from 'pg';

export interface CoverageViolation {
  employee_id: string;
  problem: string;
}

/**
 * I-2 coverage: the exclusion constraint proves placements never overlap but cannot prove that the first placement
 * starts at the hire date, at the day the employee was recorded, or not before both (a first placement), that there is no
 * gap, or that an active employee with a placement has exactly one open period. An employee with no placement is
 * valid unplaced (INV-20).
 * Run at the end of any test that writes organization data; an empty result means coverage holds.
 */
const COVERAGE_SQL = `
WITH ordered AS (
  SELECT p.employee_id, p.valid_from, p.valid_to,
         lead(p.valid_from) OVER (PARTITION BY p.employee_id ORDER BY p.valid_from) AS next_from,
         row_number() OVER (PARTITION BY p.employee_id ORDER BY p.valid_from) AS position
  FROM employee_placements p
)
SELECT o.employee_id, 'first placement does not start at hire date or at the day the employee was recorded' AS problem
FROM ordered o
JOIN employees e ON e.id = o.employee_id
JOIN organizations og ON og.id = e.organization_id
WHERE o.position = 1
  AND o.valid_from <> e.hire_date
  AND o.valid_from <> (e.created_at AT TIME ZONE og.time_zone)::date
  AND o.valid_from < GREATEST(e.hire_date, (e.created_at AT TIME ZONE og.time_zone)::date)
UNION ALL
SELECT o.employee_id, 'gap or overlap between consecutive placements' AS problem
FROM ordered o WHERE o.next_from IS NOT NULL AND o.valid_to IS DISTINCT FROM o.next_from
UNION ALL
SELECT e.id AS employee_id, 'active employee with a placement must have exactly one open placement' AS problem
FROM employees e
WHERE e.status = 'ACTIVE'
  AND EXISTS (SELECT 1 FROM employee_placements p WHERE p.employee_id = e.id)
  AND (SELECT count(*) FROM employee_placements p WHERE p.employee_id = e.id AND p.valid_to IS NULL) <> 1
UNION ALL
SELECT e.id AS employee_id, 'terminated employee must have no open placement' AS problem
FROM employees e
WHERE e.status = 'TERMINATED'
  AND EXISTS (SELECT 1 FROM employee_placements p WHERE p.employee_id = e.id AND p.valid_to IS NULL)
`;

export async function findPlacementCoverageViolations(client: Pick<Client, 'query'>): Promise<CoverageViolation[]> {
  const { rows } = await client.query<CoverageViolation>(COVERAGE_SQL);
  return rows;
}
