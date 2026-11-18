export interface VendorLineRecord {
  id: string;
  groupId: string;
  name: string;
  domains: string[];
  patterns: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorGroupRecord {
  id: string;
  name: string;
  brandDomains: string[];
  serviceLines: VendorLineRecord[];
  createdAt: Date;
  updatedAt: Date;
}

/** One service line a name, domain or description could mean, with its vendor. Never a choice made for the caller. */
export interface VendorCandidate {
  serviceLineId: string;
  serviceLineName: string;
  groupId: string;
  groupName: string;
}

export type VendorProposalStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED';

export interface VendorProposalRecord {
  id: string;
  organizationId: string;
  name: string;
  status: VendorProposalStatus;
  serviceLineId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface VendorGroupListFilter {
  search?: string;
  skip: number;
  take: number;
}

export interface VendorProposalListFilter {
  status?: VendorProposalStatus;
  skip: number;
  take: number;
}

export type VendorNormalizationKind = 'DOMAIN' | 'DESCRIPTION';

export interface VendorNormalization {
  method: 'DOMAIN' | 'PATTERN' | null;
  candidates: VendorCandidate[];
}
