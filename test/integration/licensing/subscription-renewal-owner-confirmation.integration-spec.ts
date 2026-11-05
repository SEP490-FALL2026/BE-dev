import { PgRelay } from '../../support/pg-relay';
import { dataStatements, QueryCounter } from '../../support/query-count';
import { RenewalHarness } from '../../support/renewal-harness';

const h = new RenewalHarness();

interface Page {
  items: { id: string }[];
  pagination: { totalItems: number };
}

/**
 * The rest of `qd96-100-subscription-owner-confirmation` that needs PostgreSQL: the CHECK of the role of a decision (the migration
 * widens it, nothing else), the note an outcome different from the decision must carry (`QĐ-96i`), and the number of statements of the
 * reads of a head, which does not grow with the cases they read (`API-LIST-DETAIL.1`).
 */
describe('the confirmation of a renewal by the owner head (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;

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
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  /** The constraint that refuses a decision written with this role in a transaction that is rolled back, or null when it is accepted. */
  const refusedBy = async (renewalId: string, role: string): Promise<string | null> => {
    try {
      await h.ctx.sql.query('BEGIN');
      await h.ctx.sql.query(
        `UPDATE subscription_renewals
            SET state = 'DECIDED', decided_choice = 'RENEW', decided_by_employee_id = proposed_by_employee_id,
                decided_by_app_user_id = proposed_by_app_user_id, decider_role = $2, decided_at = now(),
                decided_on = current_date, decided_after_deadline = false, execution_point = 'AS_PLANNED',
                active_seats_at_decision = 0, decision_snapshot = '{"source":"NOT_CONNECTED","takenAt":"2026-11-08T00:00:00.000Z"}'
          WHERE id = $1`,
        [renewalId, role],
      );

      return null;
    } catch (error) {
      return (error as { constraint?: string }).constraint ?? 'unknown';
    } finally {
      await h.ctx.sql.query('ROLLBACK');
    }
  };

  it('keeps the two roles of before for the cases already decided, takes the head of the owner department, and refuses any other (migration)', async () => {
    const unit = await h.unit(1);
    const subscriptionId = await h.term({ ownerDepartmentId: unit.department.id, noticeDeadline: h.inDays(30) });
    const id = await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });

    expect(await refusedBy(id, 'SPENDING_APPROVER')).toBeNull();
    expect(await refusedBy(id, 'CONFLICT_SUBSTITUTE')).toBeNull();
    expect(await refusedBy(id, 'OWNER_DEPARTMENT_HEAD')).toBeNull();
    expect(await refusedBy(id, 'SOMEBODY_ELSE')).toBe('subscription_renewals_decider_role');
    expect((await h.caseRow(id)).state).toBe('PROPOSED');
  });

  it('asks the note of an outcome that is not the decision, the reason and the evidence, and not of the others (QĐ-96i)', async () => {
    const unit = await h.unit(1);
    const refused = await h.term({ ownerDepartmentId: unit.department.id, noticeDeadline: h.inDays(31) });
    const different = await h.term({ ownerDepartmentId: unit.department.id, noticeDeadline: h.inDays(31) });
    const open = await h.term({ ownerDepartmentId: unit.department.id, noticeDeadline: h.inDays(31) });
    const ids: string[] = [];
    for (const subscriptionId of [refused, different, open]) {
      const id = await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });
      await h.confirmRenewal(id, unit.head.account).expect(200);
      ids.push(id);
    }

    expect(h.codeOf(await h.outcome(ids[0], { outcome: 'VENDOR_REFUSED' }).expect(422))).toBe('VALIDATION_ERROR');
    expect(h.codeOf(await h.outcome(ids[1], { outcome: 'DIFFERENT' }).expect(422))).toBe('VALIDATION_ERROR');
    expect((await h.caseRow(ids[0])).state).toBe('DECIDED');
    await h
      .outcome(ids[0], { outcome: 'VENDOR_REFUSED', note: 'The vendor will not renew; e-mail of 05/11' })
      .expect(200);
    await h.outcome(ids[2], { outcome: 'UNCONFIRMED' }).expect(200);
  });

  it('refuses the proposal of an IT Admin who heads the owner department: another IT Admin proposes (A-H1)', async () => {
    const own = await h.departmentWithUnit('P-RNOWN');
    const itHead = await h.staff(own, 'RNOWN-IT', 'IT_ADMIN');
    await h.makeHead(own, itHead);
    // Heading a department swaps the role of the IT Admin for MANAGER (one role per account). The head assignment is the organization's
    // own record, so an account that got IT_ADMIN back is an IT Admin who heads the department: the case is made so, past the database guards that now prevent it.
    await h.ctx.sql.query('ALTER TABLE role_grants DISABLE TRIGGER USER');
    await h.ctx.sql.query(`UPDATE role_grants SET revoked_at = now() WHERE app_user_id = $1 AND role = 'MANAGER'`, [
      itHead.account.appUserId,
    ]);
    await h.ctx.sql.query(`UPDATE role_grants SET revoked_at = NULL WHERE app_user_id = $1 AND role = 'IT_ADMIN'`, [
      itHead.account.appUserId,
    ]);
    await h.ctx.sql.query('ALTER TABLE role_grants ENABLE TRIGGER USER');
    const subscriptionId = await h.term({ ownerDepartmentId: own.id, noticeDeadline: h.inDays(35) });
    const cases = await h.ctx.sql.query<{ n: string }>('SELECT count(*) AS n FROM subscription_renewals');

    const refused = await h.propose({ subscriptionId, choice: 'RENEW' }, itHead.account).expect(409);

    expect(h.codeOf(refused)).toBe('SUBSCRIPTION_RENEWAL.PROPOSER_IS_OWNER_HEAD');
    const after = await h.ctx.sql.query<{ n: string }>('SELECT count(*) AS n FROM subscription_renewals');
    expect(after.rows[0].n).toBe(cases.rows[0].n);
  });

  it('settles who may confirm before anything is read: the head of another department finds no case, the IT Admin and the spending approver are refused (A-M2)', async () => {
    const unit = await h.unit(1);
    const other = await h.unit(1);
    const subscriptionId = await h.term({ ownerDepartmentId: unit.department.id, noticeDeadline: h.inDays(36) });
    const id = await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });

    const otherHead = await h.confirmRenewal(id, other.head.account).expect(404);
    const itAdmin = await h.confirmRenewal(id, h.it1).expect(403);
    const approver = await h.confirmRenewal(id, h.deciderOf()).expect(403);

    expect(h.codeOf(otherHead)).toBe('SUBSCRIPTION_RENEWAL.NOT_FOUND');
    expect(h.codeOf(itAdmin)).toBe('SUBSCRIPTION_RENEWAL.NOT_DECIDER');
    expect(h.codeOf(approver)).toBe('SUBSCRIPTION_RENEWAL.NOT_DECIDER');
    expect((await h.caseRow(id)).state).toBe('PROPOSED');
    await h.confirmRenewal(id, unit.head.account).expect(200);
  });

  it('reads a page and a case of a head with a number of statements that does not grow with the cases of their department', async () => {
    const unit = await h.unit(1);
    const first = await h.term({ ownerDepartmentId: unit.department.id, noticeDeadline: h.inDays(33) });
    const firstId = await h.proposedRenewal({ subscriptionId: first, choice: 'RENEW' });
    const run = async () => ({
      list: await counter.run(() => h.renewals('?pageSize=100', unit.head.account).expect(200)),
      get: await counter.run(() => h.read(firstId, unit.head.account).expect(200)),
    });
    const few = await run();
    for (let index = 0; index < 4; index += 1) {
      const subscriptionId = await h.term({
        ownerDepartmentId: unit.department.id,
        noticeDeadline: h.inDays(34 + index),
      });
      await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });
    }
    const many = await run();

    const pageOf = (run: { result: { body: unknown } }) => (run.result.body as { data: Page }).data;
    expect(pageOf(few.list).items).toHaveLength(1);
    expect(pageOf(many.list).items).toHaveLength(5);
    for (const key of ['list', 'get'] as const) {
      expect(dataStatements(many[key].statements)).toHaveLength(dataStatements(few[key].statements).length);
    }
  }, 300000);
});
