import { Client } from 'pg';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { BudgetAttachmentExpiryService } from '../../../src/modules/budgets/attachment/budget-attachment-expiry.service';
import { BudgetAttachmentRepo } from '../../../src/modules/budgets/attachment/budget-attachment.repo';
import type { BudgetAttachmentRecord } from '../../../src/modules/budgets/attachment/budget-attachment.types';
import {
  AttachmentDataWire,
  BudgetAttachmentHarness,
  SAMPLE_PDF,
  SAMPLE_XLSX,
} from '../../support/budget-attachment-harness';

const h = new BudgetAttachmentHarness();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Every field a record has: a field read under the wrong name is `undefined`, never null (a raw `SELECT *` does that). */
const RECORD_FIELDS = [
  'attachedAt',
  'contentType',
  'createdAt',
  'fileName',
  'finalObjectKey',
  'id',
  'objectKey',
  'organizationId',
  'proposalId',
  'removedAt',
  'removedByEmployeeId',
  'sizeBytes',
  'status',
  'target',
  'uploadedByEmployeeId',
  'versionId',
];

function expectEveryFieldRead(
  record: BudgetAttachmentRecord | null | undefined,
): asserts record is BudgetAttachmentRecord {
  expect(record).toBeTruthy();
  expect(Object.keys(record!).sort()).toEqual(RECORD_FIELDS);
  for (const [field, value] of Object.entries(record!)) {
    expect([field, value === undefined]).toEqual([field, false]);
  }
}

describe('budget attachment repo and expiry sweeper (integration)', () => {
  let counter = 0;
  let expiryService: BudgetAttachmentExpiryService;
  let repo: BudgetAttachmentRepo;
  let runner: TransactionRunner;

  beforeAll(async () => {
    await h.start();
    expiryService = h.ctx.app.get(BudgetAttachmentExpiryService, { strict: false });
    repo = h.ctx.app.get(BudgetAttachmentRepo, { strict: false });
    runner = h.ctx.app.get(TransactionRunner, { strict: false });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  }, 120000);

  const waiting = async () => {
    counter += 1;
    return await h.departmentWithHead(`P-EX${counter}`);
  };

  const withVersion = async () => {
    const unit = await waiting();
    const proposal = await h.budgetProposed(unit.head, unit.department.unitId);
    const version = await h.built(proposal.id);

    return { ...unit, proposal, version };
  };

  const auditCount = async (id: string, action: string) =>
    Number(
      (
        await h.ctx.sql.query<{ n: string }>(
          `SELECT count(*) AS n FROM audit_events WHERE resource_type = 'BUDGET_ATTACHMENT' AND resource_id = $1 AND action = $2`,
          [id, action],
        )
      ).rows[0].n,
    );

  /** Another connection that holds the row `FOR UPDATE`, the way a proposal send or a discard does. */
  const holdRow = async (id: string) => {
    const holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    await holder.query('BEGIN');
    await holder.query(`SELECT id FROM budget_attachments WHERE id = $1 FOR UPDATE`, [id]);

    return holder;
  };

  describe('the repo reads every field of a locked row (a raw SELECT * returns column names, not field names)', () => {
    it('maps every field in lock, lockManyAsc, lockNextExpired and the head list of the latest send', async () => {
      const { head, version } = await withVersion();

      // A proposal file that is attached (proposal_id set) and, below, version files that are kept and removed.
      const other = await waiting();
      const proposalFile = await h.uploaded(SAMPLE_PDF, other.head.account);
      const sent = await h
        .submitProposal(
          { ...h.proposalBody(other.department.unitId), attachmentIds: [proposalFile] },
          other.head.account,
        )
        .expect(201);
      const proposalId = h.dataOf<{ proposal: { id: string } }>(sent).proposal.id;
      const kept = await h.uploaded({ ...SAMPLE_PDF, fileName: 'kept.pdf' }, h.finance, { versionId: version.id });
      const removed = await h.uploaded({ ...SAMPLE_XLSX, fileName: 'removed.xlsx' }, h.finance, {
        versionId: version.id,
      });
      await h.removeVersionAttachment(version.id, removed).expect(200);
      const waitingForUpload = h.dataOf<AttachmentDataWire>(
        await h.declareProposalAttachment({ ...SAMPLE_PDF, fileName: 'waiting.pdf' }, head.account).expect(201),
      ).attachment.id;

      // lock: the row of the version that was removed has every optional field set.
      const locked = await runner.run((tx) => repo.lock(tx, removed));
      expectEveryFieldRead(locked);
      expect(locked).toEqual(await repo.find(removed));
      expect(locked).toMatchObject({
        id: removed,
        organizationId: h.seed.organizationId,
        target: 'VERSION',
        status: 'REMOVED',
        fileName: 'removed.xlsx',
        contentType: SAMPLE_XLSX.contentType,
        sizeBytes: SAMPLE_XLSX.sizeBytes,
        uploadedByEmployeeId: h.finance.employeeId,
        removedByEmployeeId: h.finance.employeeId,
        versionId: version.id,
        proposalId: null,
      });
      expect(locked.objectKey).toBeTruthy();
      expect(locked.finalObjectKey).toMatch(/^budget-documents\//);
      expect(locked.attachedAt).toBeInstanceOf(Date);
      expect(locked.removedAt).toBeInstanceOf(Date);
      expect(locked.createdAt).toBeInstanceOf(Date);

      // lock of an absent row is null.
      expect(await runner.run((tx) => repo.lock(tx, '9b1d6a3e-4c2f-4d8a-9e51-7a3b2c1d0e9f'))).toBeNull();

      // lockManyAsc: in ascending id order, every field read, the same records as find.
      const ids = [kept, removed, waitingForUpload, proposalFile];
      const many = await runner.run((tx) => repo.lockManyAsc(tx, ids));
      expect(many.map((record) => record.id)).toEqual([...ids].sort());
      for (const record of many) {
        expectEveryFieldRead(record);
        expect(record).toEqual(await repo.find(record.id));
      }
      expect(many.find((record) => record.id === proposalFile)).toMatchObject({
        target: 'PROPOSAL',
        status: 'ATTACHED',
        uploadedByEmployeeId: other.head.employeeId,
        versionId: null,
        proposalId,
      });

      // The head's list of the latest send: what was attached by `sentAt` and not removed before it, every field read.
      const sentAt = new Date(Date.now() + HOUR);
      const page = await repo.pageByVersionAsLastSent(version.id, sentAt, { skip: 0, take: 10 });
      expect(page.totalItems).toBe(1);
      expect(page.items.map((record) => record.id)).toEqual([kept]);
      expectEveryFieldRead(page.items[0]);
      expect(page.items[0]).toEqual(await repo.find(kept));
      // Sent before the removal: the removed one was part of what was sent.
      const early = await repo.pageByVersionAsLastSent(version.id, new Date(locked.removedAt!.getTime() - 1), {
        skip: 0,
        take: 10,
      });
      expect(early.items.map((record) => record.id).sort()).toEqual([kept, removed].sort());
      // Sent before anything was attached: nothing.
      expect((await repo.pageByVersionAsLastSent(version.id, new Date(0), { skip: 0, take: 10 })).totalItems).toBe(0);

      // lockNextExpired: the upload nobody finished, every field read; skipped when named as failed.
      const now = new Date(Date.now() + 25 * HOUR);
      const next = await runner.run((tx) => repo.lockNextExpired(tx, now, []));
      expectEveryFieldRead(next);
      expect(next.id).toBe(waitingForUpload);
      expect(next).toEqual(await repo.find(waitingForUpload));
      expect(await runner.run((tx) => repo.lockNextExpired(tx, now, [waitingForUpload]))).toBeNull();
      expect(await runner.run((tx) => repo.lockNextExpired(tx, new Date(), []))).toBeNull();
    });
  });

  describe('the sweeper', () => {
    it('expires abandoned AWAITING_UPLOAD attachments older than 24 hours and deletes the upload', async () => {
      const { head } = await waiting();

      const decl = await h.declareProposalAttachment(SAMPLE_PDF, head.account).expect(201);
      const attId = h.dataOf<AttachmentDataWire>(decl).attachment.id;
      const key = await h.putObject(attId, {
        contentLength: SAMPLE_PDF.sizeBytes,
        contentType: SAMPLE_PDF.contentType,
      });

      // Not yet: 23 hours.
      await expiryService.expire(new Date(Date.now() + 23 * HOUR));
      expect(await h.statusOf(attId)).toBe('AWAITING_UPLOAD');

      const result = await expiryService.expire(new Date(Date.now() + 25 * HOUR));
      expect(result.expired).toBeGreaterThanOrEqual(1);
      expect(await h.statusOf(attId)).toBe('EXPIRED');
      expect(h.storage.objects.has(key)).toBe(false);

      const auditRow = (
        await h.ctx.sql.query<{ actor_kind: string }>(
          `SELECT actor_kind FROM audit_events WHERE resource_type = 'BUDGET_ATTACHMENT' AND resource_id = $1 AND action = 'BUDGET_ATTACHMENT.EXPIRED'`,
          [attId],
        )
      ).rows[0];
      expect(auditRow.actor_kind).toBe('SYSTEM');

      // Run again: nothing more is written.
      await expiryService.expire(new Date(Date.now() + 25 * HOUR));
      expect(await auditCount(attId, 'BUDGET_ATTACHMENT.EXPIRED')).toBe(1);
    });

    it('expires unattached UPLOADED attachments older than 7 days and deletes the kept copy, not a recent one', async () => {
      const { head } = await waiting();

      const oldId = await h.uploaded(SAMPLE_XLSX, head.account);
      const oldKey = (await h.finalKeyOf(oldId))!;
      await expiryService.expire(new Date(Date.now() + 6 * DAY));
      expect(await h.statusOf(oldId)).toBe('UPLOADED');

      await expiryService.expire(new Date(Date.now() + 8 * DAY));
      expect(await h.statusOf(oldId)).toBe('EXPIRED');
      expect(h.storage.objects.has(oldKey)).toBe(false);

      const recentId = await h.uploaded(SAMPLE_PDF, head.account);
      await expiryService.expire(new Date());
      expect(await h.statusOf(recentId)).toBe('UPLOADED');
    });

    it('expires only what no one attached: attached, removed, discarded and quarantined stay as they are', async () => {
      const w = await withVersion();

      const p = await waiting();
      const attachedToProposal = await h.uploaded(SAMPLE_PDF, p.head.account);
      await h
        .submitProposal({ ...h.proposalBody(p.department.unitId), attachmentIds: [attachedToProposal] }, p.head.account)
        .expect(201);
      const attachedToVersion = await h.uploaded({ ...SAMPLE_PDF, fileName: 'a.pdf' }, h.finance, {
        versionId: w.version.id,
      });
      const removed = await h.uploaded({ ...SAMPLE_PDF, fileName: 'r.pdf' }, h.finance, { versionId: w.version.id });
      await h.removeVersionAttachment(w.version.id, removed).expect(200);
      const discarded = await h.uploaded(SAMPLE_XLSX, w.head.account);
      await h.discardAttachment(discarded, w.head.account).expect(200);
      const quarantined = h.dataOf<AttachmentDataWire>(
        await h.declareProposalAttachment(SAMPLE_PDF, w.head.account).expect(201),
      ).attachment.id;
      await h.putObject(quarantined, {
        contentLength: SAMPLE_PDF.sizeBytes,
        contentType: SAMPLE_PDF.contentType,
        content: new Uint8Array([0x00, 0x01]),
      });
      await h.completeAttachment(quarantined, w.head.account).expect(422);
      const keptCopies = [attachedToVersion, removed].map(async (id) => (await h.finalKeyOf(id))!);

      const before = await Promise.all(
        [attachedToProposal, attachedToVersion, removed, discarded, quarantined].map(async (id) => [
          id,
          await h.statusOf(id),
        ]),
      );
      await expiryService.expire(new Date(Date.now() + 30 * DAY));
      const after = await Promise.all(before.map(async ([id]) => [id, await h.statusOf(id)]));
      expect(after).toEqual(before);
      for (const key of await Promise.all(keptCopies)) expect(h.storage.objects.has(key)).toBe(true);
    });

    it('does not wait for a row another transaction holds and leaves it to that transaction (SKIP LOCKED)', async () => {
      const { head } = await waiting();
      const locked = await h.uploaded(SAMPLE_PDF, head.account);
      const free = await h.uploaded(SAMPLE_XLSX, head.account);
      const holder = await holdRow(locked);

      try {
        const sweep = expiryService.expire(new Date(Date.now() + 8 * DAY));
        const outcome = await Promise.race([
          sweep.then(() => 'done' as const),
          new Promise<'waited'>((resolve) => setTimeout(() => resolve('waited'), 8000)),
        ]);
        expect(outcome).toBe('done');
        expect(await h.statusOf(free)).toBe('EXPIRED');
        expect(await h.statusOf(locked)).toBe('UPLOADED');

        // The holder wins the row: a discard is committed, and the next sweep must not turn it into EXPIRED.
        await holder.query(`UPDATE budget_attachments SET status = 'DISCARDED' WHERE id = $1`, [locked]);
        await holder.query('COMMIT');
      } finally {
        await holder.end();
      }
      await expiryService.expire(new Date(Date.now() + 8 * DAY));
      expect(await h.statusOf(locked)).toBe('DISCARDED');
      expect(await auditCount(locked, 'BUDGET_ATTACHMENT.EXPIRED')).toBe(0);
    });

    it('expires each file once when two instances sweep at the same time', async () => {
      const { head } = await waiting();
      const ids: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        ids.push(await h.uploaded({ ...SAMPLE_PDF, fileName: `bao-gia-${i}.pdf` }, head.account));
      }

      const future = new Date(Date.now() + 8 * DAY);
      const results = await Promise.all([expiryService.expire(future), expiryService.expire(future)]);
      expect(results.reduce((sum, result) => sum + result.expired, 0)).toBeGreaterThanOrEqual(6);
      for (const id of ids) {
        expect(await h.statusOf(id)).toBe('EXPIRED');
        expect(await auditCount(id, 'BUDGET_ATTACHMENT.EXPIRED')).toBe(1);
      }
    });

    it('stops after the limit of one pass', async () => {
      const { head } = await waiting();
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        ids.push(await h.uploaded({ ...SAMPLE_PDF, fileName: `limit-${i}.pdf` }, head.account));
      }

      const result = await expiryService.expire(new Date(Date.now() + 8 * DAY), 2);
      expect(result.expired).toBe(2);
      const statuses = await Promise.all(ids.map((id) => h.statusOf(id)));
      expect(statuses.filter((status) => status === 'EXPIRED')).toHaveLength(2);
      await expiryService.expire(new Date(Date.now() + 8 * DAY));
    });
  });
});
