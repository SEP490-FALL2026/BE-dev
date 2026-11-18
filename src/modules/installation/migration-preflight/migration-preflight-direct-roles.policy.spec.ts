import { DirectRoleFacts } from '../public/migration-preflight.types';
import { judgeDirectRoles } from './migration-preflight-judgement.policy';

/** The four violations `QĐ-93k(4)` lists for the conversion of `MANAGER` and `SPENDING_APPROVER` to granted roles. */
const none: DirectRoleFacts = {
  headsWithoutAccount: [],
  spendingApproverHeads: [],
  spendingApproverHoldsRoles: [],
  spendingApproverWithoutAccount: [],
};

describe('judgeDirectRoles', () => {
  it('lists nothing for data the conversion can carry', () => {
    expect(judgeDirectRoles(none)).toEqual([]);
  });

  it('names a head without an account by the code of the person and of the department', () => {
    expect(judgeDirectRoles({ ...none, headsWithoutAccount: [{ employeeCode: 'E-9', department: 'P-ENG' }] })).toEqual([
      { code: 'DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT', employeeCode: 'E-9', department: 'P-ENG' },
    ]);
  });

  it('names the spending approver who heads a department, who holds another role, and who has no account', () => {
    expect(
      judgeDirectRoles({
        headsWithoutAccount: [],
        spendingApproverHeads: [{ employeeCode: 'E-1', department: 'P-EXE' }],
        spendingApproverHoldsRoles: [
          { employeeCode: 'E-1', role: 'FINANCE' },
          { employeeCode: 'E-1', role: 'IT_ADMIN' },
        ],
        spendingApproverWithoutAccount: [{ employeeCode: 'E-2' }],
      }),
    ).toEqual([
      { code: 'DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE', employeeCode: 'E-1', role: 'FINANCE' },
      { code: 'DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE', employeeCode: 'E-1', role: 'IT_ADMIN' },
      { code: 'DIRECT_ROLES_SPENDING_APPROVER_IS_HEAD', employeeCode: 'E-1', department: 'P-EXE' },
      { code: 'DIRECT_ROLES_SPENDING_APPROVER_WITHOUT_ACCOUNT', employeeCode: 'E-2' },
    ]);
  });

  it('reads one line for each violation, in the order of the code and then of the person', () => {
    const blockers = judgeDirectRoles({
      headsWithoutAccount: [
        { employeeCode: 'E-9', department: 'P-B' },
        { employeeCode: 'E-3', department: 'P-A' },
        { employeeCode: 'E-3', department: 'P-0' },
      ],
      spendingApproverHeads: [],
      spendingApproverHoldsRoles: [],
      spendingApproverWithoutAccount: [],
    });

    expect(blockers.map((blocker) => blocker.code)).toEqual(Array(3).fill('DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT'));
    expect(blockers).toEqual([
      { code: 'DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT', employeeCode: 'E-3', department: 'P-0' },
      { code: 'DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT', employeeCode: 'E-3', department: 'P-A' },
      { code: 'DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT', employeeCode: 'E-9', department: 'P-B' },
    ]);
  });
});
