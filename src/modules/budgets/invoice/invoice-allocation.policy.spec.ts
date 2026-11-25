import {
  applyPairYearAllocations,
  deriveK1AllocationMonths,
  planK1TransferAllocationOffsets,
  splitK1AnnualInvoice,
} from './invoice-allocation.policy';

describe('invoice-allocation.policy', () => {
  describe('deriveK1AllocationMonths (F9(b))', () => {
    it('derives 12 calendar-month starts from year 1 serviceMonth (11/2026 -> 10/2027)', () => {
      expect(deriveK1AllocationMonths('2026-11-01')).toEqual([
        '2026-11-01',
        '2026-12-01',
        '2027-01-01',
        '2027-02-01',
        '2027-03-01',
        '2027-04-01',
        '2027-05-01',
        '2027-06-01',
        '2027-07-01',
        '2027-08-01',
        '2027-09-01',
        '2027-10-01',
      ]);
    });

    it('derives 12 calendar-month starts from year 2 serviceMonth (11/2027 -> 10/2028)', () => {
      const months = deriveK1AllocationMonths('2027-11-01');
      expect(months).toHaveLength(12);
      expect(months[0]).toBe('2027-11-01');
      expect(months[1]).toBe('2027-12-01');
      expect(months[2]).toBe('2028-01-01');
      expect(months[11]).toBe('2028-10-01');
    });
  });

  describe('splitK1AnnualInvoice', () => {
    it('splits 5.940.000 (5.400.000 net + 540.000 tax) into 12 equal months of 495.000 / 45.000', () => {
      const lines = splitK1AnnualInvoice({
        serviceMonth: '2026-11-01',
        netMinor: 5_400_000n,
        nonDeductibleTaxMinor: 540_000n,
        fallbackCostCenterId: 'cc-a',
      });

      expect(lines).toHaveLength(12);
      expect(
        lines.every((l) => l.amountMinor === 495_000n && l.taxPartMinor === 45_000n && l.costCenterId === 'cc-a'),
      ).toBe(true);
      expect(lines[0]?.month).toBe('2026-11-01');
      expect(lines[11]?.month).toBe('2027-10-01');
    });

    it('uses roundHalfAway(actual/12) for periods 1..11 and puts remainder on period 12 (5.940.001)', () => {
      const lines = splitK1AnnualInvoice({
        serviceMonth: '2026-11-01',
        netMinor: 5_400_001n,
        nonDeductibleTaxMinor: 540_000n,
        fallbackCostCenterId: 'cc-a',
      });

      for (let i = 0; i < 11; i += 1) {
        expect(lines[i]?.amountMinor).toBe(495_000n);
      }
      expect(lines[11]?.amountMinor).toBe(495_001n);
      const total = lines.reduce((sum, l) => sum + l.amountMinor, 0n);
      expect(total).toBe(5_940_001n);
    });

    it('keeps non-negative taxPartMinor on all 12 periods even for tiny odd tax amounts (< 12)', () => {
      const lines = splitK1AnnualInvoice({
        serviceMonth: '2026-11-01',
        netMinor: 5_400_000n,
        nonDeductibleTaxMinor: 7n,
        fallbackCostCenterId: 'cc-a',
      });

      expect(lines.every((l) => l.taxPartMinor >= 0n)).toBe(true);
      expect(lines.reduce((sum, l) => sum + l.taxPartMinor, 0n)).toBe(7n);
    });

    it('assigns per-month cost centers when invoice is confirmed after a transfer', () => {
      const monthCostCenters = deriveK1AllocationMonths('2026-11-01').map((month) => ({
        month,
        costCenterId: month >= '2027-04-01' ? 'cc-b' : 'cc-a',
      }));
      const lines = splitK1AnnualInvoice({
        serviceMonth: '2026-11-01',
        netMinor: 5_400_000n,
        nonDeductibleTaxMinor: 540_000n,
        monthCostCenters,
        fallbackCostCenterId: 'cc-a',
      });

      expect(lines.filter((l) => l.costCenterId === 'cc-a')).toHaveLength(5);
      expect(lines.filter((l) => l.costCenterId === 'cc-b')).toHaveLength(7);
      expect(lines.find((l) => l.month === '2027-03-01')?.costCenterId).toBe('cc-a');
      expect(lines.find((l) => l.month === '2027-04-01')?.costCenterId).toBe('cc-b');
    });
  });

  describe('applyPairYearAllocations (N3, K-A3)', () => {
    it.each([
      {
        name: '2026 matched within tax variance (990k vs 900k held, 90k tax)',
        pairYearMinor: 990_000n,
        pairYearTaxPartMinor: 90_000n,
        availableCommitmentMinor: 900_000n,
        expectedApplied: 900_000n,
        expectedExcess: 90_000n,
        expectedTaxVariance: 90_000n,
        expectedUncommittedExcess: 0n,
      },
      {
        name: 'over-budget invoice 2026 (1.320k vs 900k held, 120k tax => 300k real excess)',
        pairYearMinor: 1_320_000n,
        pairYearTaxPartMinor: 120_000n,
        availableCommitmentMinor: 900_000n,
        expectedApplied: 900_000n,
        expectedExcess: 420_000n,
        expectedTaxVariance: 120_000n,
        expectedUncommittedExcess: 300_000n,
      },
      {
        name: 'N3 invoice 1 before invoice 2 in 2027 (2m = 990k vs 5.400k held)',
        pairYearMinor: 990_000n,
        pairYearTaxPartMinor: 90_000n,
        availableCommitmentMinor: 5_400_000n,
        expectedApplied: 990_000n,
        expectedExcess: 0n,
        expectedTaxVariance: 0n,
        expectedUncommittedExcess: 0n,
      },
      {
        name: 'N3 invoice 2 overlapping same year (12m = 5.940k vs 4.410k remaining)',
        pairYearMinor: 5_940_000n,
        pairYearTaxPartMinor: 540_000n,
        availableCommitmentMinor: 4_410_000n,
        expectedApplied: 4_410_000n,
        expectedExcess: 1_530_000n,
        expectedTaxVariance: 540_000n,
        expectedUncommittedExcess: 990_000n,
      },
    ])('$name', (c) => {
      const res = applyPairYearAllocations({
        pairYearMinor: c.pairYearMinor,
        pairYearTaxPartMinor: c.pairYearTaxPartMinor,
        availableCommitmentMinor: c.availableCommitmentMinor,
      });
      expect(res).toEqual({
        appliedMinor: c.expectedApplied,
        excessMinor: c.expectedExcess,
        taxVarianceMinor: c.expectedTaxVariance,
        uncommittedExcessMinor: c.expectedUncommittedExcess,
      });
    });
  });

  describe('planK1TransferAllocationOffsets (F8)', () => {
    it('moves remaining months >= 2027-04-01 from old CC to new CC with TRANSFER_OUT and TRANSFER_IN', () => {
      const months = deriveK1AllocationMonths('2026-11-01');
      const existingLines = months.map((month, idx) => ({
        id: `alloc-${idx}`,
        invoiceId: 'inv-1',
        month,
        bucket: 'COST_CENTER' as const,
        costCenterId: 'cc-a',
        commitmentId: null,
        amountMinor: 495_000n,
        taxPartMinor: 45_000n,
        kind: 'ORIGINAL' as const,
        adjustsAllocationId: null,
        createdAt: new Date('2026-11-20T00:00:00Z'),
      }));

      const plan = planK1TransferAllocationOffsets({
        transferStartMonth: '2027-04-01',
        oldCostCenterId: 'cc-a',
        newCostCenterId: 'cc-b',
        existingLines,
      });

      expect(plan.offsets).toHaveLength(14); // 7 TRANSFER_OUT + 7 TRANSFER_IN (04..10/2027)
      expect(plan.offsets.filter((o) => o.kind === 'TRANSFER_OUT')).toHaveLength(7);
      expect(plan.offsets.filter((o) => o.kind === 'TRANSFER_IN')).toHaveLength(7);
      expect(plan.offsets.every((o) => o.month >= '2027-04-01')).toBe(true);
      expect(
        plan.offsets
          .filter((o) => o.kind === 'TRANSFER_OUT')
          .every((o) => o.amountMinor === -495_000n && o.taxPartMinor === 0n && o.costCenterId === 'cc-a'),
      ).toBe(true);
      expect(
        plan.offsets
          .filter((o) => o.kind === 'TRANSFER_IN')
          .every((o) => o.amountMinor === 495_000n && o.taxPartMinor === 45_000n && o.costCenterId === 'cc-b'),
      ).toBe(true);
      expect(plan.movedByInvoiceYear).toEqual([
        {
          invoiceId: 'inv-1',
          year: 2027,
          movedAmountMinor: 3_465_000n,
          movedTaxPartMinor: 315_000n,
        },
      ]);
    });

    it('returns empty plan when oldCostCenterId equals newCostCenterId', () => {
      const plan = planK1TransferAllocationOffsets({
        transferStartMonth: '2027-04-01',
        oldCostCenterId: 'cc-a',
        newCostCenterId: 'cc-a',
        existingLines: [],
      });
      expect(plan.offsets).toEqual([]);
      expect(plan.movedByInvoiceYear).toEqual([]);
    });
  });
});
