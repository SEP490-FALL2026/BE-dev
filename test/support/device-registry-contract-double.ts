import type { BusinessDate } from '../../src/core/business-date';
import type { DbTx } from '../../src/infrastructure/database/transaction-runner';
import type {
  DeviceAcknowledgement,
  DeviceLookup,
  DeviceQuery,
  DeviceRegistryPort,
  RegisteredDevice,
} from '../../src/modules/licensing/device-binding/device-binding.types';

/** One registration of a device to one person, valid from `from` (inclusive) to `until` (exclusive, null while open). */
interface Registration {
  organizationId: string;
  deviceId: string;
  assetTag: string;
  hostName: string;
  employeeId: string;
  from: BusinessDate;
  until: BusinessDate | null;
  acknowledgement: DeviceAcknowledgement;
}

/** Lexical order is calendar order for `YYYY-MM-DD`. */
const covers = (registration: Registration, day: BusinessDate): boolean =>
  registration.from <= day && (registration.until === null || day < registration.until);

/**
 * CONTRACT TEST DOUBLE — not the device register and not an integration with it. An in-memory stand-in of the Owner's register
 * of company devices (`US-09-01`), written only from the port licensing designs against (`DeviceRegistryPort`), so the rules of
 * binding a K4 key can be tested before the register exists. Passing tests against it proves nothing about the real register:
 * the Owner's adapter must pass the same port contract, and the K4 items still need integration tests on PostgreSQL with it.
 */
export class DeviceRegistryContractDouble implements DeviceRegistryPort {
  private readonly registrations: Registration[] = [];
  private failure: Error | null = null;
  /** Every call, in order: which method, which device, and whether it held the registration under a lock. */
  readonly calls: { method: keyof DeviceRegistryPort; deviceId: string | null; locked: boolean }[] = [];

  constructor(private readonly organizationId: string) {}

  /** Registers a device to a person from a day; a registration starts unacknowledged. */
  register(input: {
    deviceId: string;
    assetTag: string;
    hostName: string;
    employeeId: string;
    from: BusinessDate;
  }): this {
    this.registrations.push({
      ...input,
      organizationId: this.organizationId,
      until: null,
      acknowledgement: 'UNCONFIRMED',
    });

    return this;
  }

  /** The holder acknowledged the device policy (`BM-06` signed and confirmed in the application). */
  acknowledge(deviceId: string): this {
    const open = this.openRegistrationOf(deviceId);
    if (open) open.acknowledgement = 'CONFIRMED';

    return this;
  }

  /** Ends the open registration of the device the day before `from` and registers it to `employeeId` from `from`. */
  handOver(deviceId: string, employeeId: string, from: BusinessDate): this {
    const open = this.openRegistrationOf(deviceId);
    if (!open) return this;
    open.until = from;

    return this.register({ deviceId, assetTag: open.assetTag, hostName: open.hostName, employeeId, from });
  }

  /** Ends the open registration of the device: `until` is the first day it no longer covers. */
  end(deviceId: string, until: BusinessDate): this {
    const open = this.openRegistrationOf(deviceId);
    if (open) open.until = until;

    return this;
  }

  /** Every later call rejects with `error`, as the register does when its database fails inside the caller's transaction. */
  failWith(error: Error): this {
    this.failure = error;

    return this;
  }

  findDevice(query: DeviceQuery): Promise<DeviceLookup> {
    this.calls.push({ method: 'findDevice', deviceId: query.deviceId, locked: false });

    return this.answer(() => this.lookup(query));
  }

  lockDeviceForBinding(tx: DbTx, query: DeviceQuery): Promise<DeviceLookup> {
    // The stand-in has no database: the transaction is only proof that the caller is inside one.
    void tx;
    this.calls.push({ method: 'lockDeviceForBinding', deviceId: query.deviceId, locked: true });

    return this.answer(() => this.lookup(query));
  }

  listActiveDevicesOf(query: {
    organizationId: string;
    employeeId: string;
    on: BusinessDate;
  }): Promise<RegisteredDevice[]> {
    this.calls.push({ method: 'listActiveDevicesOf', deviceId: null, locked: false });

    return this.answer(() =>
      this.registrations
        .filter(
          (registration) =>
            registration.organizationId === query.organizationId &&
            registration.employeeId === query.employeeId &&
            covers(registration, query.on),
        )
        .map((registration) => this.toDevice(registration, 'ACTIVE'))
        .sort((a, b) => a.assetTag.localeCompare(b.assetTag)),
    );
  }

  findDeviceByAssetTag(query: { organizationId: string; assetTag: string; on: BusinessDate }): Promise<DeviceLookup> {
    const tagged = this.registrations.find(
      (registration) =>
        registration.organizationId === query.organizationId && registration.assetTag === query.assetTag,
    );
    this.calls.push({ method: 'findDeviceByAssetTag', deviceId: tagged?.deviceId ?? null, locked: false });

    return this.answer(() =>
      tagged
        ? this.lookup({ organizationId: query.organizationId, deviceId: tagged.deviceId, on: query.on })
        : { found: false, reason: 'NOT_REGISTERED' },
    );
  }

  private answer<T>(compute: () => T): Promise<T> {
    if (this.failure) return Promise.reject(this.failure);

    return Promise.resolve(compute());
  }

  /** The registration covering the day; else the next one to come; else the last one that ended. */
  private lookup(query: DeviceQuery): DeviceLookup {
    const ofDevice = this.registrations
      .filter((registration) => registration.organizationId === query.organizationId)
      .filter((registration) => registration.deviceId === query.deviceId)
      .sort((a, b) => a.from.localeCompare(b.from));
    const current = ofDevice.find((registration) => covers(registration, query.on));
    if (current) return { found: true, device: this.toDevice(current, 'ACTIVE') };
    const next = ofDevice.find((registration) => registration.from > query.on);
    if (next) return { found: true, device: this.toDevice(next, 'NOT_YET_EFFECTIVE') };
    const last = ofDevice.at(-1);
    if (last) return { found: true, device: this.toDevice(last, 'ENDED') };

    return { found: false, reason: 'NOT_REGISTERED' };
  }

  private toDevice(registration: Registration, state: RegisteredDevice['registration']): RegisteredDevice {
    return {
      deviceId: registration.deviceId,
      assetTag: registration.assetTag,
      hostName: registration.hostName,
      holderEmployeeId: registration.employeeId,
      registration: state,
      acknowledgement: registration.acknowledgement,
    };
  }

  private openRegistrationOf(deviceId: string): Registration | undefined {
    return this.registrations.find((registration) => registration.deviceId === deviceId && registration.until === null);
  }
}
