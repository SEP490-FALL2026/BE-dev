import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { BudgetFactsService } from './budget-facts.service';
import type { BudgetNotifierService } from './budget-notifier.service';
import type { VersionRecord, VersionRepo } from './version.repo';
import { SpendingApproverWaitListener } from './spending-approver-wait.listener';

const tx = { name: 'tx' } as unknown as DbTx;
const sent = [{ id: 'v1' }, { id: 'v2' }] as unknown as VersionRecord[];
const left = (employeeId: string) =>
  ({ id: 'org-change-9', kind: 'EMPLOYEE_LEFT', employeeId, effectiveOn: '2026-11-02' }) as const;

describe('the versions that wait when the spending approver stops (D-S16, QĐ-93d(1))', () => {
  const versions = { sentOnes: jest.fn() };
  const facts = { employeeWorks: jest.fn(), isSpendingApprover: jest.fn() };
  const notifier = { versionWaiting: jest.fn() };
  const listener = new SpendingApproverWaitListener(
    versions as unknown as VersionRepo,
    facts as unknown as BudgetFactsService,
    notifier as unknown as BudgetNotifierService,
    { add: jest.fn() } as never,
    { add: jest.fn() } as never,
  );
  const taken = { id: 'change-1', role: 'SPENDING_APPROVER', fromEmployeeId: 'c1', toEmployeeId: null } as const;

  beforeEach(() => {
    jest.clearAllMocks();
    versions.sentOnes.mockResolvedValue(sent);
    facts.employeeWorks.mockResolvedValue(true);
    facts.isSpendingApprover.mockResolvedValue(true);
  });

  it('tells for every version that was sent when the role is taken back and the holder still works, once for the change', async () => {
    await listener.onRoleChange(tx, taken);

    expect(notifier.versionWaiting.mock.calls).toEqual([
      [tx, sent[0], 'role:change-1'],
      [tx, sent[1], 'role:change-1'],
    ]);
  });

  it('tells nothing when the role is given to somebody, is another role, or the holder had already left', async () => {
    await listener.onRoleChange(tx, { ...taken, toEmployeeId: 'c2' });
    await listener.onRoleChange(tx, { ...taken, role: 'FINANCE' });
    await listener.onRoleChange(tx, { ...taken, fromEmployeeId: null });
    facts.employeeWorks.mockResolvedValue(false);
    await listener.onRoleChange(tx, taken);

    expect(notifier.versionWaiting).not.toHaveBeenCalled();
  });

  it('tells for every version that was sent when the person who holds the role leaves, with the key of that change', async () => {
    await listener.onOrganizationChange(tx, left('c1'));

    expect(notifier.versionWaiting.mock.calls).toEqual([
      [tx, sent[0], 'left:org-change-9'],
      [tx, sent[1], 'left:org-change-9'],
    ]);
  });

  it('tells nothing when somebody else leaves, or another kind of change is heard', async () => {
    facts.isSpendingApprover.mockResolvedValue(false);
    await listener.onOrganizationChange(tx, left('e1'));
    facts.isSpendingApprover.mockResolvedValue(true);
    await listener.onOrganizationChange(tx, {
      id: 'org-change-10',
      kind: 'HEAD_PERIOD_START',
      departmentId: 'd1',
      headEmployeeId: 'h1',
    } as never);

    expect(notifier.versionWaiting).not.toHaveBeenCalled();
  });
});
