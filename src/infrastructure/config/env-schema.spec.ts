import { validateEnvironment } from './env-schema';

describe('validateEnvironment', () => {
  const productionInfrastructure = {
    CORS_ORIGINS: 'https://licenses.example.com',
    DATABASE_URL: 'postgresql://app:secret@database:5432/app',
    OBJECT_STORAGE_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
    OBJECT_STORAGE_BUCKET: 'software-license-files',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'test-access-key',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
    REDIS_HOST: 'redis.internal',
    OIDC_ISSUER: 'https://identity.example.com/realms/internal',
    OIDC_AUDIENCE: 'software-license-api',
    OIDC_JWKS_URI: 'https://identity.example.com/realms/internal/protocol/openid-connect/certs',
  };

  it('applies safe development defaults', () => {
    const config = validateEnvironment({});

    expect(config).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      API_PREFIX: 'api',
      SWAGGER_ENABLED: true,
    });
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnvironment({ PORT: 'not-a-port' })).toThrow('Environment validation failed');
  });

  it('disables Swagger by default in production', () => {
    const config = validateEnvironment({ NODE_ENV: 'production', ...productionInfrastructure });
    expect(config.SWAGGER_ENABLED).toBe(false);
  });

  it('requires the database URL in production', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow('DATABASE_URL');
  });

  it('requires object-storage credentials in production', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', DATABASE_URL: productionInfrastructure.DATABASE_URL }),
    ).toThrow('OBJECT_STORAGE');
  });

  it('requires the Redis host in production', () => {
    const { REDIS_HOST: redisHost, ...withoutRedis } = productionInfrastructure;
    void redisHost;
    expect(() => validateEnvironment({ NODE_ENV: 'production', ...withoutRedis })).toThrow('REDIS_HOST');
  });

  it('requires OIDC verification metadata in production', () => {
    const { OIDC_ISSUER: issuer, ...withoutIssuer } = productionInfrastructure;
    void issuer;
    expect(() => validateEnvironment({ NODE_ENV: 'production', ...withoutIssuer })).toThrow('OIDC_ISSUER');
  });

  it.each([
    '',
    '*',
    'http://licenses.example.com',
    'https://licenses.example.com/path',
    'https://user@licenses.example.com',
  ])('rejects unsafe production CORS origins: %s', (corsOrigins) => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', ...productionInfrastructure, CORS_ORIGINS: corsOrigins }),
    ).toThrow('CORS_ORIGINS');
  });

  it('requires HTTPS OIDC metadata in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        ...productionInfrastructure,
        OIDC_ISSUER: 'http://identity.example.com/realms/internal',
      }),
    ).toThrow('OIDC_ISSUER');
  });
});
