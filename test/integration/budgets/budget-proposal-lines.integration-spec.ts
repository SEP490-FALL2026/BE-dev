import type { PackageWire } from '../../../src/modules/budgets/cycle/cycle.dto';
import type { ProposalLineWire, VersionLineWire } from '../../../src/modules/budgets/budget/budget.dto';
import request from 'supertest';
import { BudgetHarness, Pageable, ProposalWire } from '../../support/budget-harness';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

const zbb = {
  purpose: 'Draft the documents faster',
  alternatives: 'A free tool, which does not keep the data private',
  consequenceIfNot: 'The team keeps writing by hand',
  usageIndicator: 'Weekly use of each member',
};

/**
 * The lines of BM-10 on a real PostgreSQL (`qd103-budget-proposal-lines-cleanup`, Tasks 3 to 5; SPEC MF4-B): the kind, the priority
 * rank, the zero-based-budget explanation and the flag over the ceiling that was published (S4-01), the Cancel line that is shown and
 * never added (QĐ-109c), the copy into a version, Finance's own lines, the import, and the package of the year.
 */
describe('budget proposal lines over HTTP (integration, real PostgreSQL)', () => {
  let counter = 0;
  const year = (): number => h.next;

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department with a head and its ceiling in the cycle of the year: `edited` is what Finance edits now, `published` what the head was told. */
  const withCeiling = async (edited: number, published: number | null) => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-L${counter}`);
    await h.ctx.sql.query(
      `INSERT INTO budget_department_ceilings (cycle_id, department_id, signed_commitments_minor, planned_seats_minor, priority_minor, total_minor, published_total_minor)
       SELECT c.id, $2, $3, 0, 0, $3, $4 FROM budget_cycles c WHERE c.year = $1
       ON CONFLICT (cycle_id, department_id) DO UPDATE SET signed_commitments_minor = $3, total_minor = $3, published_total_minor = $4`,
      [year(), unit.department.id, edited, published],
    );

    return unit;
  };
  const send = (head: Person, costCenterId: string, lines: object[]) =>
    h.submitProposal({ year: year(), lines }, head.account);
  const rank = (lines: object[]) => lines.map((line, index) => ({ priorityRank: index + 1, ...line }));
  const lineOf = (description: string, amount: number, extra: Record<string, unknown> = {}) =>
    h.line({ description, amount: h.money(amount), ...extra });
  const detailsOf = (response: { body: { error: { details?: { positions?: number[] } } } }) =>
    response.body.error.details?.positions;
  const linesOf = async (proposalId: string) =>
    h.dataOf<Pageable<ProposalLineWire>>(await h.proposalLines(proposalId, h.finance).expect(200)).items;
  const proposalOf = (response: Parameters<typeof h.dataOf>[0]) =>
    h.dataOf<{ proposal: ProposalWire }>(response).proposal;

  describe('the rank, the kind and the explanation (QT 4.4, QT 4.5, QĐ-94l)', () => {
    it('QT 4.5: two lines with one rank are refused with both positions, and nothing is written', async () => {
      const { head, department } = await withCeiling(1_000_000_000, 1_000_000_000);
      const before = await h.budgetRows('budget_proposals');

      const response = await send(head, department.unitId, [
        lineOf('A', 1_000_000, { priorityRank: 1 }),
        lineOf('B', 1_000_000, { priorityRank: 2 }),
        lineOf('C', 1_000_000, { priorityRank: 1 }),
      ]).expect(422);

      expect(h.codeOf(response)).toBe('BUDGET.PRIORITY_RANK_INVALID');
      expect(detailsOf(response)).toEqual([1, 3]);
      expect(await h.budgetRows('budget_proposals')).toEqual(before);
    });

    it('BR-MF4-02: a NEW line without its explanation is refused with its position; with it, it is kept and read back', async () => {
      const { head, department } = await withCeiling(1_000_000_000, 1_000_000_000);

      const refused = await send(
        head,
        department.unitId,
        rank([lineOf('Renew', 1_000_000), lineOf('New tool', 2_000_000, { lineType: 'NEW' })]),
      ).expect(422);
      expect(h.codeOf(refused)).toBe('BUDGET.ZBB_REQUIRED');
      expect(detailsOf(refused)).toEqual([2]);

      const sent = proposalOf(
        await send(
          head,
          department.unitId,
          rank([lineOf('Renew', 1_000_000), lineOf('New tool', 2_000_000, { lineType: 'NEW', zbb })]),
        ).expect(201),
      );
      const [renew, added] = await linesOf(sent.id);
      expect([renew.lineType, renew.zbb, renew.priorityRank, renew.overCeiling]).toEqual(['RENEW', null, 1, null]);
      expect([added.lineType, added.zbb, added.priorityRank]).toEqual(['NEW', zbb, 2]);
    });

    it('QĐ-109d: a RENEW or CHANGE line of a plan with no usage figure asks nothing, and the rank is the head’s, not the place', async () => {
      const { head, department } = await withCeiling(1_000_000_000, 1_000_000_000);

      const sent = proposalOf(
        await send(head, department.unitId, [
          lineOf('Change', 1_000_000, { lineType: 'CHANGE', priorityRank: 7 }),
          lineOf('Renew', 1_000_000, { priorityRank: 3 }),
        ]).expect(201),
      );

      expect((await linesOf(sent.id)).map((line) => [line.position, line.priorityRank])).toEqual([
        [1, 7],
        [2, 3],
      ]);
    });
  });

  describe('the ceiling that was published (S4-01, AC-20) and the Cancel line (QĐ-109c)', () => {
    it('BR-MF4-04: flags the line that carries the proposal over the published ceiling, and every line after it, and asks their notes', async () => {
      // Finance is editing 500 M now; the head was told 90 M, and that is what the flag is judged against.
      const { head, department } = await withCeiling(500_000_000, 90_000_000);
      const lines = rank([lineOf('One', 50_000_000), lineOf('Two', 70_000_000), lineOf('Three', 40_000_000)]);

      const refused = await send(head, department.unitId, lines).expect(422);
      expect(h.codeOf(refused)).toBe('BUDGET.OVER_CEILING_NOTE_REQUIRED');
      expect(detailsOf(refused)).toEqual([2, 3]);

      const noted = lines.map((line, index) => (index === 0 ? line : { ...line, note: 'Needed for the launch' }));
      const sent = proposalOf(await send(head, department.unitId, noted).expect(201));

      expect((await linesOf(sent.id)).map((line) => line.overCeiling?.amount ?? null)).toEqual([
        null,
        '30000000',
        '40000000',
      ]);
      expect(sent.total.amount).toBe('160000000');
    });

    it('S4-01: no flag when the department has no published ceiling, even if the one being edited is small', async () => {
      const { head, department } = await withCeiling(1, null);

      const sent = proposalOf(await send(head, department.unitId, rank([lineOf('Big', 900_000_000)])).expect(201));

      expect((await linesOf(sent.id))[0].overCeiling).toBeNull();
    });

    it('QĐ-109c: a CANCEL line of 50 million is shown and changes neither the total nor the flags, and asks no note', async () => {
      const { head, department } = await withCeiling(90_000_000, 90_000_000);

      const sent = proposalOf(
        await send(head, department.unitId, [
          lineOf('Renew', 80_000_000, { priorityRank: 2 }),
          lineOf('Give up', 50_000_000, { lineType: 'CANCEL', priorityRank: 1 }),
        ]).expect(201),
      );

      expect(sent.total.amount).toBe('80000000');
      expect((await linesOf(sent.id)).map((line) => [line.lineType, line.amount.amount, line.overCeiling])).toEqual([
        ['RENEW', '80000000', null],
        ['CANCEL', '50000000', null],
      ]);
    });
  });

  describe('the lines of a version (QĐ-101n, C4-14)', () => {
    const versionOf = async () => {
      const { head, department } = await withCeiling(60_000_000, 60_000_000);
      const proposal = await h.budgetProposed(
        head,
        department.unitId,
        rank([
          lineOf('Kept', 40_000_000, { note: 'a' }),
          lineOf('New tool', 30_000_000, { lineType: 'NEW', zbb, note: 'b' }),
        ]),
        year(),
      );
      const version = await h.built(proposal.id);
      const lines = async () => h.dataOf<Pageable<VersionLineWire>>(await h.versionLines(version.id).expect(200)).items;

      return { version, proposal, lines };
    };

    it('copies the kind, the explanation and the rank of the proposal line, and shows the flag of the line it adjusts', async () => {
      const { lines } = await versionOf();

      const copied = await lines();
      expect(copied.map((line) => [line.lineType, line.priorityRank, line.zbb !== null])).toEqual([
        ['RENEW', 1, false],
        ['NEW', 2, true],
      ]);
      // 40 M + 30 M = 70 M over 60 M: the second line carries the part over (10 M).
      expect(copied.map((line) => line.overCeiling?.amount ?? null)).toEqual([null, '10000000']);
    });

    it('asks Finance the kind of a line it adds, and takes it without a rank or an explanation', async () => {
      const { version, lines } = await versionOf();

      const refused = await h
        .addLines(version.id, [{ description: 'Extra', amount: h.money(1_000_000), lineType: undefined }])
        .expect(422);
      expect(h.codeOf(refused)).toBe('VALIDATION_ERROR');

      await h
        .addLines(version.id, [{ description: 'Extra', amount: h.money(1_000_000), lineType: 'CANCEL' }])
        .expect(201);
      const added = (await lines())[2];
      expect([added.lineType, added.priorityRank, added.zbb, added.overCeiling]).toEqual(['CANCEL', null, null, null]);
    });

    it('keeps the explanation and the rank when Finance edits something else, and changes them when it says so', async () => {
      const { version, lines } = await versionOf();

      await h.updateLine(version.id, 2, { financeComment: 'checked' }).expect(200);
      expect((await lines())[1]).toMatchObject({ lineType: 'NEW', priorityRank: 2, zbb });

      await h.updateLine(version.id, 2, { zbb: null, priorityRank: 5 }).expect(200);
      expect((await lines())[1]).toMatchObject({ lineType: 'NEW', priorityRank: 5, zbb: null });
    });

    it('asks the reason of an adjustment when the kind of a line that comes from the proposal is changed', async () => {
      const { version } = await versionOf();

      const refused = await h.updateLine(version.id, 1, { lineType: 'CHANGE' }).expect(422);
      expect(h.codeOf(refused)).toBe('BUDGET.ADJUSTMENT_REASON_REQUIRED');
      await h.updateLine(version.id, 1, { lineType: 'CHANGE', adjustmentReason: 'It is a change' }).expect(200);
    });

    it('takes the kind and the rank from a file, and reports a row without a valid kind', async () => {
      const { version, lines } = await versionOf();
      const code = (
        await h.ctx.sql.query<{ code: string }>(
          `SELECT cc.code FROM cost_centers cc JOIN budget_versions v ON v.cost_center_id = cc.id WHERE v.id = $1`,
          [version.id],
        )
      ).rows[0].code;
      const csv = [
        'cost_center_code,description,amount,line_type,priority_rank',
        `${code},From file,1000000,new,9`,
        `${code},No kind,1000000,,`,
        `${code},Odd kind,1000000,MOVE,`,
      ].join('\n');

      const result = h.dataOf<{ result: { added: number; rejected: number; errors: { row: number; code: string }[] } }>(
        await h.importLines(version.id, csv).expect(201),
      ).result;

      expect(result).toMatchObject({ added: 1, rejected: 2 });
      expect(result.errors).toEqual([
        { row: 3, code: 'LINE_TYPE_INVALID' },
        { row: 4, code: 'LINE_TYPE_INVALID' },
      ]);
      expect((await lines())[2]).toMatchObject({ lineType: 'NEW', priorityRank: 9 });
    });
  });

  describe('the package of the year (B4, C4-13)', () => {
    it('lists the lines of the open proposal by rank with the flag, counts a Cancel line at no total, and tells who may build from the baseline', async () => {
      const { head, department } = await withCeiling(40_000_000, 40_000_000);
      const proposal = await h.budgetProposed(
        head,
        department.unitId,
        [
          lineOf('Second', 30_000_000, { priorityRank: 2, note: 'x' }),
          lineOf('Give up', 50_000_000, { lineType: 'CANCEL', priorityRank: 3 }),
          lineOf('First', 20_000_000, { priorityRank: 1 }),
        ],
        year(),
      );

      const pack = h.dataOf<PackageWire>(
        await request(h.server()).get(`/api/v1/budget-cycles/${year()}/package`).set(h.as(h.finance)).expect(200),
      );
      const entry = pack.departments.find((candidate) => candidate.departmentId === department.id);

      expect(entry?.proposal).toMatchObject({ id: proposal.id, total: { amount: '50000000' } });
      expect(
        entry?.proposal?.lines.map((line) => [
          line.priorityRank,
          line.lineType,
          line.amount.amount,
          line.overCeiling?.amount ?? null,
        ]),
      ).toEqual([
        [1, 'RENEW', '20000000', null],
        [2, 'RENEW', '30000000', '10000000'],
        [3, 'CANCEL', '50000000', null],
      ]);
      expect(entry).toMatchObject({
        publishedCeiling: { amount: '40000000' },
        ceiling: { amount: '40000000' },
        headStatus: 'HAS_HEAD',
        baselineAllowed: false,
      });
      expect(entry?.baselineRefusal).not.toBeNull();
    });

    it('says a department nobody heads can be built from the baseline once the deadline is gone', async () => {
      counter += 1;
      const department = await h.departmentWithUnit(`P-NH${counter}`);
      await h.ctx.sql.query(
        `INSERT INTO budget_department_ceilings (cycle_id, department_id, signed_commitments_minor, planned_seats_minor, priority_minor, total_minor, published_total_minor)
         SELECT c.id, $2, 1, 0, 0, 1, 1 FROM budget_cycles c WHERE c.year = $1`,
        [year(), department.id],
      );
      await h.ctx.sql.query(`UPDATE budget_cycles SET submission_deadline = $2 WHERE year = $1`, [
        year(),
        `${h.year}-01-01`,
      ]);

      const pack = h.dataOf<PackageWire>(
        await request(h.server()).get(`/api/v1/budget-cycles/${year()}/package`).set(h.as(h.finance)).expect(200),
      );
      const entry = pack.departments.find((candidate) => candidate.departmentId === department.id);

      expect(entry).toMatchObject({ headStatus: 'NO_HEAD', baselineAllowed: true, baselineRefusal: null });
    });
  });
});
