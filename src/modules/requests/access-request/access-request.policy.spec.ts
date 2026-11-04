import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { requestPolicyJson } from './access-request.json';
import {
  CURRENT_POLICY_VERSION,
  canViewRequest,
  chargedCostCenterId,
  mayRequest,
  policyFor,
  proposalPolicy,
  type RequestPolicy,
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

describe('requestPolicyJson (the codec of access_requests.policy)', () => {
  const stored = {
    version: 1,
    branch: 'PAID_IN_CATALOG',
    chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
    slaWorkingDays: 3,
  };

  it('reads the policy of a sent request as the domain type', () => {
    const policy: RequestPolicy = requestPolicyJson.decode(stored);

    expect(policy).toEqual({ ...stored });
  });

  it.each([
    ['a missing field', { version: 1, branch: 'PAID_IN_CATALOG', slaWorkingDays: 3 }],
    ['a version that is text', { ...stored, version: '1' }],
    ['a branch the policy does not know', { ...stored, branch: 'FREE_FOR_ALL' }],
    ['a step of the chain the policy does not know', { ...stored, chain: ['NEED', 'LUNCH'] }],
    ['null', null],
    ['the content of a draft', { draft: { kind: 'INDIVIDUAL' } }],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => requestPolicyJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => requestPolicyJson.decode(value)).toThrow('access_requests.policy');
    expect(() => requestPolicyJson.decode(value)).not.toThrow(/INDIVIDUAL|LUNCH|FREE_FOR_ALL/);
  });

  // The JSON a request has always been written with: the object `policyFor` and `proposalPolicy` return, key for key.
  it('writes the same JSON as the policy object has always been written as, for each branch', () => {
    const free = policyFor('INTERNAL', 2);
    const paid = policyFor('SAAS', 3);
    const proposal = proposalPolicy(5);

    expect(requestPolicyJson.encode(free)).toEqual({
      version: 1,
      branch: 'INTERNAL_FREE',
      chain: ['NEED', 'IT_EXECUTION'],
      slaWorkingDays: 2,
    });
    expect(requestPolicyJson.encode(paid)).toEqual(stored);
    expect(requestPolicyJson.encode(proposal)).toEqual({
      version: 1,
      branch: 'NEW_SOFTWARE',
      chain: ['NEED', 'IT_ASSESSMENT', 'SPEND_APPROVAL', 'IT_EXECUTION'],
      slaWorkingDays: 5,
    });
    for (const policy of [free, paid, proposal]) {
      expect(requestPolicyJson.encode(policy)).toEqual(JSON.parse(JSON.stringify(policy)));
      expect(requestPolicyJson.decode(JSON.parse(JSON.stringify(requestPolicyJson.encode(policy))))).toEqual(policy);
    }
  });
});
