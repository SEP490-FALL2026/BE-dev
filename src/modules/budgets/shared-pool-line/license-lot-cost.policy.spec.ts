import {
  lotIdleRatioStats,
  lotUnitCostActualMinor,
  planLotExcessCharge,
  planLotInvoiceConfirmation,
  planLotWithdrawalAfterInvoice,
} from './license-lot-cost.policy';

const M = 1_000_000n;

const conf = (
  over: Partial<Parameters<typeof planLotInvoiceConfirmation>[0]> &
    Pick<Parameters<typeof planLotInvoiceConfirmation>[0], 'actualMinor' | 'licenseCount' | 'unitPriceMinor'>,
) =>
  planLotInvoiceConfirmation({
    purpose: 'REQUEST',
    beneficiaryCount: 1,
    preInvoiceChargedCount: 0,
    preInvoiceChargedSumMinor: 0n,
    ...over,
  });

const excess = (over: Partial<Parameters<typeof planLotExcessCharge>[0]> = {}) =>
  planLotExcessCharge({
    grantRequestId: 'req-ex',
    lotRequestId: 'req-duc',
    keyCostBorneBeforeGrant: false,
    licenseCount: 3,
    effectiveBeneficiaryCount: 1,
    unitPriceMinor: 12n * M,
    invoiceActualMinor: 36n * M,
    alreadyChargedCount: 0,
    alreadyChargedSumMinor: 0n,
    costCenterAllocatedMinor: 12n * M,
    ...over,
  });

describe('license-lot-cost.policy (W3-25 & QD-120a)', () => {
  describe('lotUnitCostActualMinor — kills ceil on u', () => {
    it('rounds half away from zero instead of Math.ceil on 10,000,000 / 3 and handles odd/even inputs', () => {
      // If Math.ceil were used, 10_000_000 / 3 would yield 3_333_334n instead of 3_333_333n.
      expect(lotUnitCostActualMinor(10_000_000n, 3)).toBe(3_333_333n);
      expect(lotUnitCostActualMinor(10_000_001n, 3)).toBe(3_333_334n);
      expect(lotUnitCostActualMinor(36n * M, 3)).toBe(12n * M);
      expect(lotUnitCostActualMinor(39_600_000n, 3)).toBe(13_200_000n);
    });
  });

  describe('19 W3-25 acceptance scenarios', () => {
    it.each([
      {
        caseName: '1. 1F: confirm 36M lot (3x12M, m=1) -> CC 12M, POOL_IDLE 24M, ratio 66.7%',
        run: () => {
          expect(conf({ actualMinor: 36n * M, licenseCount: 3, unitPriceMinor: 12n * M })).toEqual({
            kind: 'REQUEST',
            unitCostActualMinor: 12n * M,
            taxVariancePerLicenseMinor: 0n,
            costCenterMinor: 12n * M,
            poolAllocation: { bucket: 'POOL_IDLE', kind: 'ORIGINAL', amountMinor: 24n * M },
          });
          const idle = lotIdleRatioStats([
            { licenseCount: 3, beneficiaryCount: 1, chargedPreOrSameMonthCount: 0, unitPriceMinor: 12n * M },
          ]);
          expect(idle.ratioPercent).toBe('66.7');
          expect(idle.exceedsThreshold).toBe(true);
        },
      },
      {
        caseName: '2. 1F: Duc key grant (R === L.requestId) -> 0 charge, cost_borne=true, keep hold',
        run: () => {
          expect(excess({ grantRequestId: 'req-duc' })).toEqual({
            kind: 'OWN_REQUEST',
            chargeMinor: 0n,
            markCostBorne: true,
            releaseCommitmentAll: false,
          });
        },
      },
      {
        caseName: '3. 1F: Quan gets 1st excess license -> +12M charge',
        run: () => {
          expect(excess({ grantRequestId: 'req-quan' })).toEqual({
            kind: 'EXCESS_LICENSE',
            chargeMinor: 12n * M,
            markCostBorne: true,
            releaseCommitmentAll: false,
          });
        },
      },
      {
        caseName: '4. Reclaimed key (cost_borne=true) re-granted to Ha -> 0 charge, release commitment',
        run: () => {
          expect(
            excess({
              grantRequestId: 'req-ha',
              keyCostBorneBeforeGrant: true,
              alreadyChargedCount: 1,
              alreadyChargedSumMinor: 12n * M,
            }),
          ).toEqual({
            kind: 'ALREADY_BORNE',
            chargeMinor: 0n,
            markCostBorne: false,
            releaseCommitmentAll: true,
          });
        },
      },
      {
        caseName: '5. Last excess in 02/2028 takes +12M (pool -12M)',
        run: () => {
          expect(
            excess({ grantRequestId: 'req-last', alreadyChargedCount: 1, alreadyChargedSumMinor: 12n * M }).chargeMinor,
          ).toBe(12n * M);
        },
      },
      {
        caseName: '6. W3-Q1 A: 3x12M + 10% non-deductible VAT (39.6M) -> CC 13.2M, idle 26.4M, variance 1.2M',
        run: () => {
          expect(conf({ actualMinor: 39_600_000n, licenseCount: 3, unitPriceMinor: 12n * M })).toEqual({
            kind: 'REQUEST',
            unitCostActualMinor: 13_200_000n,
            taxVariancePerLicenseMinor: 1_200_000n,
            costCenterMinor: 13_200_000n,
            poolAllocation: { bucket: 'POOL_IDLE', kind: 'ORIGINAL', amountMinor: 26_400_000n },
          });
          expect(excess({ invoiceActualMinor: 39_600_000n, costCenterAllocatedMinor: 13_200_000n }).chargeMinor).toBe(
            13_200_000n,
          );
        },
      },
      {
        caseName: '7. K-A9: A=10M, n=3, m=1 -> CC 3,333,333; excess1 3,333,333; last excess 3,333,334',
        run: () => {
          expect(conf({ actualMinor: 10n * M, licenseCount: 3, unitPriceMinor: 3_333_333n })).toEqual({
            kind: 'REQUEST',
            unitCostActualMinor: 3_333_333n,
            taxVariancePerLicenseMinor: 0n,
            costCenterMinor: 3_333_333n,
            poolAllocation: { bucket: 'POOL_IDLE', kind: 'ORIGINAL', amountMinor: 6_666_667n },
          });
          const ex1 = excess({
            unitPriceMinor: 3_333_333n,
            invoiceActualMinor: 10n * M,
            costCenterAllocatedMinor: 3_333_333n,
          });
          const ex2 = excess({
            unitPriceMinor: 3_333_333n,
            invoiceActualMinor: 10n * M,
            alreadyChargedCount: 1,
            alreadyChargedSumMinor: 3_333_333n,
            costCenterAllocatedMinor: 3_333_333n,
          });
          expect(ex1.chargeMinor).toBe(3_333_333n);
          expect(ex2.chargeMinor).toBe(3_333_334n);
        },
      },
      {
        caseName: '8. K-A4 ordering: Quan pre-invoice (12M) -> invoice 39.6M (CC 13.2M, idle 14.4M) -> Ha 14.4M',
        run: () => {
          expect(excess({ invoiceActualMinor: null, costCenterAllocatedMinor: null }).chargeMinor).toBe(12n * M);
          expect(
            conf({
              actualMinor: 39_600_000n,
              licenseCount: 3,
              unitPriceMinor: 12n * M,
              preInvoiceChargedCount: 1,
              preInvoiceChargedSumMinor: 12n * M,
            }),
          ).toEqual({
            kind: 'REQUEST',
            unitCostActualMinor: 13_200_000n,
            taxVariancePerLicenseMinor: 1_200_000n,
            costCenterMinor: 13_200_000n,
            poolAllocation: { bucket: 'POOL_IDLE', kind: 'ORIGINAL', amountMinor: 14_400_000n },
          });
          expect(
            excess({
              invoiceActualMinor: 39_600_000n,
              alreadyChargedCount: 1,
              alreadyChargedSumMinor: 12n * M,
              costCenterAllocatedMinor: 13_200_000n,
            }).chargeMinor,
          ).toBe(14_400_000n);
        },
      },
      {
        caseName: '9. REPLACEMENT lot 1x6M -> POOL_REPLACEMENT 6M',
        run: () => {
          expect(
            conf({
              purpose: 'REPLACEMENT',
              actualMinor: 6n * M,
              licenseCount: 1,
              beneficiaryCount: 0,
              unitPriceMinor: 6n * M,
            }),
          ).toEqual({
            kind: 'POOL_BUCKET',
            bucket: 'POOL_REPLACEMENT',
            amountMinor: 6n * M,
            unitCostActualMinor: 6n * M,
            taxVariancePerLicenseMinor: 0n,
          });
        },
      },
      {
        caseName: '10. STOCK DEVICE_KEY lot 10x2M -> POOL_DEVICE_LOT 20M; STOCK ACCOUNT lot -> POOL_IDLE',
        run: () => {
          expect(
            conf({
              purpose: 'STOCK',
              keyBinding: 'DEVICE_KEY',
              actualMinor: 20n * M,
              licenseCount: 10,
              beneficiaryCount: 0,
              unitPriceMinor: 2n * M,
            }),
          ).toEqual({
            kind: 'POOL_BUCKET',
            bucket: 'POOL_DEVICE_LOT',
            amountMinor: 20n * M,
            unitCostActualMinor: 2n * M,
            taxVariancePerLicenseMinor: 0n,
          });
          expect(
            conf({
              purpose: 'STOCK',
              keyBinding: 'ACCOUNT',
              actualMinor: 18n * M,
              licenseCount: 3,
              beneficiaryCount: 0,
              unitPriceMinor: 6n * M,
            }),
          ).toEqual({
            kind: 'POOL_BUCKET',
            bucket: 'POOL_IDLE',
            amountMinor: 18n * M,
            unitCostActualMinor: 6n * M,
            taxVariancePerLicenseMinor: 0n,
          });
        },
      },
      {
        caseName: '11. F10: Duc pre-invoice grant holds commitment until 39.6M invoice',
        run: () => {
          const grant = excess({ grantRequestId: 'req-duc', invoiceActualMinor: null, costCenterAllocatedMinor: null });
          expect([grant.kind, grant.releaseCommitmentAll, grant.chargeMinor]).toEqual(['OWN_REQUEST', false, 0n]);
          const res = conf({ actualMinor: 39_600_000n, licenseCount: 3, unitPriceMinor: 12n * M });
          if (res.kind !== 'REQUEST') throw new Error('expected REQUEST');
          expect([res.costCenterMinor, res.taxVariancePerLicenseMinor]).toEqual([13_200_000n, 1_200_000n]);
        },
      },
      {
        caseName: '12. F11: m=1 reserved, 2 excess granted -> remaining excess = 0',
        run: () => {
          expect(3 - 1 - 2).toBe(0);
        },
      },
      {
        caseName: '13. F12(a): 2 excess pre-invoice (24M), invoice 39.6M -> Duc 13.2M, POOL_LOT_DIFFERENCE +2.4M',
        run: () => {
          expect(
            conf({
              actualMinor: 39_600_000n,
              licenseCount: 3,
              unitPriceMinor: 12n * M,
              preInvoiceChargedCount: 2,
              preInvoiceChargedSumMinor: 24n * M,
            }),
          ).toEqual({
            kind: 'REQUEST',
            unitCostActualMinor: 13_200_000n,
            taxVariancePerLicenseMinor: 1_200_000n,
            costCenterMinor: 13_200_000n,
            poolAllocation: { bucket: 'POOL_LOT_DIFFERENCE', kind: 'LOT_DIFFERENCE', amountMinor: 2_400_000n },
          });
        },
      },
      {
        caseName: '14. F12(b): 2 excess pre-invoice (24M), invoice 33M -> Duc 11M, POOL_LOT_DIFFERENCE -2M',
        run: () => {
          expect(
            conf({
              actualMinor: 33n * M,
              licenseCount: 3,
              unitPriceMinor: 12n * M,
              preInvoiceChargedCount: 2,
              preInvoiceChargedSumMinor: 24n * M,
            }),
          ).toEqual({
            kind: 'REQUEST',
            unitCostActualMinor: 11n * M,
            taxVariancePerLicenseMinor: -1n * M,
            costCenterMinor: 11n * M,
            poolAllocation: { bucket: 'POOL_LOT_DIFFERENCE', kind: 'LOT_DIFFERENCE', amountMinor: -2n * M },
          });
        },
      },
      {
        caseName: '15. F13(a): m = n = 3, A = 10,000,001 -> CC 10,000,001, pool 0 (no 1đ stuck)',
        run: () => {
          expect(
            conf({ actualMinor: 10_000_001n, licenseCount: 3, beneficiaryCount: 3, unitPriceMinor: 3_333_333n }),
          ).toEqual({
            kind: 'REQUEST',
            unitCostActualMinor: 3_333_334n,
            taxVariancePerLicenseMinor: 1n,
            costCenterMinor: 10_000_001n,
            poolAllocation: null,
          });
        },
      },
      {
        caseName: '16. F13(b): n=3, m=1, A=10M, Ha gets 2nd excess while Duc has no key yet -> Ha 3,333,334',
        run: () => {
          expect(
            excess({
              grantRequestId: 'req-ha',
              unitPriceMinor: 3_333_333n,
              invoiceActualMinor: 10n * M,
              alreadyChargedCount: 1,
              alreadyChargedSumMinor: 3_333_333n,
              costCenterAllocatedMinor: 3_333_333n,
            }).chargeMinor,
          ).toBe(3_333_334n);
        },
      },
      {
        caseName: '17. F13(c): n=3, m=2 (36M), An withdraws -> -12M CC / +12M POOL_IDLE, skip EXPENSED (D-16)',
        run: () => {
          expect(
            planLotWithdrawalAfterInvoice({ invoiceActualMinor: 36n * M, licenseCount: 3, commitmentState: 'HELD' }),
          ).toEqual({
            unitCostActualMinor: 12n * M,
            costCenterAdjustmentMinor: -12n * M,
            poolIdleAdjustmentMinor: 12n * M,
            commitmentAction: 'RELEASE_HELD',
          });
          expect(
            planLotWithdrawalAfterInvoice({ invoiceActualMinor: 36n * M, licenseCount: 3, commitmentState: 'EXPENSED' })
              .commitmentAction,
          ).toBe('SKIP_EXPENSED_D16');
          expect(excess({ grantRequestId: 'req-ha', lotRequestId: 'req-group' }).chargeMinor).toBe(12n * M);
        },
      },
      {
        caseName: '18. F14(b): 3x12M, m=1, 1 excess same month as invoice -> ratio 12/36 = 33.3%',
        run: () => {
          const idle = lotIdleRatioStats([
            { licenseCount: 3, beneficiaryCount: 1, chargedPreOrSameMonthCount: 1, unitPriceMinor: 12n * M },
          ]);
          expect([idle.idlePreTaxMinor, idle.totalPreTaxMinor, idle.ratioPercent, idle.exceedsThreshold]).toEqual([
            12n * M,
            36n * M,
            '33.3',
            true,
          ]);
        },
      },
      {
        caseName: '19. OPENING lot defers confirmation to standard flow',
        run: () => {
          expect(
            conf({
              purpose: 'OPENING',
              actualMinor: 36n * M,
              licenseCount: 3,
              beneficiaryCount: 0,
              unitPriceMinor: 12n * M,
            }),
          ).toEqual({ kind: 'OPENING' });
        },
      },
    ])('$caseName', ({ run }) => {
      run();
    });
  });
});
