import type { BusinessDate } from '../../../core/business-date';
import type { Money } from '../../../core/money/money';
import type { LicenseLotView } from '../../catalog/public/license-lot.types';
import type { PoolInvoiceExpectationSource } from './pool-expectation/purchase-invoice-pool-expectation.policy';
import { bearsByHolder, heldByPerson, isFailedAfterPurchaseState } from './purchase-invoice-charge.policy';
import type { RequestPurchaseFacts } from './purchase-invoice.repo';
import type { LinkFacts, SeatPricing } from './purchase-invoice.types';

/** Assembles `LinkFacts` for a `REQUEST`-linked purchase invoice, preferring license-lot quantity when present. */
export function assembleRequestLinkFacts(args: {
  request: RequestPurchaseFacts;
  provisioningTaskId: string | null;
  provisioningType: string | undefined;
  requestLot: LicenseLotView | null;
  vendorId: string;
  expectedUnitPrice: Money | null;
  pool: { id: string | null; pricing: SeatPricing | null; poolSource: PoolInvoiceExpectationSource | null };
  startMonth: BusinessDate | null;
}): LinkFacts {
  const { request, provisioningTaskId, provisioningType, requestLot, vendorId, expectedUnitPrice, pool, startMonth } =
    args;
  const failedGrantDepartmentId =
    isFailedAfterPurchaseState(request.state) && bearsByHolder(provisioningType) ? request.departmentId : null;

  return {
    organizationId: request.organizationId,
    link: { kind: 'REQUEST', requestId: request.id, provisioningTaskId },
    vendorId,
    continuation: request.type === 'RENEWAL',
    startMonth,
    termMonths: request.termMonths,
    expectedQuantity: requestLot ? requestLot.licenseCount : request.beneficiaryCount,
    expectedUnitPrice,
    requestCostCenterId: request.costCenterId,
    requestId: request.id,
    holderBound: heldByPerson(request.state, provisioningType),
    failedGrantDepartmentId,
    poolSubscriptionId: pool.id,
    ceilingParts:
      pool.pricing === null
        ? []
        : [{ quantity: requestLot ? requestLot.licenseCount : request.beneficiaryCount, pricing: pool.pricing }],
    poolSource: pool.poolSource,
    renewedAssignmentId: request.renewedAssignmentId,
    licenseLotId: requestLot?.id ?? null,
  };
}
