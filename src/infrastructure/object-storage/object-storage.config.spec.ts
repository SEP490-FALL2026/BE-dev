import { ConfigService } from '@nestjs/config';
import { EnvironmentValidationError } from '../config/environment-validation';
import {
  OBJECT_STORAGE_ENVIRONMENT_KEYS,
  objectStorageEnvironmentFrom,
  validateObjectStorageEnvironment,
} from './object-storage.config';

/** Made-up values for this spec. */
const PRODUCTION = {
  NODE_ENV: 'production',
  OBJECT_STORAGE_ENDPOINT: 'https://storage.example.com',
  OBJECT_STORAGE_BUCKET: 'storage-spec-bucket',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'storage-spec-access',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'storage-spec-secret',
};

describe('object storage configuration (validated when ObjectStorageModule is mounted — H6.4, E2 = A)', () => {
  it('owns exactly the object storage keys', () => {
    expect([...OBJECT_STORAGE_ENVIRONMENT_KEYS].sort()).toEqual(
      [
        'OBJECT_STORAGE_ACCESS_KEY_ID',
        'OBJECT_STORAGE_BUCKET',
        'OBJECT_STORAGE_ENDPOINT',
        'OBJECT_STORAGE_FORCE_PATH_STYLE',
        'OBJECT_STORAGE_REGION',
        'OBJECT_STORAGE_SECRET_ACCESS_KEY',
      ].sort(),
    );
  });

  it('requires the endpoint, the bucket and the credentials in production, over HTTPS', () => {
    let message = '';
    try {
      validateObjectStorageEnvironment({ NODE_ENV: 'production' });
    } catch (error) {
      message = (error as Error).message;
    }

    for (const key of [
      'OBJECT_STORAGE_ENDPOINT',
      'OBJECT_STORAGE_BUCKET',
      'OBJECT_STORAGE_ACCESS_KEY_ID',
      'OBJECT_STORAGE_SECRET_ACCESS_KEY',
    ]) {
      expect(message).toContain(`"${key}" is required`);
    }
    expect(() =>
      validateObjectStorageEnvironment({ ...PRODUCTION, OBJECT_STORAGE_ENDPOINT: 'http://storage.example.com' }),
    ).toThrow('OBJECT_STORAGE_ENDPOINT must use HTTPS in production');
    expect(() => validateObjectStorageEnvironment(PRODUCTION)).not.toThrow();
  });

  it('defaults to the local MinIO in the test runs only', () => {
    expect(validateObjectStorageEnvironment({ NODE_ENV: 'test' })).toMatchObject({
      OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
      OBJECT_STORAGE_ACCESS_KEY_ID: 'minioadmin',
      OBJECT_STORAGE_FORCE_PATH_STYLE: true,
    });
    expect(() => validateObjectStorageEnvironment({ NODE_ENV: 'development' })).toThrow(
      '"OBJECT_STORAGE_ACCESS_KEY_ID" is required',
    );
  });

  describe('the credentials of a real environment (SEC-04)', () => {
    const own = {
      OBJECT_STORAGE_ACCESS_KEY_ID: 'storage-spec-access',
      OBJECT_STORAGE_SECRET_ACCESS_KEY: 'storage-spec-secret',
    };

    it.each(['development', 'production'])(
      'refuses the public default of MinIO in %s, naming the settings and no value',
      (env) => {
        const base = { ...PRODUCTION, NODE_ENV: env, OBJECT_STORAGE_ENDPOINT: 'https://storage.example.com' };

        for (const bad of [
          { ...own, OBJECT_STORAGE_ACCESS_KEY_ID: 'minioadmin' },
          { ...own, OBJECT_STORAGE_SECRET_ACCESS_KEY: 'minioadmin' },
          { OBJECT_STORAGE_ACCESS_KEY_ID: 'minioadmin', OBJECT_STORAGE_SECRET_ACCESS_KEY: 'minioadmin' },
        ]) {
          const attempt = () => validateObjectStorageEnvironment({ ...base, ...bad });

          expect(attempt).toThrow('public default credentials of the object storage');
          expect(attempt).toThrow('OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY');
          expect(attempt).not.toThrow('minioadmin');
        }
      },
    );

    it('refuses an access key that is the secret key, and takes made-up credentials', () => {
      expect(() =>
        validateObjectStorageEnvironment({
          ...PRODUCTION,
          OBJECT_STORAGE_ACCESS_KEY_ID: 'same-value',
          OBJECT_STORAGE_SECRET_ACCESS_KEY: 'same-value',
        }),
      ).toThrow('OBJECT_STORAGE_SECRET_ACCESS_KEY must differ from OBJECT_STORAGE_ACCESS_KEY_ID');
      expect(() => validateObjectStorageEnvironment({ ...PRODUCTION, ...own })).not.toThrow();
    });
  });

  it('validates again when the module is mounted, so a production remount without credentials fails to boot', () => {
    expect(() => objectStorageEnvironmentFrom(new ConfigService({ NODE_ENV: 'production' }))).toThrow(
      EnvironmentValidationError,
    );
    expect(
      objectStorageEnvironmentFrom(new ConfigService({ ...PRODUCTION, OBJECT_STORAGE_FORCE_PATH_STYLE: 'false' })),
    ).toMatchObject({ OBJECT_STORAGE_BUCKET: 'storage-spec-bucket', OBJECT_STORAGE_FORCE_PATH_STYLE: false });
  });
});
