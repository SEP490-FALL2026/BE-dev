import { once } from 'node:events';
import { connect, createServer, Socket } from 'node:net';
import { PgRelay } from '../../support/pg-relay';

/** A real TCP peer: no PostgreSQL is needed to prove delivery of a socket-close event. */
async function heldConnection() {
  const peers = new Set<Socket>();
  const upstream = createServer((socket) => {
    peers.add(socket);
    socket.on('close', () => peers.delete(socket));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('The test peer is not listening');
  const relay = await PgRelay.start('127.0.0.1', address.port);
  const client = connect(relay.port, '127.0.0.1');
  await once(client, 'connect');
  relay.holdWhen(/SELECT held/);
  const observed = new Promise<void>((resolve) => relay.observe(() => resolve()));
  const startup = Buffer.alloc(8);
  startup.writeInt32BE(8, 0);
  startup.writeInt32BE(196608, 4);
  const sql = Buffer.from('SELECT held\0');
  const query = Buffer.alloc(5);
  query[0] = 0x51;
  query.writeInt32BE(sql.length + 4, 1);
  client.write(Buffer.concat([startup, query, sql]));
  await observed;

  return {
    relay,
    client,
    async close() {
      client.destroy();
      await relay.stop();
      for (const peer of peers) peer.destroy();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    },
  };
}

describe('the relay observes peer shutdown without forcing it', () => {
  it('waits for the held connection to close after its client is destroyed', async () => {
    const fixture = await heldConnection();
    try {
      expect(fixture.relay.holding).toBe(true);
      const closed = fixture.relay.waitForHeldConnectionsToClose(10000);
      fixture.client.destroy();
      await closed;
      expect(fixture.relay.holding).toBe(false);
      await fixture.relay.waitForHeldConnectionsToClose(10000);
    } finally {
      await fixture.close();
    }
  });

  it('fails at its deadline instead of closing a peer that is still alive', async () => {
    const fixture = await heldConnection();
    try {
      await expect(fixture.relay.waitForHeldConnectionsToClose(25)).rejects.toThrow('still open');
      expect(fixture.relay.holding).toBe(true);
    } finally {
      await fixture.close();
    }
  });
});
