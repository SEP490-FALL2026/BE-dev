import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectKeyFactory } from './object-key.factory';
import { objectStorageEnvironmentFrom } from './object-storage.config';
import { OBJECT_STORAGE } from './object-storage.port';
import { S3CompatibleObjectStorageAdapter } from './s3-compatible-object-storage.adapter';

/**
 * S3-compatible storage, validated when the module is mounted (production requires the HTTPS endpoint, the bucket and
 * the credentials). Mounted by the API only, through the catalog, for the files of contracts (`US-04-04`, ADR-0014);
 * the worker and the commands do not mount it. Mounting it brings the strict validation with it.
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
