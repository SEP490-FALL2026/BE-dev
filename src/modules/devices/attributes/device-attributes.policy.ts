import { searchKey } from '../../../core/search-key';
import type { AssetDeviceType } from '../asset-code/asset-code.policy';
import { DeviceNotEditableError, DeviceUpdateEmptyError } from './device-attributes.errors';

/** What a person can correct on a machine: the asset code never changes with it (a machine keeps its code for life). */
export interface DeviceAttributes {
  hostname: string;
  os: string;
  serialNumber: string | null;
  deviceType: AssetDeviceType;
}

/** The fields an update names; a serial number of `null` clears it. */
export type AttributeChange = Partial<DeviceAttributes>;

/** An update names at least one field besides the version it is made on. Throws DeviceUpdateEmptyError. */
export function assertSomethingGiven(input: AttributeChange): void {
  const named = [input.hostname, input.os, input.serialNumber, input.deviceType].some((value) => value !== undefined);
  if (!named) throw new DeviceUpdateEmptyError();
}

/** A machine in the register can be corrected; one taken out of use or voided cannot. Throws DeviceNotEditableError. */
export function assertEditable(device: { retiredAt: Date | null; voidedAt: Date | null }): void {
  if (device.voidedAt !== null) throw new DeviceNotEditableError('VOIDED');
  if (device.retiredAt !== null) throw new DeviceNotEditableError('RETIRED');
}

/** The fields of an update that differ from what the machine has; nothing when none does. */
export function changesOf(current: DeviceAttributes, input: AttributeChange): AttributeChange {
  const changes: AttributeChange = {};
  if (input.hostname !== undefined && input.hostname !== current.hostname) changes.hostname = input.hostname;
  if (input.os !== undefined && input.os !== current.os) changes.os = input.os;
  if (input.serialNumber !== undefined && input.serialNumber !== current.serialNumber) {
    changes.serialNumber = input.serialNumber;
  }
  if (input.deviceType !== undefined && input.deviceType !== current.deviceType) changes.deviceType = input.deviceType;

  return changes;
}

/** The search key of a serial number (as the asset code has one): case, accents and runs of blanks do not tell two serials apart; null for none. */
export function normalizedSerialOf(serialNumber: string | null): string | null {
  return serialNumber === null ? null : searchKey(serialNumber);
}
