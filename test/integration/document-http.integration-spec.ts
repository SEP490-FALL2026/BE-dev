import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount } from '../support/api-accounts';
import { DocumentHarness, PDF, type DocumentWire } from '../support/document-harness';

const h = new DocumentHarness();
const MB = 1024 * 1024;

describe('the contracts and the files kept for them over HTTP (integration, real PostgreSQL)', () => {
  let it2: ApiAccount;
  let head: ApiAccount;
  let it3: ApiAccount;

  const wire = (response: { body: unknown }): DocumentWire =>
    (response.body as { data: { document: DocumentWire } }).data.document;
  const linkOf = (response: { body: unknown }) => (response.body as { data: { url: string; expiresAt: string } }).data;
  const declare = (over: object = {}, account = h.it1) =>
    h.createDocument({ ...PDF, purpose: 'CONTRACT_ATTACHMENT', ...over }, account);
  const parameter = (value: number) => h.setParameter('DOCUMENT_MAX_SIZE_MB', value).expect(200);

  beforeAll(async () => {
    await h.start();
    const designer = await h.jobTitle('Designer');
    const department = await h.department('P-DES');
    it2 = await h.account('E-IT2', await h.person('E-IT2'), ['IT_ADMIN']);
    it3 = await h.account('E-IT3', await h.person('E-IT3'), ['IT_ADMIN']);
    const headId = await h.member('P-DES', 'E-HEAD', designer);
    head = await h.account('E-HEAD', headId, []);
    await request(h.server())
      .post(`/api/v1/departments/${department.id}/head-assignments`)
      .set(h.as(h.it1))
      .send({ employeeId: headId, effectiveFrom: h.today() })
      .expect(200);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-04-04 AC-1: gives Finance a link that lives five minutes, for a PDF the IT Admin attached to a contract', async () => {
    const contract = await h.contract('Hợp đồng K1');
    const declared = wire(await declare().expect(201));
    expect(declared).toMatchObject({
      purpose: 'CONTRACT_ATTACHMENT',
      status: 'AWAITING_UPLOAD',
      fileName: PDF.fileName,
      uploadedBy: h.it1.appUserId,
      contractId: null,
    });
    const upload = (await declare().expect(201)).body as {
      data: { upload: { url: string; method: string; headers: object } };
    };
    expect(upload.data.upload).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'application/pdf' } });
    expect(h.storage.uploadLinks.at(-1)).toMatchObject({ contentType: 'application/pdf', expiresInSeconds: 900 });

    await h.putObject(declared.id, { contentLength: PDF.sizeBytes, contentType: PDF.contentType });
    expect(wire(await h.completeDocument(declared.id).expect(200)).status).toBe('PENDING_ATTACH');
    expect(wire(await h.attachDocument(declared.id, { contractId: contract }).expect(200))).toMatchObject({
      status: 'READY',
      contractId: contract,
    });

    const before = new Date();
    const link = linkOf(await h.linkDocument(declared.id, h.finance).expect(200));

    const issued = h.storage.downloadLinks.at(-1);
    expect(issued).toMatchObject({ url: link.url, expiresInSeconds: 300, key: await h.keyOf(declared.id) });
    expect(new Date(link.expiresAt).getTime() - before.getTime()).toBeGreaterThan(290_000);
    expect(new Date(link.expiresAt).getTime() - before.getTime()).toBeLessThan(310_000);
  });

  it('US-04-04 AC-2: a link is never stored, a new request is a new link, and a link past its time opens nothing', async () => {
    const contract = await h.contract();
    const document = await h.uploaded();
    await h.attachDocument(document.id, { contractId: contract }).expect(200);

    const first = linkOf(await h.linkDocument(document.id, h.finance).expect(200));
    const second = linkOf(await h.linkDocument(document.id, h.finance).expect(200));

    expect(first.url).not.toBe(second.url);
    expect(h.storage.open(first.url)).toBeDefined();
    expect(() => h.storage.open(first.url, new Date(Date.now() + 301_000))).toThrow(/expired/);
    const stored = await h.ctx.sql.query<{ row: string }>(`SELECT d::text AS row FROM document_attachments d`);
    expect(stored.rows.some((row) => row.row.includes('storage.example'))).toBe(false);
    const events = await h.auditEvents('DocumentAttachment', document.id);
    expect(events.filter((event) => event.action === 'DOCUMENT.LINK_ISSUED')).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain('storage.example');
  });

  it('US-04-04 AC-3: the department head, an employee and the Super Admin get no link, and the storage is not asked for one', async () => {
    const contract = await h.contract();
    const document = await h.uploaded();
    await h.attachDocument(document.id, { contractId: contract }).expect(200);
    const asked = h.storage.downloadLinks.length;
    const superAdmin: ApiAccount = { ...h.it1, accessToken: h.admin };

    for (const account of [head, h.employee, superAdmin]) {
      expect(h.codeOf(await h.linkDocument(document.id, account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
      expect(h.codeOf(await h.getDocument(document.id, account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(h.storage.downloadLinks).toHaveLength(asked);
  });

  it('US-04-04 AC-6: a file not attached yet is the uploader’s alone, an attached one opens for the IT Admin and Finance, and a role lost is a right lost', async () => {
    const contract = await h.contract();
    const document = await h.uploaded(it3);

    for (const account of [h.finance, it2]) {
      expect(h.codeOf(await h.linkDocument(document.id, account).expect(404))).toBe('DOCUMENT.NOT_FOUND');
      expect(h.codeOf(await h.getDocument(document.id, account).expect(404))).toBe('DOCUMENT.NOT_FOUND');
    }
    expect(h.codeOf(await h.attachDocument(document.id, { contractId: contract }, it2).expect(404))).toBe(
      'DOCUMENT.NOT_FOUND',
    );
    await h.linkDocument(document.id, it3).expect(200);

    await h.attachDocument(document.id, { contractId: contract }, it3).expect(200);
    await h.linkDocument(document.id, h.finance).expect(200);
    await h.linkDocument(document.id, it2).expect(200);

    await h.revokeItAdmin(it3);
    expect(h.codeOf(await h.linkDocument(document.id, it3).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it('US-04-04 AC-6: the uploader is the signed-in person whatever the body says, and a purpose is chosen by its roles only', async () => {
    const before = await h.documentCount();

    for (const extra of [{ uploadedBy: randomUUID() }, { organizationId: randomUUID() }]) {
      expect(h.codeOf(await declare(extra).expect(422))).toBe('VALIDATION_ERROR');
    }
    expect(h.codeOf(await declare({ purpose: 'IMPORT_SOURCE' }, h.finance).expect(403))).toBe(
      'DOCUMENT.PURPOSE_FORBIDDEN',
    );
    expect(h.codeOf(await declare({ purpose: 'COST_STATEMENT' }).expect(403))).toBe('DOCUMENT.PURPOSE_FORBIDDEN');
    expect(h.codeOf(await declare({ purpose: 'TAX_PAYMENT_PROOF' }).expect(403))).toBe('DOCUMENT.PURPOSE_FORBIDDEN');
    const notYet = await declare({ purpose: 'IMPORT_SOURCE' }).expect(409);
    expect(h.codeOf(notYet)).toBe('DOCUMENT.PURPOSE_NOT_AVAILABLE');
    expect(await h.documentCount()).toBe(before);
    expect(wire(await declare({}, h.finance).expect(201)).uploadedBy).toBe(h.finance.appUserId);
  });

  it('US-04-04 AC-6: a file attached to one contract belongs to it for good: another contract, or the same again, is refused', async () => {
    const first = await h.contract('K1');
    const second = await h.contract('K2');
    const document = await h.uploaded();
    await h.attachDocument(document.id, { contractId: first }).expect(200);

    expect(h.codeOf(await h.attachDocument(document.id, { contractId: second }).expect(409))).toBe(
      'DOCUMENT.ALREADY_ATTACHED',
    );
    expect(h.codeOf(await h.attachDocument(document.id, { contractId: first }).expect(409))).toBe(
      'DOCUMENT.ALREADY_ATTACHED',
    );
    expect(wire(await h.getDocument(document.id).expect(200)).contractId).toBe(first);
    expect(h.codeOf(await h.attachDocument(document.id, { contractId: randomUUID() }).expect(404))).toMatch(
      /NOT_FOUND/,
    );
  });

  it('US-04-04 AC-9: the IT Admin files a quote and Finance an invoice as purchase documents; an employee may not', async () => {
    const contract = await h.contract();
    const quote = await h.uploaded(h.it1, { ...PDF, fileName: 'bao-gia.pdf', purpose: 'PURCHASE_DOCUMENT' });
    const invoice = await h.uploaded(h.finance, { ...PDF, fileName: 'hoa-don.pdf', purpose: 'PURCHASE_DOCUMENT' });
    const before = await h.documentCount();

    await h.attachDocument(quote.id, { contractId: contract }).expect(200);
    await h.attachDocument(invoice.id, { contractId: contract }, h.finance).expect(200);
    expect(h.codeOf(await h.createDocument({ ...PDF, purpose: 'PURCHASE_DOCUMENT' }, h.employee).expect(403))).toBe(
      'AUTHORIZATION.FORBIDDEN',
    );
    expect(await h.documentCount()).toBe(before);
  });

  it('US-04-04 AC-10: refuses a file of the wrong type or size before anything is made, and takes a PDF and the images', async () => {
    const before = await h.documentCount();
    const links = h.storage.uploadLinks.length;

    expect(
      h.codeOf(await declare({ fileName: 'setup.exe', contentType: 'application/x-msdownload' }).expect(422)),
    ).toBe('DOCUMENT.TYPE_NOT_ALLOWED');
    expect(h.codeOf(await declare({ fileName: 'hop-dong.pdf.exe' }).expect(422))).toBe('DOCUMENT.TYPE_NOT_ALLOWED');
    expect(h.codeOf(await declare({ sizeBytes: 0 }).expect(422))).toBe('DOCUMENT.FILE_INVALID');
    expect(h.codeOf(await declare({ fileName: '../../etc/passwd.pdf' }).expect(422))).toBe('DOCUMENT.FILE_INVALID');
    const large = await declare({ sizeBytes: 10 * MB + 1 }).expect(422);
    expect(h.codeOf(large)).toBe('DOCUMENT.TOO_LARGE');
    expect(h.detailsOf(large)).toEqual({ maxBytes: 10 * MB });
    expect(await h.documentCount()).toBe(before);
    expect(h.storage.uploadLinks).toHaveLength(links);

    await declare({ sizeBytes: 10 * MB }).expect(201);
    await declare({ fileName: 'scan.png', contentType: 'image/png' }).expect(201);
    await declare({ fileName: 'anh.JPG', contentType: 'image/jpeg' }).expect(201);
  });

  it('US-04-04 AC-10: the largest size is a parameter, and a change applies to the next file', async () => {
    await parameter(1);
    try {
      expect(h.codeOf(await declare({ sizeBytes: 2 * MB }).expect(422))).toBe('DOCUMENT.TOO_LARGE');
      await declare({ sizeBytes: MB }).expect(201);
    } finally {
      await parameter(10);
    }
    await declare({ sizeBytes: 2 * MB }).expect(201);
  });

  it('US-04-04 AC-10: a stored object that is not what was declared is deleted and the file quarantined; nothing opens or attaches it', async () => {
    const contract = await h.contract();
    const wrongSize = wire(await declare().expect(201));
    const wrongType = wire(await declare().expect(201));
    const neverSent = wire(await declare().expect(201));
    const sizeKey = await h.putObject(wrongSize.id, { contentLength: PDF.sizeBytes - 1, contentType: PDF.contentType });
    await h.putObject(wrongType.id, { contentLength: PDF.sizeBytes, contentType: 'application/x-msdownload' });

    for (const document of [wrongSize, wrongType, neverSent]) {
      expect(h.codeOf(await h.completeDocument(document.id).expect(422))).toBe('DOCUMENT.UPLOAD_MISMATCH');
      expect(h.codeOf(await h.getDocument(document.id).expect(404))).toBe('DOCUMENT.NOT_FOUND');
      expect(h.codeOf(await h.linkDocument(document.id).expect(404))).toBe('DOCUMENT.NOT_FOUND');
      expect(h.codeOf(await h.attachDocument(document.id, { contractId: contract }).expect(409))).toBe(
        'DOCUMENT.NOT_READY_TO_ATTACH',
      );
    }
    expect(h.storage.deleted).toContain(sizeKey);
    expect(h.storage.objects.has(sizeKey)).toBe(false);
    expect(
      (
        await h.ctx.sql.query<{ status: string }>(`SELECT status FROM document_attachments WHERE id = $1`, [
          wrongSize.id,
        ])
      ).rows[0].status,
    ).toBe('QUARANTINED');
    expect((await h.auditEvents('DocumentAttachment', wrongSize.id)).map((event) => event.action)).toEqual([
      'DOCUMENT.CREATED',
      'DOCUMENT.QUARANTINED',
    ]);
  });

  it('keeps the order of the steps: a file is completed once, only by its uploader, and cannot be attached or opened before', async () => {
    const contract = await h.contract();
    const document = wire(await declare().expect(201));

    expect(h.codeOf(await h.attachDocument(document.id, { contractId: contract }).expect(409))).toBe(
      'DOCUMENT.NOT_READY_TO_ATTACH',
    );
    expect(h.codeOf(await h.linkDocument(document.id).expect(404))).toBe('DOCUMENT.NOT_FOUND');
    expect(h.codeOf(await h.completeDocument(document.id, it2).expect(404))).toBe('DOCUMENT.NOT_FOUND');
    await h.putObject(document.id, { contentLength: PDF.sizeBytes, contentType: PDF.contentType });
    await h.completeDocument(document.id).expect(200);
    expect(h.codeOf(await h.completeDocument(document.id).expect(409))).toBe('DOCUMENT.NOT_AWAITING_UPLOAD');
  });

  it('two attaches of one file at once: one wins, the other is told it has an owner', async () => {
    const first = await h.contract('K1');
    const second = await h.contract('K2');
    const document = await h.uploaded();

    const answers = await Promise.all([
      h.attachDocument(document.id, { contractId: first }),
      h.attachDocument(document.id, { contractId: second }),
    ]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
  });

  it('audits what happens to a file, never the link or the bytes', async () => {
    const contract = await h.contract();
    const document = await h.uploaded();
    await h.attachDocument(document.id, { contractId: contract }).expect(200);
    await h.linkDocument(document.id, h.finance).expect(200);

    const events = await h.auditEvents('DocumentAttachment', document.id);

    expect(events.map((event) => event.action)).toEqual([
      'DOCUMENT.CREATED',
      'DOCUMENT.UPLOADED',
      'DOCUMENT.ATTACHED',
      'DOCUMENT.LINK_ISSUED',
    ]);
    expect(events[0].after).toMatchObject({
      purpose: 'CONTRACT_ATTACHMENT',
      fileName: PDF.fileName,
      sizeBytes: PDF.sizeBytes,
    });
    expect(events[2].after).toMatchObject({ status: 'READY', contractId: contract });
    expect(events[3].actor_app_user_id).toBe(h.finance.appUserId);
    expect(JSON.stringify(events)).not.toContain('storage.example');
    expect(JSON.stringify(events)).not.toContain(await h.keyOf(document.id));
  });

  it('keeps contracts as a name: the IT Admin makes one, the IT Admin and Finance read it, the head does not, nothing changes it', async () => {
    const id = await h.contract('  Hợp đồng Figma  ');

    expect(h.codeOf(await h.createContract({ name: '   ' }).expect(422))).toBe('CONTRACT.NAME_REQUIRED');
    expect(h.codeOf(await h.createContract({}).expect(422))).toBe('CONTRACT.NAME_REQUIRED');
    expect(h.codeOf(await h.createContract({ name: 'x' }, h.finance).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    expect(
      h.dataOf<{ contract: { name: string; createdBy: string } }>(await h.getContract(id, h.finance).expect(200))
        .contract,
    ).toMatchObject({ name: 'Hợp đồng Figma', createdBy: h.it1.appUserId });
    expect(h.codeOf(await h.getContract(id, head).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    expect(h.codeOf(await h.getContract(randomUUID()).expect(404))).toBe('CONTRACT.NOT_FOUND');
    await request(h.server()).delete(`/api/v1/contracts/${id}`).set(h.as(h.it1)).expect(404);
    await request(h.server()).patch(`/api/v1/contracts/${id}`).set(h.as(h.it1)).send({ name: 'x' }).expect(404);
  });
});
