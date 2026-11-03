import {
  AttachmentDataWire,
  AttachmentListDataWire,
  BudgetAttachmentHarness,
  SAMPLE_PDF,
  SAMPLE_XLSX,
} from '../../support/budget-attachment-harness';

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
  });

  const waiting = async () => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-PA${counter}`);
    return unit;
  };

  it('allows head of department to declare, complete and submit proposal with attachments (US-06-10 AC-14)', async () => {
    const { head, department } = await waiting();

    // 1. Declare attachment for proposal
    const declareRes = await h.declareProposalAttachment(SAMPLE_PDF, head.account).expect(201);
    expect(declareRes.header['cache-control']).toBe('no-store');
    const { attachment, upload } = h.dataOf<AttachmentDataWire>(declareRes);
    expect(attachment.status).toBe('AWAITING_UPLOAD');
    expect(attachment.target).toBe('PROPOSAL');
    expect(attachment.proposalId).toBeNull();
    expect(upload?.uploadToken).toBeTruthy();

    // 2. Put object in storage
    await h.putObject(attachment.id, {
      contentLength: attachment.sizeBytes,
      contentType: attachment.contentType,
    });

    // 3. Complete attachment -> UPLOADED
    const completeRes = await h.completeAttachment(attachment.id, head.account).expect(200);
    expect(h.dataOf<AttachmentDataWire>(completeRes).attachment.status).toBe('UPLOADED');

    // 4. Submit proposal with attachmentIds
    const body = {
      ...h.proposalBody(department.unitId),
      attachmentIds: [attachment.id],
    };
    const submitRes = await h.submitProposal(body, head.account).expect(201);
    const proposalId = h.dataOf<{ proposal: { id: string } }>(submitRes).proposal.id;

    // 5. Verify attachment status is now ATTACHED with proposalId
    const status = await h.statusOf(attachment.id);
    expect(status).toBe('ATTACHED');

    const dbRow = (
      await h.ctx.sql.query<{ proposal_id: string; attached_at: string }>(
        `SELECT proposal_id, attached_at FROM budget_attachments WHERE id = $1`,
        [attachment.id],
      )
    ).rows[0];
    expect(dbRow.proposal_id).toBe(proposalId);
    expect(dbRow.attached_at).toBeTruthy();
  });

  it('refuses submission and rolls back when an attachment is not attachable (US-06-10 AC-14 refusal)', async () => {
    const { head, department } = await waiting();

    // Declare attachment but do NOT complete it (status is AWAITING_UPLOAD)
    const declareRes = await h.declareProposalAttachment(SAMPLE_PDF, head.account).expect(201);
    const uncompletedId = h.dataOf<AttachmentDataWire>(declareRes).attachment.id;

    const countBefore = await h.attachmentCount();
    const proposalCountBefore = await h.budgetRows('budget_proposals');

    const body = {
      ...h.proposalBody(department.unitId),
      attachmentIds: [uncompletedId],
    };

    const submitRes = await h.submitProposal(body, head.account).expect(422);
    const err = h.errorOf(submitRes);
    expect(err.code).toBe('BUDGET_ATTACHMENT.NOT_ATTACHABLE');
    expect((err.details as { attachmentIds: string[] }).attachmentIds).toEqual([uncompletedId]);

    // Verify rollback: no proposal created, attachment status unchanged
    expect(await h.budgetRows('budget_proposals')).toBe(proposalCountBefore);
    expect(await h.attachmentCount()).toBe(countBefore);
    expect(await h.statusOf(uncompletedId)).toBe('AWAITING_UPLOAD');
  });

  it('refuses attachments uploaded by another employee', async () => {
    const u1 = await waiting();
    const u2 = await waiting();

    // u2 uploads an attachment
    const declareRes = await h.declareProposalAttachment(SAMPLE_PDF, u2.head.account).expect(201);
    const u2AttachmentId = h.dataOf<AttachmentDataWire>(declareRes).attachment.id;
    await h.putObject(u2AttachmentId, { contentLength: SAMPLE_PDF.sizeBytes, contentType: SAMPLE_PDF.contentType });
    await h.completeAttachment(u2AttachmentId, u2.head.account).expect(200);

    // u1 tries to submit proposal with u2's attachment
    const body = {
      ...h.proposalBody(u1.department.unitId),
      attachmentIds: [u2AttachmentId],
    };

    const submitRes = await h.submitProposal(body, u1.head.account).expect(422);
    const err = h.errorOf(submitRes);
    expect(err.code).toBe('BUDGET_ATTACHMENT.NOT_ATTACHABLE');
    expect((err.details as { attachmentIds: string[] }).attachmentIds).toEqual([u2AttachmentId]);
  });

  it('submitting without attachmentIds works identically to before', async () => {
    const { head, department } = await waiting();
    const body = h.proposalBody(department.unitId);
    const res = await h.submitProposal(body, head.account).expect(201);
    expect(h.dataOf<{ proposal: { id: string } }>(res).proposal.id).toBeTruthy();
  });

  it('allows uploader to list and discard unattached uploads (Task 7)', async () => {
    const { head } = await waiting();

    // Declare attachment
    const decl = await h.declareProposalAttachment(SAMPLE_XLSX, head.account).expect(201);
    const attId = h.dataOf<AttachmentDataWire>(decl).attachment.id;

    await h.putObject(attId, {
      contentLength: SAMPLE_XLSX.sizeBytes,
      contentType: SAMPLE_XLSX.contentType,
    });
    await h.completeAttachment(attId, head.account).expect(200);

    // List mine uploads: attId should appear
    const mineListRes = await h.listMineUploads('', head.account).expect(200);
    const mineItems = h.dataOf<AttachmentListDataWire>(mineListRes).items;
    expect(mineItems.some((i) => i.id === attId && i.status === 'UPLOADED')).toBe(true);

    // Discard attachment
    const discardRes = await h.discardAttachment(attId, head.account).expect(200);
    expect(h.dataOf<AttachmentDataWire>(discardRes).attachment.status).toBe('DISCARDED');
    expect(await h.statusOf(attId)).toBe('DISCARDED');

    // List mine uploads again: attId should no longer appear in unattached list
    const mineListAfter = await h.listMineUploads('', head.account).expect(200);
    const mineItemsAfter = h.dataOf<AttachmentListDataWire>(mineListAfter).items;
    expect(mineItemsAfter.some((i) => i.id === attId)).toBe(false);

    // Attempting to discard again yields 409 NOT_DISCARDABLE
    const secondDiscard = await h.discardAttachment(attId, head.account).expect(409);
    expect(h.errorOf(secondDiscard).code).toBe('BUDGET_ATTACHMENT.NOT_DISCARDABLE');
  });

  it('refuses other users from discarding an upload', async () => {
    const u1 = await waiting();
    const u2 = await waiting();

    const decl = await h.declareProposalAttachment(SAMPLE_PDF, u1.head.account).expect(201);
    const attId = h.dataOf<AttachmentDataWire>(decl).attachment.id;

    // u2 attempts to discard u1's upload -> 404
    const res = await h.discardAttachment(attId, u2.head.account).expect(404);
    expect(h.errorOf(res).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');
  });
});
