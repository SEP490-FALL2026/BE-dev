import { JOB_TITLE_MAX_LENGTH, PlacementFacts, isJobTitleTooLong, placementReasons } from './employee-placement.policy';

/*
 * The one decision the manual form, the import preview, the correction of a record and the transfer share —
 * whether the department a row names can take a person in (a department with no Cost Center does: QĐ-87d(3)), and whether the
 * job title (optional free text since QĐ-87e) fits. Every expectation is a literal: nothing here is computed by the policy or by an
 * adapter.
 */

const usable: PlacementFacts = {
  department: { named: true, found: { active: true } },
  jobTitle: { tooLong: false },
};

describe('placementReasons (BEH.1, T-16)', () => {
  it('has no reason when the department is named, found and in use and the title fits', () => {
    expect(placementReasons(usable)).toEqual([]);
  });

  describe('the department (US-02-03 AC-1, AC-5; US-04-09 AC-12)', () => {
    it.each<[string, NonNullable<PlacementFacts['department']>, string]>([
      ['named but not found', { named: true, found: null }, 'DEPARTMENT_NOT_FOUND'],
      ['retired', { named: true, found: { active: false } }, 'DEPARTMENT_INACTIVE'],
    ])('%s', (_name, department, code) => {
      expect(placementReasons({ ...usable, department })).toEqual([{ subject: 'DEPARTMENT', code }]);
    });

    it('takes a person in whether or not the department has a Cost Center: the fact is not asked (QĐ-87d(3), F44)', () => {
      expect(placementReasons({ department: { named: true, found: { active: true } } })).toEqual([]);
      // A caller that still passes the old fact is not refused for it.
      const found = { active: true, costCenterActive: false };

      expect(placementReasons({ department: { named: true, found } })).toEqual([]);
    });

    it('gives one reason only, the first in this order: required, not found, retired', () => {
      expect(placementReasons({ ...usable, department: { named: false, found: { active: false } } })).toEqual([]);
      expect(placementReasons({ ...usable, department: { named: true, found: { active: false } } })).toEqual([
        { subject: 'DEPARTMENT', code: 'DEPARTMENT_INACTIVE' },
      ]);
    });
  });

  describe('the job title: optional free text, only bounded (QĐ-87e)', () => {
    it('gives no reason for a title that fits, and none is needed: a missing title is not asked about', () => {
      expect(placementReasons({ ...usable, jobTitle: { tooLong: false } })).toEqual([]);
      expect(placementReasons({ department: usable.department })).toEqual([]);
    });

    it('refuses a title that is too long', () => {
      expect(placementReasons({ ...usable, jobTitle: { tooLong: true } })).toEqual([
        { subject: 'JOB_TITLE', code: 'JOB_TITLE_TOO_LONG' },
      ]);
    });

    it('is judged alone by a caller that has no department to judge (the correction of a record that has one)', () => {
      expect(placementReasons({ jobTitle: { tooLong: true } })).toEqual([
        { subject: 'JOB_TITLE', code: 'JOB_TITLE_TOO_LONG' },
      ]);
      expect(placementReasons({ jobTitle: { tooLong: false } })).toEqual([]);
    });
  });

  it('lists the department reason before the job title reason', () => {
    expect(placementReasons({ department: { named: true, found: null }, jobTitle: { tooLong: true } })).toEqual([
      { subject: 'DEPARTMENT', code: 'DEPARTMENT_NOT_FOUND' },
      { subject: 'JOB_TITLE', code: 'JOB_TITLE_TOO_LONG' },
    ]);
  });

  it('names no field or column: where a reason is shown belongs to each adapter', () => {
    const reasons = placementReasons({ department: { named: true, found: null }, jobTitle: { tooLong: true } });

    expect(reasons.map((reason) => Object.keys(reason).sort())).toEqual([
      ['code', 'subject'],
      ['code', 'subject'],
    ]);
  });
});

describe('isJobTitleTooLong (employees_job_title_shape: 255 characters, not UTF-16 units)', () => {
  it('accepts exactly the limit and refuses one more', () => {
    expect(JOB_TITLE_MAX_LENGTH).toBe(255);
    expect(isJobTitleTooLong('x'.repeat(255))).toBe(false);
    expect(isJobTitleTooLong('x'.repeat(256))).toBe(true);
  });

  it('counts a character outside the basic plane once, as the database does', () => {
    expect(isJobTitleTooLong('😀'.repeat(255))).toBe(false);
    expect(isJobTitleTooLong('😀'.repeat(256))).toBe(true);
  });
});
