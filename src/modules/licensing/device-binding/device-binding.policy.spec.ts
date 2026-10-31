import { DeviceRegistryContractDouble } from '../../../../test/support/device-registry-contract-double';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  checkBinding,
  judgeInstallLimit,
  judgeKeyBinding,
  releaseKeyOnRevocation,
  type KeyBindingFacts,
} from './device-binding.policy';
import type { DeviceLookup, KeyFacts } from './device-binding.types';

/*
 * CONTRACT TEST WITH A MOCK, NOT INTEGRATION. The device register (`US-09-01`) belongs to the Owner and does not exist in this
 * code base; these tests run the rules of binding a K4 key against `DeviceRegistryContractDouble`, an in-memory stand-in written
 * from the port alone. They do not prove that K4 works with the real register: that needs the register, its adapter and
 * integration tests on PostgreSQL (items `a05-k4-key-grant-by-device`, `a05-k4-device-install-limit`,
 * `a05-k4-device-revocation`).
 */

const ORG = 'org-1';
const TX = {} as DbTx;
const E1 = 'employee-e1';
const E2 = 'employee-e2';

function registry(): DeviceRegistryContractDouble {
  return new DeviceRegistryContractDouble(ORG)
    .register({ deviceId: 'dev-d1', assetTag: 'LAP-114', hostName: 'DES-LT-07', employeeId: E1, from: '2026-09-01' })
    .register({ deviceId: 'dev-d2', assetTag: 'LAP-120', hostName: 'DES-LT-09', employeeId: E1, from: '2026-09-01' })
    .register({ deviceId: 'dev-d9', assetTag: 'LAP-300', hostName: 'FIN-LT-01', employeeId: E2, from: '2026-09-01' });
}

const inStore = (id = 'key-07'): KeyFacts => ({ id, status: 'IN_STORE', assignmentId: null, installations: [] });

const heldBy = (assignmentId: string, ...deviceIds: string[]): KeyFacts => ({
  id: 'key-07',
  status: 'ASSIGNED',
  assignmentId,
  installations: deviceIds.map((deviceId) => ({ deviceId, boundOn: '2026-09-10' })),
});

/** Asks the stand-in under the lock of the binding, as the grant will, then judges. */
async function bind(
  port: DeviceRegistryContractDouble | null,
  overrides: Partial<Omit<KeyBindingFacts, 'device'>> = {},
  on = '2026-10-01',
) {
  const deviceId = overrides.deviceId ?? 'dev-d1';
  const device: DeviceLookup | null = port
    ? await port.lockDeviceForBinding(TX, { organizationId: ORG, deviceId, on })
    : null;

  return judgeKeyBinding({
    actorRoles: ['IT_ADMIN'],
    provisioningType: 'K4',
    assignment: { id: 'assignment-e1', employeeId: E1, open: true },
    key: inStore(),
    requireAcknowledgement: false,
    ...overrides,
    deviceId,
    device,
  });
}

describe('K4 key binding against the device register port — contract test with mock, NOT integration', () => {
  describe('a valid company device', () => {
    // US-07-01 AC-10, US-04-12 AC-5 (vế thiết bị hợp lệ)
    it('takes the key out of the store for the assignment on a device the person holds', async () => {
      const port = registry();

      await expect(bind(port)).resolves.toEqual({ allowed: true, effect: 'TAKE_FROM_STORE' });
      expect(port.calls).toEqual([{ method: 'lockDeviceForBinding', deviceId: 'dev-d1', locked: true }]);
    });

    it('adds a second device of the same person to a key the assignment already holds', async () => {
      await expect(bind(registry(), { key: heldBy('assignment-e1', 'dev-d1'), deviceId: 'dev-d2' })).resolves.toEqual({
        allowed: true,
        effect: 'ADD_INSTALLATION',
      });
    });
  });

  describe('a device that may not take the key', () => {
    // US-04-12 AC-5 (máy cá nhân), US-07-01 AC-10 (thiết bị không đăng ký)
    it('refuses a machine the register does not know, such as a personal laptop', async () => {
      await expect(bind(registry(), { deviceId: 'personal-laptop' })).resolves.toEqual({
        allowed: false,
        refusal: 'DEVICE_NOT_REGISTERED',
      });
    });

    it('refuses a device registered to someone else', async () => {
      await expect(bind(registry(), { deviceId: 'dev-d9' })).resolves.toEqual({
        allowed: false,
        refusal: 'DEVICE_HELD_BY_OTHER_PERSON',
      });
    });

    it('refuses a device handed over to someone else before the day of the binding (US-09-01 AC-10)', async () => {
      const port = registry().handOver('dev-d1', E2, '2026-09-15');

      await expect(bind(port, {}, '2026-09-16')).resolves.toEqual({
        allowed: false,
        refusal: 'DEVICE_HELD_BY_OTHER_PERSON',
      });
      await expect(bind(port, {}, '2026-09-14')).resolves.toEqual({ allowed: true, effect: 'TAKE_FROM_STORE' });
    });

    it('refuses a registration that has ended or has not started yet', async () => {
      const ended = registry().end('dev-d1', '2026-09-20');
      const future = new DeviceRegistryContractDouble(ORG).register({
        deviceId: 'dev-d1',
        assetTag: 'LAP-114',
        hostName: 'DES-LT-07',
        employeeId: E1,
        from: '2026-11-01',
      });

      for (const port of [ended, future]) {
        await expect(bind(port)).resolves.toEqual({ allowed: false, refusal: 'DEVICE_REGISTRATION_NOT_ACTIVE' });
      }
    });

    it('binds an unacknowledged device by default and refuses it only when acknowledgement is required', async () => {
      const port = registry();

      await expect(bind(port)).resolves.toEqual({ allowed: true, effect: 'TAKE_FROM_STORE' });
      await expect(bind(port, { requireAcknowledgement: true })).resolves.toEqual({
        allowed: false,
        refusal: 'DEVICE_NOT_ACKNOWLEDGED',
      });
      port.acknowledge('dev-d1');
      await expect(bind(port, { requireAcknowledgement: true })).resolves.toEqual({
        allowed: true,
        effect: 'TAKE_FROM_STORE',
      });
    });
  });

  describe('the key and the assignment', () => {
    // US-04-12 AC-5 (một khóa một Assignment), AC-6 và US-07-01 AC-10 (kho hết khóa)
    it('refuses a key held by another assignment, an empty store and a retired key', async () => {
      const port = registry();

      await expect(bind(port, { key: heldBy('assignment-e2', 'dev-d9') })).resolves.toEqual({
        allowed: false,
        refusal: 'KEY_HELD_BY_OTHER_ASSIGNMENT',
      });
      await expect(bind(port, { key: null })).resolves.toEqual({ allowed: false, refusal: 'NO_KEY_IN_STORE' });
      await expect(bind(port, { key: { ...inStore(), status: 'RETIRED' } })).resolves.toEqual({
        allowed: false,
        refusal: 'KEY_RETIRED',
      });
    });

    it('refuses a plan that is not K4 and an assignment that no longer holds its seat', async () => {
      const port = registry();

      await expect(bind(port, { provisioningType: 'K2' })).resolves.toEqual({ allowed: false, refusal: 'PLAN_NOT_K4' });
      await expect(bind(port, { assignment: { id: 'assignment-e1', employeeId: E1, open: false } })).resolves.toEqual({
        allowed: false,
        refusal: 'ASSIGNMENT_NOT_OPEN',
      });
    });
  });

  describe('a repeated operation', () => {
    it('answers ALREADY_BOUND for the same key, assignment and device, so a retried command writes nothing again', async () => {
      const port = registry();
      const again = { key: heldBy('assignment-e1', 'dev-d1') };

      await expect(bind(port, again)).resolves.toEqual({ allowed: true, effect: 'ALREADY_BOUND' });
      await expect(bind(port, again)).resolves.toEqual({ allowed: true, effect: 'ALREADY_BOUND' });
    });
  });

  describe('permissions', () => {
    it.each([['FINANCE'], ['MANAGER'], ['EMPLOYEE'], ['SPENDING_APPROVER'], ['SUPER_ADMIN']])(
      'refuses %s before the register is judged',
      async (role) => {
        await expect(bind(null, { actorRoles: [role] })).resolves.toEqual({ allowed: false, refusal: 'NOT_IT_ADMIN' });
      },
    );
  });

  describe('errors of the register', () => {
    it('refuses with a stable reason when no register is installed, after the local checks', async () => {
      await expect(bind(null)).resolves.toEqual({ allowed: false, refusal: 'DEVICE_REGISTRY_UNAVAILABLE' });
      await expect(bind(null, { key: null })).resolves.toEqual({ allowed: false, refusal: 'NO_KEY_IN_STORE' });
    });

    it('lets a failure of the register reject, so the transaction of the binding rolls back and nothing is judged', async () => {
      const port = registry().failWith(new Error('register database failed'));

      await expect(bind(port)).rejects.toThrow('register database failed');
    });
  });
});

describe('install limit of a K4 key — contract test with mock, NOT integration', () => {
  const key = (...deviceIds: string[]) => ({
    id: 'key-07',
    installations: deviceIds.map((deviceId) => ({ deviceId, boundOn: '2026-09-10' })),
  });

  // US-04-11 AC-10
  it('warns when a key of a K4 plan is on more devices than its numeric limit, naming the key, devices and limit', () => {
    expect(judgeInstallLimit({ provisioningType: 'K4', maxDevicesPerKey: 1, key: key('dev-d2', 'dev-d1') })).toEqual({
      keyId: 'key-07',
      limit: 1,
      deviceIds: ['dev-d1', 'dev-d2'],
    });
  });

  it('does not warn at the limit, for a device counted twice, or for a limit kept only as text or a plan not K4', () => {
    expect(judgeInstallLimit({ provisioningType: 'K4', maxDevicesPerKey: 1, key: key('dev-d1') })).toBeNull();
    expect(judgeInstallLimit({ provisioningType: 'K4', maxDevicesPerKey: 1, key: key('dev-d1', 'dev-d1') })).toBeNull();
    expect(judgeInstallLimit({ provisioningType: 'K4', maxDevicesPerKey: null, key: key('a', 'b', 'c') })).toBeNull();
    expect(judgeInstallLimit({ provisioningType: 'K2', maxDevicesPerKey: 2, key: key('a', 'b', 'c') })).toBeNull();
  });
});

describe('release of a key and later checks of a binding — contract test with mock, NOT integration', () => {
  // US-04-12 AC-7, AC-8; US-07-05 AC-6, AC-7
  it('sends the key back to the store when the terms let it move, retires it otherwise, and refuses an unknown clause', () => {
    expect(releaseKeyOnRevocation({ transferAllowed: true })).toEqual({ decided: true, status: 'IN_STORE' });
    expect(releaseKeyOnRevocation({ transferAllowed: false })).toEqual({ decided: true, status: 'RETIRED' });
    expect(releaseKeyOnRevocation({ transferAllowed: null })).toEqual({
      decided: false,
      refusal: 'TRANSFER_CLAUSE_MISSING',
    });
  });

  it('finds a binding in order, a hand-over, an ended registration, an unknown device and a missing register', async () => {
    const port = registry().handOver('dev-d2', E2, '2026-09-15').end('dev-d9', '2026-09-20');
    const on = '2026-10-01';
    const ask = (deviceId: string) => port.findDevice({ organizationId: ORG, deviceId, on });

    expect(checkBinding({ holderEmployeeId: E1 }, await ask('dev-d1'))).toBe('IN_ORDER');
    expect(checkBinding({ holderEmployeeId: E1 }, await ask('dev-d2'))).toBe('HOLDER_CHANGED');
    expect(checkBinding({ holderEmployeeId: E2 }, await ask('dev-d9'))).toBe('REGISTRATION_NOT_ACTIVE');
    expect(checkBinding({ holderEmployeeId: E1 }, await ask('gone'))).toBe('DEVICE_NOT_REGISTERED');
    expect(checkBinding({ holderEmployeeId: E1 }, null)).toBe('DEVICE_REGISTRY_UNAVAILABLE');
  });
});

describe('DeviceRegistryPort contract, shown on the stand-in — what the Owner adapter must also answer', () => {
  it('answers business states as values: active, not yet effective, ended, not registered', async () => {
    const port = registry().end('dev-d9', '2026-09-20');
    const at = (deviceId: string, on: string) => port.findDevice({ organizationId: ORG, deviceId, on });

    await expect(at('dev-d1', '2026-10-01')).resolves.toMatchObject({
      found: true,
      device: { registration: 'ACTIVE' },
    });
    await expect(at('dev-d1', '2026-08-31')).resolves.toMatchObject({
      found: true,
      device: { registration: 'NOT_YET_EFFECTIVE' },
    });
    await expect(at('dev-d9', '2026-09-20')).resolves.toMatchObject({ found: true, device: { registration: 'ENDED' } });
    await expect(at('nope', '2026-10-01')).resolves.toEqual({ found: false, reason: 'NOT_REGISTERED' });
  });

  it('treats validity as half-open: the old holder up to the day before a hand-over, the new holder from it', async () => {
    const port = registry().handOver('dev-d1', E2, '2026-09-15');
    const holderOn = async (on: string) => {
      const lookup = await port.findDevice({ organizationId: ORG, deviceId: 'dev-d1', on });

      return lookup.found ? lookup.device.holderEmployeeId : null;
    };

    await expect(holderOn('2026-09-14')).resolves.toBe(E1);
    await expect(holderOn('2026-09-15')).resolves.toBe(E2);
  });

  it('starts every registration unacknowledged, also after a hand-over', async () => {
    const port = registry().acknowledge('dev-d1').handOver('dev-d1', E2, '2026-09-15');
    const at = (on: string) => port.findDevice({ organizationId: ORG, deviceId: 'dev-d1', on });

    await expect(at('2026-09-14')).resolves.toMatchObject({ device: { acknowledgement: 'CONFIRMED' } });
    await expect(at('2026-09-15')).resolves.toMatchObject({ device: { acknowledgement: 'UNCONFIRMED' } });
  });

  it('lists the active devices of one person by asset tag and keeps other organizations apart', async () => {
    const port = registry();

    await expect(port.listActiveDevicesOf({ organizationId: ORG, employeeId: E1, on: '2026-10-01' })).resolves.toEqual([
      expect.objectContaining({ assetTag: 'LAP-114' }),
      expect.objectContaining({ assetTag: 'LAP-120' }),
    ]);
    await expect(port.findDevice({ organizationId: 'org-2', deviceId: 'dev-d1', on: '2026-10-01' })).resolves.toEqual({
      found: false,
      reason: 'NOT_REGISTERED',
    });
  });

  // US-02-05 AC-11: a row of the seat baseline names the device by its asset tag.
  it('finds a device by its asset tag with the same answer as by its id', async () => {
    const port = registry().handOver('dev-d1', E2, '2026-09-15');
    const on = '2026-10-01';

    await expect(port.findDeviceByAssetTag({ organizationId: ORG, assetTag: 'LAP-114', on })).resolves.toEqual(
      await port.findDevice({ organizationId: ORG, deviceId: 'dev-d1', on }),
    );
    await expect(port.findDeviceByAssetTag({ organizationId: ORG, assetTag: 'PERSONAL-1', on })).resolves.toEqual({
      found: false,
      reason: 'NOT_REGISTERED',
    });
  });

  it('rejects only when it cannot answer at all', async () => {
    const port = registry().failWith(new Error('down'));

    await expect(port.findDevice({ organizationId: ORG, deviceId: 'dev-d1', on: '2026-10-01' })).rejects.toThrow(
      'down',
    );
    await expect(port.listActiveDevicesOf({ organizationId: ORG, employeeId: E1, on: '2026-10-01' })).rejects.toThrow(
      'down',
    );
  });
});
