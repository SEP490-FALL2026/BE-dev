import type { DemoAccountRole } from '../../identity-access/public/identity-access.types';

/**
 * The local demo data of `pnpm dev:seed` (H6.2): stable keys, so a rerun finds what an earlier run created. Emails use
 * the reserved `.test` top-level domain; no mailbox exists. Only direct roles: MANAGER and SPENDING_APPROVER derive from
 * department and approval-role data and are never granted (operational-commands rule 6). The department comes first and the
 * Cost Center is created for it (`QĐ-87d`(1)); the people have no job title (it is optional free text, `QĐ-87e`) and nothing
 * here touches the Cost Center activation of the compatibility release, which the final code never reads.
 */
export const DEMO_COST_CENTER = { code: 'DEMO-CC', name: 'Demo cost center' } as const;
export const DEMO_DEPARTMENT = { code: 'DEMO', name: 'Demo department' } as const;
/** Before today wherever it runs, so a hire date check never refuses it. */
export const DEMO_HIRE_DATE = '2026-01-05';

export interface DemoPerson {
  employeeCode: string;
  fullName: string;
  workEmail: string;
  role: DemoAccountRole;
}

export const DEMO_PEOPLE: readonly DemoPerson[] = [
  { employeeCode: 'DEMO-IT', fullName: 'Demo IT Admin', workEmail: 'it.admin@demo.slm.test', role: 'IT_ADMIN' },
  { employeeCode: 'DEMO-FIN', fullName: 'Demo Finance', workEmail: 'finance@demo.slm.test', role: 'FINANCE' },
  { employeeCode: 'DEMO-EMP', fullName: 'Demo Employee', workEmail: 'employee@demo.slm.test', role: 'EMPLOYEE' },
];

export const DEMO_ROLES: readonly DemoAccountRole[] = DEMO_PEOPLE.map((person) => person.role);
