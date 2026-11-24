import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AssetDeviceType } from '../asset-code/asset-code.policy';
import { type AttributeChange, normalizedSerialOf } from './device-attributes.policy';

/** A machine as an edit reads it: what can change, what names it and what says whether it can still be corrected. */
export interface DeviceRow {
  id: string;
  assetCode: string;
  hostname: string;
  os: string;
  serialNumber: string | null;
  deviceType: AssetDeviceType;
  retiredAt: Date | null;
  voidedAt: Date | null;
  updatedAt: Date;
}

const SELECT = {
  id: true,
  assetCode: true,
  hostname: true,
  os: true,
  serialNumber: true,
  deviceType: true,
  retiredAt: true,
  voidedAt: true,
  updatedAt: true,
} as const;

/** The writer of the attributes a person corrects on `managed_devices` (the table belongs to this module). */
@Injectable()
export class DeviceAttributesRepo {
  /** The machine, locked `FOR UPDATE` for the rest of the transaction (tier 2b), or null when it does not exist. */
  async lock(tx: DbTx, id: string): Promise<DeviceRow | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM managed_devices WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return tx.managedDevice.findUnique({ where: { id }, select: SELECT });
  }

  /** Writes the fields that changed; the search key of the serial number moves with it. */
  update(tx: DbTx, id: string, changes: AttributeChange): Promise<DeviceRow> {
    return tx.managedDevice.update({
      where: { id },
      data: {
        ...(changes.hostname !== undefined ? { hostname: changes.hostname } : {}),
        ...(changes.os !== undefined ? { os: changes.os } : {}),
        ...(changes.deviceType !== undefined ? { deviceType: changes.deviceType } : {}),
        ...(changes.serialNumber !== undefined
          ? { serialNumber: changes.serialNumber, normalizedSerialNumber: normalizedSerialOf(changes.serialNumber) }
          : {}),
      },
      select: SELECT,
    });
  }
}
