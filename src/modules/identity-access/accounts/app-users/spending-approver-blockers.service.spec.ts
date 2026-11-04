import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import {
  SPENDING_APPROVER_BLOCKER_LIMIT,
  SpendingApproverGrantChecks,
  type SpendingApproverBlocker,
} from '../../public/identity-access.extension-points';
import { SpendingApproverBlockersService } from './spending-approver-blockers.service';

const tx = {} as DbTx;
const blocker = (kind: SpendingApproverBlocker['kind'], id: string): SpendingApproverBlocker => ({
  kind,
  id,
  label: `${kind} ${id}`,
});

describe('SpendingApproverBlockersService', () => {
  it('finds nothing when no module added a check', async () => {
    const service = new SpendingApproverBlockersService(new SpendingApproverGrantChecks());

    await expect(service.of(tx, 'employee')).resolves.toEqual({ blockers: [], truncated: false });
  });

  it('puts the answers of every check in one order, by kind and then id, whichever module answered first', async () => {
    const checks = new SpendingApproverGrantChecks();
    checks.add('b', { blockersOf: () => Promise.resolve([blocker('SERVICE_ACCOUNT', 'z'), blocker('REQUEST', 'b')]) });
    checks.add('a', { blockersOf: () => Promise.resolve([blocker('REQUEST', 'a'), blocker('BUDGET_PROPOSAL', 'p')]) });

    const found = await new SpendingApproverBlockersService(checks).of(tx, 'employee');

    expect(found.blockers.map((entry) => `${entry.kind}:${entry.id}`)).toEqual([
      'BUDGET_PROPOSAL:p',
      'REQUEST:a',
      'REQUEST:b',
      'SERVICE_ACCOUNT:z',
    ]);
    expect(found.truncated).toBe(false);
  });

  it('keeps the first fifty and says the list was cut', async () => {
    const checks = new SpendingApproverGrantChecks();
    const many = Array.from({ length: SPENDING_APPROVER_BLOCKER_LIMIT + 1 }, (_, index) =>
      blocker('REQUEST', String(index).padStart(3, '0')),
    );
    checks.add('requests', { blockersOf: () => Promise.resolve(many) });

    const found = await new SpendingApproverBlockersService(checks).of(tx, 'employee');

    expect(found.blockers).toHaveLength(SPENDING_APPROVER_BLOCKER_LIMIT);
    expect(found.blockers[SPENDING_APPROVER_BLOCKER_LIMIT - 1].id).toBe('049');
    expect(found.truncated).toBe(true);
  });

  it('asks each check for the person it was given, in the transaction it was given', async () => {
    const checks = new SpendingApproverGrantChecks();
    const asked: unknown[][] = [];
    checks.add('requests', {
      blockersOf: (given, employeeId) => {
        asked.push([given, employeeId]);

        return Promise.resolve([]);
      },
    });

    await new SpendingApproverBlockersService(checks).of(tx, 'employee-1');

    expect(asked).toEqual([[tx, 'employee-1']]);
  });
});
