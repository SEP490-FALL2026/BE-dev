import { RevocationListeners } from '../../../src/modules/licensing/public/licensing.extension-points';
import type { RevocationTaskFacts } from '../../../src/modules/licensing/public/licensing.types';
import {
  K1_CODES,
  k1Checklist,
  type K1ChecklistBody,
  type K1ChecklistCardWire,
  type K1Variant,
} from '../../support/k1-checklist';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();

/**
 * QĐ-111az, P25 (US-07-05 AC-19, m-09): a K1 revocation is completed with the checklist of its variant. The variant is the server's, from
 * why the seat is revoked: a person who leaves has six steps (the mailbox lock last), anyone else two. Over HTTP, on real PostgreSQL.
 */
describe('the checklist of a K1 revocation, over HTTP (integration, real PostgreSQL)', () => {
  let counter = 0;
  const code = () => `E-K1CL-${(counter += 1)}`;
  /** What the listeners of the end of a revocation were told when a K1 revocation was completed. */
  const told: RevocationTaskFacts[] = [];

  /** A K1 seat of a person, revoked for each of the sources in turn (one task, many reasons), and taken by the IT Admin. */
  const taken = async (...sources: string[]) => {
    const subscriptionId = await h.subscription(1, 'K1');
    const assignmentId = await h.seat({ subscriptionId }, code());
    let taskId = '';
    for (const source of sources) taskId = (await h.open(assignmentId, source)).taskId;
    await h.claim(taskId).expect(200);

    return { subscriptionId, assignmentId, taskId };
  };
  /** The completion of a K1 revocation whose access runs to the end of the paid period, with the given checklist (none: not sent). */
  const complete = (taskId: string, checklist: K1ChecklistBody | undefined, extra: object = {}) =>
    h.revoked(taskId, {
      completion: 'RENEWAL_CANCELLED',
      paidThroughOn: h.inDays(10),
      accessState: 'UNTIL_PAID_END',
      ...(checklist ? { k1Checklist: checklist } : {}),
      ...extra,
    });
  const storedOf = async (taskId: string) =>
    (
      await h.ctx.sql.query<{ k1_checklist: unknown }>(`SELECT k1_checklist FROM provisioning_tasks WHERE id = $1`, [
        taskId,
      ])
    ).rows[0].k1_checklist;
  /** The task and its seat are as they were: still being worked, nothing kept, the seat held. */
  const unchanged = async (assignmentId: string, taskId: string) => {
    expect(await h.revocationOf(taskId)).toMatchObject({ status: 'IN_PROGRESS', completedBy: null });
    expect(await storedOf(taskId)).toBeNull();
    expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: null });
  };
  /** The checklist of the variant with the instants of the given codes swapped. */
  const swapped = (variant: K1Variant, first: string, second: string): K1ChecklistBody => {
    const sent = k1Checklist(variant, 'đã hủy gia hạn');
    const timeOf = (target: string) => sent.items.find((item) => item.code === target)?.doneAt;

    return {
      ...sent,
      items: sent.items.map((item) =>
        item.code === first
          ? { ...item, doneAt: timeOf(second) }
          : item.code === second
            ? { ...item, doneAt: timeOf(first) }
            : item,
      ),
    };
  };

  beforeAll(async () => {
    await h.start();
    h.ctx.app.get(RevocationListeners).add('test.k1-checklist-hook', (_tx, event) => {
      if (event.moment === 'AFTER_WORK' && event.task.completed?.provisioningType === 'K1') told.push(event.task);

      return Promise.resolve();
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the card tells which checklist to tick', () => {
    it.each<[string, K1Variant]>([
      ['DEPARTURE', 'DEPARTURE'],
      ['ABRUPT_DEPARTURE', 'DEPARTURE'],
      ['RETURN', 'STILL_EMPLOYED'],
      ['MANAGER_NOT_NEEDED', 'STILL_EMPLOYED'],
      ['GHOST_SEAT', 'STILL_EMPLOYED'],
      ['TIME_LIMITED_EXPIRY', 'STILL_EMPLOYED'],
    ])(
      'a seat revoked for %s has the %s checklist, nothing ticked, whether it is taken or not',
      async (source, variant) => {
        const subscriptionId = await h.subscription(1, 'K1');
        const { taskId } = await h.open(await h.seat({ subscriptionId }, code()), source);
        const card = (await h.revocationOf(taskId)).k1Checklist;

        expect(card?.variant).toBe(variant);
        expect(card?.items.map((item) => [item.order, item.code, item.doneAt])).toEqual(
          K1_CODES[variant].map((step, index) => [index + 1, step, null]),
        );
        expect(card?.items.every((item) => item.label.length > 0)).toBe(true);

        await h.claim(taskId).expect(200);
        expect((await h.revocationOf(taskId)).k1Checklist?.variant).toBe(variant);
      },
    );

    it('is on the detail only: a row of the list has none, and a revocation of another kind has none at all', async () => {
      const { taskId } = await taken('DEPARTURE');
      const other = await h.open(await h.seat({ subscriptionId: await h.subscription(2, 'K2') }, code()), 'DEPARTURE');

      const listed = h.dataOf<{ items: object[] }>(await h.list({ pageSize: 100 }).expect(200)).items;

      expect(listed.length).toBeGreaterThan(0);
      expect(listed.every((item) => !('k1Checklist' in item))).toBe(true);
      expect((await h.revocationOf(other.taskId)).k1Checklist).toBeNull();
      expect((await h.revocationOf(taskId)).k1Checklist).not.toBeNull();
    });

    it('follows the reasons that stand: a departure added to a return makes it DEPARTURE, and taken back it is STILL_EMPLOYED again', async () => {
      const { assignmentId, taskId } = await taken('RETURN');
      expect((await h.revocationOf(taskId)).k1Checklist?.variant).toBe('STILL_EMPLOYED');

      await h.open(assignmentId, 'DEPARTURE');
      expect((await h.revocationOf(taskId)).k1Checklist?.variant).toBe('DEPARTURE');
      expect(h.codeOf(await complete(taskId, k1Checklist('STILL_EMPLOYED', 'x')).expect(422))).toBe(
        'REVOCATION.K1_CHECKLIST_INCOMPLETE',
      );

      await h.withdraw(assignmentId, 'DEPARTURE', null);
      expect((await h.revocationOf(taskId)).k1Checklist?.variant).toBe('STILL_EMPLOYED');
    });
  });

  describe('a person who leaves: six steps, in order, the mailbox lock last', () => {
    it('is completed with every step ticked in order and the evidence; the card then shows when each was ticked, and the listeners read the mailbox lock', async () => {
      const { assignmentId, taskId } = await taken('ABRUPT_DEPARTURE');
      const sent = k1Checklist('DEPARTURE', ' đã khóa hộp thư, ticket IT-9 ');
      told.length = 0;

      const done = await complete(taskId, sent).expect(200);

      const card = h.dataOf<{ task: { k1Checklist: K1ChecklistCardWire; evidence: string; status: string } }>(
        done,
      ).task;
      expect(card).toMatchObject({ status: 'COMPLETED', evidence: 'đã khóa hộp thư, ticket IT-9' });
      expect(card.k1Checklist.variant).toBe('DEPARTURE');
      expect(card.k1Checklist.items.map(({ code: step, order, doneAt }) => ({ code: step, order, doneAt }))).toEqual(
        K1_CODES.DEPARTURE.map((step, index) => ({ code: step, order: index + 1, doneAt: sent.items[index].doneAt })),
      );
      expect(await storedOf(taskId)).toEqual({
        variant: 'DEPARTURE',
        items: K1_CODES.DEPARTURE.map((step, index) => ({
          code: step,
          order: index + 1,
          doneAt: sent.items[index].doneAt,
        })),
      });
      expect((await h.revocationOf(taskId)).k1Checklist?.items.map((item) => item.doneAt)).toEqual(
        sent.items.map((item) => item.doneAt),
      );
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: h.inDays(10) });
      expect(told).toHaveLength(1);
      expect(told[0].completed?.k1Checklist).toEqual({ variant: 'DEPARTURE', doneCodes: [...K1_CODES.DEPARTURE] });
    });

    it.each<[string, (sent: K1ChecklistBody) => K1ChecklistBody | undefined]>([
      ['no checklist at all', () => undefined],
      [
        'a missing step',
        (sent) => ({ ...sent, items: sent.items.filter((item) => item.code !== 'SESSIONS_SIGNED_OUT') }),
      ],
      [
        'a step that is not done',
        (sent) => ({
          ...sent,
          items: sent.items.map((item) => (item.code === 'MAILBOX_LOCKED' ? { ...item, done: false } : item)),
        }),
      ],
      [
        'a step ticked with no time',
        (sent) => ({
          ...sent,
          items: sent.items.map((item) => (item.code === 'MAILBOX_LOCKED' ? { code: item.code, done: true } : item)),
        }),
      ],
      ['no evidence', (sent) => ({ items: sent.items })],
      ['blank evidence', (sent) => ({ ...sent, evidence: '   ' })],
    ])('refuses %s: K1_CHECKLIST_INCOMPLETE, and nothing changes', async (_label, mutate) => {
      const { assignmentId, taskId } = await taken('DEPARTURE');
      const sent = mutate(k1Checklist('DEPARTURE', 'đã khóa'));

      expect(h.codeOf(await complete(taskId, sent).expect(422))).toBe('REVOCATION.K1_CHECKLIST_INCOMPLETE');
      await unchanged(assignmentId, taskId);
    });

    it('refuses the mailbox lock (6) ticked before the sign-out of the sessions (3): K1_CHECKLIST_OUT_OF_ORDER, and nothing changes', async () => {
      const { assignmentId, taskId } = await taken('DEPARTURE');

      expect(
        h.codeOf(await complete(taskId, swapped('DEPARTURE', 'SESSIONS_SIGNED_OUT', 'MAILBOX_LOCKED')).expect(422)),
      ).toBe('REVOCATION.K1_CHECKLIST_OUT_OF_ORDER');
      await unchanged(assignmentId, taskId);
      // The same steps in their order are taken at once: the refusal changed nothing.
      await complete(taskId, k1Checklist('DEPARTURE', 'đã khóa')).expect(200);
    });

    it('refuses a checklist whose steps are of the other variant: a departure that sends only the renewal and the evidence is incomplete', async () => {
      const { assignmentId, taskId } = await taken('DEPARTURE');

      expect(h.codeOf(await complete(taskId, k1Checklist('STILL_EMPLOYED', 'đã hủy')).expect(422))).toBe(
        'REVOCATION.K1_CHECKLIST_INCOMPLETE',
      );
      await unchanged(assignmentId, taskId);
    });
  });

  describe('a person who still works: the renewal and the evidence, no mailbox', () => {
    it('is completed with the two steps; the card shows them ticked and the listeners read no mailbox lock', async () => {
      const { taskId } = await taken('MANAGER_NOT_NEEDED');
      const sent = k1Checklist('STILL_EMPLOYED', 'đã tắt gia hạn');
      told.length = 0;

      await complete(taskId, sent).expect(200);

      expect(await storedOf(taskId)).toMatchObject({ variant: 'STILL_EMPLOYED' });
      expect((await h.revocationOf(taskId)).k1Checklist?.items.map((item) => [item.code, item.doneAt])).toEqual(
        sent.items.map((item) => [item.code, item.doneAt]),
      );
      expect(told[0].completed?.k1Checklist).toEqual({
        variant: 'STILL_EMPLOYED',
        doneCodes: ['RENEWAL_DISABLED', 'EVIDENCE_RECORDED'],
      });
    });

    it.each(['MAILBOX_LOCKED', 'MAILBOX_PASSWORD_RESET'] as const)(
      'refuses the step %s, which a person who still works does not have: COMPLETION_NOT_ALLOWED',
      async (step) => {
        const { assignmentId, taskId } = await taken('RETURN');
        const sent = k1Checklist('STILL_EMPLOYED', 'đã hủy');
        const extra = { code: step, done: true, doneAt: new Date(Date.now() - 1000).toISOString() };

        expect(h.codeOf(await complete(taskId, { ...sent, items: [...sent.items, extra] }).expect(422))).toBe(
          'REVOCATION.COMPLETION_NOT_ALLOWED',
        );
        await unchanged(assignmentId, taskId);
      },
    );

    it('refuses the renewal ticked after the evidence, and a step sent twice', async () => {
      const { assignmentId, taskId } = await taken('TIME_LIMITED_EXPIRY');

      expect(
        h.codeOf(
          await complete(taskId, swapped('STILL_EMPLOYED', 'RENEWAL_DISABLED', 'EVIDENCE_RECORDED')).expect(422),
        ),
      ).toBe('REVOCATION.K1_CHECKLIST_OUT_OF_ORDER');
      const sent = k1Checklist('STILL_EMPLOYED', 'đã hủy');
      expect(h.codeOf(await complete(taskId, { ...sent, items: [...sent.items, sent.items[0]] }).expect(422))).toBe(
        'REVOCATION.COMPLETION_NOT_ALLOWED',
      );
      await unchanged(assignmentId, taskId);
    });
  });

  describe('the evidence, and the other ways of completing', () => {
    it("takes the evidence written beside the checklist when the checklist has none, and the checklist's own when both are written", async () => {
      const beside = await taken('RETURN');
      const both = await taken('RETURN');

      await complete(beside.taskId, k1Checklist('STILL_EMPLOYED'), { evidence: '  ghi cạnh  ' }).expect(200);
      await complete(both.taskId, k1Checklist('STILL_EMPLOYED', 'trong checklist'), { evidence: 'ghi cạnh' }).expect(
        200,
      );

      expect((await h.revocationOf(beside.taskId)).evidence).toBe('ghi cạnh');
      expect((await h.revocationOf(both.taskId)).evidence).toBe('trong checklist');
    });

    it('tells a way that does not fit the kind before the checklist, and refuses a checklist for a kind that has none', async () => {
      const k1 = await taken('RETURN');
      const k2 = await h.seat({ subscriptionId: await h.subscription(2, 'K2') }, code());
      const k2Task = (await h.open(k2, 'MANAGER_NOT_NEEDED')).taskId;
      await h.claim(k2Task).expect(200);

      expect(h.codeOf(await h.revoked(k1.taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(422))).toBe(
        'REVOCATION.COMPLETION_NOT_ALLOWED',
      );
      expect(
        h.codeOf(
          await h
            .revoked(k2Task, {
              completion: 'ACCOUNT_REMOVED',
              evidence: 'x',
              k1Checklist: k1Checklist('STILL_EMPLOYED', 'x'),
            })
            .expect(422),
        ),
      ).toBe('REVOCATION.COMPLETION_NOT_ALLOWED');
      expect(await storedOf(k2Task)).toBeNull();
      await h.revoked(k2Task, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(200);
      expect(await storedOf(k2Task)).toBeNull();
      expect((await h.revocationOf(k2Task)).k1Checklist).toBeNull();
    });

    it('shows none for a K1 revocation completed before the checklist existed, and for one that was cancelled', async () => {
      const old = await taken('RETURN');
      await h.ctx.sql.query(
        `UPDATE provisioning_tasks SET status = 'COMPLETED', completed_by_app_user_id = $2, completed_at = now(), evidence = 'cũ',
           completion = 'RENEWAL_CANCELLED', paid_through_on = $3, access_state = 'UNTIL_PAID_END' WHERE id = $1`,
        [old.taskId, h.it1.appUserId, h.inDays(10)],
      );
      // Opened and not taken, then its only reason is taken back: the task is cancelled.
      const assignmentId = await h.seat({ subscriptionId: await h.subscription(1, 'K1') }, code());
      const withdrawn = await h.open(assignmentId, 'RETURN');
      await h.withdraw(assignmentId, 'RETURN', null);

      expect((await h.revocationOf(old.taskId)).k1Checklist).toBeNull();
      expect((await h.revocationOf(withdrawn.taskId)).status).toBe('CANCELLED');
      expect((await h.revocationOf(withdrawn.taskId)).k1Checklist).toBeNull();
    });
  });

  describe('a person with two K1 seats: the mailbox is locked by the last revocation only (R-1, S17, P28)', () => {
    const FIVE = K1_CODES.DEPARTURE.slice(0, 5);
    /** The K1 seats of one person on separate subscriptions, each with a revocation for the source, taken by the IT Admin unless said. */
    const seatsOf = async (count: number, source = 'DEPARTURE', claim = true) => {
      const person = code();
      const seats: { assignmentId: string; taskId: string }[] = [];
      for (let index = 0; index < count; index += 1) {
        const assignmentId = await h.seat({ subscriptionId: await h.subscription(1, 'K1') }, person);
        const { taskId } = await h.open(assignmentId, source);
        if (claim) await h.claim(taskId).expect(200);
        seats.push({ assignmentId, taskId });
      }

      return { person, seats };
    };
    const stepsOf = async (taskId: string) =>
      (await h.revocationOf(taskId)).k1Checklist?.items.map((item) => item.code);
    const withoutLock = (evidence = 'đã tắt gia hạn') => k1Checklist('DEPARTURE', evidence, { withLock: false });
    const toldOf = (taskId: string) => told.filter((task) => task.id === taskId);

    it('shows five steps on both cards while both are to do; the first is completed without the lock, and the second then shows six', async () => {
      const { seats } = await seatsOf(2);
      const [first, second] = seats;
      expect(await stepsOf(first.taskId)).toEqual(FIVE);
      expect(await stepsOf(second.taskId)).toEqual(FIVE);
      told.length = 0;

      await complete(first.taskId, withoutLock()).expect(200);

      expect(await stepsOf(first.taskId)).toEqual(FIVE);
      expect(toldOf(first.taskId)[0].completed?.k1Checklist).toEqual({ variant: 'DEPARTURE', doneCodes: FIVE });
      expect(await stepsOf(second.taskId)).toEqual(K1_CODES.DEPARTURE);

      await complete(second.taskId, k1Checklist('DEPARTURE', 'đã khóa hộp thư')).expect(200);

      expect(toldOf(second.taskId)[0].completed?.k1Checklist).toEqual({
        variant: 'DEPARTURE',
        doneCodes: [...K1_CODES.DEPARTURE],
      });
    });

    it('refuses the lock on the first and the five steps on the last', async () => {
      const { seats } = await seatsOf(2);
      const [first, second] = seats;

      expect(h.codeOf(await complete(first.taskId, k1Checklist('DEPARTURE', 'đã khóa')).expect(422))).toBe(
        'REVOCATION.COMPLETION_NOT_ALLOWED',
      );
      await unchanged(first.assignmentId, first.taskId);
      await complete(first.taskId, withoutLock()).expect(200);
      expect(h.codeOf(await complete(second.taskId, withoutLock()).expect(422))).toBe(
        'REVOCATION.K1_CHECKLIST_INCOMPLETE',
      );
      await unchanged(second.assignmentId, second.taskId);
    });

    it('lets exactly one of two completions made at once take the lock: the one that comes second is the last and is asked for it', async () => {
      const { seats } = await seatsOf(2);
      const [first, second] = seats;

      const answers = await Promise.all([
        complete(first.taskId, withoutLock()),
        complete(second.taskId, withoutLock()),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([200, 422]);
      const firstWon = answers[0].status === 200;
      const left = firstWon ? second : first;
      expect(h.codeOf(answers[firstWon ? 1 : 0])).toBe('REVOCATION.K1_CHECKLIST_INCOMPLETE');
      expect(await stepsOf(left.taskId)).toEqual(K1_CODES.DEPARTURE);
      await complete(left.taskId, k1Checklist('DEPARTURE', 'đã khóa hộp thư')).expect(200);
      const locks = await h.ctx.sql.query<{ count: string }>(
        `SELECT count(*) FROM provisioning_tasks WHERE id = ANY($1) AND k1_checklist::text LIKE '%MAILBOX_LOCKED%'`,
        [[first.taskId, second.taskId]],
      );
      expect(Number(locks.rows[0].count)).toBe(1);
    });

    it('asks the lock of a task whose other revocation was cancelled or closed as failed, and not while it is failed or still queued', async () => {
      const cancelled = await seatsOf(1);
      const cancelledOther = await h.seat({ subscriptionId: await h.subscription(1, 'K1') }, cancelled.person);
      await h.open(cancelledOther, 'RETURN');
      expect(await stepsOf(cancelled.seats[0].taskId)).toEqual(FIVE);
      await h.withdraw(cancelledOther, 'RETURN', null);
      expect(await stepsOf(cancelled.seats[0].taskId)).toEqual(K1_CODES.DEPARTURE);

      const failed = await seatsOf(2);
      await h.fail(failed.seats[1].taskId, { reason: 'nhà cung cấp từ chối' }).expect(200);
      expect(await stepsOf(failed.seats[0].taskId)).toEqual(FIVE);
      await h.closeFailed(failed.seats[1].taskId, { reason: 'đóng' }).expect(200);
      expect(await stepsOf(failed.seats[0].taskId)).toEqual(K1_CODES.DEPARTURE);

      const queued = await seatsOf(2, 'DEPARTURE', false);
      await h.claim(queued.seats[0].taskId).expect(200);
      expect(await stepsOf(queued.seats[0].taskId)).toEqual(FIVE);
    });

    it('does not count the revocations of another person or of another kind of grant', async () => {
      const { person, seats } = await seatsOf(1);
      const k2 = await h.seat({ subscriptionId: await h.subscription(2, 'K2') }, person);
      await h.open(k2, 'DEPARTURE');
      await seatsOf(1);

      expect(await stepsOf(seats[0].taskId)).toEqual(K1_CODES.DEPARTURE);
      await complete(seats[0].taskId, k1Checklist('DEPARTURE', 'đã khóa hộp thư')).expect(200);
    });

    it('does not ask the lock of a person who still works, with one seat or two: two steps each', async () => {
      const { seats } = await seatsOf(2, 'RETURN');

      expect(await stepsOf(seats[0].taskId)).toEqual(K1_CODES.STILL_EMPLOYED);
      await complete(seats[0].taskId, k1Checklist('STILL_EMPLOYED', 'đã hủy')).expect(200);
      expect(await stepsOf(seats[1].taskId)).toEqual(K1_CODES.STILL_EMPLOYED);
      await complete(seats[1].taskId, k1Checklist('STILL_EMPLOYED', 'đã hủy')).expect(200);
    });
  });
});
