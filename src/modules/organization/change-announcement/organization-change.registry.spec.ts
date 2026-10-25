import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationChangeRegistry } from './organization-change.registry';
import type { OrganizationChange, OrganizationChangeListener } from '../organization.types';

const TX = {} as DbTx;
const LEFT = { kind: 'EMPLOYEE_LEFT', employeeId: 'e-1', effectiveOn: '2026-10-24' } as const;

describe('OrganizationChangeRegistry (FR-3.16)', () => {
  it('tells each listener the change, in the order they registered, with one identity for all of them', async () => {
    const heard: string[] = [];
    const seen: OrganizationChange[] = [];
    const registry = new OrganizationChangeRegistry();
    const listener = (name: string): OrganizationChangeListener => ({
      onChange: (tx, change) => {
        expect(tx).toBe(TX);
        heard.push(name);
        seen.push(change);

        return Promise.resolve();
      },
    });
    registry.register(listener('first'));
    registry.register(listener('second'));

    await registry.announce(TX, LEFT);

    expect(heard).toEqual(['first', 'second']);
    expect(seen[0]).toMatchObject(LEFT);
    expect(seen[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen[1]).toBe(seen[0]);
  });

  it('gives every announcement its own identity', async () => {
    const ids: string[] = [];
    const registry = new OrganizationChangeRegistry();
    registry.register({
      onChange: (_tx, change) => {
        ids.push(change.id);

        return Promise.resolve();
      },
    });

    await registry.announce(TX, LEFT);
    await registry.announce(TX, LEFT);

    expect(new Set(ids).size).toBe(2);
  });

  it('stops at the listener that refuses and lets its error reach the transaction of the change', async () => {
    const registry = new OrganizationChangeRegistry();
    const after = jest.fn();
    registry.register({ onChange: () => Promise.reject(new Error('refused')) });
    registry.register({ onChange: after });

    await expect(registry.announce(TX, LEFT)).rejects.toThrow('refused');
    expect(after).not.toHaveBeenCalled();
  });

  it('announces to nobody without error when no module registered', async () => {
    await expect(new OrganizationChangeRegistry().announce(TX, LEFT)).resolves.toBeUndefined();
  });
});
