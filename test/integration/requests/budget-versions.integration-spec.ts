import request from 'supertest';
import { attachedVersionFile, sendingCycleLock } from '../../support/budget-files';
import { BudgetHarness, Pageable, VersionWire } from '../../support/budget-harness';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

describe('budgets over HTTP: the versions Finance builds (integration, real PostgreSQL)', () => {
  let boss: Person;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1')); // the Spending Approver does not head a department (QĐ-93b)
    await h.setRole('SPENDING_APPROVER', boss);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department of its own and a proposal of it that waits for Finance. */
  const waiting = async (amount?: number, year?: number) => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-V${counter}`);
    const proposal = await h.budgetProposed(unit.head, unit.department.unitId, amount, year);

    return { ...unit, proposal };
  };
  const stateOf = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state FROM budget_versions WHERE id = $1`, [id])).rows[0].state;
  const proposalState = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state FROM budget_proposals WHERE id = $1`, [id])).rows[0].state;

  describe('the first version of a Cost Center and a year (US-06-09 AC-1, AC-14)', () => {
    it('is built from the proposal that waits, with the base and the reserve with its reason, and no line', async () => {
      const { proposal, department } = await waiting();

      const response = await h
        .createVersion({
          proposalId: proposal.id,
          base: h.money(60_000_000),
          reserve: h.money(20_000_000),
          reserveReason: 'The plan buys more in the autumn',
        })
        .expect(201);

      const version = h.dataOf<{ version: VersionWire }>(response).version;
      expect(version).not.toHaveProperty('kind');
      expect(version).toMatchObject({
        state: 'DRAFT',
        number: 1,
        proposalId: proposal.id,
        base: { amount: '60000000' },
        reserve: { amount: '20000000' },
        total: { amount: '80000000' },
        reservePercent: 10,
        defaultReserve: { amount: '6000000' },
        reserveReason: 'The plan buys more in the autumn',
        costCenter: { id: department.unitId },
      });
      expect(await h.budgetRows(`budget_version_lines WHERE version_id = '${version.id}'`)).toBe(0);
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
      expect(h.codeOf(await h.updateVersion(version.id, { base: h.money(1) }).expect(409))).toBe(
        'BUDGET.VERSION_NOT_EDITABLE',
      );
    });

    it('is the only one in progress for a Cost Center and a year: a second draft is refused, another year is not', async () => {
      const { proposal, head, department } = await waiting();
      const firstVersion = await h.built(proposal.id);
      const nextYear = await h.budgetProposed(head, department.unitId, undefined, h.next + 1);

      const sameYear = await h
        .createVersion({ proposalId: proposal.id, base: h.money(1), reserve: h.money(0) })
        .expect(409);
      const otherYear = await h.built(nextYear.id);

      expect(h.codeOf(sameYear)).toBe('BUDGET.VERSION_IN_FLIGHT');
      expect(h.detailsOf(sameYear)).toEqual({ versionId: firstVersion.id });
      expect(otherYear).toMatchObject({ year: h.next + 1, number: 1 });
    });

    it('is not built from a proposal that was withdrawn, given back or does not exist (AC-18)', async () => {
      const { proposal, head } = await waiting();
      await h.withdraw(proposal.id, head.account).expect(200);
      const body = { base: h.money(1), reserve: h.money(0) };

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

  describe('one amount for the whole year (QĐ-111ac)', () => {
    it('has no quarter to give: a forecast by quarter is a field nobody defined (422), and a version shows none', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);
      const quarters = { q1: h.money(1), q2: h.money(1), q3: h.money(1), q4: h.money(1) };

      const created = await h
        .createVersion({ proposalId: proposal.id, base: h.money(1), reserve: h.money(0), quarters })
        .expect(422);
      const updated = await h.updateVersion(version.id, { quarters }).expect(422);

      expect(h.codeOf(created)).toBe('VALIDATION_ERROR');
      expect(h.codeOf(updated)).toBe('VALIDATION_ERROR');
      expect(version).not.toHaveProperty('quarters');
    });

    it('has no limit for a quarter or a month either: no field to be given in', async () => {
      const { proposal } = await waiting();
      const base = { proposalId: proposal.id, base: h.money(1), reserve: h.money(0) };

      for (const extra of [{ controlBudgetQ4: h.money(5) }, { monthlyLimit: { month: 10, amount: h.money(5) } }]) {
        expect(h.codeOf(await h.createVersion({ ...base, ...extra }).expect(422))).toBe('VALIDATION_ERROR');
      }
    });

    it('changes the base and the reserve of a version being built, and the total follows', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);

      const response = await h.updateVersion(version.id, { base: h.money(50_000_000) }).expect(200);

      expect(h.dataOf<{ version: VersionWire }>(response).version).toMatchObject({
        base: { amount: '50000000' },
        reserve: { amount: '20000000' },
        total: { amount: '70000000' },
      });
      expect(h.codeOf(await h.updateVersion(version.id, {}).expect(422))).toBe('VALIDATION_ERROR');
    });
  });

  describe('the figures, the files and the ceiling of a version (QĐ-111ac, T-BG2)', () => {
    it('fills the base in with what is carried over (zero while nothing tells it) and takes the reserve as a share or an amount, not both', async () => {
      const { proposal } = await waiting();

      const both = await h
        .createVersion({ proposalId: proposal.id, reserve: h.money(1), reservePercent: 10 })
        .expect(422);
      const filled = h.dataOf<{ version: VersionWire & { carriedOverNextYear: { amount: string } } }>(
        await h.createVersion({ proposalId: proposal.id, reservePercent: 15 }).expect(201),
      ).version;
      const shared = h.dataOf<{ version: VersionWire }>(
        await h.updateVersion(filled.id, { base: h.money(1_000_000), reservePercent: 20 }).expect(200),
      ).version;

      expect(h.codeOf(both)).toBe('VALIDATION_ERROR');
      expect(filled).toMatchObject({ base: { amount: '0' }, carriedOverNextYear: { amount: '0' }, reservePercent: 15 });
      // The share Finance chose is told back as it was given, and the default reserve is the one of the organization (10 %), not the chosen one.
      expect(shared).toMatchObject({
        reserve: { amount: '200000' },
        reservePercent: 20,
        defaultReserve: { amount: '100000' },
        reserveReason: null,
      });
    });

    it('asks a reason when the share of the reserve is not the default of the organization, however it was chosen: sending 20 % with none is 422 BUDGET.RESERVE_REASON_REQUIRED, and nothing is written (QĐ-100h, FR-5.15(2); FIX-LB3 LBG-02)', async () => {
      const { proposal } = await waiting();
      const version = h.dataOf<{ version: VersionWire }>(
        await h.createVersion({ proposalId: proposal.id, base: h.money(1_000_000), reservePercent: 15 }).expect(201),
      ).version;
      await h.updateVersion(version.id, { reservePercent: 20 }).expect(200);

      const refused = await h.sendVersion(version.id).expect(422);

      expect(h.codeOf(refused)).toBe('BUDGET.RESERVE_REASON_REQUIRED');
      expect(await stateOf(version.id)).toBe('DRAFT');
      expect(await proposalState(proposal.id)).toBe('SUBMITTED');
      await h.updateVersion(version.id, { reserveReason: 'The plan buys more in the autumn' }).expect(200);
      expect(h.dataOf<{ version: VersionWire }>(await h.sendVersion(version.id).expect(200)).version).toMatchObject({
        state: 'SENT',
        reserve: { amount: '200000' },
        reserveReason: 'The plan buys more in the autumn',
      });
    });

    it('asks a reason at the creation too, and none when the share given is the default itself', async () => {
      const unshared = await waiting();
      const atDefault = await waiting();
      const different = h.dataOf<{ version: VersionWire }>(
        await h
          .createVersion({ proposalId: unshared.proposal.id, base: h.money(2_000_000), reservePercent: 15 })
          .expect(201),
      ).version;
      const same = h.dataOf<{ version: VersionWire }>(
        await h
          .createVersion({ proposalId: atDefault.proposal.id, base: h.money(2_000_000), reservePercent: 10 })
          .expect(201),
      ).version;

      expect(h.codeOf(await h.sendVersion(different.id).expect(422))).toBe('BUDGET.RESERVE_REASON_REQUIRED');
      expect(same).toMatchObject({ reserve: { amount: '200000' }, defaultReserve: { amount: '200000' } });
      await h.sendVersion(same.id).expect(200);
    });

    it('saves a draft with no file, and sends it only with one: 422 BUDGET_VERSION.ATTACHMENT_REQUIRED, nothing is written', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);
      await h.updateVersion(version.id, { reserve: h.money(10_000_000) }).expect(200);
      // The route itself, with the cycle locked for the send as the harness does for every other send (`sendingCycleLock`).
      const send = () =>
        request(h.server()).post(`/api/v1/budget-versions/${version.id}/submission`).set(h.as(h.finance));

      await sendingCycleLock.run(h.ctx.sql, version.id, h.today(), async () => {
        const refused = await send().expect(422);

        expect(h.codeOf(refused)).toBe('BUDGET_VERSION.ATTACHMENT_REQUIRED');
        expect(await stateOf(version.id)).toBe('DRAFT');
        expect(await proposalState(proposal.id)).toBe('SUBMITTED');
        await attachedVersionFile(h.ctx.sql, version.id, h.finance.employeeId);
        await send().expect(200);
      });
    });

    it('saves a draft over the ceiling and refuses to send it: 2,000 million less a reserve of 200, a total of 1,850 is 50 million over (409)', async () => {
      const year = h.next + 2;
      await h.ctx.sql.query(
        `UPDATE budget_cycles SET annual_ceiling_minor = 2000000000, shared_pool_reserve_minor = 200000000 WHERE year = $1`,
        [year],
      );
      try {
        const { proposal } = await waiting(undefined, year);
        const draft = await h
          .createVersion({
            proposalId: proposal.id,
            base: h.money(1_700_000_000),
            reserve: h.money(150_000_000),
            reserveReason: 'The figures of the example',
          })
          .expect(201);
        const version = h.dataOf<{ version: VersionWire }>(draft).version;
        await h.updateVersion(version.id, { reserve: h.money(150_000_000) }).expect(200);

        const refused = await h.sendVersion(version.id).expect(409);

        expect(h.codeOf(refused)).toBe('BUDGET_VERSION.OVER_CEILING');
        expect(h.detailsOf(refused)).toMatchObject({ overBy: '50000000' });
        expect(await stateOf(version.id)).toBe('DRAFT');
      } finally {
        await h.ctx.sql.query(
          `UPDATE budget_cycles SET annual_ceiling_minor = 100000000000000, shared_pool_reserve_minor = 0 WHERE year = $1`,
          [year],
        );
      }
    });
  });

  describe('the reserve that is the default share of the base (B-M3)', () => {
    it('follows the base when only the base is changed, so it stays the default and asks for no reason', async () => {
      const { proposal } = await waiting();
      const made = await h.createVersion({ proposalId: proposal.id, base: h.money(60_000_000) }).expect(201);
      const version = h.dataOf<{ version: VersionWire }>(made).version;
      const before = BigInt(version.reserve.amount);
      expect(before).toBe((BigInt(version.base.amount) * BigInt(version.reservePercent)) / 100n);

      const response = await h.updateVersion(version.id, { base: h.money(50_000_000) }).expect(200);

      const after = h.dataOf<{ version: VersionWire }>(response).version;
      expect(BigInt(after.reserve.amount)).toBe((50_000_000n * BigInt(after.reservePercent)) / 100n);
      expect(after.reserveReason).toBeNull();
      await h.sendVersion(version.id).expect(200);
    });

    it('stays as it was when it is not the default, and when the reserve is given together with the base', async () => {
      const { proposal } = await waiting();
      const version = await h.built(proposal.id);

      const kept = await h.updateVersion(version.id, { base: h.money(50_000_000) }).expect(200);
      const given = await h
        .updateVersion(version.id, { base: h.money(40_000_000), reserve: h.money(1_000_000) })
        .expect(200);

      expect(h.dataOf<{ version: VersionWire }>(kept).version.reserve.amount).toBe('20000000');
      expect(h.dataOf<{ version: VersionWire }>(given).version.reserve.amount).toBe('1000000');
    });
  });

  describe('the current budget (US-06-09 AC-17)', () => {
    it('never has an amount changed in place, even only to update a price: the budget of a year is not revised (QĐ-97b)', async () => {
      const { proposal } = await waiting();
      const current = await h.current(proposal.id);

      const response = await h.updateVersion(current.id, { base: h.money(22_000_000) }).expect(409);

      expect(h.codeOf(response)).toBe('BUDGET.VERSION_NOT_EDITABLE');
      expect(h.dataOf<{ version: VersionWire }>(await h.versionOf(current.id).expect(200)).version.base.amount).toBe(
        current.base.amount,
      );
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
      const body = { proposalId: proposal.id, base: h.money(1), reserve: h.money(0) };

      await h.createVersion(body, account).expect(403);
      await h.updateVersion(version.id, { base: h.money(1) }, account).expect(403);
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
        .send({ proposalId: proposal.id, base: h.money(1), reserve: h.money(0) });

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
