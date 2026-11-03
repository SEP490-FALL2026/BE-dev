import { Inject, Injectable } from '@nestjs/common';
import { ObjectKeyFactory } from './object-key.factory';
import { ObjectStorageUnavailableError } from './object-storage.errors';
import { OBJECT_STORAGE, type ObjectStoragePort, type StoredObjectMetadata } from './object-storage.port';
import { isObjectChanged, isObjectMissing } from './stored-object';

export interface UploadInspectionInput {
  pendingKey: string;
  declared: { contentType: string; sizeBytes: number };
  accepts: (prefix: Buffer, options: { truncated: boolean }) => boolean;
  finalScope: string;
}

export type UploadInspectionResult =
  { outcome: 'MISSING' } | { outcome: 'MISMATCH' } | { outcome: 'KEPT'; finalObjectKey: string };

@Injectable()
export class UploadInspection {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    private readonly keys: ObjectKeyFactory,
  ) {}

  async inspect(input: UploadInspectionInput): Promise<UploadInspectionResult> {
    const metadata = await this.readMetadata(input.pendingKey);
    if (!metadata || !metadata.etag) return { outcome: 'MISSING' };

    if (!this.matchesDeclared(metadata, input.declared)) {
      await this.discard(input.pendingKey);
      return { outcome: 'MISMATCH' };
    }

    const accepted = await this.verifyPrefix(input, metadata.etag);
    if (!accepted) {
      await this.discard(input.pendingKey);
      return { outcome: 'MISMATCH' };
    }

    const finalObjectKey = await this.copyToFinal(input, metadata.etag);
    if (!finalObjectKey) {
      await this.discard(input.pendingKey);
      return { outcome: 'MISMATCH' };
    }

    return { outcome: 'KEPT', finalObjectKey };
  }

  private async readMetadata(key: string): Promise<StoredObjectMetadata | null> {
    try {
      return await this.storage.head(key);
    } catch (error) {
      if (isObjectMissing(error)) return null;
      throw error;
    }
  }

  private matchesDeclared(
    metadata: StoredObjectMetadata,
    declared: { contentType: string; sizeBytes: number },
  ): boolean {
    return metadata.contentLength === declared.sizeBytes && metadata.contentType === declared.contentType;
  }

  private async verifyPrefix(input: UploadInspectionInput, etag: string): Promise<boolean> {
    try {
      const prefixBytes = await this.storage.readPrefix(input.pendingKey, 512, etag);
      const prefix = Buffer.from(prefixBytes);
      const truncated = input.declared.sizeBytes > prefix.length;
      return input.accepts(prefix, { truncated });
    } catch (error) {
      if (isObjectMissing(error) || isObjectChanged(error)) return false;
      throw error;
    }
  }

  private async copyToFinal(input: UploadInspectionInput, etag: string): Promise<string | null> {
    const finalObjectKey = this.keys.create(input.finalScope);
    try {
      await this.storage.copyIfMatch(input.pendingKey, finalObjectKey, etag);
      return finalObjectKey;
    } catch (error) {
      if (isObjectMissing(error) || isObjectChanged(error)) return null;
      throw error;
    }
  }

  async discard(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      if (!(error instanceof ObjectStorageUnavailableError) && !isObjectMissing(error)) {
        throw error;
      }
    }
  }
}
