import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { VendorDirectoryService } from '../../src/modules/catalog/vendor/vendor-directory.service';
import { SeatHarness } from '../support/seat-baseline-harness';
import { waitForLockWaiters } from '../support/lock-wait';

const h = new SeatHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

/** The SQLSTATE a rejected statement carries: the database, not the application, said no. */
async function sqlState(client: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await client.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('write integrity of catalog, finance and licensing (integration, DB-03, DB-07 to DB-11, DB-14)', () => {
  let holder: Client;
  const sql = () => h.ctx.sql;
  const as = (account = h.it1) => h.as(account);

  beforeAll(async () => {
    await h.start();
    holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
  }, 120000);

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
  });

  afterAll(async () => {
    await holder?.end();
    await h.stop();
  });

  const group = async (name: string): Promise<string> => {
    const id = randomUUID();
    await sql().query(`INSERT INTO vendor_groups (id, name, normalized_name) VALUES ($1, $2, $3)`, [
      id,
      name,
      name.toLowerCase(),
    ]);

    return id;
  };
  const freeVendor = async (name: string): Promise<string> => {
    const id = randomUUID();
    await sql().query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, $4)`, [
      id,
      h.seed.organizationId,
      name,
      name.toLowerCase(),
    ]);

    return id;
  };
  const auditOf = async (action: string) =>
    (
      await sql().query<{ resource_type: string; resource_id: string; before: unknown; after: unknown }>(
        `SELECT resource_type, resource_id, before, after FROM audit_events WHERE action = $1 ORDER BY occurred_at, id`,
        [action],
      )
    ).rows;
  const planOfSubscription = async (subscriptionId: string): Promise<string> =>
    (await sql().query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [subscriptionId]))
      .rows[0].plan_id;
  const patchPlan = (id: string, body: object) => request(h.server()).patch(`/api/v1/plans/${id}`).set(as()).send(body);
  const declareApp = (body: object) =>
    request(h.server())
      .post('/api/v1/applications')
      .set(as())
      .send({
        kind: 'SAAS',
        dataSensitivity: 'LOW',
        businessOwnerEmployeeId: h.businessOwner,
        communication: NO,
        ...body,
      });
  const dictionary = async (groupName: string, lineName: string) => {
    const created = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/vendor-dictionary/groups')
        .set(as())
        .send({ name: groupName })
        .expect(201),
    );
    const line = h.dataOf<{ id: string }>(
      await request(h.server())
        .post(`/api/v1/vendor-dictionary/groups/${created.id}/service-lines`)
        .set(as())
        .send({ name: lineName })
        .expect(201),
    );

    return { groupId: created.id, lineId: line.id };
  };

  describe('DB-03: a vendor takes its dictionary group once', () => {
    it('is fixed at the database: none to a group is allowed, a group to another or to none is not', async () => {
      const [first, second] = [await group('Alpha'), await group('Beta')];
      const vendor = await freeVendor('Gamma');

      expect(
        await sqlState(sql(), `UPDATE vendors SET dictionary_group_id = $2 WHERE id = $1`, [vendor, first]),
      ).toBeNull();
      expect(await sqlState(sql(), `UPDATE vendors SET dictionary_group_id = $2 WHERE id = $1`, [vendor, second])).toBe(
        '55000',
      );
      expect(await sqlState(sql(), `UPDATE vendors SET dictionary_group_id = NULL WHERE id = $1`, [vendor])).toBe(
        '55000',
      );
      expect(
        await sqlState(sql(), `UPDATE vendors SET dictionary_group_id = $2, name = 'Gamma Ltd' WHERE id = $1`, [
          vendor,
          first,
        ]),
      ).toBeNull();
    }, 60_000);

    it('lets one of two simultaneous adopters win: the other is refused and the group is not overwritten', async () => {
      const [first, second] = [await group('Delta'), await group('Epsilon')];
      const vendor = await freeVendor('Zeta');
      const runner = h.ctx.app.get(TransactionRunner, { strict: false });
      const vendors = h.ctx.app.get(VendorDirectoryService, { strict: false });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let adopted!: () => void;
      const hasAdopted = new Promise<void>((resolve) => (adopted = resolve));

      const winner = runner.run(async (tx) => {
        const result = await vendors.adoptDictionaryGroup(tx, vendor, first);
        adopted();
        await gate;

        return result;
      });
      await hasAdopted;
      const loser = runner.run((tx) => vendors.adoptDictionaryGroup(tx, vendor, second));
      await waitForLockWaiters(sql(), 1, 5_000);
      release();

      expect(await winner).toMatchObject({ adopted: true, vendor: { dictionaryGroupId: first } });
      expect(await loser).toBeNull();
      expect(
        (await sql().query<{ g: string }>(`SELECT dictionary_group_id AS g FROM vendors WHERE id = $1`, [vendor]))
          .rows[0].g,
      ).toBe(first);
    }, 60_000);
  });

  describe('DB-11: what is taken over, and what is proposed, has its own audit event', () => {
    it('audits a free-text vendor taking the group of a dictionary line when an application is declared from it', async () => {
      await declareApp({ name: 'Miro Board', vendorName: 'Miro' }).expect(201);
      const { groupId, lineId } = await dictionary('Miro', 'Miro Board');
      const vendorId = (await sql().query<{ id: string }>(`SELECT id FROM vendors WHERE normalized_name = 'miro'`))
        .rows[0].id;

      await declareApp({ name: 'Miro Enterprise', dictionaryServiceLineId: lineId }).expect(201);

      const events = (await auditOf('VENDOR.DICTIONARY_GROUP_ADOPTED')).filter(
        (event) => event.resource_id === vendorId,
      );
      expect(events).toEqual([
        {
          resource_type: 'Vendor',
          resource_id: vendorId,
          before: { dictionaryGroupId: null },
          after: { dictionaryGroupId: groupId },
        },
      ]);
    }, 60_000);

    it('audits a vendor taking the group of a line when an application is changed to that line', async () => {
      const created = h.dataOf<{ id: string; vendor: { id: string } }>(
        await declareApp({ name: 'Notion Pad', vendorName: 'Notion' }).expect(201),
      );
      const { groupId, lineId } = await dictionary('Notion Labs', 'Notion Pad');

      await request(h.server())
        .patch(`/api/v1/applications/${created.id}`)
        .set(as())
        .send({ dictionaryServiceLineId: lineId })
        .expect(200);

      expect(
        (await auditOf('VENDOR.DICTIONARY_GROUP_ADOPTED')).filter((event) => event.resource_id === created.vendor.id),
      ).toEqual([
        {
          resource_type: 'Vendor',
          resource_id: created.vendor.id,
          before: { dictionaryGroupId: null },
          after: { dictionaryGroupId: groupId },
        },
      ]);
    }, 60_000);

    it('audits the proposal an application declaration raises, with the application that raised it', async () => {
      const created = h.dataOf<{ id: string }>(
        await declareApp({ name: 'Linear Tool', vendorName: 'Linear Software' }).expect(201),
      );

      const proposal = (
        await sql().query<{ id: string }>(
          `SELECT id FROM vendor_dictionary_proposals WHERE source_application_id = $1`,
          [created.id],
        )
      ).rows[0];
      const raised = (await auditOf('VENDOR_PROPOSAL.RAISED')).filter((event) => event.resource_id === proposal.id);
      expect(raised).toEqual([
        {
          resource_type: 'VendorDictionaryProposal',
          resource_id: proposal.id,
          before: null,
          after: { name: 'Linear Tool', domains: [], sourceApplicationId: created.id },
        },
      ]);
    }, 60_000);
  });

  describe('DB-07: a plan keeps what hangs on it', () => {
    it('refuses per-seat while an active subscription of it has no quantity', async () => {
      const subscription = await h.subscription(null, 'K2');
      const plan = await planOfSubscription(subscription);

      const response = await patchPlan(plan, { pricingModel: 'PER_SEAT' });

      expect(response.status).toBe(409);
      expect(h.codeOf(response)).toBe('PLAN.IN_USE_BLOCKS_CHANGE');
      expect(h.detailsOf(response)).toEqual({ reason: 'ACTIVE_SUBSCRIPTION_WITHOUT_QUANTITY' });
      expect(
        (await sql().query<{ pricing_model: string }>(`SELECT pricing_model FROM plans WHERE id = $1`, [plan])).rows[0]
          .pricing_model,
      ).toBe('FLAT_RATE');
      expect(await sqlState(sql(), `UPDATE plans SET pricing_model = 'PER_SEAT' WHERE id = $1`, [plan])).toBe('23514');
    }, 60_000);

    it('refuses to leave K4 while license keys are kept for its subscriptions', async () => {
      const subscription = await h.subscription(5, 'K4');
      const plan = await planOfSubscription(subscription);
      await request(h.server())
        .post('/api/v1/license-keys/imports')
        .set(as())
        .send({ subscriptionId: subscription, keys: ['KEY-WI-0001-ABCDE-12345'] })
        .expect(201);

      const response = await patchPlan(plan, { provisioningType: 'K1' });

      expect(response.status).toBe(409);
      expect(h.codeOf(response)).toBe('PLAN.IN_USE_BLOCKS_CHANGE');
      expect(h.detailsOf(response)).toEqual({ reason: 'LICENSE_KEYS' });
      expect(await sqlState(sql(), `UPDATE plans SET provisioning_type = 'K1' WHERE id = $1`, [plan])).toBe('23514');
    }, 60_000);

    it('does not block per-seat on a cost allocation: US-04-08 keeps it and reports that it no longer applies', async () => {
      const planId = await h.plan('K2', 'FLAT_RATE');
      const subscription = h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/subscriptions')
          .set(as())
          .send({
            planId,
            kind: 'TERM',
            unitPrice: { amount: '1000000', currency: 'VND' },
            billingCycle: 'MONTHLY',
            startDate: '2026-01-05',
            purchasedQuantity: 5,
          })
          .expect(201),
      ).id;
      const unit = await h.costCenter('UNIT');
      await request(h.server())
        .put(`/api/v1/subscriptions/${subscription}/cost-allocation`)
        .set(as(h.finance))
        .send({ lines: [{ costCenterId: unit.id, ratioPercent: '100' }] })
        .expect(200);

      await patchPlan(planId, { pricingModel: 'PER_SEAT' }).expect(200);

      const view = await request(h.server())
        .get(`/api/v1/subscriptions/${subscription}/cost-allocation`)
        .set(as(h.finance))
        .expect(200);
      expect(h.dataOf<{ applicability: string; status: string }>(view)).toMatchObject({
        applicability: 'PER_SEAT',
        status: 'DECLARED',
      });
    }, 60_000);
  });

  describe('DB-10: a cost allocation is declared under the pricing model it was checked against', () => {
    it('waits for a change of the pricing model in flight and then refuses a per-seat plan', async () => {
      const planId = await h.plan('K2', 'FLAT_RATE');
      const subscription = h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/subscriptions')
          .set(as())
          .send({
            planId,
            kind: 'TERM',
            unitPrice: { amount: '1000000', currency: 'VND' },
            billingCycle: 'MONTHLY',
            startDate: '2026-01-05',
            purchasedQuantity: 5,
          })
          .expect(201),
      ).id;
      const unit = await h.costCenter('UNIT');
      await holder.query('BEGIN');
      await holder.query(`UPDATE plans SET pricing_model = 'PER_SEAT' WHERE id = $1`, [planId]);

      const declaring = request(h.server())
        .put(`/api/v1/subscriptions/${subscription}/cost-allocation`)
        .set(as(h.finance))
        .send({ lines: [{ costCenterId: unit.id, ratioPercent: '100' }] })
        .then((response) => response);
      await waitForLockWaiters(sql(), 1, 5_000);
      await holder.query('COMMIT');

      const response = await declaring;
      expect(response.status).toBe(409);
      expect(h.codeOf(response)).toBe('SUBSCRIPTION.COST_ALLOCATION_NOT_APPLICABLE');
      expect(
        (await sql().query(`SELECT 1 FROM subscription_cost_allocations WHERE subscription_id = $1`, [subscription]))
          .rowCount,
      ).toBe(0);
    }, 60_000);
  });

  describe('DB-14: the head of a version history moves up by one, to a version that exists', () => {
    it('refuses to send the head of a tax profile back or ahead, and a version that is not the next', async () => {
      const vendor = (
        await sql().query<{ vendor_id: string }>(
          `SELECT vendor_id FROM applications WHERE vendor_id IS NOT NULL LIMIT 1`,
        )
      ).rows[0].vendor_id;
      await request(h.server())
        .put(`/api/v1/vendors/${vendor}/tax-profile`)
        .set(as(h.finance))
        .send({ group: 'T1', lines: [] })
        .expect(200);

      expect(
        await sqlState(sql(), `UPDATE vendor_tax_profiles SET current_version = 3 WHERE vendor_id = $1`, [vendor]),
      ).toBe('55000');
      expect(
        await sqlState(sql(), `UPDATE vendor_tax_profiles SET current_version = 0 WHERE vendor_id = $1`, [vendor]),
      ).toBe('55000');
      expect(
        await sqlState(
          sql(),
          `INSERT INTO vendor_tax_profile_versions (id, vendor_id, version, tax_group, declared_by_app_user_id)
           VALUES ($1, $2, 3, 'T1', $3)`,
          [randomUUID(), vendor, randomUUID()],
        ),
      ).toBe('55000');
      expect(
        (
          await sql().query<{ current_version: number }>(
            `SELECT current_version FROM vendor_tax_profiles WHERE vendor_id = $1`,
            [vendor],
          )
        ).rows[0].current_version,
      ).toBe(1);
    }, 60_000);

    it('refuses the same for the head of a cost allocation', async () => {
      const subscription = await h.subscription(null, 'K2');
      const unit = await h.costCenter('UNIT');
      await request(h.server())
        .put(`/api/v1/subscriptions/${subscription}/cost-allocation`)
        .set(as(h.finance))
        .send({ lines: [{ costCenterId: unit.id, ratioPercent: '100' }] })
        .expect(200);

      expect(
        await sqlState(
          sql(),
          `UPDATE subscription_cost_allocations SET current_version = 3 WHERE subscription_id = $1`,
          [subscription],
        ),
      ).toBe('55000');
      expect(
        await sqlState(
          sql(),
          `UPDATE subscription_cost_allocations SET current_version = 0 WHERE subscription_id = $1`,
          [subscription],
        ),
      ).toBe('55000');
      await holder.query('BEGIN');
      expect(
        await sqlState(
          holder,
          `INSERT INTO subscription_cost_allocation_versions (id, subscription_id, version, declared_by_app_user_id)
           VALUES ($1, $2, 3, $3)`,
          [randomUUID(), subscription, randomUUID()],
        ),
      ).toBe('55000');
    }, 60_000);
  });

  describe('DB-08: the capacity of a subscription is counted under READ COMMITTED only', () => {
    it('refuses an assignment written under a stronger isolation level', async () => {
      const subscription = await h.subscription(5, 'K2');
      const plan = await planOfSubscription(subscription);
      const employee = await h.person('E-ISO');
      await holder.query('BEGIN ISOLATION LEVEL REPEATABLE READ');

      const state = await sqlState(
        holder,
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
           account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, 'iso@acme.vn', 'iso@acme.vn', '2026-02-01', 'ACTUAL', $6)`,
        [randomUUID(), h.seed.organizationId, plan, subscription, employee, randomUUID()],
      );

      expect(state).toBe('55000');
    }, 60_000);
  });
});
