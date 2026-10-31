import { DEMO_PEOPLE, DEMO_ROLES } from './dev-seed-fixture.types';
import { checkLocalSeedGuards } from './local-seed.policy';
import { generateLocalPassword } from './local-password.service';

const LOCAL = 'postgresql://app:app@localhost:5432/software_license_management';

describe('checkLocalSeedGuards (rule 2: three independent guards)', () => {
  it.each(['development', 'test'])('lets NODE_ENV=%s, a loopback database and the confirmation through', (nodeEnv) => {
    expect(checkLocalSeedGuards({ nodeEnv, databaseUrl: LOCAL, confirmLocal: true })).toBeNull();
  });

  it.each(['production', 'staging', 'Development', '', undefined])('refuses NODE_ENV=%s', (nodeEnv) => {
    expect(checkLocalSeedGuards({ nodeEnv, databaseUrl: LOCAL, confirmLocal: true })).toBe('ENVIRONMENT_NOT_LOCAL');
  });

  it.each([
    'postgresql://app:app@postgres:5432/db',
    'postgresql://app:app@localhost.example.com/db',
    'postgresql://app:app@10.0.0.5/db',
    'postgresql://app:app@localhost/db?host=db.example.com',
  ])('refuses the database %s', (databaseUrl) => {
    expect(checkLocalSeedGuards({ nodeEnv: 'development', databaseUrl, confirmLocal: true })).toBe(
      'DATABASE_NOT_LOOPBACK',
    );
  });

  it('refuses a database URL it cannot parse', () => {
    expect(checkLocalSeedGuards({ nodeEnv: 'development', databaseUrl: 'not a url', confirmLocal: true })).toBe(
      'DATABASE_URL_INVALID',
    );
  });

  it('refuses without the confirmation, even when the other two pass', () => {
    expect(checkLocalSeedGuards({ nodeEnv: 'development', databaseUrl: LOCAL, confirmLocal: false })).toBe(
      'CONFIRMATION_MISSING',
    );
  });

  it('checks the environment first, then the database, then the confirmation', () => {
    expect(
      checkLocalSeedGuards({
        nodeEnv: 'production',
        databaseUrl: 'postgresql://x@db.example.com/x',
        confirmLocal: false,
      }),
    ).toBe('ENVIRONMENT_NOT_LOCAL');
    expect(
      checkLocalSeedGuards({ nodeEnv: 'test', databaseUrl: 'postgresql://x@db.example.com/x', confirmLocal: false }),
    ).toBe('DATABASE_NOT_LOOPBACK');
  });
});

describe('generateLocalPassword (rule 5)', () => {
  it('returns a fresh 24-character value each time, long enough for the password policy (12–128)', () => {
    const values = new Set(Array.from({ length: 50 }, () => generateLocalPassword()));

    expect(values.size).toBe(50);
    for (const value of values) expect(value).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });
});

describe('the demo fixture (rule 6)', () => {
  it('holds only direct roles, one per person, on a reserved test domain', () => {
    expect(DEMO_ROLES).toEqual(['IT_ADMIN', 'FINANCE', 'EMPLOYEE']);
    expect(DEMO_PEOPLE.map((person) => person.role)).toEqual(['IT_ADMIN', 'FINANCE', 'EMPLOYEE']);
    for (const person of DEMO_PEOPLE) {
      expect(person.workEmail).toMatch(/@demo\.slm\.test$/);
      expect(['MANAGER', 'SPENDING_APPROVER', 'SUPER_ADMIN']).not.toContain(person.role);
    }
  });

  it('uses stable codes and emails, each once', () => {
    expect(DEMO_PEOPLE.map((person) => person.employeeCode)).toEqual(['DEMO-IT', 'DEMO-FIN', 'DEMO-EMP']);
    expect(new Set(DEMO_PEOPLE.map((person) => person.workEmail)).size).toBe(DEMO_PEOPLE.length);
  });
});
