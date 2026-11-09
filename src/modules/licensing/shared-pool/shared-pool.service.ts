import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SharedPoolCapacityRepo } from './shared-pool-capacity.repo';

/**
 * Gói 9 (MF1-F): Kiểm dung lượng kho thuê bao chung.
 * Dùng khi cấp seat: tính số chỗ Trống trong thuê bao ACTIVE của plan,
 * để quyết định mua thêm hay 409.
 */
@Injectable()
export class SharedPoolService {
  constructor(private readonly capacityRepo: SharedPoolCapacityRepo) {}

  /**
   * Tính dung lượng còn Trống trong kho của một gói (đúng hôm nay).
   * 
   * Trống = Σ(purchased_quantity - mở hôm nay) trên mọi thuê bao:
   * - `ACTIVE` + chưa có kỳ kế tiếp (`renewedBy` null) + còn hiệu lực hôm nay
   * - KHÔNG gồm bản `DRAFT` (seat ban đầu không cấp được — baseline-target.policy:41–44)
   * 
   * Locked không lên các thuê bao khác của gói (giữ thứ tự khóa hiện có).
   * 
   * @param tx database transaction
   * @param planId ID của gói cần check
   * @param today hôm nay (dùng để filter subscriptions còn hiệu lực)
   * @returns số chỗ Trống ≥ 0; nếu hết ⟹ 0
   */
  async capacityOf(tx: DbTx, planId: string, today: BusinessDate): Promise<number> {
    const subscriptions = await this.capacityRepo.activeGrantableOf(tx, planId, today);
    
    const openAssignments = await this.capacityRepo.openAssignmentsCount(tx, today);

    let total = 0;
    for (const sub of subscriptions) {
      const purchased = sub.purchasedQuantity ?? 0;
      const open = openAssignments.get(sub.id) ?? 0;
      const free = Math.max(0, purchased - open);
      total += free;
    }

    return total;
  }
}
