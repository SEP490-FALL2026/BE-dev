import { jobOptionsFor } from './queue-registry';

describe('queue registry', () => {
  it('sets one BullMQ attempt, bounded retention, no stacks and simple deduplication', () => {
    expect(jobOptionsFor('email-delivery', 'outbox-id')).toEqual({
      attempts: 1,
      stackTraceLimit: 0,
      deduplication: { id: 'outbox-id' },
      removeOnComplete: { age: 604_800, count: 1_000 },
      removeOnFail: { age: 2_592_000, count: 5_000 },
    });
  });
});
