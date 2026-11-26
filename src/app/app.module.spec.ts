import { Test } from '@nestjs/testing';
import {
  CommitmentReleaseGuardHook,
  CommitmentRequestFactsHook,
  PurchaseInvoiceFactsHook,
} from '../modules/budgets/public/budgets.extension-points';
import { SeatBaselinePhaseHook, SeatOccupancyHook } from '../modules/catalog/public/catalog.extension-points';
import { CollectorAllowlistHook } from '../modules/devices/public/devices.extension-points';
import { GrantRequestGateHook, RenewalHoldHook } from '../modules/licensing/public/licensing.extension-points';
import {
  DepartmentCreationWindowHook,
  DepartmentServiceAccountReaderHook,
  EmployeeAccountsHook,
} from '../modules/organization/public/organization.extension-points';
import { AppModule } from './app.module';

describe('AppModule DI graph', () => {
  it('compiles, runs onModuleInit, and binds every required business hook', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    try {
      await moduleRef.init();

      const hooks = [
        moduleRef.get(CommitmentReleaseGuardHook),
        moduleRef.get(CommitmentRequestFactsHook),
        moduleRef.get(PurchaseInvoiceFactsHook),
        moduleRef.get(SeatOccupancyHook),
        moduleRef.get(SeatBaselinePhaseHook),
        moduleRef.get(CollectorAllowlistHook),
        moduleRef.get(GrantRequestGateHook),
        moduleRef.get(RenewalHoldHook),
        moduleRef.get(DepartmentServiceAccountReaderHook),
        moduleRef.get(EmployeeAccountsHook),
        moduleRef.get(DepartmentCreationWindowHook),
      ];
      for (const hook of hooks) {
        expect(hook.isBound()).toBe(true);
      }
    } finally {
      await moduleRef.close();
    }
  });
});
