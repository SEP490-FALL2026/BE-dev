import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { provisionDisposableDatabase } from '../support/disposable-database';
import { createRoleSeparatedDatabase } from '../support/role-separated-database';

/**
 * H7-VRF-01: the integration harness takes its test-admin database URLs from the process environment only. A local
 * `.env` that names them (here a hostile one in a scratch working directory; the repository's own `.env` is never read)
 * is not loaded by the application under test and so never reaches the harness: without the variables the harness
 * refuses with its own message instead of connecting anywhere.
 */
describe('the integration harness fails closed without its own test configuration (H7-VRF-01)', () => {
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  let scratch: string;

  beforeAll(async () => {
    scratch = mkdtempSync(join(tmpdir(), 'slm-hostile-env-'));
    writeFileSync(
      join(scratch, '.env'),
      [
        'TEST_DATABASE_ADMIN_URL=postgresql://hostile:hostile@hostile.invalid:5432/postgres',
        'TEST_DATABASE_BOOTSTRAP_URL=postgresql://hostile:hostile@hostile.invalid:5432/postgres',
        'SMTP_USER=hostile-user',
        'SMTP_PASSWORD=hostile-password',
      ].join('\n'),
    );
    delete process.env.TEST_DATABASE_ADMIN_URL;
    delete process.env.TEST_DATABASE_BOOTSTRAP_URL;
    process.chdir(scratch);
    // The application graph loads its configuration exactly as an HTTP suite does before the harness runs again.
    const { ConfigurationModule } = await import('../../src/infrastructure/config/configuration.module');
    const moduleRef = await Test.createTestingModule({ imports: [ConfigurationModule] }).compile();
    await moduleRef.close();
  });

  afterAll(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    rmSync(scratch, { recursive: true, force: true });
  });

  it('leaves the test-admin URLs out of process.env', () => {
    expect([process.env.TEST_DATABASE_ADMIN_URL, process.env.TEST_DATABASE_BOOTSTRAP_URL]).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('refuses to provision a disposable database without TEST_DATABASE_ADMIN_URL', async () => {
    await expect(provisionDisposableDatabase()).rejects.toThrow('Set TEST_DATABASE_ADMIN_URL');
  });

  it('refuses to create a role-separated database without TEST_DATABASE_BOOTSTRAP_URL', async () => {
    await expect(createRoleSeparatedDatabase()).rejects.toThrow('Set TEST_DATABASE_BOOTSTRAP_URL');
  });
});
