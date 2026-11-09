import { randomUUID } from 'node:crypto';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();
const CHECK = '23514';
const DRAFT_HAS_NO_WORK = 'access_requests_draft_has_no_work';

/** What a rejected statement says: the SQLSTATE and the constraint that refused it, so that the right constraint is the one proven. */
interface Refusal {
  code: string;
  constraint: string | null;
}

async function refusal(text: string, values: unknown[] = []): Promise<Refusal | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    const { code, constraint } = error as { code?: string; constraint?: string };

    return { code: code ?? 'unknown', constraint: constraint ?? null };
  }
}

/** The refusal of a CHECK, or of the trigger that raises 23514 for a draft, by name. */
const refusedBy = (constraint: string): Refusal => ({ code: CHECK, constraint });

type ChildInsert = (requestId: string) => Promise<Refusal | null>;

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.6, F27, F29, F71, spec L.1: the draft of a paid request is a row of
 * `access_requests` with state `DRAFT`. In the database a request carries its Cost Center and its submission moment unless it is a
 * draft, a draft has no work (no step, no budget check, no commitment, no batch item), and a draft is judged by the price and group
 * rules of a request only when it is sent. Every case is a statement written by hand on real PostgreSQL, so it is the constraint,
 * not the application, that says yes or no; each refusal is checked by the name of the constraint that refused it.
 */
describe('the draft of a request (integration, PostgreSQL constraints)', () => {
  let department: Department;
  let person: Person;
  let internalPlan: string;
  let paidPlan: string;
  let reportingCurrency: string;
  let checkTrigger: string;
  let checkRoute: string;

  const firstLabel = async (type: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ enumlabel: string }>(
        `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder LIMIT 1`,
        [type],
      )
    ).rows[0].enumlabel;

  beforeAll(async () => {
    await h.start();
    department = await h.departmentWithUnit('P-DRAFT');
    person = await h.staff(department, 'DRAFT-E1');
    internalPlan = await h.plan('K5');
    paidPlan = await h.plan('K2');
    reportingCurrency = (
      await h.ctx.sql.query<{ reporting_currency: string }>(`SELECT reporting_currency FROM organizations LIMIT 1`)
    ).rows[0].reporting_currency;
    checkTrigger = await firstLabel('BudgetCheckTrigger');
    // `BLOCKED` is the route of a check with a problem in the data (`request_budget_checks_blocked_check`); this one has none.
    checkRoute = 'SPEND_APPROVAL';
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const cast = (column: string): string =>
    column === 'type'
      ? '::"AccessRequestType"'
      : column === 'branch'
        ? '::"AccessRequestBranch"'
        : column === 'state'
          ? '::"AccessRequestState"'
          : column === 'policy' || column === 'payment_schedule'
            ? '::jsonb'
            : column === 'pricing_status'
              ? '::"AccessRequestPricingStatus"'
              : column === 'billing_cycle'
                ? '::"BillingCycle"'
                : '';

  /** A request row with the columns a test changes; every other column is valid for a request of internal software. */
  const insertRequest = async (
    over: Record<string, unknown> = {},
  ): Promise<{ id: string; refused: Refusal | null }> => {
    const id = randomUUID();
    const row: Record<string, unknown> = {
      organization_id: h.seed.organizationId,
      branch: 'INTERNAL_FREE',
      state: 'PENDING',
      plan_id: internalPlan,
      requester_employee_id: person.employeeId,
      department_id: department.id,
      cost_center_id: department.unitId,
      business_reason: 'Design the new brand',
      term_months: 6,
      policy: JSON.stringify({ version: 1 }),
      created_by_app_user_id: randomUUID(),
      ...over,
    };
    const columns = Object.keys(row);
    const refused = await refusal(
      `INSERT INTO access_requests (id, ${columns.join(', ')})
       VALUES ($1, ${columns.map((column, index) => `$${index + 2}${cast(column)}`).join(', ')})`,
      [id, ...columns.map((column) => row[column])],
    );

    return { id, refused };
  };
  /** A draft: no submission moment, and by default the Cost Center of the department (`cost_center_id: null` for a department with none). */
  const draft = (over: Record<string, unknown> = {}) => insertRequest({ state: 'DRAFT', submitted_at: null, ...over });
  /** The draft is sent: it becomes a request with its Cost Center and its submission moment. */
  const send = (requestId: string) =>
    refusal(`UPDATE access_requests SET state = 'PENDING', cost_center_id = $2, submitted_at = now() WHERE id = $1`, [
      requestId,
      department.unitId,
    ]);

  describe('the Cost Center and the submission moment', () => {
    it('takes a draft with neither, and a draft that already names a Cost Center', async () => {
      expect((await draft({ cost_center_id: null })).refused).toBeNull();
      expect((await draft()).refused).toBeNull();
    });

    it('refuses a request that costs money and has no Cost Center, by access_requests_cost_center_unless_draft', async () => {
      const priced = {
        branch: 'PAID_IN_CATALOG',
        plan_id: paidPlan,
        pricing_status: 'PRICED',
        amount_minor: '100000',
        amount_currency: reportingCurrency,
        unit_price_minor: '100000',
        billing_cycle: 'MONTHLY',
        budget_year: 2026,
      };

      expect((await insertRequest({ ...priced, cost_center_id: null })).refused).toEqual(
        refusedBy('access_requests_cost_center_unless_draft'),
      );
      expect((await insertRequest({ ...priced })).refused).toBeNull();
    });

    it('takes a free internal request that has no Cost Center, and refuses a service account that has none (F91, QĐ-87g(2))', async () => {
      // Nothing is charged for it, so nothing is attributed: the department may have no Cost Center in use.
      expect((await insertRequest({ cost_center_id: null })).refused).toBeNull();
      // The seat of a service account is charged to the Unit of its department, free or not (QĐ-86a): the check answers before the
      // detail row that the type needs at commit does.
      expect((await insertRequest({ type: 'SERVICE_ACCOUNT', cost_center_id: null })).refused).toEqual(
        refusedBy('access_requests_cost_center_unless_draft'),
      );
    });

    it('refuses a draft that carries a submission moment and a request that has none, by access_requests_submitted_unless_draft', async () => {
      // The column keeps its default when it is not named, so this draft says it was submitted now.
      expect((await insertRequest({ state: 'DRAFT', cost_center_id: null })).refused).toEqual(
        refusedBy('access_requests_submitted_unless_draft'),
      );
      expect((await insertRequest({ submitted_at: null })).refused).toEqual(
        refusedBy('access_requests_submitted_unless_draft'),
      );
    });

    it('lets a draft become a request only with its Cost Center and its submission moment', async () => {
      const { id } = await draft({ cost_center_id: null });

      // Neither is there yet: the two checks both refuse it, and which of them answers first is not the point.
      expect(await refusal(`UPDATE access_requests SET state = 'PENDING' WHERE id = $1`, [id])).toMatchObject({
        code: CHECK,
      });
      expect(
        await refusal(`UPDATE access_requests SET state = 'PENDING', cost_center_id = $2 WHERE id = $1`, [
          id,
          department.unitId,
        ]),
      ).toEqual(refusedBy('access_requests_submitted_unless_draft'));
      expect(await send(id)).toBeNull();
    });
  });

  describe('a draft has no work (access_requests_draft_has_no_work)', () => {
    const children: ReadonlyArray<readonly [string, ChildInsert]> = [
      [
        'an approval step',
        (requestId) =>
          refusal(
            `INSERT INTO access_request_steps (id, request_id, kind, sequence, state, assignee_employee_id, routing_row,
               sla_working_days, assigned_at)
             VALUES (gen_random_uuid(), $1, 'NEED', 1, 'PENDING', $2, 1, 2, now())`,
            [requestId, person.employeeId],
          ),
      ],
      [
        'a budget check',
        (requestId) =>
          refusal(
            `INSERT INTO request_budget_checks (id, organization_id, request_id, number, trigger, route, stale_cost_evidence,
               plan_line_overdue, period_closed, off_plan, currency, binding_total_minor, outcome)
             VALUES (gen_random_uuid(), $1, $2, 1, $3::"BudgetCheckTrigger", $4::"BudgetCheckRoute", false, false, false, false, $5, 1,
               'WITHIN_BASE')`,
            [h.seed.organizationId, requestId, checkTrigger, checkRoute, reportingCurrency],
          ),
      ],
      [
        'a commitment',
        (requestId) =>
          refusal(
            `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency,
               unattached_reason)
             VALUES (gen_random_uuid(), $1, $2, $3, 2027, 100, $4, 'NO_BUDGET')`,
            [h.seed.organizationId, requestId, department.unitId, reportingCurrency],
          ),
      ],
      [
        'a spend batch item',
        async (requestId) => {
          const batch = (
            await h.ctx.sql.query<{ id: string }>(
              `INSERT INTO spend_batches (id, organization_id, department_id, submitted_by_employee_id)
               VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
              [h.seed.organizationId, department.id, person.employeeId],
            )
          ).rows[0].id;

          return refusal(
            `INSERT INTO spend_batch_items (batch_id, request_id, position, outcome) VALUES ($1, $2, 1, 'SENT_TO_APPROVER')`,
            [batch, requestId],
          );
        },
      ],
    ];

    it.each(children)(
      'refuses %s of a draft (23514) and takes it once the request is no longer a draft',
      async (_name, insertChild) => {
        const { id, refused } = await draft({ cost_center_id: null });
        expect(refused).toBeNull();

        expect(await insertChild(id)).toEqual(refusedBy(DRAFT_HAS_NO_WORK));
        // Still a draft after a change that does not send it: the work is refused as before, and nothing was written.
        expect(await refusal(`UPDATE access_requests SET state = 'PENDING' WHERE id = $1`, [id])).toMatchObject({
          code: CHECK,
        });
        expect(await insertChild(id)).toEqual(refusedBy(DRAFT_HAS_NO_WORK));

        expect(await send(id)).toBeNull();
        expect(await insertChild(id)).toBeNull();
      },
    );

    it('takes the same work for a request that was never a draft', async () => {
      for (const [, insertChild] of children) {
        const { id, refused } = await insertRequest();
        expect(refused).toBeNull();

        expect(await insertChild(id)).toBeNull();
      }
    });
  });

  describe('a draft is judged by the price and group rules of a request when it is sent (F71)', () => {
    // A function: the plan exists only once the suite has started.
    const priced = () => ({
      branch: 'PAID_IN_CATALOG',
      plan_id: paidPlan,
      pricing_status: 'PRICED',
      amount_minor: 90,
      amount_currency: 'USD',
      unit_price_minor: 15,
      billing_cycle: 'MONTHLY',
      budget_year: 2027,
    });

    it('takes the draft of an individual paid plan with the price columns at their default, and refuses the same row as a request', async () => {
      // The branch of a plan with a price, with the price columns of a request that is not priced yet (status NOT_APPLICABLE, no amount).
      const unpriced = { branch: 'PAID_IN_CATALOG', plan_id: paidPlan };

      expect((await draft(unpriced)).refused).toBeNull();
      expect((await draft({ ...unpriced, cost_center_id: null })).refused).toBeNull();
      expect((await insertRequest(unpriced)).refused).toEqual(refusedBy('access_requests_pricing_check'));
    });

    it('takes the draft of a group request for an internal plan, and refuses the same row as a request', async () => {
      const group = { type: 'GROUP_GRANT', branch: 'INTERNAL_FREE', plan_id: internalPlan };

      expect((await draft(group)).refused).toBeNull();
      expect((await draft({ ...group, cost_center_id: null })).refused).toBeNull();
      expect((await insertRequest(group)).refused).toEqual(refusedBy('access_requests_group_check'));
    });

    it('still takes a request that is priced, and a request of a group for a paid plan, as before', async () => {
      expect((await insertRequest(priced())).refused).toBeNull();
      expect((await insertRequest({ ...priced(), type: 'GROUP_GRANT' })).refused).toBeNull();
      expect((await insertRequest({ ...priced(), amount_minor: null })).refused).toEqual(
        refusedBy('access_requests_pricing_check'),
      );
    });
  });
});
