import { Prisma } from '../../../generated/prisma/client';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { CommitmentRepo } from '../budget/commitment.repo';
import type { InvoiceRecord, InvoiceRepo } from '../budget/invoice.repo';
import { PurchaseInvoiceRecordRefusedError } from '../public/budgets.errors';
import type { PurchaseInvoiceRecordInput } from '../public/budgets.types';
import type { ThresholdAlertService } from '../threshold/threshold-alert.service';
import { PurchaseInvoiceRecorderService } from './purchase-invoice-recorder.service';

const ACTOR = { employeeId: 'finance-1', appUserId: 'u-1', roles: ['FINANCE'] } as unknown as AuthenticatedPrincipal;
const TX = {} as DbTx;

const commitment = (over: Record<string, unknown> = {}) => ({
  id: 'c-1',
  year: 2027,
  organizationId: 'org-1',
  costCenterId: 'cc-1',
  amountMinor: 20_000n,
  releasedMinor: 0n,
  appliedMinor: 0n,
  state: 'HELD' as const,
  origin: 'APPROVAL' as const,
  seatMonthlyMinor: null,
  attachedVersionId: 'v-1' as string | null,
  ...over,
});
const input = (over: Partial<PurchaseInvoiceRecordInput> = {}): PurchaseInvoiceRecordInput => ({
  organizationId: 'org-1',
  purchaseInvoiceId: 'p-1',
  requestId: 'req-1',
  subscriptionId: null,
  vendorId: 'vendor-1',
  number: 'INV-1',
  issuedOn: '2027-01-05',
  serviceMonth: '2027-01-01',
  netMinor: 12_000n,
  deductibleTaxMinor: 0n,
  nonDeductibleTaxMinor: 0n,
  matchResult: 'MATCHED',
  chargedCostCenterId: 'cc-1',
  unallocated: null,
  now: new Date('2027-01-06T01:00:00.000Z'),
  ...over,
});

function build(opts: { commitments?: ReturnType<typeof commitment>[]; exists?: boolean } = {}) {
  const calls: string[] = [];
  const lockOfRequest = jest.fn(() => {
    calls.push('lock');

    return Promise.resolve(opts.commitments ?? [commitment()]);
  });
  const applyInvoice = jest.fn(() => {
    calls.push('apply');

    return Promise.resolve();
  });
  const insert = jest.fn((_tx: unknown, row: Record<string, unknown>) => {
    calls.push('insert');

    return Promise.resolve({ id: 'inv-1', ...row } as unknown as InvoiceRecord);
  });
  const lock = jest.fn(() => {
    calls.push('year');

    return Promise.resolve();
  });
  const record = jest.fn(() => {
    calls.push('audit');

    return Promise.resolve();
  });
  const watch = jest.fn().mockResolvedValue({ pairs: [], usedBefore: new Map() });
  const settle = jest.fn().mockResolvedValue(0);
  const service = new PurchaseInvoiceRecorderService(
    { lockOfRequest, applyInvoice } as unknown as CommitmentRepo,
    {
      insert,
      exists: jest.fn().mockResolvedValue(opts.exists ?? false),
    } as unknown as InvoiceRepo,
    { lock },
    { record } as unknown as AuditApi,
    { watch, settle } as unknown as ThresholdAlertService,
  );

  return { service, calls, lockOfRequest, applyInvoice, insert, lock, record, watch, settle };
}

describe('PurchaseInvoiceRecorderService.record (PI-1.5, PI-1.7)', () => {
  it('locks the commitments of the request first, then takes the commitment down, writes the invoice and audits, in that order', async () => {
    const { service, calls } = build();

    await service.record(TX, ACTOR, input());

    expect(calls).toEqual(['lock', 'apply', 'insert', 'audit']);
  });

  it('RV2-03: the threshold of the year is watched for a commitment that is attached to a version, and not for one that still waits for a budget (the lock of the year after the row of the commitment would meet the approval of a version, which holds the year and then takes the row)', async () => {
    const attached = build();
    await attached.service.record(TX, ACTOR, input());
    expect(attached.watch).toHaveBeenCalledWith(TX, [{ costCenterId: 'cc-1', year: 2027 }]);
    expect(attached.settle).toHaveBeenCalledTimes(1);

    const waiting = build({ commitments: [commitment({ attachedVersionId: null })] });
    const recorded = await waiting.service.record(TX, ACTOR, input());
    expect(waiting.watch).not.toHaveBeenCalled();
    expect(waiting.settle).not.toHaveBeenCalled();
    // The invoice is still written against the commitment, the row of which is the only lock it took.
    expect(recorded).toMatchObject({ booking: 'COMMITMENT', commitmentId: 'c-1' });
    expect(waiting.calls).toEqual(['lock', 'apply', 'insert', 'audit']);
  });

  it('writes the invoice of a K1 whose grant failed to the line not allocated with the department of the user, and neither locks nor takes down any commitment (FX3-01, QĐ-104k(4))', async () => {
    const { service, calls, lockOfRequest, applyInvoice, lock, insert } = build();

    const recorded = await service.record(
      TX,
      ACTOR,
      input({ chargedCostCenterId: null, unallocated: { reason: 'K1_GRANT_FAILED', departmentId: 'dept-1' } }),
    );

    expect(recorded).toMatchObject({
      booking: 'UNALLOCATED',
      commitmentId: null,
      costCenterId: null,
      appliedMinor: 0n,
    });
    expect(lockOfRequest).not.toHaveBeenCalled();
    expect(applyInvoice).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
    expect(calls).toEqual(['insert', 'audit']);
    expect(insert.mock.calls[0][1]).toMatchObject({
      commitmentId: null,
      costCenterId: null,
      subscriptionId: null,
      unallocated: { reason: 'K1_GRANT_FAILED', departmentId: 'dept-1' },
    });
  });

  it('records the vendor it is given, in dong, the month it pays for and the one who signed as the one who recorded it', async () => {
    const { service, insert } = build();

    await service.record(TX, ACTOR, input());

    expect(insert.mock.calls[0][1]).toMatchObject({
      vendorId: 'vendor-1',
      currency: 'VND',
      organizationId: 'org-1',
      commitmentId: 'c-1',
      serviceMonth: '2027-01-01',
      purchaseInvoiceId: 'p-1',
      recordedByEmployeeId: 'finance-1',
    });
  });

  it('costs the price and the tax that cannot be deducted, keeps the tax that can apart, and takes the commitment down by the price', async () => {
    const { service, insert, applyInvoice } = build();

    const recorded = await service.record(
      TX,
      ACTOR,
      input({ deductibleTaxMinor: 1_200n, nonDeductibleTaxMinor: 600n }),
    );

    expect(insert.mock.calls[0][1]).toMatchObject({
      netMinor: 12_000n,
      deductibleTaxMinor: 1_200n,
      nonDeductibleTaxMinor: 600n,
      actualCostMinor: 12_600n,
      appliedMinor: 12_000n,
      matchResult: 'TAX_ONLY',
    });
    expect(applyInvoice).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ id: 'c-1' }),
      expect.objectContaining({ takeMinor: 12_000n, stateAfter: 'HELD' }),
    );
    expect(recorded).toMatchObject({ booking: 'COMMITMENT', actualCostMinor: 12_600n, appliedMinor: 12_000n });
  });

  it('writes an audit event that names the invoice, the commitment and what it cost', async () => {
    const { service, record } = build();

    await service.record(TX, ACTOR, input({ nonDeductibleTaxMinor: 600n }));

    expect(record).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        action: 'INVOICE.RECORDED',
        resourceType: 'INVOICE',
        resourceId: 'inv-1',
        after: expect.objectContaining({
          commitmentId: 'c-1',
          purchaseInvoiceId: 'p-1',
          actualCostMinor: '12600',
          appliedMinor: '12000',
        }) as unknown,
      }),
    );
  });

  it('never takes the commitment down by more than it holds, and does not call the dong that goes over it a difference of count or price (R-44, QĐ-111an)', async () => {
    const { service, insert } = build();

    await service.record(TX, ACTOR, input({ netMinor: 25_000n }));

    expect(insert.mock.calls[0][1]).toMatchObject({
      appliedMinor: 20_000n,
      actualCostMinor: 25_000n,
      matchResult: 'MATCHED',
    });
  });

  it('says only the tax differs when the invoice carries tax, whatever it costs against the commitment', async () => {
    const { service, insert } = build();

    await service.record(TX, ACTOR, input({ netMinor: 25_000n, deductibleTaxMinor: 2_500n }));

    expect(insert.mock.calls[0][1]).toMatchObject({ matchResult: 'TAX_ONLY' });
  });

  it('keeps the exception the purchase invoice carries even when the price fits the commitment', async () => {
    const { service, insert } = build();

    await service.record(TX, ACTOR, input({ matchResult: 'PRICE_QUANTITY_EXCEPTION' }));

    expect(insert.mock.calls[0][1]).toMatchObject({ matchResult: 'PRICE_QUANTITY_EXCEPTION' });
  });

  describe('where it is booked', () => {
    it('is an expense of the Cost Center with no commitment, under the lock of its year, when another department bears it', async () => {
      const { service, insert, applyInvoice, lock } = build();

      const recorded = await service.record(TX, ACTOR, input({ chargedCostCenterId: 'cc-2' }));

      expect(recorded).toMatchObject({
        booking: 'COST_CENTER',
        commitmentId: null,
        costCenterId: 'cc-2',
        appliedMinor: 0n,
      });
      expect(lock).toHaveBeenCalledWith(TX, 'cc-2', [2027]);
      expect(applyInvoice).not.toHaveBeenCalled();
      expect(insert.mock.calls[0][1]).toMatchObject({ commitmentId: null, costCenterId: 'cc-2', appliedMinor: 0n });
    });

    it('is an expense of the Cost Center, and the commitment stays released, when the commitment was let go', async () => {
      const { service, applyInvoice } = build({
        commitments: [commitment({ state: 'RELEASED', releasedMinor: 20_000n })],
      });

      const recorded = await service.record(TX, ACTOR, input());

      expect(recorded).toMatchObject({ booking: 'COST_CENTER', costCenterId: 'cc-1' });
      expect(applyInvoice).not.toHaveBeenCalled();
    });

    it('is a line of the subscription, with no lock on any commitment, for an invoice of a subscription', async () => {
      const { service, lockOfRequest, insert } = build();

      const recorded = await service.record(
        TX,
        ACTOR,
        input({ requestId: null, subscriptionId: 's-1', chargedCostCenterId: null }),
      );

      expect(recorded).toMatchObject({ booking: 'SUBSCRIPTION', subscriptionId: 's-1', commitmentId: null });
      expect(lockOfRequest).not.toHaveBeenCalled();
      expect(insert.mock.calls[0][1]).toMatchObject({ subscriptionId: 's-1', costCenterId: null, poolFigures: null });
    });

    it('forwards poolFigures when provided for a pooled-quota invoice', async () => {
      const { service, insert } = build();
      const poolFigures = {
        expectedMinor: 66_000_000n,
        varianceMinor: 3_500_000n,
        varianceMonth: '2027-07-01',
        inReview: true,
      };

      await service.record(
        TX,
        ACTOR,
        input({ requestId: null, subscriptionId: 's-1', chargedCostCenterId: null, poolFigures }),
      );

      expect(insert.mock.calls[0][1]).toMatchObject({ subscriptionId: 's-1', poolFigures });
    });
  });

  describe('what it refuses, writing nothing', () => {
    it.each([
      ['a price of nothing', { netMinor: 0n }],
      ['a negative price', { netMinor: -5n }],
      ['a negative tax that can be deducted', { deductibleTaxMinor: -1n }],
      ['a negative tax that cannot be deducted', { nonDeductibleTaxMinor: -1n }],
    ])('refuses %s as an amount that is not above nothing', async (_name, over) => {
      const { service, insert, lockOfRequest } = build();

      await expect(service.record(TX, ACTOR, input(over))).rejects.toMatchObject({ reason: 'AMOUNT_NOT_POSITIVE' });
      expect(lockOfRequest).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    });

    it('refuses a place that is nowhere: no commitment of the year and no Cost Center to bear it', async () => {
      const { service, insert } = build({ commitments: [] });

      await expect(service.record(TX, ACTOR, input({ chargedCostCenterId: null }))).rejects.toMatchObject({
        reason: 'NO_PLACE',
      });
      expect(insert).not.toHaveBeenCalled();
    });

    it('refuses a number the vendor used already', async () => {
      const { service, insert, applyInvoice } = build({ exists: true });

      await expect(service.record(TX, ACTOR, input())).rejects.toMatchObject({ reason: 'DUPLICATE_NUMBER' });
      expect(insert).not.toHaveBeenCalled();
      expect(applyInvoice).not.toHaveBeenCalled();
    });

    it('tells the one that loses a race at the unique index that the number is taken', async () => {
      const { service, insert } = build();
      insert.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
      );

      await expect(service.record(TX, ACTOR, input())).rejects.toBeInstanceOf(PurchaseInvoiceRecordRefusedError);
    });

    it('lets any other failure of the write through as it is', async () => {
      const { service, insert } = build();
      insert.mockRejectedValueOnce(new Error('connection lost'));

      await expect(service.record(TX, ACTOR, input())).rejects.toThrow('connection lost');
    });
  });
});
