import { PgRelay } from '../support/pg-relay';
import { ProvisioningHarness } from '../support/provisioning-harness';
import { QueryCounter, dataStatements } from '../support/query-count';

const h = new ProvisioningHarness();

const SUMMARY_KEYS = [
  'accountIdentifier',
  'assignmentId',
  'attempts',
  'availableDecisions',
  'beneficiary',
  'channel',
  'claimedAt',
  'claimedBy',
  'closedAt',
  'completedAt',
  'createdAt',
  'defaultResponsibleEmployeeId',
  'elapsedSeconds',
  'failedAt',
  'failureKind',
  'id',
  'inGeneralQueue',
  'kind',
  'maxAttempts',
  'nextRetryAt',
  'plan',
  'requestId',
  'revocation',
  'status',
  'subscriptionId',
];

/** LD-08 of the post-merge review: the task list is a summary read in a fixed number of statements; the detail has the rest. */
describe('provisioning task read contracts (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let made = 0;

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
  }, 120000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const makeTasks = async (count: number): Promise<string[]> => {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      made += 1;
      const subscription = await h.subscription(5, 'K2');
      const employee = await h.person(`LD8-${made}`);
      const task = await h.granted(employee, await h.planOf(subscription), {
        subscriptionId: subscription,
        accountIdentifier: `ld8-${made}@acme.vn`,
      });
      ids.push(task.id);
    }

    return ids;
  };
  const listAll = () => counter.run(() => h.list({ pageSize: 100 }).expect(200));
  /**
   * The elapsed time of an open task is measured at the moment of each read (`Date.now()` in the view), so two reads a
   * second boundary apart differ by one (P28-13). A read under test happens at a chosen instant, never at whatever the
   * wall clock says between two requests.
   */
  const readAt = async <T>(instant: number, read: () => Promise<T>): Promise<T> => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(instant);
    try {
      return await read();
    } finally {
      clock.mockRestore();
    }
  };

  it('answers the summary fields only in the list, and the rest in the detail', async () => {
    const [id] = await makeTasks(1);
    const instant = Date.now();

    const { result } = await readAt(instant, listAll);
    const items = h.dataOf<{ items: Record<string, unknown>[] }>(result).items;
    const detail = h.dataOf<{ task: Record<string, unknown> }>(
      await readAt(instant, () => h.getTask(id).expect(200)),
    ).task;

    expect(Object.keys(items[0]).sort()).toEqual(SUMMARY_KEYS);
    expect(Object.keys(detail)).toEqual(
      expect.arrayContaining([...SUMMARY_KEYS, 'steps', 'doneWhen', 'evidence', 'lastError']),
    );
    for (const key of SUMMARY_KEYS) expect(detail).toHaveProperty(key, items.find((item) => item.id === id)?.[key]);
  }, 120_000);

  it('measures the elapsed time of an open task at the moment of each read, so two reads apart differ by that time', async () => {
    const [id] = await makeTasks(1);
    const createdAt = Date.parse(
      h.dataOf<{ task: { createdAt: string } }>(await h.getTask(id).expect(200)).task.createdAt,
    );

    const listed = h
      .dataOf<{ items: Array<{ id: string; elapsedSeconds: number }> }>(
        (await readAt(createdAt + 10_000, listAll)).result,
      )
      .items.find((item) => item.id === id);
    const detail = h.dataOf<{ task: { elapsedSeconds: number } }>(
      await readAt(createdAt + 12_500, () => h.getTask(id).expect(200)),
    ).task;

    expect(listed?.elapsedSeconds).toBe(10);
    expect(detail.elapsedSeconds).toBe(12);
  }, 120_000);

  it('reads the long text columns of no task and takes the same number of statements for 3 tasks as for 12', async () => {
    await makeTasks(2);
    const few = await listAll();
    await makeTasks(9);
    const many = await listAll();

    expect(h.dataOf<{ items: unknown[] }>(many.result).items.length).toBeGreaterThanOrEqual(12);
    expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
    for (const statement of dataStatements(many.statements)) {
      expect(statement).not.toMatch(/"evidence"|"last_error"|"failure_reason"|"hand_off_evidence"|"close_reason"/);
    }
  }, 300_000);
});
