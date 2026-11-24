import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { OrganizationApi } from '../../organization/public/organization.api';
import type { CredentialRevocationService } from '../credential/credential-revocation.service';
import { RegistrationEndService } from './registration-end.service';
import type { RegistrationRecord, RegistryRepo } from './registry.repo';

describe('RegistrationEndService', () => {
  const tx = {} as DbTx;
  const at = new Date('2026-11-24T10:00:00Z');
  const reg = (overrides: Partial<RegistrationRecord> = {}): RegistrationRecord => ({
    id: 'reg-1',
    organizationId: 'org-1',
    deviceId: 'dev-1',
    holderEmployeeId: 'emp-old',
    validFrom: '2026-10-01',
    validUntil: null,
    endedAt: null,
    endCause: null,
    collectorInstalled: true,
    acknowledgedFrom: null,
    collectionStoppedAt: null,
    ...overrides,
  });

  function setup(openRegs: RegistrationRecord[] = [reg()]) {
    const endRegistration = jest.fn().mockResolvedValue(undefined);
    const invalidateOpenStopRequests = jest.fn().mockResolvedValue(undefined);
    const lockOpenRegistrationsOfHolder = jest.fn().mockResolvedValue(openRegs);
    const repo = {
      endRegistration,
      invalidateOpenStopRequests,
      lockOpenRegistrationsOfHolder,
    } as unknown as RegistryRepo;
    const revokeAllOfRegistration = jest.fn().mockResolvedValue(undefined);
    const credentials = { revokeAllOfRegistration } as unknown as CredentialRevocationService;
    const endUnplacedWorkDesignations = jest.fn().mockResolvedValue(0);
    const organization = { endUnplacedWorkDesignations } as unknown as OrganizationApi;
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1', timeZone: 'Asia/Ho_Chi_Minh' }),
    } as unknown as OrganizationReadApi;
    const record = jest.fn().mockResolvedValue(undefined);
    const audit = { record } as unknown as AuditApi;

    const service = new RegistrationEndService(repo, credentials, organization, organizationReads, audit);

    return {
      service,
      endRegistration,
      invalidateOpenStopRequests,
      endUnplacedWorkDesignations,
      revokeAllOfRegistration,
      record,
    };
  }

  it('closes only the ending holder unplaced DEVICE designations so an incoming unplaced recipient designation stays active', async () => {
    const {
      service,
      endRegistration,
      endUnplacedWorkDesignations,
      invalidateOpenStopRequests,
      revokeAllOfRegistration,
    } = setup();

    await service.end(
      tx,
      reg({ deviceId: 'dev-1', holderEmployeeId: 'emp-old' }),
      { at, cause: 'HOLDER_CHANGED', softwareRemoval: { outcome: 'REMOVED', note: null } },
      {
        kind: 'USER',
        principal: {
          appUserId: 'app-user-1',
          employeeId: 'it-1',
          sessionId: 'sess-1',
          subject: 'app-user-1',
          roles: ['IT_ADMIN'],
          directRoles: ['IT_ADMIN'],
        },
      },
    );

    expect(endRegistration).toHaveBeenCalledWith(tx, 'reg-1', {
      endedAt: at,
      validUntil: '2026-11-24',
      cause: 'HOLDER_CHANGED',
      softwareRemoval: { outcome: 'REMOVED', note: null },
    });
    expect(endUnplacedWorkDesignations).toHaveBeenCalledWith(tx, {
      workKind: 'DEVICE',
      workId: 'dev-1',
      employeeId: 'emp-old',
      endedByAppUserId: 'app-user-1',
      endedAt: at,
    });
    expect(invalidateOpenStopRequests).toHaveBeenCalledWith(tx, 'reg-1', at);
    expect(revokeAllOfRegistration).toHaveBeenCalledWith(
      tx,
      { organizationId: 'org-1', registrationId: 'reg-1', at },
      expect.objectContaining({ kind: 'USER' }),
    );
  });

  it('ends every open registration of a holder with SYSTEM actor and holder employeeId filter', async () => {
    const { service, endUnplacedWorkDesignations } = setup([
      reg({ id: 'reg-1', deviceId: 'dev-1', holderEmployeeId: 'emp-old' }),
      reg({ id: 'reg-2', deviceId: 'dev-2', holderEmployeeId: 'emp-old' }),
    ]);

    const ids = await service.endForHolder(tx, { employeeId: 'emp-old', at, cause: 'EMPLOYEE_LEFT' });

    expect(ids).toEqual(['reg-1', 'reg-2']);
    expect(endUnplacedWorkDesignations).toHaveBeenNthCalledWith(1, tx, {
      workKind: 'DEVICE',
      workId: 'dev-1',
      employeeId: 'emp-old',
      endedByAppUserId: null,
      endedAt: at,
    });
    expect(endUnplacedWorkDesignations).toHaveBeenNthCalledWith(2, tx, {
      workKind: 'DEVICE',
      workId: 'dev-2',
      employeeId: 'emp-old',
      endedByAppUserId: null,
      endedAt: at,
    });
  });
});
