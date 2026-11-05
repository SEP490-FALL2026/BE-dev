/** The version being acknowledged is not the one in force (or none is published): the holder reads the current one first. */
export class DeviceAcknowledgementNoticeNotCurrentError extends Error {
  constructor() {
    super('That is not the version of the notice in force.');
    this.name = 'DeviceAcknowledgementNoticeNotCurrentError';
  }
}

/** The holder has acknowledged the version in force already; collection is on. */
export class DeviceAlreadyAcknowledgedError extends Error {
  constructor() {
    super('The notice in force is acknowledged already.');
    this.name = 'DeviceAlreadyAcknowledgedError';
  }
}

/** The signed `BM-06` of the registration is not kept yet: the IT Admin records it before the holder acknowledges. */
export class DeviceSignatureRecordMissingError extends Error {
  constructor() {
    super('The signed notice of this registration is not kept yet.');
    this.name = 'DeviceSignatureRecordMissingError';
  }
}
