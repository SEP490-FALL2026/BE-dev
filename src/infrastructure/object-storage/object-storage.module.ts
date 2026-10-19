import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectKeyFactory } from './object-key.factory';
import { objectStorageEnvironmentFrom } from './object-storage.config';
import { OBJECT_STORAGE } from './object-storage.port';
import { S3CompatibleObjectStorageAdapter } from './s3-compatible-object-storage.adapter';

/**
 * S3-compatible storage, validated when the module is mounted (production requires the HTTPS endpoint, the bucket and
 * the credentials). Not mounted by the API or the worker while no Story stores files (E2 = A, H6.4); a G7/G9 slice that
 * stores files mounts it and gets the strict validation back with it.
 */
@Module({
  providers: [
    ObjectKeyFactory,
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new S3CompatibleObjectStorageAdapter(objectStorageEnvironmentFrom(config)),
    },
  ],
  exports: [OBJECT_STORAGE, ObjectKeyFactory],
})
export class ObjectStorageModule {}
