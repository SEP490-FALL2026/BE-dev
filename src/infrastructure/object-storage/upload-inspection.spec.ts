import { ObjectKeyFactory } from './object-key.factory';
import { ObjectStorageUnavailableError } from './object-storage.errors';
import type { ObjectStoragePort } from './object-storage.port';
import { UploadInspection } from './upload-inspection';

describe('UploadInspection', () => {
  let storage: jest.Mocked<ObjectStoragePort>;
  let keys: ObjectKeyFactory;
  let inspection: UploadInspection;

  beforeEach(() => {
    storage = {
      createUploadUrl: jest.fn(),
      createDownloadUrl: jest.fn(),
      head: jest.fn(),
      readPrefix: jest.fn(),
      copyIfMatch: jest.fn(),
      delete: jest.fn(),
    };
    keys = new ObjectKeyFactory();
    inspection = new UploadInspection(storage, keys);
  });

  const validDeclared = { contentType: 'application/pdf', sizeBytes: 1000 };
  const acceptsAll = () => true;

  it('returns MISSING when object does not exist in storage', async () => {
    storage.head.mockRejectedValue({ name: 'NotFound', status: 404 });

    const result = await inspection.inspect({
      pendingKey: 'pending/1',
      declared: validDeclared,
      accepts: acceptsAll,
      finalScope: 'budget-documents',
    });

    expect(result).toEqual({ outcome: 'MISSING' });
  });

  it('returns MISMATCH and discards when metadata size or content type differs', async () => {
    storage.head.mockResolvedValue({
      contentLength: 999,
      contentType: 'application/pdf',
      etag: 'etag-1',
      checksum: undefined,
    });

    const result = await inspection.inspect({
      pendingKey: 'pending/1',
      declared: validDeclared,
      accepts: acceptsAll,
      finalScope: 'budget-documents',
    });

    expect(result).toEqual({ outcome: 'MISMATCH' });
    expect(storage.delete.mock.calls).toEqual([['pending/1']]);
  });

  it('returns MISMATCH and discards when readPrefix fails with changed/missing', async () => {
    storage.head.mockResolvedValue({
      contentLength: 1000,
      contentType: 'application/pdf',
      etag: 'etag-1',
      checksum: undefined,
    });
    storage.readPrefix.mockRejectedValue({ name: 'PreconditionFailed', status: 412 });

    const result = await inspection.inspect({
      pendingKey: 'pending/1',
      declared: validDeclared,
      accepts: acceptsAll,
      finalScope: 'budget-documents',
    });

    expect(result).toEqual({ outcome: 'MISMATCH' });
    expect(storage.delete.mock.calls).toEqual([['pending/1']]);
  });

  it('returns MISMATCH and discards when accepts predicate rejects prefix', async () => {
    storage.head.mockResolvedValue({
      contentLength: 1000,
      contentType: 'application/pdf',
      etag: 'etag-1',
      checksum: undefined,
    });
    storage.readPrefix.mockResolvedValue(Buffer.from('not-a-pdf'));

    const result = await inspection.inspect({
      pendingKey: 'pending/1',
      declared: validDeclared,
      accepts: () => false,
      finalScope: 'budget-documents',
    });

    expect(result).toEqual({ outcome: 'MISMATCH' });
    expect(storage.delete.mock.calls).toEqual([['pending/1']]);
  });

  it('returns MISMATCH and discards when copyIfMatch fails with changed/missing', async () => {
    storage.head.mockResolvedValue({
      contentLength: 1000,
      contentType: 'application/pdf',
      etag: 'etag-1',
      checksum: undefined,
    });
    storage.readPrefix.mockResolvedValue(Buffer.from('%PDF-1.7'));
    storage.copyIfMatch.mockRejectedValue({ name: 'PreconditionFailed', status: 412 });

    const result = await inspection.inspect({
      pendingKey: 'pending/1',
      declared: validDeclared,
      accepts: acceptsAll,
      finalScope: 'budget-documents',
    });

    expect(result).toEqual({ outcome: 'MISMATCH' });
    expect(storage.delete.mock.calls).toEqual([['pending/1']]);
  });

  it('returns KEPT with final key when everything matches', async () => {
    storage.head.mockResolvedValue({
      contentLength: 1000,
      contentType: 'application/pdf',
      etag: 'etag-1',
      checksum: undefined,
    });
    storage.readPrefix.mockResolvedValue(Buffer.from('%PDF-1.7'));
    storage.copyIfMatch.mockResolvedValue();

    const result = await inspection.inspect({
      pendingKey: 'pending/1',
      declared: validDeclared,
      accepts: acceptsAll,
      finalScope: 'budget-documents',
    });

    expect(result.outcome).toBe('KEPT');
    if (result.outcome === 'KEPT') {
      expect(result.finalObjectKey).toMatch(/^budget-documents\/\d{4}\/\d{2}\/[a-f0-9-]+$/);
      expect(storage.copyIfMatch.mock.calls).toEqual([['pending/1', result.finalObjectKey, 'etag-1']]);
    }
  });

  it('propagates ObjectStorageUnavailableError from inspect', async () => {
    storage.head.mockRejectedValue(new ObjectStorageUnavailableError());

    await expect(
      inspection.inspect({
        pendingKey: 'pending/1',
        declared: validDeclared,
        accepts: acceptsAll,
        finalScope: 'budget-documents',
      }),
    ).rejects.toBeInstanceOf(ObjectStorageUnavailableError);
  });

  describe('discard', () => {
    it('ignores 404 / NotFound and ObjectStorageUnavailableError', async () => {
      storage.delete.mockRejectedValueOnce({ name: 'NotFound', status: 404 });
      await expect(inspection.discard('pending/1')).resolves.toBeUndefined();

      storage.delete.mockRejectedValueOnce(new ObjectStorageUnavailableError());
      await expect(inspection.discard('pending/1')).resolves.toBeUndefined();
    });

    it('re-throws other unexpected errors', async () => {
      storage.delete.mockRejectedValueOnce(new Error('Unknown storage failure'));
      await expect(inspection.discard('pending/1')).rejects.toThrow('Unknown storage failure');
    });
  });
});
