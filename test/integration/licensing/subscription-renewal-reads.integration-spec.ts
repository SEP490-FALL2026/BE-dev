import { PgRelay } from '../../support/pg-relay';
import { dataStatements, QueryCounter } from '../../support/query-count';
import { RenewalHarness } from '../../support/renewal-harness';

const h = new RenewalHarness();

interface Page {
  items: { id: string }[];
  pagination: { totalItems: number };
}

/**
 * The reads of the cases of a head on real PostgreSQL (`API-LIST-DETAIL.1`): the number of statements of a page and of a case does not
 * grow with the cases of the department they read. The cases are the ones the IT Admin records in one write (`SBF-20` §4.4); the head
 * only reads them (`QĐ-94d`(2)).
 */
describe('the reads of the cases of a department head (integration, real PostgreSQL)', () => {
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

  /** A year of the department at its point of adjustment, nobody uses it, and its cancellation as the IT Admin records it. */
  const cancelled = async (departmentId: string, deadlineInDays: number): Promise<string> => {
    const subscriptionId = await h.term({
      ownerDepartmentId: departmentId,
      quantity: 10,
      startDate: h.inDays(-300),
      endDate: h.inDays(64),
      noticeDeadline: h.inDays(deadlineInDays),
    });

    return (
      await h.recordedRenewal({
        subscriptionId,
        choice: 'CANCEL',
        outcome: 'AS_DECIDED',
        closure: { dataExported: true, adminsTransferred: true },
      })
    ).id;
  };

  it('reads a page and a case of a head with a number of statements that does not grow with the cases of their department', async () => {
    const unit = await h.unit(1);
    const firstId = await cancelled(unit.department.id, 20);
    const run = async () => ({
      list: await counter.run(() => h.renewals('?pageSize=100', unit.head.account).expect(200)),
      get: await counter.run(() => h.read(firstId, unit.head.account).expect(200)),
    });
    const few = await run();
    for (let index = 0; index < 4; index += 1) await cancelled(unit.department.id, 21 + index);
    const many = await run();

    const pageOf = (run: { result: { body: unknown } }) => (run.result.body as { data: Page }).data;
    expect(pageOf(few.list).items).toHaveLength(1);
    expect(pageOf(many.list).items).toHaveLength(5);
    for (const key of ['list', 'get'] as const) {
      expect(dataStatements(many[key].statements)).toHaveLength(dataStatements(few[key].statements).length);
    }
  }, 300000);
});
