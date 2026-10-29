import {
  ApplicationAlreadyRetiredError,
  ApplicationRetirementBlockedError,
  ApplicationRetirementNeedsConfirmationError,
  ApplicationRetirementNoteRequiredError,
  ApplicationRetirementNotBusinessOwnerError,
} from '../application.errors';
import {
  RETIREMENT_NOTE_MAX_LENGTH,
  activeTermSubscriptions,
  assertConfirmable,
  cleanConfirmationNote,
  decideRetirement,
} from './application-retirement.policy';

const TODAY = '2026-10-20';
const assignment = { assignmentId: 'a1', employeeId: 'e1', planId: 'p1', subscriptionId: 's1' };
const termSubscription = { subscriptionId: 's1', planId: 'p1', endDate: '2027-01-01' };

describe('the note of the Business Owner confirmation (US-04-01 AC-8)', () => {
  it('is kept trimmed, and a blank one is none', () => {
    expect(cleanConfirmationNote('  đã dọn xong, đồng ý ngừng  ')).toBe('đã dọn xong, đồng ý ngừng');
    expect(() => cleanConfirmationNote('')).toThrow(ApplicationRetirementNoteRequiredError);
    expect(() => cleanConfirmationNote(' \n\t ')).toThrow(ApplicationRetirementNoteRequiredError);
  });

  it('has a bound the DTO shares', () => {
    expect(RETIREMENT_NOTE_MAX_LENGTH).toBe(2000);
  });
});

describe('who may confirm (US-04-01 AC-8)', () => {
  it('is the Business Owner of the application today, still working', () => {
    expect(() => {
      assertConfirmable({ currentOwnerEmployeeId: 'b2', businessOwnerEmployeeId: 'b2', ownerStatus: 'ACTIVE' });
    }).not.toThrow();
  });

  it.each([
    ['someone who is not the Business Owner', { businessOwnerEmployeeId: 'x', ownerStatus: 'ACTIVE' }],
    ['a Business Owner who has left', { businessOwnerEmployeeId: 'b2', ownerStatus: 'TERMINATED' }],
    ['a person who does not exist', { businessOwnerEmployeeId: 'b2', ownerStatus: null }],
  ])('refuses %s', (_name, who) => {
    expect(() => {
      assertConfirmable({ currentOwnerEmployeeId: 'b2', ...who });
    }).toThrow(ApplicationRetirementNotBusinessOwnerError);
  });
});

describe('the subscriptions that stop a software from being retired (US-04-01 AC-9, AC-14)', () => {
  it('are the term ones that have not run out: no end date, or an end date today or later', () => {
    const rows = [
      { id: 's-open', planId: 'p', kind: 'TERM' as const, endDate: null },
      { id: 's-today', planId: 'p', kind: 'TERM' as const, endDate: TODAY },
      { id: 's-later', planId: 'p', kind: 'TERM' as const, endDate: '2027-06-30' },
    ];

    expect(activeTermSubscriptions(rows, TODAY).map((row) => row.id)).toEqual(['s-open', 's-today', 's-later']);
  });

  it('leave out a term that has run out, and a perpetual purchase, which never stops it (no liquidation)', () => {
    const rows = [
      { id: 's-over', planId: 'p', kind: 'TERM' as const, endDate: '2026-10-19' },
      { id: 's-perpetual', planId: 'p', kind: 'PERPETUAL' as const, endDate: null },
    ];

    expect(activeTermSubscriptions(rows, TODAY)).toEqual([]);
  });
});

describe('the decision to retire (US-04-01 AC-8, AC-9, AC-14)', () => {
  const clean = { retired: false, confirmedByCurrentOwner: true, assignments: [], subscriptions: [] };

  it('retires an application that is confirmed and has nothing holding it', () => {
    expect(decideRetirement(clean)).toBe('RETIRE');
  });

  it('refuses one that is retired already, first of all', () => {
    expect(() => decideRetirement({ ...clean, retired: true, confirmedByCurrentOwner: false })).toThrow(
      ApplicationAlreadyRetiredError,
    );
  });

  it('asks for the confirmation before it looks at what holds the application, even when nothing does', () => {
    expect(() => decideRetirement({ ...clean, confirmedByCurrentOwner: false })).toThrow(
      ApplicationRetirementNeedsConfirmationError,
    );
    expect(() => decideRetirement({ ...clean, confirmedByCurrentOwner: false, assignments: [assignment] })).toThrow(
      ApplicationRetirementNeedsConfirmationError,
    );
  });

  it('refuses one with assignments or subscriptions, and lists exactly them', () => {
    expect.assertions(4);
    for (const input of [
      { ...clean, assignments: [assignment, { ...assignment, assignmentId: 'a2' }], subscriptions: [termSubscription] },
      { ...clean, assignments: [{ ...assignment, subscriptionId: null }] },
    ]) {
      try {
        decideRetirement(input);
      } catch (error) {
        expect(error).toBeInstanceOf(ApplicationRetirementBlockedError);
        expect(error).toMatchObject({ assignments: input.assignments, subscriptions: input.subscriptions });
      }
    }
  });

  it('counts what holds the application in all when the lists are only the first of it (LD-06)', () => {
    try {
      decideRetirement({ ...clean, assignments: [assignment], assignmentTotal: 120, subscriptionTotal: 3 });
      throw new Error('it did not refuse');
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationRetirementBlockedError);
      expect(error).toMatchObject({ assignmentTotal: 120, subscriptionTotal: 3 });
    }
  });
});
