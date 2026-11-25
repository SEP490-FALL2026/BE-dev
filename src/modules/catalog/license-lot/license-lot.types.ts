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
