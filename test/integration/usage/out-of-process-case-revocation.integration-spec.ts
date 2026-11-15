import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PgRelay } from '../../support/pg-relay';
import { pretendBusinessToday } from '../../support/pretend-today';
import { dataStatements, QueryCounter } from '../../support/query-count';
import type { Person } from '../../support/request-harness';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();

interface RevocationWire {
  required: boolean;
  waitingRequestId: string | null;
  waitUntil: string | null;
  due: boolean;
}
interface CaseWire {
  id: string;
  state: string;
  revocation: RevocationWire;
}

/** Tuesday 04/08/2026: the day the IT Admin concluded the cases below, the first of the ten working days (US-13-05 AC-23, ceiling 17/08). */
const CONCLUDED = '2026-08-04';
const NOT_REQUIRED: RevocationWire = { required: false, waitingRequestId: null, waitUntil: null, due: false };

/**
 * What a case outside the process says of the revocation the IT Admin has to do (`FIX-B3b` OOP-1a; `US-13-05` AC-20, AC-23, AC-24): worked out when the case is
 * read from the Request the person sent for the same software, in the calendar of the organization, and kept nowhere. On real PostgreSQL, over HTTP.
 */
describe('the revocation a case on a company asset asks of the IT Admin (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let applicationId: string;
  let planId: string;
  let unit: Unit;
  let n = 0;

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    await h.withApprover();
    planId = await h.planOf(await h.subscription(40, 'K2'));
    applicationId = (
      await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [planId])
    ).rows[0].application_id;
    unit = await h.departmentWithHead('P-RV1');
  }, 300000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const person = async (): Promise<Person> => {
    n += 1;

    return h.staff(unit.department, `RV-E${n}`);
  };
  /**
   * A case outside the process as the decision of the IT Admin leaves it: the difference decided as OUT_OF_PROCESS (of the person, or of an identifier nobody
   * owns when there is no person) and the case concluded on a day of our choice, which the route cannot give.
   */
  const caseOf = async (
    who: Person | null,
    over: { companyAsset?: boolean | null; state?: 'OPEN' | 'CLOSED' } = {},
  ): Promise<string> => {
    n += 1;
    const caseId = randomUUID();
    const discrepancyId = randomUUID();
    const state = over.state ?? 'OPEN';
    await h.ctx.sql.query(
      `INSERT INTO vendor_account_discrepancies (id, organization_id, source, source_ref, application_id, employee_id, identity, internal_value, vendor_value,
         evidence_on, first_seen_at, last_seen_at, state, decision, decision_note, decided_by_employee_id, decided_at, out_of_process_case_id)
       VALUES ($1, $2, $3::"VendorAccountDiscrepancySource", $4, $5, $6, $7, 'no seat', 'active', $8, now(), now(), 'DECIDED', 'OUT_OF_PROCESS', 'outside', $9, now(), $10)`,
      [
        discrepancyId,
        h.seed.organizationId,
        who ? 'NO_ASSIGNMENT' : 'UNMATCHED_IDENTITY',
        `rv-${n}`,
        applicationId,
        who?.employeeId ?? null,
        `rv${n}@congty.vn`,
        CONCLUDED,
        h.it1.employeeId,
        caseId,
      ],
    );
    const company = over.companyAsset === undefined ? true : over.companyAsset;
    await h.ctx.sql.query(
      `INSERT INTO out_of_process_cases (id, organization_id, discrepancy_id, application_id, opened_at, state, identity_key, company_asset, concluded_on,
         outcome, note, closed_by_employee_id, closed_at, renewal_cancelled)
       VALUES ($1, $2, $3, $4, now(), $5::"OutOfProcessCaseState", $6, $7, $8, ${state === 'CLOSED' ? `'REPORT_ONLY', 'closed', $9, now()` : 'NULL, NULL, NULL, NULL'}, false)`,
      [
        caseId,
        h.seed.organizationId,
        discrepancyId,
        applicationId,
        state,
        state === 'OPEN' ? `rv:${n}` : null,
        company,
        CONCLUDED,
        ...(state === 'CLOSED' ? [h.it1.employeeId] : []),
      ],
    );

    return caseId;
  };
  const sentBy = async (who: Person): Promise<string> => (await h.sent(who, planId)).id;
  const stateOf = (requestId: string, state: string) =>
    h.ctx.sql.query(`UPDATE access_requests SET state = $2::"AccessRequestState" WHERE id = $1`, [requestId, state]);
  const read = async (account = h.it1): Promise<Map<string, CaseWire>> => {
    const response = await request(h.server())
      .get('/api/v1/out-of-process-cases?pageSize=100')
      .set(h.as(account))
      .expect(200);

    return new Map(h.dataOf<{ items: CaseWire[] }>(response).items.map((item) => [item.id, item]));
  };
  const revocationOf = async (caseId: string, account = h.it1) => (await read(account)).get(caseId)?.revocation;

  it('is due at once for a person who sent no Request (AC-20): nothing to wait for, no ceiling', async () => {
    pretendBusinessToday(h.ctx.app, CONCLUDED);
    const id = await caseOf(await person());

    expect(await revocationOf(id)).toEqual({ required: true, waitingRequestId: null, waitUntil: null, due: true });
  });

  it('is due at once for a case that names no person, as the identifier nobody owns has no Request to wait for', async () => {
    pretendBusinessToday(h.ctx.app, CONCLUDED);
    const id = await caseOf(null);

    expect(await revocationOf(id)).toEqual({ required: true, waitingRequestId: null, waitUntil: null, due: true });
  });

  it('waits for the Request R of the person up to the tenth working day, 04/08 giving 17/08, and is due the day after (AC-23)', async () => {
    const who = await person();
    const requestId = await sentBy(who);
    const id = await caseOf(who);

    pretendBusinessToday(h.ctx.app, '2026-08-17');
    expect(await revocationOf(id)).toEqual({
      required: true,
      waitingRequestId: requestId,
      waitUntil: '2026-08-17',
      due: false,
    });
    pretendBusinessToday(h.ctx.app, '2026-08-18');
    expect(await revocationOf(id)).toEqual({
      required: true,
      waitingRequestId: requestId,
      waitUntil: '2026-08-17',
      due: true,
    });
  });

  it('waits on for the decision with no ceiling once the Request is at the step of the spending approver, however late it comes', async () => {
    const who = await person();
    const requestId = await sentBy(who);
    await stateOf(requestId, 'AWAITING_SPEND_DECISION');
    await h.ctx.sql.query(`UPDATE access_requests SET spend_queued_at = '2026-08-12T03:00:00Z' WHERE id = $1`, [
      requestId,
    ]);
    const id = await caseOf(who);

    pretendBusinessToday(h.ctx.app, '2026-09-30');
    expect(await revocationOf(id)).toEqual({
      required: true,
      waitingRequestId: requestId,
      waitUntil: null,
      due: false,
    });
  });

  it('is due when the Request came to that step only after the ceiling: the task was made at the ceiling and the Request goes on', async () => {
    const who = await person();
    const requestId = await sentBy(who);
    await stateOf(requestId, 'AWAITING_SPEND_SUBMISSION');
    await h.ctx.sql.query(`UPDATE access_requests SET spend_queued_at = '2026-08-18T03:00:00Z' WHERE id = $1`, [
      requestId,
    ]);
    const id = await caseOf(who);

    pretendBusinessToday(h.ctx.app, '2026-08-19');
    expect(await revocationOf(id)).toEqual({
      required: true,
      waitingRequestId: requestId,
      waitUntil: '2026-08-17',
      due: true,
    });
  });

  it('asks nothing once the Request is approved: the grant goes by the task of the Request (AC-23)', async () => {
    const who = await person();
    const requestId = await sentBy(who);
    await stateOf(requestId, 'AWAITING_EXECUTION');
    const id = await caseOf(who);

    pretendBusinessToday(h.ctx.app, '2026-09-30');
    expect(await revocationOf(id)).toEqual(NOT_REQUIRED);
  });

  it('is due at once when the Request was refused or withdrawn: the person has none to wait for any more (AC-23)', async () => {
    const who = await person();
    const requestId = await sentBy(who);
    await h.decide(requestId, { decision: 'REJECT', reason: 'Not needed this quarter' }, unit.head.account).expect(200);
    const id = await caseOf(who);

    pretendBusinessToday(h.ctx.app, '2026-08-05');
    expect(await revocationOf(id)).toEqual({ required: true, waitingRequestId: null, waitUntil: null, due: true });
  });

  it('asks nothing of a case on a personal account (AC-21, AC-24 (c)) or of a case that is closed', async () => {
    const personal = await caseOf(await person(), { companyAsset: false });
    const closed = await caseOf(await person(), { state: 'CLOSED' });
    pretendBusinessToday(h.ctx.app, '2026-09-30');

    const cases = await read();
    expect(cases.get(personal)?.revocation).toEqual(NOT_REQUIRED);
    expect(cases.get(closed)?.revocation).toEqual(NOT_REQUIRED);
  });

  it('is read the same by Finance, who lists the cases too', async () => {
    const id = await caseOf(await person());
    pretendBusinessToday(h.ctx.app, CONCLUDED);

    expect((await revocationOf(id, h.finance))?.due).toBe(true);
  });

  it('costs the same number of statements for a page of one case as for a page of several people with Requests of their own', async () => {
    const asker = await person();
    await sentBy(asker);
    const first = await caseOf(asker);
    pretendBusinessToday(h.ctx.app, '2026-08-10');
    const get = () => request(h.server()).get('/api/v1/out-of-process-cases?pageSize=100').set(h.as(h.it1));
    const small = await counter.run(() => get());
    expect(small.result.status).toBe(200);
    jest.restoreAllMocks();

    for (let i = 0; i < 4; i += 1) {
      const who = await person();
      await sentBy(who);
      await caseOf(who);
    }
    pretendBusinessToday(h.ctx.app, '2026-08-10');
    const big = await counter.run(() => get());

    expect(big.result.status).toBe(200);
    expect(first).toBeDefined();
    expect(dataStatements(big.statements)).toHaveLength(dataStatements(small.statements).length);
  });
});
