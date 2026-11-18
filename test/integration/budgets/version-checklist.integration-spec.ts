import { bodyOf } from '../../support/api-body';
import { BudgetHarness } from '../../support/budget-harness';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

/**
 * The checklist of the decision of the spending approver on a version of a budget (`PL-2.5`, `QĐ-111ap`, `QĐ-111ad`): the answers kept with the
 * version, a No that locks the approval and leaves only the return to Finance, and the reason of the return filled in from the answers.
 */
describe('the checklist of the decision on a version of a budget (integration, real PostgreSQL)', () => {
  let boss: Person;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1'));
    await h.setRole('SPENDING_APPROVER', boss);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const sent = async () => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-V${counter}`);
    const proposal = await h.budgetProposed(unit.head, unit.department.unitId, undefined, h.next);
    const version = await h.built(proposal.id, {});
    await h.sendVersion(version.id).expect(200);

    return version;
  };
  const stateOf = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state FROM budget_versions WHERE id = $1`, [id])).rows[0].state;
  const rowsOf = (id: string) =>
    h.ctx.sql
      .query<{ decision: string; has_no: boolean; policy_version_id: string }>(
        `SELECT decision, has_no, policy_version_id FROM decision_checklists WHERE subject_id = $1 AND step_code = '4.7'`,
        [id],
      )
      .then((result) => result.rows);
  const no = () => h.checklists.questionsOf('4.7')[1];

  it('keeps the answers with the approval of a version', async () => {
    const version = await sent();

    await h.decideVersion(version.id, { decision: 'APPROVE' }, boss.account).expect(200);

    expect(await stateOf(version.id)).toBe('APPROVED');
    expect(await rowsOf(version.id)).toEqual([
      expect.objectContaining({
        decision: 'APPROVE',
        has_no: false,
        policy_version_id: h.checklists.yes('4.7').policyVersionId,
      }),
    ]);
  });

  it('keeps the answers at the hour of the decision', async () => {
    const version = await sent();

    await h.decideVersion(version.id, { decision: 'APPROVE' }, boss.account).expect(200);

    const decided = await h.ctx.sql.query<{ decision_at: Date; checklist_at: Date }>(
      `SELECT d.decided_at AS decision_at, c.decided_at AS checklist_at
         FROM budget_version_decisions d JOIN decision_checklists c ON c.subject_id = d.version_id AND c.step_code = '4.7'
        WHERE d.version_id = $1`,
      [version.id],
    );
    expect(decided.rows).toHaveLength(1);
    expect(decided.rows[0].checklist_at.toISOString()).toBe(decided.rows[0].decision_at.toISOString());
  });

  const answersOf = async (id: string) =>
    Object.fromEntries(
      (
        (
          await h.ctx.sql.query<{ answers: { itemCode: string; answer: string }[] }>(
            `SELECT answers FROM decision_checklists WHERE subject_id = $1 AND step_code = '4.7'`,
            [id],
          )
        ).rows[0]?.answers ?? []
      ).map((answer) => [answer.itemCode, answer.answer]),
    );

  it('keeps the questions of the system as Yes with an approval, which checks them all, and the ceiling as not checked with a return, which does not', async () => {
    const approved = await sent();
    const returned = await sent();

    await h.decideVersion(approved.id, { decision: 'APPROVE' }, boss.account).expect(200);
    await h
      .decideVersion(returned.id, { decision: 'RETURN', checklist: h.checklists.answer('4.7', [no()]) }, boss.account)
      .expect(200);

    expect(await answersOf(approved.id)).toMatchObject({ '4.7-01': 'YES', '4.7-02': 'YES' });
    expect(await answersOf(returned.id)).toMatchObject({ '4.7-01': 'YES', '4.7-02': 'NOT_CHECKED' });
  });

  it('checks the ceiling of the year again when it approves: a ceiling that no longer holds the versions refuses the approval, and a return still goes', async () => {
    const version = await sent();
    const year = (
      await h.ctx.sql.query<{ year: number }>(`SELECT year FROM budget_versions WHERE id = $1`, [version.id])
    ).rows[0].year;
    await h.ctx.sql.query(`UPDATE budget_cycles SET annual_ceiling_minor = 1 WHERE year = $1`, [year]);

    try {
      const refused = await h.decideVersion(version.id, { decision: 'APPROVE' }, boss.account).expect(409);

      expect(bodyOf(refused).error.code).toBe('BUDGET_VERSION.OVER_CEILING');
      expect(await stateOf(version.id)).toBe('SENT');
      expect(await rowsOf(version.id)).toEqual([]);
      await h
        .decideVersion(version.id, { decision: 'RETURN', reason: 'Over the ceiling now' }, boss.account)
        .expect(200);
      expect(await stateOf(version.id)).toBe('CHANGES_REQUESTED');
    } finally {
      await h.ctx.sql.query(`UPDATE budget_cycles SET annual_ceiling_minor = 100000000000000 WHERE year = $1`, [year]);
    }
  });

  it('locks the approval when an answer is No, and decides nothing', async () => {
    const version = await sent();

    const refused = await h
      .decideVersion(version.id, { decision: 'APPROVE', checklist: h.checklists.answer('4.7', [no()]) }, boss.account)
      .expect(422);

    expect(bodyOf(refused).error.code).toBe('POLICY.CHECKLIST_HAS_NO');
    expect(await stateOf(version.id)).toBe('SENT');
    expect(await rowsOf(version.id)).toEqual([]);
  });

  it('returns the version to Finance with the reason filled in from the answer No', async () => {
    const version = await sent();

    await h
      .decideVersion(version.id, { decision: 'RETURN', checklist: h.checklists.answer('4.7', [no()]) }, boss.account)
      .expect(200);

    expect(await stateOf(version.id)).toBe('CHANGES_REQUESTED');
    const reason = (
      await h.ctx.sql.query<{ reason: string | null }>(
        `SELECT reason FROM budget_version_decisions WHERE version_id = $1`,
        [version.id],
      )
    ).rows[0].reason;
    expect(reason).toContain(no());
    expect(await rowsOf(version.id)).toEqual([expect.objectContaining({ decision: 'RETURN', has_no: true })]);
  });

  it('asks for a reason when a return has none and every answer is Yes', async () => {
    const version = await sent();

    const refused = await h.decideVersion(version.id, { decision: 'RETURN' }, boss.account).expect(422);

    expect(bodyOf(refused).error.code).toBe('VALIDATION_ERROR');
    expect(await stateOf(version.id)).toBe('SENT');
  });
});
