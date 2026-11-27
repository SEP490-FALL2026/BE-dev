import { addDays, type BusinessDate } from '../../../../core/business-date';
import type { SubscriptionPurchaseFacts } from '../../public/subscription-period.types';
import { monthlyCostOf } from '../price/subscription-price.policy';
import type { SubscriptionRecord } from '../subscription.types';

/** Maps a subscription record and its optional successor pool facts into `SubscriptionPurchaseFacts`. */
export function toSubscriptionPurchaseFacts(
  record: SubscriptionRecord,
  successor?: { startDate: BusinessDate | null; purchasedQuantity: number | null },
): SubscriptionPurchaseFacts {
  const endExclusive = successor?.startDate ?? (record.endDate !== null ? addDays(record.endDate, 1) : null);

  return {
    subscriptionId: record.id,
    planId: record.planId,
    responsibleItAdminEmployeeId: record.responsibleItAdminEmployeeId,
    kind: record.kind,
    status: record.status,
    provisioningType: record.planProvisioningType,
    commitmentTermMonths: record.commitmentTermMonths,
    billingCycle: record.billingCycle,
    purchasedQuantity: record.purchasedQuantity,
    ...monthlyCostOf(record),
    startDate: record.startDate,
    endDate: record.endDate,
    endExclusive,
    renewalDate: record.renewalDate,
    noticeDeadline: record.noticeDeadline,
    noticePeriodDays: record.noticePeriodDays,
    autoRenew: record.autoRenew,
    invoicedLater: record.invoicedLater,
    seatCounting: record.seatCounting,
    vendorMinimumSeats: record.vendorMinimumSeats,
    nextPeriodPurchasedQuantity: successor?.purchasedQuantity ?? null,
  };
}
