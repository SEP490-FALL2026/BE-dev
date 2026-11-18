import type { EmployeeRecord } from '../../organization/public/organization.types';
import { planProfileCorrection } from './profile-correction.policy';
import type { ProfileCorrection } from '../public/super-admin-event.types';

const TODAY = '2026-10-28';
const current: EmployeeRecord = {
  id: 'e1',
  organizationId: 'o1',
  employeeCode: 'E-SA',
  fullName: 'Admin Person',
  workEmail: 'admin@acme.vn',
  employmentType: 'STAFF',
  status: 'ACTIVE',
  workState: 'WORKING',
  hireDate: '2026-01-05',
  jobTitle: 'Administrator',
};
const correction = (fields: Omit<ProfileCorrection, 'mode'>): ProfileCorrection => ({
  mode: 'profile-correct',
  ...fields,
});
const plan = (fields: Omit<ProfileCorrection, 'mode'>, record: EmployeeRecord = current) =>
  planProfileCorrection(record, correction(fields), TODAY);

describe('the correction of the record of the Super Admin: what it changes and what it refuses (US-02-02 AC-19, QĐ-87c)', () => {
  it('changes only the fields that differ and keeps what each was', () => {
    expect(plan({ fullName: 'Admin Person Two', employmentType: 'STAFF', jobTitle: 'Administrator' })).toEqual({
      changes: { fullName: 'Admin Person Two' },
      before: { fullName: 'Admin Person' },
      reasons: [],
      workEmailToCheck: null,
    });
  });

  it('stores the display form of a name and of a title: composed accents, trimmed ends, one space between words', () => {
    const composed = 'Nguyễn  Van   An ';

    expect(plan({ fullName: composed, jobTitle: '  Chief   of  admin ' }).changes).toEqual({
      fullName: 'Nguyễn Van An',
      jobTitle: 'Chief of admin',
    });
  });

  it('is nothing when nothing differs, even when the same email is typed in another case or with spaces', () => {
    const result = plan({ fullName: 'Admin Person', workEmail: ' Admin@ACME.vn ', jobTitle: 'Administrator' });

    expect(result.changes).toEqual({});
    expect(result.reasons).toEqual([]);
    expect(result.workEmailToCheck).toBeNull();
  });

  it('asks whether somebody else has a work email that changes, by its normalized form, and keeps the typed text', () => {
    expect(plan({ workEmail: ' New.Admin@Acme.vn ' })).toMatchObject({
      changes: { workEmail: 'New.Admin@Acme.vn' },
      before: { workEmail: 'admin@acme.vn' },
      workEmailToCheck: 'new.admin@acme.vn',
    });
  });

  it('clears the work email and the job title with null, and asks nobody about an email that is gone', () => {
    expect(plan({ workEmail: null, jobTitle: null })).toEqual({
      changes: { workEmail: null, jobTitle: null },
      before: { workEmail: 'admin@acme.vn', jobTitle: 'Administrator' },
      reasons: [],
      workEmailToCheck: null,
    });
    expect(plan({ jobTitle: null }, { ...current, jobTitle: null }).changes).toEqual({});
    expect(plan({ jobTitle: '   ' }, { ...current, jobTitle: null }).changes).toEqual({});
  });

  it('refuses a work email that cannot be normalized', () => {
    expect(plan({ workEmail: 'not an email' }).reasons).toEqual(['WORK_EMAIL_INVALID']);
  });

  it.each([
    ['a hire date that has come, whatever the new one', current, '2026-12-01', ['HIRE_DATE_LOCKED']],
    [
      'a hire date that has not come, moved to the past',
      { ...current, hireDate: '2026-12-01' },
      '2026-10-01',
      ['HIRE_DATE_IN_PAST'],
    ],
    [
      'a hire date that has not come, moved to a day that has',
      { ...current, hireDate: '2026-12-01' },
      '2026-11-15',
      [],
    ],
  ])('judges %s', (_name, record, hireDate, reasons) => {
    const result = plan({ hireDate }, record);

    expect(result.reasons).toEqual(reasons);
    expect(Object.keys(result.changes)).toEqual(reasons.length === 0 ? ['hireDate'] : []);
  });

  it('bounds a job title at 255 characters, counting characters and not code units', () => {
    expect(plan({ jobTitle: 'x'.repeat(255) }).reasons).toEqual([]);
    expect(plan({ jobTitle: 'x'.repeat(256) }).reasons).toEqual(['JOB_TITLE_TOO_LONG']);
    expect(plan({ jobTitle: '\u{1F600}'.repeat(255) }).reasons).toEqual([]);
  });

  it('gives the refusals in the order of the fields, so the first one is always the same', () => {
    const result = plan({ workEmail: 'not an email', hireDate: '2026-12-01', jobTitle: 'x'.repeat(300) });

    expect(result.reasons).toEqual(['WORK_EMAIL_INVALID', 'HIRE_DATE_LOCKED', 'JOB_TITLE_TOO_LONG']);
  });

  it('never changes the department, the status or the login email: they are not fields of a correction', () => {
    const everything = plan({
      fullName: 'A',
      workEmail: 'a@acme.vn',
      employmentType: 'INTERN',
      hireDate: '2026-12-31',
      jobTitle: 'B',
    });

    expect(Object.keys(everything.changes).sort()).toEqual(['employmentType', 'fullName', 'jobTitle', 'workEmail']);
  });
});
