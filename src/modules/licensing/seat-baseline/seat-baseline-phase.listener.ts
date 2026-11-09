import { Injectable, OnModuleInit } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SeatBaselinePhaseHook } from '../public/licensing.extension-points';
import { SeatBaselineRepo } from './seat-baseline.repo';

/**
 * Gói 9 (MF1-F): Bind `SeatBaselinePhaseHook` để kiểm baseline đã đóng.
 * Dùng trong quy tắc chặn trùng `QĐ-104k`: tạo thuê bao `K2`/`K4` thứ hai cùng gói khi baseline đã đóng ⟹ 409.
 * Nếu hook không bind ⟹ coi như đã đóng (chặn mọi tạo mới).
 */
@Injectable()
export class SeatBaselinePhaseListener implements OnModuleInit {
  constructor(
    private readonly repo: SeatBaselineRepo,
    private readonly hook: SeatBaselinePhaseHook,
  ) {}

  onModuleInit(): void {
    this.hook.bind({
      isClosed: (tx, organizationId) => this.isClosed(tx, organizationId),
    });
  }

  /**
   * Coi baseline của org đã đóng hay chưa.
   * @returns true nếu đã đóng, false nếu chưa đóng
   */
  async isClosed(tx: DbTx, organizationId: string): Promise<boolean> {
    const state = await this.repo.read(organizationId, tx);
    return state.closedAt !== null;
  }
}
