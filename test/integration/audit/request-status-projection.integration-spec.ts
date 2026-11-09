import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { AuditApi } from '../../../src/modules/audit/public/audit.api';
import { NotificationsApi } from '../../../src/modules/notifications/public/notifications.api';
import { FIGURE_WORDS, FORBIDDEN_PARAM_KEY } from '../../../src/modules/notifications/inbox/inbox.policy';
import type { Unit } from '../../support/spend-harness';
import { StatusHarness } from '../../support/status-harness';

const h = new StatusHarness();
const M = 1_000_000;
const SLICE_ACTION = 'TEST.READ_SINCE';

describe('the projection of the audit events into the inbox over PostgreSQL (US-05-15)', () => {
  let plan: string;
  let counter = 0;
  const runner = () => h.ctx.app.get(TransactionRunner, { strict: false });
  const audit = () => h.ctx.app.get(AuditApi, { strict: false });

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const example = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-J${counter}`);
    await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });

    return u;
  };
  /**
   * A request the head sent for colleagues, which is a request for a group of two at least (`QĐ-96`): the head is the requester and
   * the people are who it is for. `colleague` is the first of them.
   */
  const forColleagues = async (u: Unit, size = 2) => {
    counter += 1;
    const people = [];
    for (let index = 1; index <= size; index += 1) people.push(await h.staff(u.department, `J-C${counter}-${index}`));
    const id = await h.sentForPeople(plan, people, u.head.account, {
      businessReason: 'The new designers need the tool',
    });

    return { id, colleague: people[0], people };
  };
  const cursor = async () =>
    (
      await h.ctx.sql.query<{ last_occurred_at: Date; last_event_id: string }>(
        `SELECT last_occurred_at, last_event_id FROM request_status_cursor`,
      )
    ).rows[0];

  describe('what the database refuses about the cursor whoever writes', () => {
    const state = async (text: string, values: unknown[] = []): Promise<string | null> => {
      try {
        await h.ctx.sql.query(text, values);

        return null;
      } catch (error) {
        return (error as { code?: string }).code ?? 'unknown';
      }
    };

    it('keeps exactly one cursor, which nothing deletes or truncates, started at the deployment and never behind the trail it has read', async () => {
      expect(await h.count('request_status_cursor')).toBe(1);
      expect(
        await state(
          `INSERT INTO request_status_cursor (name, last_occurred_at, last_event_id) VALUES ('OTHER', now(), gen_random_uuid())`,
        ),
      ).toBe('23514');
      expect(
        await state(
          `INSERT INTO request_status_cursor (name, last_occurred_at, last_event_id) VALUES ('REQUEST_STATUS', now(), gen_random_uuid())`,
        ),
      ).toBe('23505');
      expect(await state(`DELETE FROM request_status_cursor`)).toBe('23001');
      expect(await state(`TRUNCATE request_status_cursor`)).toBe('23001');
      expect(await h.count('request_status_cursor')).toBe(1);
    });
  });

  describe('reading the audit trail in order (the door for a consumer of the system)', () => {
    const at = (second: number) => new Date(Date.UTC(2031, 0, 1, 0, 0, second));
    const insertSlice = async (second: number, id: string, action = SLICE_ACTION) =>
      h.ctx.sql.query(
        `INSERT INTO audit_events (id, organization_id, occurred_at, actor_kind, actor_roles, action, resource_type, resource_id, after, correlation_id)
         VALUES ($1, $2, $3, 'SYSTEM', '{}', $4, 'TEST', 'r', '{"n":1}'::jsonb, 'c')`,
        [id, h.seed.organizationId, at(second), action],
      );
    const read = (
      from: { occurredAt: Date; id: string } | null,
      options: { upTo: Date; actions?: string[]; limit?: number },
    ) => runner().run((tx) => audit().readSince(tx, from, { actions: [SLICE_ACTION], limit: 100, ...options }));

    it('returns the events of the named actions by time and then by id, from the beginning when there is no cursor', async () => {
      const ids = [
        '00000000-0000-4000-8000-0000000000b2',
        '00000000-0000-4000-8000-0000000000b1',
        '00000000-0000-4000-8000-0000000000b3',
      ];
      await insertSlice(2, ids[0]);
      await insertSlice(2, ids[1]);
      await insertSlice(1, ids[2]);
      await insertSlice(1, randomUUID(), 'TEST.OTHER');

      const slice = await read(null, { upTo: at(60) });

      expect(slice.map((event) => event.id)).toEqual([ids[2], ids[1], ids[0]]);
      expect(slice[0]).toMatchObject({
        action: SLICE_ACTION,
        resourceType: 'TEST',
        resourceId: 'r',
        after: { n: 1 },
        actorAppUserId: null,
      });
      expect(slice[0].organizationId).toBe(h.seed.organizationId);
    });

    it('starts after the cursor, stops at the moment asked for, and gives at most the limit', async () => {
      const ids = [
        '00000000-0000-4000-8000-0000000000b1',
        '00000000-0000-4000-8000-0000000000b2',
        '00000000-0000-4000-8000-0000000000b3',
      ];

      const afterFirst = await read({ occurredAt: at(1), id: ids[2] }, { upTo: at(60) });
      const untilOne = await read(null, { upTo: at(1) });
      const limited = await read(null, { upTo: at(60), limit: 2 });

      expect(afterFirst.map((event) => event.id)).toEqual([ids[0], ids[1]]);
      expect(untilOne.map((event) => event.id)).toEqual([ids[2]]);
      expect(limited.map((event) => event.id)).toEqual([ids[2], ids[0]]);
    });

    it('reads nothing that is not of a named action, and does not change the trail', async () => {
      const before = await h.count('audit_events');

      expect(await read(null, { upTo: at(60), actions: ['TEST.NEVER_WRITTEN'] })).toEqual([]);
      expect(await h.count('audit_events')).toBe(before);
    });
  });

  describe('one pass of the projection', () => {
    it('reads only what is old enough for no transaction to commit an older event, and leaves the newer for a later pass', async () => {
      const u = await example();
      const sent = await h.sent(u.member, plan, { termMonths: 1 });

      // The worker reads at the real time: an event of a moment ago is younger than the delay.
      await h.projectAt(new Date());
      expect(await h.noticesAbout(sent.id)).toEqual([]);

      await h.project();
      expect(await h.codesFor(u.member.employeeId, sent.id)).toEqual(['REQUEST_SUBMITTED']);
    });

    it('does nothing when another pass holds the cursor, and then makes the notices when it lets go (two workers never project at once)', async () => {
      const u = await example();
      const { id } = await forColleagues(u);
      await h.writeAudit('ACCESS_REQUEST.GRANT_COMPLETED', 'ACCESS_REQUEST', id, { requestId: id });
      const holder = await h.openClient();
      try {
        await holder.query('BEGIN');
        await holder.query(`SELECT 1 FROM request_status_cursor WHERE name = 'REQUEST_STATUS' FOR UPDATE`);
        const before = await h.noticeCount();

        const busy = await h.project();

        expect(busy).toMatchObject({ busy: true, eventsRead: 0, notified: 0 });
        expect(await h.noticeCount()).toBe(before);
      } finally {
        await holder.query('ROLLBACK');
        await holder.end();
      }

      const done = await h.project();

      expect(done.busy).toBe(false);
      expect((await h.noticesAbout(id)).filter((row) => row.code === 'REQUEST_GRANTED')).toHaveLength(3);
    });

    it('makes one notice for each recipient and event however many workers look at it at once', async () => {
      const u = await example();
      const { id, people } = await forColleagues(u);
      await h.project();
      await h.writeAudit('ACCESS_REQUEST.GRANT_COMPLETED', 'ACCESS_REQUEST', id, { requestId: id });

      const results = await Promise.all([h.project(), h.project(), h.project()]);

      const granted = (await h.noticesAbout(id)).filter((row) => row.code === 'REQUEST_GRANTED');
      expect(granted.map((row) => row.recipient_employee_id).sort()).toEqual(
        [...people.map((person) => person.employeeId), u.head.employeeId].sort(),
      );
      expect(results.reduce((sum, result) => sum + result.notified, 0)).toBe(3);
    });

    it('does not lose an event whose transaction commits after a pass that went by it, and the cursor only moves forward', async () => {
      const u = await example();
      const { id } = await forColleagues(u);
      await h.project();
      const first = await cursor();
      const late = await h.openClient();
      let lateEventId = '';
      let begun = new Date();
      try {
        await late.query('BEGIN');
        // The event is stamped now, when the transaction begins, and stays invisible until it commits.
        lateEventId = await h.writeAudit(
          'ACCESS_REQUEST.GRANT_COMPLETED',
          'ACCESS_REQUEST',
          id,
          { requestId: id },
          { client: late },
        );
        begun = (await late.query<{ now: Date }>(`SELECT now() AS now`)).rows[0].now;
        // An event of another request commits meanwhile, newer than the one that is still open.
        const other = await forColleagues(u);
        await h.writeAudit('ACCESS_REQUEST.GRANT_FAILED', 'ACCESS_REQUEST', other.id, { requestId: other.id });

        // A pass at the moment the open transaction began is as far as it may go: the newer event is left for later.
        const early = await h.projectUpTo(new Date(begun.getTime() - 1));
        expect(early.notified).toBe(0);
        expect((await cursor()).last_occurred_at.getTime()).toBeLessThan(begun.getTime());
        await late.query('COMMIT');
      } finally {
        await late.end();
      }

      const after = await h.project();

      expect(after.notified).toBeGreaterThanOrEqual(3);
      expect((await h.noticesAbout(id)).some((row) => row.event_key.includes(lateEventId))).toBe(true);
      const last = await cursor();
      expect(last.last_occurred_at.getTime()).toBeGreaterThanOrEqual(first.last_occurred_at.getTime());
      // A pass that goes back in time moves nothing back.
      await h.projectUpTo(new Date(begun.getTime() - 3_600_000));
      expect((await cursor()).last_occurred_at.getTime()).toBe(last.last_occurred_at.getTime());
    });

    it('skips an event that names no request or one that is gone, says so, and goes on with the others', async () => {
      const u = await example();
      const { id } = await forColleagues(u);
      await h.project();
      await h.writeAudit('ACCESS_REQUEST.GRANT_COMPLETED', 'ACCESS_REQUEST', id, {});
      await h.writeAudit('ACCESS_REQUEST.GRANT_COMPLETED', 'ACCESS_REQUEST', randomUUID(), { requestId: randomUUID() });
      await h.writeAudit('ACCESS_REQUEST.GRANT_FAILED', 'ACCESS_REQUEST', id, { requestId: id });

      const result = await h.project();

      expect(result).toMatchObject({ eventsRead: 3, skipped: 2 });
      expect((await h.noticesAbout(id)).filter((row) => row.code === 'REQUEST_FAILED')).toHaveLength(3);
      expect((await h.noticesAbout(id)).some((row) => row.code === 'REQUEST_GRANTED')).toBe(false);
    });

    it('undoes the whole pass when the database fails in the middle, and makes the notices in the next pass', async () => {
      const u = await example();
      const { id } = await forColleagues(u);
      await h.project();
      await h.writeAudit('ACCESS_REQUEST.GRANT_COMPLETED', 'ACCESS_REQUEST', id, { requestId: id });
      const before = await h.noticeCount();
      const position = await cursor();
      // eslint-disable-next-line @typescript-eslint/unbound-method -- called back on the instance below, with `this` kept
      const original = NotificationsApi.prototype.notifyInApp;
      let calls = 0;
      const spy = jest.spyOn(NotificationsApi.prototype, 'notifyInApp').mockImplementation(function (
        this: NotificationsApi,
        ...args
      ) {
        calls += 1;
        if (calls === 2) return Promise.reject(new Error('the database went away'));

        return original.apply(this, args);
      });
      try {
        await expect(h.project()).rejects.toThrow('the database went away');
      } finally {
        spy.mockRestore();
      }

      expect(await h.noticeCount()).toBe(before);
      expect(await cursor()).toEqual(position);

      await h.project();
      expect((await h.noticesAbout(id)).filter((row) => row.code === 'REQUEST_GRANTED')).toHaveLength(3);
    });

    it('works off a backlog of more than one batch in one pass, and reads nothing the second time', async () => {
      const u = await example();
      const sent = await h.sent(u.member, plan, { termMonths: 1 });
      await h.project();
      const before = await h.noticeCount();
      await h.ctx.sql.query(
        `INSERT INTO audit_events (id, organization_id, actor_kind, actor_roles, action, resource_type, resource_id, after, correlation_id)
         SELECT gen_random_uuid(), $1, 'SYSTEM', '{}', 'ACCESS_REQUEST.GRANT_FAILED', 'ACCESS_REQUEST', $2::text,
                jsonb_build_object('requestId', $2::text), 'backlog'
           FROM generate_series(1, 205)`,
        [h.seed.organizationId, sent.id],
      );

      const first = await h.project();
      const second = await h.project();

      expect(first).toMatchObject({ batches: 2, eventsRead: 205, notified: 205 });
      expect(second.eventsRead).toBe(0);
      expect(await h.noticeCount()).toBe(before + 205);
    });
  });

  describe('a request for a group (US-05-15 AC-9)', () => {
    it('tells the head and each person the outcome of their own part, with a key for each person, never the part of another', async () => {
      const u = await example();
      const { id, people } = await forColleagues(u, 3);
      const [colleague, second, third] = people;
      await h.project();
      await h.writeAudit('ACCESS_REQUEST.GRANT_COMPLETED', 'ACCESS_REQUEST', id, {
        requestId: id,
        beneficiaryEmployeeId: colleague.employeeId,
      });
      await h.writeAudit('ACCESS_REQUEST.GRANT_FAILED', 'ACCESS_REQUEST', id, {
        requestId: id,
        beneficiaryEmployeeId: second.employeeId,
      });
      await h.writeAudit('ACCESS_REQUEST.GRANT_COMPLETED', 'ACCESS_REQUEST', id, {
        requestId: id,
        beneficiaryEmployeeId: third.employeeId,
      });

      await h.project();

      expect(await h.codesFor(colleague.employeeId, id)).toEqual(['REQUEST_GRANTED']);
      expect(await h.codesFor(second.employeeId, id)).toEqual(['REQUEST_FAILED']);
      expect(await h.codesFor(third.employeeId, id)).toEqual(['REQUEST_GRANTED']);
      const head = (await h.noticesOf(u.head.employeeId)).filter(
        (row) => row.subject_id === id && row.code !== 'REQUEST_SUBMITTED',
      );
      expect(head.map((row) => row.code).sort()).toEqual(['REQUEST_FAILED', 'REQUEST_GRANTED', 'REQUEST_GRANTED']);
      expect(new Set(head.map((row) => row.event_key)).size).toBe(3);
      expect(head.every((row) => /:[0-9a-f-]{36}$/.test(row.event_key))).toBe(true);
    });
  });

  describe('a request closed because the person it was for left (US-05-15 AC-12, the receiving side)', () => {
    it('tells the head and the person it was for that it was cancelled, never as a withdrawal or a failure, and changes nothing of the request', async () => {
      const u = await example();
      const { id, colleague } = await forColleagues(u);
      await h.project();
      const state = await h.state(id);
      expect(await h.codesFor(colleague.employeeId, id)).toEqual([]);

      await h.writeAudit('ACCESS_REQUEST.CANCELLED', 'ACCESS_REQUEST', id, {
        requestId: id,
        reasonKind: 'BENEFICIARY_LEFT',
        cancelledByEmployeeId: h.it1.employeeId,
      });
      await h.project();

      for (const person of [u.head, colleague]) {
        const rows = (await h.noticesOf(person.employeeId)).filter(
          (row) => row.subject_id === id && row.code === 'REQUEST_CANCELLED',
        );
        expect(rows.map((row) => row.params)).toEqual([{ requestId: id, reasonKind: 'BENEFICIARY_LEFT' }]);
      }
      expect((await h.noticesAbout(id)).some((row) => ['REQUEST_WITHDRAWN', 'REQUEST_FAILED'].includes(row.code))).toBe(
        false,
      );
      expect(await h.state(id)).toBe(state);
    });
  });

  describe('who is told and who is not', () => {
    it('does not tell a person who has left, and tells the others', async () => {
      const u = await example();
      const { id, colleague } = await forColleagues(u);
      await h.project();
      await h.leave(colleague.employeeId, { announce: false });
      await h.writeAudit('ACCESS_REQUEST.GRANT_COMPLETED', 'ACCESS_REQUEST', id, { requestId: id });

      await h.project();

      expect(await h.codesFor(colleague.employeeId, id)).toEqual([]);
      expect(await h.codesFor(u.head.employeeId, id)).toContain('REQUEST_GRANTED');
    });

    it('does not tell the person who caused the event about it, found from the account that acted', async () => {
      const u = await example();
      const { id } = await forColleagues(u);
      await h.project();
      await h.writeAudit(
        'ACCESS_REQUEST.GRANT_COMPLETED',
        'ACCESS_REQUEST',
        id,
        { requestId: id },
        { actorAppUserId: u.head.account.appUserId },
      );

      await h.project();

      expect(await h.codesFor(u.head.employeeId, id)).not.toContain('REQUEST_GRANTED');
    });

    it('tells the owner of a seat that a revocation is coming, unless they sent the return themselves, and tells a renewal and the verdict on a service account', async () => {
      const u = await example();
      const { id } = await forColleagues(u);
      const returnId = randomUUID();
      await h.project();
      const returnAfter = (holder: string) => ({
        returnRequestId: returnId,
        holderEmployeeId: holder,
        planId: plan,
        source: 'HEAD_CONFIRMATION',
        handoverRequired: false,
        handoverDueOn: null,
      });
      await h.writeAudit('RETURN_REQUEST.SUBMITTED', 'RETURN_REQUEST', returnId, returnAfter(u.member.employeeId), {
        actorAppUserId: u.head.account.appUserId,
      });
      await h.writeAudit(
        'RETURN_REQUEST.SUBMITTED',
        'RETURN_REQUEST',
        randomUUID(),
        { ...returnAfter(u.head.employeeId), returnRequestId: randomUUID() },
        {
          actorAppUserId: u.head.account.appUserId,
        },
      );
      await h.writeAudit('ACCESS_REQUEST.SERVICE_ACCOUNT_BOUNDARY_ACCEPTED', 'ACCESS_REQUEST', id, { requestId: id });
      await h.writeAudit('ACCESS_REQUEST.RENEWAL_APPLIED', 'ACCESS_REQUEST', id, {
        requestId: id,
        newExpectedEndDate: '2027-03-31',
      });
      await h.writeAudit('ACCESS_REQUEST.RENEWAL_NOT_APPLIED', 'ACCESS_REQUEST', id, {
        requestId: id,
        problem: 'NOT_OPEN',
      });

      await h.project();

      const warning = (await h.noticesOf(u.member.employeeId, 'RETURN_REQUESTED'))[0];
      expect(warning).toMatchObject({ subject_type: 'RETURN_REQUEST', subject_id: returnId });
      expect(warning.params).toEqual({
        returnRequestId: returnId,
        planId: plan,
        source: 'HEAD_CONFIRMATION',
        handoverRequired: false,
        handoverDueOn: null,
      });
      expect(await h.noticesOf(u.head.employeeId, 'RETURN_REQUESTED')).toEqual([]);
      expect(await h.codesFor(u.head.employeeId, id)).toEqual(
        expect.arrayContaining([
          'SERVICE_ACCOUNT_BOUNDARY_ACCEPTED',
          'REQUEST_RENEWAL_APPLIED',
          'REQUEST_RENEWAL_NOT_APPLIED',
        ]),
      );
    });
  });

  describe('what no notice ever carries (INF-06, FR-3.11)', () => {
    it('has no key that names a secret, an amount or a finding of the budget in any notice made by the specs of this suite', async () => {
      const { rows } = await h.ctx.sql.query<{ keys: string[]; text: string }>(
        `SELECT array(SELECT jsonb_object_keys(params)) AS keys, params::text AS text FROM in_app_notifications`,
      );

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        for (const key of row.keys) {
          expect(FORBIDDEN_PARAM_KEY.test(key)).toBe(false);
          expect(FIGURE_WORDS.test(key)).toBe(false);
        }
        expect(row.text).not.toMatch(/"(amount|budget|remaining|override|evidence|lastError|token|hash)/i);
      }
    });
  });
});
