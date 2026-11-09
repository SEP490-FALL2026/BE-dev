import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectKeyFactory } from './object-key.factory';
import { objectStorageEnvironmentFrom } from './object-storage.config';
import { OBJECT_STORAGE } from './object-storage.port';
import { S3CompatibleObjectStorageAdapter } from './s3-compatible-object-storage.adapter';
import { UploadInspection } from './upload-inspection';

/**
 * S3-compatible storage, validated when the module is mounted (production requires the HTTPS endpoint, the bucket and
 * the credentials). Mounted by the API only, through CatalogModule and BudgetsModule, for the files of contracts
 * (`US-04-04`, ADR-0014) and budget proposals/versions (`QĐ-93j`, US-06-09, US-06-10). RecordSuperAdminEventCliModule
 * loads CatalogModule and BudgetsModule transitively through PersonnelModule -> RequestsModule, but only the API process
 * uses the storage. Mounting it brings the strict validation with it.
 */
@Module({
  providers: [
    ObjectKeyFactory,
    UploadInspection,
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new S3CompatibleObjectStorageAdapter(objectStorageEnvironmentFrom(config)),
    },
  ],
  exports: [OBJECT_STORAGE, ObjectKeyFactory, UploadInspection],
})
export class ObjectStorageModule {}
