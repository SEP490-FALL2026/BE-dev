/** No version of the notice has been published yet. */
export class MonitoringNoticeNotPublishedError extends Error {
  constructor() {
    super('No version of the monitoring notice has been published.');
    this.name = 'MonitoringNoticeNotPublishedError';
  }
}

/** The new version starts collecting more (the status of tools) but does not ask the holders to acknowledge again. */
export class MonitoringNoticeReacknowledgementRequiredError extends Error {
  constructor() {
    super('A version that adds the status of tools must ask the holders to acknowledge again.');
    this.name = 'MonitoringNoticeReacknowledgementRequiredError';
  }
}
