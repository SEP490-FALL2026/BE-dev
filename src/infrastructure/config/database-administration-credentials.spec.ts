import { EnvironmentValidationError, validateEnvironment } from './env-schema';

/** The API, the worker and the recovery command receive the runtime role only (docker-compose.prod.yml). */
const production = {
  NODE_ENV: 'production',
  CORS_ORIGINS: 'https://licenses.example.com',
  DATABASE_URL: 'postgresql://slm_runtime:runtime-secret@postgres:5432/software_license_management',
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
};
const ADMINISTRATION = {
  POSTGRES_PASSWORD: 'cluster-superuser-secret',
  DATABASE_BOOTSTRAP_URL: 'postgresql://app:cluster-superuser-secret@postgres:5432/software_license_management',
  DATABASE_DEPLOY_URL: 'postgresql://slm_deploy:deploy-secret@postgres:5432/software_license_management',
  DATABASE_DEPLOY_PASSWORD: 'deploy-secret',
};

describe('validateEnvironment refuses database administration credentials in production (H7)', () => {
  it('accepts the runtime configuration', () => {
    expect(validateEnvironment(production).DATABASE_URL).toBe(production.DATABASE_URL);
  });

  it.each(Object.entries(ADMINISTRATION))('refuses %s, naming the variable and never its value', (name, value) => {
    let failure: unknown;
    try {
      validateEnvironment({ ...production, [name]: value });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(EnvironmentValidationError);
    expect((failure as Error).message).toContain(name);
    expect((failure as Error).message).not.toContain(value);
  });

  it('names every administration variable present at once', () => {
    expect(() => validateEnvironment({ ...production, ...ADMINISTRATION })).toThrow(
      'POSTGRES_PASSWORD, DATABASE_BOOTSTRAP_URL, DATABASE_DEPLOY_URL, DATABASE_DEPLOY_PASSWORD',
    );
  });

  it('ignores an empty value, which Compose writes for an unset optional variable', () => {
    expect(() => validateEnvironment({ ...production, POSTGRES_PASSWORD: '' })).not.toThrow();
  });

  it('leaves development and test alone: local Compose and the harness use one owner role on purpose', () => {
    const local = { ...ADMINISTRATION, AUTH_ACCESS_TOKEN_SECRET: production.AUTH_ACCESS_TOKEN_SECRET };

    expect(() => validateEnvironment({ NODE_ENV: 'test', ...local })).not.toThrow();
  });
});
