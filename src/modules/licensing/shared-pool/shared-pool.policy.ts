import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SharedPoolService } from './shared-pool.service';

/**
 * Gói 9 (MF1-F): Luật kiểm duyệt mua thêm (AC-2, AC-3, SPEC phần 5).
 */
@Injectable()
export class SharedPoolPolicy {
  constructor(private readonly sharedPool: SharedPoolService) {}

  /**
   * Kiểm mua thêm: kho còn Trống hay hết?
   * AC-2: nếu `free > 0` + có `purchase` ⟹ 409 PURCHASE_NOT_ALLOWED
   * 
   * @returns { canPurchase: boolean, freeSeats: number }
   *   - canPurchase = true ⟹ kho hết (0), có thể mua
   *   - canPurchase = false ⟹ kho còn, không nên mua
   */
  async checkPurchaseEligibility(
    tx: DbTx,
    planId: string,
    today: BusinessDate,
  ): Promise<{ canPurchase: boolean; freeSeats: number }> {
    const free = await this.sharedPool.capacityOf(tx, planId, today);
    return {
      canPurchase: free === 0,
      freeSeats: free,
    };
  }

  /**
   * AC-3: kho hết + có tác vụ thu hồi mở ⟹ yêu cầu lý do mua.
   * @param hasPendingRevocation có tác vụ thu hồi mở hay không
   * @param purchaseReason lý do mua (nếu có)
   * @returns true nếu hợp lệ, false nếu cần lý do
   */
  validatePurchaseReason(hasPendingRevocation: boolean, purchaseReason?: string | null): boolean {
    if (!hasPendingRevocation) return true;
    // Kho hết + có revocation mở ⟹ yêu cầu reason
    return !!purchaseReason && purchaseReason.trim().length > 0;
  }
}
