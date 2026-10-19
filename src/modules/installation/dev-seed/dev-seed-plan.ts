import { normalizeDisplayName } from '../../../core/display-name';
import { normalizeEmail } from '../../../core/email';
import type { DemoAccountState } from '../../identity-access/identity-access.types';
import type { EmployeeImportLookupData, LocalSeedFixtureFacts } from '../../organization/organization.types';
import { DEMO_COST_CENTER, DEMO_DEPARTMENT, DEMO_HIRE_DATE, DEMO_JOB_TITLE, DEMO_PEOPLE } from './dev-seed.fixture';
import { PlannedItem, SeedConflict, SeedPlan } from './dev-seed.types';

/** How organization compares job titles (T-12): the display name, lowercased. */
export const DEMO_JOB_TITLE_KEY = normalizeDisplayName(DEMO_JOB_TITLE).toLowerCase();

/** The display name each fixture item is stored and compared with (T-12): accents composed, whitespace collapsed. */
const COST_CENTER_NAME = normalizeDisplayName(DEMO_COST_CENTER.name);
const DEPARTMENT_NAME = normalizeDisplayName(DEMO_DEPARTMENT.name);
const JOB_TITLE_NAME = normalizeDisplayName(DEMO_JOB_TITLE);

/** The stable keys of the three organization fixture items (OrganizationService.readLocalSeedFixture). */
export const DEMO_FIXTURE_KEYS = {
  costCenterCode: DEMO_COST_CENTER.code,
  departmentCode: DEMO_DEPARTMENT.code,
  normalizedJobTitleName: DEMO_JOB_TITLE_KEY,
};

/** What the people lookup is asked for: the demo codes and emails only (the fixture items are read on their own). */
export const DEMO_PEOPLE_LOOKUP = {
  departmentCodes: [],
  normalizedJobTitleNames: [],
  employeeCodes: DEMO_PEOPLE.map((person) => person.employeeCode),
  normalizedEmails: DEMO_PEOPLE.map((person) => normalizeEmail(person.workEmail)),
};

const item = (kind: PlannedItem['kind'], key: string, conflict: SeedConflict | null, exists: boolean): PlannedItem =>
  conflict !== null
    ? { kind, key, action: 'conflict', reason: conflict }
    : exists
      ? { kind, key, action: 'present' }
      : { kind, key, action: 'create' };

/** How an existing DEMO-CC differs from the fixture, first difference first; null when it matches. */
function costCenterConflict(costCenter: NonNullable<LocalSeedFixtureFacts['costCenter']>): SeedConflict | null {
  if (costCenter.name !== COST_CENTER_NAME) return 'COST_CENTER_NAME_DIFFERS';
  if (costCenter.kind !== 'UNIT') return 'COST_CENTER_NOT_UNIT';
  if (costCenter.status !== 'ACTIVE') return 'COST_CENTER_INACTIVE';
  // A UNIT cost center carries one department: charged to another, DEMO can never be created or kept on it.
  if (costCenter.departmentCode !== null && costCenter.departmentCode !== DEMO_DEPARTMENT.code)
    return 'COST_CENTER_IN_USE';
  return null;
}

/** How an existing DEMO department differs from the fixture; null when it matches. */
function departmentConflict(department: NonNullable<LocalSeedFixtureFacts['department']>): SeedConflict | null {
  if (department.costCenterCode !== DEMO_COST_CENTER.code) return 'DEPARTMENT_COST_CENTER_DIFFERS';
  if (department.name !== DEPARTMENT_NAME) return 'DEPARTMENT_NAME_DIFFERS';
  if (department.status !== 'ACTIVE') return 'DEPARTMENT_INACTIVE';
  return null;
}

/** How an existing Demo staff job title differs from the fixture; null when it matches. */
function jobTitleConflict(jobTitle: NonNullable<LocalSeedFixtureFacts['jobTitle']>): SeedConflict | null {
  if (jobTitle.name !== JOB_TITLE_NAME) return 'JOB_TITLE_NAME_DIFFERS';
  if (jobTitle.status !== 'ACTIVE') return 'JOB_TITLE_INACTIVE';
  return null;
}

/**
 * The plan of a seed run, from what exists (P23-RV-01). Each fixture item is compared by its stable key on every field
 * the fixture fixes: matching exactly is present, missing is created (a Department on an exact Cost Center that exists
 * already), and any difference is a specific conflict, never repaired. Items are in write order.
 */
export function buildSeedPlan(
  organizationId: string,
  fixture: LocalSeedFixtureFacts,
  lookup: EmployeeImportLookupData,
  accounts: ReadonlyMap<string, DemoAccountState>,
): SeedPlan {
  const { costCenter, department, jobTitle } = fixture;
  const items: PlannedItem[] = [
    item('COST_CENTER', DEMO_COST_CENTER.code, costCenter && costCenterConflict(costCenter), costCenter !== null),
    item('DEPARTMENT', DEMO_DEPARTMENT.code, department && departmentConflict(department), department !== null),
    item('JOB_TITLE', DEMO_JOB_TITLE, jobTitle && jobTitleConflict(jobTitle), jobTitle !== null),
  ];

  const employeeIds = new Map<string, string>();
  for (const person of DEMO_PEOPLE) {
    const existing = lookup.employees.find((employee) => employee.employeeCode === person.employeeCode) ?? null;
    const email = normalizeEmail(person.workEmail);
    if (existing !== null) {
      employeeIds.set(person.employeeCode, existing.id);
      const asWanted =
        existing.fullName === person.fullName &&
        existing.workEmail !== null &&
        normalizeEmail(existing.workEmail) === email &&
        existing.employmentType === 'STAFF' &&
        existing.hireDate === DEMO_HIRE_DATE &&
        existing.departmentCode === DEMO_DEPARTMENT.code &&
        existing.jobTitleName === JOB_TITLE_NAME;
      items.push(
        asWanted
          ? { kind: 'EMPLOYEE', key: person.employeeCode, action: 'present' }
          : { kind: 'EMPLOYEE', key: person.employeeCode, action: 'conflict', reason: 'EMPLOYEE_DIFFERS' },
      );
    } else {
      const owner = lookup.emailOwners.find((candidate) => candidate.normalizedEmail === email);
      items.push(
        owner === undefined
          ? { kind: 'EMPLOYEE', key: person.employeeCode, action: 'create' }
          : { kind: 'EMPLOYEE', key: person.employeeCode, action: 'conflict', reason: 'WORK_EMAIL_TAKEN' },
      );
    }

    const account = accounts.get(person.employeeCode) ?? { state: 'absent' };
    items.push(
      account.state === 'absent'
        ? { kind: 'ACCOUNT', key: person.employeeCode, action: 'create' }
        : account.state === 'present'
          ? { kind: 'ACCOUNT', key: person.employeeCode, action: 'present' }
          : { kind: 'ACCOUNT', key: person.employeeCode, action: 'conflict', reason: account.reason },
    );
  }

  return {
    organizationId,
    costCenterId: costCenter?.id ?? null,
    departmentId: department?.id ?? null,
    jobTitleId: jobTitle?.id ?? null,
    employeeIds,
    items,
  };
}

/** Two plans agree when every item has the same action: what the locked re-read compares against the first read. */
export function samePlan(first: SeedPlan, again: SeedPlan): boolean {
  const signature = (plan: SeedPlan) =>
    plan.items.map((entry) => `${entry.kind}:${entry.key}:${entry.action}`).join('|');
  return signature(first) === signature(again);
}
