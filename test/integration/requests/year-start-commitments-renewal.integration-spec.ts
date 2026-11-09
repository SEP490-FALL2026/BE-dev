import { YearStartCommitmentsService } from '../../../src/modules/requests/year-start-commitments/year-start-commitments.service';
import { pretendBusinessToday } from '../../support/pretend-today';
import { ReturnHarness } from '../../support/return-harness';
import type { Unit } from '../../support/spend-harness';

const h = new ReturnHarness();
const M = 1_000_000;
/** The plans of the suite are priced 1 000 000 a month (`subscription` of the seat harness). */
const MONTH = 1_000_000n;

/**
 * The commitment of 01/01 of a right a renewal extended (`FR-5.8`(6), `BR-MF1-09e`, `QĐ-109b`): the approval of a renewal ends the old
 * record and begins the one that follows it, with no grant task. The right that runs on 01/01 is the renewal's, so the renewal holds the
 * commitment of the new year — the first year of a term that begins in it was shown and never held when it was approved (`QĐ-109b`).
 */
describe('the commitment of 01/01 of a right a renewal extended over PostgreSQL (BR-MF1-09e, QĐ-109b)', () => {
  let paid: { subscriptionId: string; planId: string };
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const subscriptionId = await h.subscription(20, 'K2');
    paid = { subscriptionId, planId: await h.planOf(subscriptionId) };
    await h
      .declareTaxProfile((await h.vendorOf(paid.planId)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  beforeEach(async () => {
    await h.ctx.sql.query(
      `INSERT INTO year_start_commitment_runs (organization_id, year, started_at, completed_at)
       SELECT id, $1, now(), now() FROM organizations ON CONFLICT DO NOTHING`,
      [h.year],
    );
    await h.ctx.sql.query(`DELETE FROM year_start_commitment_runs WHERE year = $1`, [h.next]);
  });

  /** The head confirms the need of a paid renewal, sends it on, and the approver decides it: approval makes the record that follows. */
  const approvePaid = async (id: string, unit: Unit) => {
    await h.decide(id, { decision: 'APPROVE' }, unit.head.account).expect(200);
    await h.setPayments(id, { amount: 5 * M });
    await h.sendOn([id], unit.head.account).expect(201);
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);
  };
  const rows = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ amount_minor: string; origin: string; currency: string }>(
        `SELECT amount_minor::text, origin::text, currency FROM budget_commitments WHERE request_id = $1 AND year = $2`,
        [requestId, h.next],
      )
    ).rows;
  /** The months of the next year a right that ends on `end` runs, the month of the end whole. */
  const monthsOfNextYear = (end: string): bigint => {
    const year = Number(end.slice(0, 4));
    if (year < h.next) return 0n;

    return year > h.next ? 12n : BigInt(Number(end.slice(5, 7)));
  };

  it('BR-MF1-09e: the renewal holds the year of the record that follows the renewed one, at the price of 01/01, for the months of its new term', async () => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-YR${counter}`);
    await h.budgetFor(unit, { total: 100 * M });
    const assignmentId = await h.seatOf(unit.member, paid, { expectedEndDate: h.inDays(5) });
    const { request } = await h.renewed(unit.member.account, {
      assignmentId,
      extensionMonths: 11,
      businessReason: 'The work goes on',
    });
    await approvePaid(request.id, unit);
    // BR-MF1-08d: the record that follows is written when the IT Admin completes the task EXTEND the approval opened.
    const [extension] = (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM provisioning_tasks WHERE request_id = $1 AND kind = 'EXTEND'`,
        [request.id],
      )
    ).rows;
    await h.claim(extension.id).expect(200);
    await h.complete(extension.id, { evidence: 'Extended with the vendor' }).expect(200);
    const renewal = await h.renewalOf(request.id);
    expect(renewal.successor_assignment_id).not.toBeNull();

    pretendBusinessToday(h.ctx.app, `${h.next}-01-01`);
    await h.ctx.app.get(YearStartCommitmentsService, { strict: false }).run(new Date());

    const months = monthsOfNextYear(renewal.new_expected_end_date);
    expect(await rows(request.id)).toEqual(
      months === 0n ? [] : [{ amount_minor: String(months * MONTH), origin: 'YEAR_START', currency: h.reporting }],
    );
  });
});
