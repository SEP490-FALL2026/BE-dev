import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { S3CompatibleObjectStorageAdapter } from '../../src/infrastructure/object-storage/s3-compatible-object-storage.adapter';

/**
 * The S3 adapter against a real S3-compatible service (SEC-01, SEC-07): what the signed links make the storage refuse and
 * what it answers. It runs only when `TEST_OBJECT_STORAGE_ENDPOINT` names a service that validates signatures (MinIO, or
 * LocalStack with signature validation on); with none the suite is skipped and says why, because nothing here can be proven
 * against a fake. See test/README.md.
 */
const endpoint = process.env.TEST_OBJECT_STORAGE_ENDPOINT;
const describeWithStorage = endpoint ? describe : describe.skip;

describeWithStorage('the S3 adapter against a real S3-compatible service (integration)', () => {
  const settings = {
    OBJECT_STORAGE_ENDPOINT: endpoint ?? 'http://127.0.0.1:9000',
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_BUCKET: `slm-test-${Date.now()}`,
    OBJECT_STORAGE_ACCESS_KEY_ID: process.env.TEST_OBJECT_STORAGE_ACCESS_KEY_ID ?? 'test',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: process.env.TEST_OBJECT_STORAGE_SECRET_ACCESS_KEY ?? 'test',
    OBJECT_STORAGE_FORCE_PATH_STYLE: true,
  };
  const adapter = new S3CompatibleObjectStorageAdapter(settings);
  const pdf = Buffer.from('%PDF-1.4 a contract that was looked at');
  let counter = 0;
  const key = (scope: string) => `${scope}/${Date.now()}-${(counter += 1)}`;
  const put = (url: string, body: Buffer, contentType: string) =>
    fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: new Uint8Array(body) });

  beforeAll(async () => {
    const admin = new S3Client({
      endpoint: settings.OBJECT_STORAGE_ENDPOINT,
      region: settings.OBJECT_STORAGE_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: settings.OBJECT_STORAGE_ACCESS_KEY_ID,
        secretAccessKey: settings.OBJECT_STORAGE_SECRET_ACCESS_KEY,
      },
    });
    await admin.send(new CreateBucketCommand({ Bucket: settings.OBJECT_STORAGE_BUCKET }));
    admin.destroy();
  }, 30000);

  afterAll(() => adapter.onModuleDestroy());

  it('signs the type and the size into the upload link: the declared file is taken, any other is refused', async () => {
    const target = key('pending-documents');
    const url = await adapter.createUploadUrl({
      key: target,
      contentType: 'application/pdf',
      contentLength: pdf.length,
      expiresInSeconds: 120,
    });

    expect(new URL(url).searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect((await put(url, pdf, 'text/html')).status).toBe(403);
    expect((await put(url, Buffer.concat([pdf, Buffer.from('!')]), 'application/pdf')).status).toBe(403);
    expect((await put(url, pdf.subarray(1), 'application/pdf')).status).toBe(403);
    await expect(adapter.head(target)).rejects.toMatchObject({ name: 'NotFound' });
    expect((await put(url, pdf, 'application/pdf')).status).toBe(200);
    expect(await adapter.head(target)).toMatchObject({ contentLength: pdf.length, contentType: 'application/pdf' });
  });

  it('copies only the bytes that were looked at: an object put again since is refused, and never copied', async () => {
    const temp = key('pending-documents');
    const kept = key('documents');
    const link = () =>
      adapter.createUploadUrl({
        key: temp,
        contentType: 'application/pdf',
        contentLength: pdf.length,
        expiresInSeconds: 120,
      });
    await put(await link(), pdf, 'application/pdf');
    const looked = await adapter.head(temp);
    expect(await adapter.readPrefix(temp, 5, looked.etag)).toEqual(Uint8Array.from(Buffer.from('%PDF-')));

    // Another file of the same size is put with the old link after the look.
    const hostile = Buffer.from(
      'MZ-an executable that is just as long as the file......'.padEnd(pdf.length, '.').slice(0, pdf.length),
    );
    await put(await link(), hostile, 'application/pdf');

    await expect(adapter.readPrefix(temp, 5, looked.etag)).rejects.toMatchObject({ name: 'PreconditionFailed' });
    await expect(adapter.copyIfMatch(temp, kept, looked.etag as string)).rejects.toMatchObject({
      name: 'PreconditionFailed',
    });
    await expect(adapter.head(kept)).rejects.toMatchObject({ name: 'NotFound' });

    // Looked at again, the same bytes are copied, and the old link then changes only the temporary key.
    const second = await adapter.head(temp);
    await adapter.copyIfMatch(temp, kept, second.etag as string);
    await adapter.delete(temp);
    await put(await link(), pdf, 'application/pdf');
    expect(Buffer.from(await adapter.readPrefix(kept, 12)).toString()).toBe(hostile.subarray(0, 12).toString());
  });

  it('makes a download an attachment with the name and the type that were declared, whatever the object says of itself', async () => {
    const target = key('documents');
    const up = await adapter.createUploadUrl({
      key: target,
      contentType: 'application/pdf',
      contentLength: pdf.length,
      expiresInSeconds: 120,
    });
    await put(up, pdf, 'application/pdf');

    const url = await adapter.createDownloadUrl({
      key: target,
      fileName: 'Hợp đồng K1.pdf',
      contentType: 'application/pdf',
      expiresInSeconds: 300,
    });
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="H_p __ng K1.pdf"; filename*=UTF-8''H%E1%BB%A3p%20%C4%91%E1%BB%93ng%20K1.pdf`,
    );
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf);
  });

  it('refuses an expired link and a link of an object that was deleted', async () => {
    const target = key('documents');
    const up = await adapter.createUploadUrl({
      key: target,
      contentType: 'application/pdf',
      contentLength: pdf.length,
      expiresInSeconds: 120,
    });
    await put(up, pdf, 'application/pdf');
    const url = await adapter.createDownloadUrl({
      key: target,
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      expiresInSeconds: 300,
    });
    await adapter.delete(target);

    expect((await fetch(url)).status).toBe(404);
  });
});
