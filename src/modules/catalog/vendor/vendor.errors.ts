export class VendorNotFoundError extends Error {
  constructor() {
    super('The vendor does not exist.');
    this.name = 'VendorNotFoundError';
  }
}
