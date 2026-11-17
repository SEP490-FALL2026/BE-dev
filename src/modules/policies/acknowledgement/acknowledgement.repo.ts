import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export interface AcknowledgementInput {
  organizationId: string;
  policyVersionId: string;
  employeeId: string;
  appUserId: string;
  acknowledgedAt: Date;
}

export interface AcknowledgementOfPolicy {
  appUserId: string;
  versionNumber: number;
  acknowledgedAt: Date;
}

/** The acknowledgements of the versions of the policies: added to and never changed (a trigger refuses anything else). */
@Injectable()
export class AcknowledgementRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The numbers of the versions this account acknowledged, per policy. */
  async acknowledgedNumbers(
    appUserId: string,
    policyIds: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, number[]>> {
    const rows = await (tx ?? this.prisma).policyAcknowledgement.findMany({
      where: { appUserId, policyVersion: { policyId: { in: [...policyIds] } } },
      select: { policyVersion: { select: { policyId: true, versionNumber: true } } },
    });
    const byPolicy = new Map<string, number[]>();
    for (const { policyVersion } of rows) {
      if (policyVersion.versionNumber === null) continue;
      byPolicy.set(policyVersion.policyId, [
        ...(byPolicy.get(policyVersion.policyId) ?? []),
        policyVersion.versionNumber,
      ]);
    }

    return byPolicy;
  }

  /** Records the acknowledgement once: false when this account already acknowledged this version (two clicks make one row). */
  async insertOnce(tx: DbTx, input: AcknowledgementInput): Promise<boolean> {
    const result = await tx.policyAcknowledgement.createMany({ data: [input], skipDuplicates: true });

    return result.count === 1;
  }

  /** What these accounts acknowledged of one policy: every row, so the report can say which version and when. */
  async ofPolicy(policyId: string, appUserIds: readonly string[], tx?: DbTx): Promise<AcknowledgementOfPolicy[]> {
    const rows = await (tx ?? this.prisma).policyAcknowledgement.findMany({
      where: { appUserId: { in: [...appUserIds] }, policyVersion: { policyId } },
      select: { appUserId: true, acknowledgedAt: true, policyVersion: { select: { versionNumber: true } } },
    });

    return rows.flatMap((row) =>
      row.policyVersion.versionNumber === null
        ? []
        : [
            {
              appUserId: row.appUserId,
              versionNumber: row.policyVersion.versionNumber,
              acknowledgedAt: row.acknowledgedAt,
            },
          ],
    );
  }
}
