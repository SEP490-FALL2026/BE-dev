import { connect, createServer, Server, Socket } from 'node:net';

interface RelayedConnection {
  client: Socket;
  upstream: Socket;
  held: boolean;
  queue: Array<{ to: Socket; chunk: Buffer }>;
  buffer: Buffer;
  startup: boolean;
}

/**
 * A TCP relay in front of PostgreSQL for tests of an unresponsive database.
 *
 * - `pause()` / `resume()` stop and restart every byte in both directions, which is what a paused
 *   container or a dropped network path looks like to the client: no error, no answer.
 * - `holdWhen(pattern)` lets traffic flow until the client sends a statement whose SQL text matches,
 *   then holds that one connection (that statement and everything after it). `releaseHeld()` delivers
 *   what was held, so the test can see what PostgreSQL does with a statement it receives late.
 *
 * Only the SQL text of Parse and Query messages is read; bind values are never inspected.
 */
export class PgRelay {
  private readonly server: Server;
  private readonly connections = new Set<RelayedConnection>();
  private paused = false;
  private trigger: RegExp | null = null;

  private constructor(
    private readonly upstreamHost: string,
    private readonly upstreamPort: number,
  ) {
    this.server = createServer((client) => this.accept(client));
  }

  static async start(upstreamHost: string, upstreamPort: number): Promise<PgRelay> {
    const relay = new PgRelay(upstreamHost, upstreamPort);
    await new Promise<void>((resolve) => relay.server.listen(0, '127.0.0.1', resolve));
    return relay;
  }

  get port(): number {
    const address = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('relay is not listening');
    return address.port;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    for (const connection of this.connections) if (!connection.held) this.flush(connection);
  }

  /** Holds the first connection that sends a statement matching `pattern`, from that statement on. */
  holdWhen(pattern: RegExp): void {
    this.trigger = pattern;
  }

  /** True once a connection is being held because of `holdWhen`. */
  get holding(): boolean {
    return [...this.connections].some((connection) => connection.held);
  }

  releaseHeld(): void {
    this.trigger = null;
    for (const connection of this.connections) {
      if (connection.held) {
        connection.held = false;
        this.flush(connection);
      }
    }
  }

  async stop(): Promise<void> {
    for (const connection of this.connections) {
      connection.client.destroy();
      connection.upstream.destroy();
    }
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private accept(client: Socket): void {
    const upstream = connect(this.upstreamPort, this.upstreamHost);
    const connection: RelayedConnection = {
      client,
      upstream,
      held: false,
      queue: [],
      buffer: Buffer.alloc(0),
      startup: true,
    };
    this.connections.add(connection);

    client.on('data', (chunk: Buffer) => {
      // Parse every chunk, trigger or not: message framing is only known from the start of the stream.
      const statements = this.statements(connection, chunk);
      if (this.trigger && !connection.held && statements.some((sql) => this.trigger?.test(sql))) {
        connection.held = true;
        this.trigger = null;
      }
      this.forward(connection, upstream, chunk);
    });
    upstream.on('data', (chunk: Buffer) => this.forward(connection, client, chunk));

    const close = (): void => {
      client.destroy();
      upstream.destroy();
      this.connections.delete(connection);
    };
    client.on('close', close).on('error', close);
    upstream.on('close', close).on('error', close);
  }

  private forward(connection: RelayedConnection, to: Socket, chunk: Buffer): void {
    if (this.paused || connection.held) connection.queue.push({ to, chunk });
    else if (!to.destroyed) to.write(chunk);
  }

  private flush(connection: RelayedConnection): void {
    const queue = connection.queue;
    connection.queue = [];
    for (const { to, chunk } of queue) if (!to.destroyed) to.write(chunk);
  }

  /** SQL text of the Parse ('P') and Query ('Q') messages completed by this chunk. */
  private statements(connection: RelayedConnection, chunk: Buffer): string[] {
    connection.buffer = Buffer.concat([connection.buffer, chunk]);
    const found: string[] = [];
    for (;;) {
      if (connection.startup) {
        if (connection.buffer.length < 8) break;
        const length = connection.buffer.readInt32BE(0);
        if (connection.buffer.length < length) break;
        const code = connection.buffer.readInt32BE(4);
        connection.buffer = connection.buffer.subarray(length);
        // SSLRequest / GSSENCRequest are followed by the real startup message.
        if (code !== 80877103 && code !== 80877104) connection.startup = false;
        continue;
      }
      if (connection.buffer.length < 5) break;
      const type = connection.buffer[0];
      const length = connection.buffer.readInt32BE(1);
      if (connection.buffer.length < 1 + length) break;
      const body = connection.buffer.subarray(5, 1 + length);
      if (type === 0x51) found.push(body.toString('utf8', 0, body.indexOf(0)));
      if (type === 0x50) {
        const nameEnd = body.indexOf(0);
        found.push(body.toString('utf8', nameEnd + 1, body.indexOf(0, nameEnd + 1)));
      }
      connection.buffer = connection.buffer.subarray(1 + length);
    }
    return found;
  }
}
