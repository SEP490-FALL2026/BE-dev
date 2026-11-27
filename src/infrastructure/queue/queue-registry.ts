import type { JobsOptions } from 'bullmq';

export const QUEUE_NAMES = ['email-delivery', 'nightly-maintenance'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

const jobRetention: Record<QueueName, Pick<JobsOptions, 'removeOnComplete' | 'removeOnFail'>> = {
  'email-delivery': {
    removeOnComplete: { age: 604_800, count: 1_000 },
    removeOnFail: { age: 2_592_000, count: 5_000 },
  },
  'nightly-maintenance': {
    removeOnComplete: { age: 2_592_000, count: 60 },
    removeOnFail: { age: 2_592_000, count: 60 },
  },
};

export function jobOptionsFor(name: QueueName, dedupId?: string): JobsOptions {
  return {
    ...jobRetention[name],
    attempts: 1,
    stackTraceLimit: 0,
    ...(dedupId === undefined ? {} : { deduplication: { id: dedupId } }),
  };
}
