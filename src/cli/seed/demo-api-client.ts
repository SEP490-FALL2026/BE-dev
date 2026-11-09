/**
 * The HTTP side of `pnpm ops:seed`: it calls the public API of the running installation exactly as the FE does
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

/**
 * `TIMEOUT`: no answer within the client's limit — the request may have reached the API. `NETWORK`: the connection
 * could not be made or broke (refused, DNS, reset).
 */
export type UnreachableKind = 'TIMEOUT' | 'NETWORK';

/**
 * The socket, DNS and undici codes an unreachable API is reported with. Anything else is shown as no code: a code is
 * printed only when it is known to carry no data.
 */
const NETWORK_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
]);
const TIMEOUT_CODES: ReadonlySet<string> = new Set(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

/**
 * The API could not be reached (refused connection, DNS, timeout): nothing it would have written is known. It names
 * the request, the kind of failure, the listed code fetch hides in its `cause` and the time the attempt took — never
 * the address, the message of the cause, a header or a body.
 */
export class DemoApiUnreachableError extends Error {
  /** `METHOD path kind=… [code=…] [elapsedMs=…]`, for a refusal line. */
  readonly detail: string;

  constructor(
    readonly method: string,
    readonly path: string,
    readonly kind: UnreachableKind = 'NETWORK',
    readonly code: string | null = null,
    readonly elapsedMs: number | null = null,
  ) {
    const facts = [`kind=${kind}`];
    if (code !== null) facts.push(`code=${code}`);
    if (elapsedMs !== null) facts.push(`elapsedMs=${elapsedMs}`);
    super(`${method} ${path}: the API could not be reached (${facts.join(' ')})`);
    this.name = 'DemoApiUnreachableError';
    this.detail = `${method} ${path} ${facts.join(' ')}`;
  }
}

/** The first listed code in the cause chain of a failed fetch (an AggregateError holds one error per address tried). */
function networkCodeOf(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current !== undefined && current !== null; depth++) {
    const candidates: unknown[] =
      current instanceof AggregateError ? [current, ...(current.errors as unknown[])] : [current];
    for (const candidate of candidates) {
      const code = (candidate as { code?: unknown }).code;
      if (typeof code === 'string' && NETWORK_CODES.has(code)) return code;
    }
    current = current instanceof Error ? current.cause : undefined;
  }

  return null;
}

function unreachableKindOf(error: unknown, code: string | null): UnreachableKind {
  // AbortSignal.timeout rejects with a DOMException, which is not an `Error` in every realm: matched by name.
  const name = (error as { name?: unknown } | null)?.name;
  const timedOut = name === 'TimeoutError' || name === 'AbortError';

  return timedOut || (code !== null && TIMEOUT_CODES.has(code)) ? 'TIMEOUT' : 'NETWORK';
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface DemoApiOptions {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** How many times a 429 or a 503 is retried before it is reported. */
  retries?: number;
  timeoutMs?: number;
  /** A monotonic clock in ms, for the time an unreachable attempt took. */
  now?: () => number;
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
  private readonly now: () => number;

  constructor(
    private readonly baseUrl: string,
    options: DemoApiOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.retries = options.retries ?? 5;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.now = options.now ?? (() => performance.now());
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
  async call<T>(
    email: string,
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const session = this.sessions.get(email);
    if (!session) throw new Error(`No session for the account of this step (${method} ${path})`);
    try {
      return await this.send<T>(method, path, body, session.accessToken, headers);
    } catch (error) {
      // An access token lives minutes; a long run outlives it. Sign in again once, then let any error through.
      if (!(error instanceof DemoApiError) || error.status !== 401) throw error;
      await this.login(session.email, session.password);
      return this.send<T>(method, path, body, this.sessions.get(email)?.accessToken ?? '', headers);
    }
  }

  /** Uploads one file with the text fields beside it (`multipart/form-data`), as the account of `email`. */
  async upload<T>(
    email: string,
    path: string,
    file: { name: string; content: string; type: string },
    fields: Record<string, string> = {},
  ): Promise<T> {
    const form = (): FormData => {
      const data = new FormData();
      for (const [name, value] of Object.entries(fields)) data.append(name, value);
      data.append('file', new Blob([file.content], { type: file.type }), file.name);

      return data;
    };
    const session = this.sessions.get(email);
    if (!session) throw new Error(`No session for the account of this step (POST ${path})`);
    try {
      return await this.send<T>('POST', path, form(), session.accessToken);
    } catch (error) {
      if (!(error instanceof DemoApiError) || error.status !== 401) throw error;
      await this.login(session.email, session.password);
      return this.send<T>('POST', path, form(), this.sessions.get(email)?.accessToken ?? '');
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

  private async send<T>(
    method: string,
    path: string,
    body?: unknown,
    token?: string,
    headers: Record<string, string> = {},
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchOnce(method, path, body, token, headers);
      if (retryable(method, response.status) && attempt < this.retries) {
        await this.sleep(waitOf(response, attempt));
        continue;
      }
      return this.read<T>(method, path, response);
    }
  }

  private async fetchOnce(
    method: string,
    path: string,
    body: unknown,
    token?: string,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json', ...extra };
    const isForm = body instanceof FormData;
    if (body !== undefined && !isForm) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const startedAt = this.now();
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const code = networkCodeOf(error);
      const elapsedMs = Math.round(this.now() - startedAt);
      throw new DemoApiUnreachableError(method, path, unreachableKindOf(error, code), code, elapsedMs);
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
