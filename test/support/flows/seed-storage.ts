import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CreateUploadUrlInput } from '../../../src/infrastructure/object-storage/object-storage.port';
import { OBJECT_STORAGE } from '../../../src/infrastructure/object-storage/object-storage.port';
import { FakeObjectStorage } from '../fake-object-storage';

/** The fake storage whose upload links point at the receiver of `SeedStorage`, so a real PUT (from this process or a child) reaches it. */
class ReceivingStorage extends FakeObjectStorage {
  base = 'http://127.0.0.1:0';

  override async createUploadUrl(input: CreateUploadUrlInput): Promise<string> {
    const url = (await super.createUploadUrl(input)).replace('https://storage.example', this.base);
    this.uploadLinks[this.uploadLinks.length - 1].url = url;

    return url;
  }
}

/**
 * The object storage of an application the seed runs against in a test: the bytes the seed puts at an upload link (`BM-10`, files of a
 * version, invoices) land in the fake storage the application inspects, as a browser's PUT lands in the bucket. The links point at a small
 * HTTP receiver on the loopback, so the seed needs nothing of the test: the real `fetch` of the command (even in a child process) puts the
 * file. `start()` before the application takes uploads, `stop()` after.
 */
export class SeedStorage {
  readonly storage = new ReceivingStorage();
  private server: Server | null = null;

  /** The provider override of the application: its object storage is this fake one. */
  get override(): { token: unknown; useValue: unknown } {
    return { token: OBJECT_STORAGE, useValue: this.storage };
  }

  async start(): Promise<void> {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const link = this.storage.uploadLinks.find((candidate) => candidate.url === `${this.storage.base}${req.url}`);
        if (req.method !== 'PUT' || !link) {
          res.writeHead(403).end();
          return;
        }
        const content = Uint8Array.from(Buffer.concat(chunks));
        this.storage.put(link.key, { contentLength: content.length, contentType: link.contentType, content });
        res.writeHead(200).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    this.server = server;
    this.storage.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
