import { ObjectStorageUnavailableError } from '../../src/infrastructure/object-storage/object-storage.errors';
import type {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  ObjectStoragePort,
  StoredObjectMetadata,
} from '../../src/infrastructure/object-storage/object-storage.port';

interface StoredObject {
  /** Names this exact content: a new one every time the object is put. */
  etag?: string;
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
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [0x50, 0x4b, 0x03, 0x04],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4b, 0x03, 0x04],
  'text/csv': [0x61, 0x2c, 0x62, 0x0a],
};

export type FakeStorageCall =
  'head' | 'readPrefix' | 'copyIfMatch' | 'delete' | 'createUploadUrl' | 'createDownloadUrl';

/**
 * The object storage in memory, for the tests that need what a real bucket would say: which links were asked for and
 * how long they live, what an object really is when it is looked at, and that a link past its time opens nothing. It
 * does not prove the real S3 service refuses an expired link; it proves the system asks for a short one.
 */
export class FakeObjectStorage implements ObjectStoragePort {
  readonly objects = new Map<string, StoredObject>();
  readonly uploadLinks: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
    url: string;
  }[] = [];
  readonly downloadLinks: {
    key: string;
    fileName: string;
    contentType: string;
    expiresInSeconds: number;
    url: string;
    issuedAt: Date;
  }[] = [];
  readonly copied: { from: string; to: string }[] = [];
  /** Runs after the object was looked at and before it is copied: a client that puts the file again in that moment. */
  beforeCopy: ((fromKey: string) => void) | undefined;
  /**
   * Awaited at the start of `head`, `readPrefix`, `copyIfMatch` and `delete`, before anything is read or changed: a test
   * holds one call there until another request has done its part, an order instead of a sleep (P29-N5).
   */
  beforeCall: ((call: FakeStorageCall, key: string) => Promise<void> | void) | undefined;
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

  async head(key: string): Promise<StoredObjectMetadata> {
    this.refuseWhileDown('head');
    await this.beforeCall?.('head', key);
    const stored = this.objects.get(key);
    if (!stored) throw Object.assign(new Error('NotFound'), { name: 'NotFound' });

    return {
      contentLength: stored.contentLength,
      contentType: stored.contentType,
      checksum: undefined,
      etag: stored.etag,
    };
  }

  async readPrefix(key: string, length: number, ifMatchEtag?: string): Promise<Uint8Array> {
    this.refuseWhileDown('readPrefix');
    await this.beforeCall?.('readPrefix', key);
    const stored = this.objects.get(key);
    if (!stored) throw Object.assign(new Error('NotFound'), { name: 'NotFound' });
    if (ifMatchEtag !== undefined && stored.etag !== ifMatchEtag) {
      throw Object.assign(new Error('PreconditionFailed'), { name: 'PreconditionFailed' });
    }
    const content = stored.content ?? Uint8Array.from(GENUINE_START[stored.contentType] ?? []);

    return content.slice(0, length);
  }

  async copyIfMatch(fromKey: string, toKey: string, etag: string): Promise<void> {
    this.refuseWhileDown('copyIfMatch');
    await this.beforeCall?.('copyIfMatch', fromKey);
    this.beforeCopy?.(fromKey);
    const stored = this.objects.get(fromKey);
    if (!stored) throw Object.assign(new Error('NotFound'), { name: 'NotFound' });
    if (stored.etag !== etag) {
      throw Object.assign(new Error('PreconditionFailed'), { name: 'PreconditionFailed' });
    }
    this.objects.set(toKey, { ...stored, etag: `e${(this.counter += 1)}` });
    this.copied.push({ from: fromKey, to: toKey });
  }

  async delete(key: string): Promise<void> {
    this.refuseWhileDown('delete');
    await this.beforeCall?.('delete', key);
    this.objects.delete(key);
    this.deleted.push(key);
  }

  /** What the client does after it is given an upload link: puts the file, which may not be what it declared. */
  put(key: string, stored: StoredObject): void {
    this.objects.set(key, { ...stored, etag: `e${(this.counter += 1)}` });
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
