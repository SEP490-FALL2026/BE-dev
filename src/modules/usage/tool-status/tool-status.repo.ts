import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AiToolKey } from '../allowlist/allowlist.policy';
import type { QuotaWindowCode, SnapshotInput } from './tool-status.policy';

export interface SnapshotContext {
  organizationId: string;
  deviceId: string;
  registrationId: string;
  credentialId: string;
}

export interface ToolStatusRow {
  tool: AiToolKey;
  observedAt: Date;
  authStatus: 'LOGGED_IN' | 'LOGGED_OUT' | 'UNKNOWN' | 'NOT_SUPPORTED';
  quotaStatus: 'OK' | 'NOT_SUPPORTED' | 'FAILED';
  windowCode: QuotaWindowCode | null;
  usedPercent: number | null;
  resetsAt: Date | null;
}

/** The snapshots of the login and quota of a tool, and their windows. */
@Injectable()
export class ToolStatusRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Keeps the snapshot once: the same tool observed at the same instant is the same fact. True when it was new. */
  async insertSnapshot(tx: DbTx, context: SnapshotContext, snapshot: SnapshotInput): Promise<boolean> {
    const made = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO tool_status_snapshots (id, organization_id, device_id, registration_id, credential_id, tool, observed_at,
                                         auth_status, quota_status)
      VALUES (gen_random_uuid(), ${context.organizationId}::uuid, ${context.deviceId}::uuid, ${context.registrationId}::uuid,
              ${context.credentialId}::uuid, ${snapshot.tool}::"AiToolKey", ${snapshot.observedAt},
              ${snapshot.auth.status}::"ToolAuthStatus", ${snapshot.quota.status}::"ToolQuotaStatus")
      ON CONFLICT (registration_id, tool, observed_at) DO NOTHING
      RETURNING id`;
    const id = made[0]?.id;
    if (!id) return false;
    if (snapshot.quota.windows.length > 0) {
      await tx.toolStatusWindow.createMany({
        data: snapshot.quota.windows.map((window) => ({
          snapshotId: id,
          code: window.code,
          usedPercent: window.usedPercent,
          resetsAt: window.resetsAt,
        })),
      });
    }

    return true;
  }

  /**
   * The latest snapshot of each tool of the given registrations, a row for each window (one row when there is none), with the total of the
   * same snapshot.
   */
  async latestPage(
    deviceId: string,
    registrationIds: readonly string[] | undefined,
    skip: number,
    take: number,
  ): Promise<{ rows: ToolStatusRow[]; total: number }> {
    const only = registrationIds ? [...registrationIds] : null;

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<ToolStatusRow[]>`
          WITH latest AS (
            SELECT DISTINCT ON (tool) id, tool, observed_at, auth_status, quota_status
              FROM tool_status_snapshots
             WHERE device_id = ${deviceId}::uuid AND (${only}::uuid[] IS NULL OR registration_id = ANY(${only}::uuid[]))
             ORDER BY tool, observed_at DESC, id DESC)
          SELECT l.tool, l.observed_at AS "observedAt", l.auth_status AS "authStatus", l.quota_status AS "quotaStatus",
                 w.code AS "windowCode", w.used_percent AS "usedPercent", w.resets_at AS "resetsAt"
            FROM latest l LEFT JOIN tool_status_windows w ON w.snapshot_id = l.id
           ORDER BY l.tool, w.code NULLS FIRST, l.id LIMIT ${take} OFFSET ${skip}`;
        const counted = await tx.$queryRaw<{ total: bigint }[]>`
          WITH latest AS (
            SELECT DISTINCT ON (tool) id, tool
              FROM tool_status_snapshots
             WHERE device_id = ${deviceId}::uuid AND (${only}::uuid[] IS NULL OR registration_id = ANY(${only}::uuid[]))
             ORDER BY tool, observed_at DESC, id DESC)
          SELECT count(*) AS total FROM latest l LEFT JOIN tool_status_windows w ON w.snapshot_id = l.id`;

        return { rows, total: Number(counted[0]?.total ?? 0n) };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
