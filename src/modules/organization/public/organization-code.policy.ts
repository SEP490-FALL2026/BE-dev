/** Organization codes consist of uppercase alphanumeric groups separated by single hyphens. */
export const ORGANIZATION_CODE_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
export function isEmployeeCodeValid(code: string): boolean {
  return code.length >= 3 && code.length <= 20 && ORGANIZATION_CODE_PATTERN.test(code);
}
export function isDepartmentCodeValid(code: string): boolean {
  return code.length >= 2 && code.length <= 20 && ORGANIZATION_CODE_PATTERN.test(code);
}
