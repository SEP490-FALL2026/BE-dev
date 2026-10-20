import type {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  ObjectStoragePort,
  StoredObjectMetadata,
} from '../../src/infrastructure/object-storage/object-storage.port';

interface StoredObject {
  contentLength: number;
  contentType: string;
}

/**
 * The object storage in memory, for the tests that need what a real bucket would say: which links were asked for and
 * how long they live, what an object really is when it is looked at, and that a link past its time opens nothing. It
 * does not prove the real S3 service refuses an expired link; it proves the system asks for a short one.
 */
export class FakeObjectStorage implements ObjectStoragePort {
  readonly objects = new Map<string, StoredObject>();
  readonly uploadLinks: { key: string; contentType: string; expiresInSeconds: number; url: string }[] = [];
  readonly downloadLinks: { key: string; expiresInSeconds: number; url: string; issuedAt: Date }[] = [];
  readonly deleted: string[] = [];
  /** Moves with the test: the time the storage believes it is. */
  now: () => Date = () => new Date();
  private counter = 0;

  createUploadUrl(input: CreateUploadUrlInput): Promise<string> {
    const url = `https://storage.example/upload/${input.key}?sig=${(this.counter += 1)}`;
    this.uploadLinks.push({ ...input, url });

    return Promise.resolve(url);
  }

  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string> {
    const url = `https://storage.example/download/${input.key}?sig=${(this.counter += 1)}`;
    this.downloadLinks.push({ ...input, url, issuedAt: this.now() });

    return Promise.resolve(url);
  }

  head(key: string): Promise<StoredObjectMetadata> {
    const stored = this.objects.get(key);
    if (!stored) return Promise.reject(Object.assign(new Error('NotFound'), { name: 'NotFound' }));

    return Promise.resolve({
      contentLength: stored.contentLength,
      contentType: stored.contentType,
      checksum: undefined,
    });
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    this.deleted.push(key);

    return Promise.resolve();
  }

  /** What the client does after it is given an upload link: puts the file, which may not be what it declared. */
  put(key: string, stored: StoredObject): void {
    this.objects.set(key, stored);
  }

  /** Opens a link at a given time, the way the storage would: a link past its time, or of a deleted object, opens nothing. */
  open(url: string, at: Date = this.now()): StoredObject {
    const link = this.downloadLinks.find((candidate) => candidate.url === url);
    if (!link) throw new Error('Unknown link');
    if (at.getTime() > link.issuedAt.getTime() + link.expiresInSeconds * 1000) throw new Error('The link has expired');
    const stored = this.objects.get(link.key);
    if (!stored) throw new Error('No such object');

    return stored;
  }
}
