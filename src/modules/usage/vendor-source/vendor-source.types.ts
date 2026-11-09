export const IDENTIFIER_TYPES = ['EMAIL', 'USERNAME', 'ACCOUNT_ID'] as const;
export type UsageIdentifierType = (typeof IDENTIFIER_TYPES)[number];

export const REPORT_SHAPES = ['AGGREGATE', 'EVENT'] as const;
export type UsageReportShape = (typeof REPORT_SHAPES)[number];

export const EVENT_CLASS_MAPPINGS = ['VALUE', 'PASSIVE', 'AUTH_ONLY', 'IGNORED'] as const;
export type EventClassMapping = (typeof EVENT_CLASS_MAPPINGS)[number];

export type DefinitionStrictness = 'STRICT' | 'LOOSE';
export type EvidenceDirection = 'POSITIVE_ONLY' | 'POSITIVE_AND_NEGATIVE';

/**
 * How the columns of a vendor CSV report (and the fields of a JSON one) are read: the name of the column of each thing the import needs.
 * `AGGREGATE` reads the days the person was active (`activeDates`) or the last one (`lastActivityDate`); `EVENT` reads one event on each
 * line (`date`, `eventType`) and sorts it by `eventClasses`.
 */
export interface SourceTemplate {
  columns: {
    identifier: string;
    activeDates?: string;
    lastActivityDate?: string;
    date?: string;
    eventType?: string;
  };
  eventClasses: Record<string, EventClassMapping>;
  /** How a date with slashes is read (`FR-4.2`); absent: dates are `YYYY-MM-DD`, with or without a time. */
  dateFormat?: DateFormat;
}

/** The orders a date of a report may be written in. */
export const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** What the vendor can tell (`FR-4.4`): the matrix of capabilities the IT Admin declares. */
export interface SourceCapabilities {
  memberList: boolean;
  lastActivity: boolean;
  eventDetail: boolean;
  maxHistoryDays: number | null;
}

export type DetectableGroup = 'G1' | 'G2' | 'G3' | 'G4';

/** The groups a source can detect are `G1` to `G4`: an answer never lists more. */
export const MAX_DETECTABLE_GROUPS = 4;

export interface SourceRecord {
  id: string;
  organizationId: string;
  applicationId: string;
  name: string;
  identifierType: UsageIdentifierType;
  reportShape: UsageReportShape;
  template: SourceTemplate;
  timeZone: string;
  activityDefinition: string;
  definitionStrictness: DefinitionStrictness;
  evidenceDirection: EvidenceDirection;
  capabilities: SourceCapabilities;
  retiredAt: Date | null;
  createdByAppUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewSource {
  organizationId: string;
  applicationId: string;
  name: string;
  identifierType: UsageIdentifierType;
  reportShape: UsageReportShape;
  template: SourceTemplate;
  timeZone: string;
  activityDefinition: string;
  definitionStrictness: DefinitionStrictness;
  evidenceDirection: EvidenceDirection;
  capabilities: SourceCapabilities;
  createdByAppUserId: string;
}

export interface SourceView extends SourceRecord {
  applicationName: string;
  detectableGroups: DetectableGroup[];
  limitation: string | null;
  canConcludeAbsence: boolean;
}
