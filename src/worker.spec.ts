import { NestFactory } from '@nestjs/core';

jest.mock('@nestjs/core', () => ({
  ...jest.requireActual<Record<string, unknown>>('@nestjs/core'),
  NestFactory: { createApplicationContext: jest.fn() },
}));

/**
 * Hotfix regression: in production the worker restarted in a loop with `"TEST_DATABASE_URL" is not allowed`.
 * Importing `WorkerModule` runs `ConfigModule.forRoot({ validate })`, and Nest copies every validated key the process
 * lacks back into `process.env`, including the `TEST_DATABASE_URL: ''` default. A second whole-schema validation of
 * `process.env` in `bootstrapWorker` then saw `''` outside the test environment and refused it. CI runs with
 * NODE_ENV=test, where the key is allowed, so no other suite could notice.
 */
describe('worker bootstrap in production (second read of the Nest-written process.env)', () => {
  const productionEnvironment: Record<string, string> = {
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://licenses.example.com',
    DATABASE_URL: 'postgresql://app:secret@database:5432/app',
    OBJECT_STORAGE_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
    OBJECT_STORAGE_BUCKET: 'software-license-files',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'test-access-key',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
    REDIS_HOST: 'redis.internal',
    REDIS_PASSWORD: 'redis-secret-password',
    AUTH_ACCESS_TOKEN_SECRET: 'production-access-token-secret-with-enough-entropy',
    AUTH_THROTTLE_PEPPER: 'production-throttle-pepper',
    APP_PUBLIC_URL: 'https://licenses.example.com',
    OUTBOX_PAYLOAD_KEY: Buffer.alloc(32, 7).toString('base64'),
    OUTBOX_PAYLOAD_KEY_ID: 'prod-1',
    LICENSE_KEY_VAULT_KEY: Buffer.alloc(32, 8).toString('base64'),
    LICENSE_KEY_VAULT_KEY_ID: 'prod-vault-1',
    LICENSE_KEY_FINGERPRINT_PEPPER: 'production-fingerprint-pepper-0123',
    SMTP_HOST: 'smtp.example.com',
    SMTP_FROM: 'no-reply@licenses.example.com',
    SMTP_TLS: 'true',
    TRUST_PROXY_HOPS: '1',
  };

  const originalEnvironment = { ...process.env };
  const { createApplicationContext } = NestFactory as unknown as {
    createApplicationContext: jest.Mock<Promise<unknown>, [unknown, unknown]>;
  };
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, productionEnvironment);
    createApplicationContext.mockReset();
    createApplicationContext.mockResolvedValue({
      useLogger: jest.fn(),
      get: jest.fn(),
      enableShutdownHooks: jest.fn(),
    });
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
    process.exitCode = undefined;
  });

  it('starts the BullMQ worker instead of refusing the TEST_DATABASE_URL that Nest wrote', async () => {
    await jest.isolateModulesAsync(async () => {
      await import('./worker');
      await new Promise((resolve) => setImmediate(resolve));
    });

    // The state the production process was in when it failed: Nest had written the empty default back.
    expect(process.env.TEST_DATABASE_URL).toBe('');
    expect(consoleError).not.toHaveBeenCalled();
    expect(createApplicationContext).toHaveBeenCalledTimes(1);
    expect(createApplicationContext.mock.calls[0]?.[0]).toMatchObject({ module: expect.any(Function) as unknown });
    expect(process.exitCode).toBeUndefined();
  });
});
