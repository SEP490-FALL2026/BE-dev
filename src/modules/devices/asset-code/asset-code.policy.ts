/** The kind of machine the asset code names; the code starts with it. */
export const ASSET_DEVICE_TYPES = ['LAP', 'PC', 'OTH'] as const;
export type AssetDeviceType = (typeof ASSET_DEVICE_TYPES)[number];

/** The number of a code has four digits, so the last one a type can take in a year. */
export const MAX_ASSET_NUMBER = 9999;

const GENERATED_FORM = /^(LAP|PC|OTH)-\d{2}-\d{4}$/;
const TYPED_FORM = /^[A-Z0-9-]{3,20}$/;

/** `LAP-26-0007`: the type, the two last digits of the year and the number in four digits. */
export function formatAssetCode(type: AssetDeviceType, year: number, number: number): string {
  return `${type}-${String(year % 100).padStart(2, '0')}-${String(number).padStart(4, '0')}`;
}

/** Whether a code has the form the generator writes. */
export function isGeneratedForm(code: string): boolean {
  return GENERATED_FORM.test(code);
}

/**
 * Whether a code a person typed (a machine bought before the generator, entered as it already was) is one the register takes: 3 to 20
 * capital letters, digits and hyphens, and never the generated form, so a typed code cannot be taken for one the counter has issued.
 * The code is judged as typed; the caller trims and capitalizes it first if it means to.
 */
export function isLegacyCodeAcceptable(code: string): boolean {
  return TYPED_FORM.test(code) && !isGeneratedForm(code);
}

/** The number after the last one issued, or null when every four-digit number of the type and year was issued. */
export function nextAssetNumber(lastValue: number): number | null {
  return lastValue >= MAX_ASSET_NUMBER ? null : lastValue + 1;
}
