import { Client } from 'pg';
import type { Response } from 'supertest';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../src/modules/audit/public/audit.api';
import { toContractApiException } from '../../../src/modules/catalog/contract/contract.http-errors';
import { DocumentRepo } from '../../../src/modules/catalog/contract/document.repo';
import { DocumentService, UPLOAD_ABANDONED_AFTER_MS } from '../../../src/modules/catalog/contract/document.service';
import { DocumentHarness, DocumentWire, PDF } from '../../support/document-harness';
import type { FakeStorageCall } from '../../support/fake-object-storage';
import { waitForLockWaiters } from '../../support/lock-wait';

const h = new DocumentHarness();

/**
 * P28-11: completing a file writes the database last and removes the upload last. The bytes that were looked at are
 * copied to the key they are kept under; the database records it; only once that commit is known does the upload go.
 * A commit that fails takes its own copy back and leaves the upload, so the same call works again — no lost source, no
 * orphan copy, no false 409 `UPLOAD_PENDING`.
 *
 * P29-N5: two calls at once. Exactly one keeps the file (200 `DOCUMENT.UPLOADED`); every other is told it is done (409
 * `DOCUMENT.NOT_AWAITING_UPLOAD`) whatever moment it reached the storage, never `UPLOAD_PENDING` or `UPLOAD_MISMATCH`.
 * Each order is forced with a held storage call or a held row lock, never a sleep.
 */
describe('completing a file and the commit that records it (integration, P28-11, P29-N5, P29-N7)', () => {
  // Set only once it is connected (P29-N8): a setup that fails before reports its own error, not one of the cleanup.
  let holder: Client | undefined;
  const lockHolder = (): Client => {
    if (!holder) throw new Error('The row-lock connection was never opened');

    return holder;
  };

  beforeAll(async () => {
    await h.start();
    const client = new Client({ connectionString: h.ctx.database.url });
    await client.connect();
    holder = client;
  }, 180000);

  afterEach(async () => {
    h.storage.beforeCall = undefined;
    jest.restoreAllMocks();
    await holder?.query('ROLLBACK').catch(() => undefined);
  });

  afterAll(async () => {
    try {
      await holder?.end();
    } finally {
      await h.stop();
    }
  });

  const kept = () => [...h.storage.objects.keys()].filter((key) => key.startsWith('documents/')).sort();
  const events = async (id: string) =>
    (await h.auditEvents('DocumentAttachment', id))
      .map((event) => event.action)
      .filter((action) => action !== 'DOCUMENT.CREATED');
  const declared = async (): Promise<{ id: string; uploadKey: string }> => {
    const document = h.dataOf<{ document: DocumentWire }>(
      await h.createDocument({ ...PDF, purpose: 'CONTRACT_ATTACHMENT' }).expect(201),
    ).document;
    const uploadKey = await h.putObject(document.id, {
      contentLength: document.sizeBytes,
      contentType: PDF.contentType,
    });

    return { id: document.id, uploadKey };
  };
  const answerOf = (response: Response) => ({
    status: response.status,
    said: response.status === 200 ? (response.body as { message: string }).message : h.codeOf(response),
  });
  /** Holds the next storage call of this kind at its start; the call goes on when released. */
  const holdNext = (call: FakeStorageCall) => {
    let reached!: () => void;
    let release!: () => void;
    const atCall = new Promise<void>((resolve) => (reached = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    let used = false;
    h.storage.beforeCall = async (name) => {
      if (name !== call || used) return;
      used = true;
      reached();
      await released;
    };

    return { atCall, release };
  };

  /** One 200 and one 409 NOT_AWAITING_UPLOAD, one referenced copy and nothing else, no upload, one UPLOADED event. */
  const expectOneKept = async (id: string, uploadKey: string, before: string[], answers: Response[]) => {
    expect(answers.map(answerOf).sort((a, b) => a.status - b.status)).toEqual([
      { status: 200, said: 'DOCUMENT.UPLOADED' },
      { status: 409, said: 'DOCUMENT.NOT_AWAITING_UPLOAD' },
    ]);
    const finalKey = await h.finalKeyOf(id);
    expect(await h.statusOf(id)).toBe('PENDING_ATTACH');
    expect(finalKey).not.toBeNull();
    expect(kept()).toEqual([...before, finalKey].sort());
    expect(h.storage.objects.has(uploadKey)).toBe(false);
    expect(await events(id)).toEqual(['DOCUMENT.UPLOADED']);
    for (const answer of answers) expect(answer.text).not.toMatch(/documents\/|pending-documents|NotFound|SQL|stack/i);
  };

  describe('interleaving 1: the loser read AWAITING_UPLOAD, then reaches the storage after the winner kept the file', () => {
    it.each<[string, FakeStorageCall]>([
      ['looks at the object (head) after the upload is deleted', 'head'],
      ['reads its first bytes after the upload is deleted', 'readPrefix'],
      ['copies it after the upload is deleted', 'copyIfMatch'],
    ])('is told the file is done when it %s', async (_name, call) => {
      const { id, uploadKey } = await declared();
      const before = kept();
      const held = holdNext(call);

      const loser = h.completeDocument(id).then((response) => response);
      await held.atCall;
      const winner = await h.completeDocument(id);
      expect(h.storage.objects.has(uploadKey)).toBe(false);
      held.release();

      await expectOneKept(id, uploadKey, before, [winner, await loser]);
    });
  });

  it('interleaving 2: both look at and copy the upload, then the loser waits for the row the winner holds', async () => {
    const { id, uploadKey } = await declared();
    const before = kept();
    await lockHolder().query('BEGIN');
    await lockHolder().query('SELECT id FROM document_attachments WHERE id = $1 FOR UPDATE', [id]);

    const both = Promise.all([h.completeDocument(id), h.completeDocument(id)]);
    await waitForLockWaiters(h.ctx.sql, 2);
    // Both copies exist before either commits: the storage work is done, only the row decides.
    expect(h.storage.copied.filter((copy) => copy.from === uploadKey)).toHaveLength(2);
    await lockHolder().query('COMMIT');

    await expectOneKept(id, uploadKey, before, await both);
  });

  describe('interleaving 3: the upload goes or changes after it was looked at, while the file still awaits it', () => {
    const replace = (key: string) =>
      h.storage.put(key, {
        contentLength: PDF.sizeBytes,
        contentType: PDF.contentType,
        content: Uint8Array.of(77, 90),
      });

    it.each<[string, FakeStorageCall, 'delete' | 'replace']>([
      ['deleted between the look and the first bytes', 'readPrefix', 'delete'],
      ['put again between the look and the first bytes', 'readPrefix', 'replace'],
      ['deleted between the first bytes and the copy', 'copyIfMatch', 'delete'],
      ['put again between the first bytes and the copy', 'copyIfMatch', 'replace'],
    ])(
      'quarantines a file whose upload was %s, keeps nothing and says it is not what was declared',
      async (_name, call, change) => {
        const { id, uploadKey } = await declared();
        const before = kept();
        const held = holdNext(call);

        const answer = h.completeDocument(id).then((response) => response);
        await held.atCall;
        if (change === 'delete') h.storage.objects.delete(uploadKey);
        else replace(uploadKey);
        held.release();

        expect(answerOf(await answer)).toEqual({ status: 422, said: 'DOCUMENT.UPLOAD_MISMATCH' });
        expect(await h.statusOf(id)).toBe('QUARANTINED');
        expect(await h.finalKeyOf(id)).toBeNull();
        expect(kept()).toEqual(before);
        expect(h.storage.objects.has(uploadKey)).toBe(false);
        expect(await events(id)).toEqual(['DOCUMENT.QUARANTINED']);
      },
    );
  });

  it('interleaving 4: a commit that fails keeps the upload and takes its copy back; the same call then completes the file', async () => {
    const { id, uploadKey } = await declared();
    const before = kept();
    jest
      .spyOn(h.ctx.app.get(AuditApi, { strict: false }), 'record')
      .mockRejectedValueOnce(new Error('the commit failed'));

    const failed = await h.completeDocument(id);

    expect(answerOf(failed)).toEqual({ status: 500, said: 'INTERNAL_SERVER_ERROR' });
    expect(failed.text).not.toMatch(/the commit failed|documents\//);
    expect(await h.statusOf(id)).toBe('AWAITING_UPLOAD');
    expect(h.storage.objects.has(uploadKey)).toBe(true);
    expect(kept()).toEqual(before);
    expect(await events(id)).toEqual([]);

    jest.restoreAllMocks();
    expect(answerOf(await h.completeDocument(id))).toEqual({ status: 200, said: 'DOCUMENT.UPLOADED' });

    expect(await h.statusOf(id)).toBe('PENDING_ATTACH');
    const finalKey = await h.finalKeyOf(id);
    expect(kept()).toEqual([...before, finalKey].sort());
    expect(h.storage.objects.has(uploadKey)).toBe(false);
    expect(await events(id)).toEqual(['DOCUMENT.UPLOADED']);
  });

  it('interleaving 5: an upload that never came is pending — the file keeps waiting, nothing is kept or deleted', async () => {
    const document = h.dataOf<{ document: DocumentWire }>(
      await h.createDocument({ ...PDF, purpose: 'CONTRACT_ATTACHMENT' }).expect(201),
    ).document;
    const uploadKey = await h.keyOf(document.id);
    const before = kept();

    expect(answerOf(await h.completeDocument(document.id))).toEqual({ status: 409, said: 'DOCUMENT.UPLOAD_PENDING' });
    expect(await h.statusOf(document.id)).toBe('AWAITING_UPLOAD');
    expect(await h.finalKeyOf(document.id)).toBeNull();
    expect(kept()).toEqual(before);
    expect(h.storage.deleted).not.toContain(uploadKey);
    expect(await events(document.id)).toEqual([]);
  });

  it('supplementary: two calls at once with no order forced still keep one file and tell the other it is done', async () => {
    const { id, uploadKey } = await declared();
    const before = kept();

    await expectOneKept(id, uploadKey, before, await Promise.all([h.completeDocument(id), h.completeDocument(id)]));
  });
  describe('P29-N7: the day ends while a call is under way — the row, not the clock, decides the answer', () => {
    const service = () => h.ctx.app.get(DocumentService, { strict: false });
    const actor = (): AuthenticatedPrincipal => ({
      subject: h.it1.appUserId,
      appUserId: h.it1.appUserId,
      sessionId: 'p29-n7',
      employeeId: h.it1.employeeId,
      directRoles: ['IT_ADMIN'],
      roles: ['IT_ADMIN'],
    });
    /** The wire answer the API gives for an error the service throws. */
    const wireOf = (error: unknown) => {
      const mapped = toContractApiException(error) as { getStatus(): number; getResponse(): { code: string } };

      return { status: mapped.getStatus(), said: mapped.getResponse().code };
    };
    /** One millisecond past the day the file has to be uploaded in, by its own creation time. */
    const afterTheDay = async (id: string) => {
      const created = (
        await h.ctx.sql.query<{ created_at: Date }>(`SELECT created_at FROM document_attachments WHERE id = $1`, [id])
      ).rows[0].created_at;
      jest.spyOn(Date, 'now').mockReturnValue(created.getTime() + UPLOAD_ABANDONED_AFTER_MS + 1);
    };
    /** Every outcome of `expire` (true: this call gave the file up; false: the locked row no longer awaited it). */
    const expireOutcomes = () => {
      const spy = jest.spyOn(service() as unknown as { expire: (...args: unknown[]) => Promise<boolean> }, 'expire');

      return async () => Promise.all(spy.mock.results.map((result) => result.value as Promise<boolean>));
    };
    /** Holds the next read of a file by its owner check, after the row was read: the caller then has its snapshot. */
    const holdNextRead = () => {
      const repo = h.ctx.app.get(DocumentRepo, { strict: false });
      const original = repo.find.bind(repo);
      let reached!: () => void;
      let release!: () => void;
      const atRead = new Promise<void>((resolve) => (reached = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));
      jest.spyOn(repo, 'find').mockImplementationOnce(async (...args: Parameters<DocumentRepo['find']>) => {
        const row = await original(...args);
        reached();
        await released;

        return row;
      });

      return { atRead, release };
    };

    it('a loser that read AWAITING_UPLOAD, then crosses the day after the winner kept the file, is told it is done', async () => {
      const { id, uploadKey } = await declared();
      const before = kept();
      const outcomes = expireOutcomes();
      const read = holdNextRead();

      const loser = h.completeDocument(id).then((response) => response);
      await read.atRead;
      const winner = await h.completeDocument(id);
      expect(answerOf(winner)).toEqual({ status: 200, said: 'DOCUMENT.UPLOADED' });
      await afterTheDay(id);
      read.release();
      const late = await loser;

      // The loser did reach the expiry, and the conditional expiry found the row no longer awaiting.
      expect(await outcomes()).toEqual([false]);
      await expectOneKept(id, uploadKey, before, [winner, late]);
    });

    it('a call past the day that gives the file up first is told it expired; the upload goes only after that commit', async () => {
      const { id, uploadKey } = await declared();
      const before = kept();
      const held = holdNext('head');
      const completion = h.completeDocument(id).then((response) => response);
      await held.atCall;
      const statusAtDelete: string[] = [];
      h.storage.beforeCall = async (call, key) => {
        if (call === 'delete' && key === uploadKey) statusAtDelete.push(await h.statusOf(id));
      };
      const outcomes = expireOutcomes();
      await afterTheDay(id);

      const expiring = await service()
        .complete(actor(), id)
        .catch((error: unknown) => error);

      expect(wireOf(expiring)).toEqual({ status: 409, said: 'DOCUMENT.UPLOAD_EXPIRED' });
      expect(await outcomes()).toEqual([true]);
      expect(statusAtDelete).toEqual(['EXPIRED']);
      expect(h.storage.objects.has(uploadKey)).toBe(false);

      // The completion that read the file before the day ended now finds it given up.
      held.release();
      expect(answerOf(await completion)).toEqual({ status: 409, said: 'DOCUMENT.UPLOAD_EXPIRED' });
      expect(await h.statusOf(id)).toBe('EXPIRED');
      expect(await h.finalKeyOf(id)).toBeNull();
      expect(kept()).toEqual(before);
      expect(await events(id)).toEqual(['DOCUMENT.EXPIRED']);
    });

    it('two calls past the day: one gives the file up, the other loses the expiry and is told it expired, one event', async () => {
      const { id, uploadKey } = await declared();
      const before = kept();
      await afterTheDay(id);
      const outcomes = expireOutcomes();
      const read = holdNextRead();

      const second = service()
        .complete(actor(), id)
        .catch((error: unknown) => error);
      await read.atRead;
      const first = await service()
        .complete(actor(), id)
        .catch((error: unknown) => error);
      read.release();

      expect([wireOf(first), wireOf(await second)]).toEqual([
        { status: 409, said: 'DOCUMENT.UPLOAD_EXPIRED' },
        { status: 409, said: 'DOCUMENT.UPLOAD_EXPIRED' },
      ]);
      expect(await outcomes()).toEqual([true, false]);
      expect(await h.statusOf(id)).toBe('EXPIRED');
      expect(kept()).toEqual(before);
      expect(h.storage.objects.has(uploadKey)).toBe(false);
      expect(await events(id)).toEqual(['DOCUMENT.EXPIRED']);
    });
  });
});
