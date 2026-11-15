import { K1_CODES, k1Checklist, type K1ChecklistBody, type K1ChecklistCardWire } from '../../support/k1-checklist';
import { ProvisioningHarness, type TaskWire } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

/** A task as the wire has it, with the checklist of a K1 task (the card of a detail, never a row of the list). */
type CardWire = TaskWire & { k1Checklist?: K1ChecklistCardWire | null };

/**
 * QĐ-111az, R-19 (US-07-01 AC-7): the grant of a K1 seat is completed with its checklist, the two steps of the variant GRANT ticked in order, and
 * the evidence. The card tells the steps; a task of another kind of provisioning has none. Over HTTP, on real PostgreSQL.
 */
describe('the checklist of the grant of a K1 seat, over HTTP (integration, real PostgreSQL)', () => {
  let designer: string;
  let owner: string;
  let counter = 0;

  /** A K1 grant made for a new person of the department of the IT Admin, taken by the IT Admin who pressed it (in progress). */
  const k1Grant = async (): Promise<CardWire> => {
    const person = await h.member('P-K1GR', `E-K1GR-${(counter += 1)}`, designer);
    const subscriptionId = await h.subscription(5, 'K1');

    return h.granted(person, await h.planOf(subscriptionId), { subscriptionId });
  };
  const k2Grant = async (): Promise<CardWire> => {
    const person = await h.member('P-K1GR', `E-K2GR-${(counter += 1)}`, designer);
    const subscriptionId = await h.subscription(5, 'K2');

    return h.granted(person, await h.planOf(subscriptionId), { subscriptionId });
  };
  const cardOf = async (id: string): Promise<CardWire> =>
    h.dataOf<{ task: CardWire }>(await h.getTask(id).expect(200)).task;
  /** What the column of the task keeps of the checklist. */
  const storedOf = async (taskId: string) =>
    (
      await h.ctx.sql.query<{ k1_checklist: unknown; evidence: string | null; status: string }>(
        `SELECT k1_checklist, evidence, status FROM provisioning_tasks WHERE id = $1`,
        [taskId],
      )
    ).rows[0];
  /** The `details` of a refusal: the variant the server worked out and the steps it expects, in order. */
  const detailsOf = (response: { body: unknown }) =>
    (response.body as { error: { details?: { variant: string; codes: string[] } } }).error.details;
  const complete = (task: CardWire, body: object) => h.complete(task.id, body);
  /** The two steps in order with the instants swapped. */
  const swapped = (): K1ChecklistBody => {
    const sent = k1Checklist('GRANT', 'đã đăng ký gói tháng');

    return {
      ...sent,
      items: [
        { ...sent.items[0], doneAt: sent.items[1].doneAt },
        { ...sent.items[1], doneAt: sent.items[0].doneAt },
      ],
    };
  };

  beforeAll(async () => {
    await h.start();
    designer = await h.jobTitle('Designer');
    owner = await h.person('E-K1GR-A');
    await h.account('E-K1GR-A', owner, 'IT_ADMIN');
    await h.department('P-K1GR', owner);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the card tells which steps to tick', () => {
    it('a K1 grant has the checklist GRANT with both steps, nothing ticked, from the moment the IT Admin presses "Grant"', async () => {
      const task = await k1Grant();

      expect(task.k1Checklist?.variant).toBe('GRANT');
      expect(task.k1Checklist?.items.map((item) => [item.order, item.code, item.doneAt])).toEqual(
        K1_CODES.GRANT.map((code, index) => [index + 1, code, null]),
      );
      expect(task.k1Checklist?.items.every((item) => item.label.length > 0)).toBe(true);
      expect((await cardOf(task.id)).k1Checklist).toEqual(task.k1Checklist);
    });

    it('is on the detail only: a row of the list has none', async () => {
      const task = await k1Grant();

      const rows = h.dataOf<{ items: (CardWire & { id: string })[] }>(
        await h.list({ pageSize: 100 }).expect(200),
      ).items;
      const row = rows.find((item) => item.id === task.id);

      expect(row).toBeDefined();
      expect(row).not.toHaveProperty('k1Checklist');
    });

    it('a grant of another kind has none: K2 and K5', async () => {
      const k2 = await k2Grant();
      const person = await h.member('P-K1GR', `E-K5GR-${(counter += 1)}`, designer);
      const k5 = await h.granted(person, await h.plan('K5'));

      expect((await cardOf(k2.id)).k1Checklist).toBeNull();
      expect((await cardOf(k5.id)).k1Checklist).toBeNull();
    });
  });

  describe('a K1 grant is not completed without its checklist (PROVISIONING.K1_CHECKLIST_INCOMPLETE)', () => {
    it('evidence only, as before the checklist: refused, telling the variant and the steps', async () => {
      const task = await k1Grant();

      const refused = await complete(task, { evidence: 'đã đăng ký' }).expect(422);

      expect(h.codeOf(refused)).toBe('PROVISIONING.K1_CHECKLIST_INCOMPLETE');
      expect(detailsOf(refused)).toEqual({ variant: 'GRANT', codes: [...K1_CODES.GRANT] });
      expect(await storedOf(task.id)).toMatchObject({ k1_checklist: null, evidence: null, status: 'IN_PROGRESS' });
    });

    it.each<[string, (sent: K1ChecklistBody) => void]>([
      ['only the first step', (sent) => sent.items.pop()],
      ['only the second step', (sent) => sent.items.shift()],
      ['a step with done false', (sent) => (sent.items[1].done = false)],
      ['a step ticked with no time', (sent) => delete sent.items[0].doneAt],
    ])('%s: refused, nothing kept', async (_label, change) => {
      const task = await k1Grant();
      const sent = k1Checklist('GRANT', 'đã đăng ký gói tháng');
      change(sent);

      const refused = await complete(task, { k1Checklist: sent }).expect(422);

      expect(h.codeOf(refused)).toBe('PROVISIONING.K1_CHECKLIST_INCOMPLETE');
      expect(await storedOf(task.id)).toMatchObject({ k1_checklist: null, evidence: null, status: 'IN_PROGRESS' });
    });

    it('both steps ticked and no evidence, in the checklist or beside it: refused', async () => {
      const task = await k1Grant();

      const refused = await complete(task, { k1Checklist: k1Checklist('GRANT') }).expect(422);

      expect(h.codeOf(refused)).toBe('PROVISIONING.K1_CHECKLIST_INCOMPLETE');
      expect(detailsOf(refused)?.variant).toBe('GRANT');
      expect(await storedOf(task.id)).toMatchObject({ k1_checklist: null, status: 'IN_PROGRESS' });
    });

    it('no checklist and no evidence is the answer it always was: PROVISIONING_TASK.EVIDENCE_REQUIRED', async () => {
      const task = await k1Grant();

      expect(h.codeOf(await complete(task, {}).expect(422))).toBe('PROVISIONING_TASK.EVIDENCE_REQUIRED');
    });
  });

  describe('the steps keep their order and their names', () => {
    it('the second step timed before the first: PROVISIONING.K1_CHECKLIST_OUT_OF_ORDER, telling the steps', async () => {
      const task = await k1Grant();

      const refused = await complete(task, { k1Checklist: swapped() }).expect(422);

      expect(h.codeOf(refused)).toBe('PROVISIONING.K1_CHECKLIST_OUT_OF_ORDER');
      expect(detailsOf(refused)).toEqual({ variant: 'GRANT', codes: [...K1_CODES.GRANT] });
      expect(await storedOf(task.id)).toMatchObject({ k1_checklist: null, status: 'IN_PROGRESS' });
    });

    it('a step of a revocation, or a step sent twice: PROVISIONING.K1_CHECKLIST_NOT_ALLOWED', async () => {
      const task = await k1Grant();
      const foreign = k1Checklist('GRANT', 'ok');
      foreign.items.push({ code: 'MAILBOX_LOCKED', done: true, doneAt: foreign.items[1].doneAt });
      const twice = k1Checklist('GRANT', 'ok');
      twice.items.push({ ...twice.items[0] });

      for (const sent of [foreign, twice]) {
        const refused = await complete(task, { k1Checklist: sent }).expect(422);

        expect(h.codeOf(refused)).toBe('PROVISIONING.K1_CHECKLIST_NOT_ALLOWED');
        expect(detailsOf(refused)).toEqual({ variant: 'GRANT', codes: [...K1_CODES.GRANT] });
      }
      expect(await storedOf(task.id)).toMatchObject({ k1_checklist: null, status: 'IN_PROGRESS' });
    });

    it('a step the server does not know is a validation error, and so is a variant sent by the client', async () => {
      const task = await k1Grant();
      const sent = k1Checklist('GRANT', 'ok');

      const unknown = await complete(task, {
        k1Checklist: { ...sent, items: [{ code: 'COFFEE', done: true, doneAt: sent.items[0].doneAt }] },
      }).expect(422);
      const chosen = await complete(task, { k1Checklist: { ...sent, variant: 'GRANT' } }).expect(422);

      expect(h.codeOf(unknown)).toBe('VALIDATION_ERROR');
      expect(h.codeOf(chosen)).toBe('VALIDATION_ERROR');
    });
  });

  describe('a K1 grant is completed with both steps in order and the evidence', () => {
    it('keeps the steps with the task, completes it, tells the request, and shows what was ticked on the card', async () => {
      const task = await k1Grant();
      const sent = k1Checklist('GRANT', 'đã đăng ký gói tháng trên email công ty');

      const completed = h.dataOf<{ task: CardWire }>(await complete(task, { k1Checklist: sent }).expect(200)).task;

      expect(completed).toMatchObject({
        status: 'COMPLETED',
        completedBy: h.it1.appUserId,
        evidence: 'đã đăng ký gói tháng trên email công ty',
      });
      expect(completed.k1Checklist?.variant).toBe('GRANT');
      expect(completed.k1Checklist?.items.map((item) => [item.order, item.code, item.doneAt])).toEqual(
        sent.items.map((item, index) => [index + 1, item.code, new Date(item.doneAt ?? '').toISOString()]),
      );
      expect(await storedOf(task.id)).toMatchObject({
        status: 'COMPLETED',
        evidence: 'đã đăng ký gói tháng trên email công ty',
        k1_checklist: {
          variant: 'GRANT',
          items: [
            { code: 'COMPANY_EMAIL_REGISTERED', order: 1 },
            { code: 'NO_PERSONAL_DEVICE_MFA', order: 2 },
          ],
        },
      });
      expect((await cardOf(task.id)).k1Checklist).toEqual(completed.k1Checklist);
      expect(h.gate.outcomes).toContainEqual({ requestId: task.requestId, outcome: 'COMPLETED' });
    });

    it('takes the evidence written beside the checklist, and the one in the checklist when both are sent', async () => {
      const beside = await k1Grant();
      const both = await k1Grant();

      await complete(beside, { evidence: 'ghi chú ngoài', k1Checklist: k1Checklist('GRANT') }).expect(200);
      await complete(both, { evidence: 'ghi chú ngoài', k1Checklist: k1Checklist('GRANT', 'ghi chú trong') }).expect(
        200,
      );

      expect((await storedOf(beside.id)).evidence).toBe('ghi chú ngoài');
      expect((await storedOf(both.id)).evidence).toBe('ghi chú trong');
    });

    it('is final: a second completion is refused as before, and the card keeps what was ticked', async () => {
      const task = await k1Grant();
      const done = h.dataOf<{ task: CardWire }>(
        await complete(task, { k1Checklist: k1Checklist('GRANT', 'xong') }).expect(200),
      ).task;

      const again = await complete(task, { k1Checklist: k1Checklist('GRANT', 'xong lần hai') }).expect(409);

      expect(h.codeOf(again)).toBe('PROVISIONING_TASK.NOT_IN_PROGRESS');
      expect((await cardOf(task.id)).k1Checklist).toEqual(done.k1Checklist);
    });

    it('does not refuse a step ticked before the task was made or ahead of the clock: only the order counts', async () => {
      const task = await k1Grant();
      const sent = k1Checklist('GRANT', 'xong', { startAt: Date.now() - 24 * 3600 * 1000 });

      await complete(task, { k1Checklist: sent }).expect(200);

      expect((await storedOf(task.id)).status).toBe('COMPLETED');
    });
  });

  describe('a grant of another kind takes no checklist', () => {
    it('K2: a checklist is refused with PROVISIONING.K1_CHECKLIST_NOT_ALLOWED and nothing is told of steps; evidence alone completes it as before', async () => {
      const refused = await k2Grant();
      const plain = await k2Grant();

      const answer = await complete(refused, { evidence: 'ok', k1Checklist: k1Checklist('GRANT') }).expect(422);
      await complete(plain, { evidence: 'ok' }).expect(200);

      expect(h.codeOf(answer)).toBe('PROVISIONING.K1_CHECKLIST_NOT_ALLOWED');
      expect(detailsOf(answer)).toBeUndefined();
      expect(await storedOf(refused.id)).toMatchObject({ k1_checklist: null, status: 'IN_PROGRESS' });
      expect(await storedOf(plain.id)).toMatchObject({ k1_checklist: null, status: 'COMPLETED' });
    });

    it('K5: the same', async () => {
      const person = await h.member('P-K1GR', `E-K5GR-${(counter += 1)}`, designer);
      const task = await h.granted(person, await h.plan('K5'));

      const answer = await complete(task, { evidence: 'ok', k1Checklist: k1Checklist('GRANT') }).expect(422);

      expect(h.codeOf(answer)).toBe('PROVISIONING.K1_CHECKLIST_NOT_ALLOWED');
      await complete(task, { evidence: 'ok' }).expect(200);
    });
  });

  it('no field of the completion can carry a password or any secret: the body names steps, instants and a note, never a credential', async () => {
    const task = await k1Grant();

    const refused = await complete(task, {
      evidence: 'ok',
      k1Checklist: { ...k1Checklist('GRANT'), password: 'secret' },
    }).expect(422);

    expect(h.codeOf(refused)).toBe('VALIDATION_ERROR');
  });
});
