import { mapSeatColumns } from './seat-baseline-rows';
import { TODAY, codesOf, judgeOne } from '../../../../test/support/seat-baseline-facts';

describe('mapSeatColumns', () => {
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

  it('asks for an account identifier, and refuses one with a space and one that looks like a secret (AC-9)', () => {
    expect(codesOf(judgeOne({ employee_code: 'E1', account_identifier: '' }))).toEqual(['ACCOUNT_IDENTIFIER_MISSING']);
    expect(codesOf(judgeOne({ employee_code: 'E1', account_identifier: 'e 1@congty.vn' }))).toEqual([
      'ACCOUNT_IDENTIFIER_INVALID',
    ]);
    expect(
      codesOf(
        judgeOne({
          employee_code: 'E1',
          kind: 'service',
          account_identifier: 'ghp_abc123',
          reason: 'CI',
          cost_center_code: 'CC-CORP',
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

describe('judgeSeatRows: a service account (AC-7)', () => {
  const bot = {
    employee_code: 'E2',
    account_identifier: 'ci-bot',
    kind: 'service',
    reason: 'CI pipeline',
    cost_center_code: 'CC-CORP',
  };

  it('is valid with a reason and a Company Cost Center, whose identifier need not be an email', () => {
    const result = judgeOne(bot);

    expect(result.outcome).toBe('VALID');
    expect(result.parsed).toMatchObject({
      kind: 'SERVICE',
      employeeId: 'e2',
      reason: 'CI pipeline',
      costCenterId: 'cc-corp',
    });
  });

  it('asks for a reason and a Cost Center, and for a Cost Center that exists, is in use and is a Company one', () => {
    expect(codesOf(judgeOne({ ...bot, reason: '' }))).toEqual(['REASON_REQUIRED']);
    expect(codesOf(judgeOne({ ...bot, cost_center_code: '' }))).toEqual(['COST_CENTER_REQUIRED']);
    expect(codesOf(judgeOne({ ...bot, cost_center_code: 'CC-NONE' }))).toEqual(['COST_CENTER_NOT_FOUND']);
    expect(codesOf(judgeOne({ ...bot, cost_center_code: 'CC-OLD' }))).toEqual(['COST_CENTER_INACTIVE']);
    expect(codesOf(judgeOne({ ...bot, cost_center_code: 'CC-A' }))).toEqual(['COST_CENTER_NOT_COMPANY']);
  });

  it('still asks an email identifier to be on a company domain', () => {
    expect(codesOf(judgeOne({ ...bot, account_identifier: 'bot@gmail.com' }))).toEqual(['NOT_COMPANY_ACCOUNT']);
    expect(judgeOne({ ...bot, account_identifier: 'bot@congty.vn' }).outcome).toBe('VALID');
  });

  it('does not take a Cost Center on a personal row: a personal seat is charged by the department of the holder', () => {
    expect(
      codesOf(judgeOne({ employee_code: 'E1', account_identifier: 'e1@congty.vn', cost_center_code: 'CC-CORP' })),
    ).toEqual(['COST_CENTER_NOT_ALLOWED']);
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
