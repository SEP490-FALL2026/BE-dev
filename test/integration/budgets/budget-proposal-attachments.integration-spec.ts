import { Client } from 'pg';
import request from 'supertest';
import {
  AttachmentDataWire,
  AttachmentListDataWire,
  BudgetAttachmentHarness,
  SAMPLE_PDF,
  SAMPLE_XLSX,
  UploadListDataWire,
} from '../../support/budget-attachment-harness';
import { waitForLockWaiters } from '../../support/lock-wait';

const h = new BudgetAttachmentHarness();

describe('budget proposal attachments (integration, real PostgreSQL)', () => {
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    const boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1'));
    await h.setRole('SPENDING_APPROVER', boss);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  }, 120000);

  const waiting = async () => {
    counter += 1;
    return h.departmentWithHead(`P-PA${counter}`);
  };

  const submitted = async (w: Awaited<ReturnType<typeof waiting>>, attachmentIds: string[]) => {
    const res = await h
      .submitProposal({ ...h.proposalBody(w.department.unitId), attachmentIds }, w.head.account)
      .expect(201);

    return h.dataOf<{ proposal: { id: string } }>(res).proposal.id;
  };

  it('allows the head to declare, complete and send a proposal with two documents (US-06-10 AC-14)', async () => {
    const w = await waiting();

    const declareRes = await h.declareProposalAttachment(SAMPLE_PDF, w.head.account).expect(201);
    expect(declareRes.header['cache-control']).toBe('no-store');
    const { attachment, upload } = h.dataOf<AttachmentDataWire>(declareRes);
    expect(attachment.status).toBe('AWAITING_UPLOAD');
    expect(attachment.target).toBe('PROPOSAL');
    expect(attachment.proposalId).toBeNull();
    // The wire is the link and how to use it: no token, no key of the storage.
    expect(upload?.method).toBe('PUT');
    expect(upload?.url).toContain('/upload/pending-documents/');
    expect(upload?.headers).toEqual({
      'Content-Type': SAMPLE_PDF.contentType,
      'Content-Length': String(SAMPLE_PDF.sizeBytes),
    });
    expect(upload).not.toHaveProperty('uploadToken');

    await h.putObject(attachment.id, { contentLength: attachment.sizeBytes, contentType: attachment.contentType });
    const completeRes = await h.completeAttachment(attachment.id, w.head.account).expect(200);
    expect(h.dataOf<AttachmentDataWire>(completeRes).attachment.status).toBe('UPLOADED');
    // The bytes that were looked at are kept under their own prefix; the upload is gone after the commit.
    const finalKey = await h.finalKeyOf(attachment.id);
    expect(finalKey).toMatch(/^budget-documents\/\d{4}\/\d{2}\//);
    expect(h.storage.objects.has(finalKey!)).toBe(true);
    expect(h.storage.objects.has(await h.keyOf(attachment.id))).toBe(false);

    const second = await h.uploaded(SAMPLE_XLSX, w.head.account);
    const proposalId = await submitted(w, [attachment.id, second]);

    for (const id of [attachment.id, second]) {
      const row = (
        await h.ctx.sql.query<{ status: string; proposal_id: string; attached_at: string }>(
          `SELECT status, proposal_id, attached_at FROM budget_attachments WHERE id = $1`,
          [id],
        )
      ).rows[0];
      expect(row.status).toBe('ATTACHED');
      expect(row.proposal_id).toBe(proposalId);
      expect(row.attached_at).toBeTruthy();
    }
    // Exactly the lines the head typed: the documents are not read into lines.
    expect(
      Number(
        (
          await h.ctx.sql.query<{ n: string }>(
            `SELECT count(*) AS n FROM budget_proposal_lines WHERE proposal_id = $1`,
            [proposalId],
          )
        ).rows[0].n,
      ),
    ).toBe(2);
    const events = await h.ctx.sql.query<{ n: string }>(
      `SELECT count(*) AS n FROM audit_events WHERE action = 'BUDGET_ATTACHMENT.ATTACHED' AND resource_id = ANY($1::text[])`,
      [[attachment.id, second]],
    );
    expect(Number(events.rows[0].n)).toBe(2);

    // Finance reads the list of the proposal.
    const listed = h.dataOf<AttachmentListDataWire>(
      await h.listProposalAttachments(proposalId, '', h.finance).expect(200),
    );
    expect(listed.items.map((item) => item.id).sort()).toEqual([attachment.id, second].sort());
    expect(listed.items.every((item) => item.status === 'ATTACHED')).toBe(true);
  });

  it('refuses a send that names a document that cannot be attached, lists exactly those, and creates nothing (AC-14 refusal)', async () => {
    const w = await waiting();
    const other = await waiting();

    const good = await h.uploaded(SAMPLE_PDF, w.head.account);
    const awaiting = h.dataOf<AttachmentDataWire>(
      await h.declareProposalAttachment(SAMPLE_PDF, w.head.account).expect(201),
    ).attachment.id;
    const someoneElses = await h.uploaded(SAMPLE_PDF, other.head.account);
    const alreadyAttached = await h.uploaded(SAMPLE_PDF, w.head.account);
    // That proposal is given back, so the head may send again: the retry names every kind of document that cannot be attached.
    const pr1 = await submitted(w, [alreadyAttached]);
    await h.giveBack(pr1, { reason: 'Add the quotes' }, h.finance).expect(200);
    const ofAVersion = await (async () => {
      const proposal = await h.budgetProposed(other.head, other.department.unitId);
      const version = await h.built(proposal.id);
      return h.uploaded(SAMPLE_PDF, h.finance, { versionId: version.id });
    })();
    const unknown = '9b1d6a3e-4c2f-4d8a-9e51-7a3b2c1d0e9f';

    const proposalsBefore = await h.budgetRows('budget_proposals');
    const badIds = [someoneElses, awaiting, alreadyAttached, ofAVersion, unknown];
    const res = await h
      .resubmit(pr1, { lines: [h.line()], attachmentIds: [good, ...badIds] }, w.head.account)
      .expect(422);
    const error = h.errorOf(res);
    expect(error.code).toBe('BUDGET_ATTACHMENT.NOT_ATTACHABLE');
    expect((error.details as { attachmentIds: string[] }).attachmentIds.slice().sort()).toEqual(badIds.slice().sort());

    // Nothing was made, and the valid document is still waiting for a send.
    expect(await h.budgetRows('budget_proposals')).toBe(proposalsBefore);
    expect(await h.statusOf(good)).toBe('UPLOADED');
    expect(await h.statusOf(awaiting)).toBe('AWAITING_UPLOAD');
  });

  it('refuses the documents of another head, in both directions (AC-14, head of another Cost Center)', async () => {
    const u1 = await waiting();
    const u2 = await waiting();

    // Declaring is allowed for any head: a proposal file is not tied to a Cost Center until it is sent.
    const u2File = await h.uploaded(SAMPLE_PDF, u2.head.account);
    const u1File = await h.uploaded(SAMPLE_XLSX, u1.head.account);

    for (const [sender, file] of [
      [u1, u2File],
      [u2, u1File],
    ] as const) {
      const res = await h
        .submitProposal({ ...h.proposalBody(sender.department.unitId), attachmentIds: [file] }, sender.head.account)
        .expect(422);
      expect(h.errorOf(res).code).toBe('BUDGET_ATTACHMENT.NOT_ATTACHABLE');
      expect((h.errorOf(res).details as { attachmentIds: string[] }).attachmentIds).toEqual([file]);
    }
    expect(await h.statusOf(u2File)).toBe('UPLOADED');
    expect(await h.statusOf(u1File)).toBe('UPLOADED');
  });

  it('keeps the documents of a sent proposal fixed: no route, no reuse in a resubmission (US-06-10 AC-16)', async () => {
    const w = await waiting();
    const first = await h.uploaded(SAMPLE_PDF, w.head.account);
    const pr1 = await submitted(w, [first]);

    // There is no route that adds or removes the documents of a proposal.
    const server = h.server();
    await request(server)
      .post(`/api/v1/budget-proposals/${pr1}/attachments`)
      .set(h.as(w.head.account))
      .send({})
      .expect(404);
    await request(server)
      .delete(`/api/v1/budget-proposals/${pr1}/attachments/${first}`)
      .set(h.as(w.head.account))
      .expect(404);

    // Finance gives it back; the document is not offered again by the resubmission.
    await h.giveBack(pr1, { reason: 'Add the quotes' }, h.finance).expect(200);
    const reuse = await h.resubmit(pr1, { lines: [h.line()], attachmentIds: [first] }, w.head.account).expect(422);
    expect(h.errorOf(reuse).code).toBe('BUDGET_ATTACHMENT.NOT_ATTACHABLE');

    const fresh = await h.uploaded(SAMPLE_XLSX, w.head.account);
    const again = await h.resubmit(pr1, { lines: [h.line()], attachmentIds: [fresh] }, w.head.account).expect(201);
    const pr2 = h.dataOf<{ proposal: { id: string } }>(again).proposal.id;
    expect(pr2).not.toBe(pr1);

    // The new proposal has the new document; the old one keeps its own.
    const rows = await h.ctx.sql.query<{ id: string; proposal_id: string }>(
      `SELECT id, proposal_id FROM budget_attachments WHERE id = ANY($1::uuid[])`,
      [[first, fresh]],
    );
    expect(new Map(rows.rows.map((row) => [row.id, row.proposal_id]))).toEqual(
      new Map([
        [first, pr1],
        [fresh, pr2],
      ]),
    );
  });

  it('refuses to move a document to another proposal in SQL (AC-16: proposal_id is set once)', async () => {
    const w = await waiting();
    const file = await h.uploaded(SAMPLE_PDF, w.head.account);
    const pr1 = await submitted(w, [file]);
    const other = await waiting();
    const otherProposal = await h.budgetProposed(other.head, other.department.unitId);

    await expect(
      h.ctx.sql.query(`UPDATE budget_attachments SET proposal_id = $2 WHERE id = $1`, [file, otherProposal.id]),
    ).rejects.toMatchObject({ code: '55000' });
    expect(
      (
        await h.ctx.sql.query<{ proposal_id: string }>(`SELECT proposal_id FROM budget_attachments WHERE id = $1`, [
          file,
        ])
      ).rows[0].proposal_id,
    ).toBe(pr1);
  });

  it('still sends a proposal without documents as before, with or without an empty list', async () => {
    for (const extra of [{}, { attachmentIds: [] }]) {
      const w = await waiting();
      const res = await h
        .submitProposal({ ...h.proposalBody(w.department.unitId), ...extra }, w.head.account)
        .expect(201);
      expect(h.dataOf<{ proposal: { id: string } }>(res).proposal.id).toBeTruthy();
    }
  });

  it('lets the uploader list and discard unattached documents, deletes both objects, and frees the slot (Task 7)', async () => {
    const w = await waiting();

    const kept = await h.uploaded(SAMPLE_XLSX, w.head.account);
    const keptFinal = (await h.finalKeyOf(kept))!;
    const waitingId = h.dataOf<AttachmentDataWire>(
      await h.declareProposalAttachment(SAMPLE_PDF, w.head.account).expect(201),
    ).attachment.id;
    const waitingKey = await h.putObject(waitingId, {
      contentLength: SAMPLE_PDF.sizeBytes,
      contentType: SAMPLE_PDF.contentType,
    });

    const mine = h.dataOf<UploadListDataWire>(await h.listMineUploads('', w.head.account).expect(200));
    expect(mine.items.map((item) => [item.id, item.status]).sort()).toEqual(
      [
        [kept, 'UPLOADED'],
        [waitingId, 'AWAITING_UPLOAD'],
      ].sort(),
    );
    expect(mine.items.every((item) => new Date(item.expiresAt).getTime() > Date.now())).toBe(true);

    const discarded = await h.discardAttachment(kept, w.head.account).expect(200);
    expect(h.dataOf<AttachmentDataWire>(discarded).attachment.status).toBe('DISCARDED');
    expect(await h.statusOf(kept)).toBe('DISCARDED');
    expect(h.storage.objects.has(keptFinal)).toBe(false);
    await h.discardAttachment(waitingId, w.head.account).expect(200);
    // An upload that was put but not yet looked at goes with its row.
    expect(h.storage.objects.has(waitingKey)).toBe(false);

    const after = h.dataOf<UploadListDataWire>(await h.listMineUploads('', w.head.account).expect(200));
    expect(after.items).toEqual([]);
    expect(
      Number(
        (
          await h.ctx.sql.query<{ n: string }>(
            `SELECT count(*) AS n FROM audit_events WHERE action = 'BUDGET_ATTACHMENT.DISCARDED' AND resource_id = ANY($1::text[])`,
            [[kept, waitingId]],
          )
        ).rows[0].n,
      ),
    ).toBe(2);

    const again = await h.discardAttachment(kept, w.head.account).expect(409);
    expect(h.errorOf(again).code).toBe('BUDGET_ATTACHMENT.NOT_DISCARDABLE');
    expect((h.errorOf(again).details as { status: string }).status).toBe('DISCARDED');
  });

  it("refuses to discard a document that is not the caller's or is already attached", async () => {
    const u1 = await waiting();
    const u2 = await waiting();

    const file = h.dataOf<AttachmentDataWire>(
      await h.declareProposalAttachment(SAMPLE_PDF, u1.head.account).expect(201),
    ).attachment.id;
    const res = await h.discardAttachment(file, u2.head.account).expect(404);
    expect(h.errorOf(res).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');
    expect(await h.statusOf(file)).toBe('AWAITING_UPLOAD');

    const attached = await h.uploaded(SAMPLE_PDF, u1.head.account);
    await submitted(u1, [attached]);
    const refused = await h.discardAttachment(attached, u1.head.account).expect(409);
    expect(h.errorOf(refused).code).toBe('BUDGET_ATTACHMENT.NOT_DISCARDABLE');
    expect(await h.statusOf(attached)).toBe('ATTACHED');
  });

  it('refuses the 21st unattached document of one person and accepts it after a discard (limit)', async () => {
    const w = await waiting();
    const ids: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const res = await h
        .declareProposalAttachment({ ...SAMPLE_PDF, fileName: `bao-gia-${i}.pdf` }, w.head.account)
        .expect(201);
      ids.push(h.dataOf<AttachmentDataWire>(res).attachment.id);
    }
    const refused = await h.declareProposalAttachment(SAMPLE_PDF, w.head.account).expect(409);
    expect(h.errorOf(refused).code).toBe('BUDGET_ATTACHMENT.LIMIT_REACHED');

    await h.discardAttachment(ids[0], w.head.account).expect(200);
    await h.declareProposalAttachment(SAMPLE_PDF, w.head.account).expect(201);
  });

  it('serialises two declarations of one person at the limit: one wins, never a 21st (race)', async () => {
    const w = await waiting();
    for (let i = 0; i < 19; i += 1) {
      await h.declareProposalAttachment({ ...SAMPLE_PDF, fileName: `bao-gia-${i}.pdf` }, w.head.account).expect(201);
    }
    // A second connection holds the advisory lock the declarations take, so both calls queue behind it.
    const holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    await holder.query('BEGIN');
    await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `budget-attachment-uploader:${w.head.employeeId}`,
    ]);
    const calls = [
      h.declareProposalAttachment(SAMPLE_PDF, w.head.account).then((response) => response),
      h.declareProposalAttachment(SAMPLE_XLSX, w.head.account).then((response) => response),
    ];
    await waitForLockWaiters(h.ctx.sql, 2);
    await holder.query('COMMIT');
    await holder.end();

    const statuses = (await Promise.all(calls)).map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(
      Number(
        (
          await h.ctx.sql.query<{ n: string }>(
            `SELECT count(*) AS n FROM budget_attachments WHERE uploaded_by_employee_id = $1 AND status IN ('AWAITING_UPLOAD','UPLOADED')`,
            [w.head.employeeId],
          )
        ).rows[0].n,
      ),
    ).toBe(20);
  });

  it('lets one side win when a discard races a send: never ATTACHED and DISCARDED at once (race)', async () => {
    const w = await waiting();
    const file = await h.uploaded(SAMPLE_PDF, w.head.account);

    // Another connection discards the file in a transaction that is still open when the send reaches the row.
    const holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    await holder.query('BEGIN');
    await holder.query(`SELECT id FROM budget_attachments WHERE id = $1 FOR UPDATE`, [file]);
    const send = h
      .submitProposal({ ...h.proposalBody(w.department.unitId), attachmentIds: [file] }, w.head.account)
      .then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);
    await holder.query(`UPDATE budget_attachments SET status = 'DISCARDED' WHERE id = $1`, [file]);
    await holder.query('COMMIT');
    await holder.end();

    const response = await send;
    expect(response.status).toBe(422);
    expect(h.errorOf(response).code).toBe('BUDGET_ATTACHMENT.NOT_ATTACHABLE');
    expect(await h.statusOf(file)).toBe('DISCARDED');
  });
});
