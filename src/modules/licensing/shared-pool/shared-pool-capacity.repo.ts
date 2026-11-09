import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

/**
 * Gói 9 (MF1-F): Query dung lượng kho.
 */
@Injectable()
export class SharedPoolCapacityRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Các thuê bao ACTIVE của gói còn cấp được hôm nay (kho Trống).
   * - ACTIVE, chưa kỳ kế tiếp, còn hiệu lực (end_date IS NULL hoặc end_date ≥ hôm nay)
   * - KHÔNG gồm DRAFT
   */
  async activeGrantableOf(tx: DbTx, planId: string, today: BusinessDate) {
    return (tx ?? this.prisma).subscription.findMany({
      where: {
        planId,
        status: 'ACTIVE',
        renewedBy: null,
        OR: [{ endDate: null }, { endDate: { gte: new Date(today) } }],
      },
      select: {
        id: true,
        purchasedQuantity: true,
      },
    });
  }

  /**
   * Số lượng assignment MỞ hôm nay (cấp được, chưa thu hồi).
   * = assignment có tác vụ cấp chờ/lỗi, hoặc không có tác vụ nào để mở.
   * 
   * Theo SPEC: `inRevocation = Assignment mở có tác vụ thu hồi chưa đóng` (Q-36).
   * `free = open mở (có tác vụ cấp) - inRevocation`.
   * 
   * Dùng với openAssignmentsCount để tính free = purchased - mở.
   */
  async openAssignmentsCount(tx: DbTx, today: BusinessDate): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    
    // Query: assignment PERSONAL/SERVICE còn hiệu lực hôm nay
    // (không end hoặc end >= hôm nay), đếm theo subscription
    const rows = await (tx ?? this.prisma).$queryRaw<{ subscription_id: string; count: bigint }[]>`
      SELECT 
        COALESCE(s.id, 'unknown') as subscription_id,
        COUNT(la.id) as count
      FROM license_assignments la
      LEFT JOIN subscriptions s ON la.subscription_id = s.id
      WHERE (la.valid_until IS NULL OR la.valid_until >= DATE($1))
        AND la.status NOT IN ('REVOKED', 'TERMINATED')
      GROUP BY s.id
    `;

    for (const row of rows) {
      if (row.subscription_id !== 'unknown') {
        result.set(row.subscription_id, Number(row.count));
      }
    }

    return result;
  }
}
