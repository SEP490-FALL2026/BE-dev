import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { SeatTarget } from '../../catalog/public/catalog.types';
import type { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import type { LicensingApi } from '../../licensing/public/licensing.api';
import type { HeldSoftware } from '../../licensing/public/licensing.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DeviceNotFoundError } from '../public/devices.errors';
import type { DeviceSummaryRow, HeldDeviceSummary, RegistryQueryRepo } from '../registry/registry-query.repo';
import { ActivationQueryService } from './activation-query.service';

type ActivationRecord = Awaited<ReturnType<LicensingDeviceActivationApi['open']>>['activation'];

describe('ActivationQueryService', () => {
  const orgId = 'org-1';
  const today = '2026-11-24';

  function makeDeviceRow(over: Partial<DeviceSummaryRow> = {}): DeviceSummaryRow {
    return {
      id: 'dev-1',
      assetCode: 'LAP-26-0004',
      deviceType: 'LAP',
      serialNumber: 'SN-001',
      assetCodeOrigin: 'GENERATED',
      hostname: 'LAP-AN-04',
      os: 'Windows 11',
      condition: 'USABLE',
      retirementKind: null,
      retiredAt: null,
      voidedAt: null,
      updatedAt: new Date('2026-11-24T08:00:00.000Z'),
      registrationId: 'reg-1',
      holderEmployeeId: 'emp-an',
      validFrom: new Date('2026-11-01T00:00:00.000Z'),
      acknowledgedFrom: null,
      collectionStoppedAt: null,
      collectorInstalled: true,
      hasOpenReturnTask: false,
      signatureRecorded: false,
      lastAcceptedAt: null,
      ...over,
    };
  }

  function makeActivation(over: Partial<ActivationRecord> = {}): ActivationRecord {
    return {
      id: 'act-1',
      organizationId: orgId,
      deviceId: 'dev-1',
      planId: 'plan-1',
      licenseKeyId: 'key-1',
      subscriptionId: 'sub-1',
      keyMasked: '****-1234',
      keyWithdrawn: false,
      origin: 'OPERATION',
      movedFromActivationId: null,
      activatedOn: '2026-11-10',
      activatedAt: new Date('2026-11-10T09:00:00.000Z'),
      activatedByAppUserId: 'user-it-1',
      overActivationCap: false,
      deactivatedOn: null,
      deactivatedAt: null,
      endCause: null,
      licenseReleased: null,
      closedByAppUserId: null,
      ...over,
    };
  }

  function makePlan(over: Partial<SeatTarget> = {}): SeatTarget {
    return {
      planId: 'plan-1',
      planName: 'AutoCAD Pro',
      applicationId: 'app-1',
      applicationName: 'AutoCAD',
      applicationKind: 'LICENSED',
      provisioningType: 'K4',
      keyBinding: 'DEVICE_KEY',
      ...over,
    } as SeatTarget;
  }

  function setup(
    options: {
      device?: DeviceSummaryRow | null;
      employee?: { id: string; employeeCode: string; fullName: string } | null;
      heldSoftware?: { items: HeldSoftware[]; total: number };
      heldDevices?: HeldDeviceSummary[];
      activationsPage?: { items: ActivationRecord[]; total: number };
      planTargets?: SeatTarget[];
    } = {},
  ) {
    const deviceActivations = {
      page: jest.fn().mockResolvedValue(options.activationsPage ?? { items: [], total: 0 }),
    };
    const licensing = {
      pageHeldSoftwareOf: jest.fn().mockResolvedValue(options.heldSoftware ?? { items: [], total: 0 }),
    };
    const registryQueries = {
      one: jest.fn().mockResolvedValue(options.device === undefined ? makeDeviceRow() : options.device),
      findHeldDevicesByHolder: jest.fn().mockResolvedValue(options.heldDevices ?? []),
      findDeviceIdsByIdle: jest.fn().mockResolvedValue([]),
      findDeviceSummariesByIds: jest.fn().mockResolvedValue(new Map()),
    };
    const catalog = {
      findPlanSeatTargets: jest.fn().mockResolvedValue(options.planTargets ?? []),
    };
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: orgId }),
      businessToday: jest.fn().mockResolvedValue(today),
      getEmployee: jest
        .fn()
        .mockResolvedValue(
          options.employee === undefined
            ? { id: 'emp-an', employeeCode: 'EMP-001', fullName: 'Nguyen Van An' }
            : options.employee,
        ),
    };

    const service = new ActivationQueryService(
      deviceActivations as unknown as LicensingDeviceActivationApi,
      licensing as unknown as LicensingApi,
      registryQueries as unknown as RegistryQueryRepo,
      catalog as unknown as CatalogApi,
      organizationReads as unknown as OrganizationReadApi,
    );

    return { service, deviceActivations, licensing, registryQueries, catalog, organizationReads };
  }

  describe('holderSoftware', () => {
    it('returns holder summary, paged account-bound software, and pagination for an assigned device', async () => {
      const heldItems: HeldSoftware[] = [
        {
          assignmentId: 'asg-1',
          applicationName: 'Figma',
          planName: 'Figma Professional',
          grantedOn: '2026-10-01',
          endsOn: null,
        },
        {
          assignmentId: 'asg-2',
          applicationName: 'Microsoft Office',
          planName: 'Office 365 Business',
          grantedOn: '2026-10-15',
          endsOn: '2027-10-15',
        },
      ];
      const ctx = setup({
        device: makeDeviceRow({ id: 'dev-4', holderEmployeeId: 'emp-an' }),
        employee: { id: 'emp-an', employeeCode: 'NV-001', fullName: 'Nguyen Van An' },
        heldSoftware: { items: heldItems, total: 5 },
      });

      const result = await ctx.service.holderSoftware('dev-4', { page: 2, pageSize: 2 });

      expect(ctx.registryQueries.one).toHaveBeenCalledWith(orgId, 'dev-4');
      expect(ctx.organizationReads.businessToday).toHaveBeenCalledTimes(1);
      expect(ctx.organizationReads.getEmployee).toHaveBeenCalledWith('emp-an');
      expect(ctx.licensing.pageHeldSoftwareOf).toHaveBeenCalledWith('emp-an', today, { skip: 2, take: 2 });
      expect(result).toEqual({
        holder: {
          id: 'emp-an',
          employeeCode: 'NV-001',
          fullName: 'Nguyen Van An',
        },
        items: heldItems,
        pagination: {
          page: 2,
          pageSize: 2,
          totalItems: 5,
          totalPages: 3,
        },
      });
    });

    it('returns null holder and empty page without querying licensing when the device is in stock', async () => {
      const ctx = setup({
        device: makeDeviceRow({ id: 'dev-stock', registrationId: null, holderEmployeeId: null }),
      });

      const result = await ctx.service.holderSoftware('dev-stock', { page: 1, pageSize: 20 });

      expect(ctx.organizationReads.getEmployee).not.toHaveBeenCalled();
      expect(ctx.licensing.pageHeldSoftwareOf).not.toHaveBeenCalled();
      expect(result).toEqual({
        holder: null,
        items: [],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
        },
      });
    });

    it('throws DeviceNotFoundError when the device does not exist in the organization', async () => {
      const ctx = setup({ device: null });

      await expect(ctx.service.holderSoftware('missing-dev', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(
        DeviceNotFoundError,
      );
      expect(ctx.licensing.pageHeldSoftwareOf).not.toHaveBeenCalled();
    });
  });

  describe('meDeviceSoftware', () => {
    it('returns open activations on the caller held devices with exact shape and batch-enriched plans', async () => {
      const heldDevices: HeldDeviceSummary[] = [
        { id: 'dev-1', assetCode: 'LAP-26-0004', hostname: 'LAP-AN-04' },
        { id: 'dev-2', assetCode: 'LAP-26-0005', hostname: 'LAP-AN-05' },
      ];
      const act1 = makeActivation({
        id: 'act-1',
        deviceId: 'dev-1',
        planId: 'plan-win',
        licenseKeyId: null,
        subscriptionId: null,
        keyMasked: null,
        activatedOn: '2026-11-01',
      });
      const act2 = makeActivation({
        id: 'act-2',
        deviceId: 'dev-2',
        planId: 'plan-cad',
        licenseKeyId: 'key-cad',
        activatedOn: '2026-11-12',
      });
      const ctx = setup({
        heldDevices,
        activationsPage: { items: [act1, act2], total: 5 },
        planTargets: [
          makePlan({
            planId: 'plan-win',
            planName: 'Windows 11 OEM',
            applicationId: 'app-win',
            applicationName: 'Windows',
            keyBinding: 'DEVICE_BUNDLED',
          }),
          makePlan({
            planId: 'plan-cad',
            planName: 'AutoCAD Pro',
            applicationId: 'app-cad',
            applicationName: 'AutoCAD',
            keyBinding: 'DEVICE_KEY',
          }),
        ],
      });

      const result = await ctx.service.meDeviceSoftware('emp-an', { page: 2, pageSize: 2 });

      expect(ctx.registryQueries.findHeldDevicesByHolder).toHaveBeenCalledWith(orgId, 'emp-an');
      expect(ctx.deviceActivations.page).toHaveBeenCalledWith(
        {
          organizationId: orgId,
          deviceIds: ['dev-1', 'dev-2'],
          state: 'OPEN',
        },
        { skip: 2, take: 2 },
      );
      expect(ctx.catalog.findPlanSeatTargets).toHaveBeenCalledWith(['plan-win', 'plan-cad']);
      expect(result).toEqual({
        items: [
          {
            activationId: 'act-1',
            device: { id: 'dev-1', assetCode: 'LAP-26-0004', hostname: 'LAP-AN-04' },
            plan: { id: 'plan-win', name: 'Windows 11 OEM', keyBinding: 'DEVICE_BUNDLED' },
            application: { id: 'app-win', name: 'Windows' },
            activatedOn: '2026-11-01',
          },
          {
            activationId: 'act-2',
            device: { id: 'dev-2', assetCode: 'LAP-26-0005', hostname: 'LAP-AN-05' },
            plan: { id: 'plan-cad', name: 'AutoCAD Pro', keyBinding: 'DEVICE_KEY' },
            application: { id: 'app-cad', name: 'AutoCAD' },
            activatedOn: '2026-11-12',
          },
        ],
        pagination: {
          page: 2,
          pageSize: 2,
          totalItems: 5,
          totalPages: 3,
        },
      });
    });

    it('returns an empty page without querying licensing or catalog when caller holds no devices', async () => {
      const ctx = setup({ heldDevices: [] });

      const result = await ctx.service.meDeviceSoftware('emp-binh', { page: 1, pageSize: 20 });

      expect(ctx.registryQueries.findHeldDevicesByHolder).toHaveBeenCalledWith(orgId, 'emp-binh');
      expect(ctx.deviceActivations.page).not.toHaveBeenCalled();
      expect(ctx.catalog.findPlanSeatTargets).not.toHaveBeenCalled();
      expect(result).toEqual({
        items: [],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
        },
      });
    });

    it('returns an empty page without querying catalog when held devices have no open activations', async () => {
      const ctx = setup({
        heldDevices: [{ id: 'dev-1', assetCode: 'LAP-26-0004', hostname: 'LAP-AN-04' }],
        activationsPage: { items: [], total: 0 },
      });

      const result = await ctx.service.meDeviceSoftware('emp-an', { page: 1, pageSize: 20 });

      expect(ctx.deviceActivations.page).toHaveBeenCalledTimes(1);
      expect(ctx.catalog.findPlanSeatTargets).not.toHaveBeenCalled();
      expect(result).toEqual({
        items: [],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
        },
      });
    });
  });
});
