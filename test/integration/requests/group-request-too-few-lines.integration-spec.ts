import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();

/**
 * A group request is for at least two different people (`QĐ-97`, Đợt 1 step 6): one person is a request of their own, so the check says
 * so, the submit refuses it with `GROUP_REQUEST.TOO_FEW_LINES { min: 2 }`, and nothing is written when it does (review R5).
 */
describe('a request for a group with fewer than two people (integration, real PostgreSQL)', () => {
  let counter = 0;
  let plan: string;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-TF${counter}`);
    await h.roomFor(made);

    return made;
  };
  const written = async () => ({
    requests: await h.count('access_requests'),
    lines: await h.count('access_request_lines'),
    commitments: await h.count('budget_commitments'),
  });

  it('refuses one person on the submit, with the minimum, and writes nothing', async () => {
    const u = await unit();
    const [one] = await h.colleagues(u, 1);
    const before = await written();

    const refused = await h.submitGroup(h.groupBody(plan, [one]), u.head.account).expect(422);

    expect(h.codeOf(refused)).toBe('GROUP_REQUEST.TOO_FEW_LINES');
    expect(h.detailsOf(refused)).toEqual({ min: 2 });
    expect(await written()).toEqual(before);
  });

  it('counts the same person named twice as one, and writes nothing', async () => {
    const u = await unit();
    const [one] = await h.colleagues(u, 1);
    const before = await written();

    const refused = await h.submitGroup(h.groupBody(plan, [one, one]), u.head.account);

    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(await written()).toEqual(before);
  });

  it('says so in the check, and sends two different people', async () => {
    const u = await unit();
    const [first, second] = await h.colleagues(u, 2);

    const checked = h.dataOf<{ tooFewLines: { min: number } | null }>(
      await h.checkGroup(h.groupBody(plan, [first]), u.head.account).expect(200),
    );
    const enough = h.dataOf<{ tooFewLines: { min: number } | null }>(
      await h.checkGroup(h.groupBody(plan, [first, second]), u.head.account).expect(200),
    );
    await h.submitGroup(h.groupBody(plan, [first, second]), u.head.account).expect(201);

    expect(checked.tooFewLines).toEqual({ min: 2 });
    expect(enough.tooFewLines).toBeNull();
  });
});
