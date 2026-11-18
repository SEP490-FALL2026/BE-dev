/**
 * The caller may not read this overview: they do not hold its role, or (a head) there is no department they head on the business day.
 * The route answers it as the guard answers a wrong role.
 */
export class DashboardRefusedError extends Error {
  constructor() {
    super('The caller may not read this overview.');
    this.name = 'DashboardRefusedError';
  }
}
