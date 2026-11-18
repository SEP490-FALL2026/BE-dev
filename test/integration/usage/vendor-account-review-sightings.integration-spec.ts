import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { VendorAccountIntakeService } from '../../../src/modules/usage/vendor-account-review/vendor-account-intake.service';
import type { ApiAccount } from '../../support/api-accounts';
import { InvoiceHarness } from '../../support/invoice-harness';

const h = new InvoiceHarness();

interface Difference {
  id: string;
  source: string;
  state: string;
  application: { id: string; name: string } | null;
  employeeId: string | null;
  identity: string | null;
  internalValue: string;
  vendorValue: string;
  evidenceOn: string;
  decision: string | null;
  reopenedFromId: string | null;
}
interface Page<T> {
  items: T[];
}

/**
 * What the collector reports of a tool that is not on the allowlist, and what happens when a thing that was decided is seen again (`RC-2.3`, `B3C-04`,
 * `QĐ-106j`, `US-13-03` AC-13, `US-13-05` AC-26). On real PostgreSQL, through the routes.
 */
describe('the sightings of the collector in the review of the accounts at the vendors over PostgreSQL (integration; RC-2.3, B3C-04)', () => {
  let itAdmin: ApiAccount;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    itAdmin = h.it1;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const differences = (method: 'get' | 'post', path: string, account: ApiAccount = itAdmin) =>
    request(h.server())[method](`/api/v1/vendor-account-discrepancies${path}`).set(h.as(account));
  const listed = async (query = '', account: ApiAccount = itAdmin) =>
    h.dataOf<Page<Difference>>(await differences('get', `?pageSize=100${query}`, account).expect(200));

  it('opens a difference again when the thing it was about is seen with newer evidence after it was decided, links it to the one it follows, and does nothing for the same day or an older one (B3C-04, QĐ-106j, US-13-05 AC-26)', async () => {
    const intake = h.ctx.app.get(VendorAccountIntakeService);
    const seen = (date: string) =>
      h.ctx.app.get(TransactionRunner).run((tx) =>
        intake.fromUnlistedTools(tx, {
          organizationId: h.seed.organizationId,
          sightings: [{ tool: 'REOPEN-TOOL', date }],
        }),
      );
    const ofTool = async (state: string) =>
      (await listed(`&state=${state}&source=COLLECTOR_UNLISTED`)).items.filter(
        (item) => item.identity === 'REOPEN-TOOL',
      );
    await seen(`${h.year}-10-03`);
    const [first] = await ofTool('OPEN');
    await differences('post', `/${first.id}/decision`)
      .send({ decision: 'FALSE_ALARM', note: 'Công cụ thử' })
      .expect(201);

    await seen(`${h.year}-10-03`);
    await seen(`${h.year}-09-20`);
    expect(await ofTool('OPEN')).toEqual([]);

    await seen(`${h.year}-10-20`);
    const [again, ...rest] = await ofTool('OPEN');
    expect(rest).toEqual([]);
    expect(again).toMatchObject({ evidenceOn: `${h.year}-10-20`, reopenedFromId: first.id, decision: null });
    expect(again.id).not.toBe(first.id);
    expect((await ofTool('DECIDED')).map((item) => item.id)).toEqual([first.id]);

    await seen(`${h.year}-10-25`);
    expect((await ofTool('OPEN')).map((item) => [item.id, item.evidenceOn])).toEqual([[again.id, `${h.year}-10-25`]]);
  });

  it('makes one difference for the tool, moves the day of its evidence when it is seen again, and keeps no person', async () => {
    const intake = h.ctx.app.get(VendorAccountIntakeService);
    const runner = h.ctx.app.get(TransactionRunner);
    const sight = (date: string) =>
      runner.run((tx) =>
        intake.fromUnlistedTools(tx, {
          organizationId: h.seed.organizationId,
          sightings: [{ tool: 'ANTIGRAVITY_CLI', date }],
        }),
      );

    await sight(`${h.year}-10-02`);
    await sight(`${h.year}-10-09`);

    const item = (await listed('&source=COLLECTOR_UNLISTED')).items.filter(
      (candidate) => candidate.identity === 'ANTIGRAVITY_CLI',
    );
    expect(item).toHaveLength(1);
    expect(item[0]).toMatchObject({
      internalValue: 'Not on the allowlist of the collector',
      vendorValue: 'Tool ANTIGRAVITY_CLI was reported',
      employeeId: null,
      application: null,
      evidenceOn: `${h.year}-10-09`,
    });
  });
});
