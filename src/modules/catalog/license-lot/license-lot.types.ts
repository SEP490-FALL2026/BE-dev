import type { BusinessDate } from '../../../core/business-date';

/** Why a lot was bought: the opening stock, a request, to replace keys that failed, or to keep in stock for machines. */
export type LicenseLotPurpose = 'OPENING' | 'REQUEST' | 'REPLACEMENT' | 'STOCK';

/** One purchase of licenses of a K4 plan (W3-24). A lot born from a perpetual purchase has the id of that subscription. */
export interface LicenseLotRecord {
  id: string;
  organizationId: string;
  planId: string;
  workspaceId: string | null;
  purchasedOn: BusinessDate;
  licenseCount: number;
  /** The price of one license before tax, in dong. */
  unitPriceMinor: bigint;
  originalUnitPriceMinor: bigint | null;
  originalCurrency: string | null;
  /** What Finance confirmed the invoice of the lot at; set by the system. */
  invoiceActualMinor: bigint | null;
  purpose: LicenseLotPurpose;
  /** The request a lot of purpose REQUEST was bought for; a value, the request belongs to another module. */
  requestId: string | null;
  contractId: string | null;
  responsibleItAdminEmployeeId: string | null;
  legacySubscriptionId: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewLicenseLot {
  organizationId: string;
  planId: string;
  workspaceId: string | null;
  purchasedOn: BusinessDate;
  licenseCount: number;
  unitPriceMinor: bigint;
  originalUnitPriceMinor?: bigint | null;
  originalCurrency?: string | null;
  purpose: LicenseLotPurpose;
  requestId?: string | null;
  contractId?: string | null;
  responsibleItAdminEmployeeId: string | null;
  note?: string | null;
}

/** What an IT Admin changes of a lot; a field left out stays. The plan, the purpose and the origin never change. */
export interface LicenseLotChanges {
  workspaceId?: string | null;
  purchasedOn?: BusinessDate;
  licenseCount?: number;
  unitPriceMinor?: bigint;
  originalUnitPriceMinor?: bigint | null;
  originalCurrency?: string | null;
  contractId?: string | null;
  note?: string | null;
}

/** A lot as the routes read it (W3-24): what it is, how many licenses it gave out and has left, and who answers for it. */
export interface LicenseLotDetail {
  id: string;
  plan: { id: string; name: string; keyBinding: 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED' | null };
  purchasedOn: BusinessDate;
  licenseCount: number;
  /** The licenses taken: the keys given to people, the activations on machines and the old rights with no key. */
  assigned: number;
  free: number;
  keysInStore: number;
  /** The keys that can be given at once; null for a plan whose key goes on a machine. */
  grantable: number | null;
  unitPriceMinor: bigint;
  freeValueMinor: bigint;
  purpose: LicenseLotPurpose;
  contract: { id: string; name: string } | null;
  workspace: { id: string; name: string } | null;
  responsibleItAdminEmployeeId: string | null;
  note: string | null;
  requestId: string | null;
  invoiceActualMinor: bigint | null;
  originalUnitPrice: { amountMinor: bigint; currency: string } | null;
  updatedAt: Date;
}

export interface UpdateLicenseLotInput {
  contractId?: string | null;
  contractChangeReason?: string;
  note?: string | null;
  unitPrice?: { amount: string; currency: string };
}
