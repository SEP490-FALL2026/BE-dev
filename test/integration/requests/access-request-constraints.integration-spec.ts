import { randomUUID } from 'node:crypto';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

const CHECK = '23514';
const UNIQUE = '23505';
const FOREIGN_KEY = '23503';

describe('requests (integration, PostgreSQL constraints)', () => {
  let department: Department;
  let person: Person;
  let planId: string;

  beforeAll(async () => {
    await h.start();
    department = await h.departmentWithUnit('P-CON');
    person = await h.staff(department, 'CON-E1');
    planId = await h.plan('K5');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A request row with the columns a test changes; every other column is valid. */
  const insertRequest = async (over: Record<string, unknown> = {}): Promise<{ id: string; state: string | null }> => {
    const id = randomUUID();
    const row = {
      organization_id: h.seed.organizationId,
      branch: 'INTERNAL_FREE',
      state: 'PENDING',
      plan_id: planId,
      requester_employee_id: person.employeeId,
      department_id: department.id,
      cost_center_id: department.unitId,
      business_reason: 'Design the new brand',
      term_months: 6,
      project_label: null,
      policy: JSON.stringify({ version: 1 }),
      created_by_app_user_id: randomUUID(),
      ...over,
    };
    const columns = Object.keys(row);
    const state = await sqlState(
      `INSERT INTO access_requests (id, ${columns.join(', ')})
       VALUES ($1, ${columns.map((column, index) => `$${index + 2}${cast(column)}`).join(', ')})`,
      [id, ...columns.map((column) => (row as Record<string, unknown>)[column])],
    );

    return { id, state };
  };
  const cast = (column: string): string =>
    column === 'branch'
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

  const insertStep = (requestId: string, over: Record<string, unknown> = {}) => {
    const row = {
      id: randomUUID(),
      request_id: requestId,
      sequence: 1,
      state: 'PENDING',
      assignee_employee_id: person.employeeId,
      routing_row: 1,
      waiting_reason: null,
      sla_working_days: 2,
      assigned_at: new Date(),
      ...over,
    };
    const columns = Object.keys(row);

    return sqlState(
      `INSERT INTO access_request_steps (kind, ${columns.join(', ')})
       VALUES ('NEED', ${columns.map((column, index) => `$${index + 1}${column === 'state' ? '::"AccessRequestStepState"' : ''}`).join(', ')})`,
      columns.map((column) => (row as Record<string, unknown>)[column]),
    );
  };

  describe('the request', () => {
    it('takes a complete row', async () => {
      expect((await insertRequest()).state).toBeNull();
    });

    it.each([
      ['a term of zero months', { term_months: 0 }],
      ['a blank reason', { business_reason: '   ' }],
      ['a blank project label', { project_label: '  ' }],
      ['a policy that is not an object', { policy: JSON.stringify(['NEED']) }],
    ])('refuses %s', async (_name, over) => {
      expect((await insertRequest(over)).state).toBe(CHECK);
    });

    it('refuses a plan, a department, a Cost Center or a person that does not exist', async () => {
      for (const over of [
        { plan_id: randomUUID() },
        { department_id: randomUUID() },
        { cost_center_id: randomUUID() },
        { requester_employee_id: randomUUID() },
      ]) {
        expect((await insertRequest(over)).state).toBe(FOREIGN_KEY);
      }
    });
  });

  describe('the amount: each state of a price carries exactly what it means (US-05-02 AC-1, AC-4)', () => {
    const SCHEDULE = JSON.stringify([{ dueOn: '2027-01-05', amountMinor: '90', budgetYear: 2027 }]);
    const priced = {
      branch: 'PAID_IN_CATALOG',
      pricing_status: 'PRICED',
      amount_minor: 90,
      amount_currency: 'USD',
      unit_price_minor: 15,
      billing_cycle: 'MONTHLY',
      payment_schedule: SCHEDULE,
      expected_spend_on: '2027-01-05',
      budget_year: 2027,
    };
    const missing = {
      branch: 'PAID_IN_CATALOG',
      pricing_status: 'MISSING',
      price_missing_reason: 'NO_PRICED_SUBSCRIPTION',
      expected_spend_on: '2027-01-05',
      budget_year: 2027,
    };

    it('takes a priced request, a request missing its price, and internal software with no price at all', async () => {
      expect((await insertRequest(priced)).state).toBeNull();
      expect((await insertRequest(missing)).state).toBeNull();
      expect((await insertRequest()).state).toBeNull();
    });

    it.each([
      ['internal software that carries an amount', { amount_minor: 1, amount_currency: 'USD' }],
      ['internal software that carries a spend day', { expected_spend_on: '2027-01-05', budget_year: 2027 }],
      ['paid software with no price status', { branch: 'PAID_IN_CATALOG' }],
      ['a priced request with no amount', { ...priced, amount_minor: null }],
      ['a priced request with a negative amount', { ...priced, amount_minor: -1 }],
      ['a priced request with no unit price', { ...priced, unit_price_minor: null }],
      ['a priced request with no currency', { ...priced, amount_currency: null }],
      ['a priced request with no payment schedule', { ...priced, payment_schedule: null }],
      ['a priced request with an empty payment schedule', { ...priced, payment_schedule: JSON.stringify([]) }],
      ['a priced request whose schedule is not a list', { ...priced, payment_schedule: JSON.stringify({}) }],
      ['a priced request with no budget year', { ...priced, budget_year: null }],
      ['a priced request that names a missing reason', { ...priced, price_missing_reason: 'NO_PRICED_SUBSCRIPTION' }],
      ['internal software marked as priced', { ...priced, branch: 'INTERNAL_FREE' }],
      ['a missing price with no reason', { ...missing, price_missing_reason: null }],
      ['a missing price with a blank reason', { ...missing, price_missing_reason: '  ' }],
      ['a missing price that carries an amount', { ...missing, amount_minor: 1, amount_currency: 'USD' }],
      ['a missing price with no spend day', { ...missing, expected_spend_on: null }],
    ])('refuses %s', async (_name, over) => {
      expect((await insertRequest(over)).state).toBe(CHECK);
    });

    it('refuses an amount in a currency that does not exist', async () => {
      expect((await insertRequest({ ...priced, amount_currency: 'ZZZ' })).state).toBe(FOREIGN_KEY);
    });
  });

  describe('a proposal of software that is not in the catalog (US-05-06)', () => {
    const awaitingQuote = {
      branch: 'NEW_SOFTWARE',
      plan_id: null,
      pricing_status: 'MISSING',
      price_missing_reason: 'AWAITING_QUOTE',
      expected_spend_on: '2027-01-05',
      budget_year: 2027,
    };

    it('may have no plan, and only the third branch', async () => {
      expect((await insertRequest(awaitingQuote)).state).toBeNull();
      expect((await insertRequest({ ...awaitingQuote, branch: 'PAID_IN_CATALOG' })).state).toBe(CHECK);
      expect((await insertRequest({ plan_id: null })).state).toBe(CHECK);
    });

    const insertProposal = async (over: Record<string, unknown> = {}) => {
      const request = await insertRequest(awaitingQuote);
      const row = {
        request_id: request.id,
        software_name: 'Miro',
        homepage_url: 'https://miro.com',
        purpose: 'Boards',
        data_description: 'Designs',
        expected_users: 5,
        ...over,
      };
      const columns = Object.keys(row);

      return sqlState(
        `INSERT INTO access_request_proposals (${columns.join(', ')}) VALUES (${columns.map((_c, i) => `$${i + 1}`).join(', ')})`,
        columns.map((column) => (row as Record<string, unknown>)[column]),
      );
    };

    it('takes a complete declaration', async () => {
      expect(await insertProposal()).toBeNull();
    });

    it.each([
      ['a blank name', { software_name: ' ' }],
      ['a blank purpose', { purpose: ' ' }],
      ['no description of the data', { data_description: '  ' }],
      ['a homepage that is not a web address', { homepage_url: 'miro.com' }],
      ['a homepage with a space in it', { homepage_url: 'https://mi ro.com' }],
      ['nobody to use it', { expected_users: 0 }],
      ['more users than there are people', { expected_users: 1000001 }],
    ])('refuses %s', async (_name, over) => {
      expect(await insertProposal(over)).toBe(CHECK);
    });

    it('takes one declaration for a request, and none for a request that does not exist', async () => {
      const request = await insertRequest(awaitingQuote);
      const insert = (id: string) =>
        sqlState(
          `INSERT INTO access_request_proposals (request_id, software_name, homepage_url, purpose, data_description, expected_users)
           VALUES ($1, 'Miro', 'https://miro.com', 'Boards', 'Designs', 5)`,
          [id],
        );

      expect(await insert(request.id)).toBeNull();
      expect(await insert(request.id)).toBe(UNIQUE);
      expect(await insert(randomUUID())).toBe(FOREIGN_KEY);
    });
  });

  describe('the assessment of a proposal (US-05-06)', () => {
    const insertAssessment = async (set: string, values: unknown[] = []) => {
      const request = await insertRequest({
        branch: 'NEW_SOFTWARE',
        plan_id: null,
        pricing_status: 'MISSING',
        price_missing_reason: 'AWAITING_QUOTE',
        expected_spend_on: '2027-01-05',
        budget_year: 2027,
      });

      return sqlState(
        `INSERT INTO access_request_assessments (request_id${set ? `, ${set.split('=')[0]}` : ''}) VALUES ($1${set ? `, ${set.split('=')[1]}` : ''})`,
        [request.id, ...values],
      );
    };
    const quote = (valid: string) =>
      `quote_unit_price_minor, quote_currency, quote_billing_cycle, quote_valid_from${valid}`;

    it('opens empty, and takes a whole quote', async () => {
      expect(await insertAssessment('')).toBeNull();
      expect(await insertAssessment(`${quote('')}=800, 'USD', 'MONTHLY', '2026-01-01'`)).toBeNull();
    });

    it.each([
      ['a quote with a price and nothing else', 'quote_unit_price_minor=800'],
      [
        'a quote with no start day',
        "quote_unit_price_minor, quote_currency, quote_billing_cycle=800, 'USD', 'MONTHLY'",
      ],
      [
        'a negative price',
        "quote_unit_price_minor, quote_currency, quote_billing_cycle, quote_valid_from=-1, 'USD', 'MONTHLY', '2026-01-01'",
      ],
      [
        'a quote billed by a cycle that has no name',
        "quote_unit_price_minor, quote_currency, quote_billing_cycle, quote_valid_from=800, 'USD', 'OTHER', '2026-01-01'",
      ],
      [
        'a quote that ends before it starts',
        "quote_unit_price_minor, quote_currency, quote_billing_cycle, quote_valid_from, quote_valid_until=800, 'USD', 'MONTHLY', '2026-02-01', '2026-01-01'",
      ],
      ['a blank vendor name', "vendor_name=' '"],
      ['a blank way to grant and revoke', "grant_revoke_method=' '"],
      ['a note on an opinion that is not there', "opinion_note='A note'"],
      ['a commitment of no months', 'commitment_months=0'],
      ['a completed assessment that says nobody completed it', "status='COMPLETED'"],
      ['a draft that says it was completed', 'completed_at=now()'],
    ])('refuses %s', async (_name, set) => {
      expect(await insertAssessment(set)).toBe(CHECK);
    });

    describe('the refusal at the gate (US-05-18)', () => {
      const REFUSED =
        "status, rejection_kind, rejection_reason, rejected_at, rejected_by_employee_id='REJECTED', 'UNCONTROLLABLE', 'No admin page', now(), $2";

      it('takes a complete refusal, with or without an alternative', async () => {
        expect(await insertAssessment(REFUSED, [person.employeeId])).toBeNull();
        expect(
          await insertAssessment(
            `${REFUSED.split('=')[0]}, alternative_note=${REFUSED.split('=')[1]}, 'Use the team plan'`,
            [person.employeeId],
          ),
        ).toBeNull();
      });

      it.each([
        [
          'a refusal with no reason',
          "status, rejection_kind, rejected_at, rejected_by_employee_id='REJECTED', 'NOT_ELIGIBLE', now(), $2",
        ],
        [
          'a refusal with a blank reason',
          "status, rejection_kind, rejection_reason, rejected_at, rejected_by_employee_id='REJECTED', 'NOT_ELIGIBLE', ' ', now(), $2",
        ],
        [
          'a refusal that says nobody refused',
          "status, rejection_kind, rejection_reason, rejected_at='REJECTED', 'NOT_ELIGIBLE', 'No', now()",
        ],
        [
          'a refusal with no kind',
          "status, rejection_reason, rejected_at, rejected_by_employee_id='REJECTED', 'No', now(), $2",
        ],
        ['a draft that carries a refusal', "rejection_kind, rejection_reason='NOT_ELIGIBLE', 'No'"],
        ['a blank note on the alternative', "alternative_note=' '"],
      ])('refuses %s', async (_name, set) => {
        expect(await insertAssessment(set, set.includes('$2') ? [person.employeeId] : [])).toBe(CHECK);
      });
    });

    it('refuses a currency, a vendor, a plan or a person that does not exist', async () => {
      expect(
        await insertAssessment(
          "quote_unit_price_minor, quote_currency, quote_billing_cycle, quote_valid_from=1, 'ZZZ', 'MONTHLY', '2026-01-01'",
        ),
      ).toBe(FOREIGN_KEY);
      expect(await insertAssessment('vendor_id=$2', [randomUUID()])).toBe(FOREIGN_KEY);
      expect(await insertAssessment('equivalent_plan_id=$2', [randomUUID()])).toBe(FOREIGN_KEY);
      expect(await insertAssessment('proposed_business_owner_employee_id=$2', [randomUUID()])).toBe(FOREIGN_KEY);
    });
  });

  describe('the need step: held by one person or waiting for one, never both', () => {
    let requestId: string;
    beforeEach(async () => {
      requestId = (await insertRequest()).id;
    });

    it('takes a held step and a waiting step with its reason', async () => {
      expect(await insertStep(requestId)).toBeNull();
      expect(
        await insertStep(requestId, {
          sequence: 2,
          state: 'WAITING',
          assignee_employee_id: null,
          assigned_at: null,
          waiting_reason: 'NO_SPENDING_APPROVER',
          routing_row: 8,
        }),
      ).toBeNull();
    });

    it.each([
      ['a held step with nobody', { assignee_employee_id: null }],
      ['a held step without the time it was given', { assigned_at: null }],
      ['a held step that also says it is waiting', { waiting_reason: 'NO_SPENDING_APPROVER' }],
      [
        'a waiting step that has a holder',
        { state: 'WAITING', waiting_reason: 'NO_SPENDING_APPROVER', assigned_at: null },
      ],
      ['a waiting step with no reason', { state: 'WAITING', assignee_employee_id: null, assigned_at: null }],
      ['a row of the routing table that does not exist', { routing_row: 10 }],
      ['no row of the routing table', { routing_row: 0 }],
      ['an SLA of no days', { sla_working_days: 0 }],
      ['a sequence of zero', { sequence: 0 }],
    ])('refuses %s', async (_name, over) => {
      expect(await insertStep(requestId, over)).toBe(CHECK);
    });

    it('gives a request one step for each place of the chain', async () => {
      expect(await insertStep(requestId)).toBeNull();
      expect(await insertStep(requestId)).toBe(UNIQUE);
    });

    it('refuses a holder who is not an employee', async () => {
      expect(await insertStep(requestId, { assignee_employee_id: randomUUID() })).toBe(FOREIGN_KEY);
    });
  });

  describe('the people a request is for', () => {
    const insertBeneficiary = (requestId: string, employeeId: string, position: number) =>
      sqlState(`INSERT INTO access_request_beneficiaries (request_id, employee_id, position) VALUES ($1, $2, $3)`, [
        requestId,
        employeeId,
        position,
      ]);

    it('takes each person once, in a position of its own', async () => {
      const { id } = await insertRequest();
      const other = await h.staff(department, 'CON-E2');

      expect(await insertBeneficiary(id, person.employeeId, 1)).toBeNull();
      expect(await insertBeneficiary(id, other.employeeId, 2)).toBeNull();
      expect(await insertBeneficiary(id, person.employeeId, 3)).toBe(UNIQUE);
      expect(await insertBeneficiary(id, randomUUID(), 3)).toBe(FOREIGN_KEY);
    });

    it('refuses a position of zero and two people in one position', async () => {
      const { id } = await insertRequest();
      const other = await h.staff(department, 'CON-E3');

      expect(await insertBeneficiary(id, person.employeeId, 0)).toBe(CHECK);
      expect(await insertBeneficiary(id, person.employeeId, 1)).toBeNull();
      expect(await insertBeneficiary(id, other.employeeId, 1)).toBe(UNIQUE);
    });
  });

  describe('nothing is deleted', () => {
    it('refuses to delete a request that has steps and an employee who is named by a request', async () => {
      const { id } = await insertRequest();
      await insertStep(id);

      expect(await sqlState(`DELETE FROM access_requests WHERE id = $1`, [id])).toBe(FOREIGN_KEY);
      expect(await sqlState(`DELETE FROM employees WHERE id = $1`, [person.employeeId])).toBe(FOREIGN_KEY);
    });
  });
  describe('a decided need step and its approval record', () => {
    const decidedStep = (requestId: string, over: Record<string, unknown> = {}) =>
      insertStep(requestId, { state: 'APPROVED', decided_at: new Date(), ...over });

    const insertRecord = (requestId: string, stepId: string, over: Record<string, unknown> = {}) => {
      const row = {
        id: randomUUID(),
        organization_id: h.seed.organizationId,
        request_id: requestId,
        step_id: stepId,
        decision: 'APPROVED',
        decided_by_employee_id: person.employeeId,
        decider_role: 'MANAGER',
        department_id: department.id,
        reason: null,
        term_confirmation_reason: null,
        decided_at: new Date(),
        ...over,
      };
      const columns = Object.keys(row);
      const casts: Record<string, string> = {
        decision: '::"ApprovalDecision"',
        decider_role: '::"ApprovalDeciderRole"',
      };

      return sqlState(
        `INSERT INTO approval_records (${columns.join(', ')})
         VALUES (${columns.map((column, index) => `$${index + 1}${casts[column] ?? ''}`).join(', ')})`,
        columns.map((column) => (row as Record<string, unknown>)[column]),
      );
    };

    /** A request with a decided step; the step id is read back because the step is made by SQL. */
    const withDecidedStep = async () => {
      const { id } = await insertRequest();
      const stepId = randomUUID();
      expect(await decidedStep(id, { id: stepId })).toBeNull();

      return { requestId: id, stepId };
    };

    it('takes a decided step that keeps its holder and says when it was decided', async () => {
      expect(await withDecidedStep()).toBeDefined();
    });

    it.each([
      ['a decided step with no decision time', { decided_at: null }],
      ['a decided step with nobody who held it', { assignee_employee_id: null }],
      ['a step not yet decided that has a decision time', { state: 'PENDING' }],
    ])('refuses %s', async (_name, over) => {
      const { id } = await insertRequest();

      expect(await decidedStep(id, over)).toBe(CHECK);
    });

    it('takes the record of an approval and of a refusal that gives its reason', async () => {
      const approved = await withDecidedStep();
      const refused = await withDecidedStep();

      expect(await insertRecord(approved.requestId, approved.stepId)).toBeNull();
      expect(
        await insertRecord(refused.requestId, refused.stepId, { decision: 'REJECTED', reason: 'No need' }),
      ).toBeNull();
    });

    it.each([
      ['a refusal with no reason', { decision: 'REJECTED' }],
      ['a blank reason', { reason: '  ' }],
      ['a blank confirmation of a long term', { term_confirmation_reason: ' ' }],
      [
        'a confirmation of a term on a refusal',
        { decision: 'REJECTED', reason: 'No', term_confirmation_reason: 'Long' },
      ],
    ])('refuses %s', async (_name, over) => {
      const { requestId, stepId } = await withDecidedStep();

      expect(await insertRecord(requestId, stepId, over)).toBe(CHECK);
    });

    it('takes one record for a step', async () => {
      const { requestId, stepId } = await withDecidedStep();

      expect(await insertRecord(requestId, stepId)).toBeNull();
      expect(await insertRecord(requestId, stepId)).toBe(UNIQUE);
    });

    it.each([
      ['a person who does not exist', { decided_by_employee_id: randomUUID() }],
      ['a department that does not exist', { department_id: randomUUID() }],
      ['a step that does not exist', { step_id: randomUUID() }],
    ])('refuses a record that names %s', async (_name, over) => {
      const { requestId, stepId } = await withDecidedStep();

      expect(await insertRecord(requestId, stepId, over)).toBe(FOREIGN_KEY);
    });

    it('refuses to change or delete a record, by update, delete or truncate', async () => {
      const { requestId, stepId } = await withDecidedStep();
      await insertRecord(requestId, stepId);

      expect(await sqlState(`UPDATE approval_records SET reason = 'x' WHERE step_id = $1`, [stepId])).toBe('23001');
      expect(await sqlState(`DELETE FROM approval_records WHERE step_id = $1`, [stepId])).toBe('23001');
      expect(await sqlState(`TRUNCATE approval_records`)).toBe('23001');
    });
  });
});
