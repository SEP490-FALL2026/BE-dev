import { planNeedSteps } from './group-need-routing.policy';
const facts = {
  requesterEmployeeId: 'sender',
  departmentHeadEmployeeId: 'head',
  spendingApproverEmployeeId: 'spender',
  chainHasSpendStep: true,
};
const input = {
  senderEmployeeId: 'sender',
  senderIsHead: false,
  headEmployeeId: 'head',
  lines: [{ employeeId: 'one' }, { employeeId: 'two' }],
  facts,
  slaWorkingDays: 2,
};
describe('BR-MF1-02: group need routing', () => {
  it('routes a member group via the head, row 9', () =>
    expect(planNeedSteps(input)).toMatchObject([
      { confirmedBySending: false, step: { state: 'PENDING', routingRow: 9, assigneeEmployeeId: 'head' } },
    ]));
  it('confirms a head group by sending, keeps row 5', () =>
    expect(planNeedSteps({ ...input, senderEmployeeId: 'head', senderIsHead: true })).toMatchObject([
      { confirmedBySending: true, step: { routingRow: 5 } },
    ]));
  it('makes an employee group without an effective head one-step', () =>
    expect(
      planNeedSteps({ ...input, headEmployeeId: null, facts: { ...facts, departmentHeadEmployeeId: null } }),
    ).toMatchObject([
      {
        confirmedBySending: false,
        step: { state: 'NOT_REQUIRED', routingRow: 4, waitingReason: null, assigneeEmployeeId: null },
      },
    ]));
});
