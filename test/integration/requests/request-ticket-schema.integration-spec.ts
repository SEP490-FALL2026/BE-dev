import { randomUUID } from 'node:crypto';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

interface SqlFailure {
  code: string;
  constraint?: string;
}

async function runSql(text: string, values: unknown[] = []): Promise<SqlFailure | null> {
  try {
    await h.ctx.sql.query(text, values);
    return null;
  } catch (error) {
    const pgError = error as { code?: string; constraint?: string };
    return { code: pgError.code ?? 'unknown', constraint: pgError.constraint };
  }
}

const CHECK = '23514';
const UNIQUE = '23505';
const RESTRICT = '23001';

describe('request_tickets and access_requests ticket columns (integration, PostgreSQL constraints)', () => {
  let department: Department;
  let person: Person;
  let paidPlanId: string;
  let internalPlanId: string;

  beforeAll(async () => {
    await h.start();
    department = await h.departmentWithUnit('P-TKS');
    person = await h.staff(department, 'TKS-E1');
    paidPlanId = await h.plan('K2');
    internalPlanId = await h.plan('K5');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const insertTicket = async (): Promise<{ id: string; failure: SqlFailure | null }> => {
    const id = randomUUID();
    const failure = await runSql(
      `INSERT INTO request_tickets (id, organization_id, requester_employee_id, department_id, submitted_at)
       VALUES ($1, $2, $3, $4, now())`,
      [id, h.seed.organizationId, person.employeeId, department.id],
    );
    return { id, failure };
  };

  const cast = (column: string): string => {
    if (column === 'type') return '::"AccessRequestType"';
    if (column === 'branch') return '::"AccessRequestBranch"';
    if (column === 'state') return '::"AccessRequestState"';
    if (column === 'pricing_status') return '::"AccessRequestPricingStatus"';
    if (column === 'price_kind') return '::"AccessRequestPriceKind"';
    if (column === 'billing_cycle') return '::"BillingCycle"';
    if (column === 'policy') return '::jsonb';
    return '';
  };

  const insertRequest = async (
    over: Record<string, unknown> = {},
  ): Promise<{ id: string; failure: SqlFailure | null }> => {
    const id = randomUUID();
    const row: Record<string, unknown> = {
      organization_id: h.seed.organizationId,
      type: 'GRANT',
      branch: 'PAID_IN_CATALOG',
      state: 'PENDING',
      plan_id: paidPlanId,
      requester_employee_id: person.employeeId,
      department_id: department.id,
      cost_center_id: department.unitId,
      business_reason: 'Ticket schema check',
      term_months: 6,
      pricing_status: 'PRICED',
      price_kind: 'RECURRING',
      billing_cycle: 'MONTHLY',
      amount_minor: 6000,
      amount_currency: 'VND',
      unit_price_minor: 1000,
      monthly_price_minor: 1000,
      budget_year: 2026,
      policy: JSON.stringify({ version: 1 }),
      created_by_app_user_id: randomUUID(),
      ...over,
    };
    const columns = Object.keys(row);
    const failure = await runSql(
      `INSERT INTO access_requests (id, ${columns.join(', ')})
       VALUES ($1, ${columns.map((column, index) => `$${index + 2}${cast(column)}`).join(', ')})`,
      [id, ...columns.map((column) => row[column])],
    );
    return { id, failure };
  };

  it('accepts a request ticket, ticket items at positions 1..6, and standalone requests without ticket columns', async () => {
    const ticket = await insertTicket();
    expect(ticket.failure).toBeNull();
    expect((await insertRequest({ ticket_id: ticket.id, ticket_position: 1 })).failure).toBeNull();
    expect((await insertRequest({ ticket_id: ticket.id, ticket_position: 6 })).failure).toBeNull();
    expect((await insertRequest()).failure).toBeNull();
  });

  it('enforces access_requests_ticket_pair (23514): ticket_id and ticket_position must both be set or both null', async () => {
    const ticket = await insertTicket();
    expect(await insertRequest({ ticket_id: ticket.id, ticket_position: null })).toMatchObject({
      failure: { code: CHECK, constraint: 'access_requests_ticket_pair' },
    });
    expect(await insertRequest({ ticket_id: null, ticket_position: 1 })).toMatchObject({
      failure: { code: CHECK, constraint: 'access_requests_ticket_pair' },
    });
  });

  it('enforces access_requests_ticket_position_range (23514): rejects position outside 1..6', async () => {
    const ticket = await insertTicket();
    expect(await insertRequest({ ticket_id: ticket.id, ticket_position: 7 })).toMatchObject({
      failure: { code: CHECK, constraint: 'access_requests_ticket_position_range' },
    });
    expect(await insertRequest({ ticket_id: ticket.id, ticket_position: 0 })).toMatchObject({
      failure: { code: CHECK, constraint: 'access_requests_ticket_position_range' },
    });
  });

  it('enforces access_requests_ticket_kind (23514): rejects GROUP_GRANT or INTERNAL_FREE with a ticket_id', async () => {
    const ticket = await insertTicket();
    expect(await insertRequest({ type: 'GROUP_GRANT', ticket_id: ticket.id, ticket_position: 1 })).toMatchObject({
      failure: { code: CHECK, constraint: 'access_requests_ticket_kind' },
    });
    expect(
      await insertRequest({
        branch: 'INTERNAL_FREE',
        plan_id: internalPlanId,
        pricing_status: 'NOT_APPLICABLE',
        price_kind: null,
        billing_cycle: null,
        amount_minor: null,
        amount_currency: null,
        unit_price_minor: null,
        monthly_price_minor: null,
        budget_year: null,
        ticket_id: ticket.id,
        ticket_position: 2,
      }),
    ).toMatchObject({
      failure: { code: CHECK, constraint: 'access_requests_ticket_kind' },
    });
  });

  it('enforces unique (ticket_id, ticket_position) (23505)', async () => {
    const ticket = await insertTicket();
    expect((await insertRequest({ ticket_id: ticket.id, ticket_position: 1 })).failure).toBeNull();
    expect(await insertRequest({ ticket_id: ticket.id, ticket_position: 1 })).toMatchObject({
      failure: { code: UNIQUE },
    });
  });

  it('rejects changing ticket_id or ticket_position via trigger on access_requests while allowing other updates', async () => {
    const ticketA = await insertTicket();
    const ticketB = await insertTicket();
    const item = await insertRequest({ ticket_id: ticketA.id, ticket_position: 1 });
    const standalone = await insertRequest();

    expect(
      await runSql(`UPDATE access_requests SET ticket_id = $2 WHERE id = $1`, [item.id, ticketB.id]),
    ).toMatchObject({ code: RESTRICT });
    expect(await runSql(`UPDATE access_requests SET ticket_position = 2 WHERE id = $1`, [item.id])).toMatchObject({
      code: RESTRICT,
    });
    expect(
      await runSql(`UPDATE access_requests SET ticket_id = $2, ticket_position = 1 WHERE id = $1`, [
        standalone.id,
        ticketA.id,
      ]),
    ).toMatchObject({ code: RESTRICT });
    expect(await runSql(`UPDATE access_requests SET state = 'REJECTED' WHERE id = $1`, [item.id])).toBeNull();
  });

  it('rejects UPDATE and DELETE on request_tickets via append-only trigger', async () => {
    const ticket = await insertTicket();

    expect(await runSql(`UPDATE request_tickets SET submitted_at = now() WHERE id = $1`, [ticket.id])).toMatchObject({
      code: RESTRICT,
    });
    expect(await runSql(`DELETE FROM request_tickets WHERE id = $1`, [ticket.id])).toMatchObject({
      code: RESTRICT,
    });
  });
});
