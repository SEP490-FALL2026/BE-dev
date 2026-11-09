export type ApplicationKind = 'SAAS' | 'LICENSED' | 'INTERNAL';
export type DataSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';
export type CatalogStatus = 'APPROVED' | 'RETIRED';

export interface ApplicationCommunication {
  personToPersonMessaging: boolean;
  callsOrMeetings: boolean;
  mailbox: boolean;
  isCommunicationService: boolean;
  note: string | null;
}

export interface ApplicationRecord {
  id: string;
  name: string;
  kind: ApplicationKind;
  vendor: { id: string; name: string; dictionaryGroupId: string | null } | null;
  dictionaryServiceLineId: string | null;
  domains: string[];
  dataSensitivity: DataSensitivity;
  /** QĐ-104 removed the Business Owner: null for an application declared without one; older rows keep the person they named. */
  businessOwnerEmployeeId: string | null;
  communication: ApplicationCommunication;
  functionalGroup: { id: string; name: string } | null;
  status: CatalogStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** What a row of the application list shows: no domains, no communication note, no dictionary line. */
export interface ApplicationSummaryRecord {
  id: string;
  name: string;
  kind: ApplicationKind;
  vendor: { id: string; name: string } | null;
  dataSensitivity: DataSensitivity;
  businessOwnerEmployeeId: string | null;
  isCommunicationService: boolean;
  functionalGroup: { id: string; name: string } | null;
  status: CatalogStatus;
  updatedAt: Date;
}

export interface BusinessOwnerView {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  status: 'ACTIVE' | 'TERMINATED';
}

/** An application as it is answered: the record and the Business Owner read from the organization. */
export interface ApplicationView extends ApplicationRecord {
  /** Null when the application names none (`QĐ-104`). */
  businessOwner: BusinessOwnerView | null;
  /** The Business Owner has left and has not been replaced (`INV-06`: the previous one is kept until then). */
  businessOwnerReplacementRequired: boolean;
}

export interface ApplicationSummaryView extends ApplicationSummaryRecord {
  businessOwner: BusinessOwnerView | null;
  businessOwnerReplacementRequired: boolean;
}

export interface ApplicationListFilter {
  search?: string;
  kind?: ApplicationKind;
  status?: CatalogStatus;
  functionalGroupId?: string;
  skip: number;
  take: number;
}

export interface NewApplication {
  organizationId: string;
  name: string;
  kind: ApplicationKind;
  vendorId: string | null;
  dictionaryServiceLineId: string | null;
  functionalGroupId: string | null;
  businessOwnerEmployeeId: string | null;
  dataSensitivity: DataSensitivity;
  communication: ApplicationCommunication;
  domains: string[];
}

export interface ApplicationChanges {
  name?: string;
  dictionaryServiceLineId?: string | null;
  functionalGroupId?: string | null;
  businessOwnerEmployeeId?: string;
  dataSensitivity?: DataSensitivity;
  communication?: ApplicationCommunication;
  domains?: string[];
}
