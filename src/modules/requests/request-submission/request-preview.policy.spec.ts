import { policyFor } from '../access-request/access-request.policy';
import { buildChain, spendSubmissionOf } from './request-preview.policy';
import { routeNeedStep, type RoutingFacts } from '../access-request/routing.policy';

const REQUESTER = 'e1';
const HEAD = 'h1';
const APPROVER = 'c1';

const facts = (over: Partial<RoutingFacts> = {}): RoutingFacts => ({
  requesterEmployeeId: REQUESTER,
  departmentHeadEmployeeId: HEAD,
  spendingApproverEmployeeId: APPROVER,
  chainHasSpendStep: true,
  ...over,
});
const paid = policyFor('SAAS', 2);
const internal = policyFor('INTERNAL', 2);
const chainOf = (policy = paid, over: Partial<RoutingFacts> = {}) => {
  const f = facts({ ...over, chainHasSpendStep: policy.chain.includes('SPEND_APPROVAL') });

  return buildChain(policy, routeNeedStep(f), f);
};
const shape = (steps: ReturnType<typeof chainOf>) => steps.map((s) => [s.kind, s.assigneeEmployeeId]);

describe('the chain shown before a request is sent (US-05-01)', () => {
  it('for paid software is the head, the head sending it on, the spending approver and the IT Admin (AC-1)', () => {
    expect(shape(chainOf())).toEqual([
      ['NEED', HEAD],
      ['SPEND_SUBMISSION', HEAD],
      ['SPEND_APPROVAL', APPROVER],
      ['IT_EXECUTION', null],
    ]);
  });

  it('gives every step the working days the policy fixes, in order from one', () => {
    const steps = chainOf(policyFor('SAAS', 3));

    expect(steps.map((s) => [s.sequence, s.expectedWorkingDays])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
    ]);
  });

  it('for internal software has no spend step, only the head and the IT Admin by hand (AC-10)', () => {
    expect(shape(chainOf(internal))).toEqual([
      ['NEED', HEAD],
      ['IT_EXECUTION', null],
    ]);
  });

  it('names the IT Admin as a role, never one person', () => {
    const [last] = chainOf().slice(-1);

    expect(last).toMatchObject({ role: 'IT_ADMIN', assigneeEmployeeId: null });
  });

  describe('BR-MF1-02 the preview follows one-step routing', () => {
    it('keeps the department head need step for a member of a headed department', () => {
      expect(chainOf()[0]).toMatchObject({
        kind: 'NEED',
        assigneeEmployeeId: HEAD,
        explanation: 'DEPARTMENT_HEAD',
        waitingReason: null,
      });
    });
    it('omits need and submission for the own request of the head', () => {
      expect(shape(chainOf(paid, { requesterEmployeeId: HEAD }))).toEqual([
        ['SPEND_APPROVAL', APPROVER],
        ['IT_EXECUTION', null],
      ]);
    });
    it('QĐ-110i: keeps the need step, waiting for a head, for paid software of a headless department', () => {
      const steps = chainOf(paid, { departmentHeadEmployeeId: null });

      expect(shape(steps)).toEqual([
        ['NEED', null],
        ['SPEND_SUBMISSION', null],
        ['SPEND_APPROVAL', APPROVER],
        ['IT_EXECUTION', null],
      ]);
      expect(steps[0]).toMatchObject({ explanation: 'WAITS_FOR_DEPARTMENT_HEAD', waitingReason: 'NO_DEPARTMENT_HEAD' });
    });
    it('waits only for the spending approver when none holds that role', () => {
      const steps = chainOf(paid, { requesterEmployeeId: HEAD, spendingApproverEmployeeId: null });
      expect(steps).toHaveLength(2);
      expect(steps[0]).toMatchObject({
        kind: 'SPEND_APPROVAL',
        assigneeEmployeeId: null,
        waitingReason: 'NO_SPENDING_APPROVER',
      });
    });
    it('headless internal software needs only IT execution', () => {
      expect(shape(chainOf(internal, { departmentHeadEmployeeId: null }))).toEqual([['IT_EXECUTION', null]]);
    });
  });

  it('QĐ-110i headless paid software without an approver waits for the head and for the approver, both named', () => {
    const steps = chainOf(paid, { departmentHeadEmployeeId: null, spendingApproverEmployeeId: null });
    expect(steps.map((step) => step.kind)).toEqual(['NEED', 'SPEND_SUBMISSION', 'SPEND_APPROVAL', 'IT_EXECUTION']);
    expect(steps[0]).toMatchObject({ assigneeEmployeeId: null, waitingReason: 'NO_DEPARTMENT_HEAD' });
    expect(steps[2]).toMatchObject({ assigneeEmployeeId: null, waitingReason: 'NO_SPENDING_APPROVER' });
  });
});

describe('whether the request can go on to be decided as spend (US-05-01 AC-14)', () => {
  it.each([
    ['paid software with a price', paid, 'PRICED', 'ALLOWED'],
    ['paid software with no price', paid, 'MISSING', 'BLOCKED_UNTIL_PRICED'],
    ['internal software', internal, 'NOT_APPLICABLE', 'NOT_NEEDED'],
  ] as const)('%s', (_name, policy, status, expected) => {
    expect(spendSubmissionOf(policy, status)).toBe(expected);
  });
});
