import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { OrganizationService } from '../../organization/organization.service';
import type { RequestOutcomeEvent, RequestOutcomeListener } from '../requests.types';
import { RequestOutcomeListeners, type OutcomeSubject } from './request-outcome-listeners';

const TX = {} as DbTx;
const REQUEST: OutcomeSubject = { id: 'r-1', organizationId: 'org-1', departmentId: 'dept-a', planId: 'plan-1' };
const NOW = new Date('2026-10-28T03:00:00.000Z');

function listeners(today = '2026-10-28') {
  const businessToday = jest.fn().mockResolvedValue(today);
  const registry = new RequestOutcomeListeners({ businessToday } as unknown as OrganizationService);

  return { registry, businessToday };
}

const recording = () => {
  const heard: { tx: DbTx; event: RequestOutcomeEvent }[] = [];
  const listener: RequestOutcomeListener = {
    requestOutcome: (tx, event) => {
      heard.push({ tx, event });

      return Promise.resolve();
    },
  };

  return { heard, listener };
};

describe('telling the contexts that listen how a request ended (F43)', () => {
  it('tells a listener, in the transaction it was given, that the seat was granted', async () => {
    const { registry } = listeners();
    const { heard, listener } = recording();
    registry.register(listener);

    await registry.granted(TX, REQUEST, ['e-2', 'e-1'], NOW);

    expect(heard).toHaveLength(1);
    expect(heard[0].tx).toBe(TX);
    expect(heard[0].event).toEqual({
      organizationId: 'org-1',
      requestId: 'r-1',
      departmentId: 'dept-a',
      planId: 'plan-1',
      beneficiaryEmployeeIds: ['e-1', 'e-2'],
      outcome: 'GRANTED',
      endedOn: '2026-10-28',
    });
  });

  it('tells it that the request ended without a grant, for each way a request can end without one', async () => {
    const { registry } = listeners();
    const { heard, listener } = recording();
    registry.register(listener);

    await registry.ended(TX, { ...REQUEST, planId: null }, ['e-1'], NOW);

    expect(heard.map((item) => [item.event.outcome, item.event.planId, item.event.beneficiaryEmployeeIds])).toEqual([
      ['ENDED_WITHOUT_GRANT', null, ['e-1']],
    ]);
  });

  it('names a person once and sorts the people, whatever order and repeats it was given', async () => {
    const { registry } = listeners();
    const { heard, listener } = recording();
    registry.register(listener);

    await registry.ended(TX, REQUEST, ['c', 'a', 'b', 'a'], NOW);

    expect(heard[0].event.beneficiaryEmployeeIds).toEqual(['a', 'b', 'c']);
  });

  it('reads the day of the organization at the moment it ended', async () => {
    const { registry, businessToday } = listeners('2026-11-01');
    registry.register(recording().listener);

    await registry.granted(TX, REQUEST, ['e-1'], NOW);

    expect(businessToday).toHaveBeenCalledWith(NOW, TX);
  });

  it('tells every listener, in the order they registered, and stops at the one that fails so the end is undone as well', async () => {
    const { registry } = listeners();
    const order: string[] = [];
    registry.register({
      requestOutcome: () => {
        order.push('first');

        return Promise.resolve();
      },
    });
    registry.register({
      requestOutcome: () => {
        order.push('second');

        return Promise.reject(new Error('the second listener failed'));
      },
    });
    registry.register({
      requestOutcome: () => {
        order.push('third');

        return Promise.resolve();
      },
    });

    await expect(registry.ended(TX, REQUEST, ['e-1'], NOW)).rejects.toThrow('the second listener failed');
    expect(order).toEqual(['first', 'second']);
  });

  it('does nothing, and reads nothing, with nobody listening or nobody to tell of', async () => {
    const { registry, businessToday } = listeners();

    await registry.granted(TX, REQUEST, ['e-1'], NOW);
    registry.register(recording().listener);
    await registry.ended(TX, REQUEST, [], NOW);

    expect(businessToday).not.toHaveBeenCalled();
  });
});
