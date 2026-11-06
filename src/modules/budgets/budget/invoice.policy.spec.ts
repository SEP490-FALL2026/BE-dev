import { planInvoice, type InvoiceCommitment, type InvoiceFigures } from './invoice.policy';

const commitment = (over: Partial<InvoiceCommitment> = {}): InvoiceCommitment => ({
  amountMinor: 20_000n,
  releasedMinor: 0n,
  appliedMinor: 0n,
  state: 'HELD',
  ...over,
});
const figures = (over: Partial<InvoiceFigures> = {}): InvoiceFigures => ({
  netMinor: 12_000n,
  deductibleTaxMinor: 0n,
  nonDeductibleTaxMinor: 0n,
  ...over,
});

describe('planInvoice: what an invoice does to the commitment it is recorded against', () => {
  describe('the cost and what the commitment gives up (US-06-06 AC-1, AC-5; QĐ-97d)', () => {
    it('costs the price before tax plus the tax that cannot be deducted, and takes the commitment down by the price before tax', () => {
      const plan = planInvoice(commitment(), 0n, figures({ netMinor: 12_000n, nonDeductibleTaxMinor: 600n }));

      expect(plan).toMatchObject({
        ok: true,
        actualCostMinor: 12_600n,
        takeMinor: 12_000n,
        appliedAfterMinor: 12_000n,
        heldAfterMinor: 8_000n,
        stateAfter: 'HELD',
      });
    });

    it('does not count the tax that can be deducted as a cost, and does not take the commitment down by it', () => {
      const plan = planInvoice(commitment(), 0n, figures({ netMinor: 10_000n, deductibleTaxMinor: 1_000n }));

      expect(plan).toMatchObject({ ok: true, actualCostMinor: 10_000n, takeMinor: 10_000n, heldAfterMinor: 10_000n });
    });

    it('takes down only what is still held when the price is more, and all of the price is still an expense (QĐ-34b)', () => {
      const plan = planInvoice(commitment({ appliedMinor: 15_000n }), 15_000n, figures({ netMinor: 9_000n }));

      expect(plan).toMatchObject({
        ok: true,
        actualCostMinor: 9_000n,
        takeMinor: 5_000n,
        appliedAfterMinor: 20_000n,
        heldAfterMinor: 0n,
        stateAfter: 'EXPENSED',
      });
    });

    it('makes the commitment an expense when nothing is left held', () => {
      const plan = planInvoice(commitment(), 0n, figures({ netMinor: 20_000n }));

      expect(plan).toMatchObject({ ok: true, takeMinor: 20_000n, heldAfterMinor: 0n, stateAfter: 'EXPENSED' });
    });

    it('takes nothing down from a commitment that is already an expense, and the invoice is still recorded in full', () => {
      const plan = planInvoice(
        commitment({ state: 'EXPENSED', appliedMinor: 20_000n }),
        20_000n,
        figures({ netMinor: 500n, nonDeductibleTaxMinor: 50n }),
      );

      expect(plan).toMatchObject({
        ok: true,
        actualCostMinor: 550n,
        takeMinor: 0n,
        appliedAfterMinor: 20_000n,
        stateAfter: 'EXPENSED',
      });
    });

    it('does not count what went back to the budget as held', () => {
      const plan = planInvoice(commitment({ releasedMinor: 8_000n }), 0n, figures({ netMinor: 12_000n }));

      expect(plan).toMatchObject({ ok: true, takeMinor: 12_000n, heldAfterMinor: 0n, stateAfter: 'EXPENSED' });
    });
  });

  describe('how it matches what the commitment allowed (US-12-02 AC-5, AC-6)', () => {
    it('matches an invoice that is exactly what the commitment allows, and flags one more by a unit', () => {
      expect(planInvoice(commitment(), 0n, figures({ netMinor: 20_000n }))).toMatchObject({ matchResult: 'MATCHED' });
      expect(planInvoice(commitment(), 0n, figures({ netMinor: 20_001n }))).toMatchObject({
        matchResult: 'PRICE_QUANTITY_EXCEPTION',
      });
    });

    it('measures the allowance as the amount less what went back to the budget', () => {
      const released = commitment({ releasedMinor: 5_000n });

      expect(planInvoice(released, 0n, figures({ netMinor: 15_000n }))).toMatchObject({ matchResult: 'MATCHED' });
      expect(planInvoice(released, 0n, figures({ netMinor: 15_001n }))).toMatchObject({
        matchResult: 'PRICE_QUANTITY_EXCEPTION',
      });
    });

    it('adds up what was recorded before, so that the second invoice that goes over is the one flagged', () => {
      const after = commitment({ appliedMinor: 12_000n });

      expect(planInvoice(after, 12_000n, figures({ netMinor: 8_000n }))).toMatchObject({ matchResult: 'MATCHED' });
      expect(planInvoice(after, 12_000n, figures({ netMinor: 8_001n }))).toMatchObject({
        matchResult: 'PRICE_QUANTITY_EXCEPTION',
      });
    });

    it('says only the tax differs when the price fits and there is tax of either kind, and does not flag it', () => {
      expect(planInvoice(commitment(), 0n, figures({ deductibleTaxMinor: 1n }))).toMatchObject({
        matchResult: 'TAX_ONLY',
      });
      expect(planInvoice(commitment(), 0n, figures({ nonDeductibleTaxMinor: 1n }))).toMatchObject({
        matchResult: 'TAX_ONLY',
      });
      expect(planInvoice(commitment(), 0n, figures({ netMinor: 20_000n, nonDeductibleTaxMinor: 1n }))).toMatchObject({
        matchResult: 'TAX_ONLY',
      });
    });

    it('flags an invoice that goes over even when it has tax', () => {
      const plan = planInvoice(commitment(), 0n, figures({ netMinor: 20_001n, deductibleTaxMinor: 100n }));

      expect(plan).toMatchObject({ matchResult: 'PRICE_QUANTITY_EXCEPTION' });
    });
  });

  describe('what refuses it', () => {
    it('refuses a commitment that was released and so is not approved spend any more', () => {
      const plan = planInvoice(commitment({ state: 'RELEASED', releasedMinor: 20_000n }), 0n, figures());

      expect(plan).toEqual({ ok: false, refusal: 'COMMITMENT_RELEASED' });
    });

    it('refuses a price that is not more than nothing', () => {
      expect(planInvoice(commitment(), 0n, figures({ netMinor: 0n }))).toEqual({
        ok: false,
        refusal: 'AMOUNT_NOT_POSITIVE',
      });
      expect(planInvoice(commitment(), 0n, figures({ netMinor: -1n }))).toEqual({
        ok: false,
        refusal: 'AMOUNT_NOT_POSITIVE',
      });
    });

    it('refuses tax below nothing', () => {
      expect(planInvoice(commitment(), 0n, figures({ deductibleTaxMinor: -1n }))).toEqual({
        ok: false,
        refusal: 'AMOUNT_NOT_POSITIVE',
      });
      expect(planInvoice(commitment(), 0n, figures({ nonDeductibleTaxMinor: -1n }))).toEqual({
        ok: false,
        refusal: 'AMOUNT_NOT_POSITIVE',
      });
    });

    it('never refuses an invoice for being over the budget: the commitment is not the budget (C-08)', () => {
      const plan = planInvoice(commitment(), 0n, figures({ netMinor: 900_000_000n }));

      expect(plan).toMatchObject({ ok: true, matchResult: 'PRICE_QUANTITY_EXCEPTION', stateAfter: 'EXPENSED' });
    });
  });
});
