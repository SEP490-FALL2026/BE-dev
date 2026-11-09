import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

/**
 * A test run reads no `.env` file. A developer's ignored `.env` (here a hostile one, written to a scratch
 * directory used as the working directory — the repository's own `.env` is never read) must not change the configuration
 * of the application under test, must not be copied into `process.env` where the harness would pick it up, and must not
 * change the database the Prisma CLI of the harness migrates. Development keeps reading `.env`.
 */
const HOSTILE = {
  SMTP_HOST: 'smtp.hostile.invalid',
  SMTP_PORT: '2525',
  SMTP_USER: 'hostile-user',
  SMTP_PASSWORD: 'hostile-password',
  SMTP_TLS: 'true',
  SMTP_FROM: 'hostile@hostile.invalid',
  DATABASE_URL: 'postgresql://hostile:hostile@hostile.invalid:5432/hostile',
  TEST_DATABASE_ADMIN_URL: 'postgresql://hostile:hostile@hostile.invalid:5432/postgres',
  TEST_DATABASE_BOOTSTRAP_URL: 'postgresql://hostile:hostile@hostile.invalid:5432/postgres',
};
const KEYS = Object.keys(HOSTILE);

describe('the test environment reads no .env file (H7-VRF-01)', () => {
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'slm-hostile-env-'));
    writeFileSync(
      join(scratch, '.env'),
      Object.entries(HOSTILE)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    );
    for (const key of KEYS) delete process.env[key];
    process.chdir(scratch);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    rmSync(scratch, { recursive: true, force: true });
  });

  /** Loads a configuration module in a fresh module registry, as each Jest test file does, and reads it back. */
  async function configurationOf(path: string, exportName: string): Promise<ConfigService> {
    let module: unknown;
    let token: unknown;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      module = (require(path) as Record<string, unknown>)[exportName];
      // The ConfigService class of the same registry: the one imported above is another copy.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      token = (require('@nestjs/config') as { ConfigService: unknown }).ConfigService;
    });
    const moduleRef = await Test.createTestingModule({ imports: [module as never] }).compile();
    const config = moduleRef.get<ConfigService>(token as typeof ConfigService);
    await moduleRef.close();
    return config;
  }

  it('keeps the application settings of a test run free of a local .env', async () => {
    process.env.NODE_ENV = 'test';
    const config = await configurationOf('./configuration.module', 'ConfigurationModule');

    expect({
      SMTP_HOST: config.get<string>('SMTP_HOST'),
      SMTP_PORT: config.get<number>('SMTP_PORT'),
      SMTP_USER: config.get<string>('SMTP_USER'),
      SMTP_PASSWORD: config.get<string>('SMTP_PASSWORD'),
      SMTP_TLS: config.get<boolean>('SMTP_TLS'),
    }).toEqual({ SMTP_HOST: 'localhost', SMTP_PORT: 1025, SMTP_USER: '', SMTP_PASSWORD: '', SMTP_TLS: false });
    // Nothing of the file reaches process.env, where the harness reads its test-admin URLs.
    expect(KEYS.filter((key) => Object.values(HOSTILE).includes(process.env[key] ?? ''))).toEqual([]);
  });

  it('keeps the database settings of the commands under test free of a local .env', async () => {
    process.env.NODE_ENV = 'test';
    const config = await configurationOf('./installation-configuration.module', 'InstallationConfigurationModule');

    expect(config.get<string>('DATABASE_URL')).not.toContain('hostile');
    expect(process.env.TEST_DATABASE_ADMIN_URL).toBeUndefined();
  });

  it('keeps the Prisma CLI of a test run (prisma.config.ts) free of a local .env', () => {
    process.env.NODE_ENV = 'test';
    let url: string | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      url = (require('../../../prisma.config') as { default: { datasource: { url: string } } }).default.datasource.url;
    });

    expect(url).not.toContain('hostile');
    expect(process.env.DATABASE_URL).toBeUndefined();
  });

  it('keeps dotenv/config semantics outside a test run: DOTENV_CONFIG_PATH is honoured, so production fails closed', () => {
    // The harness blocks the developer's `.env` this way when it runs a production Prisma CLI without DATABASE_URL.
    process.env.NODE_ENV = 'production';
    process.env.DOTENV_CONFIG_PATH = join(scratch, 'no-such-env-file');
    let failure: unknown;
    jest.isolateModules(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../../prisma.config');
      } catch (error) {
        failure = error;
      }
    });

    expect(String(failure)).toContain('DATABASE_URL');
    expect(process.env.DATABASE_URL).toBeUndefined();
  });

  it('still reads .env in development, where it is the developer’s own configuration', async () => {
    process.env.NODE_ENV = 'development';
    Object.assign(process.env, {
      AUTH_ACCESS_TOKEN_SECRET: 'isolation-spec-access-token-secret-0123456789',
      AUTH_THROTTLE_PEPPER: 'isolation-spec-pepper-0123',
      OUTBOX_PAYLOAD_KEY: Buffer.alloc(32, 3).toString('base64'),
      OUTBOX_PAYLOAD_KEY_ID: 'isolation-1',
      LICENSE_KEY_VAULT_KEY: Buffer.alloc(32, 4).toString('base64'),
      LICENSE_KEY_VAULT_KEY_ID: 'isolation-vault-1',
      LICENSE_KEY_FINGERPRINT_PEPPER: 'isolation-spec-fingerprint-pepper',
    });
    const config = await configurationOf('./configuration.module', 'ConfigurationModule');

    expect(config.get<string>('SMTP_HOST')).toBe(HOSTILE.SMTP_HOST);
  });
});
