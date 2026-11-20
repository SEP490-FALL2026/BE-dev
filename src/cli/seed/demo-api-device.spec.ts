import { DemoApiClient, DemoApiError, type FetchLike } from './demo-api-client';

function setup(status = 200) {
  const calls: RequestInit[] = [];
  const fetch: FetchLike = (_url, init) => {
    calls.push(init);
    return Promise.resolve(
      new Response(
        JSON.stringify(
          status === 200
            ? { success: true, data: { state: 'ACTIVE' } }
            : {
                success: false,
                error: { code: 'DEVICE.COLLECTION_STOPPED', message: 'fake-device-token must stay private' },
              },
        ),
        { status, headers: { 'content-type': 'application/json' } },
      ),
    );
  };
  return { api: new DemoApiClient('http://api.test/api/v1', { fetch, retries: 0 }), calls };
}

describe('public and device calls of the seed client', () => {
  it('enrolls without an account session or authorization and sends the idempotency key', async () => {
    const { api, calls } = setup();
    await expect(
      api.callPublic(
        'POST',
        '/device-enrollments',
        { code: 'test-code' },
        { 'Idempotency-Key': 'seed-enrollment-test-001' },
      ),
    ).resolves.toEqual({ state: 'ACTIVE' });
    const headers = new Headers(calls[0].headers);
    expect(headers.has('authorization')).toBe(false);
    expect(headers.get('Idempotency-Key')).toBe('seed-enrollment-test-001');
  });
  it('uses the device credential directly and never stores it as an account session', async () => {
    const { api, calls } = setup();
    await api.callAsDevice('fake-device-token', 'GET', '/device-session');
    expect(new Headers(calls[0].headers).get('authorization')).toBe('Bearer fake-device-token');
    expect(api.hasSession('fake-device-token')).toBe(false);
    await api.signOutAll();
    expect(calls).toHaveLength(1);
  });
  it('reports only method, path, status and code when a device is refused', async () => {
    const { api, calls } = setup(403);
    const error: unknown = await api
      .callAsDevice('fake-device-token', 'GET', '/device-session')
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(DemoApiError);
    expect((error as Error).message).toBe('GET /device-session answered 403 DEVICE.COLLECTION_STOPPED');
    expect((error as Error).message).not.toContain('fake-device-token');
    expect(calls).toHaveLength(1);
  });
});
