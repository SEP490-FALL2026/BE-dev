import { Client } from 'pg';
import {
  AttachmentDataWire,
  BudgetAttachmentHarness,
  SAMPLE_PDF,
  SAMPLE_XLSX,
} from '../../support/budget-attachment-harness';
import { waitForLockWaiters } from '../../support/lock-wait';

const h = new BudgetAttachmentHarness();

describe('budget version attachments (integration, real PostgreSQL)', () => {
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
  });

  const waiting = async () => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-VA${counter}`);
    const proposal = await h.budgetProposed(unit.head, unit.department.unitId);
    const version = await h.built(proposal.id);
    return { ...unit, proposal, version };
  };

  it('allows Finance to declare and complete an attachment to a draft version (US-06-09 AC-24)', async () => {
    const { version } = await waiting();

    const declareRes = await h.declareVersionAttachment(version.id, SAMPLE_PDF).expect(201);
    expect(declareRes.header['cache-control']).toBe('no-store');
    const { attachment, upload } = h.dataOf<AttachmentDataWire>(declareRes);
    expect(attachment.status).toBe('AWAITING_UPLOAD');
    expect(attachment.target).toBe('VERSION');
    expect(attachment.versionId).toBe(version.id);
    // The wire is the link and how to use it: a signed link to the pending prefix, no token, no key.
    expect(upload?.method).toBe('PUT');
    expect(upload?.url).toContain('/upload/pending-documents/');
    expect(upload?.headers['Content-Type']).toBe(SAMPLE_PDF.contentType);
    expect(upload?.headers['Content-Length']).toBe(String(SAMPLE_PDF.sizeBytes));
    expect(upload).not.toHaveProperty('uploadToken');

    await h.putObject(attachment.id, {
      contentLength: attachment.sizeBytes,
      contentType: attachment.contentType,
    });

    const completeRes = await h.completeAttachment(attachment.id).expect(200);
    const completed = h.dataOf<AttachmentDataWire>(completeRes).attachment;
    expect(completed.status).toBe('ATTACHED');
    expect(completed.attachedAt).toBeTruthy();
    expect(completed.removedAt).toBeNull();

    const finalKey = await h.finalKeyOf(attachment.id);
    expect(finalKey).toMatch(/^budget-documents\/\d{4}\/\d{2}\//);
    expect(await h.storage.head(finalKey!)).not.toBeNull();
    // After the commit the upload is deleted; only the kept copy remains.
    expect(h.storage.objects.has(await h.keyOf(attachment.id))).toBe(false);

    // Verify version history entry ATTACHMENT_ADDED
    const historyRes = await h.versionHistory(version.id).expect(200);
    const entries = h.dataOf<{ items: Array<{ kind: string; changes: Array<{ field: string; after: string }> }> }>(
      historyRes,
    ).items;
    const addedEntry = entries.find((e) => e.kind === 'ATTACHMENT_ADDED');
    expect(addedEntry).toBeDefined();
    const fileNameChange = addedEntry?.changes.find((c) => c.field === 'fileName');
    expect(fileNameChange?.after).toBe(SAMPLE_PDF.fileName);
    const sizeChange = addedEntry?.changes.find((c) => c.field === 'sizeBytes');
    expect(sizeChange?.after).toBe(String(SAMPLE_PDF.sizeBytes));
  });

  it('refuses invalid file types or empty files at declaration (US-06-09 AC-24 refusal)', async () => {
    const { version } = await waiting();

    // Invalid extension
    const invalidTypeRes = await h
      .declareVersionAttachment(version.id, {
        fileName: 'malicious.exe',
        contentType: 'application/octet-stream',
        sizeBytes: 1024,
      })
      .expect(422);
    expect(h.errorOf(invalidTypeRes).code).toBe('BUDGET_ATTACHMENT.TYPE_NOT_ALLOWED');

    // Empty file
    const emptyRes = await h
      .declareVersionAttachment(version.id, {
        fileName: 'empty.pdf',
        contentType: 'application/pdf',
        sizeBytes: 0,
      })
      .expect(422);
    // A size below one byte is refused by the body itself (QĐ-98: `sizeBytes ≥ 1`).
    expect(h.errorOf(emptyRes).code).toBe('VALIDATION_ERROR');
  });

  it('refuses declaring attachments on a non-editable version', async () => {
    const { version } = await waiting();
    await h.sendVersion(version.id).expect(200);

    const res = await h.declareVersionAttachment(version.id, SAMPLE_PDF).expect(409);
    expect(h.errorOf(res).code).toBe('BUDGET.VERSION_NOT_EDITABLE');
  });

  it('allows Finance to remove an attachment and keeps the stored object (US-06-09 AC-26)', async () => {
    const { version } = await waiting();

    const declareRes = await h.declareVersionAttachment(version.id, SAMPLE_PDF).expect(201);
    const declaredId = h.dataOf<AttachmentDataWire>(declareRes).attachment.id;

    await h.putObject(declaredId, {
      contentLength: SAMPLE_PDF.sizeBytes,
      contentType: SAMPLE_PDF.contentType,
    });
    await h.completeAttachment(declaredId).expect(200);

    const finalKey = await h.finalKeyOf(declaredId);
    expect(finalKey).toBeTruthy();

    // Remove the attachment
    const removeRes = await h.removeVersionAttachment(version.id, declaredId).expect(200);
    const removed = h.dataOf<AttachmentDataWire>(removeRes).attachment;
    expect(removed.status).toBe('REMOVED');
    expect(removed.removedAt).toBeTruthy();
    expect(removed.removedBy?.employeeId).toBe(h.finance.employeeId);

    // Stored object is NOT deleted (AC-26)
    expect(await h.storage.head(finalKey!)).not.toBeNull();

    // History contains ATTACHMENT_REMOVED entry
    const historyRes = await h.versionHistory(version.id).expect(200);
    const entries = h.dataOf<{ items: Array<{ kind: string; changes: Array<{ field: string; after: string }> }> }>(
      historyRes,
    ).items;
    const removedEntry = entries.find((e) => e.kind === 'ATTACHMENT_REMOVED');
    expect(removedEntry).toBeDefined();
    const removedFileName = removedEntry?.changes.find((c) => c.field === 'fileName');
    expect(removedFileName?.after).toBe(SAMPLE_PDF.fileName);
    const stateChange = removedEntry?.changes.find((c) => c.field === 'state');
    expect(stateChange?.after).toBe('REMOVED');

    // Second removal returns 409 ALREADY_REMOVED
    const secondRemoveRes = await h.removeVersionAttachment(version.id, declaredId).expect(409);
    expect(h.errorOf(secondRemoveRes).code).toBe('BUDGET_ATTACHMENT.ALREADY_REMOVED');
  });

  it('refuses removal with wrong version path or when version is not editable', async () => {
    const v1 = await waiting();
    const v2 = await waiting();

    const declareRes = await h.declareVersionAttachment(v1.version.id, SAMPLE_PDF).expect(201);
    const declaredId = h.dataOf<AttachmentDataWire>(declareRes).attachment.id;
    await h.putObject(declaredId, { contentLength: SAMPLE_PDF.sizeBytes, contentType: SAMPLE_PDF.contentType });
    await h.completeAttachment(declaredId).expect(200);

    // Calling remove via v2 path -> 404 BUDGET_ATTACHMENT.NOT_FOUND
    const wrongPathRes = await h.removeVersionAttachment(v2.version.id, declaredId).expect(404);
    expect(h.errorOf(wrongPathRes).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');

    // Send v1 so it is no longer editable
    await h.sendVersion(v1.version.id).expect(200);

    // Calling remove when version is SENT -> 409 BUDGET.VERSION_NOT_EDITABLE
    const notEditableRes = await h.removeVersionAttachment(v1.version.id, declaredId).expect(409);
    expect(h.errorOf(notEditableRes).code).toBe('BUDGET.VERSION_NOT_EDITABLE');
  });

  it('quarantines upload when object content has mismatch (byte check / quarantine)', async () => {
    const { version } = await waiting();

    const declareRes = await h.declareVersionAttachment(version.id, SAMPLE_PDF).expect(201);
    const declaredId = h.dataOf<AttachmentDataWire>(declareRes).attachment.id;

    // Put object with mismatched content (e.g. invalid bytes that do not match %PDF-)
    const badBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    await h.putObject(declaredId, {
      contentLength: SAMPLE_PDF.sizeBytes,
      contentType: SAMPLE_PDF.contentType,
      content: badBytes,
    });

    const completeRes = await h.completeAttachment(declaredId).expect(422);
    expect(h.errorOf(completeRes).code).toBe('BUDGET_ATTACHMENT.UPLOAD_MISMATCH');

    expect(await h.statusOf(declaredId)).toBe('QUARANTINED');
  });

  it('returns 409 UPLOAD_PENDING when storage does not have the object yet', async () => {
    const { version } = await waiting();

    const declareRes = await h.declareVersionAttachment(version.id, SAMPLE_PDF).expect(201);
    const declaredId = h.dataOf<AttachmentDataWire>(declareRes).attachment.id;

    // Do NOT put object in storage
    const pendingRes = await h.completeAttachment(declaredId).expect(409);
    expect(h.errorOf(pendingRes).code).toBe('BUDGET_ATTACHMENT.UPLOAD_PENDING');
  });

  it('refuses complete when called by a different employee', async () => {
    const { version, head } = await waiting();

    // Declare with finance
    const declareRes = await h.declareVersionAttachment(version.id, SAMPLE_PDF, h.finance).expect(201);
    const declaredId = h.dataOf<AttachmentDataWire>(declareRes).attachment.id;
    await h.putObject(declaredId, { contentLength: SAMPLE_PDF.sizeBytes, contentType: SAMPLE_PDF.contentType });

    // Complete by somebody else: not the uploader, so there is no such file for them
    const forbiddenRes = await h.completeAttachment(declaredId, head.account).expect(404);
    expect(h.errorOf(forbiddenRes).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');
  });

  it('keeps the canonical type of the file when the client declares it in another case', async () => {
    const { version } = await waiting();

    const res = await h
      .declareVersionAttachment(version.id, { ...SAMPLE_PDF, contentType: 'Application/PDF' })
      .expect(201);
    const { attachment, upload } = h.dataOf<AttachmentDataWire>(res);
    expect(attachment.contentType).toBe('application/pdf');
    expect(upload?.headers['Content-Type']).toBe('application/pdf');
    expect(h.storage.uploadLinks.at(-1)?.contentType).toBe('application/pdf');

    await h.putObject(attachment.id, { contentLength: SAMPLE_PDF.sizeBytes, contentType: 'application/pdf' });
    await h.completeAttachment(attachment.id).expect(200);
  });

  it('gives up an upload older than 24 hours: 409 UPLOAD_EXPIRED once, then NOT_AWAITING_UPLOAD', async () => {
    const { version } = await waiting();
    const declared = h.dataOf<AttachmentDataWire>(await h.declareVersionAttachment(version.id, SAMPLE_PDF).expect(201));
    const key = await h.putObject(declared.attachment.id, {
      contentLength: SAMPLE_PDF.sizeBytes,
      contentType: SAMPLE_PDF.contentType,
    });
    await h.ageAttachment(declared.attachment.id, 25 * 60 * 60 * 1000);

    const first = await h.completeAttachment(declared.attachment.id).expect(409);
    expect(h.errorOf(first).code).toBe('BUDGET_ATTACHMENT.UPLOAD_EXPIRED');
    expect(await h.statusOf(declared.attachment.id)).toBe('EXPIRED');
    expect(h.storage.objects.has(key)).toBe(false);

    const second = await h.completeAttachment(declared.attachment.id).expect(409);
    expect(h.errorOf(second).code).toBe('BUDGET_ATTACHMENT.NOT_AWAITING_UPLOAD');
  });

  it('answers 503 and changes nothing while the storage is down (complete)', async () => {
    const { version } = await waiting();
    const declared = h.dataOf<AttachmentDataWire>(await h.declareVersionAttachment(version.id, SAMPLE_PDF).expect(201));
    await h.putObject(declared.attachment.id, {
      contentLength: SAMPLE_PDF.sizeBytes,
      contentType: SAMPLE_PDF.contentType,
    });

    h.storage.unavailable.add('head');
    try {
      const res = await h.completeAttachment(declared.attachment.id).expect(503);
      expect(h.errorOf(res).code).toBe('SERVICE_UNAVAILABLE');
    } finally {
      h.storage.unavailable.delete('head');
    }
    expect(await h.statusOf(declared.attachment.id)).toBe('AWAITING_UPLOAD');
    await h.completeAttachment(declared.attachment.id).expect(200);
  });

  it('refuses the 21st document of a version (limit) and accepts it again after one is removed', async () => {
    const { version } = await waiting();
    const ids: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      ids.push(await h.uploaded({ ...SAMPLE_PDF, fileName: `bao-gia-${i}.pdf` }, h.finance, { versionId: version.id }));
    }
    const refused = await h.declareVersionAttachment(version.id, SAMPLE_PDF).expect(409);
    expect(h.errorOf(refused).code).toBe('BUDGET_ATTACHMENT.LIMIT_REACHED');

    await h.removeVersionAttachment(version.id, ids[0]).expect(200);
    await h.uploaded(SAMPLE_PDF, h.finance, { versionId: version.id });
  });

  it('keeps import and documents apart: a spreadsheet attached to a version creates no line (US-06-09 AC-24)', async () => {
    const { version } = await waiting();
    const lines = async () =>
      Number(
        (
          await h.ctx.sql.query<{ n: string }>(`SELECT count(*) AS n FROM budget_version_lines WHERE version_id = $1`, [
            version.id,
          ])
        ).rows[0].n,
      );
    const before = await lines();

    await h.uploaded(SAMPLE_XLSX, h.finance, { versionId: version.id });
    expect(await lines()).toBe(before);

    const csv = ['cost_center_code,description,amount', `${version.costCenter.code},Imported one,1000`].join('\n');
    await h.importLines(version.id, csv).expect(201);
    expect(await lines()).toBe(before + 1);
  });

  /** A second connection discards the file in a transaction that is still open when the complete reaches its row. */
  const completeRacingADiscard = async (id: string) => {
    const holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    await holder.query('BEGIN');
    await holder.query(`SELECT id FROM budget_attachments WHERE id = $1 FOR UPDATE`, [id]);
    const complete = h.completeAttachment(id).then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);
    await holder.query(`UPDATE budget_attachments SET status = 'DISCARDED' WHERE id = $1`, [id]);
    await holder.query('COMMIT');
    await holder.end();

    return complete;
  };

  it('answers 409 NOT_AWAITING_UPLOAD, not 500, when a discard wins a race that would have quarantined the file', async () => {
    const { version } = await waiting();
    const declared = h.dataOf<AttachmentDataWire>(await h.declareVersionAttachment(version.id, SAMPLE_PDF).expect(201));
    const id = declared.attachment.id;
    await h.putObject(id, {
      contentLength: SAMPLE_PDF.sizeBytes,
      contentType: SAMPLE_PDF.contentType,
      content: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
    });

    const response = await completeRacingADiscard(id);
    expect(response.status).toBe(409);
    expect(h.errorOf(response).code).toBe('BUDGET_ATTACHMENT.NOT_AWAITING_UPLOAD');
    expect(await h.statusOf(id)).toBe('DISCARDED');
  });

  it('takes its copy back when a discard wins the race for a good upload: no orphan under budget-documents/', async () => {
    const { version } = await waiting();
    const declared = h.dataOf<AttachmentDataWire>(await h.declareVersionAttachment(version.id, SAMPLE_PDF).expect(201));
    const id = declared.attachment.id;
    await h.putObject(id, { contentLength: SAMPLE_PDF.sizeBytes, contentType: SAMPLE_PDF.contentType });

    const copiedBefore = h.storage.copied.length;
    const response = await completeRacingADiscard(id);
    expect(response.status).toBe(409);
    expect(h.errorOf(response).code).toBe('BUDGET_ATTACHMENT.NOT_AWAITING_UPLOAD');
    const copies = h.storage.copied.slice(copiedBefore);
    expect(copies).toHaveLength(1);
    expect(copies[0].to).toMatch(/^budget-documents\//);
    expect(h.storage.objects.has(copies[0].to)).toBe(false);
    expect(await h.finalKeyOf(id)).toBeNull();
  });
});
