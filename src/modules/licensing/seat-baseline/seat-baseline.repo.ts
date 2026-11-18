import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

export interface SeatBaselineState {
  closedAt: Date | null;
  closedByAppUserId: string | null;
}

interface StateRow {
  closed_at: Date | null;
  closed_by_app_user_id: string | null;
}

const toState = (row: StateRow | undefined): SeatBaselineState => ({
  closedAt: row?.closed_at ?? null,
  closedByAppUserId: row?.closed_by_app_user_id ?? null,
});

/** The one writer of `seat_baseline_states`: whether the installation seat baseline is closed. */
@Injectable()
export class SeatBaselineRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Unlocked read; an organization whose row is not made yet is open. */
  async read(organizationId: string, tx?: DbTx): Promise<SeatBaselineState> {
    const rows = await (tx ?? this.prisma).$queryRaw<StateRow[]>`
      SELECT closed_at, closed_by_app_user_id FROM seat_baseline_states WHERE organization_id = ${organizationId}::uuid`;

    return toState(rows[0]);
  }

  /** Makes the row when there is none, then holds it `FOR SHARE` or `FOR UPDATE` until the transaction ends. */
  async lock(tx: DbTx, organizationId: string, mode: 'SHARE' | 'UPDATE'): Promise<SeatBaselineState> {
    await tx.$executeRaw`
      INSERT INTO seat_baseline_states (organization_id) VALUES (${organizationId}::uuid) ON CONFLICT DO NOTHING`;
    const rows =
      mode === 'SHARE'
        ? await tx.$queryRaw<StateRow[]>`
            SELECT closed_at, closed_by_app_user_id FROM seat_baseline_states
             WHERE organization_id = ${organizationId}::uuid FOR SHARE`
        : await tx.$queryRaw<StateRow[]>`
            SELECT closed_at, closed_by_app_user_id FROM seat_baseline_states
             WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;

    return toState(rows[0]);
  }

  async close(tx: DbTx, organizationId: string, closedByAppUserId: string): Promise<Date> {
    const rows = await tx.$queryRaw<{ closed_at: Date }[]>`
      UPDATE seat_baseline_states SET closed_at = now(), closed_by_app_user_id = ${closedByAppUserId}::uuid
       WHERE organization_id = ${organizationId}::uuid RETURNING closed_at`;

    return rows[0].closed_at;
  }
}
