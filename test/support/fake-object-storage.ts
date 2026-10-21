import { ObjectStorageUnavailableError } from '../../src/infrastructure/object-storage/object-storage.errors';
import type {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  ObjectStoragePort,
  StoredObjectMetadata,
} from '../../src/infrastructure/object-storage/object-storage.port';

interface StoredObject {
  contentLength: number;
  contentType: string;
  /** The bytes of the object; left out, it begins the way its type says it does. */
  content?: Uint8Array;
}

/** How a file of each type begins, for an object put with no content of its own. */
const GENUINE_START: Record<string, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
};

export type FakeStorageCall = 'head' | 'readPrefix' | 'delete' | 'createUploadUrl' | 'createDownloadUrl';

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
  /** The calls that answer as an outage until they are taken out of the set. */
  readonly unavailable = new Set<FakeStorageCall>();
  /** Moves with the test: the time the storage believes it is. */
  now: () => Date = () => new Date();
  private counter = 0;

  private refuseWhileDown(call: FakeStorageCall): void {
    if (this.unavailable.has(call)) throw new ObjectStorageUnavailableError();
  }

  createUploadUrl(input: CreateUploadUrlInput): Promise<string> {
    this.refuseWhileDown('createUploadUrl');
    const url = `https://storage.example/upload/${input.key}?sig=${(this.counter += 1)}`;
    this.uploadLinks.push({ ...input, url });

    return Promise.resolve(url);
  }

  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string> {
    this.refuseWhileDown('createDownloadUrl');
    const url = `https://storage.example/download/${input.key}?sig=${(this.counter += 1)}`;
    this.downloadLinks.push({ ...input, url, issuedAt: this.now() });

    return Promise.resolve(url);
  }

  head(key: string): Promise<StoredObjectMetadata> {
    this.refuseWhileDown('head');
    const stored = this.objects.get(key);
    if (!stored) return Promise.reject(Object.assign(new Error('NotFound'), { name: 'NotFound' }));

    return Promise.resolve({
      contentLength: stored.contentLength,
      contentType: stored.contentType,
      checksum: undefined,
    });
  }

  readPrefix(key: string, length: number): Promise<Uint8Array> {
    this.refuseWhileDown('readPrefix');
    const stored = this.objects.get(key);
    if (!stored) return Promise.reject(Object.assign(new Error('NotFound'), { name: 'NotFound' }));
    const content = stored.content ?? Uint8Array.from(GENUINE_START[stored.contentType] ?? []);

    return Promise.resolve(content.slice(0, length));
  }

  delete(key: string): Promise<void> {
    this.refuseWhileDown('delete');
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
