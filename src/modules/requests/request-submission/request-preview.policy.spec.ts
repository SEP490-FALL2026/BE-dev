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

  describe('the need step follows the routing table (AC-5)', () => {
    it.each([
      ['a person of a department with a head', {}, HEAD, 'DEPARTMENT_HEAD'],
      [
        'the head asking for themselves: the spending approver',
        { requesterEmployeeId: HEAD },
        APPROVER,
        'HEAD_ASKS_FOR_SELF',
      ],
    ])('%s', (_name, over, assignee, explanation) => {
      const [need] = chainOf(paid, over);

      expect(need).toMatchObject({ kind: 'NEED', assigneeEmployeeId: assignee, explanation, waitingReason: null });
    });

    it('waits for the head, naming nobody and saying why, when the department has none (row 4)', () => {
      const [need] = chainOf(paid, { departmentHeadEmployeeId: null });

      expect(need).toMatchObject({
        kind: 'NEED',
        role: 'MANAGER',
        assigneeEmployeeId: null,
        explanation: 'WAITS_FOR_DEPARTMENT_HEAD',
        waitingReason: 'NO_DEPARTMENT_HEAD',
      });
    });

    it('names nobody and says why when the head asks for themselves and no spending approver can decide it', () => {
      const [need] = chainOf(paid, { requesterEmployeeId: HEAD, spendingApproverEmployeeId: null });

      expect(need).toMatchObject({
        assigneeEmployeeId: null,
        explanation: 'WAITING_FOR_AN_APPROVER',
        waitingReason: 'NO_SPENDING_APPROVER',
      });
    });
  });

  it('shows the spend steps unfilled, with the reason, when there is nobody to hold them', () => {
    const steps = chainOf(paid, { departmentHeadEmployeeId: null, spendingApproverEmployeeId: null });

    expect(steps[1]).toMatchObject({
      kind: 'SPEND_SUBMISSION',
      assigneeEmployeeId: null,
      explanation: 'WAITS_FOR_DEPARTMENT_HEAD',
    });
    expect(steps[2]).toMatchObject({
      kind: 'SPEND_APPROVAL',
      assigneeEmployeeId: null,
      waitingReason: 'NO_SPENDING_APPROVER',
    });
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
