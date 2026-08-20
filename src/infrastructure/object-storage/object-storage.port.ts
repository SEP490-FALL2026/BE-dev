export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface CreateUploadUrlInput {
  key: string;
  contentType: string;
  expiresInSeconds: number;
}

export interface CreateDownloadUrlInput {
  key: string;
  expiresInSeconds: number;
}

export interface StoredObjectMetadata {
  contentLength: number | undefined;
  contentType: string | undefined;
  checksum: string | undefined;
}

export interface ObjectStoragePort {
  createUploadUrl(input: CreateUploadUrlInput): Promise<string>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>;
  head(key: string): Promise<StoredObjectMetadata>;
  delete(key: string): Promise<void>;
}
