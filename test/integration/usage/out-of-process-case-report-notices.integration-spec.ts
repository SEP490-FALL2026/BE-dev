import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { UsageImportListeners } from '../../../src/modules/usage/public/usage.extension-points';
import type { ApiAccount } from '../../support/api-accounts';
import { InvoiceHarness } from '../../support/invoice-harness';

const h = new InvoiceHarness();
const CODE = 'OUT_OF_PROCESS_CASE_REPORTED';

interface Notice {
  recipient_employee_id: string;
  subject_type: string | null;
  subject_id: string | null;
  event_key: string;
  params: Record<string, unknown>;
}

/**
 * A case outside the process closed as a report only tells the person it is about and the head of their department (`SBF-07a` §5.1, `QĐ-103m`, B6,
 * FX-T5): the head of the department they last worked in, also when they have left. A case about nobody in particular tells nobody, and no other
 * way of closing a case tells anyone. On real PostgreSQL, through the routes.
 */
describe('the notices of a case outside the process closed as a report over PostgreSQL (FX-T5)', () => {
  let applicationId: string;
  let vendorId: string;
  let serial = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const plan = await h.planOf(await h.subscription(20, 'K2'));
    vendorId = (await h.vendorOf(plan)).id;
    applicationId = (
      await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [plan])
    ).rows[0].application_id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const call = (method: 'get' | 'post', path: string, account: ApiAccount) =>
    request(h.server())[method](path).set(h.as(account));
  const noticesOf = async (caseId: string): Promise<Notice[]> =>
    (
      await h.ctx.sql.query<Notice>(
        `SELECT recipient_employee_id, subject_type, subject_id::text, event_key, params
           FROM in_app_notifications WHERE code = $1 AND event_key = $2 ORDER BY recipient_employee_id`,
        [CODE, `${CODE}:${caseId}`],
      )
    ).rows;
  const confirmed = (importId: string): Promise<void> =>
    h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(UsageImportListeners, { strict: false }).emit(tx, {
        moment: 'CONFIRMED',
        importId,
        sourceId: randomUUID(),
        applicationId,
        coverageTo: `${h.year}-10-31`,
      }),
    );
  /** The case of a person: an account with activity and no seat, decided by the IT Admin as outside the process. */
  const caseOfPerson = async (employeeId: string): Promise<string> => {
    const importId = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO usage_no_assignment_findings (organization_id, application_id, employee_id, first_activity_date, last_activity_date, last_import_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')`,
      [h.seed.organizationId, applicationId, employeeId, `${h.year}-10-01`, `${h.year}-10-20`, importId],
    );
    await confirmed(importId);

    return decideOutside(`&source=NO_ASSIGNMENT`, (item) => item.employeeId === employeeId);
  };
  /** The case of an identifier nobody owns: it names no person. */
  const caseOfNobody = async (): Promise<string> => {
    const importId = randomUUID();
    const raw = `lạ-${randomUUID()}@congty.vn`;
    await h.ctx.sql.query(
      `INSERT INTO usage_unmatched_identities (organization_id, application_id, source_id, identifier_type, normalized_identifier, raw_identifier,
         reason, status, candidate_employee_ids, first_import_id, last_import_id)
       VALUES ($1, $2, $3, 'EMAIL', lower($4), $4, 'NOT_FOUND', 'OPEN', '{}', $5, $5)`,
      [h.seed.organizationId, applicationId, randomUUID(), raw, importId],
    );
    await confirmed(importId);

    return decideOutside(`&source=UNMATCHED_IDENTITY`, (item) => item.identity === raw);
  };
  const decideOutside = async (
    query: string,
    pick: (item: { id: string; employeeId: string | null; identity: string | null }) => boolean,
  ): Promise<string> => {
    const page = h.dataOf<{ items: Array<{ id: string; employeeId: string | null; identity: string | null }> }>(
      await call('get', `/api/v1/vendor-account-discrepancies?pageSize=100&state=OPEN${query}`, h.it1).expect(200),
    );
    const found = page.items.find(pick) as { id: string };

    return h.dataOf<{ outOfProcessCaseId: string }>(
      await call('post', `/api/v1/vendor-account-discrepancies/${found.id}/decision`, h.it1)
        .send({ decision: 'OUT_OF_PROCESS', companyAsset: false, note: 'Ngoài quy trình' })
        .expect(201),
    ).outOfProcessCaseId;
  };
  const closure = (caseId: string, account: ApiAccount) =>
    call('post', `/api/v1/out-of-process-cases/${caseId}/closure`, account);
  const unit = async () => {
    serial += 1;

    return h.departmentWithHead(`P-OR${serial}`);
  };

  it('tells the person and the head of their department, once, with ids only, when the case is closed as a report', async () => {
    const { head, member } = await unit();
    const caseId = await caseOfPerson(member.employeeId);

    await closure(caseId, h.it1).send({ outcome: 'REPORT_ONLY', note: 'Chỉ ghi nhận' }).expect(201);

    const notices = await noticesOf(caseId);
    expect(notices.map((notice) => notice.recipient_employee_id).sort()).toEqual(
      [head.employeeId, member.employeeId].sort(),
    );
    for (const notice of notices) {
      expect(notice).toMatchObject({
        subject_type: 'OUT_OF_PROCESS_CASE',
        subject_id: caseId,
        params: { caseId, applicationId, vendorId, employeeId: member.employeeId },
      });
      expect(Object.keys(notice.params).sort()).toEqual(['applicationId', 'caseId', 'employeeId', 'vendorId']);
    }
  });

  it('tells only the person when they head their department themselves (one notice, not two)', async () => {
    const { head } = await unit();
    const caseId = await caseOfPerson(head.employeeId);

    await closure(caseId, h.it1).send({ outcome: 'REPORT_ONLY', note: 'Chỉ ghi nhận' }).expect(201);

    expect((await noticesOf(caseId)).map((notice) => notice.recipient_employee_id)).toEqual([head.employeeId]);
  });

  it('still tells the person who has left and the head of the department they last worked in', async () => {
    const { head, member } = await unit();
    const caseId = await caseOfPerson(member.employeeId);
    await h.ctx.sql.query(
      `UPDATE employee_placements SET valid_to = valid_from + 1 WHERE employee_id = $1 AND valid_to IS NULL`,
      [member.employeeId],
    );

    await closure(caseId, h.it1).send({ outcome: 'REPORT_ONLY', note: 'Đã nghỉ' }).expect(201);

    expect((await noticesOf(caseId)).map((notice) => notice.recipient_employee_id).sort()).toEqual(
      [head.employeeId, member.employeeId].sort(),
    );
  });

  it('O-05: keeps the notice for the first head of a department that has none, and hands it to them once when they are named', async () => {
    serial += 1;
    const department = await h.departmentWithUnit(`P-OR${serial}`);
    const member = await h.staff(department, `P-OR${serial}-E`);
    const caseId = await caseOfPerson(member.employeeId);

    await closure(caseId, h.it1).send({ outcome: 'REPORT_ONLY', note: 'Chưa có trưởng phòng' }).expect(201);

    expect((await noticesOf(caseId)).map((notice) => notice.recipient_employee_id)).toEqual([member.employeeId]);

    const head = await h.staff(department, `P-OR${serial}-H`);
    await h.makeHead(department, head);

    const notices = await noticesOf(caseId);
    expect(notices.map((notice) => notice.recipient_employee_id).sort()).toEqual(
      [head.employeeId, member.employeeId].sort(),
    );
    expect(notices.find((notice) => notice.recipient_employee_id === head.employeeId)).toMatchObject({
      subject_type: 'OUT_OF_PROCESS_CASE',
      subject_id: caseId,
      event_key: `${CODE}:${caseId}`,
      params: { caseId, applicationId, vendorId, employeeId: member.employeeId },
    });
  });

  it('tells nobody when the case is about no person', async () => {
    const caseId = await caseOfNobody();

    await closure(caseId, h.it1).send({ outcome: 'REPORT_ONLY', note: 'Không rõ ai' }).expect(201);

    expect(await noticesOf(caseId)).toEqual([]);
  });

  it('tells nobody when the case is closed as a false alarm', async () => {
    const { member } = await unit();
    const caseId = await caseOfPerson(member.employeeId);

    await closure(caseId, h.it1).send({ outcome: 'FALSE_ALARM', note: 'Nhầm' }).expect(201);

    expect(await noticesOf(caseId)).toEqual([]);
  });
});
