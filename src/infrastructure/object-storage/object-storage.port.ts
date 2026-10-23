export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface CreateUploadUrlInput {
  key: string;
  /** Signed into the link: a request with another type is refused by the storage. */
  contentType: string;
  /** Signed into the link: a request of another size is refused by the storage. */
  contentLength: number;
  expiresInSeconds: number;
}

export interface CreateDownloadUrlInput {
  key: string;
  /** The name the file is saved under: the link makes the browser download it, never render it. */
  fileName: string;
  /** The type the file was declared with, answered whatever the object says of itself. */
  contentType: string;
  expiresInSeconds: number;
}

export interface StoredObjectMetadata {
  contentLength: number | undefined;
  contentType: string | undefined;
  checksum: string | undefined;
  /** Names this exact content: it changes when the object is put again. */
  etag: string | undefined;
}

export interface ObjectStoragePort {
  createUploadUrl(input: CreateUploadUrlInput): Promise<string>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>;
  head(key: string): Promise<StoredObjectMetadata>;
  /** The first `length` bytes of the object, to tell what it really is. A missing object is a `NotFound` error. */
  readPrefix(key: string, length: number, ifMatchEtag?: string): Promise<Uint8Array>;
  /**
   * Copies the object to another key only if it still has the content that was looked at. An object put again in the
   * meantime is a `PreconditionFailed` error, never a copy of what nobody looked at.
   */
  copyIfMatch(fromKey: string, toKey: string, etag: string): Promise<void>;
  delete(key: string): Promise<void>;
}
