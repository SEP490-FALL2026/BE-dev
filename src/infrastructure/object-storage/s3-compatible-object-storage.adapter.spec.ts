import { ObjectStorageUnavailableError } from './object-storage.errors';
import { S3CompatibleObjectStorageAdapter } from './s3-compatible-object-storage.adapter';

const settings = {
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_BUCKET: 'bucket',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'key',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret',
  OBJECT_STORAGE_FORCE_PATH_STYLE: true,
};

/** The adapter with the S3 client replaced, so what the service answers is what the test says. */
function adapterAnswering(send: jest.Mock) {
  const adapter = new S3CompatibleObjectStorageAdapter(settings);
  (adapter as unknown as { client: { send: jest.Mock; destroy: () => void } }).client = {
    send,
    destroy: () => undefined,
  };

  return adapter;
}

describe('what the S3 adapter says when the storage goes wrong', () => {
  it.each([
    ['NotFound', { name: 'NotFound' }],
    ['NoSuchKey', { name: 'NoSuchKey' }],
    ['a 404 with no name', { name: 'Error', $metadata: { httpStatusCode: 404 } }],
  ])('lets "no such object" (%s) through unchanged, for the caller to read', async (_label, failure) => {
    const adapter = adapterAnswering(jest.fn().mockRejectedValue(failure));

    await expect(adapter.head('k')).rejects.toBe(failure);
    await expect(adapter.readPrefix('k', 8)).rejects.toBe(failure);
  });

  it.each([
    ['a refused connection', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })],
    ['a timeout', Object.assign(new Error('timed out'), { name: 'TimeoutError' })],
    ['a 503 of the service', Object.assign(new Error('slow down'), { $metadata: { httpStatusCode: 503 } })],
    ['a refusal of the credentials', Object.assign(new Error('denied'), { $metadata: { httpStatusCode: 403 } })],
  ])('turns %s into an outage that keeps its cause', async (_label, failure) => {
    const adapter = adapterAnswering(jest.fn().mockRejectedValue(failure));

    for (const call of [() => adapter.head('k'), () => adapter.readPrefix('k', 8), () => adapter.delete('k')]) {
      const error: unknown = await call().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ObjectStorageUnavailableError);
      expect((error as ObjectStorageUnavailableError).cause).toBe(failure);
    }
  });

  it('reads the first bytes of an object with a range that stops at the length asked', async () => {
    const send = jest
      .fn()
      .mockResolvedValue({ Body: { transformToByteArray: () => Promise.resolve(Uint8Array.of(37, 80)) } });
    const adapter = adapterAnswering(send);

    expect(await adapter.readPrefix('documents/2026/10/abc', 8)).toEqual(Uint8Array.of(37, 80));
    const [command] = send.mock.calls[0] as [{ input: { Key: string; Range: string } }];
    expect(command.input).toMatchObject({ Key: 'documents/2026/10/abc', Range: 'bytes=0-7' });
  });

  it('answers an empty prefix for an object with no body, and an outage when the body cannot be read', async () => {
    expect(await adapterAnswering(jest.fn().mockResolvedValue({})).readPrefix('k', 8)).toEqual(new Uint8Array());
    const broken = adapterAnswering(
      jest.fn().mockResolvedValue({ Body: { transformToByteArray: () => Promise.reject(new Error('reset')) } }),
    );

    await expect(broken.readPrefix('k', 8)).rejects.toBeInstanceOf(ObjectStorageUnavailableError);
  });
});
