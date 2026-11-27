import { Test } from '@nestjs/testing';
import {
  CarriedOverContributions,
  CommitmentReleaseGuardHook,
  CommitmentRequestFactsHook,
  PendingSpendContributions,
  PurchaseInvoiceFactsHook,
} from '../modules/budgets/public/budgets.extension-points';
import { SeatBaselinePhaseHook, SeatOccupancyHook } from '../modules/catalog/public/catalog.extension-points';
import { CollectorAllowlistHook } from '../modules/devices/public/devices.extension-points';
import {
  ApprovalRoleChangeListeners,
  PendingPolicyAcknowledgements,
  SpendingApproverGrantChecks,
} from '../modules/identity-access/public/identity-access.extension-points';
import {
  GrantRequestGateHook,
  RenewalHoldHook,
  RevocationListeners,
} from '../modules/licensing/public/licensing.extension-points';
import { NotificationNameContributions } from '../modules/notifications/public/notifications.extension-points';
import {
  CostCenterUseContributions,
  DepartmentCreationWindowHook,
  DepartmentServiceAccountReaderHook,
  DepartmentUseContributions,
  EmployeeAccountsHook,
  FirstPlacementUseContributions,
  OrganizationChangeListeners,
} from '../modules/organization/public/organization.extension-points';
import {
  NoticeRecorderContributions,
  OffboardingWarningContributions,
  PersonnelFileHookContributions,
} from '../modules/personnel/public/personnel.extension-points';
import { ImportTemplateContributions } from '../modules/policies/public/policies.extension-points';
import {
  InvoiceDiscrepancyReferralListeners,
  RequestOutcomeListeners,
  TransferGraceHoldContributions,
} from '../modules/requests/public/requests.extension-points';
import { UsageImportListeners } from '../modules/usage/public/usage.extension-points';
import { AppModule } from './app.module';

describe('AppModule DI graph', () => {
  it('compiles, runs onModuleInit, and binds every required business hook and contribution/listener point', async () => {
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

      const registries = [
        moduleRef.get(PendingSpendContributions),
        moduleRef.get(CarriedOverContributions),
        moduleRef.get(ApprovalRoleChangeListeners),
        moduleRef.get(SpendingApproverGrantChecks),
        moduleRef.get(PendingPolicyAcknowledgements),
        moduleRef.get(RevocationListeners),
        moduleRef.get(NotificationNameContributions),
        moduleRef.get(OrganizationChangeListeners),
        moduleRef.get(DepartmentUseContributions),
        moduleRef.get(CostCenterUseContributions),
        moduleRef.get(FirstPlacementUseContributions),
        moduleRef.get(PersonnelFileHookContributions),
        moduleRef.get(OffboardingWarningContributions),
        moduleRef.get(NoticeRecorderContributions),
        moduleRef.get(ImportTemplateContributions),
        moduleRef.get(TransferGraceHoldContributions),
        moduleRef.get(InvoiceDiscrepancyReferralListeners),
        moduleRef.get(UsageImportListeners),
      ];
      for (const registry of registries) {
        expect(registry.names().length).toBeGreaterThan(0);
      }
      // RequestOutcomeListeners is exported for Personnel/Catalog subscribers when attached; currently 0 listeners register.
      expect(moduleRef.get(RequestOutcomeListeners).names()).toEqual([]);
    } finally {
      await moduleRef.close();
    }
  });
});
