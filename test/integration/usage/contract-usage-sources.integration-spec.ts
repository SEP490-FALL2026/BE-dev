import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { ContractHarness } from '../../support/contract-harness';
import { AGGREGATE_SOURCE } from '../../support/vendor-usage-harness';

const h = new ContractHarness();

interface ContractSourceWire {
  id: string;
  name: string;
  application: { id: string; name: string };
  status: string;
}
interface ContractSourcePage {
  items: ContractSourceWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * The usage sources a contract shows (`US-04-13` AC-15, `QĐ-111t`): the sources of the applications of the subscriptions that rest on it, for the
 * IT Admin and Finance, each with its name and its status and nothing of how it reads a report. Finance reads no other route of the sources
 * (`QĐ-101i`).
 */
describe('the usage sources of a contract, over HTTP (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterAll(async () => {
    await h.stop();
  });

  const createSource = (applicationId: string, name: string) =>
    request(h.server())
      .post('/api/v1/usage-sources')
      .set(h.as(h.it1))
      .send({
        applicationId,
        name,
        timeZone: 'Asia/Ho_Chi_Minh',
        activityDefinition: 'mở hoặc chỉnh sửa một tệp trong ứng dụng',
        ...AGGREGATE_SOURCE,
      });
  const sourceOf = async (applicationId: string, name: string): Promise<string> =>
    h.dataOf<{ id: string }>(await createSource(applicationId, name).expect(201)).id;
  const sourcesOf = (contractId: string, query: Record<string, string | number> = {}, account: ApiAccount = h.it1) =>
    request(h.server()).get(`/api/v1/contracts/${contractId}/usage-sources`).query(query).set(h.as(account));
  const pageOf = async (contractId: string, query: Record<string, string | number> = {}, account: ApiAccount = h.it1) =>
    h.dataOf<ContractSourcePage>(await sourcesOf(contractId, query, account).expect(200));

  /** A contract of a new vendor and, for each kind given, one subscription of it linked; a second plan of the first application is linked too. */
  async function contractWithApplications(vendorName: string, types: Array<'K2' | 'K4'>) {
    const contractId = await h.contractWith({
      name: `Hợp đồng ${vendorName}`,
      vendorId: await h.vendorNamed(vendorName),
    });
    const subscriptions = [];
    for (const type of types) {
      const subscription = await h.subscriptionOfVendor(vendorName, type);
      await h.linkSubscription(contractId, subscription.subscriptionId).expect(201);
      subscriptions.push(subscription);
    }

    return { contractId, subscriptions };
  }

  it('shows Finance and the IT Admin the sources of the applications of the contract, each once, and the sources of no other application', async () => {
    const { contractId, subscriptions } = await contractWithApplications('Vendor AC15', ['K2', 'K4']);
    const [first, second] = subscriptions;
    // A second subscription of the first application: the application stays one application.
    const again = await h.subscriptionOfVendor('Vendor AC15', 'K2', first.applicationId);
    await h.linkSubscription(contractId, again.subscriptionId).expect(201);
    const stranger = await contractWithApplications('Vendor Other AC15', ['K2']);
    const adminExport = await sourceOf(first.applicationId, 'Admin export');
    const auditLog = await sourceOf(first.applicationId, 'Audit log');
    const licenceReport = await sourceOf(second.applicationId, 'Licence report');
    await sourceOf(stranger.subscriptions[0].applicationId, 'Of another contract');

    for (const account of [h.it1, h.finance]) {
      const page = await pageOf(contractId, {}, account);

      expect(page.items.map((item) => item.id).sort()).toEqual([adminExport, auditLog, licenceReport].sort());
      expect(page.pagination).toMatchObject({ page: 1, totalItems: 3, totalPages: 1 });
      for (const item of page.items) {
        expect(Object.keys(item).sort()).toEqual(['application', 'id', 'name', 'status']);
        expect(item.status).toBe('ACTIVE');
        expect(Object.keys(item.application).sort()).toEqual(['id', 'name']);
      }
      expect(page.items.find((item) => item.id === licenceReport)).toMatchObject({
        name: 'Licence report',
        application: { id: second.applicationId },
      });
    }
  });

  it('says RETIRED for a source that is retired, so a reader tells it from one that still reads reports', async () => {
    const { contractId, subscriptions } = await contractWithApplications('Vendor Retired AC15', ['K2']);
    const live = await sourceOf(subscriptions[0].applicationId, 'Still reads');
    const gone = await sourceOf(subscriptions[0].applicationId, 'No longer reads');
    await h.ctx.sql.query(`UPDATE usage_sources SET retired_at = now() WHERE id = $1`, [gone]);

    const page = await pageOf(contractId, {}, h.finance);

    expect(Object.fromEntries(page.items.map((item) => [item.id, item.status]))).toEqual({
      [live]: 'ACTIVE',
      [gone]: 'RETIRED',
    });
  });

  it('answers an empty page for a contract with no subscription, and 404 for a contract that does not exist', async () => {
    const empty = await h.contractWith({ name: 'Chưa liên kết', vendorId: await h.vendorNamed('Vendor Empty AC15') });

    const page = await pageOf(empty, {}, h.finance);
    expect(page.items).toEqual([]);
    expect(page.pagination).toMatchObject({ totalItems: 0, totalPages: 0 });

    const missing = await sourcesOf('0b7a1f5e-0000-4000-8000-0000000000bb', {}, h.finance).expect(404);
    expect(h.codeOf(missing)).toBe('USAGE_SOURCE.CONTRACT_NOT_FOUND');
  });

  it('pages the sources in a fixed order: no source twice and none missed across the pages', async () => {
    const { contractId, subscriptions } = await contractWithApplications('Vendor Pages AC15', ['K2', 'K4']);
    const made = [
      await sourceOf(subscriptions[0].applicationId, 'One'),
      await sourceOf(subscriptions[0].applicationId, 'Two'),
      await sourceOf(subscriptions[1].applicationId, 'Three'),
    ];

    const first = await pageOf(contractId, { page: 1, pageSize: 2 });
    const second = await pageOf(contractId, { page: 2, pageSize: 2 });

    expect(first.pagination).toMatchObject({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect([...first.items, ...second.items].map((item) => item.id).sort()).toEqual([...made].sort());
  });

  it('refuses everyone but the IT Admin and Finance with 403, and opens no other route of the sources to Finance (QĐ-101i)', async () => {
    const { contractId, subscriptions } = await contractWithApplications('Vendor Roles AC15', ['K2']);
    const source = await sourceOf(subscriptions[0].applicationId, 'Roles');

    expect(h.codeOf(await sourcesOf(contractId, {}, h.employee).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    for (const response of [
      await request(h.server()).get('/api/v1/usage-sources').set(h.as(h.finance)),
      await request(h.server()).get(`/api/v1/usage-sources/${source}`).set(h.as(h.finance)),
      await request(h.server()).patch(`/api/v1/usage-sources/${source}`).set(h.as(h.finance)).send({ name: 'x' }),
    ]) {
      expect(response.status).toBe(403);
    }
  });
});
