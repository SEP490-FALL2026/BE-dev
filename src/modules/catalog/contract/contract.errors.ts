export class ContractNotFoundError extends Error {
  constructor() {
    super('The contract does not exist.');
    this.name = 'ContractNotFoundError';
  }
}

export class ContractNameRequiredError extends Error {
  constructor() {
    super('A contract needs a name.');
    this.name = 'ContractNameRequiredError';
  }
}

/** A contract that is made names its vendor (`US-04-13` AC-5). */
export class ContractVendorRequiredError extends Error {
  constructor() {
    super('A contract needs a vendor.');
    this.name = 'ContractVendorRequiredError';
  }
}

/** A contract that is made names the day from which it is in effect; the day to which it is may be left empty. */
export class ContractEffectiveFromRequiredError extends Error {
  constructor() {
    super('A contract needs the day from which it is in effect.');
    this.name = 'ContractEffectiveFromRequiredError';
  }
}

export type ContractEffectiveRangeProblem = 'TO_BEFORE_FROM' | 'TO_WITHOUT_FROM';

/** The days of a contract do not make a period: the end is before the beginning, or there is an end and no beginning. */
export class ContractEffectiveRangeError extends Error {
  constructor(readonly problem: ContractEffectiveRangeProblem) {
    super(
      problem === 'TO_BEFORE_FROM'
        ? 'The day a contract ends is before the day it begins.'
        : 'A contract with an end needs the day it begins.',
    );
    this.name = 'ContractEffectiveRangeError';
  }
}

/** A change of a contract is made for a reason (`US-04-13` AC-8). */
export class ContractReasonRequiredError extends Error {
  constructor() {
    super('A change of a contract needs a reason.');
    this.name = 'ContractReasonRequiredError';
  }
}

export class ContractUpdateEmptyError extends Error {
  constructor() {
    super('The change names no field of the contract.');
    this.name = 'ContractUpdateEmptyError';
  }
}

/** The vendor named does not exist in the catalog. */
export class ContractVendorNotFoundError extends Error {
  constructor() {
    super('The vendor does not exist.');
    this.name = 'ContractVendorNotFoundError';
  }
}

/** Another contract of the organization has this number, read the way numbers are compared (`US-04-13` AC-4). */
export class ContractNumberTakenError extends Error {
  constructor() {
    super('Another contract has this number.');
    this.name = 'ContractNumberTakenError';
  }
}

/** A contract with subscriptions linked keeps its vendor (`US-04-13` AC-8). */
export class ContractVendorLockedError extends Error {
  constructor() {
    super('The vendor of a contract with subscriptions linked does not change.');
    this.name = 'ContractVendorLockedError';
  }
}

/** The subscription does not exist. */
export class ContractSubscriptionNotFoundError extends Error {
  constructor() {
    super('The subscription does not exist.');
    this.name = 'ContractSubscriptionNotFoundError';
  }
}

/** Only a subscription of a shared stock (K2 or K4) rests on a contract (`QĐ-111t`). */
export class ContractSubscriptionKindNotAllowedError extends Error {
  constructor(readonly provisioningType: string) {
    super('Only a subscription of a shared stock (K2 or K4) rests on a contract.');
    this.name = 'ContractSubscriptionKindNotAllowedError';
  }
}

/** The contract has no vendor yet (an old one, a name only), so nothing can be linked to it until it has one. */
export class ContractIncompleteError extends Error {
  constructor() {
    super('The contract has no vendor yet: fill it in before linking a subscription.');
    this.name = 'ContractIncompleteError';
  }
}

export class ContractSubscriptionVendorMismatchError extends Error {
  constructor() {
    super('The vendor of the subscription is not the vendor of the contract.');
    this.name = 'ContractSubscriptionVendorMismatchError';
  }
}

/** A subscription rests on at most one contract: on this one or on another. */
export class ContractSubscriptionAlreadyLinkedError extends Error {
  constructor(readonly contractId: string) {
    super('The subscription rests on a contract already.');
    this.name = 'ContractSubscriptionAlreadyLinkedError';
  }
}

export class ContractSubscriptionNotLinkedError extends Error {
  constructor() {
    super('The subscription is not linked to this contract.');
    this.name = 'ContractSubscriptionNotLinkedError';
  }
}

/** The person may not choose this purpose for a file: each purpose belongs to the roles that file it. */
export class DocumentPurposeForbiddenError extends Error {
  constructor() {
    super('This role may not choose this purpose for a file.');
    this.name = 'DocumentPurposeForbiddenError';
  }
}

/** The purpose is real but has nowhere to be attached yet: the record it belongs to is not built. */
export class DocumentPurposeNotAvailableError extends Error {
  constructor(readonly purpose: string) {
    super(`Files of the purpose ${purpose} cannot be stored yet.`);
    this.name = 'DocumentPurposeNotAvailableError';
  }
}

/** The type or the extension of the file is not one the system keeps (`US-04-04` AC-10). */
export class DocumentTypeNotAllowedError extends Error {
  constructor() {
    super('Only PDF files and PNG or JPEG images are kept.');
    this.name = 'DocumentTypeNotAllowedError';
  }
}

export class DocumentTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super('The file is larger than the system keeps.');
    this.name = 'DocumentTooLargeError';
  }
}

export type DocumentFileProblem = 'EMPTY' | 'NAME';

/** The file has no content, or a name that is blank, a path, or holds a control character. */
export class DocumentFileInvalidError extends Error {
  constructor(readonly problem: DocumentFileProblem) {
    super(`The file cannot be kept: ${problem}.`);
    this.name = 'DocumentFileInvalidError';
  }
}

/** The object in the storage is not the size and type the upload declared: it is not kept. */
export class DocumentUploadMismatchError extends Error {
  constructor() {
    super('The uploaded file is not what was declared.');
    this.name = 'DocumentUploadMismatchError';
  }
}

/** No such file for this person: it does not exist, is not uploaded yet, or belongs to someone who has not attached it. */
export class DocumentNotFoundError extends Error {
  constructor() {
    super('The document does not exist.');
    this.name = 'DocumentNotFoundError';
  }
}

export class DocumentNotAwaitingUploadError extends Error {
  constructor() {
    super('The upload of this document is done already.');
    this.name = 'DocumentNotAwaitingUploadError';
  }
}

/** The upload has not reached the storage yet: the link is still good, so this is not a refusal of the file (`DB-13`). */
export class DocumentUploadPendingError extends Error {
  constructor() {
    super('The file has not reached the storage yet. Put it there with the link and say so again.');
    this.name = 'DocumentUploadPendingError';
  }
}

/** Nobody uploaded the file in time and it was given up: declare it again (`DB-13`). */
export class DocumentUploadExpiredError extends Error {
  constructor() {
    super('The upload of this document never came and it was given up. Declare the file again.');
    this.name = 'DocumentUploadExpiredError';
  }
}

export class DocumentAlreadyAttachedError extends Error {
  constructor() {
    super('The document has an owner already.');
    this.name = 'DocumentAlreadyAttachedError';
  }
}

export class DocumentNotReadyToAttachError extends Error {
  constructor() {
    super('The document is not uploaded yet.');
    this.name = 'DocumentNotReadyToAttachError';
  }
}

/** The person may not open any file: only the IT Admin and Finance do (`SoD-2` keeps the department head out). */
export class DocumentAccessForbiddenError extends Error {
  constructor() {
    super('This role may not open documents.');
    this.name = 'DocumentAccessForbiddenError';
  }
}

/** The file is not of the kind the record takes: a signed record is not attached to a contract, nor a contract file to a signer. */
export class DocumentPurposeMismatchError extends Error {
  constructor() {
    super('The purpose of this document does not fit what it is attached to.');
    this.name = 'DocumentPurposeMismatchError';
  }
}

/** A lot of keys (K4) has its own contract column: only a subscription of seats (K2) rests on a contract through a link. */
export class ContractSubscriptionNotK2Error extends Error {
  constructor() {
    super(
      'A subscription of a plan of keys (K4) does not rest on a contract: the contract of a lot is set on the lot.',
    );
    this.name = 'ContractSubscriptionNotK2Error';
  }
}
