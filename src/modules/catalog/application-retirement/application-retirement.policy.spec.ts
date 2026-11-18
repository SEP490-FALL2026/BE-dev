import { ApplicationAlreadyRetiredError, ApplicationRetirementBlockedError } from '../catalog-entry/application.errors';
import { activeTermSubscriptions, decideRetirement } from './application-retirement.policy';

const TODAY = '2026-10-20';
const assignment = { assignmentId: 'a1', employeeId: 'e1', planId: 'p1', subscriptionId: 's1' };
const termSubscription = { subscriptionId: 's1', planId: 'p1', endDate: '2027-01-01' };

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

describe('the decision to retire (US-04-01 AC-9, AC-14, QĐ-111g: nobody confirms, the IT Admin who retires decides)', () => {
  const clean = { retired: false, assignments: [], subscriptions: [] };

  it('retires an application that has nothing holding it, with no confirmation to wait for', () => {
    expect(decideRetirement(clean)).toBe('RETIRE');
  });

  it('refuses one that is retired already, first of all', () => {
    expect(() => decideRetirement({ ...clean, retired: true })).toThrow(ApplicationAlreadyRetiredError);
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
