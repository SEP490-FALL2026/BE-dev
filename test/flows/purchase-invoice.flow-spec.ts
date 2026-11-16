import { FlowWorld } from '../support/flows/flow-world';

const PDF = 'application/pdf';

/**
 * Mua và chứng từ (PI-1, `QĐ-111w`, SPEC S18 / Z2): the IT Admin who bought sends the invoice with its file, Finance signs it (or returns it
 * with a reason and the IT Admin sends it again), and what was paid becomes the spending of the month the invoice pays for — of the shared
 * pool for an invoice of a subscription, of the department that holds the right for a K1 seat bought for a Request. Real sign-in, the
 * seeded dataset, the bytes of the files through the fake object storage.
 */
describe('Mua/chứng từ: nộp hóa đơn → ký → thực chi tháng kỳ @PI1 @D1', () => {
  let world: FlowWorld;
  const call = () => world.calls;
  const wire = <T>(response: { body: unknown }) => (response.body as { data: T }).data;

  /** A purchase document as the screen uploads it: declare, put the bytes, complete. */
  const document = async (code: string): Promise<string> => {
    const declared = await call().post(code, '/documents', {
      fileName: 'hoa-don.pdf',
      contentType: PDF,
      sizeBytes: 2048,
      purpose: 'PURCHASE_DOCUMENT',
    });
    expect(declared.status).toBe(201);
    const id = wire<{ document: { id: string } }>(declared).document.id;
    const link = world.storage.uploadLinks.at(-1);
    if (!link) throw new Error('No upload link was issued');
    world.storage.put(link.key, { contentLength: 2048, contentType: PDF });
    expect((await call().post(code, `/documents/${id}/complete`)).status).toBe(200);

    return id;
  };

  const invoiceBody = async (
    code: string,
    link: Record<string, string>,
    number: string,
    quantity: number,
    unitPrice: number,
  ) => ({
    link,
    vendorInvoiceNumber: number,
    issuedOn: call().today(),
    servicePeriodMonth: call().today().slice(0, 7),
    quantity,
    unitPriceOriginal: { amount: String(unitPrice), currency: 'VND' },
    netAmount: { amount: String(quantity * unitPrice) },
    paymentSource: 'COMPANY_CARD',
    documentIds: [await document(code)],
  });

  const stateOf = async (id: string) =>
    (await world.facts.one<{ state: string }>(`SELECT state::text FROM purchase_invoices WHERE id = $1`, [id])).state;

  beforeAll(async () => {
    world = await FlowWorld.open();
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  it('hóa đơn thuê bao kho: IT nộp, Finance ký ⟹ thực chi của tháng kỳ ở kho chung; người nộp không tự ký #PI1 @B2', async () => {
    const subscriptionId = await call().subscriptionOf('Canva Teams');
    const sent = await call().post(
      'NV-ITA2',
      '/purchase-invoices',
      await invoiceBody('NV-ITA2', { subscriptionId }, 'FLOW-PI-001', 6, 250000),
    );
    expect(sent.status).toBe(201);
    const id = wire<{ id: string }>(sent).id;
    expect(await stateOf(id)).toBe('SUBMITTED');

    // Only Finance signs (the IT Admin who sent it is refused by role), and the signature writes the spending of the month of service.
    expect((await call().post('NV-ITA2', `/purchase-invoices/${id}/confirmation`)).status).toBe(403);
    const signed = await call().post('NV-FIN1', `/purchase-invoices/${id}/confirmation`);
    expect(signed.status).toBe(200);
    expect(await stateOf(id)).toBe('CONFIRMED');
    const spent = await world.facts.one<{ month: string; net: string; unit: string | null }>(
      `SELECT to_char(service_month, 'YYYY-MM-DD') AS month, net_minor::text AS net, cost_center_id::text AS unit
         FROM invoices WHERE purchase_invoice_id = $1`,
      [id],
    );
    expect(spent).toEqual({ month: `${call().today().slice(0, 7)}-01`, net: '1500000', unit: null });
  });

  it('Finance trả hóa đơn kèm lý do; IT nộp lại; Finance ký #PI1 @B2', async () => {
    const subscriptionId = await call().subscriptionOf('Figma Professional');
    const sent = await call().post(
      'NV-ITA2',
      '/purchase-invoices',
      await invoiceBody('NV-ITA2', { subscriptionId }, 'FLOW-PI-002', 18, 375000),
    );
    expect(sent.status).toBe(201);
    const id = wire<{ id: string }>(sent).id;

    const noReason = await call().post('NV-FIN1', `/purchase-invoices/${id}/return`, {});
    expect([noReason.status, call().codeOf(noReason)]).toEqual([422, 'VALIDATION_ERROR']);
    expect(
      (await call().post('NV-FIN1', `/purchase-invoices/${id}/return`, { reason: 'Thiếu mã số thuế người bán' }))
        .status,
    ).toBe(200);
    expect(await stateOf(id)).toBe('RETURNED');

    // Sent again it names no link: it is the same subscription as the one returned, with everything else said again.
    const { link, ...resent0 } = await invoiceBody('NV-ITA2', { subscriptionId }, 'FLOW-PI-002B', 18, 375000);
    expect(link).toEqual({ subscriptionId });
    const again = await call().post('NV-ITA2', `/purchase-invoices/${id}/resubmission`, resent0);
    expect(again.status).toBe(201);
    const resent = wire<{ id: string }>(again).id;
    expect(await stateOf(resent)).toBe('SUBMITTED');
    expect((await call().post('NV-FIN1', `/purchase-invoices/${resent}/confirmation`)).status).toBe(200);
    expect(await stateOf(resent)).toBe('CONFIRMED');
  });

  it('hóa đơn K1 của Request: thực chi ghi vào Cost Center của phòng giữ quyền trong tháng kỳ #PI1 @B2', async () => {
    const requestId = (
      await world.facts.one<{ id: string }>(
        `SELECT id FROM access_requests WHERE business_reason LIKE '[SV-R18]%' AND state = 'COMPLETED'`,
      )
    ).id;
    const sent = await call().post(
      'NV-ITA1',
      '/purchase-invoices',
      await invoiceBody('NV-ITA1', { requestId }, 'FLOW-PI-003', 1, 500000),
    );
    expect(sent.status).toBe(201);
    const id = wire<{ id: string }>(sent).id;
    expect((await call().post('NV-FIN1', `/purchase-invoices/${id}/confirmation`)).status).toBe(200);
    const spent = await world.facts.one<{ month: string; unit: string }>(
      `SELECT to_char(i.service_month, 'YYYY-MM-DD') AS month, c.code AS unit
         FROM invoices i JOIN budget_commitments m ON m.id = i.commitment_id JOIN cost_centers c ON c.id = m.cost_center_id
        WHERE i.purchase_invoice_id = $1`,
      [id],
    );
    expect(spent).toEqual({ month: `${call().today().slice(0, 7)}-01`, unit: 'CC-ENG' });
  });
});
