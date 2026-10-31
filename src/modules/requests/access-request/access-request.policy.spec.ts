import {
  CURRENT_POLICY_VERSION,
  canViewRequest,
  chargedCostCenterId,
  mayRequest,
  policyFor,
} from './access-request.policy';

describe('who may see a request (BM-01: the requester, the people who decide, the IT Admin)', () => {
  const request = {
    requesterEmployeeId: 'sender',
    beneficiaryEmployeeIds: ['for-1'],
    needStepAssigneeEmployeeId: 'head',
  };
  const person = (employeeId: string, ...roles: string[]) => ({ employeeId, roles });

  it.each([
    ['the person who sent it', person('sender')],
    ['the person it is for', person('for-1')],
    ['the person who holds its need step', person('head', 'MANAGER')],
    ['an IT Admin', person('somebody-else', 'IT_ADMIN')],
  ])('lets %s see it', (_who, actor) => {
    expect(canViewRequest(actor, request)).toBe(true);
  });

  it.each([
    ['another employee', person('other')],
    ['a Finance user', person('finance', 'FINANCE')],
    ['a Super Admin, who files and decides no business record (SoD-1)', person('root', 'SUPER_ADMIN')],
    ['a head of another department', person('other-head', 'MANAGER')],
  ])('does not let %s see it', (_who, actor) => {
    expect(canViewRequest(actor, request)).toBe(false);
  });

  it('lets nobody in through a step nobody holds', () => {
    expect(canViewRequest(person('other'), { ...request, needStepAssigneeEmployeeId: null })).toBe(false);
  });
});

describe('the policy fixed when a request is sent (US-05-02)', () => {
  it('sends internal software with no fee to the need step and then to the IT Admin by hand, with no spend step (AC-9)', () => {
    expect(policyFor('INTERNAL', 2)).toEqual({
      version: CURRENT_POLICY_VERSION,
      branch: 'INTERNAL_FREE',
      chain: ['NEED', 'IT_EXECUTION'],
      slaWorkingDays: 2,
    });
  });

  it.each(['SAAS', 'LICENSED'] as const)(
    'puts a spend step between the need step and the IT Admin for %s software already in the catalog',
    (kind) => {
      expect(policyFor(kind, 3)).toEqual({
        version: CURRENT_POLICY_VERSION,
        branch: 'PAID_IN_CATALOG',
        chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
        slaWorkingDays: 3,
      });
    },
  );

  it('is a fresh value each time, so a later change cannot reach a request already sent', () => {
    const first = policyFor('SAAS', 2);
    first.chain.push('NEED');

    expect(policyFor('SAAS', 2).chain).toEqual(['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION']);
  });
});

describe('who may send a request (QĐ-87a, SoD-1, F30)', () => {
  it('lets everybody but the Super Admin send one', () => {
    expect(mayRequest(['EMPLOYEE'])).toBe(true);
    expect(mayRequest(['EMPLOYEE', 'MANAGER'])).toBe(true);
    expect(mayRequest(['IT_ADMIN'])).toBe(true);
    expect(mayRequest([])).toBe(true);
  });

  it('refuses the Super Admin whatever else they hold', () => {
    expect(mayRequest(['SUPER_ADMIN'])).toBe(false);
    expect(mayRequest(['EMPLOYEE', 'SUPER_ADMIN'])).toBe(false);
  });
});

describe('the Cost Center a request is charged to (F91, QĐ-87g)', () => {
  it('is the one a request that costs money carries', () => {
    expect(chargedCostCenterId({ id: 'r-1', costCenterId: 'cc-1' })).toBe('cc-1');
  });

  it('is refused, naming the request, for one that carries none: only a free internal request is without, and nothing is charged for it', () => {
    expect(() => chargedCostCenterId({ id: 'r-9', costCenterId: null })).toThrow(
      'The request r-9 is charged to no Cost Center.',
    );
  });
});
