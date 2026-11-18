import type { RequestPartyFacts } from './request-party.policy';
import { ineligibleReasons, requestPartyBlock } from './request-party.policy';

const facts = (overrides: Partial<RequestPartyFacts> = {}): RequestPartyFacts => ({
  spendingApproverEmployeeId: 'C1',
  unplacedEmployeeIds: new Set(),
  ...overrides,
});

describe('requestPartyBlock', () => {
  it.each([['REQUESTER'], ['BENEFICIARY']])('blocks the spending approver as %s', (party) => {
    const parties =
      party === 'REQUESTER'
        ? { requesterEmployeeId: 'C1', beneficiaryEmployeeIds: ['E2'] }
        : { requesterEmployeeId: 'H5', beneficiaryEmployeeIds: ['E2', 'C1'] };

    expect(requestPartyBlock(parties, facts())).toEqual({
      reason: 'SPENDING_APPROVER',
      party,
      employeeIds: ['C1'],
    });
  });

  it('says REQUESTER when the spending approver asks for themselves', () => {
    expect(requestPartyBlock({ requesterEmployeeId: 'C1', beneficiaryEmployeeIds: ['C1'] }, facts())).toEqual({
      reason: 'SPENDING_APPROVER',
      party: 'REQUESTER',
      employeeIds: ['C1'],
    });
  });

  it('allows a Request with nobody who can never be a party', () => {
    expect(requestPartyBlock({ requesterEmployeeId: 'H5', beneficiaryEmployeeIds: ['E2'] }, facts())).toBeNull();
    expect(
      requestPartyBlock(
        { requesterEmployeeId: 'H5', beneficiaryEmployeeIds: ['E2'] },
        facts({ spendingApproverEmployeeId: null }),
      ),
    ).toBeNull();
  });

  it('judges the requester before the beneficiaries', () => {
    expect(
      requestPartyBlock(
        { requesterEmployeeId: 'U1', beneficiaryEmployeeIds: ['C1'] },
        facts({ unplacedEmployeeIds: new Set(['U1']) }),
      ),
    ).toEqual({ reason: 'UNPLACED', party: 'REQUESTER', employeeIds: ['U1'] });
  });

  it('judges the spending approver before the unplaced inside one side', () => {
    expect(
      requestPartyBlock(
        { requesterEmployeeId: 'H5', beneficiaryEmployeeIds: ['U1', 'C1', 'U2'] },
        facts({ unplacedEmployeeIds: new Set(['U1', 'U2']) }),
      ),
    ).toEqual({ reason: 'SPENDING_APPROVER', party: 'BENEFICIARY', employeeIds: ['C1'] });
  });

  it('reports SPENDING_APPROVER for a person who is both kinds', () => {
    expect(
      requestPartyBlock(
        { requesterEmployeeId: 'C1', beneficiaryEmployeeIds: [] },
        facts({ unplacedEmployeeIds: new Set(['C1']) }),
      ),
    ).toEqual({ reason: 'SPENDING_APPROVER', party: 'REQUESTER', employeeIds: ['C1'] });
  });

  it('lists every person of the first party and reason, sorted and without repeats', () => {
    expect(
      requestPartyBlock(
        { requesterEmployeeId: 'H5', beneficiaryEmployeeIds: ['U9', 'E2', 'U3', 'U9'] },
        facts({ spendingApproverEmployeeId: null, unplacedEmployeeIds: new Set(['U9', 'U3']) }),
      ),
    ).toEqual({ reason: 'UNPLACED', party: 'BENEFICIARY', employeeIds: ['U3', 'U9'] });
  });

  it('says BENEFICIARY when nobody asks and the person who is given access cannot be a party', () => {
    expect(requestPartyBlock({ requesterEmployeeId: null, beneficiaryEmployeeIds: ['C1'] }, facts())).toEqual({
      reason: 'SPENDING_APPROVER',
      party: 'BENEFICIARY',
      employeeIds: ['C1'],
    });
  });
});

describe('ineligibleReasons', () => {
  it('names the reason of each ineligible person', () => {
    const reasons = ineligibleReasons(
      ['E2', 'C1', 'U1', 'U2'],
      facts({ unplacedEmployeeIds: new Set(['U1', 'U2', 'C1']) }),
    );

    expect([...reasons]).toEqual([
      ['C1', 'SPENDING_APPROVER'],
      ['U1', 'UNPLACED'],
      ['U2', 'UNPLACED'],
    ]);
  });

  it('leaves out the people who can be a party', () => {
    expect(ineligibleReasons(['E2', 'E3'], facts()).size).toBe(0);
  });
});
