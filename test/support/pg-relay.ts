import { connect, createServer, Server, Socket } from 'node:net';

interface RelayedConnection {
  client: Socket;
  upstream: Socket;
  held: boolean;
  responseHeld: boolean;
  queue: Array<{ to: Socket; chunk: Buffer }>;
  buffer: Buffer;
  startup: boolean;
  /** SQL text of the statements parsed on this connection, by name ('' is the unnamed one). */
  prepared: Map<string, string>;
  /** SQL text bound to each portal, by name. */
  portals: Map<string, string>;
}

export interface HeldCommitResponse {
  /** Resolves when a server response to the forwarded COMMIT is actually withheld. */
  held: Promise<void>;
  release(): void;
  dispose(): void;
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
 * - `observe(listener)` reports every statement a client executes, for counting (test/support/query-count.ts).
 *
 * Only the SQL text of Parse and Query messages and the names in Bind and Execute are read; bind values are never
 * inspected.
 */
export class PgRelay {
  private readonly server: Server;
  private readonly connections = new Set<RelayedConnection>();
  private paused = false;
  private trigger: RegExp | null = null;
  private readonly observers = new Set<(sql: string) => void>();
  private commitResponse: {
    connection?: RelayedConnection;
    received: () => void;
    failed: (error: Error) => void;
    cleanup: () => void;
  } | null = null;

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
    for (const connection of this.connections) if (!connection.held && !connection.responseHeld) this.flush(connection);
  }

  /** Holds the first connection that sends a statement matching `pattern`, from that statement on. */
  holdWhen(pattern: RegExp): void {
    this.trigger = pattern;
  }

  /**
   * Calls `listener` with the SQL text of every statement a client executes through the relay: a simple Query, or an
   * Execute of a portal bound to a parsed statement, so a prepared statement executed again counts again. Bind values
   * are never read. Returns the function that removes the listener.
   */
  observe(listener: (sql: string) => void): () => void {
    this.observers.add(listener);
    return () => this.observers.delete(listener);
  }

  /** True once a connection is being held because of `holdWhen`. */
  get holding(): boolean {
    return [...this.connections].some((connection) => connection.held);
  }

  /** Observe the held peers closing; never release or destroy them to make a failed cleanup look successful. */
  async waitForHeldConnectionsToClose(timeoutMs: number): Promise<void> {
    const sockets = [...this.connections]
      .filter((connection) => connection.held)
      .flatMap((connection) => [connection.client, connection.upstream]);
    if (sockets.every((socket) => socket.closed)) return;

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        for (const socket of sockets) socket.removeListener('close', onClose);
      };
      const onClose = (): void => {
        if (sockets.every((socket) => socket.closed)) {
          cleanup();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('A held relay connection is still open after its cleanup deadline'));
      }, timeoutMs);
      for (const socket of sockets) if (!socket.closed) socket.once('close', onClose);
      onClose();
    });
  }

  releaseHeld(): void {
    this.trigger = null;
    for (const connection of this.connections) {
      if (connection.held) {
        connection.held = false;
        if (!connection.responseHeld && !this.paused) this.flush(connection);
      }
    }
  }

  /**
   * Forwards the next COMMIT, then holds only that connection's server-to-client traffic.
   * Unlike holdWhen, PostgreSQL really receives COMMIT. The finite safety timer discards that
   * connection (never releases an unexpected late response); release/dispose/stop clear the timer.
   */
  holdCommitResponse(timeoutMs: number): HeldCommitResponse {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('A finite positive hold timeout is required');
    if (this.commitResponse) throw new Error('A COMMIT response hold is already active');
    let received!: () => void;
    let failed!: (error: Error) => void;
    const held = new Promise<void>((resolve, reject) => {
      received = resolve;
      failed = reject;
    });
    const hold = {
      received,
      failed,
      cleanup: (): void => clearTimeout(timer),
      connection: undefined as RelayedConnection | undefined,
    };
    const finish = (discard: boolean): void => {
      if (this.commitResponse !== hold) return;
      this.commitResponse = null;
      hold.cleanup();
      if (hold.connection) {
        hold.connection.responseHeld = false;
        if (discard) {
          hold.connection.client.destroy();
          hold.connection.upstream.destroy();
          hold.connection.queue = [];
        } else if (!this.paused && !hold.connection.held) this.flush(hold.connection);
      }
      failed(new Error('COMMIT response hold ended before receiving a response'));
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    this.commitResponse = hold;
    return { held, release: () => finish(false), dispose: () => finish(true) };
  }

  async stop(): Promise<void> {
    this.commitResponse?.cleanup();
    this.commitResponse?.failed(new Error('relay stopped before receiving a COMMIT response'));
    this.commitResponse = null;
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
      responseHeld: false,
      queue: [],
      buffer: Buffer.alloc(0),
      startup: true,
      prepared: new Map(),
      portals: new Map(),
    };
    this.connections.add(connection);

    client.on('data', (chunk: Buffer) => {
      // Parse every chunk, trigger or not: message framing is only known from the start of the stream.
      const statements = this.statements(connection, chunk);
      if (this.trigger && !connection.held && statements.some((sql) => this.trigger?.test(sql))) {
        connection.held = true;
        this.trigger = null;
      }
      const response = this.commitResponse;
      if (response && !response.connection && statements.some((sql) => /^COMMIT\b/i.test(sql))) {
        response.connection = connection;
        connection.responseHeld = true;
      }
      this.forward(connection, upstream, chunk);
    });
    upstream.on('data', (chunk: Buffer) => {
      this.forward(connection, client, chunk);
      if (connection.responseHeld) this.commitResponse?.received();
    });

    const close = (): void => {
      client.destroy();
      upstream.destroy();
      this.connections.delete(connection);
      if (this.commitResponse?.connection === connection) {
        this.commitResponse.cleanup();
        this.commitResponse.failed(new Error('COMMIT connection closed before receiving a response'));
        this.commitResponse = null;
      }
    };
    client.on('close', close).on('error', close);
    upstream.on('close', close).on('error', close);
  }

  private forward(connection: RelayedConnection, to: Socket, chunk: Buffer): void {
    if (this.paused || connection.held || (connection.responseHeld && to === connection.client))
      connection.queue.push({ to, chunk });
    else if (!to.destroyed) to.write(chunk);
  }

  private flush(connection: RelayedConnection): void {
    const queue = connection.queue;
    connection.queue = [];
    for (const { to, chunk } of queue) if (!to.destroyed) to.write(chunk);
  }

  private executed(sql: string): void {
    for (const observer of this.observers) observer(sql);
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
      if (type === 0x51) {
        const sql = body.toString('utf8', 0, body.indexOf(0));
        found.push(sql);
        this.executed(sql);
      }
      if (type === 0x50) {
        const nameEnd = body.indexOf(0);
        const sql = body.toString('utf8', nameEnd + 1, body.indexOf(0, nameEnd + 1));
        found.push(sql);
        connection.prepared.set(body.toString('utf8', 0, nameEnd), sql);
      }
      // Bind ('B'): portal name, statement name, then parameters, which are never read.
      if (type === 0x42) {
        const portalEnd = body.indexOf(0);
        const statement = body.toString('utf8', portalEnd + 1, body.indexOf(0, portalEnd + 1));
        connection.portals.set(body.toString('utf8', 0, portalEnd), connection.prepared.get(statement) ?? '');
      }
      // Execute ('E'): portal name, then a row limit.
      if (type === 0x45) this.executed(connection.portals.get(body.toString('utf8', 0, body.indexOf(0))) ?? '');
      connection.buffer = connection.buffer.subarray(1 + length);
    }
    return found;
  }
}
