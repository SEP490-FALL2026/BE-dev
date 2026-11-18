import type { TaxGroup } from '../public/finance.types';

/** One tax of a profile as it is kept: the estimated rate in hundredths of a percent (1000 is 10%). */
export interface TaxLineRecord {
  taxType: string;
  rateBp: number;
  deductible: boolean;
}

/** A tax profile as it is declared, before it has a version: the group and the lines. */
export interface TaxProfileContent {
  group: TaxGroup;
  lines: TaxLineRecord[];
}

/** One declaration of the profile of a vendor, never changed after it is recorded. */
export interface TaxProfileVersion extends TaxProfileContent {
  vendorId: string;
  version: number;
  declaredByAppUserId: string;
  declaredAt: Date;
}
