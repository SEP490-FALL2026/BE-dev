import { REVOCATION_SOURCES, type RevocationSource } from '../public/licensing.types';
import {
  allowedValues,
  confirmationCovers,
  confirmedRoleOf,
  confirmerOf,
  gateOf,
  isValueAllowed,
  requirementOf,
  requiresConfirmation,
  shortDueOn,
  takesOver,
  type DutyFacts,
} from './handover-confirmer.policy';

const HEAD = 'head-1';
const person = 'person-1';
const fact = (source: RevocationSource, decidedByEmployeeId: string | null = null) => ({ source, decidedByEmployeeId });

describe('the table of who confirms a handover (US-07-09)', () => {
  // The rows of the table of the spec, one for each source and each loss of data.
  const rows: [RevocationSource, string | null, string, boolean, boolean][] = [
    // source, decided by, role, needs confirmation without data loss, with data loss
    ['DEPARTURE', null, 'DEPARTMENT_HEAD', true, true],
    ['ABRUPT_DEPARTURE', null, 'DEPARTMENT_HEAD', false, true],
    ['RETURN', person, 'REQUESTER', false, true],
    ['MANAGER_NOT_NEEDED', HEAD, 'DEPARTMENT_HEAD', false, true],
    ['GHOST_SEAT', HEAD, 'DEPARTMENT_HEAD', false, true],
    ['TRANSFER_REVIEW', null, 'DEPARTMENT_HEAD', false, true],
    // After the installation the head of the holder's department decides, as the new head does after a transfer (US-07-09 row 5).
    ['POST_SETUP_REVIEW', null, 'DEPARTMENT_HEAD', false, true],
    ['TIME_LIMITED_EXPIRY', null, 'IT_ADMIN', false, true],
    ['SUBSCRIPTION_REDUCTION', null, 'IT_ADMIN', false, true],
    ['SUBSCRIPTION_CANCELLATION', null, 'IT_ADMIN', false, true],
    ['SUBSCRIPTION_EXPIRED', null, 'IT_ADMIN', false, true],
    ['NOT_LEGALIZED', null, 'IT_ADMIN', false, true],
    ['RE_EXECUTION', null, 'IT_ADMIN', false, true],
  ];

  it('covers every source of a revocation', () => {
    expect(rows.map(([source]) => source).sort()).toEqual([...REVOCATION_SOURCES].sort());
  });

  it.each(rows)(
    '%s: the role %s... asks for a confirmation only where the table says so',
    (source, by, role, plain, loss) => {
      expect(requiresConfirmation(source, false)).toBe(plain);
      expect(requiresConfirmation(source, true)).toBe(loss);
      expect(requirementOf([fact(source, by)], false)?.role ?? null).toBe(plain ? role : null);
      expect(requirementOf([fact(source, by)], true)).toEqual({ source, role, fixedEmployeeId: by });
    },
  );

  it('a decision fixes the person only for a return and for the head who decided', () => {
    expect(requirementOf([fact('RETURN', person)], true)?.fixedEmployeeId).toBe(person);
    expect(requirementOf([fact('GHOST_SEAT', HEAD)], true)?.fixedEmployeeId).toBe(HEAD);
    expect(requirementOf([fact('TRANSFER_REVIEW', 'someone')], true)?.fixedEmployeeId).toBeNull();
    expect(requirementOf([fact('DEPARTURE', 'someone')], true)?.fixedEmployeeId).toBeNull();
    expect(requirementOf([fact('SUBSCRIPTION_REDUCTION', 'it')], true)?.fixedEmployeeId).toBeNull();
    // A return that does not know who sent it has nobody to ask.
    expect(requirementOf([fact('RETURN')], true)).toBeNull();
  });

  it.each([
    'SUBSCRIPTION_REDUCTION',
    'SUBSCRIPTION_CANCELLATION',
    'SUBSCRIPTION_EXPIRED',
    'TIME_LIMITED_EXPIRY',
    'RE_EXECUTION',
  ] as const)(
    'a ghost seat that %s also asks for is confirmed by the head who decided, the IT Admin never (QĐ-64a)',
    (other) => {
      const forward = requirementOf([fact(other), fact('GHOST_SEAT', HEAD)], true);
      const backward = requirementOf([fact('GHOST_SEAT', HEAD), fact(other)], true);

      expect(forward).toEqual({ source: 'GHOST_SEAT', role: 'DEPARTMENT_HEAD', fixedEmployeeId: HEAD });
      expect(backward).toEqual(forward);
    },
  );

  it('the seat of a ghost that no plan loses data on is confirmed by nobody, the reduced seat of a plan that does is by the IT Admin', () => {
    expect(requirementOf([fact('GHOST_SEAT', HEAD), fact('SUBSCRIPTION_REDUCTION')], false)).toBeNull();
    expect(requirementOf([fact('SUBSCRIPTION_REDUCTION')], true)?.role).toBe('IT_ADMIN');
  });

  it('a departure of the person and a later reason of the IT Admin stay with the head', () => {
    expect(requirementOf([fact('DEPARTURE'), fact('SUBSCRIPTION_CANCELLATION')], false)?.role).toBe('DEPARTMENT_HEAD');
  });

  it('only a departure may say the data was handed over or not needed, every other source says it was handled', () => {
    expect(allowedValues('DEPARTURE')).toEqual(['HANDED_OVER', 'NOT_NEEDED']);
    expect(allowedValues('ABRUPT_DEPARTURE')).toEqual(['HANDED_OVER', 'NOT_NEEDED']);
    for (const source of REVOCATION_SOURCES.filter((one) => !one.endsWith('DEPARTURE'))) {
      expect(allowedValues(source)).toEqual(['HANDLED']);
    }
    expect(isValueAllowed('DEPARTURE', 'HANDLED')).toBe(false);
    expect(isValueAllowed('RETURN', 'HANDED_OVER')).toBe(false);
    expect(isValueAllowed('RETURN', 'HANDLED')).toBe(true);
    expect(isValueAllowed('DEPARTURE', 'whatever')).toBe(false);
  });

  it('an open duty of the IT Admin is taken over by a head, never the other way', () => {
    const head = { source: 'GHOST_SEAT', role: 'DEPARTMENT_HEAD', fixedEmployeeId: HEAD } as const;
    const it = { source: 'RE_EXECUTION', role: 'IT_ADMIN', fixedEmployeeId: null } as const;

    expect(takesOver({ role: 'IT_ADMIN' }, head)).toBe(true);
    expect(takesOver({ role: 'DEPARTMENT_HEAD' }, it)).toBe(false);
    expect(takesOver({ role: 'IT_ADMIN' }, it)).toBe(false);
    expect(takesOver({ role: 'REQUESTER' }, head)).toBe(false);
  });

  it('a confirmation already written answers the same role, and the head who decided only by the same person', () => {
    const head = { source: 'DEPARTURE', role: 'DEPARTMENT_HEAD', fixedEmployeeId: null } as const;
    const decided = { source: 'GHOST_SEAT', role: 'DEPARTMENT_HEAD', fixedEmployeeId: HEAD } as const;
    const it = { source: 'RE_EXECUTION', role: 'IT_ADMIN', fixedEmployeeId: null } as const;

    expect(confirmationCovers({ role: 'DEPARTMENT_HEAD', byEmployeeId: HEAD }, head)).toBe(true);
    expect(confirmationCovers({ role: 'DESIGNATED_SUCCESSOR', byEmployeeId: HEAD }, head)).toBe(true);
    expect(confirmationCovers({ role: 'IT_ADMIN', byEmployeeId: 'it' }, head)).toBe(false);
    expect(confirmationCovers({ role: 'DEPARTMENT_HEAD', byEmployeeId: HEAD }, decided)).toBe(true);
    expect(confirmationCovers({ role: 'DEPARTMENT_HEAD', byEmployeeId: 'other' }, decided)).toBe(false);
    expect(confirmationCovers({ role: 'DEPARTMENT_HEAD', byEmployeeId: HEAD }, it)).toBe(true);
    expect(confirmationCovers({ role: 'REQUESTER', byEmployeeId: person }, head)).toBe(false);
  });
});

describe('who a duty falls to, read from the organization when asked', () => {
  const duty = (patch: Partial<DutyFacts> = {}): DutyFacts => ({
    confirmerRole: 'DEPARTMENT_HEAD',
    confirmerEmployeeId: null,
    leaverIsHead: false,
    employeeId: 'leaver',
    ...patch,
  });

  it('is the head of the department today, whoever it is when the duty is asked about', () => {
    expect(confirmerOf(duty(), { headTodayId: 'h1', headOnResolveDayId: null })).toEqual({
      employeeId: 'h1',
      waiting: null,
    });
    expect(confirmerOf(duty(), { headTodayId: 'h4', headOnResolveDayId: null }).employeeId).toBe('h4');
  });

  it('waits with nobody named while the department has no head, and when the head leaves with no successor', () => {
    expect(confirmerOf(duty(), { headTodayId: null, headOnResolveDayId: 'x' })).toEqual({
      employeeId: null,
      waiting: 'NO_HEAD',
    });
    expect(confirmerOf(duty({ leaverIsHead: true }), { headTodayId: 'leaver', headOnResolveDayId: null })).toEqual({
      employeeId: null,
      waiting: 'NO_SUCCESSOR',
    });
  });

  it('is the successor designated for the day after the last day when the person who leaves is the head', () => {
    expect(confirmerOf(duty({ leaverIsHead: true }), { headTodayId: 'leaver', headOnResolveDayId: 'h5' })).toEqual({
      employeeId: 'h5',
      waiting: null,
    });
  });

  it('is never the person who leaves, even when they are still the head of the day', () => {
    expect(confirmerOf(duty(), { headTodayId: 'leaver', headOnResolveDayId: null }).employeeId).toBeNull();
    expect(confirmerOf(duty({ leaverIsHead: true }), { headTodayId: 'leaver', headOnResolveDayId: 'leaver' })).toEqual({
      employeeId: null,
      waiting: 'NO_SUCCESSOR',
    });
  });

  it('is the person a decision fixed, and no one is looked for when the IT Admin confirms', () => {
    expect(
      confirmerOf(duty({ confirmerRole: 'REQUESTER', confirmerEmployeeId: 'e1' }), {
        headTodayId: 'h1',
        headOnResolveDayId: null,
      }),
    ).toEqual({ employeeId: 'e1', waiting: null });
    expect(confirmerOf(duty({ confirmerRole: 'IT_ADMIN' }), { headTodayId: null, headOnResolveDayId: null })).toEqual({
      employeeId: null,
      waiting: null,
    });
  });

  it('says a successor who is not yet the head confirms as the designated successor', () => {
    const leaving = duty({ leaverIsHead: true });

    expect(confirmedRoleOf(leaving, 'h5', 'leaver')).toBe('DESIGNATED_SUCCESSOR');
    expect(confirmedRoleOf(leaving, 'h5', 'h5')).toBe('DEPARTMENT_HEAD');
    expect(confirmedRoleOf(duty(), 'h1', 'h1')).toBe('DEPARTMENT_HEAD');
    expect(confirmedRoleOf(duty({ confirmerRole: 'REQUESTER', confirmerEmployeeId: 'e1' }), 'e1', 'h1')).toBe(
      'REQUESTER',
    );
    expect(confirmedRoleOf(duty({ confirmerRole: 'IT_ADMIN' }), 'it', null)).toBe('IT_ADMIN');
  });
});

describe('what an unconfirmed duty does to the work, and the deadline', () => {
  const open = { confirmed: false, cancelled: false, dueOn: '2026-09-29' };

  it('holds the work to the end of the deadline, then lets it go on flagged', () => {
    expect(gateOf(open, '2026-09-28')).toBe('HELD');
    expect(gateOf(open, '2026-09-29')).toBe('HELD');
    expect(gateOf(open, '2026-09-30')).toBe('FLAGGED');
  });

  it('has nothing to say once confirmed or cancelled', () => {
    expect(gateOf({ ...open, confirmed: true }, '2026-09-28')).toBe('OPEN');
    expect(gateOf({ ...open, cancelled: true }, '2026-09-30')).toBe('OPEN');
  });

  it('counts the short deadline in working days, skipping weekends and the days nobody works', () => {
    // 2026-10-23 is a Friday.
    expect(shortDueOn('2026-10-23', 1, new Set())).toBe('2026-10-26');
    expect(shortDueOn('2026-10-23', 1, new Set(['2026-10-26']))).toBe('2026-10-27');
    expect(shortDueOn('2026-10-22', 2, new Set())).toBe('2026-10-26');
  });
});
