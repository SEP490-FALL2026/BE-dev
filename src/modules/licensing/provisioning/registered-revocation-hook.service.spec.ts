import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { RevocationHook, RevocationTaskFacts } from '../licensing.types';
import { RegisteredRevocationHook } from './registered-revocation-hook.service';

const tx = {} as DbTx;
const actor = { appUserId: 'u1' } as AuthenticatedPrincipal;
const task: RevocationTaskFacts = {
  id: 't1',
  assignmentId: 'a1',
  employeeId: 'e1',
  planId: 'p1',
  status: 'IN_PROGRESS',
};
const now = new Date('2026-10-24T01:00:00Z');

const hookNamed = (
  name: string,
  calls: string[],
  options: { refuse?: boolean; closed?: boolean } = {},
): RevocationHook => ({
  onOpened: () => {
    calls.push(`${name}:opened`);

    return Promise.resolve();
  },
  beforeWork: () => {
    calls.push(`${name}:before`);

    return options.refuse ? Promise.reject(new Error(`${name} refuses`)) : Promise.resolve();
  },
  afterWork: () => {
    calls.push(`${name}:after`);

    return Promise.resolve();
  },
  ...(options.closed === false
    ? {}
    : {
        afterClosedFailed: () => {
          calls.push(`${name}:closed`);

          return Promise.resolve();
        },
      }),
});

describe('the hooks that extend a revocation', () => {
  it('runs nothing while no hook is registered', async () => {
    const hooks = new RegisteredRevocationHook();

    await expect(hooks.beforeWork(tx, task, now)).resolves.toBeUndefined();
    await expect(hooks.afterWork(tx, task, now, actor)).resolves.toBeUndefined();
    await expect(hooks.afterClosedFailed(tx, task, 'closed', now, actor)).resolves.toBeUndefined();
  });

  it('asks every hook in the order it was registered, so one does not replace another', async () => {
    const calls: string[] = [];
    const hooks = new RegisteredRevocationHook();
    hooks.register(hookNamed('handover', calls));
    hooks.register(hookNamed('return', calls), 'RETURN_REQUESTS');

    await hooks.onOpened(tx, task, [], {}, actor, now);
    await hooks.beforeWork(tx, task, now);
    await hooks.afterWork(tx, task, now, actor);
    await hooks.afterClosedFailed(tx, task, 'closed', now, actor);

    expect(calls).toEqual([
      'handover:opened',
      'return:opened',
      'handover:before',
      'return:before',
      'handover:after',
      'return:after',
      'handover:closed',
      'return:closed',
    ]);
  });

  it('replaces the hook of the same name, so a module that starts twice leaves one', async () => {
    const calls: string[] = [];
    const hooks = new RegisteredRevocationHook();
    hooks.register(hookNamed('first', calls), 'RETURN_REQUESTS');
    hooks.register(hookNamed('second', calls), 'RETURN_REQUESTS');

    await hooks.beforeWork(tx, task, now);

    expect(calls).toEqual(['second:before']);
  });

  it('stops at the first hook that refuses and does not ask the rest', async () => {
    const calls: string[] = [];
    const hooks = new RegisteredRevocationHook();
    hooks.register(hookNamed('first', calls, { refuse: true }), 'a');
    hooks.register(hookNamed('second', calls), 'b');

    await expect(hooks.beforeWork(tx, task, now)).rejects.toThrow('first refuses');

    expect(calls).toEqual(['first:before']);
  });

  it('leaves out the hook that has nothing to do when a revocation fails', async () => {
    const calls: string[] = [];
    const hooks = new RegisteredRevocationHook();
    hooks.register(hookNamed('quiet', calls, { closed: false }), 'a');
    hooks.register(hookNamed('told', calls), 'b');

    await hooks.afterClosedFailed(tx, task, 'closed', now, actor);

    expect(calls).toEqual(['told:closed']);
  });
});
