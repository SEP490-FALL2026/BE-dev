/** The holder has not acknowledged the notice of this machine yet: nothing is accepted from it. */
export class DeviceNotAcknowledgedError extends Error {
  constructor() {
    super('The holder has not acknowledged the notice of this machine yet.');
    this.name = 'DeviceNotAcknowledgedError';
  }
}

/** Collection was stopped at the holder's request; the credential is kept but nothing is accepted. */
export class DeviceCollectionStoppedError extends Error {
  constructor() {
    super('Collection from this machine was stopped.');
    this.name = 'DeviceCollectionStoppedError';
  }
}

/** The notice in force names the status of tools and the holder has not acknowledged that version. */
export class DeviceToolStatusNotAcknowledgedError extends Error {
  constructor() {
    super('The holder has not acknowledged the notice that covers the status of tools.');
    this.name = 'DeviceToolStatusNotAcknowledgedError';
  }
}
