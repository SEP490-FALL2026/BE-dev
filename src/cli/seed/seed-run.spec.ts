import type { DemoAccountsApi } from '../../modules/installation/public/demo-accounts.api';
import { DemoApiUnreachableError, FetchLike } from './demo-api-client';
import { DemoRunClock } from './demo-failure';
import { runSeed } from './seed-run';
import type { SeedCommandArguments } from './seed.arguments';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const facts = {
  organizationId: 'org-1',
  organizationName: 'SLM Demo',
  reportingCurrency: 'VND',
  today: '2026-10-31',
  timeZone: 'Asia/Ho_Chi_Minh',
  superAdmin: { appUserId: 'sa-1', employeeId: 'e-1', loginEmail: 'sa@acme.example' },
};

const args = (mode: 'plan' | 'apply'): SeedCommandArguments => ({
  mode,
  fixture: 'shared-demo-v2',
  apiUrl: 'http://slm-api:4000',
  operator: 'CHG-1',
  environment: 'SHARED',
  json: false,
  allowBootstrap: false,
  secretsStdin: true,
});

const secrets = { superAdminPassword: 'sa-password-123', demoAccountPassword: 'demo-password-123' };

function accounts(options: { release?: () => Promise<void>; inspect?: () => Promise<unknown> } = {}) {
  return {
    seedState: () => Promise.resolve('INSTALLED'),
    inspect: options.inspect ?? (() => Promise.resolve(facts)),
    holdApplyLock: () => Promise.resolve({ release: options.release ?? (() => Promise.resolve()) }),
  } as unknown as DemoAccountsApi;
}

/** Answers by `METHOD path` (path after /api/v1); a function may throw to play a network failure. */
function api(routes: Record<string, () => Response | Promise<Response>>): FetchLike {
  return (url, init) => {
    const key = `${init.method} ${new URL(url).pathname.replace('/api/v1', '')}`;
    const route = routes[key];
    if (!route) return Promise.reject(new Error(`unexpected call ${key}`));
    return Promise.resolve().then(route);
  };
}

const signedIn = {
  'POST /auth/login': () => json(200, { success: true, data: { accessToken: 'a', refreshToken: 'r' } }),
  'POST /auth/logout': () => new Response(null, { status: 204 }),
};

const brokenLock = () => Promise.reject(new Error('Connection terminated unexpectedly'));

describe('a run of ops:seed', () => {
  it('keeps the outcome of an apply when releasing its lock fails, and warns that the lock connection broke', async () => {
    const outcome = await runSeed({
      args: args('apply'),
      secrets,
      accounts: accounts({ release: brokenLock }),
      fetch: api({ ...signedIn, 'GET /me': () => json(200, { success: true, data: { appUserId: 'someone-else' } }) }),
    });

    expect('refused' in outcome && outcome.refused).toContain('another installation');
    expect(outcome.warnings).toEqual([
      'The apply lock could not be released (Error retryable=true pg="Connection terminated unexpectedly"). ' +
        'PostgreSQL frees a session lock when its connection ends; if that connection ended during the run, ' +
        'a second apply was not kept out from then on.',
    ]);
  });

  it('reports the failure of the run, not the failure of releasing the lock after it', async () => {
    const run = runSeed({
      args: args('apply'),
      secrets,
      accounts: accounts({ release: brokenLock }),
      fetch: api({
        ...signedIn,
        'GET /me': () => json(200, { success: true, data: { appUserId: 'sa-1' } }),
        'GET /operating-parameters': () => Promise.reject(new TypeError('fetch failed')),
      }),
    });

    await expect(run).rejects.toBeInstanceOf(DemoApiUnreachableError);
  });

  it('says which request could not reach the API, how and after how long, without the address', async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 172.18.0.4:3000'), { code: 'ECONNREFUSED' });
    const outcome = await runSeed({
      args: args('plan'),
      secrets,
      accounts: accounts(),
      fetch: api({ 'POST /auth/login': () => Promise.reject(new TypeError('fetch failed', { cause: refused })) }),
    });

    expect('refused' in outcome && outcome.refused).toMatch(
      /^The API at --api-url cannot be reached \(POST \/auth\/login kind=NETWORK code=ECONNREFUSED elapsedMs=\d+\): nothing written\.$/,
    );
    expect(JSON.stringify(outcome)).not.toContain('172.18.0.4');
  });

  it('tells the clock which phase it is in, so a database failure is placed', async () => {
    const clock = new DemoRunClock();
    const failure = await runSeed({
      args: args('plan'),
      secrets,
      accounts: accounts({ inspect: () => Promise.reject(new Error('Query read timeout')) }),
      clock,
    }).catch((error: unknown) => error);

    expect(clock.failureLine(failure)).toMatch(
      /^The demo dataset run failed in phase installation-facts after \d+ ms \(run \d+ ms\): Error retryable=true pg="Query read timeout"$/,
    );
  });
  it('validates secrets before even taking the lock or reading installation state', async () => {
    const lock = jest.fn();
    const state = jest.fn();
    const outcome = await runSeed({
      args: args('apply'),
      secrets: { ...secrets, superAdminPassword: 'short' },
      accounts: { holdApplyLock: lock, seedState: state } as unknown as DemoAccountsApi,
    });
    expect(outcome).toEqual({ refused: 'SECRETS TOO_SHORT' });
    expect(lock).not.toHaveBeenCalled();
    expect(state).not.toHaveBeenCalled();
  });

  it('locks before reading EMPTY and releases after refusing missing bootstrap authorization', async () => {
    const order: string[] = [];
    const port = {
      holdApplyLock: () => {
        order.push('lock');
        return Promise.resolve({
          release: () => {
            order.push('release');
            return Promise.resolve();
          },
        });
      },
      seedState: () => {
        order.push('state');
        return Promise.resolve('EMPTY');
      },
    };
    expect(await runSeed({ args: args('apply'), secrets, accounts: port as unknown as DemoAccountsApi })).toEqual({
      refused: 'EMPTY: use --allow-bootstrap or ops:bootstrap.',
    });
    expect(order).toEqual(['lock', 'state', 'release']);
  });

  describe('with --allow-bootstrap on an EMPTY database', () => {
    const empty = (inspect: () => Promise<unknown>) =>
      ({
        seedState: () => Promise.resolve('EMPTY'),
        inspect,
        holdApplyLock: () => Promise.resolve({ release: () => Promise.resolve() }),
      }) as unknown as DemoAccountsApi;
    const bootstrapArgs = { ...args('apply'), allowBootstrap: true };

    it('refuses before the bootstrap writes anything when the API is not ready', async () => {
      const bootstrap = jest.fn(() => Promise.resolve());
      for (const ready of [() => json(503, {}), () => Promise.reject(new TypeError('fetch failed'))]) {
        const outcome = await runSeed({
          args: bootstrapArgs,
          secrets,
          accounts: empty(() => Promise.resolve(facts)),
          fetch: api({ 'GET /health/ready': ready }),
          bootstrap,
        });
        expect(outcome).toEqual({ refused: 'The API at http://slm-api:4000 is not ready: nothing written.' });
      }
      expect(bootstrap).not.toHaveBeenCalled();
    });

    it('marks a refusal after the bootstrap as a run that wrote', async () => {
      const bootstrap = jest.fn(() => Promise.resolve());
      const outcome = await runSeed({
        args: bootstrapArgs,
        secrets,
        accounts: empty(() => Promise.resolve({ ...facts, organizationName: 'Another' })),
        fetch: api({ 'GET /health/ready': () => json(200, {}) }),
        bootstrap,
      });
      expect(bootstrap).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({ wrote: true });
      expect('refused' in outcome && outcome.refused).toContain('bootstrapped before this refusal');
    });
  });
});
