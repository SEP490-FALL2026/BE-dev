export type ApplicationKind = 'SAAS' | 'LICENSED' | 'INTERNAL';
export type DataSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';
export type CatalogStatus = 'APPROVED' | 'RETIRED';

export interface ApplicationRecord {
  id: string;
  name: string;
  kind: ApplicationKind;
  vendor: { id: string; name: string; dictionaryGroupId: string | null } | null;
  dictionaryServiceLineId: string | null;
  domains: string[];
  /** `QĐ-111f`: may be left empty. */
  dataSensitivity: DataSensitivity | null;
  /** The https link to the logo image the IT Admin pasted; null when there is none. */
  logoUrl: string | null;
  /** QĐ-111g: the IT Admin who answers for the application; null when the creator was not a usable IT Admin and nobody took it over. */
  responsibleItAdminEmployeeId: string | null;
  /** `QĐ-111e`: an application is a communication service when it stands in the group Liên lạc; nobody answers three questions any more. */
  isCommunicationService: boolean;
  functionalGroup: { id: string; name: string };
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
  dataSensitivity: DataSensitivity | null;
  /** The https link to the logo image the IT Admin pasted; null when there is none. */
  logoUrl: string | null;
  responsibleItAdminEmployeeId: string | null;
  isCommunicationService: boolean;
  functionalGroup: { id: string; name: string };
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
  functionalGroupId: string;
  responsibleItAdminEmployeeId: string | null;
  dataSensitivity: DataSensitivity | null;
  /** The https link to the logo image the IT Admin pasted; null when there is none. */
  logoUrl: string | null;
  domains: string[];
}

export interface ApplicationChanges {
  name?: string;
  dictionaryServiceLineId?: string | null;
  functionalGroupId?: string;
  dataSensitivity?: DataSensitivity | null;
  logoUrl?: string | null;
  domains?: string[];
}
