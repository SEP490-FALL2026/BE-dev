export type SupportedFileFormat = 'PDF' | 'PNG' | 'JPEG' | 'ZIP' | 'UTF8_TEXT';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const BOM_MAGIC = [0xef, 0xbb, 0xbf];

function startsWith(buffer: Uint8Array, magic: number[]): boolean {
  if (buffer.length < magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (buffer[i] !== magic[i]) return false;
  }
  return true;
}

function hasBinarySignature(prefix: Uint8Array): boolean {
  return (
    startsWith(prefix, PDF_MAGIC) ||
    startsWith(prefix, PNG_MAGIC) ||
    startsWith(prefix, JPEG_MAGIC) ||
    startsWith(prefix, ZIP_MAGIC)
  );
}

function hasInvalidTextBytes(prefix: Uint8Array): boolean {
  const start = startsWith(prefix, BOM_MAGIC) ? BOM_MAGIC.length : 0;
  for (let i = start; i < prefix.length; i += 1) {
    const byte = prefix[i];
    if (byte === 0x00) return true;
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) return true;
  }
  return false;
}

function isValidUtf8(prefix: Uint8Array, truncated?: boolean): boolean {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(prefix, { stream: truncated ?? false });
    return true;
  } catch {
    return false;
  }
}

function matchesUtf8Text(prefix: Uint8Array, truncated?: boolean): boolean {
  if (hasBinarySignature(prefix)) return false;
  if (hasInvalidTextBytes(prefix)) return false;
  return isValidUtf8(prefix, truncated);
}

export function matchesFormat(
  format: SupportedFileFormat,
  prefix: Uint8Array,
  options?: { truncated?: boolean },
): boolean {
  if (prefix.length === 0) return false;

  switch (format) {
    case 'PDF':
      return startsWith(prefix, PDF_MAGIC);
    case 'PNG':
      return startsWith(prefix, PNG_MAGIC);
    case 'JPEG':
      return startsWith(prefix, JPEG_MAGIC);
    case 'ZIP':
      return startsWith(prefix, ZIP_MAGIC);
    case 'UTF8_TEXT':
      return matchesUtf8Text(prefix, options?.truncated);
  }
}
