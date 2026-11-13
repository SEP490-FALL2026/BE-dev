export type ProvisioningType = 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
export type PricingModel = 'PER_SEAT' | 'FLAT_RATE' | 'CONCURRENT' | 'CONSUMPTION' | 'PER_HOST';
export type ControlLevel = 'FULL' | 'PARTIAL' | 'UNCONTROLLABLE';
export type SharingPolicy = 'ALLOWED' | 'NOT_ALLOWED';
export type WorkspaceRole = 'OWNER' | 'ADMIN';
export type SeatTracking = 'APPLICABLE' | 'NOT_APPLICABLE';
export type ApplicationKind = 'SAAS' | 'LICENSED' | 'INTERNAL';

export interface PlanRecord {
  id: string;
  applicationId: string;
  applicationName: string;
  applicationKind: ApplicationKind;
  name: string;
  provisioningType: ProvisioningType;
  pricingModel: PricingModel | null;
  controlLevel: ControlLevel | null;
  revocationNote: string | null;
  dataLossOnRemoval: boolean;
  sharingPolicy: SharingPolicy | null;
  /** A `K4` plan the company administers through a console of the vendor (`R-53`); false for every other kind. */
  hasAdminConsole: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** A row of the plan list: the plan without its revocation note, which only the detail carries. */
export type PlanSummaryRecord = Omit<PlanRecord, 'revocationNote'>;

export interface WorkspaceMemberRecord {
  employeeId: string;
  role: WorkspaceRole;
}

export interface WorkspaceProfileRecord {
  planId: string;
  primaryOwnerEmployeeId: string;
  members: WorkspaceMemberRecord[];
  ownerLimit: number | null;
  adminLimit: number | null;
  ownerTransferProcedure: string | null;
  emergencyAccount: {
    identity: string;
    occupiesSeat: boolean;
    holderEmployeeId: string;
    lastReviewedOn: string;
  } | null;
  updatedAt: Date;
}

export interface PersonView {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}

/** A workspace profile as it is answered: the people are named from the organization. */
export interface WorkspaceProfileView {
  primaryOwner: PersonView;
  members: Array<PersonView & { role: WorkspaceRole }>;
  ownerLimit: number | null;
  adminLimit: number | null;
  ownerTransferProcedure: string | null;
  emergencyAccount: {
    identity: string;
    occupiesSeat: boolean;
    holder: PersonView;
    lastReviewedOn: string;
  } | null;
  updatedAt: Date;
}

export interface PlanListFilter {
  applicationId?: string;
  provisioningType?: ProvisioningType;
  skip: number;
  take: number;
}

export interface NewPlan {
  organizationId: string;
  applicationId: string;
  name: string;
  provisioningType: ProvisioningType;
  pricingModel: PricingModel | null;
  controlLevel: ControlLevel | null;
  revocationNote: string | null;
  dataLossOnRemoval: boolean;
  sharingPolicy: SharingPolicy | null;
  hasAdminConsole: boolean;
}

export interface PlanChanges {
  name?: string;
  provisioningType?: ProvisioningType;
  pricingModel?: PricingModel | null;
  controlLevel?: ControlLevel | null;
  revocationNote?: string | null;
  dataLossOnRemoval?: boolean;
  sharingPolicy?: SharingPolicy | null;
  hasAdminConsole?: boolean;
}

/** The plan and the facts about it the capabilities that hang off it read: a subscription, the terms. */
export interface PlanLookup {
  id: string;
  name: string;
  provisioningType: ProvisioningType;
  pricingModel: PricingModel | null;
  sharingPolicy: SharingPolicy | null;
  hasAdminConsole: boolean;
  applicationId: string;
  applicationName: string;
  applicationKind: ApplicationKind;
  /** Whether the application is still in the catalog or has been retired. */
  applicationStatus: 'APPROVED' | 'RETIRED';
}
