import type { BusinessDate } from '../../../core/business-date';

/** Why a lot was bought: the opening stock, a request, to replace keys that failed, or to keep in stock for machines. */
export type LicenseLotPurpose = 'OPENING' | 'REQUEST' | 'REPLACEMENT' | 'STOCK';

/**
 * A lot of licenses of a K4 plan with the plan and application it belongs to. A lot born from a perpetual purchase has the id of that
 * subscription, so what the machines of wave 2 call the purchase of a key is this id.
 */
export interface LicenseLotView {
  id: string;
  organizationId: string;
  purchasedOn: BusinessDate;
  /** The licenses bought: what the keys given to people and the activations on machines are counted against. */
  licenseCount: number;
  /** The price of one license before tax, in dong. */
  unitPriceMinor: bigint;
  purpose: LicenseLotPurpose;
  /** The request a lot of purpose REQUEST was bought for. */
  requestId: string | null;
  /** What Finance confirmed the invoice of this lot at, in dong; null before confirmation. */
  invoiceActualMinor: bigint | null;
  workspaceId: string | null;
  contractId: string | null;
  responsibleItAdminEmployeeId: string | null;
  legacySubscriptionId: string | null;
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
  applicationKind: 'SAAS' | 'LICENSED' | 'INTERNAL';
  /** How the key of the plan is bound once bought. */
  keyBinding: 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED' | null;
  /** Whether the application of the plan is still in the catalog; a retired one takes no license. */
  applicationStatus: 'APPROVED' | 'RETIRED';
  updatedAt: Date;
}

/** What a lot is made from: the plan, the purchase, the purpose, and what the purpose and the plan need. The IT Admin who makes it answers for it. */
export interface CreateLicenseLotInput {
  planId: string;
  purchasedOn: BusinessDate;
  licenseCount: number;
  unitPrice: { amount: string; currency: string };
  originalUnitPrice?: { amount: string; currency: string };
  purpose: Exclude<LicenseLotPurpose, 'OPENING'>;
  requestId?: string;
  workspaceId?: string;
  contractId?: string;
  note?: string;
}
