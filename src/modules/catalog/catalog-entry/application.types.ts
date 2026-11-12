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
  /** QĐ-111g: the IT Admin who answers for the application; null when the creator was not a usable IT Admin and nobody took it over. */
  responsibleItAdminEmployeeId: string | null;
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
  responsibleItAdminEmployeeId: string | null;
  isCommunicationService: boolean;
  functionalGroup: { id: string; name: string } | null;
  status: CatalogStatus;
  updatedAt: Date;
}

export interface ResponsibleItAdminView {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}

/** An application as it is answered: the record and the IT Admin who answers for it, read from the organization. */
export interface ApplicationView extends ApplicationRecord {
  responsibleItAdmin: ResponsibleItAdminView | null;
  /** Nobody is responsible, or the one named is no longer a usable IT Admin (`QĐ-111g`): any IT Admin may take it over. */
  needsResponsible: boolean;
}

export interface ApplicationSummaryView extends ApplicationSummaryRecord {
  responsibleItAdmin: ResponsibleItAdminView | null;
  needsResponsible: boolean;
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
  responsibleItAdminEmployeeId: string | null;
  dataSensitivity: DataSensitivity;
  communication: ApplicationCommunication;
  domains: string[];
}

export interface ApplicationChanges {
  name?: string;
  dictionaryServiceLineId?: string | null;
  functionalGroupId?: string | null;
  dataSensitivity?: DataSensitivity;
  communication?: ApplicationCommunication;
  domains?: string[];
}
