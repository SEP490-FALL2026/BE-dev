import { AttachmentDataWire, BudgetAttachmentHarness, SAMPLE_PDF } from '../../support/budget-attachment-harness';

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
    expect(upload?.uploadToken).toBeTruthy();

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
    expect(finalKey).toBeTruthy();
    expect(await h.storage.head(finalKey!)).not.toBeNull();

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
    expect(h.errorOf(emptyRes).code).toBe('BUDGET_ATTACHMENT.FILE_INVALID');
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
    const { version, department } = await waiting();
    const otherFinance = await h.staff(department, 'FIN-O2', ['FINANCE']);

    // Declare with finance
    const declareRes = await h.declareVersionAttachment(version.id, SAMPLE_PDF, h.finance).expect(201);
    const declaredId = h.dataOf<AttachmentDataWire>(declareRes).attachment.id;
    await h.putObject(declaredId, { contentLength: SAMPLE_PDF.sizeBytes, contentType: SAMPLE_PDF.contentType });

    // Complete with other finance
    const forbiddenRes = await h.completeAttachment(declaredId, otherFinance.account).expect(404);
    expect(h.errorOf(forbiddenRes).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');
  });
});
