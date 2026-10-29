import type { LocalSeedFixtureFacts } from '../../organization/public/organization.types';
import { buildSeedPlan } from './dev-seed-plan.policy';

/**
 * P23-RV-01: the plan compares each fixture item by its stable key on every field the fixture fixes. Literal states:
 * absent, exact, and each kind of difference. Since `QĐ-87d(1)` the department comes first and its Cost Center is created
 * for it; a Cost Center that belongs to no department is never repaired here.
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
  costCenterId: 'cc-1' as string | null,
  costCenterCode: 'DEMO-CC' as string | null,
};
/**
 * The facts the plan reads are the two fixture items: the activation of the compatibility release is not read any more (the final
 * code never reads it), so a fixture is built from those two only.
 */
const fixtureOf = (parts: Pick<LocalSeedFixtureFacts, 'costCenter' | 'department'>): LocalSeedFixtureFacts =>
  parts as LocalSeedFixtureFacts;
const exact = fixtureOf({ costCenter, department });
const none = fixtureOf({ costCenter: null, department: null });
const people = { departments: [], employees: [], emailOwners: [] };

const items = (fixture: LocalSeedFixtureFacts) =>
  buildSeedPlan('org-1', fixture, people, new Map())
    .items.filter((item) => item.kind !== 'EMPLOYEE' && item.kind !== 'ACCOUNT')
    .map((item) =>
      item.action === 'conflict' ? `${item.kind} conflict ${item.reason}` : `${item.kind} ${item.action}`,
    );

describe('buildSeedPlan: Department and its Cost Center by stable key', () => {
  it('creates both, the department before its Cost Center, when none exists; no activation of the link is planned', () => {
    expect(items(none)).toEqual(['DEPARTMENT create', 'COST_CENTER create']);
  });

  it('finds both present only when every fixed field matches', () => {
    expect(items(exact)).toEqual(['DEPARTMENT present', 'COST_CENTER present']);
  });

  it('creates only the Cost Center for a DEMO department that exists without one (`QĐ-87d(1)`)', () => {
    const fixture = fixtureOf({
      costCenter: null,
      department: { ...department, costCenterId: null, costCenterCode: null },
    });
    const plan = buildSeedPlan('org-1', fixture, people, new Map());

    expect(items(fixture)).toEqual(['DEPARTMENT present', 'COST_CENTER create']);
    expect(plan.departmentId).toBe('d-1');
    expect(plan.costCenterId).toBeNull();
  });

  it('never plans an activation of the Cost Center link: no item of the plan is about it', () => {
    const plan = buildSeedPlan('org-1', none, people, new Map());

    expect(plan.items.map((item) => item.kind)).not.toContain('COST_CENTER_DIRECTION');
    expect(plan.items.slice(0, 2).map((item) => item.kind)).toEqual(['DEPARTMENT', 'COST_CENTER']);
  });

  it.each([
    ['another name', { name: 'Demo Cost Center' }, 'COST_CENTER_NAME_DIFFERS'],
    ['a COMPANY kind (no longer a possible kind)', { kind: 'COMPANY' as unknown as 'UNIT' }, 'COST_CENTER_NOT_UNIT'],
    ['an inactive state', { status: 'INACTIVE' as const }, 'COST_CENTER_INACTIVE'],
  ])('refuses a DEMO-CC with %s', (_case, change, reason) => {
    expect(items(fixtureOf({ costCenter: { ...costCenter, ...change }, department }))[1]).toBe(
      `COST_CENTER conflict ${reason}`,
    );
  });

  it('refuses a DEMO-CC that belongs to another department, so DEMO cannot be created on it', () => {
    expect(items(fixtureOf({ costCenter: { ...costCenter, departmentCode: 'OTHER' }, department: null }))).toEqual([
      'DEPARTMENT create',
      'COST_CENTER conflict COST_CENTER_IN_USE',
    ]);
  });

  it('refuses a DEMO-CC that belongs to no department: it is not repaired here, only `ops:cost-center-direction link` links it', () => {
    expect(items(fixtureOf({ costCenter: { ...costCenter, departmentCode: null }, department: null }))).toEqual([
      'DEPARTMENT create',
      'COST_CENTER conflict COST_CENTER_UNLINKED',
    ]);
  });

  it.each([
    ['another name', { name: 'Demo Department' }, 'DEPARTMENT_NAME_DIFFERS'],
    ['an inactive state', { status: 'INACTIVE' as const }, 'DEPARTMENT_INACTIVE'],
    [
      'another Cost Center in use',
      { costCenterId: 'cc-9', costCenterCode: 'OTHER-CC' },
      'DEPARTMENT_COST_CENTER_DIFFERS',
    ],
  ])('refuses a DEMO department with %s', (_case, change, reason) => {
    expect(items(fixtureOf({ costCenter, department: { ...department, ...change } }))[0]).toBe(
      `DEPARTMENT conflict ${reason}`,
    );
  });

  it('refuses a DEMO department on another Cost Center while DEMO-CC is missing', () => {
    expect(
      items(
        fixtureOf({
          costCenter: null,
          department: { ...department, costCenterId: 'cc-9', costCenterCode: 'OTHER-CC' },
        }),
      ),
    ).toEqual(['DEPARTMENT conflict DEPARTMENT_COST_CENTER_DIFFERS', 'COST_CENTER create']);
  });

  it('keeps the ids it can write against: the existing Cost Center and Department', () => {
    expect(buildSeedPlan('org-1', exact, people, new Map())).toMatchObject({
      costCenterId: 'cc-1',
      departmentId: 'd-1',
    });
  });
});
