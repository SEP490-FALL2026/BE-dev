/**
 * The HTTP side of `pnpm ops:demo-dataset`: it calls the public API of the running installation exactly as the FE does
 * (`/api/v1`, Bearer access token, the success and error envelopes), so every demo record is written by the business
 * rules and the actor they name. Passwords and tokens stay in memory and are never printed: an error names the method,
 * the path, the status and the error code only.
 */

export class DemoApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly code: string,
    readonly details: unknown = null,
  ) {
    super(`${method} ${path} answered ${status} ${code}`);
    this.name = 'DemoApiError';
  }
}

/** The API could not be reached (refused connection, DNS, timeout): nothing it would have written is known. */
export class DemoApiUnreachableError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
  ) {
    super(`${method} ${path}: the API could not be reached`);
    this.name = 'DemoApiUnreachableError';
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface DemoApiOptions {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** How many times a 429 or a 503 is retried before it is reported. */
  retries?: number;
  timeoutMs?: number;
}

interface Session {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * 429 comes from the throttler before any handler runs, so every method is retried. A 503 of a write may follow a commit
 * whose reply was lost, so only a read is retried; a write that answers 503 is reported, and the next run reads what is
 * there before it writes again.
 */
const retryable = (method: string, status: number): boolean => status === 429 || (status === 503 && method === 'GET');
const MAX_WAIT_MS = 65_000;

export class DemoApiClient {
  private readonly sessions = new Map<string, Session>();
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retries: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly baseUrl: string,
    options: DemoApiOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.retries = options.retries ?? 5;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /** Signs in once per email; later calls reuse the session. */
  async signIn(email: string, password: string): Promise<void> {
    if (this.sessions.has(email)) return;
    await this.login(email, password);
  }

  hasSession(email: string): boolean {
    return this.sessions.has(email);
  }

  /** The `data` of a 2xx answer, as the account of `email` (signed in before). Throws DemoApiError otherwise. */
  async call<T>(email: string, method: string, path: string, body?: unknown): Promise<T> {
    const session = this.sessions.get(email);
    if (!session) throw new Error(`No session for the account of this step (${method} ${path})`);
    try {
      return await this.send<T>(method, path, body, session.accessToken);
    } catch (error) {
      // An access token lives minutes; a long run outlives it. Sign in again once, then let any error through.
      if (!(error instanceof DemoApiError) || error.status !== 401) throw error;
      await this.login(session.email, session.password);
      return this.send<T>(method, path, body, this.sessions.get(email)?.accessToken ?? '');
    }
  }

  /** Ends every session this run opened (best effort: a logout that fails leaves a session that expires by itself). */
  async signOutAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      await this.send('POST', '/auth/logout', { refreshToken: session.refreshToken }).catch(() => undefined);
    }
    this.sessions.clear();
  }

  private async login(email: string, password: string): Promise<void> {
    const data = await this.send<{ accessToken: string; refreshToken: string }>('POST', '/auth/login', {
      email,
      password,
    });
    this.sessions.set(email, { email, password, accessToken: data.accessToken, refreshToken: data.refreshToken });
  }

  private async send<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchOnce(method, path, body, token);
      if (retryable(method, response.status) && attempt < this.retries) {
        await this.sleep(waitOf(response, attempt));
        continue;
      }
      return this.read<T>(method, path, response);
    }
  }

  private async fetchOnce(method: string, path: string, body: unknown, token?: string): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new DemoApiUnreachableError(method, path);
    }
  }

  private async read<T>(method: string, path: string, response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    let parsed: { data?: T; error?: { code?: string; details?: unknown } } = {};
    try {
      parsed = text ? (JSON.parse(text) as typeof parsed) : {};
    } catch {
      parsed = {};
    }
    if (response.ok) return parsed.data as T;

    throw new DemoApiError(
      method,
      path,
      response.status,
      parsed.error?.code ?? 'UNKNOWN',
      parsed.error?.details ?? null,
    );
  }
}

/** The wait before a retry: the server's `Retry-After` when it gives one (bounded), otherwise a short backoff. */
function waitOf(response: Response, attempt: number): number {
  const header = Number(response.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, MAX_WAIT_MS);

  return Math.min(1000 * 2 ** attempt, MAX_WAIT_MS);
}
