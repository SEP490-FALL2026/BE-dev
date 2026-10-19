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

  it('defaults to the local MinIO outside production', () => {
    expect(validateObjectStorageEnvironment({ NODE_ENV: 'development' })).toMatchObject({
      OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
      OBJECT_STORAGE_FORCE_PATH_STYLE: true,
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
