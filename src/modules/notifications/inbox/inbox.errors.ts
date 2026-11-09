/** The notice is not in the inbox of the person who asked: it does not exist, or it belongs to somebody else. */
export class NotificationNotFoundError extends Error {
  constructor() {
    super('The notification does not exist.');
    this.name = 'NotificationNotFoundError';
  }
}
