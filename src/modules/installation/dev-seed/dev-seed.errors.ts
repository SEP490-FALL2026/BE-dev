/** The data changed between the plan and the locked re-read: nothing is written, the run is refused. */
export class SeedStateChangedError extends Error {
  constructor() {
    super('The data changed while the seed was being prepared; nothing was written. Run it again.');
    this.name = 'SeedStateChangedError';
  }
}
