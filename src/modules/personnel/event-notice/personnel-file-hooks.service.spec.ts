import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  PersonnelFileHookContributions,
  type PersonnelFileEvent,
  type PersonnelFileHook,
} from '../public/personnel.extension-points';
import { PersonnelFileHooks } from './personnel-file-hooks.service';

const tx = {} as DbTx;
const event: PersonnelFileEvent = {
  fileKind: 'OFFBOARDING',
  fileId: 'case-1',
  employeeId: 'emp-1',
  dueOn: '2026-12-01',
};
const moved = { ...event, previousDueOn: '2026-11-20' };

function build(...hooks: [string, PersonnelFileHook][]): PersonnelFileHooks {
  const contributions = new PersonnelFileHookContributions();
  for (const [name, hook] of hooks) contributions.add(name, hook);

  return new PersonnelFileHooks(contributions);
}

describe('PersonnelFileHooks (OD-R10 = A: a hook is a part of the write)', () => {
  it.each([
    ['onRecorded', (hooks: PersonnelFileHooks) => hooks.onRecorded(tx, event), event],
    ['onDueChanged', (hooks: PersonnelFileHooks) => hooks.onDueChanged(tx, moved), moved],
    ['onCancelled', (hooks: PersonnelFileHooks) => hooks.onCancelled(tx, event), event],
    ['onLeft', (hooks: PersonnelFileHooks) => hooks.onLeft(tx, event), event],
  ] as const)(
    'calls %s on every hook in the order they were added, with the transaction and the event',
    async (step, run, sent) => {
      const calls: string[] = [];
      const hook = (name: string): PersonnelFileHook => ({
        [step]: (received: DbTx, payload: unknown) => {
          calls.push(name);
          expect(received).toBe(tx);
          expect(payload).toBe(sent);

          return Promise.resolve();
        },
      });

      await run(build(['first', hook('first')], ['second', hook('second')], ['third', hook('third')]));

      expect(calls).toEqual(['first', 'second', 'third']);
    },
  );

  it('skips a hook that has no such step, and calls none when there is no hook', async () => {
    const onLeft = jest.fn(() => Promise.resolve());

    await build(['recorded-only', { onRecorded: () => Promise.resolve() }], ['leaver', { onLeft }]).onLeft(tx, event);
    await build().onRecorded(tx, event);

    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('lets the error of a hook reach the caller, unchanged, and does not call the hooks after it', async () => {
    const failure = new Error('a hook failed');
    const later = jest.fn(() => Promise.resolve());
    const hooks = build(
      ['fine', { onRecorded: () => Promise.resolve() }],
      ['fails', { onRecorded: () => Promise.reject(failure) }],
      ['later', { onRecorded: later }],
    );

    await expect(hooks.onRecorded(tx, event)).rejects.toBe(failure);
    expect(later).not.toHaveBeenCalled();
  });

  it('lets a hook that throws before it returns a promise reach the caller as a rejection too', async () => {
    const failure = new TypeError('not a promise');
    const hooks = build([
      'sync',
      {
        onCancelled: () => {
          throw failure;
        },
      },
    ]);

    await expect(hooks.onCancelled(tx, event)).rejects.toBe(failure);
  });
});
