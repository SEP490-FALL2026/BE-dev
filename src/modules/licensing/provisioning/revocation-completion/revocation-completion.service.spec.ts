import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
import { ProvisioningNotInChargeError } from '../provisioning.errors';
import { RevocationAftermath } from './revocation-aftermath.service';
import { RevocationCompletionService } from './revocation-completion.service';

const ACTOR: AuthenticatedPrincipal = {
  subject: 'app-it',
  appUserId: 'app-it',
  sessionId: 'session-it',
  employeeId: 'e-other',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
};

describe('RevocationCompletionService (delegates acting IT Admin check via ProvisioningTaskFrame.work)', () => {
  it('propagates ProvisioningNotInChargeError on complete and recordAccessCut', async () => {
    const work = jest.fn().mockRejectedValue(new ProvisioningNotInChargeError());
    const service = new RevocationCompletionService(
      {} as never,
      { work } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.complete(ACTOR, 'task-1', { completion: 'ACCOUNT_REMOVED', evidence: 'done' }),
    ).rejects.toBeInstanceOf(ProvisioningNotInChargeError);

    await expect(
      service.recordAccessCut(ACTOR, 'task-1', { accessCutOn: '2026-11-23', evidence: 'cut' }),
    ).rejects.toBeInstanceOf(ProvisioningNotInChargeError);

    expect(work).toHaveBeenCalledTimes(2);
  });

  it('Ca 6: records MEMBER REDUCE -1 effective on next payment date (2026-12-05) when completing K2 MEMBERS revocation on 2026-11-10', async () => {
    const tx = {} as never;
    const recordMember = jest.fn().mockResolvedValue({ id: 'chg-reduce' });
    const order: string[] = [];
    const lockPeriodsAndLines = jest.fn().mockImplementation(() => {
      order.push('lines');

      return Promise.resolve([]);
    });
    const lockAssignment = jest.fn().mockImplementation(() => {
      order.push('assignment');

      return Promise.resolve({ id: 'asg-1', subscriptionId: 'sub-slack', effectiveFrom: '2026-11-01' });
    });
    const seatLedger = {
      findLineWithPeriodByPlan: jest.fn().mockResolvedValue({
        line: { id: 'line-slack', ledgerOpenedOn: '2026-11-01', closedOn: null },
        plan: { id: 'plan-slack', name: 'Slack', provisioningType: 'K2' },
        period: {
          id: 'sub-slack',
          seatCounting: 'MEMBERS',
          billingCycle: 'MONTHLY',
          renewalDate: '2026-11-05',
          endDate: null,
        },
      }),
      lockPeriodsAndLines,
      recordMember,
    } as unknown as SeatLedgerApi;
    const aftermath = new RevocationAftermath(
      { holdsKey: jest.fn(), takeBack: jest.fn() } as never,
      { tell: jest.fn().mockResolvedValue(0) } as never,
      { plan: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
      seatLedger,
    );
    const service = new RevocationCompletionService(
      { markRevocationCompleted: jest.fn() } as never,
      {
        work: jest.fn((_actor, _id, action: { write: (ctx: unknown) => Promise<unknown> }) =>
          action
            .write({
              tx,
              task: {
                id: 'task-1',
                assignmentId: 'asg-1',
                assignment: { employeeId: 'emp-1', planId: 'plan-slack', subscriptionId: 'sub-slack' },
              },
              organizationId: 'org-1',
              now: new Date('2026-11-10T08:00:00.000Z'),
            })
            .then(() => ({ id: 'task-1' })),
        ),
      } as never,
      { views: jest.fn().mockResolvedValue([{ id: 'task-1' }]) } as never,
      {
        lock: lockAssignment,
        end: jest.fn(),
      } as never,
      { businessToday: jest.fn().mockResolvedValue('2026-11-10') } as never,
      { emit: jest.fn() } as never,
      aftermath,
      {
        planOf: jest.fn().mockResolvedValue({ provisioningType: 'K2' }),
        completedOf: jest.fn().mockResolvedValue({}),
      } as never,
    );

    await service.complete(ACTOR, 'task-1', { completion: 'ACCOUNT_REMOVED', evidence: 'done' });

    expect(lockPeriodsAndLines).toHaveBeenCalledWith(tx, ['sub-slack'], ['line-slack']);
    expect(order).toEqual(['lines', 'assignment']);
    expect(recordMember).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'line-slack' }), -1, '2026-12-05', {
      recordedByEmployeeId: ACTOR.employeeId,
    });
  });
});
