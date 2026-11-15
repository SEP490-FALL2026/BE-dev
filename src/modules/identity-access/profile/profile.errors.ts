/** The upload has no file in the field `file`. */
export class AvatarFileRequiredError extends Error {
  constructor() {
    super('The picture is missing: send it as a file in the field "file".');
    this.name = 'AvatarFileRequiredError';
  }
}

/** The picture is larger than one megabyte. */
export class AvatarTooLargeError extends Error {
  constructor() {
    super('The picture is larger than 1 MB.');
    this.name = 'AvatarTooLargeError';
  }
}

/** By its first bytes the file is not a png, a jpeg or a webp. */
export class AvatarTypeUnsupportedError extends Error {
  constructor() {
    super('The picture must be a png, a jpeg or a webp file.');
    this.name = 'AvatarTypeUnsupportedError';
  }
}

/** The picture is empty, or is not the type it says it is. */
export class AvatarInvalidError extends Error {
  constructor(readonly reason: 'EMPTY' | 'TYPE_MISMATCH') {
    super(reason === 'EMPTY' ? 'The picture is empty.' : 'The picture is not the type it says it is.');
    this.name = 'AvatarInvalidError';
  }
}

/** The work phone is not the digits of a number, with an optional leading plus. */
export class WorkPhoneInvalidError extends Error {
  constructor() {
    super('The work phone is 8 to 15 digits with an optional leading plus; spaces, dots and dashes are ignored.');
    this.name = 'WorkPhoneInvalidError';
  }
}

/** The Super Admin asked to remove a picture the account does not have. */
export class AvatarNotSetError extends Error {
  constructor() {
    super('The account has no picture.');
    this.name = 'AvatarNotSetError';
  }
}
