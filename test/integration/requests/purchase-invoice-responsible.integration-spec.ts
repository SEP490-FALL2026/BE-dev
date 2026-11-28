import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createActivatedAccount, type ApiAccount } from '../../support/api-accounts';
import { InvoiceHarness } from '../../support/invoice-harness';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface Wire {
  id: string;
  state: string;
  resubmissionOfId: string | null;
}

/**
 * Who submits, reads, is told of and submits again the invoice of a subscription or of a lot not bought for a request (`QĐ-118d`, `QĐ-118f`,
 * Owner 28/11/2026): the IT Admin who answers for it now, after the Super Admin changed who answers. On real PostgreSQL, through the routes.
 */
describe('purchase invoice responsibility over PostgreSQL (integration; QĐ-118d, QĐ-118f)', () => {
  let plan: string;
  let it2: ApiAccount;
  let counter = 0;
  let numbers = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    it2 = await handOthersToSecondItAdmin(h);
    plan = await h.planOf(await h.subscription(20, 'K1'));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const api = (method: 'get' | 'post', path: string, account: ApiAccount) =>
    request(h.server())[method](`/api/v1/purchase-invoices${path}`).set(h.as(account));
  /** A department the IT Admin `it1` works, with a budget, and one request approved for 20 million: the commitment it holds. */
  const approved = async (): Promise<{ unit: Unit; requestId: string }> => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-PIR${counter}`);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.budgetFor(unit, { total: 100 * M });
    const requestId = await h.waitingForApprover(unit, plan, { amount: 20 * M });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return { unit, requestId };
  };
  /** A finished upload of a purchase document by `account`: what the upload and its completion leave. */
  const document = async (account: ApiAccount = h.it1): Promise<string> => {
    const id = randomUUID();
    numbers += 1;
    await h.ctx.sql.query(
      `INSERT INTO document_attachments (id, organization_id, purpose, status, file_name, content_type, size_bytes, object_key,
         final_object_key, uploaded_by_app_user_id)
       VALUES ($1, $2, 'PURCHASE_DOCUMENT'::"DocumentPurpose", 'PENDING_ATTACH', 'hoa-don.pdf', 'application/pdf', 1000, $3, $4, $5)`,
      [
        id,
        h.seed.organizationId,
        `documents/pir/${numbers}-${id}`,
        `documents/pir/kept-${numbers}-${id}`,
        account.appUserId,
      ],
    );

    return id;
  };
  const form = (requestId: string, over: Record<string, unknown> = {}) => {
    numbers += 1;

    return {
      link: { requestId },
      vendorInvoiceNumber: `PIR-${numbers}`,
      issuedOn: `${h.year}-11-02`,
      servicePeriodMonth: `${h.year}-11`,
      quantity: 1,
      unitPriceOriginal: { amount: '15', currency: 'USD' },
      netAmount: { amount: '3840000' },
      paymentSource: 'COMPANY_CARD',
      ...over,
    };
  };
  const submit = async (requestId: string, over: Record<string, unknown> = {}, account: ApiAccount = h.it1) =>
    api('post', '', account).send({ ...form(requestId, over), documentIds: [await document(account)] });
  const wire = (response: request.Response) => h.dataOf<Wire>(response);

  describe('after the Super Admin changes who answers for a subscription or a lot, the one who answers now takes over what was returned (QĐ-118f, Owner 28/11/2026)', () => {
    const codeOf = (response: request.Response) => (response.body as { error: { code: string } }).error.code;
    const notices = async (purchaseId: string, to: string) =>
      (
        await h.ctx.sql.query(
          `SELECT 1 FROM in_app_notifications WHERE code = 'PURCHASE_INVOICE_RETURNED' AND subject_id = $1 AND recipient_employee_id = $2`,
          [purchaseId, to],
        )
      ).rowCount;
    const changeResponsible = (route: string, id: string, to: ApiAccount) =>
      request(h.server())
        .post(`/api/v1/${route}/${id}/responsible-it-admin`)
        .set('Authorization', `Bearer ${h.admin}`)
        .send({ employeeId: to.employeeId, reason: 'IT 1 is moving to another team' })
        .expect(200);
    const giveBack = (id: string) =>
      request(h.server())
        .post(`/api/v1/purchase-invoices/${id}/return`)
        .set(h.as(h.finance))
        .send({ reason: 'Thiếu hóa đơn thuế' })
        .expect(201);
    const resend = async (id: string, number: string, account: ApiAccount) => {
      const rest: Record<string, unknown> = form(randomUUID(), { quantity: 10, vendorInvoiceNumber: number });
      delete rest.link;

      return api('post', `/${id}/resubmission`, account).send({ ...rest, documentIds: [await document(account)] });
    };
    const readable = async (id: string, account: ApiAccount, status: number) => {
      await api('get', `/${id}`, account).expect(status);
      const listed = h.dataOf<{ items: Wire[] }>(await api('get', '', account).expect(200)).items.map((i) => i.id);

      return listed.includes(id);
    };

    it('subscription: the new IT Admin reads the returned invoice in the list and by id, is told, and submits it again; the one before and a third are refused', async () => {
      const owned = await h.subscription(10, 'K2');
      await h.ctx.sql.query(
        `UPDATE subscriptions SET original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
        [owned],
      );
      const first = wire(
        await api('post', '', h.it1)
          .send({
            ...form(randomUUID(), { link: { subscriptionId: owned }, quantity: 10, vendorInvoiceNumber: 'RESP-1' }),
            documentIds: [await document()],
          })
          .expect(201),
      );
      await api('get', `/${first.id}`, it2).expect(404);
      await changeResponsible('subscriptions', owned, it2);
      await giveBack(first.id);

      expect(await readable(first.id, it2, 200)).toBe(true);
      expect(await notices(first.id, it2.employeeId)).toBe(1);
      expect(await notices(first.id, h.it1.employeeId)).toBe(0);
      const third = await createActivatedAccount(h.ctx, h.seed, {
        code: 'E-IT3',
        email: 'it3@acme.vn',
        role: 'IT_ADMIN',
        admin: h.admin,
      });
      const byThird = await resend(first.id, 'RESP-1', third);
      expect(byThird.status).toBe(403);
      expect(codeOf(byThird)).toBe('PURCHASE_INVOICE.NOT_RESPONSIBLE');
      const before = await resend(first.id, 'RESP-1', h.it1);
      expect(before.status).toBe(403);
      expect(codeOf(before)).toBe('PURCHASE_INVOICE.NOT_RESPONSIBLE');
      const after = await resend(first.id, 'RESP-1', it2);
      expect(after.status).toBe(201);
      expect(wire(after)).toMatchObject({ state: 'SUBMITTED', resubmissionOfId: first.id });
    });

    it('subscription: another IT Admin is refused with NOT_RESPONSIBLE before the state is looked at, an invoice not returned included', async () => {
      const owned = await h.subscription(10, 'K2');
      await h.ctx.sql.query(
        `UPDATE subscriptions SET original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
        [owned],
      );
      const kept = wire(
        await api('post', '', h.it1)
          .send({
            ...form(randomUUID(), { link: { subscriptionId: owned }, quantity: 10, vendorInvoiceNumber: 'RESP-2' }),
            documentIds: [await document()],
          })
          .expect(201),
      );

      expect(codeOf(await resend(kept.id, 'RESP-2', it2))).toBe('PURCHASE_INVOICE.NOT_RESPONSIBLE');
      expect(codeOf(await resend(kept.id, 'RESP-2', h.it1))).toBe('PURCHASE_INVOICE.NOT_RETURNED');
    });

    it('lot that is not for a request: the new IT Admin reads it, is told and submits it again; the one before is refused', async () => {
      const plan4 = await h.plan('K4');
      const lot = randomUUID();
      await h.ctx.sql.query(
        `INSERT INTO license_lots (id, organization_id, plan_id, purchased_on, license_count, unit_price_minor, purpose,
           responsible_it_admin_employee_id, updated_at)
         VALUES ($1, $2, $3, '2026-11-01', 3, 1000000, 'STOCK', $4, now())`,
        [lot, h.seed.organizationId, plan4, h.it1.employeeId],
      );
      const first = wire(
        await api('post', '', h.it1)
          .send({
            ...form(randomUUID(), { link: { licenseLotId: lot }, quantity: 3, vendorInvoiceNumber: 'RESP-3' }),
            documentIds: [await document()],
          })
          .expect(201),
      );
      await changeResponsible('license-lots', lot, it2);
      await giveBack(first.id);

      expect(await readable(first.id, it2, 200)).toBe(true);
      expect(await notices(first.id, it2.employeeId)).toBe(1);
      expect(codeOf(await resend(first.id, 'RESP-3', h.it1))).toBe('PURCHASE_INVOICE.NOT_RESPONSIBLE');
      const after = await resend(first.id, 'RESP-3', it2);
      expect(after.status).toBe(201);
      expect(wire(after)).toMatchObject({ state: 'SUBMITTED', resubmissionOfId: first.id });
    });

    it('request: the invoice stays with the one who submitted it, who is told, and nobody else reads or submits it again', async () => {
      const { requestId } = await approved();
      const first = wire(await submit(requestId, { vendorInvoiceNumber: 'RESP-4' }));
      await giveBack(first.id);

      expect(await notices(first.id, h.it1.employeeId)).toBe(1);
      expect(await readable(first.id, h.it1, 200)).toBe(true);
      await api('get', `/${first.id}`, it2).expect(404);
      expect(codeOf(await resend(first.id, 'RESP-4', it2))).toBe('PURCHASE_INVOICE.NOT_FOUND');
    });
  });
});
