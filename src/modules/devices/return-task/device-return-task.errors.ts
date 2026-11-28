export class DeviceReturnTaskNotFoundError extends Error {
  readonly code = 'DEVICE_RETURN_TASK.NOT_FOUND';

  constructor() {
    super('The device return task does not exist.');
    this.name = 'DeviceReturnTaskNotFoundError';
  }
}

export class DeviceReturnTaskAlreadyClosedError extends Error {
  readonly code = 'DEVICE_RETURN_TASK.ALREADY_CLOSED';

  constructor() {
    super('The device return task is already closed.');
    this.name = 'DeviceReturnTaskAlreadyClosedError';
  }
}

export class DeviceReturnTaskOutcomeFieldsInvalidError extends Error {
  readonly code = 'DEVICE_RETURN_TASK.OUTCOME_FIELDS_INVALID';

  constructor() {
    super('The completion payload does not match the selected return outcome.');
    this.name = 'DeviceReturnTaskOutcomeFieldsInvalidError';
  }
}

export class DeviceReturnTaskSoftwareRemovalNoteRequiredError extends Error {
  readonly code = 'DEVICE_RETURN_TASK.SOFTWARE_REMOVAL_NOTE_REQUIRED';

  constructor() {
    super('A note explaining why software is not removable is required.');
    this.name = 'DeviceReturnTaskSoftwareRemovalNoteRequiredError';
  }
}
