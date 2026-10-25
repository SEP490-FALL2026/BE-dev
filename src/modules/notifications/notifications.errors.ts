import type { InAppNotificationRefusal } from './notifications.types';

/**
 * A programming error: an in-app notice the closed table refuses (an unknown code, a key the code does not carry, a forbidden
 * key, a value that is not flat, too large). It never reaches a reader as data. Public because the module that writes the
 * notice decides what to do with its own mistake (the projection of the requests skips the event and logs it).
 */
export class InvalidInAppNotificationError extends Error {
  constructor(readonly refusal: InAppNotificationRefusal) {
    super(`The in-app notification was refused: ${refusal.reason}`);
    this.name = 'InvalidInAppNotificationError';
  }
}
