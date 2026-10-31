export class VendorNotFoundError extends Error {
  constructor() {
    super('The vendor does not exist.');
    this.name = 'VendorNotFoundError';
  }
}

/**
 * The vendor of a dictionary group's name already holds another dictionary group, so it cannot be the vendor of the
 * group. The same answer every time it is asked: not a race.
 */
export class VendorNameHeldByAnotherGroupError extends Error {
  constructor() {
    super('A vendor of the same name belongs to another dictionary group.');
    this.name = 'VendorNameHeldByAnotherGroupError';
  }
}

/**
 * A simultaneous change won the dictionary group first (`DB-03`): another vendor took the group, or the vendor of its
 * name changed, between the reads and the write. Sent again, the request meets the state that change left.
 */
export class VendorDictionaryGroupChangedError extends Error {
  constructor() {
    super('The dictionary group was taken by a simultaneous change.');
    this.name = 'VendorDictionaryGroupChangedError';
  }
}
