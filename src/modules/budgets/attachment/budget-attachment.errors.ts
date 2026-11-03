import type { BudgetAttachmentStatus } from './budget-attachment.types';

export class BudgetAttachmentNotFoundError extends Error {
  constructor(message = 'The document is not found.') {
    super(message);
    this.name = 'BudgetAttachmentNotFoundError';
  }
}

export class BudgetAttachmentNotAReaderError extends Error {
  constructor(message = 'Only Finance, the spending approver or the head of the Cost Center may view documents.') {
    super(message);
    this.name = 'BudgetAttachmentNotAReaderError';
  }
}

export class BudgetAttachmentForbiddenRoleError extends Error {
  constructor(message = 'You do not hold the required role for this attachment.') {
    super(message);
    this.name = 'BudgetAttachmentForbiddenRoleError';
  }
}

export class BudgetAttachmentFileInvalidError extends Error {
  constructor(
    public readonly problem: 'NAME' | 'EMPTY',
    message = 'The file name or size is invalid.',
  ) {
    super(message);
    this.name = 'BudgetAttachmentFileInvalidError';
  }
}

export class BudgetAttachmentTypeNotAllowedError extends Error {
  constructor(
    public readonly allowed: readonly string[],
    message = 'The file type is not allowed.',
  ) {
    super(message);
    this.name = 'BudgetAttachmentTypeNotAllowedError';
  }
}

export class BudgetAttachmentTooLargeError extends Error {
  constructor(
    public readonly maxBytes: number,
    message = 'The file exceeds the maximum allowed size.',
  ) {
    super(message);
    this.name = 'BudgetAttachmentTooLargeError';
  }
}

export class BudgetAttachmentUploadMismatchError extends Error {
  constructor(message = 'The uploaded object does not match what was declared.') {
    super(message);
    this.name = 'BudgetAttachmentUploadMismatchError';
  }
}

export class BudgetAttachmentNotAttachableError extends Error {
  constructor(
    public readonly attachmentIds: string[],
    message = 'Some documents cannot be attached.',
  ) {
    super(message);
    this.name = 'BudgetAttachmentNotAttachableError';
  }
}

export class BudgetAttachmentLimitReachedError extends Error {
  constructor(
    public readonly limit: number,
    message = 'The limit of attachments has been reached.',
  ) {
    super(message);
    this.name = 'BudgetAttachmentLimitReachedError';
  }
}

export class BudgetAttachmentNotAwaitingUploadError extends Error {
  constructor(message = 'The document is not awaiting upload.') {
    super(message);
    this.name = 'BudgetAttachmentNotAwaitingUploadError';
  }
}

export class BudgetAttachmentUploadPendingError extends Error {
  constructor(message = 'The upload is still pending.') {
    super(message);
    this.name = 'BudgetAttachmentUploadPendingError';
  }
}

export class BudgetAttachmentUploadExpiredError extends Error {
  constructor(message = 'The upload has expired.') {
    super(message);
    this.name = 'BudgetAttachmentUploadExpiredError';
  }
}

export class BudgetAttachmentAlreadyRemovedError extends Error {
  constructor(message = 'The document has already been removed.') {
    super(message);
    this.name = 'BudgetAttachmentAlreadyRemovedError';
  }
}

export class BudgetAttachmentNotDiscardableError extends Error {
  constructor(
    public readonly status: BudgetAttachmentStatus,
    message = 'The document cannot be discarded.',
  ) {
    super(message);
    this.name = 'BudgetAttachmentNotDiscardableError';
  }
}
