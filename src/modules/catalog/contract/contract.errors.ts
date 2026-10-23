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
