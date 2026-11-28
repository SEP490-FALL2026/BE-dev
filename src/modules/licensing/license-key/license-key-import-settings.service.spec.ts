import { HttpException, HttpStatus } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogPlanTermsApi } from '../../catalog/public/catalog-plan-terms.api';
import type { SeatBaselineService } from '../seat-baseline/seat-baseline.service';
import { LicenseKeyInitializationClosedError } from './license-key.errors';
import { toLicenseKeyApiException } from './license-key.http-errors';
import { MAX_ACTIVATIONS_LIMIT } from './license-key.policy';
import { LicenseKeyImportSettingsService } from './license-key-import-settings.service';

describe('LicenseKeyImportSettingsService', () => {
  const tx = { tag: 'tx' } as unknown as DbTx;

  function setup(options: { initializationOpen?: boolean; installLimit?: number | null } = {}) {
    const baseline = {
      holdInitializationOpen: jest.fn().mockResolvedValue(options.initializationOpen ?? true),
    } as unknown as SeatBaselineService;
    const planTerms = {
      installLimitOf: jest.fn().mockResolvedValue(options.installLimit ?? null),
    } as unknown as CatalogPlanTermsApi;

    const service = new LicenseKeyImportSettingsService(baseline, planTerms);

    return { service, baseline, planTerms };
  }

  describe('initialActivationsUsed', () => {
    it('returns 0 without locking the baseline when undefined or 0 is told', async () => {
      const { service, baseline } = setup({ initializationOpen: false });

      await expect(service.initialActivationsUsed(tx, undefined)).resolves.toBe(0);
      await expect(service.initialActivationsUsed(tx, 0)).resolves.toBe(0);
      expect(
        (baseline as unknown as { holdInitializationOpen: jest.Mock }).holdInitializationOpen,
      ).not.toHaveBeenCalled();
    });

    it('returns the told count when > 0 and the installation phase is open', async () => {
      const { service, baseline } = setup({ initializationOpen: true });

      await expect(service.initialActivationsUsed(tx, 3)).resolves.toBe(3);
      expect(
        (baseline as unknown as { holdInitializationOpen: jest.Mock }).holdInitializationOpen,
      ).toHaveBeenCalledWith(tx);
    });

    it('throws LicenseKeyInitializationClosedError (409 LICENSE_KEY.INITIALIZATION_CLOSED) when > 0 after installation closes', async () => {
      const { service } = setup({ initializationOpen: false });

      let caught: unknown;
      try {
        await service.initialActivationsUsed(tx, 2);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(LicenseKeyInitializationClosedError);
      const mapped = toLicenseKeyApiException(caught) as HttpException;
      expect(mapped).toBeInstanceOf(HttpException);
      expect(mapped.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(mapped.getResponse()).toMatchObject({ code: 'LICENSE_KEY.INITIALIZATION_CLOSED' });
    });
  });

  describe('maxActivations', () => {
    it('uses the named cap directly without reading plan terms', async () => {
      const { service, planTerms } = setup({ installLimit: 10 });

      await expect(service.maxActivations(tx, 'plan-1', 25)).resolves.toBe(25);
      expect((planTerms as unknown as { installLimitOf: jest.Mock }).installLimitOf).not.toHaveBeenCalled();
    });

    it('falls back to the plan install limit (capped at MAX_ACTIVATIONS_LIMIT) and then to 1', async () => {
      const withLimit = setup({ installLimit: 5 });
      await expect(withLimit.service.maxActivations(tx, 'plan-1', undefined)).resolves.toBe(5);
      expect((withLimit.planTerms as unknown as { installLimitOf: jest.Mock }).installLimitOf).toHaveBeenCalledWith(
        'plan-1',
        tx,
      );

      const aboveMax = setup({ installLimit: MAX_ACTIVATIONS_LIMIT + 50 });
      await expect(aboveMax.service.maxActivations(tx, 'plan-1', undefined)).resolves.toBe(MAX_ACTIVATIONS_LIMIT);

      const noLimit = setup({ installLimit: null });
      await expect(noLimit.service.maxActivations(tx, 'plan-1', undefined)).resolves.toBe(1);
    });
  });
});
