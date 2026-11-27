import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../infrastructure/config/env-schema';
import type { QueueProducers } from '../infrastructure/queue/queue-producers';
import { jobOptionsFor } from '../infrastructure/queue/queue-registry';
import { OutboxRelayLoop } from './outbox-relay.job';

function fixture() {
  const dueIds = jest.fn().mockResolvedValue(['message-one', 'message-two']);
  const addBulk = jest.fn().mockResolvedValue([]);
  const producers = { get: jest.fn().mockReturnValue({ addBulk }) };
  const config = new ConfigService<EnvironmentVariables, true>({ QUEUE_RELAY_INTERVAL_MS: 200 });
  const relay = new OutboxRelayLoop(
    [{ queue: 'email-delivery', dueIds }],
    producers as unknown as QueueProducers,
    config,
  );
  return { relay, dueIds, addBulk };
}

describe('outbox relay', () => {
  it('enqueues only the due IDs, with one BullMQ job per live deduplication key', async () => {
    const { relay, dueIds, addBulk } = fixture();
    const now = new Date('2026-11-27T00:00:00.000Z');
    await relay.tick(now);
    expect(dueIds).toHaveBeenCalledWith(100, now);
    expect(addBulk).toHaveBeenCalledWith([
      {
        name: 'deliver',
        data: { outboxId: 'message-one' },
        opts: jobOptionsFor('email-delivery', 'message-one'),
      },
      {
        name: 'deliver',
        data: { outboxId: 'message-two' },
        opts: jobOptionsFor('email-delivery', 'message-two'),
      },
    ]);
  });

  it.each(['ECONNREFUSED', 'OOM'])(
    'leaves due rows alone and rate-limits backlog logging when Redis reports %s',
    async (code) => {
      const { relay, addBulk } = fixture();
      addBulk.mockRejectedValue(Object.assign(new Error('raw error with fixture secret'), { code }));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        await expect(relay.tick(new Date(0))).resolves.toBeUndefined();
        await expect(relay.tick(new Date(59_999))).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenLastCalledWith(expect.stringContaining('2 outbox rows'));
        expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('fixture secret'));
        await relay.tick(new Date(60_000));
        expect(warn).toHaveBeenCalledTimes(2);
      } finally {
        warn.mockRestore();
        await relay.onModuleDestroy();
      }
    },
  );

  it('waits for an active tick on shutdown before accepting no further work', async () => {
    const { relay, addBulk, dueIds } = fixture();
    let complete!: () => void;
    addBulk.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    const tick = relay.tick();
    const completed = jest.fn();
    const closing = relay.onModuleDestroy().then(completed);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    complete();
    await Promise.all([tick, closing, relay.tick()]);
    expect(dueIds).toHaveBeenCalledTimes(1);
  });
});
