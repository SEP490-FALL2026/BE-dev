import type { LocalSeedFixtureFacts } from '../../organization/organization.types';
import { DEMO_JOB_TITLE_KEY, buildSeedPlan } from './dev-seed-plan';

/**
 * P23-RV-01: the plan compares each fixture item by its stable key on every field the fixture fixes. Literal states:
 * absent, exact, and each kind of difference, including a Cost Center that exists without its Department.
 */
const costCenter = {
  id: 'cc-1',
  code: 'DEMO-CC',
  name: 'Demo cost center',
  kind: 'UNIT' as const,
  status: 'ACTIVE' as const,
  departmentCode: 'DEMO' as string | null,
};
const department = {
  id: 'd-1',
  code: 'DEMO',
  name: 'Demo department',
  status: 'ACTIVE' as const,
  costCenterId: 'cc-1',
  costCenterCode: 'DEMO-CC',
};
const jobTitle = { id: 'j-1', name: 'Demo staff', normalizedName: DEMO_JOB_TITLE_KEY, status: 'ACTIVE' as const };
const exact: LocalSeedFixtureFacts = { costCenter, department, jobTitle };
const none: LocalSeedFixtureFacts = { costCenter: null, department: null, jobTitle: null };
const people = { departments: [], jobTitles: [], employees: [], emailOwners: [] };

const items = (fixture: LocalSeedFixtureFacts) =>
  buildSeedPlan('org-1', fixture, people, new Map())
    .items.filter((item) => item.kind !== 'EMPLOYEE' && item.kind !== 'ACCOUNT')
    .map((item) =>
      item.action === 'conflict' ? `${item.kind} conflict ${item.reason}` : `${item.kind} ${item.action}`,
    );

describe('buildSeedPlan: Cost Center, Department and Job Title by stable key', () => {
  it('creates all three when none exists', () => {
    expect(items(none)).toEqual(['COST_CENTER create', 'DEPARTMENT create', 'JOB_TITLE create']);
  });

  it('finds all three present only when every fixed field matches', () => {
    expect(items(exact)).toEqual(['COST_CENTER present', 'DEPARTMENT present', 'JOB_TITLE present']);
  });

  it('reuses an exact Cost Center that has no Department yet and creates only the Department', () => {
    const plan = buildSeedPlan(
      'org-1',
      { ...exact, costCenter: { ...costCenter, departmentCode: null }, department: null },
      people,
      new Map(),
    );

    expect(items({ ...exact, costCenter: { ...costCenter, departmentCode: null }, department: null })).toEqual([
      'COST_CENTER present',
      'DEPARTMENT create',
      'JOB_TITLE present',
    ]);
    expect(plan.costCenterId).toBe('cc-1');
    expect(plan.departmentId).toBeNull();
  });

  it.each([
    ['another name', { name: 'Demo Cost Center' }, 'COST_CENTER_NAME_DIFFERS'],
    ['a COMPANY kind', { kind: 'COMPANY' as const }, 'COST_CENTER_NOT_UNIT'],
    ['an inactive state', { status: 'INACTIVE' as const }, 'COST_CENTER_INACTIVE'],
  ])('refuses a DEMO-CC with %s', (_case, change, reason) => {
    expect(items({ ...exact, costCenter: { ...costCenter, ...change } })[0]).toBe(`COST_CENTER conflict ${reason}`);
  });

  it('refuses a DEMO-CC charged to another department, so DEMO cannot be created on it', () => {
    expect(items({ ...exact, costCenter: { ...costCenter, departmentCode: 'OTHER' }, department: null })).toEqual([
      'COST_CENTER conflict COST_CENTER_IN_USE',
      'DEPARTMENT create',
      'JOB_TITLE present',
    ]);
  });

  it.each([
    ['another name', { name: 'Demo Department' }, 'DEPARTMENT_NAME_DIFFERS'],
    ['an inactive state', { status: 'INACTIVE' as const }, 'DEPARTMENT_INACTIVE'],
    [
      'a link to another Cost Center',
      { costCenterId: 'cc-9', costCenterCode: 'OTHER-CC' },
      'DEPARTMENT_COST_CENTER_DIFFERS',
    ],
  ])('refuses a DEMO department with %s', (_case, change, reason) => {
    expect(items({ ...exact, department: { ...department, ...change } })[1]).toBe(`DEPARTMENT conflict ${reason}`);
  });

  it('refuses a DEMO department on another Cost Center while DEMO-CC is missing', () => {
    expect(
      items({
        ...exact,
        costCenter: null,
        department: { ...department, costCenterId: 'cc-9', costCenterCode: 'OTHER-CC' },
      }),
    ).toEqual(['COST_CENTER create', 'DEPARTMENT conflict DEPARTMENT_COST_CENTER_DIFFERS', 'JOB_TITLE present']);
  });

  it.each([
    ['the same key with another display name', { name: 'demo  Staff' }, 'JOB_TITLE_NAME_DIFFERS'],
    ['an inactive state', { status: 'INACTIVE' as const }, 'JOB_TITLE_INACTIVE'],
  ])('refuses a Demo staff job title with %s', (_case, change, reason) => {
    expect(items({ ...exact, jobTitle: { ...jobTitle, ...change } })[2]).toBe(`JOB_TITLE conflict ${reason}`);
  });

  it('keeps the ids it can write against: the existing Cost Center, Department and Job Title', () => {
    expect(buildSeedPlan('org-1', exact, people, new Map())).toMatchObject({
      costCenterId: 'cc-1',
      departmentId: 'd-1',
      jobTitleId: 'j-1',
    });
  });
});
