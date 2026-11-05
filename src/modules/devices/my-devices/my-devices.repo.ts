import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

/** One registration of the signed-in holder with its machine, as `GET /me/devices` lists it. */
export interface MyDeviceRow {
  registrationId: string;
  deviceId: string;
  assetCode: string;
  hostname: string;
  os: string;
  validFrom: Date;
  endedAt: Date | null;
  acknowledgedFrom: Date | null;
  collectionStoppedAt: Date | null;
  signatureRecorded: boolean;
  acknowledgedVersionNumber: number | null;
}

/** The reads of the holder's own machines. Reads only; no lock. */
@Injectable()
export class MyDevicesRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A page of the registrations a person holds or held, the open ones first and then the newest, with the total of the same
   * snapshot. The signed record and the last acknowledged version are read in the same statement, not row by row.
   */
  async page(employeeId: string, skip: number, take: number): Promise<{ rows: MyDeviceRow[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<MyDeviceRow[]>`
          SELECT r.id AS "registrationId", d.id AS "deviceId", d.asset_code AS "assetCode", d.hostname, d.os,
                 r.valid_from AS "validFrom", r.ended_at AS "endedAt", r.acknowledged_from AS "acknowledgedFrom",
                 r.collection_stopped_at AS "collectionStoppedAt",
                 EXISTS (SELECT 1 FROM device_signature_records s WHERE s.registration_id = r.id) AS "signatureRecorded",
                 (SELECT n.version_number FROM device_acknowledgements a
                    JOIN monitoring_notice_versions n ON n.id = a.notice_version_id
                   WHERE a.registration_id = r.id ORDER BY a.acknowledged_at DESC, a.id DESC LIMIT 1)::int
                   AS "acknowledgedVersionNumber"
            FROM device_registrations r JOIN managed_devices d ON d.id = r.device_id
           WHERE r.holder_employee_id = ${employeeId}::uuid
           ORDER BY r.ended_at NULLS FIRST, r.valid_from DESC, r.id LIMIT ${take} OFFSET ${skip}`;
        const counted = await tx.$queryRaw<{ total: bigint }[]>`
          SELECT count(*) AS total FROM device_registrations WHERE holder_employee_id = ${employeeId}::uuid`;

        return { rows, total: Number(counted[0]?.total ?? 0n) };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
