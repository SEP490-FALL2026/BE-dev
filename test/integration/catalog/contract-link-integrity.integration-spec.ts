import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { PROJECT_ROOT } from '../../support/cli-process';
import { ContractHarness } from '../../support/contract-harness';

const h = new ContractHarness();

/** What a rejected statement carries: the SQLSTATE and the constraint the database named. */
async function refusalOf(text: string, values: unknown[] = []): Promise<{ code: string; constraint: string } | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    const { code, constraint } = error as { code?: string; constraint?: string };

    return { code: code ?? 'unknown', constraint: constraint ?? '' };
  }
}

/**
 * CO-1 review (QĐ-111t): the rule that only a subscription of a shared stock (K2 or K4) of the vendor of the contract rests on a contract is held
 * after the link too. A plan that leaves K2 and K4 while a subscription of it rests on a contract is refused (the plan says
 * 409 `PLAN.IN_USE_BLOCKS_CHANGE`, reason `CONTRACT_LINKS`), and a link that is moved by an UPDATE, not made by an INSERT, goes through the same judgment.
 */
describe('a contract link keeps the rule after it is made (integration, real PostgreSQL)', () => {
  const NAME = 'Atlassian CO1 review';
  const NAME_OTHER = 'Figma CO1 review';
  let vendor: string;
  const patchPlan = (id: string, body: object) =>
    request(h.server()).patch(`/api/v1/plans/${id}`).set(h.as(h.it1)).send(body);
  const typeOf = async (planId: string) =>
    (await h.ctx.sql.query<{ type: string }>(`SELECT provisioning_type AS type FROM plans WHERE id = $1`, [planId]))
      .rows[0].type;
  /** A K2 plan has the profile of its workspace admins, which blocks the change of kind by itself: the cases below are about the link. */
  const withoutProfile = (planId: string) =>
    h.ctx.sql.query(`DELETE FROM plan_workspace_profiles WHERE plan_id = $1`, [planId]);

  beforeAll(async () => {
    await h.start();
    vendor = await h.vendorNamed(NAME);
  }, 120000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the plan of a linked subscription stays a plan of a shared stock', () => {
    it('refuses a plan that becomes K1 while a subscription of it rests on a contract: 409 reason CONTRACT_LINKS, the plan and the link stay, and the database refuses too', async () => {
      const contract = await h.contractWith({ name: 'Plan thành K1', vendorId: vendor });
      const sub = await h.subscriptionOfVendor(NAME, 'K2');
      await h.linkSubscription(contract, sub.subscriptionId).expect(201);
      await withoutProfile(sub.planId);

      const refused = await patchPlan(sub.planId, { provisioningType: 'K1' });

      expect([refused.status, h.codeOf(refused), h.detailsOf(refused)]).toEqual([
        409,
        'PLAN.IN_USE_BLOCKS_CHANGE',
        { reason: 'CONTRACT_LINKS' },
      ]);
      expect(await typeOf(sub.planId)).toBe('K2');
      expect(await refusalOf(`UPDATE plans SET provisioning_type = 'K1' WHERE id = $1`, [sub.planId])).toEqual({
        code: '23514',
        constraint: 'plans_change_keeps_contract_links',
      });
      expect((await h.contractOf(contract)).subscriptionCount).toBe(1);
    }, 120000);

    it('refuses the same for K3 by the row (the route does not take K3 as a target, 422 PLAN.PROVISIONING_TYPE_NOT_SUPPORTED), and for a K4 plan that leaves', async () => {
      const contract = await h.contractWith({ name: 'Plan rời kho dùng chung', vendorId: vendor });
      const k2 = await h.subscriptionOfVendor(NAME, 'K2');
      const k4 = await h.subscriptionOfVendor(NAME, 'K4');
      await h.linkSubscription(contract, k2.subscriptionId).expect(201);
      await h.linkSubscription(contract, k4.subscriptionId).expect(201);
      await withoutProfile(k2.planId);

      expect(h.codeOf(await patchPlan(k2.planId, { provisioningType: 'K3' }).expect(422))).toBe(
        'PLAN.PROVISIONING_TYPE_NOT_SUPPORTED',
      );
      for (const [plan, kind] of [
        [k2.planId, 'K3'],
        [k4.planId, 'K3'],
        [k4.planId, 'K1'],
      ] as const) {
        expect(
          await refusalOf(`UPDATE plans SET provisioning_type = '${kind}'::"ProvisioningType" WHERE id = $1`, [plan]),
        ).toEqual({
          code: '23514',
          constraint: 'plans_change_keeps_contract_links',
        });
      }
      expect((await h.contractOf(contract)).subscriptionCount).toBe(2);
    }, 120000);

    it('lets the plan change again once the subscription is unlinked, and a plan that stays K2 or K4 never trips on its link', async () => {
      const contract = await h.contractWith({ name: 'Gỡ rồi đổi', vendorId: vendor });
      const sub = await h.subscriptionOfVendor(NAME, 'K2');
      await h.linkSubscription(contract, sub.subscriptionId).expect(201);
      await withoutProfile(sub.planId);

      // A change that keeps the plan in a shared stock is no change of the rule: the name and K2 → K2 pass with the link in place.
      expect((await patchPlan(sub.planId, { name: h.unique('Đổi tên') })).status).toBe(200);
      await h.unlinkSubscription(contract, sub.subscriptionId).expect(200);

      expect((await patchPlan(sub.planId, { provisioningType: 'K1' })).status).toBe(200);
      expect(await typeOf(sub.planId)).toBe('K1');
    }, 120000);

    it('does not look at a plan that no contract holds', async () => {
      const sub = await h.subscriptionOfVendor(NAME, 'K2');
      await withoutProfile(sub.planId);

      expect((await patchPlan(sub.planId, { provisioningType: 'K1' })).status).toBe(200);
    }, 120000);
  });

  describe('a link that is moved by an UPDATE is judged as one that is made', () => {
    const move = (linked: string, set: string, value: string) =>
      refusalOf(`UPDATE contract_subscriptions SET ${set} = $2 WHERE subscription_id = $1`, [linked, value]);

    it('refuses to point a link at a subscription of a person (K1), of another vendor, and at a contract of no vendor or of another vendor', async () => {
      const contract = await h.contractWith({ name: 'Liên kết bị dời', vendorId: vendor });
      const good = await h.subscriptionOfVendor(NAME, 'K2');
      const personal = await h.subscriptionOfVendor(NAME, 'K1');
      const foreign = await h.subscriptionOfVendor(NAME_OTHER, 'K2');
      await h.linkSubscription(contract, good.subscriptionId).expect(201);
      const foreignContract = await h.contractWith({ name: 'Hợp đồng nhà cung cấp khác', vendorId: foreign.vendorId });
      const legacy = randomUUID();
      await h.ctx.sql.query(
        `INSERT INTO contracts (id, organization_id, name, created_by_app_user_id) VALUES ($1, $2, 'Chưa có nhà cung cấp', $3)`,
        [legacy, h.seed.organizationId, randomUUID()],
      );

      expect(await move(good.subscriptionId, 'subscription_id', personal.subscriptionId)).toEqual({
        code: '55000',
        constraint: 'contract_subscriptions_shared_stock_only',
      });
      expect(await move(good.subscriptionId, 'subscription_id', foreign.subscriptionId)).toEqual({
        code: '55000',
        constraint: 'contract_subscriptions_same_vendor',
      });
      expect(await move(good.subscriptionId, 'contract_id', foreignContract)).toEqual({
        code: '55000',
        constraint: 'contract_subscriptions_same_vendor',
      });
      expect(await move(good.subscriptionId, 'contract_id', legacy)).toEqual({
        code: '55000',
        constraint: 'contract_subscriptions_same_vendor',
      });
      // Nothing moved, and the link is where it was.
      expect((await h.contractOf(contract)).subscriptionCount).toBe(1);
    }, 120000);

    it('lets a link move to another contract of the same vendor, and leaves a change of when it was made alone', async () => {
      const first = await h.contractWith({ name: 'Hợp đồng đi', vendorId: vendor });
      const second = await h.contractWith({ name: 'Hợp đồng đến', vendorId: vendor });
      const sub = await h.subscriptionOfVendor(NAME, 'K2');
      await h.linkSubscription(first, sub.subscriptionId).expect(201);

      expect(await move(sub.subscriptionId, 'contract_id', second)).toBeNull();
      expect(
        await refusalOf(`UPDATE contract_subscriptions SET linked_at = now() WHERE subscription_id = $1`, [
          sub.subscriptionId,
        ]),
      ).toBeNull();
      expect((await h.contractOf(second)).subscriptionCount).toBe(1);
      expect((await h.contractOf(first)).subscriptionCount).toBe(0);
    }, 120000);
  });

  it('applies its migration twice without a change of what it keeps', async () => {
    const migration = readFileSync(
      join(
        PROJECT_ROOT,
        'prisma',
        'migrations',
        '20261113004300_co1_review_contract_links_keep_the_rule',
        'migration.sql',
      ),
      'utf8',
    );
    await h.ctx.sql.query(migration);
    await h.ctx.sql.query(migration);

    const contract = await h.contractWith({ name: 'Sau khi áp hai lần', vendorId: vendor });
    const sub = await h.subscriptionOfVendor(NAME, 'K2');
    await h.linkSubscription(contract, sub.subscriptionId).expect(201);
    expect(await refusalOf(`UPDATE plans SET provisioning_type = 'K1' WHERE id = $1`, [sub.planId])).toEqual({
      code: '23514',
      constraint: 'plans_change_keeps_contract_links',
    });
    const { rows } = await h.ctx.sql.query<{ events: string }>(
      `SELECT string_agg(event_manipulation, ',' ORDER BY event_manipulation) AS events
         FROM information_schema.triggers WHERE trigger_name = 'contract_subscriptions_check'`,
    );
    expect(rows[0].events).toBe('INSERT,UPDATE');
  }, 120000);
});
