import { lookupNamesOf, mapSeatColumns } from './seat-baseline-rows.policy';
import { TODAY, codesOf, judgeOne } from '../../../../test/support/seat-baseline-facts';

describe('mapSeatColumns', () => {
  it('ignores the columns of a service account that the file may still carry: reason and cost_center_code (QĐ-110m)', () => {
    const mapped = mapSeatColumns(['employee_code', 'account_identifier', 'kind', 'reason', 'cost_center_code']);

    expect(mapped.indexOf).toEqual({ employee_code: 0, account_identifier: 1, kind: 2 });
    expect(mapped.ignored).toEqual(['reason', 'cost_center_code']);
  });

  it('finds the columns by their names however the header is cased, spaced or dashed', () => {
    const mapped = mapSeatColumns(['Employee Code', 'ACCOUNT-IDENTIFIER', 'Kind', 'Notes']);

    expect(mapped.indexOf).toEqual({ employee_code: 0, account_identifier: 1, kind: 2 });
    expect(mapped.missing).toEqual([]);
    expect(mapped.ignored).toEqual(['Notes']);
  });

  it('names the required columns that are missing, and ignores a column that appears twice', () => {
    const mapped = mapSeatColumns(['employee_code', 'employee_code']);

    expect(mapped.missing).toEqual(['account_identifier']);
    expect(mapped.ignored).toEqual(['employee_code']);
  });
});

describe('judgeSeatRows: one valid personal row', () => {
  it('is valid with a recorded start (AC-8) when it has no grant date, and carries what to write', () => {
    const result = judgeOne({ employee_code: 'E1', account_identifier: 'E1@Congty.vn ' });

    expect(result.outcome).toBe('VALID');
    expect(result.errors).toEqual([]);
    expect(result.parsed).toEqual({
      kind: 'PERSONAL',
      employeeId: 'e1',
      accountIdentifier: 'E1@Congty.vn',
      reason: null,
      costCenterId: null,
      // The department of the person (E1 is in design), not of the subscription: the pool is every department's (QĐ-103d).
      owningDepartmentId: 'd-des',
      effectiveFrom: TODAY,
      effectiveFromBasis: 'RECORDED',
      expectedEndDate: null,
    });
  });

  it('keeps a real grant date as the start with the basis ACTUAL (AC-8)', () => {
    const result = judgeOne({ employee_code: 'E2', account_identifier: 'e2@congty.vn', granted_on: '2025-03-15' });

    expect(result.parsed).toMatchObject({ effectiveFrom: '2025-03-15', effectiveFromBasis: 'ACTUAL' });
  });
});

describe('judgeSeatRows: the person and the account', () => {
  it('refuses a person that is not in the organization and one who has left', () => {
    expect(codesOf(judgeOne({ employee_code: 'NOBODY', account_identifier: 'n@congty.vn' }))).toEqual([
      'EMPLOYEE_NOT_FOUND',
    ]);
    expect(codesOf(judgeOne({ employee_code: '', account_identifier: 'n@congty.vn' }))).toEqual(['EMPLOYEE_NOT_FOUND']);
    expect(codesOf(judgeOne({ employee_code: 'LEFT', account_identifier: 'l@congty.vn' }))).toEqual([
      'EMPLOYEE_NOT_ACTIVE',
    ]);
  });

  it('accepts lowercase employee_code and matches the uppercase employee in facts', () => {
    const result = judgeOne({ employee_code: 'e1', account_identifier: 'e1@congty.vn' });
    expect(result.outcome).toBe('VALID');
    expect(result.parsed?.employeeId).toBe('e1');
  });

  it('looks the people up by the uppercase code, whatever case and spacing the file used', () => {
    // The lookup reads the employees with a case-sensitive IN: a lowercase code would find nobody in production.
    expect(
      lookupNamesOf([
        { cells: { employee_code: ' nv-1 ' } },
        { cells: { employee_code: 'NV-1' } },
        { cells: { employee_code: 'Nv-2' } },
        { cells: { employee_code: '  ' } },
      ]),
    ).toEqual({ employeeCodes: ['NV-1', 'NV-2'] });
  });

  it('asks for an account identifier, and refuses one with a space and one that looks like a secret (AC-9)', () => {
    expect(codesOf(judgeOne({ employee_code: 'E1', account_identifier: '' }))).toEqual(['ACCOUNT_IDENTIFIER_MISSING']);
    expect(codesOf(judgeOne({ employee_code: 'E1', account_identifier: 'e 1@congty.vn' }))).toEqual([
      'ACCOUNT_IDENTIFIER_INVALID',
    ]);
    expect(
      codesOf(
        judgeOne({
          employee_code: 'E1',
          account_identifier: 'ghp_abc123',
        }),
      ),
    ).toEqual(['ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET']);
  });

  it('refuses a personal account that is not an email on a company domain (AC-13, FR-2.9)', () => {
    expect(codesOf(judgeOne({ employee_code: 'E4', account_identifier: 'e4@gmail.com' }))).toEqual([
      'NOT_COMPANY_ACCOUNT',
    ]);
    expect(codesOf(judgeOne({ employee_code: 'E4', account_identifier: 'e4' }))).toEqual(['NOT_COMPANY_ACCOUNT']);
    expect(judgeOne({ employee_code: 'E4', account_identifier: 'e4@congty.vn' }).outcome).toBe('VALID');
  });

  it('refuses a service account: there is none any more, the seat of an IT Admin is flagged after the grant (QĐ-110m)', () => {
    const bot = { employee_code: 'E2', account_identifier: 'ci-bot', kind: 'service', reason: 'CI pipeline' };

    expect(codesOf(judgeOne(bot))).toEqual(['SERVICE_ACCOUNT_NOT_SUPPORTED']);
    expect(codesOf(judgeOne({ ...bot, kind: ' Service ' }))).toEqual(['SERVICE_ACCOUNT_NOT_SUPPORTED']);
    expect(judgeOne(bot).parsed).toBeUndefined();
  });

  it('refuses a shared account (AC-14) and a kind it does not know, and takes the kind in any case', () => {
    expect(codesOf(judgeOne({ employee_code: 'E1', account_identifier: 'design@congty.vn', kind: 'shared' }))).toEqual([
      'SHARED_ACCOUNT_NOT_SUPPORTED',
    ]);
    expect(codesOf(judgeOne({ employee_code: 'E1', account_identifier: 'design@congty.vn', kind: 'Team' }))).toEqual([
      'KIND_INVALID',
    ]);
    expect(judgeOne({ employee_code: 'E1', account_identifier: 'e1@congty.vn', kind: ' PERSONAL ' }).outcome).toBe(
      'VALID',
    );
  });
});

describe('judgeSeatRows: where a personal seat is held (QĐ-103d)', () => {
  it('writes a personal seat with the department of the person, whoever owns the subscription (L3-06, QĐ-103d)', () => {
    const owned = (ownerDepartmentId: string | null) => ({
      target: { kind: 'SUBSCRIPTION' as const, purchasedQuantity: 100, ownerDepartmentId },
    });
    const own = { employee_code: 'E1', account_identifier: 'e1@congty.vn' };

    // E1 is a person of the design department: on the subscription of finance the seat is still design's, and the row is valid.
    expect(judgeOne(own, owned('d-fin'))).toMatchObject({ outcome: 'VALID', parsed: { owningDepartmentId: 'd-des' } });
    expect(judgeOne(own, owned('d-des')).parsed).toMatchObject({ owningDepartmentId: 'd-des' });
    expect(judgeOne(own, owned(null)).parsed).toMatchObject({ owningDepartmentId: 'd-des' });
  });

  it('writes no reason and no Cost Center: the columns of a service account are ignored, and a personal seat names none', () => {
    // The file still has the two columns: they are not read (`mapSeatColumns` ignores them), so the cells never carry them.
    const parsed = judgeOne({ employee_code: 'E1', account_identifier: 'e1@congty.vn' }).parsed;

    expect(parsed).toMatchObject({ kind: 'PERSONAL', reason: null, costCenterId: null });
  });
});

describe('judgeSeatRows: dates and time-limited staff (AC-4, AC-8, INV-07)', () => {
  it('refuses a grant date that is not a date or is in the future', () => {
    expect(
      codesOf(judgeOne({ employee_code: 'E1', account_identifier: 'e1@congty.vn', granted_on: '15/03/2025' })),
    ).toEqual(['GRANTED_ON_INVALID']);
    expect(
      codesOf(judgeOne({ employee_code: 'E1', account_identifier: 'e1@congty.vn', granted_on: '2026-02-30' })),
    ).toEqual(['GRANTED_ON_INVALID']);
    expect(
      codesOf(judgeOne({ employee_code: 'E1', account_identifier: 'e1@congty.vn', granted_on: '2026-10-02' })),
    ).toEqual(['GRANTED_ON_IN_FUTURE']);
    expect(judgeOne({ employee_code: 'E1', account_identifier: 'e1@congty.vn', granted_on: TODAY }).outcome).toBe(
      'VALID',
    );
  });

  it.each(['T1', 'T2', 'T3'])('asks %s, whose work is time-limited, for an expected end date', (code) => {
    expect(codesOf(judgeOne({ employee_code: code, account_identifier: `${code.toLowerCase()}@congty.vn` }))).toEqual([
      'EXPECTED_END_REQUIRED',
    ]);
    expect(
      judgeOne({
        employee_code: code,
        account_identifier: `${code.toLowerCase()}@congty.vn`,
        expected_end_date: '2027-03-31',
      }).outcome,
    ).toBe('VALID');
  });

  it('does not ask permanent staff for one, and refuses one that is not a date or is before the start', () => {
    expect(judgeOne({ employee_code: 'E1', account_identifier: 'e1@congty.vn' }).parsed?.expectedEndDate).toBeNull();
    expect(
      codesOf(judgeOne({ employee_code: 'E1', account_identifier: 'e1@congty.vn', expected_end_date: 'soon' })),
    ).toEqual(['EXPECTED_END_INVALID']);
    expect(
      codesOf(
        judgeOne({
          employee_code: 'E1',
          account_identifier: 'e1@congty.vn',
          granted_on: '2026-05-01',
          expected_end_date: '2026-04-30',
        }),
      ),
    ).toEqual(['EXPECTED_END_INVALID']);
  });
});

describe('judgeSeatRows: nobody holds a seat before the day they start (US-02-02 AC-15)', () => {
  const newcomer = (hireDate: string) =>
    new Map([['NEW', { id: 'e-new', status: 'ACTIVE', employmentType: 'STAFF', hireDate }]]);
  const row = { employee_code: 'NEW', account_identifier: 'new@congty.vn' };

  it('refuses a person who starts after today when the row names no grant date, as the seat would start today', () => {
    expect(codesOf(judgeOne(row, { employees: newcomer('2026-10-05') }))).toEqual(['EFFECTIVE_BEFORE_HIRE']);
  });

  it('refuses a grant date before the day the person started', () => {
    expect(codesOf(judgeOne({ ...row, granted_on: '2026-02-01' }, { employees: newcomer('2026-03-01') }))).toEqual([
      'EFFECTIVE_BEFORE_HIRE',
    ]);
  });

  it('accepts the day the person started, and any day after it', () => {
    expect(judgeOne({ ...row, granted_on: '2026-03-01' }, { employees: newcomer('2026-03-01') }).outcome).toBe('VALID');
    expect(judgeOne({ ...row, granted_on: '2026-03-02' }, { employees: newcomer('2026-03-01') }).outcome).toBe('VALID');
    expect(judgeOne(row, { employees: newcomer(TODAY) }).outcome).toBe('VALID');
  });

  it('does not add this error to a grant date that is already refused as invalid or in the future', () => {
    expect(codesOf(judgeOne({ ...row, granted_on: 'soon' }, { employees: newcomer('2026-10-05') }))).toEqual([
      'GRANTED_ON_INVALID',
    ]);
    expect(codesOf(judgeOne({ ...row, granted_on: '2026-10-03' }, { employees: newcomer('2026-10-05') }))).toEqual([
      'GRANTED_ON_IN_FUTURE',
    ]);
  });
});
