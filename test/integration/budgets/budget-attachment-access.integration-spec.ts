import type { ApiAccount } from '../../support/api-accounts';
import {
  AttachmentDataWire,
  AttachmentLinkDataWire,
  AttachmentListDataWire,
  BudgetAttachmentHarness,
  SAMPLE_PDF,
  SAMPLE_XLSX,
} from '../../support/budget-attachment-harness';
import type { Person } from '../../support/request-harness';

const h = new BudgetAttachmentHarness();

const pdf = (fileName: string) => ({ ...SAMPLE_PDF, fileName });

describe('budget attachment access rules (integration)', () => {
  let counter = 0;
  let spendingApprover: Person;
  let superAdmin: ApiAccount;

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    const boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1'));
    await h.setRole('SPENDING_APPROVER', boss);
    spendingApprover = boss;
    superAdmin = {
      appUserId: h.seed.superAdmin.appUserId,
      employeeId: h.seed.superAdmin.employeeId,
      email: h.seed.superAdmin.email,
      accessToken: h.admin,
    };
  }, 240000);

  afterAll(async () => {
    await h.stop();
  }, 120000);

  /** A department with its head and a member, a proposal sent (with `proposalDocs` documents of the head) and a version built from it. */
  const waiting = async (proposalDocs: string[] = []) => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-AC${counter}`);
    const documents: string[] = [];
    for (const name of proposalDocs) documents.push(await h.uploaded(pdf(name), unit.head.account));
    const response = await h
      .submitProposal({ ...h.proposalBody(unit.department.unitId), attachmentIds: documents }, unit.head.account)
      .expect(201);
    const proposal = h.dataOf<{ proposal: { id: string } }>(response).proposal;
    const version = await h.built(proposal.id);

    return { ...unit, proposal, version, documents };
  };

  const listIds = async (versionId: string, account: ApiAccount) =>
    h.dataOf<AttachmentListDataWire>(await h.listVersionAttachments(versionId, '', account).expect(200)).items;

  const attach = (versionId: string, fileName: string) => h.uploaded(pdf(fileName), h.finance, { versionId });

  describe('the documents of a version (US-06-09 AC-25, D-S15)', () => {
    it('hides the documents of a version Finance has not sent yet from the head, and shows them to Finance and the approver', async () => {
      const { head, version } = await waiting();
      const docId = await attach(version.id, 'unsent.pdf');

      const listRes = await h.listVersionAttachments(version.id, '', head.account).expect(404);
      expect(h.errorOf(listRes).code).toBe('BUDGET.VERSION_NOT_FOUND');
      expect(JSON.stringify(listRes.body)).not.toContain('unsent.pdf');
      const linkRes = await h.linkAttachment(docId, head.account).expect(404);
      expect(h.errorOf(linkRes).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');

      for (const account of [h.finance, spendingApprover.account]) {
        expect((await listIds(version.id, account)).map((item) => item.id)).toEqual([docId]);
      }

      // Once it is sent, the head sees it.
      await h.sendVersion(version.id).expect(200);
      expect((await listIds(version.id, head.account)).map((item) => item.id)).toEqual([docId]);
      await h.linkAttachment(docId, head.account).expect(200);
    });

    it('lets Finance, the approver and the head read and download, and nobody else, with a 300-second link', async () => {
      const { head, member, department, version } = await waiting();
      const docId = await attach(version.id, 'bao-gia.pdf');
      await h.sendVersion(version.id).expect(200);
      const otherUnit = await h.departmentWithHead(`P-OT${(counter += 1)}`);
      const itAdmin = h.it1;

      for (const account of [h.finance, spendingApprover.account, head.account]) {
        const items = await listIds(version.id, account);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ id: docId, fileName: 'bao-gia.pdf', status: 'ATTACHED', removedAt: null });

        const link = await h.linkAttachment(docId, account).expect(200);
        expect(link.header['cache-control']).toBe('no-store');
        const wire = h.dataOf<AttachmentLinkDataWire>(link);
        const issued = h.storage.downloadLinks.at(-1)!;
        expect(issued).toMatchObject({
          key: (await h.finalKeyOf(docId))!,
          fileName: 'bao-gia.pdf',
          contentType: SAMPLE_PDF.contentType,
          expiresInSeconds: 300,
          url: wire.url,
        });
        expect(Math.abs(new Date(wire.expiresAt).getTime() - (Date.now() + 300_000))).toBeLessThan(10_000);
        // The link opens the bytes now and nothing 301 seconds later.
        expect(h.storage.open(wire.url)).toBeDefined();
        expect(() => h.storage.open(wire.url, new Date(Date.now() + 301_000))).toThrow('expired');
      }

      // The head of another Cost Center: 404 in both calls, never the name of the file.
      const otherList = await h.listVersionAttachments(version.id, '', otherUnit.head.account).expect(404);
      expect(h.errorOf(otherList).code).toBe('BUDGET.VERSION_NOT_FOUND');
      expect(JSON.stringify(otherList.body)).not.toContain('bao-gia.pdf');
      await h.linkAttachment(docId, otherUnit.head.account).expect(404);

      // IT Admin, Super Admin and an Employee read no list (403) and guess no link (404).
      for (const account of [itAdmin, superAdmin, member.account]) {
        const refused = await h.listVersionAttachments(version.id, '', account).expect(403);
        expect(h.errorOf(refused).code).toBe('AUTHORIZATION.FORBIDDEN');
        const hidden = await h.linkAttachment(docId, account).expect(404);
        expect(h.errorOf(hidden).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');
      }

      // The head changes: the new head reads it from the next call, the old one no more.
      const successor = await h.staff(department, `AC-S${counter}`);
      await h.replaceHead(department, successor);
      expect((await listIds(version.id, successor.account)).map((item) => item.id)).toEqual([docId]);
      await h.linkAttachment(docId, successor.account).expect(200);
      await h.listVersionAttachments(version.id, '', head.account).expect(403);
      await h.linkAttachment(docId, head.account).expect(404);
    });

    it.each(['APPROVED', 'REJECTED', 'SUPERSEDED'] as const)(
      'still shows the head the documents of a sent version that became %s',
      async (state) => {
        const { head, version } = await waiting();
        const docId = await attach(version.id, 'bao-gia.pdf');
        await h.sendVersion(version.id).expect(200);
        if (state === 'APPROVED') {
          await h.decideVersion(version.id, { decision: 'APPROVE' }, spendingApprover.account).expect(200);
        } else if (state === 'REJECTED') {
          await h
            .decideVersion(version.id, { decision: 'REJECT', reason: 'Too high' }, spendingApprover.account)
            .expect(200);
        } else {
          await h.makeCurrent(version.id);
          await h.ctx.sql.query(`UPDATE budget_versions SET state = 'SUPERSEDED' WHERE id = $1`, [version.id]);
        }

        expect((await listIds(version.id, head.account)).map((item) => item.id)).toEqual([docId]);
        await h.linkAttachment(docId, head.account).expect(200);
      },
    );
  });

  describe('the documents of the latest send (D-S24)', () => {
    it('shows the head only the documents of the latest send while the version is back with Finance, then the new set after a resend', async () => {
      const { head, version } = await waiting();

      // A and B are attached; B is removed before the send, so it was never part of what the head was sent.
      const a = await attach(version.id, 'a.pdf');
      const b = await attach(version.id, 'b.pdf');
      await h.removeVersionAttachment(version.id, b).expect(200);
      await h.sendVersion(version.id).expect(200);
      await h
        .decideVersion(version.id, { decision: 'REQUEST_CHANGES', reason: 'Please revise' }, spendingApprover.account)
        .expect(200);

      // Back with Finance: C is added, A is removed.
      const c = await attach(version.id, 'c.pdf');
      await h.removeVersionAttachment(version.id, a).expect(200);

      // The head sees exactly what was sent: A (as it was then), not B, not C.
      const headItems = await listIds(version.id, head.account);
      expect(headItems.map((item) => [item.id, item.status, item.removedAt])).toEqual([[a, 'ATTACHED', null]]);
      await h.linkAttachment(a, head.account).expect(200);
      for (const hidden of [b, c]) {
        const res = await h.linkAttachment(hidden, head.account).expect(404);
        expect(h.errorOf(res).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');
      }

      // Finance and the approver see everything, with what became of each.
      for (const account of [h.finance, spendingApprover.account]) {
        const items = await listIds(version.id, account);
        expect(new Map(items.map((item) => [item.id, item.status]))).toEqual(
          new Map([
            [a, 'REMOVED'],
            [b, 'REMOVED'],
            [c, 'ATTACHED'],
          ]),
        );
      }

      // Sent again: the head sees the new set, which is exactly C.
      await h.sendVersion(version.id).expect(200);
      expect((await listIds(version.id, head.account)).map((item) => [item.id, item.status])).toEqual([
        [c, 'ATTACHED'],
      ]);
      await h.linkAttachment(c, head.account).expect(200);
      for (const gone of [a, b]) await h.linkAttachment(gone, head.account).expect(404);
    });

    it('pages the list in the order they were attached and counts the total the same on every page', async () => {
      const { version } = await waiting();
      const ids: string[] = [];
      for (const name of ['p1.pdf', 'p2.pdf', 'p3.pdf']) ids.push(await attach(version.id, name));

      const first = h.dataOf<AttachmentListDataWire>(
        await h.listVersionAttachments(version.id, '?page=1&pageSize=2').expect(200),
      );
      const second = h.dataOf<AttachmentListDataWire>(
        await h.listVersionAttachments(version.id, '?page=2&pageSize=2').expect(200),
      );
      expect([...first.items, ...second.items].map((item) => item.id)).toEqual(ids);
      expect(first.pagination.totalItems).toBe(3);
      expect(second.pagination.totalItems).toBe(3);
    });
  });

  describe('the documents of a proposal (US-06-10 AC-15)', () => {
    it('lets the head, Finance and the approver read and download, and no one else', async () => {
      const { head, member, department, proposal, documents } = await waiting(['bao-gia.pdf']);
      const otherUnit = await h.departmentWithHead(`P-OT${(counter += 1)}`);

      for (const account of [head.account, h.finance, spendingApprover.account]) {
        const listed = h.dataOf<AttachmentListDataWire>(
          await h.listProposalAttachments(proposal.id, '', account).expect(200),
        );
        expect(listed.items.map((item) => [item.id, item.fileName])).toEqual([[documents[0], 'bao-gia.pdf']]);
        const link = await h.linkAttachment(documents[0], account).expect(200);
        expect(h.storage.open(h.dataOf<AttachmentLinkDataWire>(link).url)).toBeDefined();
      }

      // The head of another department, IT Admin, Super Admin and an Employee: 404, never the name of the file.
      for (const account of [otherUnit.head.account, h.it1, superAdmin, member.account]) {
        const list = await h.listProposalAttachments(proposal.id, '', account).expect(404);
        expect(JSON.stringify(list.body)).not.toContain('bao-gia.pdf');
        const link = await h.linkAttachment(documents[0], account).expect(404);
        expect(h.errorOf(link).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');
      }

      // The head changes: the successor reads from the next call, the former head no more.
      const successor = await h.staff(department, `AC-P${counter}`);
      await h.replaceHead(department, successor);
      await h.listProposalAttachments(proposal.id, '', successor.account).expect(200);
      await h.linkAttachment(documents[0], successor.account).expect(200);
      await h.listProposalAttachments(proposal.id, '', head.account).expect(404);
      await h.linkAttachment(documents[0], head.account).expect(404);
    });
  });

  describe('the approver reads the documents of a version and of its proposal (US-06-11 AC-11)', () => {
    it('lists and downloads both, leaves the figures alone, and may not write', async () => {
      const { version, proposal, documents } = await waiting(['nhu-cau.pdf']);
      const versionDoc = await attach(version.id, 'bao-gia-figma.pdf');
      await h.sendVersion(version.id).expect(200);
      const before = (await h.versionOf(version.id, spendingApprover.account).expect(200)).body as unknown;

      const approver = spendingApprover.account;
      expect((await listIds(version.id, approver)).map((item) => item.fileName)).toEqual(['bao-gia-figma.pdf']);
      const proposalDocs = h.dataOf<AttachmentListDataWire>(
        await h.listProposalAttachments(proposal.id, '', approver).expect(200),
      );
      expect(proposalDocs.items.map((item) => item.fileName)).toEqual(['nhu-cau.pdf']);
      await h.linkAttachment(versionDoc, approver).expect(200);
      await h.linkAttachment(documents[0], approver).expect(200);
      expect((await h.versionOf(version.id, spendingApprover.account).expect(200)).body).toEqual(before);

      // Reading is all the approver does with documents: no declaring, no removing.
      for (const refused of [
        h.declareVersionAttachment(version.id, SAMPLE_PDF, approver),
        h.declareProposalAttachment(SAMPLE_PDF, approver),
        h.removeVersionAttachment(version.id, versionDoc, approver),
      ]) {
        const res = await refused.expect(403);
        expect(h.errorOf(res).code).toBe('AUTHORIZATION.FORBIDDEN');
      }
      expect(await h.statusOf(versionDoc)).toBe('ATTACHED');
    });
  });

  describe("a document that is not attached yet is its uploader's alone", () => {
    it('lets only the uploader link a kept (UPLOADED) file and nobody a file that has no kept copy', async () => {
      const w = await waiting();
      const other = await h.departmentWithHead(`P-OT${(counter += 1)}`);
      const uploaded = await h.uploaded(SAMPLE_PDF, w.head.account);

      await h.linkAttachment(uploaded, w.head.account).expect(200);
      // Another head, Finance and the approver are not readers of an unsent file: a guessed id is 404.
      for (const account of [other.head.account, h.finance, spendingApprover.account, superAdmin]) {
        const res = await h.linkAttachment(uploaded, account).expect(404);
        expect(h.errorOf(res).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');
      }

      // The uploader's own files that were never kept: still 404.
      const awaiting = h.dataOf<AttachmentDataWire>(
        await h.declareProposalAttachment(SAMPLE_PDF, w.head.account).expect(201),
      ).attachment.id;
      const quarantined = h.dataOf<AttachmentDataWire>(
        await h.declareProposalAttachment(pdf('bad.pdf'), w.head.account).expect(201),
      ).attachment.id;
      await h.putObject(quarantined, {
        contentLength: SAMPLE_PDF.sizeBytes,
        contentType: SAMPLE_PDF.contentType,
        content: new Uint8Array([0x00, 0x01]),
      });
      await h.completeAttachment(quarantined, w.head.account).expect(422);
      const expired = h.dataOf<AttachmentDataWire>(
        await h.declareProposalAttachment(SAMPLE_XLSX, w.head.account).expect(201),
      ).attachment.id;
      await h.ageAttachment(expired, 25 * 60 * 60 * 1000);
      await h.completeAttachment(expired, w.head.account).expect(409);
      const discarded = await h.uploaded(pdf('gone.pdf'), w.head.account);
      await h.discardAttachment(discarded, w.head.account).expect(200);

      expect(await h.statusOf(quarantined)).toBe('QUARANTINED');
      expect(await h.statusOf(expired)).toBe('EXPIRED');
      for (const id of [awaiting, quarantined, expired, discarded]) {
        const res = await h.linkAttachment(id, w.head.account).expect(404);
        expect(h.errorOf(res).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');
      }
    });

    it('keeps the files of one head out of the "mine" list and the complete of another', async () => {
      const w = await waiting();
      const other = await h.departmentWithHead(`P-OT${(counter += 1)}`);
      const uploaded = await h.uploaded(SAMPLE_PDF, w.head.account);

      const mine = h.dataOf<{ items: { id: string }[] }>(await h.listMineUploads('', other.head.account).expect(200));
      expect(mine.items.map((item) => item.id)).not.toContain(uploaded);
      const res = await h.completeAttachment(uploaded, other.head.account).expect(404);
      expect(h.errorOf(res).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');
    });

    it('answers 503 and leaves the document alone while the storage cannot sign the download link', async () => {
      const { version } = await waiting();
      const docId = await attach(version.id, 'bao-gia.pdf');

      h.storage.unavailable.add('createDownloadUrl');
      try {
        const res = await h.linkAttachment(docId, h.finance).expect(503);
        expect(h.errorOf(res).code).toBe('SERVICE_UNAVAILABLE');
      } finally {
        h.storage.unavailable.delete('createDownloadUrl');
      }
      expect(await h.statusOf(docId)).toBe('ATTACHED');
    });
  });
});
