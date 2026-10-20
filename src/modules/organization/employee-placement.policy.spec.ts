import { PlacementFacts, placementReasons } from './employee-placement.policy';

/*
 * BEH.1 (A4-11): the one decision the manual form and the import preview share — whether the department (with its
 * cost center) and the job title a row names can take a person in. Every expectation is a literal: nothing here is
 * computed by the policy or by an adapter.
 */

const usable: PlacementFacts = {
  department: { named: true, found: { active: true, costCenterActive: true } },
  jobTitle: { named: true, found: { active: true } },
};

describe('placementReasons (BEH.1, T-16)', () => {
  it('has no reason when both are named, found and in use', () => {
    expect(placementReasons(usable)).toEqual([]);
  });

  describe('the department (US-02-03 AC-1, AC-5; US-04-09 AC-3)', () => {
    it.each<[string, PlacementFacts['department'], string]>([
      ['not named', { named: false, found: null }, 'DEPARTMENT_REQUIRED'],
      ['named but not found', { named: true, found: null }, 'DEPARTMENT_NOT_FOUND'],
      ['retired', { named: true, found: { active: false, costCenterActive: true } }, 'DEPARTMENT_INACTIVE'],
      [
        'charged to a retired cost center',
        { named: true, found: { active: true, costCenterActive: false } },
        'DEPARTMENT_COST_CENTER_INACTIVE',
      ],
    ])('%s', (_name, department, code) => {
      expect(placementReasons({ ...usable, department })).toEqual([{ subject: 'DEPARTMENT', code }]);
    });

    it('gives one reason only, the first in this order: required, not found, retired, retired cost center', () => {
      expect(
        placementReasons({
          ...usable,
          department: { named: false, found: { active: false, costCenterActive: false } },
        }),
      ).toEqual([{ subject: 'DEPARTMENT', code: 'DEPARTMENT_REQUIRED' }]);
      expect(
        placementReasons({ ...usable, department: { named: true, found: { active: false, costCenterActive: false } } }),
      ).toEqual([{ subject: 'DEPARTMENT', code: 'DEPARTMENT_INACTIVE' }]);
    });
  });

  describe('the job title (US-02-07 AC-7)', () => {
    it.each<[string, PlacementFacts['jobTitle'], string]>([
      ['not named', { named: false, found: null }, 'JOB_TITLE_REQUIRED'],
      ['named but not found', { named: true, found: null }, 'JOB_TITLE_NOT_FOUND'],
      ['retired', { named: true, found: { active: false } }, 'JOB_TITLE_INACTIVE'],
    ])('%s', (_name, jobTitle, code) => {
      expect(placementReasons({ ...usable, jobTitle })).toEqual([{ subject: 'JOB_TITLE', code }]);
    });

    it('is required even when something was found for it', () => {
      expect(placementReasons({ ...usable, jobTitle: { named: false, found: { active: false } } })).toEqual([
        { subject: 'JOB_TITLE', code: 'JOB_TITLE_REQUIRED' },
      ]);
    });
  });

  it('lists the department reason before the job title reason', () => {
    expect(
      placementReasons({
        department: { named: true, found: null },
        jobTitle: { named: true, found: { active: false } },
      }),
    ).toEqual([
      { subject: 'DEPARTMENT', code: 'DEPARTMENT_NOT_FOUND' },
      { subject: 'JOB_TITLE', code: 'JOB_TITLE_INACTIVE' },
    ]);
    expect(
      placementReasons({ department: { named: false, found: null }, jobTitle: { named: false, found: null } }),
    ).toEqual([
      { subject: 'DEPARTMENT', code: 'DEPARTMENT_REQUIRED' },
      { subject: 'JOB_TITLE', code: 'JOB_TITLE_REQUIRED' },
    ]);
  });

  it('names no field or column: where a reason is shown belongs to each adapter', () => {
    const reasons = placementReasons({
      department: { named: false, found: null },
      jobTitle: { named: true, found: null },
    });

    expect(reasons.map((reason) => Object.keys(reason).sort())).toEqual([
      ['code', 'subject'],
      ['code', 'subject'],
    ]);
  });
});
