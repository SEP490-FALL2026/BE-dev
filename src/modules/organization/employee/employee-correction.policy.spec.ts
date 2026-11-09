import { correctionOf, workEmailToCheck, type CorrectionCurrent } from './employee-correction.policy';

describe('employee-correction.policy (what a correction of the official fields changes and refuses, QĐ-82m, QĐ-87a, QĐ-87e)', () => {
  const current: CorrectionCurrent = {
    fullName: 'Nguyễn Văn A',
    workEmail: 'a@example.com',
    employmentType: 'STAFF',
    hireDate: '2026-12-01',
    jobTitle: null,
  };
  const facts = { today: '2026-10-30', workEmailTaken: false };

  describe('correctionOf', () => {
    it('changes nothing when every value given is the one on the record, and keeps the email as it was typed', () => {
      const result = correctionOf(
        current,
        { fullName: 'Nguyễn Văn A', workEmail: ' A@Example.com ', jobTitle: '' },
        facts,
      );

      expect(result.changes).toEqual({});
      expect(result.before).toEqual({});
      expect(result.reasons).toEqual([]);
      expect(result.typedWorkEmail).toBe('A@Example.com');
    });

    it('notes what was and what is, field by field, in the order of the screen', () => {
      const result = correctionOf(
        current,
        { jobTitle: '  Kế toán ', hireDate: '2026-11-15', workEmail: null, employmentType: 'INTERN', fullName: 'B' },
        facts,
      );

      expect(Object.keys(result.changes)).toEqual(['fullName', 'employmentType', 'workEmail', 'hireDate', 'jobTitle']);
      expect(result.changes).toEqual({
        fullName: 'B',
        employmentType: 'INTERN',
        workEmail: null,
        hireDate: '2026-11-15',
        jobTitle: 'Kế toán',
      });
      expect(result.before).toEqual({
        fullName: 'Nguyễn Văn A',
        employmentType: 'STAFF',
        workEmail: 'a@example.com',
        hireDate: '2026-12-01',
        jobTitle: null,
      });
      expect(result.reasons).toEqual([]);
    });

    it('refuses a work email somebody else has, and still notes it as the change asked for', () => {
      const result = correctionOf(current, { workEmail: 'b@example.com' }, { ...facts, workEmailTaken: true });

      expect(result.reasons).toEqual([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }]);
      expect(result.changes).toEqual({ workEmail: 'b@example.com' });
    });

    it.each([
      ['a hire date that has come cannot move', '2026-10-30', '2026-12-01', 'HIRE_DATE_LOCKED'],
      ['a hire date that is past cannot move', '2026-10-01', '2026-12-01', 'HIRE_DATE_LOCKED'],
      ['a new hire date cannot be in the past', '2026-12-01', '2026-10-29', 'HIRE_DATE_IN_PAST'],
    ])('refuses it: %s', (_label, hireDate, asked, code) => {
      const result = correctionOf({ ...current, hireDate }, { hireDate: asked }, facts);

      expect(result.reasons).toEqual([{ field: 'hireDate', code }]);
      expect(result.changes).toEqual({});
    });

    it('lets a hire date that has not come move to today or later', () => {
      expect(correctionOf(current, { hireDate: '2026-10-30' }, facts).changes).toEqual({ hireDate: '2026-10-30' });
    });

    it('bounds the job title by characters of its display form, clears it when blank, and leaves a title the same as it is', () => {
      const titled = { ...current, jobTitle: 'Kế toán' };

      expect(correctionOf(current, { jobTitle: 'x'.repeat(256) }, facts).reasons).toEqual([
        { field: 'jobTitle', code: 'JOB_TITLE_TOO_LONG' },
      ]);
      expect(correctionOf(current, { jobTitle: 'x'.repeat(255) }, facts).reasons).toEqual([]);
      expect(correctionOf(titled, { jobTitle: '   ' }, facts).changes).toEqual({ jobTitle: null });
      expect(correctionOf(titled, { jobTitle: 'Kế  toán' }, facts).changes).toEqual({});
    });
  });

  describe('workEmailToCheck', () => {
    it.each([
      ['no email asked', undefined, 'a@example.com', null],
      ['the same email in another case', 'A@EXAMPLE.com', 'a@example.com', null],
      ['the email cleared', null, 'a@example.com', null],
      ['an email that does not read as one', 'nope', 'a@example.com', null],
      ['another email', ' B@Example.com ', 'a@example.com', 'b@example.com'],
      ['an email on a record without one', 'b@example.com', null, 'b@example.com'],
    ])('is %s', (_label, asked, onRecord, expected) => {
      expect(workEmailToCheck(asked, onRecord)).toBe(expected);
    });
  });
});
