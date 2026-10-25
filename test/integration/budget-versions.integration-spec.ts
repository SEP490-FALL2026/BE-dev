import { BudgetHarness, Pageable, VersionLineWire, VersionWire } from '../support/budget-harness';
import type { Person } from '../support/request-harness';

const h = new BudgetHarness();

describe('budgets over HTTP: the versions Finance builds (integration, real PostgreSQL)', () => {
  let boss: Person;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, boss);
    await h.setRole('SPENDING_APPROVER', boss);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department of its own and a proposal of it that waits for Finance. */
  const waiting = async (lines?: object[], year?: number) => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-V${counter}`);
    const proposal = await h.budgetProposed(unit.head, unit.department.unitId, lines, year);

    return { ...unit, proposal };
  };
  const stateOf = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state FROM budget_versions WHERE id = $1`, [id])).rows[0].state;
  const proposalState = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state FROM budget_proposals WHERE id = $1`, [id])).rows[0].state;
  const linesOf = async (versionId: string) =>
    h.dataOf<Pageable<VersionLineWire>>(await h.versionLines(versionId).expect(200)).items;

  describe('the first version of a Cost Center and a year (US-06-09 AC-1, AC-14)', () => {
    it('is built from the proposal that waits, with the base, the reserve and the threshold, and its lines copied', async () => {
      const { proposal, department } = await waiting();

      const response = await h
        .createVersion({
          proposalId: proposal.id,
          base: h.money(60_000_000),
          reserve: h.money(20_000_000),
          highValuePercent: 50,
        })
        .expect(201);

      const version = h.dataOf<{ version: VersionWire }>(response).version;
      expect(version).toMatchObject({
        kind: 'INITIAL',
        state: 'DRAFT',
        number: 1,
        proposalId: proposal.id,
        base: { amount: '60000000' },
        reserve: { amount: '20000000' },
        total: { amount: '80000000' },
        highValuePercent: 50,
        quarters: null,
        costCenter: { id: department.unitId },
      });
      expect((await linesOf(version.id)).map((line) => [line.proposalPosition, line.amount.amount])).toEqual([
        [1, '50000000'],
        [2, '20000000'],
      ]);
      expect((await h.auditEvents('BUDGET_VERSION', version.id)).map((event) => event.action)).toEqual([
        'BUDGET_VERSION.CREATED',
      ]);
    });

    it('is sent to the spending approver, and the proposal is then reviewed and cannot be taken back', async () => {
      const { proposal, head } = await waiting();
      const version = await h.built(proposal.id);

      const sent = h.dataOf<{ version: VersionWire }>(await h.sendVersion(version.id).expect(200)).version;

      expect(sent.state).toBe('SENT');
      expect(await proposalState(proposal.id)).toBe('REVIEWED');
      await h.withdraw(proposal.id, head.account).expect(409);
      const mine = await h.mine(head.account, h.next).expect(200);
      expect(h.dataOf<{ budget: { status: string } }>(mine).budget.status).toBe('NO_ACTIVE_BUDGET');
    });

    it('is not sent twice, nor changed once sent', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);
      await h.sendVersion(version.id).expect(200);

      expect(h.codeOf(await h.sendVersion(version.id).expect(409))).toBe('BUDGET.VERSION_NOT_EDITABLE');
      expect(h.codeOf(await h.updateVersion(version.id, { highValuePercent: 10 }).expect(409))).toBe(
        'BUDGET.VERSION_NOT_EDITABLE',
      );
      expect(h.codeOf(await h.updateLine(version.id, 1, { financeComment: 'late' }).expect(409))).toBe(
        'BUDGET.VERSION_NOT_EDITABLE',
      );
    });

    it('is the only one in progress for a Cost Center and a year: a second draft is refused, another year is not', async () => {
      const { proposal, head, department } = await waiting();
      await h.built(proposal.id);
      const nextYear = await h.budgetProposed(head, department.unitId, undefined, h.next + 1);

      const sameYear = await h
        .createVersion({ proposalId: proposal.id, base: h.money(1), reserve: h.money(0), highValuePercent: 10 })
        .expect(409);
      const otherYear = await h.built(nextYear.id);

      expect(h.codeOf(sameYear)).toBe('BUDGET.VERSION_IN_FLIGHT');
      expect(otherYear).toMatchObject({ year: h.next + 1, number: 1 });
    });

    it('is not built from a proposal that was withdrawn, given back or does not exist (AC-18)', async () => {
      const { proposal, head } = await waiting();
      await h.withdraw(proposal.id, head.account).expect(200);
      const body = { base: h.money(1), reserve: h.money(0), highValuePercent: 10 };

      const withdrawn = await h.createVersion({ proposalId: proposal.id, ...body }).expect(409);
      const missing = await h
        .createVersion({ proposalId: '00000000-0000-4000-8000-000000000000', ...body })
        .expect(404);
      const noProposal = await h.createVersion(body).expect(422);

      expect(h.codeOf(withdrawn)).toBe('BUDGET.PROPOSAL_NOT_SUBMITTED');
      expect(h.codeOf(missing)).toBe('BUDGET.PROPOSAL_NOT_FOUND');
      expect(h.codeOf(noProposal)).toBe('VALIDATION_ERROR');
    });
  });

  describe('lines are adjusted, never the proposal (AC-14)', () => {
    it('keeps the line of the proposal as it was and records the adjustment with its comment and reason', async () => {
      const { proposal, head } = await waiting();
      const version = await h.built(proposal.id);

      const response = await h
        .updateLine(version.id, 1, {
          seats: 8,
          amount: h.money(40_000_000),
          financeComment: 'Two people moved to Miro',
          adjustmentReason: 'Two people moved to Miro',
        })
        .expect(200);

      const line = h.dataOf<{ line: VersionLineWire }>(response).line;
      expect(line).toMatchObject({
        seats: 8,
        amount: { amount: '40000000' },
        financeComment: 'Two people moved to Miro',
      });
      const original = h.dataOf<Pageable<{ seats: number; amount: { amount: string } }>>(
        await h.proposalLines(proposal.id, head.account).expect(200),
      );
      expect(original.items[0]).toMatchObject({ seats: 10, amount: { amount: '50000000' } });
    });

    it('needs the reason of an adjustment, but not of a comment', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);

      const comment = await h.updateLine(version.id, 2, { financeComment: 'Quote is old' }).expect(200);
      const bare = await h.updateLine(version.id, 2, { amount: h.money(18_000_000) }).expect(422);
      const reasoned = await h
        .updateLine(version.id, 2, { amount: h.money(18_000_000), adjustmentReason: 'A cheaper plan' })
        .expect(200);

      expect(h.dataOf<{ line: VersionLineWire }>(comment).line.financeComment).toBe('Quote is old');
      expect(h.codeOf(bare)).toBe('BUDGET.ADJUSTMENT_REASON_REQUIRED');
      expect(h.dataOf<{ line: VersionLineWire }>(reasoned).line.amount.amount).toBe('18000000');
    });

    it('refuses a window that runs backwards and a line that does not exist', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);

      const backwards = await h
        .updateLine(version.id, 1, {
          windowFrom: `${h.next}-05-01`,
          windowTo: `${h.next}-04-01`,
          adjustmentReason: 'x',
        })
        .expect(422);
      const missing = await h.updateLine(version.id, 9, { financeComment: 'x' }).expect(404);

      expect(h.codeOf(backwards)).toBe('BUDGET.WINDOW_BACKWARDS');
      expect(h.codeOf(missing)).toBe('BUDGET.LINE_NOT_FOUND');
    });

    it('takes lines of Finance own, saying what every line says', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);
      const incomplete = await h
        .addLines(version.id, [h.line({ description: 'Notion', repeatCycle: undefined })])
        .expect(422);

      await h.addLines(version.id, [h.line({ description: 'Notion', amount: h.money(9_000_000) })]).expect(201);

      expect(h.codeOf(incomplete)).toBe('BUDGET.PROPOSAL_INCOMPLETE');
      const lines = await linesOf(version.id);
      expect(lines).toHaveLength(3);
      expect(lines[2]).toMatchObject({ description: 'Notion', proposalPosition: null });
    });
  });

  describe('the forecast by quarter and the year (AC-6)', () => {
    const quarters = (...amounts: number[]) => ({
      q1: h.money(amounts[0]),
      q2: h.money(amounts[1]),
      q3: h.money(amounts[2]),
      q4: h.money(amounts[3]),
    });

    it('is kept when the four quarters add up to the total, and is only a forecast', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id, {
        quarters: quarters(20_000_000, 20_000_000, 20_000_000, 20_000_000),
      });

      expect(version.quarters).toMatchObject({ q1: { amount: '20000000' }, q4: { amount: '20000000' } });
      const cleared = await h.updateVersion(version.id, { quarters: null }).expect(200);
      expect(h.dataOf<{ version: VersionWire }>(cleared).version.quarters).toBeNull();
    });

    it('is not saved when the four quarters add up to less or more than the total', async () => {
      const { proposal } = await waiting();
      const short = await h
        .createVersion({
          proposalId: proposal.id,
          base: h.money(60_000_000),
          reserve: h.money(20_000_000),
          highValuePercent: 50,
          quarters: quarters(20_000_000, 20_000_000, 20_000_000, 15_000_000),
        })
        .expect(422);
      const version = await h.built(proposal.id);
      const update = await h.updateVersion(version.id, { quarters: quarters(1, 1, 1, 1) }).expect(422);

      expect(h.codeOf(short)).toBe('BUDGET.QUARTERS_MISMATCH');
      expect(h.codeOf(update)).toBe('BUDGET.QUARTERS_MISMATCH');
      expect(h.dataOf<{ version: VersionWire }>(await h.versionOf(version.id).expect(200)).version.quarters).toBeNull();
    });

    it('is the only phasing there is: a limit for a quarter or a month has no field to be given in', async () => {
      const { proposal } = await waiting();
      const base = { proposalId: proposal.id, base: h.money(1), reserve: h.money(0), highValuePercent: 10 };

      for (const extra of [{ controlBudgetQ4: h.money(5) }, { monthlyLimit: { month: 10, amount: h.money(5) } }]) {
        expect(h.codeOf(await h.createVersion({ ...base, ...extra }).expect(422))).toBe('VALIDATION_ERROR');
      }
    });

    it('does not take a year that has ended', async () => {
      const response = await h
        .createRevision({ costCenterId: (await waiting()).department.unitId, year: h.year - 1 })
        .expect(422);

      expect(h.codeOf(response)).toBe('BUDGET.YEAR_ENDED');
    });

    it('changes the base and the reserve of a version being built, and the total follows', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);

      const response = await h
        .updateVersion(version.id, { base: h.money(50_000_000), highValuePercent: 40 })
        .expect(200);

      expect(h.dataOf<{ version: VersionWire }>(response).version).toMatchObject({
        base: { amount: '50000000' },
        reserve: { amount: '20000000' },
        total: { amount: '70000000' },
        highValuePercent: 40,
      });
      expect(h.codeOf(await h.updateVersion(version.id, {}).expect(422))).toBe('VALIDATION_ERROR');
    });
  });

  describe('a revision changes the current budget only once it is approved (AC-7, AC-8; US-06-11)', () => {
    it('is built and sent with its reason while the current budget stays what it is', async () => {
      const { proposal, department } = await waiting();
      const current = await h.current(proposal.id, { base: h.money(80_000_000), reserve: h.money(20_000_000) });

      const draft = h.dataOf<{ version: VersionWire }>(
        await h
          .createRevision({
            costCenterId: department.unitId,
            year: h.next,
            base: h.money(60_000_000),
            reserve: h.money(20_000_000),
            reason: 'Cut to the plan',
          })
          .expect(201),
      ).version;
      await h.sendVersion(draft.id).expect(200);

      expect(draft).toMatchObject({
        kind: 'REVISION',
        number: 2,
        basedOnVersionId: current.id,
        total: { amount: '80000000' },
      });
      expect(await stateOf(current.id)).toBe('APPROVED');
      expect(await stateOf(draft.id)).toBe('SENT');
      const table = h.dataOf<Pageable<{ costCenter: { id: string }; total: { amount: string } }>>(
        await h.table(h.finance, { year: h.next }).expect(200),
      );
      expect(table.items.find((row) => row.costCenter.id === department.unitId)?.total.amount).toBe('100000000');
    });

    it('is not sent without its reason, and the current budget is untouched', async () => {
      const { proposal, department } = await waiting();
      const current = await h.current(proposal.id);
      const revision = h.dataOf<{ version: VersionWire }>(
        await h.createRevision({ costCenterId: department.unitId, year: h.next }).expect(201),
      ).version;

      const refused = await h.sendVersion(revision.id).expect(422);
      await h.updateVersion(revision.id, { reason: 'Cut to the plan' }).expect(200);
      await h.sendVersion(revision.id).expect(200);

      expect(h.codeOf(refused)).toBe('BUDGET.REVISION_REASON_REQUIRED');
      expect(await stateOf(current.id)).toBe('APPROVED');
    });

    it('is the only version in progress, and the lines of the current budget are its starting point', async () => {
      const { proposal, department } = await waiting();
      await h.current(proposal.id);
      const first = h.dataOf<{ version: VersionWire }>(
        await h.createRevision({ costCenterId: department.unitId, year: h.next }).expect(201),
      ).version;

      const second = await h.createRevision({ costCenterId: department.unitId, year: h.next }).expect(409);

      expect(h.codeOf(second)).toBe('BUDGET.VERSION_IN_FLIGHT');
      expect(await linesOf(first.id)).toHaveLength(2);
    });

    it('is not built for a Cost Center that has no current budget', async () => {
      const { department } = await waiting();

      const response = await h.createRevision({ costCenterId: department.unitId, year: h.next }).expect(409);

      expect(h.codeOf(response)).toBe('BUDGET.NO_CURRENT_BUDGET');
    });
  });

  describe('the lines of the current budget (US-06-09 AC-17)', () => {
    it('has its purchase window moved with a reason, and the move is kept with what it was', async () => {
      const { proposal } = await waiting();
      const current = await h.current(proposal.id);

      const moved = await h
        .moveWindow(current.id, 2, {
          windowFrom: `${h.next}-06-01`,
          windowTo: `${h.next}-08-31`,
          reason: 'The purchase slipped',
        })
        .expect(200);

      expect(h.dataOf<{ line: VersionLineWire }>(moved).line).toMatchObject({
        windowFrom: `${h.next}-06-01`,
        windowTo: `${h.next}-08-31`,
        amount: { amount: '20000000' },
      });
      const changes = h.dataOf<
        Pageable<{ before: { windowFrom: string }; after: { windowTo: string }; reason: string }>
      >(await h.lineChanges(current.id, 2).expect(200));
      expect(changes.items).toMatchObject([
        {
          before: { windowFrom: `${h.next}-04-01` },
          after: { windowTo: `${h.next}-08-31` },
          reason: 'The purchase slipped',
        },
      ]);
    });

    it('needs the reason of the move, and a window that runs forwards', async () => {
      const { proposal } = await waiting();
      const current = await h.current(proposal.id);

      const noReason = await h.moveWindow(current.id, 2, { windowTo: `${h.next}-09-30` }).expect(422);
      const backwards = await h
        .moveWindow(current.id, 2, { windowFrom: `${h.next}-09-01`, windowTo: `${h.next}-08-01`, reason: 'x' })
        .expect(422);

      expect(h.codeOf(noReason)).toBe('BUDGET.WINDOW_REASON_REQUIRED');
      expect(h.codeOf(backwards)).toBe('BUDGET.WINDOW_BACKWARDS');
    });

    it('never has an amount changed in place, even only to update a price: that is a revision', async () => {
      const { proposal } = await waiting();
      const current = await h.current(proposal.id);

      const response = await h
        .moveWindow(current.id, 2, { amount: h.money(22_000_000), reason: 'The price went up' })
        .expect(409);

      expect(h.codeOf(response)).toBe('BUDGET.REVISION_REQUIRED');
      expect((await linesOf(current.id))[1].amount.amount).toBe('20000000');
      expect(h.dataOf<Pageable<unknown>>(await h.lineChanges(current.id, 2).expect(200)).items).toEqual([]);
    });

    it('is only for the current budget', async () => {
      const { proposal } = await waiting();
      const draft = await h.built(proposal.id);

      const response = await h.moveWindow(draft.id, 1, { windowTo: `${h.next}-09-30`, reason: 'x' }).expect(409);

      expect(h.codeOf(response)).toBe('BUDGET.VERSION_NOT_CURRENT');
    });
  });

  describe('lines loaded from a file (AC-3)', () => {
    const header =
      'cost_center_code,description,amount,window_from,window_to,service_period_months,repeat_cycle,seats,note';

    it('adds the right rows to the draft, reports the others by row and reason, and budgets nothing', async () => {
      const { proposal, head, department } = await waiting();
      const version = await h.built(proposal.id);
      const code = (
        await h.ctx.sql.query<{ code: string }>(`SELECT code FROM cost_centers WHERE id = $1`, [department.unitId])
      ).rows[0].code;
      const csv = [
        header,
        `${code},Zoom,12000000,${h.next}-02-01,${h.next}-02-28,12,ANNUAL,20,`,
        `CC-Z,Slack,5000000,${h.next}-02-01,${h.next}-02-28,12,ANNUAL,,`,
        `${code},Linear,not-a-number,${h.next}-02-01,${h.next}-02-28,12,ANNUAL,,`,
        `${code},Loom,3000000,${h.next}-03-01,${h.next}-02-01,12,ANNUAL,,`,
        `${code},Airtable,2000000,${h.next}-03-01,${h.next}-03-31,12,SOMETIMES,,`,
        `${code},Notion,9000000,${h.next}-05-01,${h.next}-05-31,12,ANNUAL,,Team plan`,
      ].join('\n');

      const response = await h.importLines(version.id, csv).expect(201);

      expect(h.dataOf<{ result: unknown }>(response).result).toEqual({
        added: 2,
        rejected: 4,
        errors: [
          { row: 3, code: 'COST_CENTER_NOT_FOUND' },
          { row: 4, code: 'AMOUNT_INVALID' },
          { row: 5, code: 'WINDOW_BACKWARDS' },
          { row: 6, code: 'REPEAT_CYCLE_INVALID' },
        ],
      });
      expect((await linesOf(version.id)).map((line) => line.description)).toEqual([
        'Figma Organization 10 seats',
        'Miro 5 seats',
        'Zoom',
        'Notion',
      ]);
      expect(await stateOf(version.id)).toBe('DRAFT');
      const mine = await h.mine(head.account, h.next).expect(200);
      expect(h.dataOf<{ budget: { status: string } }>(mine).budget.status).toBe('NO_ACTIVE_BUDGET');
    });

    it('refuses a row of another Cost Center that exists', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);
      const other = (await waiting()).department.unitId;
      const code = (await h.ctx.sql.query<{ code: string }>(`SELECT code FROM cost_centers WHERE id = $1`, [other]))
        .rows[0].code;

      const response = await h
        .importLines(version.id, `${header}\n${code},Zoom,1000,${h.next}-02-01,${h.next}-02-28,12,ANNUAL,,`)
        .expect(201);

      expect(h.dataOf<{ result: { errors: unknown[] } }>(response).result.errors).toEqual([
        { row: 2, code: 'COST_CENTER_MISMATCH' },
      ]);
    });

    it.each([
      ['a header without the columns', 'cost_center_code,description\nA,B', 'MISSING_COLUMNS'],
      ['a header and no rows', header, 'EMPTY'],
      ['a file that is not a table', 'a,"b', 'NOT_CSV'],
    ])('refuses the whole file with %s', async (_name, csv, reason) => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);

      const response = await h.importLines(version.id, csv).expect(422);

      expect(h.codeOf(response)).toBe('BUDGET.IMPORT_FILE_INVALID');
      expect(h.detailsOf(response)).toMatchObject({ reason });
    });

    it('is not loaded into a version that was sent', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);
      await h.sendVersion(version.id).expect(200);

      await h.importLines(version.id, `${header}\nA,B,1,2027-01-01,2027-01-02,1,ANNUAL,,`).expect(409);
    });
  });

  describe('who builds the versions (AC-13)', () => {
    it.each([
      ['the head', (head: Person) => head.account],
      ['the IT Admin', () => h.it1],
      ['the spending approver', () => boss.account],
    ])('is not done by %s', async (_name, who) => {
      const { proposal, head } = await waiting();
      const version = await h.built(proposal.id);
      const account = who(head);
      const body = { proposalId: proposal.id, base: h.money(1), reserve: h.money(0), highValuePercent: 10 };

      await h.createVersion(body, account).expect(403);
      await h.createRevision({ costCenterId: version.costCenter.id, year: h.next }, account).expect(403);
      await h.updateVersion(version.id, { highValuePercent: 1 }, account).expect(403);
      await h.updateLine(version.id, 1, { financeComment: 'x' }, account).expect(403);
      await h.sendVersion(version.id, account).expect(403);
      // The spending approver reads the versions to decide them, but changes none; the others read none.
      const reads = account === boss.account ? 200 : 403;
      await h.versionOf(version.id, account).expect(reads);
      await h.versionList(account).expect(reads);
      expect(await stateOf(version.id)).toBe('DRAFT');
    });

    it('is not done by the Super Admin', async () => {
      const { proposal } = await waiting();
      const admin = { Authorization: `Bearer ${h.admin}` };
      const request = (await import('supertest')).default;

      const response = await request(h.server())
        .post('/api/v1/budget-versions')
        .set(admin)
        .send({ proposalId: proposal.id, base: h.money(1), reserve: h.money(0), highValuePercent: 10 });

      expect(response.status).toBe(403);
    });
  });

  describe('listing the versions', () => {
    it('is paged, newest year first, and can be narrowed by state and year', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);

      const drafts = h.dataOf<Pageable<VersionWire>>(
        await h.versionList(h.finance, { state: 'DRAFT', year: h.next, pageSize: 100 }).expect(200),
      );
      const none = h.dataOf<Pageable<VersionWire>>(
        await h.versionList(h.finance, { state: 'REJECTED', year: h.next }).expect(200),
      );

      expect(drafts.items.map((item) => item.id)).toContain(version.id);
      expect(none.items).toEqual([]);
      expect(drafts.pagination.page).toBe(1);
    });
  });
});
