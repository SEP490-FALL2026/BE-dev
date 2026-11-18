import type { BusinessDate } from '../../../core/business-date';
import type { UsageIdentifierType } from '../vendor-source/vendor-source.types';

export type MappingMethod = 'EXACT_EMAIL' | 'ACCOUNT_IDENTIFIER' | 'ALIAS_RULE' | 'MANUAL';
export type MappingConfidence = 'HIGH' | 'MEDIUM';
export type UnmatchedReason = 'NOT_FOUND' | 'AMBIGUOUS';
export type UnmatchedStatus = 'OPEN' | 'DISMISSED' | 'RESOLVED';
export type FindingStatus = 'OPEN' | 'CLOSED';

/** The most candidates an identifier that fits several people keeps. */
export const MAX_CANDIDATES = 10;

export interface MappingRecord {
  id: string;
  organizationId: string;
  applicationId: string;
  identifierType: UsageIdentifierType;
  normalizedIdentifier: string;
  rawIdentifier: string;
  employeeId: string;
  method: MappingMethod;
  confidence: MappingConfidence;
  confirmedByAppUserId: string | null;
  createdAt: Date;
  endedAt: Date | null;
  endedByAppUserId: string | null;
  endReason: string | null;
}

export interface NewMapping {
  organizationId: string;
  applicationId: string;
  identifierType: UsageIdentifierType;
  normalizedIdentifier: string;
  rawIdentifier: string;
  employeeId: string;
  method: MappingMethod;
  confidence: MappingConfidence;
  confirmedByAppUserId: string | null;
}

export interface UnmatchedRecord {
  id: string;
  organizationId: string;
  applicationId: string;
  sourceId: string;
  identifierType: UsageIdentifierType;
  normalizedIdentifier: string;
  rawIdentifier: string;
  reason: UnmatchedReason;
  status: UnmatchedStatus;
  candidateEmployeeIds: string[];
  firstImportId: string;
  lastImportId: string;
  resolvedMappingId: string | null;
  handledByAppUserId: string | null;
  handledAt: Date | null;
  note: string | null;
}

export interface NewUnmatched {
  organizationId: string;
  applicationId: string;
  sourceId: string;
  identifierType: UsageIdentifierType;
  normalizedIdentifier: string;
  rawIdentifier: string;
  reason: UnmatchedReason;
  candidateEmployeeIds: string[];
  importId: string;
}

export interface FindingRecord {
  id: string;
  organizationId: string;
  applicationId: string;
  employeeId: string;
  firstActivityDate: BusinessDate;
  lastActivityDate: BusinessDate;
  lastImportId: string;
  status: FindingStatus;
  closedAt: Date | null;
  closedReason: string | null;
}

/** A person an identifier may be: the code and the work email, never the name (`US-08-04` AC-4). */
export interface CandidateView {
  employeeId: string;
  employeeCode: string;
  workEmail: string | null;
}
