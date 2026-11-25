export type ProvisioningType = 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
export type PricingModel = 'PER_SEAT' | 'FLAT_RATE' | 'CONCURRENT' | 'CONSUMPTION' | 'PER_HOST';
export type ControlLevel = 'FULL' | 'PARTIAL' | 'UNCONTROLLABLE';
export type SharingPolicy = 'ALLOWED' | 'NOT_ALLOWED';
export type WorkspaceRole = 'OWNER' | 'ADMIN';
export type SeatTracking = 'APPLICABLE' | 'NOT_APPLICABLE';
export type ApplicationKind = 'SAAS' | 'LICENSED' | 'INTERNAL';
/** How a K4 plan is bound once bought: to an account, to a machine by a key, or bundled with the machine (no key). */
export type KeyBinding = 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED';
export type ReferenceCommitmentMonths = 1 | 12;

/** The reference price of a plan, in minor units of dong (`QĐ-113a`). */
export interface ReferencePrice {
  amountMinor: bigint;
  currency: string;
}

export interface PlanRecord {
  id: string;
  applicationId: string;
  applicationName: string;
  /** The https link to the logo image the IT Admin pasted, or null. */
  applicationLogoUrl: string | null;
  applicationKind: ApplicationKind;
  name: string;
  provisioningType: ProvisioningType;
  /** How a K4 plan is bound once bought; null for every other kind. */
  keyBinding: KeyBinding | null;
  pricingModel: PricingModel | null;
  controlLevel: ControlLevel | null;
  revocationNote: string | null;
  dataLossOnRemoval: boolean;
  sharingPolicy: SharingPolicy | null;
  /** A `K4` plan the company administers through a console of the vendor (`R-53`); false for every other kind. */
  hasAdminConsole: boolean;
  /** The price a request is counted by when no subscription of the plan has one (`QĐ-113a`); null when none is entered. */
  referencePrice: ReferencePrice | null;
  referenceCommitmentMonths: ReferenceCommitmentMonths | null;
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
  /** The email of the company account that stands as owner of the plan at the vendor; no password (`QĐ-110u`). */
  ownerAccountEmail: string | null;
  adminNote: string | null;
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
  ownerAccountEmail: string | null;
  adminNote: string | null;
  updatedAt: Date;
}

export interface PlanListFilter {
  applicationId?: string;
  provisioningType?: ProvisioningType;
  /** Only the plans bound this way (K4 plans). */
  keyBinding?: KeyBinding;
  functionalGroupId?: string;
  /** The catalog status of the application of the plan. */
  status?: 'APPROVED' | 'RETIRED';
  /** Text in the name of the plan or of its application. */
  search?: string;
  skip: number;
  take: number;
}

export interface NewPlan {
  organizationId: string;
  applicationId: string;
  name: string;
  provisioningType: ProvisioningType;
  keyBinding: KeyBinding | null;
  pricingModel: PricingModel | null;
  controlLevel: ControlLevel | null;
  revocationNote: string | null;
  dataLossOnRemoval: boolean;
  sharingPolicy: SharingPolicy | null;
  hasAdminConsole: boolean;
  referencePrice: ReferencePrice | null;
  referenceCommitmentMonths: ReferenceCommitmentMonths | null;
}

export interface PlanChanges {
  name?: string;
  provisioningType?: ProvisioningType;
  keyBinding?: KeyBinding | null;
  pricingModel?: PricingModel | null;
  controlLevel?: ControlLevel | null;
  revocationNote?: string | null;
  dataLossOnRemoval?: boolean;
  sharingPolicy?: SharingPolicy | null;
  hasAdminConsole?: boolean;
  referencePrice?: ReferencePrice | null;
  referenceCommitmentMonths?: ReferenceCommitmentMonths | null;
}

/** The plan and the facts about it the capabilities that hang off it read: a subscription, the terms. */
export interface PlanLookup {
  id: string;
  name: string;
  provisioningType: ProvisioningType;
  keyBinding: KeyBinding | null;
  pricingModel: PricingModel | null;
  sharingPolicy: SharingPolicy | null;
  hasAdminConsole: boolean;
  referenceCommitmentMonths: ReferenceCommitmentMonths | null;
  applicationId: string;
  applicationName: string;
  applicationKind: ApplicationKind;
  /** Whether the application is still in the catalog or has been retired. */
  applicationStatus: 'APPROVED' | 'RETIRED';
  /** The vendor of the application (the workspace of a subscription is held at it, W3-11); null for an internal application. */
  applicationVendorId?: string | null;
}
