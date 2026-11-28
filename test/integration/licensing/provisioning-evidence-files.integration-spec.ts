import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { DocumentHarness, PDF, type DocumentWire } from '../../support/document-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import { PgRelay } from '../../support/pg-relay';
import type { TaskWire } from '../../support/provisioning-harness';
import { QueryCounter, dataStatements, tablesOf } from '../../support/query-count';

const h = new DocumentHarness();
const MISSING = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
const PNG = { purpose: 'PROVISIONING_EVIDENCE', fileName: 'proof.png', contentType: 'image/png', sizeBytes: 2048 };
const WEBP = { ...PNG, fileName: 'proof.webp', contentType: 'image/webp' };
interface FileView {
  id: string;
  stage: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  attachedAt: string;
}

describe('provisioning evidence files (integration, real PostgreSQL, fake storage)', () => {
  let it2: ApiAccount;
  let department2: { id: string; code: string };
  let planId: string;
  let subscriptionId: string;
  let counter = 0;
  let completedTask: TaskWire;
  let completedFiles: DocumentWire[];
  let relay: PgRelay;
  let queries: QueryCounter;
  const list = (id: string, account = h.it1) =>
    request(h.server()).get(`/api/v1/provisioning-tasks/${id}/evidence-files`).set(h.as(account));
  const link = (id: string, fileId: string, account = h.it1) =>
    request(h.server()).post(`/api/v1/provisioning-tasks/${id}/evidence-files/${fileId}/links`).set(h.as(account));
  const uploaded = (body: object = PNG, account = h.it1) => h.uploaded(account, body);
  const fileOf = (response: request.Response) => h.dataOf<{ document: DocumentWire }>(response).document;
  const stateOf = async (id: string) =>
    (
      await h.ctx.sql.query<{ status: string; provisioning_task_id: string | null }>(
        `SELECT status, provisioning_task_id FROM document_attachments WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const inProgress = async (taskId: string, account = h.it1) => {
    expect(h.dataOf<{ task: TaskWire }>(await h.getTask(taskId, account).expect(200)).task.status).toBe('IN_PROGRESS');
    expect(
      (await h.auditEvents('ProvisioningTask', taskId)).some((e) => e.action === 'PROVISIONING_TASK.COMPLETED'),
    ).toBe(false);
  };
  const grant = async (account = h.it1) => {
    const code = `E-EVF-${++counter}`;
    const own = account === it2;
    const employeeId = own ? await h.member(department2.code, code, 'Engineer') : await h.person(code);
    return h.granted(employeeId, planId, {
      subscriptionId,
      accountIdentifier: `${code.toLowerCase()}@acme.vn`,
      account,
      departmentId: own ? department2.id : h.seed.departmentId,
    });
  };
  const invalid = async (taskId: string, ids: string[], problem: string) => {
    const response = await h.complete(taskId, { evidence: 'Done', evidenceDocumentIds: ids }).expect(422);
    expect(h.codeOf(response)).toBe('PROVISIONING_TASK.EVIDENCE_FILE_INVALID');
    expect(h.detailsOf(response)).toEqual({ problem });
    await inProgress(taskId);
  };

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);
        return url.toString();
      },
    });
    queries = QueryCounter.on(relay);
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
      h.seed.departmentId,
      h.it1.employeeId,
    ]);
    it2 = await h.account('E-EVF-IT2', await h.person('E-EVF-IT2'), 'IT_ADMIN');
    department2 = await h.department('EVF2', it2.employeeId);
    subscriptionId = await h.subscription(100);
    planId = await h.planOf(subscriptionId);
  }, 240000);
  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  it('case 1: completes K2 with PNG and WebP, owning and auditing both files atomically', async () => {
    completedTask = await grant();
    completedFiles = [await uploaded(), await uploaded(WEBP)];
    const ids = completedFiles.map((f) => f.id).sort();
    await h
      .complete(completedTask.id, { evidence: 'Workspace configured', evidenceDocumentIds: [...ids].reverse() })
      .expect(200);
    for (const id of ids) {
      expect(await stateOf(id)).toEqual({ status: 'READY', provisioning_task_id: completedTask.id });
      expect((await h.auditEvents('DocumentAttachment', id)).at(-1)).toMatchObject({
        action: 'DOCUMENT.ATTACHED',
        after: { status: 'READY', provisioningTaskId: completedTask.id },
      });
    }
    expect((await h.auditEvents('ProvisioningTask', completedTask.id)).at(-1)).toMatchObject({
      action: 'PROVISIONING_TASK.COMPLETED',
      after: { evidenceDocumentIds: ids },
    });
    const items = h.dataOf<{ items: FileView[] }>(await list(completedTask.id).expect(200)).items;
    expect(items.map((f) => f.id)).toEqual(ids);
    for (const file of items) {
      expect(Object.keys(file).sort()).toEqual(['attachedAt', 'contentType', 'fileName', 'id', 'sizeBytes', 'stage']);
      expect(file.stage).toBe('COMPLETION');
      expect(new Date(file.attachedAt).toISOString()).toBe(file.attachedAt);
    }
  });

  it('case 2: files do not replace required text evidence', async () => {
    const task = await grant();
    const file = await uploaded();
    const response = await h.complete(task.id, { evidence: '', evidenceDocumentIds: [file.id] }).expect(422);
    expect(h.codeOf(response)).toBe('PROVISIONING_TASK.EVIDENCE_REQUIRED');
    await inProgress(task.id);
    expect(await stateOf(file.id)).toEqual({ status: 'PENDING_ATTACH', provisioning_task_id: null });
  });

  it('case 3: refuses too many ids and duplicate ids before writing', async () => {
    const task = await grant();
    await invalid(
      task.id,
      Array.from({ length: 4 }, () => randomUUID()),
      'TOO_MANY',
    );
    const id = randomUUID();
    await invalid(task.id, [id, id], 'DUPLICATE');
  });

  it('case 4: refuses another uploader, wrong purposes, attached files and unfinished uploads', async () => {
    const task = await grant();
    const other = await uploaded(PNG, it2);
    const contract = await uploaded({ ...PDF, purpose: 'CONTRACT_ATTACHMENT' });
    const cut = await uploaded({ ...PNG, purpose: 'ACCESS_CUT_EVIDENCE' });
    const awaiting = fileOf(await h.createDocument(PNG).expect(201));
    for (const [id, problem] of [
      [other.id, 'NOT_FOUND'],
      [contract.id, 'PURPOSE_MISMATCH'],
      [cut.id, 'PURPOSE_MISMATCH'],
      [completedFiles[0].id, 'ALREADY_ATTACHED'],
      [awaiting.id, 'NOT_READY_TO_ATTACH'],
    ]) {
      await invalid(task.id, [id], problem);
    }
    expect(await stateOf(other.id)).toEqual({ status: 'PENDING_ATTACH', provisioning_task_id: null });
    expect(await stateOf(contract.id)).toEqual({ status: 'PENDING_ATTACH', provisioning_task_id: null });
    expect(await stateOf(cut.id)).toEqual({ status: 'PENDING_ATTACH', provisioning_task_id: null });
    expect(await stateOf(awaiting.id)).toEqual({ status: 'AWAITING_UPLOAD', provisioning_task_id: null });
  });

  it('case 4 rollback: undoes the first attachment and its audit when the second id is missing', async () => {
    const task = await grant();
    const firstId = '10000000-0000-4000-8000-000000000001';
    await h.ctx.sql.query(
      `INSERT INTO document_attachments (id, organization_id, purpose, status, file_name, content_type, size_bytes, object_key, final_object_key, uploaded_by_app_user_id) VALUES ($1, $2, 'PROVISIONING_EVIDENCE', 'PENDING_ATTACH', 'rollback.png', 'image/png', 2048, $3, $4, $5)`,
      [firstId, h.seed.organizationId, `pending/${firstId}`, `final/${firstId}`, h.it1.appUserId],
    );
    await invalid(task.id, [MISSING, firstId], 'NOT_FOUND');
    expect(await stateOf(firstId)).toEqual({ status: 'PENDING_ATTACH', provisioning_task_id: null });
    expect(await h.auditEvents('DocumentAttachment', firstId)).toEqual([]);
  });

  it('case 5: the acting IT guard wins over a bad file id', async () => {
    const task = await grant();
    const response = await h.complete(task.id, { evidence: 'Done', evidenceDocumentIds: [MISSING] }, it2).expect(403);
    expect(h.codeOf(response)).toBe('PROVISIONING.NOT_IN_CHARGE');
    await inProgress(task.id);
  });

  it('case 7: reads only for current responsible IT or Super Admin and issues audited, uncached links', async () => {
    const taskId = completedTask.id;
    const fileId = completedFiles[0].id;
    await list(taskId).expect(200);
    await request(h.server())
      .get(`/api/v1/provisioning-tasks/${taskId}/evidence-files`)
      .set('Authorization', `Bearer ${h.admin}`)
      .expect(200);
    for (const response of [await list(taskId, it2).expect(404), await link(taskId, fileId, it2).expect(404)])
      expect(h.codeOf(response)).toBe('PROVISIONING_TASK.NOT_FOUND');
    for (const response of [
      await list(taskId, h.finance).expect(403),
      await link(taskId, fileId, h.finance).expect(403),
    ])
      expect(h.codeOf(response)).toBe('AUTHORIZATION.FORBIDDEN');
    const response = await link(taskId, fileId).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const value = h.dataOf<{ url: string; expiresAt: string }>(response);
    expect(value.url).toContain('https://storage.example/download/');
    expect(new Date(value.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(h.storage.downloadLinks.at(-1)).toMatchObject({ expiresInSeconds: 300, key: await h.finalKeyOf(fileId) });
    const audit = (await h.auditEvents('DocumentAttachment', fileId)).at(-1);
    expect(audit).toMatchObject({ action: 'DOCUMENT.LINK_ISSUED', after: { expiresAt: value.expiresAt } });
    expect(Object.keys(audit?.after ?? {})).toEqual(['expiresAt']);
    const another = await grant();
    expect(h.codeOf(await link(another.id, fileId).expect(404))).toBe('PROVISIONING_TASK.EVIDENCE_FILE_NOT_FOUND');
    expect(h.dataOf<{ items: FileView[] }>(await list(another.id).expect(200))).toEqual({ items: [] });
    expect(h.codeOf(await list(MISSING).expect(404))).toBe('PROVISIONING_TASK.NOT_FOUND');
  });

  it('case 7 current scope: the former responsible IT loses access after reassignment', async () => {
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
      h.seed.departmentId,
      it2.employeeId,
    ]);
    try {
      for (const response of [
        await list(completedTask.id).expect(404),
        await link(completedTask.id, completedFiles[0].id).expect(404),
      ])
        expect(h.codeOf(response)).toBe('PROVISIONING_TASK.NOT_FOUND');
      await list(completedTask.id, it2).expect(200);
    } finally {
      await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
        h.seed.departmentId,
        h.it1.employeeId,
      ]);
    }
  });

  it('case 8: READY evidence is hidden from both general document routes, even to Finance', async () => {
    for (const account of [h.it1, h.finance]) {
      for (const response of [
        await h.getDocument(completedFiles[0].id, account).expect(404),
        await h.linkDocument(completedFiles[0].id, account).expect(404),
      ])
        expect(h.codeOf(response)).toBe('DOCUMENT.NOT_FOUND');
    }
  });

  it('case 7 orphan scope: broad task visibility does not grant access to evidence', async () => {
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = NULL WHERE id = $1`, [h.seed.departmentId]);
    try {
      await h.getTask(completedTask.id).expect(200);
      for (const response of [
        await list(completedTask.id).expect(404),
        await link(completedTask.id, completedFiles[0].id).expect(404),
      ])
        expect(h.codeOf(response)).toBe('PROVISIONING_TASK.NOT_FOUND');
    } finally {
      await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
        h.seed.departmentId,
        h.it1.employeeId,
      ]);
    }
  });

  it('case 9: limits WebP and evidence purposes without changing old upload rules', async () => {
    await h.createDocument(WEBP).expect(201);
    expect(h.codeOf(await h.createDocument({ ...WEBP, purpose: 'CONTRACT_ATTACHMENT' }).expect(422))).toBe(
      'DOCUMENT.TYPE_NOT_ALLOWED',
    );
    expect(h.codeOf(await h.createDocument(PNG, h.finance).expect(403))).toBe('DOCUMENT.PURPOSE_FORBIDDEN');
    const file = fileOf(await h.createDocument(WEBP).expect(201));
    await h.putObject(file.id, {
      contentLength: WEBP.sizeBytes,
      contentType: WEBP.contentType,
      content: Buffer.from('RIFF0000WAVE'),
    });
    expect(h.codeOf(await h.completeDocument(file.id).expect(422))).toBe('DOCUMENT.UPLOAD_MISMATCH');
    expect(await h.statusOf(file.id)).toBe('QUARANTINED');
  });

  it('case 10: PostgreSQL enforces purpose, a single owner and the unchanged one-way guard', async () => {
    const task = await grant();
    const contractId = await h.contract();
    const contractFile = await uploaded({ ...PDF, purpose: 'CONTRACT_ATTACHMENT' });
    const evidence = await uploaded();
    const wrongPurpose = await h.ctx.sql
      .query(
        `UPDATE document_attachments SET status = 'READY', attached_at = now(), provisioning_task_id = $2 WHERE id = $1`,
        [contractFile.id, task.id],
      )
      .catch((e: unknown) => e);
    expect(wrongPurpose).toMatchObject({ code: '23514', constraint: 'document_attachments_purpose_fits_owner' });
    const twoOwners = await h.ctx.sql
      .query(
        `UPDATE document_attachments SET status = 'READY', attached_at = now(), contract_id = $2, provisioning_task_id = $3 WHERE id = $1`,
        [evidence.id, contractId, task.id],
      )
      .catch((e: unknown) => e);
    expect(twoOwners).toMatchObject({ code: '23514', constraint: 'document_attachments_owner_state' });
    const immutable = await h.ctx.sql
      .query(`UPDATE document_attachments SET provisioning_task_id = $2 WHERE id = $1`, [completedFiles[0].id, task.id])
      .catch((e: unknown) => e);
    expect(immutable).toMatchObject({ code: '55000', constraint: 'document_attachments_one_way' });
  });

  it('case 11: two responsible ITs with a document-row barrier have one winner and no deadlock', async () => {
    const first = await grant();
    const second = await grant(it2);
    const file = await uploaded();
    const barrier = new Client({ connectionString: h.ctx.database.url });
    await barrier.connect();
    const requests: Promise<request.Response>[] = [];
    try {
      await barrier.query('BEGIN');
      await barrier.query(`SELECT id FROM document_attachments WHERE id = $1 FOR UPDATE`, [file.id]);
      requests.push(h.complete(first.id, { evidence: 'Done', evidenceDocumentIds: [file.id] }).then((r) => r));
      requests.push(h.complete(second.id, { evidence: 'Done', evidenceDocumentIds: [file.id] }, it2).then((r) => r));
      await waitForLockWaiters(h.ctx.sql, 2);
      await barrier.query('COMMIT');
      const responses = await Promise.all(requests);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 422]);
      const refused = responses.find((r) => r.status === 422);
      if (!refused) throw new Error('No refused completion');
      expect(h.codeOf(refused)).toBe('PROVISIONING_TASK.EVIDENCE_FILE_INVALID');
      expect(['NOT_FOUND', 'ALREADY_ATTACHED']).toContain(h.detailsOf(refused).problem);
      expect(await stateOf(file.id)).toEqual({ status: 'READY', provisioning_task_id: first.id });
      await inProgress(second.id, it2);
      expect(
        (await h.auditEvents('ProvisioningTask', first.id)).filter((e) => e.action === 'PROVISIONING_TASK.COMPLETED'),
      ).toHaveLength(1);
    } finally {
      await barrier.query('ROLLBACK');
      await Promise.allSettled(requests);
      await barrier.end();
    }
  });

  it('EV-16: maps storage unavailability to the existing 503 without issuing a link audit', async () => {
    const fileId = completedFiles[0].id;
    const before = await h.auditEvents('DocumentAttachment', fileId);
    h.storage.unavailable.add('createDownloadUrl');
    try {
      expect(h.codeOf(await link(completedTask.id, fileId).expect(503))).toBe('SERVICE_UNAVAILABLE');
      expect(await h.auditEvents('DocumentAttachment', fileId)).toEqual(before);
    } finally {
      h.storage.unavailable.delete('createDownloadUrl');
    }
  });

  it('EV-13 read contract: two and six files use the same queries with one bounded document projection', async () => {
    const few = await queries.run(() => list(completedTask.id).expect(200));
    expect(h.dataOf<{ items: FileView[] }>(few.result).items).toHaveLength(2);
    await h.ctx.sql.query(
      `INSERT INTO document_attachments (id, organization_id, purpose, status, file_name, content_type, size_bytes, object_key, final_object_key, uploaded_by_app_user_id, provisioning_task_id, attached_at)
      SELECT gen_random_uuid(), $1, 'ACCESS_CUT_EVIDENCE', 'READY', 'cut-' || n || '.png', 'image/png', 2048, 'read/pending/' || n, 'read/final/' || n, $2, $3, now() FROM generate_series(1, 4) n`,
      [h.seed.organizationId, h.it1.appUserId, completedTask.id],
    );
    const many = await queries.run(() => list(completedTask.id).expect(200));
    expect(h.dataOf<{ items: FileView[] }>(many.result).items).toHaveLength(6);
    expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
    const documentReads = dataStatements(many.statements).filter((sql) =>
      tablesOf(sql).includes('document_attachments'),
    );
    expect(documentReads).toHaveLength(1);
    expect(documentReads[0]).not.toMatch(/object_key|uploaded_by_app_user_id/i);
    expect(documentReads[0]).toMatch(/LIMIT/i);
    expect(documentReads[0]).toMatch(/ORDER BY[\s\S]*attached_at[\s\S]*id/i);
  });
});
