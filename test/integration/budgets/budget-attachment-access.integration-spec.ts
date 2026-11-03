import {
  AttachmentDataWire,
  AttachmentLinkDataWire,
  AttachmentListDataWire,
  BudgetAttachmentHarness,
  SAMPLE_PDF,
} from '../../support/budget-attachment-harness';
import type { Person } from '../../support/request-harness';

const h = new BudgetAttachmentHarness();

describe('budget attachment access rules (integration)', () => {
  let counter = 0;
  let spendingApprover: Person;

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    const boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1'));
    await h.setRole('SPENDING_APPROVER', boss);
    spendingApprover = boss;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const waiting = async (year?: number) => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-AC${counter}`);
    const proposal = await h.budgetProposed(unit.head, unit.department.unitId, undefined, year);
    const version = await h.built(proposal.id);
    return { ...unit, proposal, version };
  };

  it('hides the documents of a version Finance has not sent yet from the head', async () => {
    const { head, version } = await waiting(2027);

    const declareRes = await h.declareVersionAttachment(version.id, SAMPLE_PDF).expect(201);
    const attachmentId = h.dataOf<AttachmentDataWire>(declareRes).attachment.id;

    await h.putObject(attachmentId, {
      contentLength: SAMPLE_PDF.sizeBytes,
      contentType: SAMPLE_PDF.contentType,
    });
    await h.completeAttachment(attachmentId).expect(200);

    // Head of Cost Center tries to read attachments of unsent draft -> 404 VERSION_NOT_FOUND
    const listRes = await h.listVersionAttachments(version.id, '', head.account).expect(404);
    expect(h.errorOf(listRes).code).toBe('BUDGET.VERSION_NOT_FOUND');

    // Head tries to get download link -> 404 BUDGET_ATTACHMENT.NOT_FOUND
    const linkRes = await h.linkAttachment(attachmentId, head.account).expect(404);
    expect(h.errorOf(linkRes).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');
  });

  it('shows the head only the documents of the latest send while the version is back with Finance', async () => {
    const { head, version } = await waiting(2028);

    // 1. Finance attaches doc1
    const decl1 = await h.declareVersionAttachment(version.id, { ...SAMPLE_PDF, fileName: 'doc1.pdf' }).expect(201);
    const doc1Id = h.dataOf<AttachmentDataWire>(decl1).attachment.id;
    await h.putObject(doc1Id, {
      contentLength: SAMPLE_PDF.sizeBytes,
      contentType: SAMPLE_PDF.contentType,
    });
    await h.completeAttachment(doc1Id).expect(200);

    // 2. Finance sends the version
    await h.sendVersion(version.id).expect(200);

    // 3. Decider requests changes
    await h
      .decideVersion(version.id, { decision: 'REQUEST_CHANGES', reason: 'Please revise' }, spendingApprover.account)
      .expect(200);

    // 4. Finance removes doc1
    await h.removeVersionAttachment(version.id, doc1Id).expect(200);

    // 5. Finance attaches doc2
    const decl2 = await h.declareVersionAttachment(version.id, { ...SAMPLE_PDF, fileName: 'doc2.pdf' }).expect(201);
    const doc2Id = h.dataOf<AttachmentDataWire>(decl2).attachment.id;
    await h.putObject(doc2Id, {
      contentLength: SAMPLE_PDF.sizeBytes,
      contentType: SAMPLE_PDF.contentType,
    });
    await h.completeAttachment(doc2Id).expect(200);

    // 6. Head queries version attachments: sees only doc1 as ATTACHED, doc2 is not visible
    const headListRes = await h.listVersionAttachments(version.id, '', head.account).expect(200);
    const headItems = h.dataOf<AttachmentListDataWire>(headListRes).items;
    expect(headItems.length).toBe(1);
    expect(headItems[0].id).toBe(doc1Id);
    expect(headItems[0].status).toBe('ATTACHED');
    expect(headItems[0].removedAt).toBeNull();

    // 7. Head can download doc1 (it was in the latest sent package)
    const headLink1 = await h.linkAttachment(doc1Id, head.account).expect(200);
    expect(h.dataOf<AttachmentLinkDataWire>(headLink1).url).toBeDefined();

    // 8. Head cannot download doc2 (not in the latest sent package)
    const headLink2 = await h.linkAttachment(doc2Id, head.account).expect(404);
    expect(h.errorOf(headLink2).code).toBe('BUDGET_ATTACHMENT.NOT_FOUND');

    // 9. Finance queries version attachments: sees doc1 as REMOVED and doc2 as ATTACHED
    const finListRes = await h.listVersionAttachments(version.id, '', h.finance).expect(200);
    const finItems = h.dataOf<AttachmentListDataWire>(finListRes).items;
    expect(finItems.length).toBe(2);
    const foundDoc1 = finItems.find((i) => i.id === doc1Id);
    const foundDoc2 = finItems.find((i) => i.id === doc2Id);
    expect(foundDoc1?.status).toBe('REMOVED');
    expect(foundDoc1?.removedAt).not.toBeNull();
    expect(foundDoc2?.status).toBe('ATTACHED');
  });
});
