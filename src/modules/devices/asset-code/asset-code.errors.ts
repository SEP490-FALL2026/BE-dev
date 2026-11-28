/** Every four-digit number of this type and year was issued: no asset code is left to give. */
export class DeviceAssetCodeExhaustedError extends Error {
  constructor() {
    super('No asset code is left for this kind of machine this year.');
    this.name = 'DeviceAssetCodeExhaustedError';
  }
}
