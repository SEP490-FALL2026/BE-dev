import request from 'supertest';
import { k1Checklist } from '../../support/k1-checklist';
import { ProvisioningEvidenceHarness } from '../../support/provisioning-evidence-harness';

const h = new ProvisioningEvidenceHarness();

describe('evidence of K1 revocation and access cut (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
      h.seed.departmentId,
      h.it1.employeeId,
    ]);
  }, 240000);
  afterAll(() => h.stop());

  it('SPEC case 6: keeps completion and access-cut files on the same K1 task', async () => {
    const planId = await h.plan('K1');
    const assignmentId = await h.seat({ planId }, 'E-EV-K1');
    const { taskId } = await h.open(assignmentId, 'ABRUPT_DEPARTURE');
    await h.claim(taskId).expect(200);
    const pdf = await h.uploaded();
    await h
      .revoked(taskId, {
        completion: 'RENEWAL_CANCELLED',
        evidence: 'Renewal cancelled',
        k1Checklist: k1Checklist('DEPARTURE'),
        paidThroughOn: h.inDays(36),
        accessState: 'UNTIL_PAID_END',
        evidenceDocumentIds: [pdf.id],
      })
      .expect(200);
    const image = await h.uploaded(h.it1, {
      purpose: 'ACCESS_CUT_EVIDENCE',
      fileName: 'cut.png',
      contentType: 'image/png',
      sizeBytes: 2048,
    });
    await h
      .accessCut(taskId, { accessCutOn: h.inDays(-3), evidence: 'Account locked', evidenceDocumentIds: [image.id] })
      .expect(200);
    const response = await request(h.server())
      .get(`/api/v1/provisioning-tasks/${taskId}/evidence-files`)
      .set(h.as(h.it1))
      .expect(200);
    expect(h.dataOf<{ items: { id: string; stage: string }[] }>(response).items).toMatchObject([
      { id: pdf.id, stage: 'COMPLETION' },
      { id: image.id, stage: 'ACCESS_CUT' },
    ]);
    const events = await h.auditEvents('ProvisioningTask', taskId);
    expect(events.find((e) => e.action === 'PROVISIONING_TASK.REVOCATION_COMPLETED')?.after).toMatchObject({
      evidenceDocumentIds: [pdf.id],
    });
    expect(events.find((e) => e.action === 'PROVISIONING_TASK.ACCESS_CUT')?.after).toMatchObject({
      evidenceDocumentIds: [image.id],
    });
    expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: h.inDays(-3) });
    const files = (
      await h.ctx.sql.query(
        `SELECT id, status, provisioning_task_id FROM document_attachments WHERE id = ANY($1::uuid[])`,
        [[pdf.id, image.id]],
      )
    ).rows as { id: string; status: string; provisioning_task_id: string }[];
    expect(files).toHaveLength(2);
    for (const file of files) expect(file).toMatchObject({ status: 'READY', provisioning_task_id: taskId });
  });

  it('keeps K2 UNTIL_PAID_END forbidden and rolls its file back', async () => {
    const subscriptionId = await h.subscription(2, 'K2');
    const assignmentId = await h.seat({ subscriptionId }, 'E-EV-K2');
    const { taskId } = await h.open(assignmentId, 'MANAGER_NOT_NEEDED');
    await h.claim(taskId).expect(200);
    const file = await h.uploaded();
    const response = await h
      .revoked(taskId, {
        completion: 'RENEWAL_CANCELLED',
        evidence: 'Keep K2 rules',
        accessState: 'UNTIL_PAID_END',
        paidThroughOn: h.inDays(36),
        evidenceDocumentIds: [file.id],
      })
      .expect(422);
    expect(h.codeOf(response)).toBe('REVOCATION.COMPLETION_NOT_ALLOWED');
    expect(
      (await h.ctx.sql.query(`SELECT status, provisioning_task_id FROM document_attachments WHERE id = $1`, [file.id]))
        .rows[0],
    ).toEqual({ status: 'PENDING_ATTACH', provisioning_task_id: null });
    expect(
      (await h.auditEvents('ProvisioningTask', taskId)).some(
        (e) => e.action === 'PROVISIONING_TASK.REVOCATION_COMPLETED',
      ),
    ).toBe(false);
  });
});
