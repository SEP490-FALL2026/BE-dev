import { Module } from '@nestjs/common';
import { ObjectKeyFactory } from './object-key.factory';
import { OBJECT_STORAGE } from './object-storage.port';
import { S3CompatibleObjectStorageAdapter } from './s3-compatible-object-storage.adapter';

@Module({
  providers: [
    ObjectKeyFactory,
    {
      provide: OBJECT_STORAGE,
      useClass: S3CompatibleObjectStorageAdapter,
    },
  ],
  exports: [OBJECT_STORAGE, ObjectKeyFactory],
})
export class ObjectStorageModule {}
