import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_DATABASE_URL, resolveDatabaseUrl } from './database-url';
import { validateEnvironment, validateInstallationEnvironment } from './env-schema';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('one database URL rule for the application and the Prisma CLI (A4-07)', () => {
  it('is the rule both validators apply', () => {
    expect(resolveDatabaseUrl('test', LOCAL_DATABASE_URL, '')).toBe(
      validateInstallationEnvironment({ NODE_ENV: 'test' }).DATABASE_URL,
    );
    expect(resolveDatabaseUrl('test', LOCAL_DATABASE_URL, '')).toBe(
      validateEnvironment({ NODE_ENV: 'test' }).DATABASE_URL,
    );
  });

  it('is imported by prisma.config.ts, which keeps no copy of its own', () => {
    const prismaConfig = read('prisma.config.ts');

    expect(prismaConfig).toContain("from './src/infrastructure/config/database-url'");
    expect(prismaConfig).not.toMatch(/function\s+resolveDatabaseUrl/);
    expect(prismaConfig).not.toContain('postgresql://');
  });

  it('imports nothing, so the runtime image can run the Prisma CLI with this one file copied next to its config', () => {
    expect(read('src/infrastructure/config/database-url.ts')).not.toMatch(/^\s*import\b/m);
    expect(read('Dockerfile')).toContain(
      'COPY --chown=node:node src/infrastructure/config/database-url.ts ./src/infrastructure/config/database-url.ts',
    );
  });
});
