import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RenewalSpendingApproverWaitListener } from './spending-approver-wait.listener';
import type { RenewalNotifier } from './subscription-renewal-notifier.service';
import type { RenewalPartiesService } from './subscription-renewal-parties.service';
import type { SubscriptionRenewalRepo } from './subscription-renewal.repo';

const tx = { name: 'tx' } as unknown as DbTx;
const waiting = [
  { id: 'r1', organizationId: 'org', subscriptionId: 's1' },
  { id: 'r2', organizationId: 'org', subscriptionId: 's2' },
];

describe('the renewals that wait when the spending approver stops (D-S16, QĐ-93d(1))', () => {
  const renewals = { awaitingDecision: jest.fn() };
  const parties = { employeeWorks: jest.fn(), holdsApproverRole: jest.fn(), superAdminOf: jest.fn() };
  const notifier = { waitingForSpendingApprover: jest.fn() };
  const listener = new RenewalSpendingApproverWaitListener(
    renewals as unknown as SubscriptionRenewalRepo,
    parties as unknown as RenewalPartiesService,
    notifier as unknown as RenewalNotifier,
    { add: jest.fn() } as never,
    { add: jest.fn() } as never,
  );
  const taken = { id: 'change-1', role: 'SPENDING_APPROVER', fromEmployeeId: 'c1', toEmployeeId: null } as const;

  beforeEach(() => {
    jest.clearAllMocks();
    renewals.awaitingDecision.mockResolvedValue(waiting);
    parties.employeeWorks.mockResolvedValue(true);
    parties.holdsApproverRole.mockResolvedValue(true);
    parties.superAdminOf.mockResolvedValue('super-admin');
  });

  it('tells the Super Admin for every case that waits when the role is taken back and the holder still works', async () => {
    await listener.onRoleChange(tx, taken);

    expect(notifier.waitingForSpendingApprover.mock.calls).toEqual([
      [tx, waiting[0], 'super-admin', 'role:change-1'],
      [tx, waiting[1], 'super-admin', 'role:change-1'],
    ]);
  });

  it('tells nothing when the role is given to somebody, is another role, or the holder had already left', async () => {
    await listener.onRoleChange(tx, { ...taken, toEmployeeId: 'c2' });
    await listener.onRoleChange(tx, { ...taken, role: 'FINANCE' });
    parties.employeeWorks.mockResolvedValue(false);
    await listener.onRoleChange(tx, taken);

    expect(notifier.waitingForSpendingApprover).not.toHaveBeenCalled();
  });

  it('tells for every case that waits when the person who holds the role leaves, and nothing when somebody else does', async () => {
    const left = { id: 'org-change-9', kind: 'EMPLOYEE_LEFT', employeeId: 'c1', effectiveOn: '2026-11-02' } as const;

    await listener.onOrganizationChange(tx, left);
    expect(notifier.waitingForSpendingApprover.mock.calls.map((call: unknown[]) => call[3])).toEqual([
      'left:org-change-9',
      'left:org-change-9',
    ]);

    jest.clearAllMocks();
    parties.holdsApproverRole.mockResolvedValue(false);
    await listener.onOrganizationChange(tx, left);
    expect(notifier.waitingForSpendingApprover).not.toHaveBeenCalled();
  });
});
