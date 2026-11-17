import type { MachineAccountRefusal } from './machine-account.policy';

/** The flag cannot be changed on this seat: see `machineAccountRefusal`. */
export class MachineAccountRefusedError extends Error {
  constructor(readonly refusal: MachineAccountRefusal) {
    super(`The flag of a machine account cannot be changed on this seat: ${refusal}.`);
    this.name = 'MachineAccountRefusedError';
  }
}

/** Turning the flag off would leave the person with two personal seats of one subscription for an overlapping period (INV-02). */
export class MachineAccountOverlapError extends Error {
  constructor() {
    super('The person holds another personal seat of this subscription for an overlapping period: the flag stays on.');
    this.name = 'MachineAccountOverlapError';
  }
}
