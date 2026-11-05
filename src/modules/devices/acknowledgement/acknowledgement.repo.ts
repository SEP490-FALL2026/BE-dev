import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export interface AcknowledgementRow {
  id: string;
  registrationId: string;
  acknowledgedAt: Date;
}

/** The acknowledgements of the holders: added to and never changed (a trigger refuses anything else). */
@Injectable()
export class AcknowledgementRepo {
  async insert(
    tx: DbTx,
    input: {
      organizationId: string;
      registrationId: string;
      noticeVersionId: string;
      employeeId: string;
      appUserId: string;
      acknowledgedAt: Date;
    },
  ): Promise<AcknowledgementRow> {
    const row = await tx.deviceAcknowledgement.create({
      data: input,
      select: { id: true, registrationId: true, acknowledgedAt: true },
    });

    return row;
  }
}
