import { seedSecretsProblem } from './seed-secrets';
import { INSTALLATION } from './fixture/shared-demo-v2/installation';
import { PassThrough } from 'node:stream';
import { DemoSecretsError, parseDemoSecrets, readDemoSecrets } from './seed-secrets';

const record = (text: string) => Buffer.from(text, 'utf8');
const SA = 'a super admin passphrase';
const DEMO = 'the demo account password';

describe('ops:seed secrets record', () => {
  it('reads the two named passwords, as written (spaces kept), in any order', () => {
    expect(parseDemoSecrets(record(`DEMO_ACCOUNT_PASSWORD= ${DEMO} \nSUPER_ADMIN_PASSWORD=${SA}\n`))).toEqual({
      superAdminPassword: SA,
      demoAccountPassword: ` ${DEMO} `,
    });
  });

  it('keeps a value that holds an equals sign', () => {
    expect(
      parseDemoSecrets(record(`SUPER_ADMIN_PASSWORD=a=b=c-long-enough\nDEMO_ACCOUNT_PASSWORD=${DEMO}\n`)),
    ).toMatchObject({
      superAdminPassword: 'a=b=c-long-enough',
    });
  });

  it.each([
    ['no final line feed', `SUPER_ADMIN_PASSWORD=${SA}\nDEMO_ACCOUNT_PASSWORD=${DEMO}`, 'line feed'],
    ['a CRLF line ending', `SUPER_ADMIN_PASSWORD=${SA}\r\nDEMO_ACCOUNT_PASSWORD=${DEMO}\r\n`, 'carriage return'],
    ['an unknown name', `PASSWORD=${SA}\nDEMO_ACCOUNT_PASSWORD=${DEMO}\n`, 'Each line must be'],
    ['a name twice', `SUPER_ADMIN_PASSWORD=${SA}\nSUPER_ADMIN_PASSWORD=${SA}\n`, 'given twice'],
    ['an empty value', `SUPER_ADMIN_PASSWORD=\nDEMO_ACCOUNT_PASSWORD=${DEMO}\n`, 'empty'],
    ['a control character', `SUPER_ADMIN_PASSWORD=a\tb\nDEMO_ACCOUNT_PASSWORD=${DEMO}\n`, 'control character'],
    ['one password only', `SUPER_ADMIN_PASSWORD=${SA}\n`, 'Both'],
  ])('refuses %s and never repeats a value', (_case, text, message) => {
    let error: unknown;
    try {
      parseDemoSecrets(record(text));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DemoSecretsError);
    expect((error as Error).message).toContain(message);
    expect((error as Error).message).not.toContain(SA);
    expect((error as Error).message).not.toContain(DEMO);
  });

  it('reads the record from a pipe to its end', async () => {
    const input = new PassThrough();
    const read = readDemoSecrets(input);
    input.end(`SUPER_ADMIN_PASSWORD=${SA}\nDEMO_ACCOUNT_PASSWORD=${DEMO}\n`);
    await expect(read).resolves.toEqual({ superAdminPassword: SA, demoAccountPassword: DEMO });
  });

  it('refuses a terminal, a record over the bound, and a writer that never ends', async () => {
    const terminal = Object.assign(new PassThrough(), { isTTY: true });
    await expect(readDemoSecrets(terminal)).rejects.toThrow('terminal');

    const long = new PassThrough();
    const tooLong = readDemoSecrets(long, { maxBytes: 16 });
    long.end(`SUPER_ADMIN_PASSWORD=${SA}\n`);
    await expect(tooLong).rejects.toThrow('too long');

    const silent = new PassThrough();
    await expect(readDemoSecrets(silent, { timeoutMs: 20 })).rejects.toThrow('Timed out');
    silent.destroy();
  });
});

describe('seed password preflight', () => {
  const good = { superAdminPassword: 'long enough test password', demoAccountPassword: 'long demo test password' };
  it('checks both passwords without hashing or database work', () => {
    expect(seedSecretsProblem(good)).toBeNull();
    expect(seedSecretsProblem({ ...good, superAdminPassword: 'short' })).toBe('TOO_SHORT');
    expect(seedSecretsProblem({ ...good, superAdminPassword: 'x'.repeat(129) })).toBe('TOO_LONG');
    expect(seedSecretsProblem({ ...good, superAdminPassword: INSTALLATION.loginEmail })).toBe('EQUALS_LOGIN_EMAIL');
    // A chosen Super Admin email is the one the password must differ from.
    expect(seedSecretsProblem({ ...good, superAdminPassword: 'owner@example.com' }, 'owner@example.com')).toBe(
      'EQUALS_LOGIN_EMAIL',
    );
    expect(
      seedSecretsProblem({ ...good, superAdminPassword: INSTALLATION.loginEmail }, 'owner@example.com'),
    ).toBeNull();
    expect(seedSecretsProblem({ ...good, demoAccountPassword: 'short' })).toBe('DEMO_LENGTH');
  });
});
