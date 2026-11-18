import type { BusinessDate } from '../../../core/business-date';

/** What the rules of wasted seats ask of the usage of an application, on one day for some people (`G3`, `G4`). */
export interface EvidenceRequest {
  applicationId: string;
  /** The people the rule is judging; evidence of anyone else is not read. */
  employeeIds: readonly string[];
  /** The day the rule judges on: the age of a source is counted to it. */
  asOf: BusinessDate;
}

export type EvidenceSourceKind = 'VENDOR' | 'COLLECTOR';
export type EvidenceMatchMethod = 'EXACT_EMAIL' | 'ACCOUNT_IDENTIFIER' | 'ALIAS_RULE' | 'MANUAL';

/**
 * What one source says of one person, in days only: never the volume of use, the tokens or an event (`QĐ-101i`, `US-10-04` AC-10). The
 * days of activity are those no later report took over; being seen at all (`appeared`, an `AUTH_ONLY` event included) is not activity.
 */
export interface EmployeeEvidence {
  employeeId: string;
  /** The days of `VALUE` or `PASSIVE` activity (a vendor) or of responses (a collector), oldest first, at most `asOf`. */
  activeDates: BusinessDate[];
  /** The person is in the source at all, whether or not they were active. */
  appeared: boolean;
  /** The last day the person only logged in; null when never, or for a collector. */
  lastAuthOnlyDate: BusinessDate | null;
  /** The weakest way an identifier of the person was tied to them (`ALIAS_RULE` is weaker than `EXACT_EMAIL`); null when no identifier is involved. */
  weakestMethod: EvidenceMatchMethod | null;
  /** The day an identifier of the person was tied to or taken from them after an earlier tie was ended; null when none was. */
  mappingChangedOn: BusinessDate | null;
}

/** A source of usage of the application and what it can say; its age is counted to the day of the request. */
export interface EvidenceSource {
  kind: EvidenceSourceKind;
  /** The source of the vendor; null for the collector. */
  sourceId: string | null;
  name: string;
  /** The days the confirmed reports cover together (a vendor), or the first and the last day collected (a collector); null when there is none. */
  coverage: { from: BusinessDate; to: BusinessDate } | null;
  /** The days each confirmed report covers (a vendor), or the one run of the collector; the days between two reports are not covered. */
  windows: Array<{ from: BusinessDate; to: BusinessDate }>;
  /** The days from the end of the coverage to the day of the request; null without coverage. */
  ageDays: number | null;
  /** The source is older than a source of its kind may be to conclude anything from its silence (7 days a vendor, 14 a collector). */
  stale: boolean;
  /** How strictly the definition of activity is read (a vendor only). */
  strictness: 'STRICT' | 'LOOSE' | null;
  /** What counts as activity for this source (`INV-11`); null for the collector. */
  activityDefinition: string | null;
  /** Whether the absence of activity may be read as not used: never for a collector (`FR-4.14a`); for a vendor only if it tells the negative and has dates. */
  canConcludeAbsence: boolean;
  detectableGroups: Array<'G1' | 'G2' | 'G3' | 'G4'>;
  employees: EmployeeEvidence[];
}

/** An identifier of the application no one could be tied to: its activity is not used to conclude anything (`INV-12`). */
export interface UnmatchedEvidence {
  status: 'OPEN' | 'DISMISSED';
  /** The last day the identifier was seen active; null when it only appeared. */
  lastActivityDate: BusinessDate | null;
  /** The people it may be, when it fits more than one. */
  candidateEmployeeIds: string[];
}

export interface ApplicationUsageEvidence {
  applicationId: string;
  asOf: BusinessDate;
  /** The vendor sources with a confirmed report, and the collector when it collected anything of the application. */
  sources: EvidenceSource[];
  unmatchedIdentities: UnmatchedEvidence[];
}
