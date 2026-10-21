import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { OnModuleDestroy } from '@nestjs/common';
import type { ObjectStorageEnvironmentVariables } from './object-storage.config';
import { ObjectStorageUnavailableError } from './object-storage.errors';
import {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  ObjectStoragePort,
  StoredObjectMetadata,
} from './object-storage.port';

/** Built by ObjectStorageModule from settings it has already validated. */
export class S3CompatibleObjectStorageAdapter implements ObjectStoragePort, OnModuleDestroy {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(settings: ObjectStorageEnvironmentVariables) {
    this.bucket = settings.OBJECT_STORAGE_BUCKET;
    this.client = new S3Client({
      endpoint: settings.OBJECT_STORAGE_ENDPOINT,
      region: settings.OBJECT_STORAGE_REGION,
      forcePathStyle: settings.OBJECT_STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: settings.OBJECT_STORAGE_ACCESS_KEY_ID,
        secretAccessKey: settings.OBJECT_STORAGE_SECRET_ACCESS_KEY,
      },
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  createUploadUrl(input: CreateUploadUrlInput): Promise<string> {
    return this.guarded(() =>
      getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          ContentType: input.contentType,
        }),
        { expiresIn: input.expiresInSeconds },
      ),
    );
  }

  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string> {
    return this.guarded(() =>
      getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: input.key }), {
        expiresIn: input.expiresInSeconds,
      }),
    );
  }

  async head(key: string): Promise<StoredObjectMetadata> {
    const result = await this.guarded(() => this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })));

    return {
      contentLength: result.ContentLength,
      contentType: result.ContentType,
      checksum: result.ChecksumSHA256,
    };
  }

  async readPrefix(key: string, length: number): Promise<Uint8Array> {
    const result = await this.guarded(() =>
      this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${length - 1}` })),
    );

    return this.guarded(async () => (result.Body ? await result.Body.transformToByteArray() : new Uint8Array()));
  }

  async delete(key: string): Promise<void> {
    await this.guarded(() => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })));
  }

  /**
   * An answer of "there is no such object" passes through unchanged for the caller to read; anything else that goes wrong
   * with the storage (the network, a timeout, a refusal of the service) is an outage the caller cannot fix.
   */
  private async guarded<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (isNoSuchObject(error)) throw error;
      throw new ObjectStorageUnavailableError({ cause: error });
    }
  }
}

function isNoSuchObject(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;

  return name === 'NotFound' || name === 'NoSuchKey' || status === 404;
}
