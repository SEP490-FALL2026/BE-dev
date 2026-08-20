import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env-schema';
import {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  ObjectStoragePort,
  StoredObjectMetadata,
} from './object-storage.port';

@Injectable()
export class S3CompatibleObjectStorageAdapter implements ObjectStoragePort {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.bucket = config.get('OBJECT_STORAGE_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('OBJECT_STORAGE_ENDPOINT', { infer: true }),
      region: config.get('OBJECT_STORAGE_REGION', { infer: true }),
      forcePathStyle: config.get('OBJECT_STORAGE_FORCE_PATH_STYLE', {
        infer: true,
      }),
      credentials: {
        accessKeyId: config.get('OBJECT_STORAGE_ACCESS_KEY_ID', {
          infer: true,
        }),
        secretAccessKey: config.get('OBJECT_STORAGE_SECRET_ACCESS_KEY', {
          infer: true,
        }),
      },
    });
  }

  createUploadUrl(input: CreateUploadUrlInput): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentType: input.contentType,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: input.key }), {
      expiresIn: input.expiresInSeconds,
    });
  }

  async head(key: string): Promise<StoredObjectMetadata> {
    const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));

    return {
      contentLength: result.ContentLength,
      contentType: result.ContentType,
      checksum: result.ChecksumSHA256,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
