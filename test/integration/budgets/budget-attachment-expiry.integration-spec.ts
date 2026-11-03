import { BudgetAttachmentExpiryService } from '../../../src/modules/budgets/attachment/budget-attachment-expiry.service';
import {
  AttachmentDataWire,
  BudgetAttachmentHarness,
  SAMPLE_PDF,
  SAMPLE_XLSX,
} from '../../support/budget-attachment-harness';

const h = new BudgetAttachmentHarness();

describe('budget attachment expiry sweeper (integration)', () => {
  let counter = 0;
  let expiryService: BudgetAttachmentExpiryService;

  beforeAll(async () => {
    await h.start();
    expiryService = h.ctx.app.get(BudgetAttachmentExpiryService, { strict: false });
  });

  afterAll(async () => {
    await h.stop();
  });

  const waiting = async () => {
    counter += 1;
    return await h.departmentWithHead(`P-EX${counter}`);
  };

  it('expires abandoned AWAITING_UPLOAD attachments older than 24 hours', async () => {
    const { head } = await waiting();

    const decl = await h.declareProposalAttachment(SAMPLE_PDF, head.account).expect(201);
    const attId = h.dataOf<AttachmentDataWire>(decl).attachment.id;

    // Fast-forward simulated now by 25 hours into the future
    const futureNow = new Date(Date.now() + 25 * 60 * 60 * 1000);
    const result = await expiryService.expire(futureNow);
    expect(result.expired).toBeGreaterThanOrEqual(1);

    expect(await h.statusOf(attId)).toBe('EXPIRED');

    // Audit event written with actorKind SYSTEM
    const auditRow = (
      await h.ctx.sql.query<{ actor_kind: string; action: string }>(
        `SELECT actor_kind, action FROM audit_events WHERE resource_type = 'BUDGET_ATTACHMENT' AND resource_id = $1 AND action = 'BUDGET_ATTACHMENT.EXPIRED'`,
        [attId],
      )
    ).rows[0];
    expect(auditRow).toBeDefined();
    expect(auditRow.actor_kind).toBe('SYSTEM');
  });

  it('expires unattached UPLOADED attachments older than 7 days, but does not touch recently uploaded ones', async () => {
    const { head } = await waiting();

    // 1. Upload an attachment
    const declOld = await h.declareProposalAttachment(SAMPLE_XLSX, head.account).expect(201);
    const oldId = h.dataOf<AttachmentDataWire>(declOld).attachment.id;
    await h.putObject(oldId, { contentLength: SAMPLE_XLSX.sizeBytes, contentType: SAMPLE_XLSX.contentType });
    await h.completeAttachment(oldId, head.account).expect(200);

    // 2. Fast-forward simulated now by 8 days
    const eightDaysLater = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    await expiryService.expire(eightDaysLater);
    expect(await h.statusOf(oldId)).toBe('EXPIRED');

    // 3. Recent upload (created now)
    const declRecent = await h.declareProposalAttachment(SAMPLE_PDF, head.account).expect(201);
    const recentId = h.dataOf<AttachmentDataWire>(declRecent).attachment.id;
    await h.putObject(recentId, { contentLength: SAMPLE_PDF.sizeBytes, contentType: SAMPLE_PDF.contentType });
    await h.completeAttachment(recentId, head.account).expect(200);

    // 4. Running expiry at current time does not expire the recent upload
    await expiryService.expire(new Date());
    expect(await h.statusOf(recentId)).toBe('UPLOADED');
  });

  it('does not touch DISCARDED or ATTACHED attachments', async () => {
    const { head } = await waiting();

    const decl = await h.declareProposalAttachment(SAMPLE_PDF, head.account).expect(201);
    const attId = h.dataOf<AttachmentDataWire>(decl).attachment.id;

    await h.discardAttachment(attId, head.account).expect(200);
    expect(await h.statusOf(attId)).toBe('DISCARDED');

    const futureNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await expiryService.expire(futureNow);

    // Still DISCARDED, not EXPIRED
    expect(await h.statusOf(attId)).toBe('DISCARDED');
  });
});
