import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ApprovalRoleChange, ApprovalRoleChangeListener } from '../identity-access.types';
import { ApprovalRoleChangeRegistry } from './approval-role-change.registry';

const TX = {} as DbTx;
const CHANGE = { role: 'FINANCE', fromEmployeeId: null, toEmployeeId: 'e-1' } as const;

describe('ApprovalRoleChangeRegistry (FR-3.16)', () => {
  it('tells each listener the change in the order they registered, with an identity made when it is announced', async () => {
    const heard: string[] = [];
    const seen: ApprovalRoleChange[] = [];
    const registry = new ApprovalRoleChangeRegistry();
    const listener = (name: string): ApprovalRoleChangeListener => ({
      onChange: (tx, change) => {
        expect(tx).toBe(TX);
        heard.push(name);
        seen.push(change);

        return Promise.resolve();
      },
    });
    registry.register(listener('first'));
    registry.register(listener('second'));

    const announced = await registry.announce(TX, CHANGE);

    expect(heard).toEqual(['first', 'second']);
    expect(seen).toEqual([announced, announced]);
    expect(announced).toMatchObject(CHANGE);
    expect(announced.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('stops at the listener that refuses and lets its error reach the transaction of the change', async () => {
    const registry = new ApprovalRoleChangeRegistry();
    const after = jest.fn();
    registry.register({ onChange: () => Promise.reject(new Error('refused')) });
    registry.register({ onChange: after });

    await expect(registry.announce(TX, CHANGE)).rejects.toThrow('refused');
    expect(after).not.toHaveBeenCalled();
  });
});
