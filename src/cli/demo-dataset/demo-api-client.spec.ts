import { DemoApiClient, DemoApiError, DemoApiUnreachableError, FetchLike } from './demo-api-client';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const tokens = { success: true, data: { accessToken: 'access-1', refreshToken: 'refresh-1' } };

function client(responses: Array<() => Response | Promise<Response>>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) return Promise.reject(new Error('unexpected call'));
    return Promise.resolve(next());
  };
  const sleep = jest.fn((): Promise<void> => Promise.resolve());

  return { api: new DemoApiClient('http://api:3000/api/v1', { fetch, sleep }), calls, sleep };
}

describe('the HTTP client of ops:demo-dataset', () => {
  it('signs in once, sends the Bearer token and answers the data of the envelope', async () => {
    const { api, calls } = client([
      () => json(200, tokens),
      () => json(200, { success: true, data: { appUserId: 'u1' } }),
    ]);
    await api.signIn('a@x.example', 'pw');
    await api.signIn('a@x.example', 'pw');
    await expect(api.call('a@x.example', 'GET', '/me')).resolves.toEqual({ appUserId: 'u1' });
    expect(calls.map((call) => call.url)).toEqual(['http://api:3000/api/v1/auth/login', 'http://api:3000/api/v1/me']);
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe('Bearer access-1');
  });

  it('waits for Retry-After and tries again on 429, for any method', async () => {
    const { api, sleep } = client([
      () => json(200, tokens),
      () => json(429, { success: false, error: { code: 'HTTP_TOO_MANY_REQUESTS' } }, { 'retry-after': '3' }),
      () => json(201, { success: true, data: { id: 'd1' } }),
    ]);
    await api.signIn('a@x.example', 'pw');
    await expect(api.call('a@x.example', 'POST', '/departments', {})).resolves.toEqual({ id: 'd1' });
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it('retries a 503 of a read, never of a write (a lost reply may hide a commit)', async () => {
    const unavailable = () => json(503, { success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    const { api } = client([
      () => json(200, tokens),
      unavailable,
      () => json(200, { success: true, data: [] }),
      unavailable,
    ]);
    await api.signIn('a@x.example', 'pw');
    await expect(api.call('a@x.example', 'GET', '/departments')).resolves.toEqual([]);
    await expect(api.call('a@x.example', 'POST', '/departments', {})).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('signs in again once when the access token expired', async () => {
    const { api, calls } = client([
      () => json(200, tokens),
      () => json(401, { success: false, error: { code: 'INVALID_ACCESS_TOKEN' } }),
      () => json(200, { success: true, data: { accessToken: 'access-2', refreshToken: 'refresh-2' } }),
      () => json(200, { success: true, data: { ok: true } }),
    ]);
    await api.signIn('a@x.example', 'pw');
    await expect(api.call('a@x.example', 'GET', '/me')).resolves.toEqual({ ok: true });
    expect((calls[3].init.headers as Record<string, string>).authorization).toBe('Bearer access-2');
  });

  it('reports a refusal by method, path, status and code only, and an unreachable API as such', async () => {
    const { api } = client([
      () => json(401, { success: false, error: { code: 'AUTH.INVALID_CREDENTIALS', message: 'x' } }),
      () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.1:3000')),
    ]);
    const refusal = await api.signIn('a@x.example', 'the-password').catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(DemoApiError);
    expect((refusal as Error).message).toBe('POST /auth/login answered 401 AUTH.INVALID_CREDENTIALS');
    expect((refusal as Error).message).not.toContain('the-password');
    await expect(api.signIn('b@x.example', 'pw')).rejects.toBeInstanceOf(DemoApiUnreachableError);
  });

  describe('an API that cannot be reached', () => {
    /** One login that fails with `thrown` after the fake clock moved `elapsed` ms. */
    async function unreachable(thrown: Error | DOMException, elapsed = 12): Promise<DemoApiUnreachableError> {
      let now = 5_000;
      const fetch: FetchLike = () => {
        now += elapsed;
        return Promise.reject(thrown);
      };
      const api = new DemoApiClient('http://slm-api:4000/api/v1', { fetch, now: () => now });
      const error = await api.signIn('a@x.example', 'the-password').catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(DemoApiUnreachableError);
      return error as DemoApiUnreachableError;
    }

    it('keeps the socket code fetch hides in its cause, and the time it took', async () => {
      const cause = Object.assign(new Error('connect ECONNREFUSED 172.18.0.4:3000'), { code: 'ECONNREFUSED' });
      const error = await unreachable(new TypeError('fetch failed', { cause }));

      expect(error).toMatchObject({ kind: 'NETWORK', code: 'ECONNREFUSED', elapsedMs: 12 });
      expect(error.message).toBe(
        'POST /auth/login: the API could not be reached (kind=NETWORK code=ECONNREFUSED elapsedMs=12)',
      );
      expect(error.message).not.toContain('172.18.0.4');
    });

    it('tells a request that timed out from one that never connected', async () => {
      const error = await unreachable(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
        30_000,
      );

      expect(error).toMatchObject({ kind: 'TIMEOUT', code: null, elapsedMs: 30_000 });
      expect(error.message).toBe('POST /auth/login: the API could not be reached (kind=TIMEOUT elapsedMs=30000)');
    });

    it('finds a listed code among the attempts of an AggregateError (Happy Eyeballs), deep in the cause chain', async () => {
      const attempts = new AggregateError([
        Object.assign(new Error('a'), { code: 'EHOSTUNREACH' }),
        Object.assign(new Error('b'), { code: 'ECONNREFUSED' }),
      ]);
      const error = await unreachable(new TypeError('fetch failed', { cause: attempts }));

      expect(error.code).toBe('EHOSTUNREACH');
    });

    it('shows no code that is not on the list, and never the message of the cause', async () => {
      const cause = Object.assign(new Error('token=secret-value'), { code: 'E_SOMETHING_NEW' });
      const error = await unreachable(new TypeError('fetch failed', { cause }));

      expect(error.code).toBeNull();
      expect(error.message).toBe('POST /auth/login: the API could not be reached (kind=NETWORK elapsedMs=12)');
    });
  });

  it('ends every session it opened with the refresh token, and forgets them', async () => {
    const { api, calls } = client([() => json(200, tokens), () => new Response(null, { status: 204 })]);
    await api.signIn('a@x.example', 'pw');
    await api.signOutAll();
    expect(calls[1].url).toBe('http://api:3000/api/v1/auth/logout');
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ refreshToken: 'refresh-1' });
    expect(api.hasSession('a@x.example')).toBe(false);
  });
});
