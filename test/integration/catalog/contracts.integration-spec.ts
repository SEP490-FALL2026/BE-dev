import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { ContractHarness, type ContractPage, type ContractWire } from '../../support/contract-harness';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements, tablesOf } from '../../support/query-count';

const h = new ContractHarness();

/**
 * The contracts over HTTP on real PostgreSQL (`US-04-13`, `QĐ-111t`): what a contract says of itself, its status read from the days, what a
 * change needs and leaves in the Audit Trail, which subscriptions rest on it (only K2 and K4 of its vendor, each on one contract), and the list
 * with its search, its filters and its pages.
 */
describe('the contracts, over HTTP (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let today: string;
  let vendorA: string;
  let vendorB: string;
  const NAME_A = 'Atlassian CO1';
  const NAME_B = 'Figma CO1';

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
    today = h.today();
    vendorA = await h.vendorNamed(NAME_A);
    vendorB = await h.vendorNamed(NAME_B);
  }, 120000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  describe('what a contract is made of (AC-1, AC-3, AC-4, AC-5, AC-12)', () => {
    it('keeps the vendor, the number, the days and the note, derives the status, and has no kind and no renewal terms', async () => {
      const id = await h.contractWith({
        name: '  Hợp đồng khung Atlassian  ',
        vendorId: vendorA,
        number: ' HD-2026-07 ',
        effectiveFrom: addDays(today, -30),
        effectiveTo: addDays(today, 300),
        note: ' Ký ngày 28/12 ',
      });

      const contract = await h.contractOf(id, h.finance);
      expect(contract).toMatchObject({
        id,
        name: 'Hợp đồng khung Atlassian',
        number: 'HD-2026-07',
        vendor: { id: vendorA, name: NAME_A },
        effectiveFrom: addDays(today, -30),
        effectiveTo: addDays(today, 300),
        note: 'Ký ngày 28/12',
        status: 'ACTIVE',
        subscriptionCount: 0,
        createdBy: h.it1.appUserId,
        subscriptions: [],
        documents: [],
        applicationIds: [],
        truncated: { subscriptions: false, documents: false, applicationIds: false },
      });
      for (const key of ['kind', 'type', 'renewalDate', 'noticePeriodDays', 'terms']) {
        expect(contract).not.toHaveProperty(key);
      }
      const events = await h.auditEvents('Contract', id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: 'CONTRACT.CREATED',
        actor_app_user_id: h.it1.appUserId,
        before: null,
        after: { vendorId: vendorA, number: 'HD-2026-07', name: 'Hợp đồng khung Atlassian' },
      });
    });

    it('takes a purchase for good as a contract with no end that is in effect once it has begun, and one that has not begun yet', async () => {
      const perpetual = await h.contractWith({ name: 'Office 2021', effectiveFrom: addDays(today, -400) });
      const later = await h.contractWith({ name: 'Sắp ký', effectiveFrom: addDays(today, 10) });
      const over = await h.contractWith({
        name: 'Đã hết',
        effectiveFrom: addDays(today, -100),
        effectiveTo: addDays(today, -1),
      });

      expect(await h.contractOf(perpetual)).toMatchObject({ effectiveTo: null, status: 'ACTIVE' });
      expect(await h.contractOf(later)).toMatchObject({ effectiveTo: null, status: 'NOT_YET_EFFECTIVE' });
      expect(await h.contractOf(over)).toMatchObject({ status: 'EXPIRED' });
      // The last day is a day in effect; the day after is not.
      const lastDay = await h.contractWith({
        name: 'Hôm nay là ngày cuối',
        effectiveFrom: addDays(today, -5),
        effectiveTo: today,
      });
      expect(await h.contractOf(lastDay)).toMatchObject({ status: 'ACTIVE' });
    });

    it('takes one number once as numbers are compared, and any number of contracts with none', async () => {
      await h.contractWith({ name: 'Một', number: 'HD-001' });
      const clash = await h.createContract({
        name: 'Hai',
        vendorId: vendorA,
        effectiveFrom: today,
        number: ' hd-001 ',
      });

      expect(clash.status).toBe(409);
      expect(h.codeOf(clash)).toBe('CONTRACT.NUMBER_TAKEN');
      await h.contractWith({ name: 'Không số 1' });
      await h.contractWith({ name: 'Không số 2', number: '   ' });
    });

    it('reads a number of nothing but combining marks as no number instead of failing on the key of the database (B2D-05)', async () => {
      const id = await h.contractWith({ name: 'Số chỉ có dấu', number: '́' });

      expect((await h.contractOf(id)).number).toBeNull();
      const other = await h.contractWith({ name: 'Số chỉ có dấu khác', number: '̣́' });
      expect((await h.contractOf(other)).number).toBeNull();
      await h.updateContract(other, { number: '́', reason: 'Dán nhầm ký tự dấu' }).expect(200);
    });

    it('refuses a contract without a vendor or the day it begins, a vendor that is not in the catalog, days that make no period, and a kind', async () => {
      const make = (body: object) => h.createContract({ name: 'Hợp đồng', ...body });
      const answer = async (body: object, status: number) => {
        const response = await make(body);
        expect(response.status).toBe(status);

        return h.codeOf(response);
      };

      expect(await answer({ effectiveFrom: today }, 422)).toBe('CONTRACT.VENDOR_REQUIRED');
      expect(await answer({ vendorId: vendorA }, 422)).toBe('CONTRACT.EFFECTIVE_FROM_REQUIRED');
      expect(await answer({ vendorId: randomUUID(), effectiveFrom: today }, 422)).toBe('CONTRACT.VENDOR_NOT_FOUND');
      expect(await answer({ vendorId: vendorA, effectiveFrom: today, effectiveTo: addDays(today, -1) }, 422)).toBe(
        'CONTRACT.EFFECTIVE_RANGE_INVALID',
      );
      expect(await answer({ vendorId: vendorA, effectiveFrom: today, kind: 'TERM' }, 422)).toBe('VALIDATION_ERROR');
      expect(await answer({ vendorId: vendorA, effectiveFrom: '2026-02-30' }, 422)).toBe('VALIDATION_ERROR');
      expect(await answer({ name: '   ', vendorId: vendorA, effectiveFrom: today }, 422)).toBe(
        'CONTRACT.NAME_REQUIRED',
      );
      expect(await answer({ organizationId: randomUUID(), vendorId: vendorA, effectiveFrom: today }, 422)).toBe(
        'VALIDATION_ERROR',
      );
    });

    it('reads a contract that is only a name as incomplete until the IT Admin gives it a vendor and the days, with a reason', async () => {
      const legacy = randomUUID();
      await h.ctx.sql.query(
        `INSERT INTO contracts (id, organization_id, name, created_by_app_user_id) VALUES ($1, $2, 'Hợp đồng cũ chỉ có tên', $3)`,
        [legacy, h.seed.organizationId, randomUUID()],
      );

      expect(await h.contractOf(legacy, h.finance)).toMatchObject({
        status: 'INCOMPLETE',
        vendor: null,
        number: null,
        effectiveFrom: null,
        effectiveTo: null,
      });
      const subscription = await h.subscriptionOfVendor(NAME_A, 'K2');
      const refused = await h.linkSubscription(legacy, subscription.subscriptionId);
      expect([refused.status, h.codeOf(refused)]).toEqual([422, 'CONTRACT.INCOMPLETE']);

      expect(h.codeOf(await h.updateContract(legacy, { vendorId: vendorA }).expect(422))).toBe(
        'CONTRACT.REASON_REQUIRED',
      );
      // An end with no beginning is not a period, for an old contract that has none.
      expect(
        h.codeOf(await h.updateContract(legacy, { effectiveTo: addDays(today, 5), reason: 'Bổ sung' }).expect(422)),
      ).toBe('CONTRACT.EFFECTIVE_RANGE_INVALID');
      const filled = await h
        .updateContract(legacy, {
          vendorId: vendorA,
          effectiveFrom: addDays(today, -10),
          reason: 'Bổ sung nhà cung cấp và ngày',
        })
        .expect(200);

      expect(h.dataOf<{ contract: ContractWire }>(filled).contract).toMatchObject({
        status: 'ACTIVE',
        vendor: { id: vendorA },
        effectiveFrom: addDays(today, -10),
        effectiveTo: null,
      });
      await h.linkSubscription(legacy, subscription.subscriptionId).expect(201);
    });
  });

  describe('what a change needs and leaves behind (AC-5, AC-8, AC-9)', () => {
    it('needs a reason and a field to change, keeps what is left out, and puts the reason with the values before and after in the Audit Trail', async () => {
      const id = await h.contractWith({
        name: 'Figma 2026',
        vendorId: vendorB,
        number: 'FG-1',
        effectiveTo: addDays(today, 100),
      });

      expect(h.codeOf(await h.updateContract(id, { note: 'x' }).expect(422))).toBe('CONTRACT.REASON_REQUIRED');
      expect(h.codeOf(await h.updateContract(id, { note: 'x', reason: '   ' }).expect(422))).toBe(
        'CONTRACT.REASON_REQUIRED',
      );
      expect(h.codeOf(await h.updateContract(id, { reason: 'Không đổi gì' }).expect(422))).toBe(
        'CONTRACT.UPDATE_EMPTY',
      );
      expect(h.codeOf(await h.updateContract(id, { name: ' ', reason: 'r' }).expect(422))).toBe(
        'CONTRACT.NAME_REQUIRED',
      );
      expect(h.codeOf(await h.updateContract(id, { vendorId: null, reason: 'r' }).expect(422))).toBe(
        'VALIDATION_ERROR',
      );
      expect(h.codeOf(await h.updateContract(id, { effectiveTo: addDays(today, -400), reason: 'r' }).expect(422))).toBe(
        'CONTRACT.EFFECTIVE_RANGE_INVALID',
      );
      expect(h.codeOf(await h.updateContract(randomUUID(), { note: 'x', reason: 'r' }).expect(404))).toBe(
        'CONTRACT.NOT_FOUND',
      );

      const changed = await h
        .updateContract(id, { effectiveTo: addDays(today, 465), note: 'Gia hạn một năm', reason: 'Phụ lục 2' })
        .expect(200);
      expect(h.dataOf<{ contract: ContractWire }>(changed).contract).toMatchObject({
        name: 'Figma 2026',
        number: 'FG-1',
        effectiveTo: addDays(today, 465),
        note: 'Gia hạn một năm',
      });

      const events = await h.auditEvents('Contract', id);
      expect(events.map((event) => event.action)).toEqual(['CONTRACT.CREATED', 'CONTRACT.UPDATED']);
      expect(events[1]).toMatchObject({
        actor_app_user_id: h.it1.appUserId,
        before: { effectiveTo: addDays(today, 100), note: null, number: 'FG-1' },
        after: { effectiveTo: addDays(today, 465), note: 'Gia hạn một năm', number: 'FG-1', reason: 'Phụ lục 2' },
      });
    });

    it('takes the number, the end and the note away with null, and writes nothing for a change that changes nothing', async () => {
      const id = await h.contractWith({
        name: 'Bớt trường',
        number: 'BT-1',
        effectiveTo: addDays(today, 50),
        note: 'ghi chú',
      });

      await h
        .updateContract(id, { number: null, effectiveTo: null, note: null, reason: 'Bỏ số, vô thời hạn' })
        .expect(200);
      expect(await h.contractOf(id)).toMatchObject({ number: null, effectiveTo: null, note: null, status: 'ACTIVE' });

      const before = (await h.auditEvents('Contract', id)).length;
      const again = await h
        .updateContract(id, { number: null, effectiveTo: null, name: 'Bớt trường', reason: 'Như cũ' })
        .expect(200);
      expect(h.dataOf<{ contract: ContractWire }>(again).contract.name).toBe('Bớt trường');
      expect((await h.auditEvents('Contract', id)).length).toBe(before);
      // The number that was taken away is free for another contract.
      await h.contractWith({ name: 'Dùng lại số', number: 'BT-1' });
    });

    it('refuses a number another contract has, and lets a contract keep its own, spelled another way', async () => {
      const first = await h.contractWith({ name: 'A', number: 'DUP-1' });
      const second = await h.contractWith({ name: 'B', number: 'DUP-2' });

      const clash = await h.updateContract(second, { number: ' dup-1', reason: 'Sửa số' });
      expect([clash.status, h.codeOf(clash)]).toEqual([409, 'CONTRACT.NUMBER_TAKEN']);
      await h.updateContract(first, { number: ' dup-1 ', reason: 'Viết thường' }).expect(200);
      expect((await h.contractOf(first)).number).toBe('dup-1');
    });

    it('lets Finance read and no one but the IT Admin change, and answers no route that deletes a contract', async () => {
      const id = await h.contractWith({ name: 'Chỉ IT sửa' });

      expect(h.codeOf(await h.updateContract(id, { note: 'x', reason: 'r' }, h.finance).expect(403))).toBe(
        'AUTHORIZATION.FORBIDDEN',
      );
      expect(h.codeOf(await h.updateContract(id, { note: 'x', reason: 'r' }, h.employee).expect(403))).toBe(
        'AUTHORIZATION.FORBIDDEN',
      );
      await request(h.server()).delete(`/api/v1/contracts/${id}`).set(h.as(h.it1)).expect(404);
      await h.getContract(id, h.finance).expect(200);
    });

    it('keeps the vendor of a contract while a subscription is linked, and lets it change when none is', async () => {
      const id = await h.contractWith({ name: 'Khóa nhà cung cấp', vendorId: vendorA });
      const subscription = await h.subscriptionOfVendor(NAME_A, 'K2');
      await h.linkSubscription(id, subscription.subscriptionId).expect(201);

      const locked = await h.updateContract(id, { vendorId: vendorB, reason: 'Đổi nhà cung cấp' });
      expect([locked.status, h.codeOf(locked)]).toEqual([409, 'CONTRACT.VENDOR_LOCKED']);
      // The same vendor is no change of vendor, and the other fields change as they like.
      await h.updateContract(id, { vendorId: vendorA, note: 'Vẫn đổi được ghi chú', reason: 'Ghi chú' }).expect(200);

      await h.unlinkSubscription(id, subscription.subscriptionId).expect(200);
      const free = await h.updateContract(id, { vendorId: vendorB, reason: 'Không còn thuê bao' }).expect(200);
      expect(h.dataOf<{ contract: ContractWire }>(free).contract.vendor).toMatchObject({ id: vendorB });
    });
  });

  describe('which subscriptions rest on a contract (AC-6, AC-7, AC-14; QĐ-111t)', () => {
    it('links a K2 subscription of its vendor, lists it with the application and the logo and audits the link; a K4 subscription is refused: its lot has its own contract (W3-24)', async () => {
      const id = await h.contractWith({ name: 'Microsoft 2026', vendorId: vendorA, number: 'HD-MS-2026' });
      const k2 = await h.subscriptionOfVendor(NAME_A, 'K2');
      const k4 = await h.subscriptionOfVendor(NAME_A, 'K4');

      const linked = await h.linkSubscription(id, k2.subscriptionId).expect(201);
      expect(h.dataOf<{ subscription: Record<string, unknown> }>(linked).subscription).toMatchObject({
        subscriptionId: k2.subscriptionId,
        status: 'ACTIVE',
        kind: 'TERM',
        provisioningType: 'K2',
        applicationId: k2.applicationId,
        planId: k2.planId,
        logoUrl: null,
      });
      const keys = await h.linkSubscription(id, k4.subscriptionId);
      expect([keys.status, h.codeOf(keys)]).toEqual([422, 'CONTRACT.SUBSCRIPTION_NOT_K2']);

      const contract = await h.contractOf(id, h.finance);
      expect(contract.subscriptionCount).toBe(1);
      expect(contract.subscriptions?.map((subscription) => subscription.provisioningType)).toEqual(['K2']);
      expect(contract.applicationIds).toEqual([k2.applicationId]);
      expect(contract).not.toHaveProperty('usageSources');
      expect((await h.auditEvents('Contract', id)).map((event) => event.action)).toEqual([
        'CONTRACT.CREATED',
        'CONTRACT.SUBSCRIPTION_LINKED',
      ]);
      expect((await h.auditEvents('Contract', id))[1].after).toEqual({ subscriptionId: k2.subscriptionId });
    });

    it('lists an application once when two subscriptions of it, of two K2 plans, rest on the contract', async () => {
      const id = await h.contractWith({ name: 'Một ứng dụng hai thuê bao', vendorId: vendorA });
      const k2 = await h.subscriptionOfVendor(NAME_A, 'K2');
      const second = await h.subscriptionOfVendor(NAME_A, 'K2', k2.applicationId);
      await h.linkSubscription(id, k2.subscriptionId).expect(201);
      await h.linkSubscription(id, second.subscriptionId).expect(201);

      const contract = await h.contractOf(id);

      expect(second.applicationId).toBe(k2.applicationId);
      expect(contract.subscriptionCount).toBe(2);
      expect(contract.subscriptions?.map((subscription) => subscription.provisioningType)).toEqual(['K2', 'K2']);
      expect(contract.applicationIds).toEqual([k2.applicationId]);
    }, 120000);

    it('refuses the rights of a person (K1) with the kind in the answer, the subscription of another vendor, and one that is not there', async () => {
      const id = await h.contractWith({ name: 'Chỉ thuê bao kho', vendorId: vendorA });
      const k1 = await h.subscriptionOfVendor(NAME_A, 'K1');
      const other = await h.subscriptionOfVendor(NAME_B, 'K2');

      const personal = await h.linkSubscription(id, k1.subscriptionId);
      expect([personal.status, h.codeOf(personal)]).toEqual([422, 'CONTRACT.SUBSCRIPTION_KIND_NOT_ALLOWED']);
      expect(h.detailsOf(personal)).toEqual({ provisioningType: 'K1' });
      const foreign = await h.linkSubscription(id, other.subscriptionId);
      expect([foreign.status, h.codeOf(foreign)]).toEqual([422, 'CONTRACT.SUBSCRIPTION_VENDOR_MISMATCH']);
      expect(h.codeOf(await h.linkSubscription(id, randomUUID()).expect(404))).toBe('CONTRACT.SUBSCRIPTION_NOT_FOUND');
      expect(h.codeOf(await h.linkSubscription(randomUUID(), other.subscriptionId).expect(404))).toBe(
        'CONTRACT.NOT_FOUND',
      );
      expect(h.codeOf(await h.linkSubscription(id, 'not-a-uuid').expect(422))).toBe('VALIDATION_ERROR');
      expect((await h.contractOf(id)).subscriptionCount).toBe(0);
      expect(await h.auditEvents('Contract', id)).toHaveLength(1);
    });

    it('lets a subscription rest on one contract only, and lets it move to another after it is unlinked', async () => {
      const first = await h.contractWith({ name: 'Hợp đồng 2026', vendorId: vendorA });
      const second = await h.contractWith({ name: 'Hợp đồng 2027', vendorId: vendorA });
      const subscription = await h.subscriptionOfVendor(NAME_A, 'K2');
      await h.linkSubscription(first, subscription.subscriptionId).expect(201);

      const again = await h.linkSubscription(first, subscription.subscriptionId);
      expect([again.status, h.codeOf(again), h.detailsOf(again)]).toEqual([
        409,
        'CONTRACT.SUBSCRIPTION_ALREADY_LINKED',
        { contractId: first },
      ]);
      const elsewhere = await h.linkSubscription(second, subscription.subscriptionId);
      expect([elsewhere.status, h.codeOf(elsewhere), h.detailsOf(elsewhere)]).toEqual([
        409,
        'CONTRACT.SUBSCRIPTION_ALREADY_LINKED',
        { contractId: first },
      ]);

      expect(h.codeOf(await h.unlinkSubscription(second, subscription.subscriptionId).expect(404))).toBe(
        'CONTRACT.SUBSCRIPTION_NOT_LINKED',
      );
      const gone = await h.unlinkSubscription(first, subscription.subscriptionId).expect(200);
      expect(h.dataOf<{ subscription: { subscriptionId: string } }>(gone).subscription.subscriptionId).toBe(
        subscription.subscriptionId,
      );
      expect(h.codeOf(await h.unlinkSubscription(first, subscription.subscriptionId).expect(404))).toBe(
        'CONTRACT.SUBSCRIPTION_NOT_LINKED',
      );
      await h.linkSubscription(second, subscription.subscriptionId).expect(201);
      expect((await h.contractOf(first)).subscriptionCount).toBe(0);
      expect((await h.contractOf(second)).subscriptionCount).toBe(1);
      expect((await h.auditEvents('Contract', first)).map((event) => event.action)).toEqual([
        'CONTRACT.CREATED',
        'CONTRACT.SUBSCRIPTION_LINKED',
        'CONTRACT.SUBSCRIPTION_UNLINKED',
      ]);
    });

    it('lets two requests that link one subscription at once end with one link and the other told which contract has it', async () => {
      const first = await h.contractWith({ name: 'Đua 1', vendorId: vendorA });
      const second = await h.contractWith({ name: 'Đua 2', vendorId: vendorA });
      const subscription = await h.subscriptionOfVendor(NAME_A, 'K2');

      const answers = await Promise.all([
        h.linkSubscription(first, subscription.subscriptionId),
        h.linkSubscription(second, subscription.subscriptionId),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
      const { rows } = await h.ctx.sql.query<{ contract_id: string }>(
        `SELECT contract_id FROM contract_subscriptions WHERE subscription_id = $1`,
        [subscription.subscriptionId],
      );
      expect(rows).toHaveLength(1);
    });

    it('lets Finance read a contract and link nothing, and refuses every other role', async () => {
      const id = await h.contractWith({ name: 'Quyền liên kết', vendorId: vendorA });
      const subscription = await h.subscriptionOfVendor(NAME_A, 'K2');

      for (const account of [h.finance, h.employee]) {
        expect(h.codeOf(await h.linkSubscription(id, subscription.subscriptionId, account).expect(403))).toBe(
          'AUTHORIZATION.FORBIDDEN',
        );
      }
      await h.linkSubscription(id, subscription.subscriptionId).expect(201);
      expect(h.codeOf(await h.unlinkSubscription(id, subscription.subscriptionId, h.finance).expect(403))).toBe(
        'AUTHORIZATION.FORBIDDEN',
      );
    });

    it('is held by the database too: a K1 subscription, another vendor, a contract with no vendor and a vendor change under a link are refused', async () => {
      const id = await h.contractWith({ name: 'Cơ sở dữ liệu giữ luật', vendorId: vendorA });
      const k1 = await h.subscriptionOfVendor(NAME_A, 'K1');
      const other = await h.subscriptionOfVendor(NAME_B, 'K2');
      const good = await h.subscriptionOfVendor(NAME_A, 'K2');
      const insert = (contractId: string, subscriptionId: string) =>
        h.ctx.sql.query(
          `INSERT INTO contract_subscriptions (id, contract_id, subscription_id, linked_by_app_user_id)
           VALUES (gen_random_uuid(), $1, $2, $3)`,
          [contractId, subscriptionId, randomUUID()],
        );
      const legacy = randomUUID();
      await h.ctx.sql.query(
        `INSERT INTO contracts (id, organization_id, name, created_by_app_user_id) VALUES ($1, $2, 'Chưa có nhà cung cấp', $3)`,
        [legacy, h.seed.organizationId, randomUUID()],
      );

      await expect(insert(id, k1.subscriptionId)).rejects.toMatchObject({ code: '55000' });
      await expect(insert(id, other.subscriptionId)).rejects.toMatchObject({ code: '55000' });
      await expect(insert(legacy, good.subscriptionId)).rejects.toMatchObject({ code: '55000' });
      await insert(id, good.subscriptionId);
      await expect(insert(id, good.subscriptionId)).rejects.toMatchObject({ code: '23505' });
      await expect(
        h.ctx.sql.query(`UPDATE contracts SET vendor_id = $2 WHERE id = $1`, [id, vendorB]),
      ).rejects.toMatchObject({
        code: '55000',
      });
      await expect(h.ctx.sql.query(`DELETE FROM contracts WHERE id = $1`, [id])).rejects.toMatchObject({
        code: '55000',
      });
    });
  });

  describe('the files of a contract (US-04-04 AC-13)', () => {
    it('lists the files that are attached and ready, the last first, with what they are and no place in the storage', async () => {
      const id = await h.contractWith({ name: 'Có tệp', vendorId: vendorA });
      const other = await h.contractWith({ name: 'Hợp đồng khác', vendorId: vendorA });
      const first = await h.uploaded();
      const second = await h.uploaded(h.it1, {
        fileName: 'phu-luc.pdf',
        contentType: 'application/pdf',
        sizeBytes: 4096,
        purpose: 'PURCHASE_DOCUMENT',
      });
      const waiting = await h.uploaded();
      const elsewhere = await h.uploaded();
      await h.attachDocument(first.id, { contractId: id }).expect(200);
      await h.attachDocument(second.id, { contractId: id }).expect(200);
      await h.attachDocument(elsewhere.id, { contractId: other }).expect(200);

      const contract = await h.contractOf(id, h.finance);
      expect(contract.documents?.map((document) => document.id)).toEqual([second.id, first.id]);
      expect(contract.documents?.[0]).toMatchObject({
        id: second.id,
        purpose: 'PURCHASE_DOCUMENT',
        fileName: 'phu-luc.pdf',
        contentType: 'application/pdf',
        sizeBytes: 4096,
      });
      expect(Object.keys(contract.documents?.[0] ?? {}).sort()).toEqual(
        ['attachedAt', 'contentType', 'fileName', 'id', 'purpose', 'sizeBytes'].sort(),
      );
      expect(contract.documents?.map((document) => document.id)).not.toContain(waiting.id);
    });
  });

  describe('the list (AC-10)', () => {
    const ids: Record<string, string> = {};
    let listed: ContractPage;

    beforeAll(async () => {
      ids.active = await h.contractWith({
        name: 'Danh sách Đang hiệu lực',
        vendorId: vendorA,
        number: 'LST-ACTIVE',
        effectiveFrom: addDays(today, -20),
        effectiveTo: addDays(today, 20),
      });
      ids.perpetual = await h.contractWith({
        name: 'Danh sách vô thời hạn',
        vendorId: vendorB,
        number: 'LST-PERP',
        effectiveFrom: addDays(today, -200),
      });
      ids.later = await h.contractWith({
        name: 'Danh sách chưa hiệu lực',
        vendorId: vendorA,
        effectiveFrom: addDays(today, 30),
        effectiveTo: addDays(today, 90),
      });
      ids.over = await h.contractWith({
        name: 'Danh sách hết hiệu lực',
        vendorId: vendorB,
        number: 'LST-OVER',
        effectiveFrom: addDays(today, -300),
        effectiveTo: addDays(today, -2),
      });
      ids.legacy = randomUUID();
      await h.ctx.sql.query(
        `INSERT INTO contracts (id, organization_id, name, created_by_app_user_id) VALUES ($1, $2, 'Danh sách chỉ có tên', $3)`,
        [ids.legacy, h.seed.organizationId, randomUUID()],
      );
      listed = h.dataOf<ContractPage>(await h.listContracts({ search: 'Danh sách', pageSize: 100 }).expect(200));
    });

    const namesOf = (page: ContractPage) => page.items.map((item) => item.name);
    const find = async (query: Record<string, string | number>, account = h.it1) =>
      h.dataOf<ContractPage>(await h.listContracts({ pageSize: 100, ...query }, account).expect(200));

    it('shows the summary of each contract by the day it begins, the latest first and those with none last, the same for Finance', async () => {
      expect(namesOf(listed)).toEqual([
        'Danh sách chưa hiệu lực',
        'Danh sách Đang hiệu lực',
        'Danh sách vô thời hạn',
        'Danh sách hết hiệu lực',
        'Danh sách chỉ có tên',
      ]);
      expect(listed.pagination).toEqual({ page: 1, pageSize: 100, totalItems: 5, totalPages: 1 });
      const [row] = listed.items;
      expect(Object.keys(row).sort()).toEqual(
        [
          'createdAt',
          'effectiveFrom',
          'effectiveTo',
          'id',
          'name',
          'number',
          'status',
          'subscriptionCount',
          'updatedAt',
          'vendor',
        ].sort(),
      );
      expect(namesOf(await find({ search: 'Danh sách', order: 'asc' }))).toEqual([
        'Danh sách hết hiệu lực',
        'Danh sách vô thời hạn',
        'Danh sách Đang hiệu lực',
        'Danh sách chưa hiệu lực',
        'Danh sách chỉ có tên',
      ]);
      expect(namesOf(await find({ search: 'Danh sách' }, h.finance))).toEqual(namesOf(listed));
    });

    it('finds a contract by part of its name whatever the case, or part of its number as numbers are compared', async () => {
      expect(namesOf(await find({ search: 'DANH sách vô' }))).toEqual(['Danh sách vô thời hạn']);
      expect(namesOf(await find({ search: ' lst-over ' }))).toEqual(['Danh sách hết hiệu lực']);
      expect(namesOf(await find({ search: 'LST-' }))).toEqual([
        'Danh sách Đang hiệu lực',
        'Danh sách vô thời hạn',
        'Danh sách hết hiệu lực',
      ]);
    });

    it('reads what is typed as letters, never as wildcards: % and _ match only a name or a number that holds them', async () => {
      await h.contractWith({ name: 'Tìm đúng chữ giảm 100% phí', number: 'LIT-0x1' });
      await h.contractWith({ name: 'Tìm đúng chữ không có ký tự lạ', number: 'LIT_01' });
      await h.contractWith({ name: 'Tìm đúng chữ số gần giống', number: 'LITx01' });

      expect(namesOf(await find({ search: '%' }))).toEqual(['Tìm đúng chữ giảm 100% phí']);
      expect(namesOf(await find({ search: '100%' }))).toEqual(['Tìm đúng chữ giảm 100% phí']);
      expect(namesOf(await find({ search: '_' }))).toEqual(['Tìm đúng chữ không có ký tự lạ']);
      // `_` is not "any character" in a number: LIT_01 does not find LITx01 and LITx01 is not found by it.
      expect(namesOf(await find({ search: 'lit_01' }))).toEqual(['Tìm đúng chữ không có ký tự lạ']);
      expect(namesOf(await find({ search: 'LITx01' }))).toEqual(['Tìm đúng chữ số gần giống']);
      expect(namesOf(await find({ search: '\\' }))).toEqual([]);
      expect(namesOf(await find({ search: 'Tìm đúng chữ', pageSize: 100 }))).toHaveLength(3);
    });

    it('narrows by vendor, by the status as of today, and by the day a contract is in effect', async () => {
      expect(namesOf(await find({ search: 'Danh sách', vendorId: vendorB }))).toEqual([
        'Danh sách vô thời hạn',
        'Danh sách hết hiệu lực',
      ]);
      const byStatus = async (status: string) => namesOf(await find({ search: 'Danh sách', status }));
      expect(await byStatus('ACTIVE')).toEqual(['Danh sách Đang hiệu lực', 'Danh sách vô thời hạn']);
      expect(await byStatus('NOT_YET_EFFECTIVE')).toEqual(['Danh sách chưa hiệu lực']);
      expect(await byStatus('EXPIRED')).toEqual(['Danh sách hết hiệu lực']);
      expect(await byStatus('INCOMPLETE')).toEqual(['Danh sách chỉ có tên']);
      expect(namesOf(await find({ search: 'Danh sách', effectiveOn: addDays(today, 60) }))).toEqual([
        'Danh sách chưa hiệu lực',
        'Danh sách vô thời hạn',
      ]);
      expect(namesOf(await find({ search: 'Danh sách', effectiveOn: addDays(today, -100) }))).toEqual([
        'Danh sách vô thời hạn',
        'Danh sách hết hiệu lực',
      ]);
      expect(namesOf(await find({ search: 'Danh sách', vendorId: vendorA, status: 'ACTIVE' }))).toEqual([
        'Danh sách Đang hiệu lực',
      ]);
    });

    it('gives each contract the status the filter of that status gives it, over every contract made in this suite', async () => {
      const all = await find({});
      for (const status of ['INCOMPLETE', 'NOT_YET_EFFECTIVE', 'ACTIVE', 'EXPIRED']) {
        const filtered = await find({ status });
        const expected = all.items.filter((item) => item.status === status).map((item) => item.id);
        expect(filtered.items.map((item) => item.id).sort()).toEqual([...expected].sort());
        expect(filtered.items.every((item) => item.status === status)).toBe(true);
      }
    });

    it('cuts the list in pages that add up, with the same order on every page', async () => {
      const total = (await find({})).pagination.totalItems;
      const seen: string[] = [];
      for (let page = 1; page <= Math.ceil(total / 7); page += 1) {
        const answer = await find({ page, pageSize: 7 });
        expect(answer.pagination).toMatchObject({ page, pageSize: 7, totalItems: total });
        seen.push(...answer.items.map((item) => item.id));
      }
      expect(seen).toHaveLength(total);
      expect(new Set(seen).size).toBe(total);
      expect(seen).toEqual((await find({})).items.map((item) => item.id));
    });

    it('refuses what it does not take and anyone but the IT Admin and Finance', async () => {
      const refused: Array<Record<string, string | number>> = [
        { pageSize: 101 },
        { page: 0 },
        { status: 'IN_EFFECT' },
        { order: 'up' },
        { effectiveOn: '2026-02-30' },
        { kind: 'TERM' },
        { departmentId: randomUUID() },
      ];
      for (const query of refused) {
        expect(h.codeOf(await h.listContracts(query).expect(422))).toBe('VALIDATION_ERROR');
      }
      expect(h.codeOf(await h.listContracts({}, h.employee).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    });
  });

  describe('how many statements it takes (API-LIST-DETAIL.1)', () => {
    it('reads a list of 3 contracts and a list of 30 in the same number of statements, none of them a read of the detail', async () => {
      const few = await counter.run(() => h.listContracts({ pageSize: 3 }).expect(200));
      for (let index = 0; index < 12; index += 1) await h.contractWith({ name: `Đếm ${index}`, vendorId: vendorA });
      const many = await counter.run(() => h.listContracts({ pageSize: 100 }).expect(200));

      expect(h.dataOf<ContractPage>(many.result).items.length).toBeGreaterThan(
        h.dataOf<ContractPage>(few.result).items.length,
      );
      expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
      const tables = dataStatements(many.statements).flatMap(tablesOf);
      expect(tables).not.toContain('document_attachments');
      expect(tables).not.toContain('plans');
    }, 120000);

    it('reads the detail of a contract with 1 subscription and with 3 in the same number of statements', async () => {
      const small = await h.contractWith({ name: 'Chi tiết nhỏ', vendorId: vendorA });
      const big = await h.contractWith({ name: 'Chi tiết lớn', vendorId: vendorA });
      await h.linkSubscription(small, (await h.subscriptionOfVendor(NAME_A, 'K2')).subscriptionId).expect(201);
      for (let index = 0; index < 3; index += 1) {
        await h.linkSubscription(big, (await h.subscriptionOfVendor(NAME_A, 'K2')).subscriptionId).expect(201);
        await h.attachDocument((await h.uploaded()).id, { contractId: big }).expect(200);
      }

      const one = await counter.run(() => h.getContract(small).expect(200));
      const three = await counter.run(() => h.getContract(big).expect(200));

      expect(h.dataOf<{ contract: ContractWire }>(three.result).contract.subscriptions).toHaveLength(3);
      expect(h.dataOf<{ contract: ContractWire }>(three.result).contract.documents).toHaveLength(3);
      expect(dataStatements(three.statements)).toHaveLength(dataStatements(one.statements).length);
    }, 120000);
  });
});
