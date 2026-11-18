/**
 * Pure check of a picture (`QĐ-111at` for a person, `QĐ-113c` for a department): shared, with no framework and no storage.
 * The largest picture of a person or a department is one megabyte (`QĐ-111at`).
 */
export const PICTURE_MAX_BYTES = 1024 * 1024;

export interface PictureKind {
  extension: 'png' | 'jpg' | 'webp';
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/**
 * What the first bytes of a file say it is, read from the signature and never from its name or its declared type (`QĐ-111at`): png, jpeg or
 * webp (a RIFF container whose form is WEBP), and nothing else. A file too short to hold its signature is none of them.
 */
export function pictureKindOf(bytes: Uint8Array): PictureKind | null {
  if (startsWith(bytes, PNG)) return { extension: 'png', contentType: 'image/png' };
  if (startsWith(bytes, JPEG)) return { extension: 'jpg', contentType: 'image/jpeg' };
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return { extension: 'webp', contentType: 'image/webp' };

  return null;
}

export type PictureRefusal = 'EMPTY' | 'TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'TYPE_MISMATCH';
export type PictureJudgement = { ok: true; kind: PictureKind } | { ok: false; reason: PictureRefusal };

/**
 * Whether a file may become the picture of a person or of a department: not empty, within one megabyte, a png, jpeg or webp by its signature, and what it
 * declared to be. The order is the order of the answers: an empty file, one too large (413), a type not allowed (415), a type that
 * is not the one declared (422).
 */
export function judgePicture(input: { bytes: Uint8Array; declaredContentType: string }): PictureJudgement {
  if (input.bytes.length === 0) return { ok: false, reason: 'EMPTY' };
  if (input.bytes.length > PICTURE_MAX_BYTES) return { ok: false, reason: 'TOO_LARGE' };
  const kind = pictureKindOf(input.bytes);
  if (!kind) return { ok: false, reason: 'UNSUPPORTED_TYPE' };
  if (kind.contentType !== input.declaredContentType.trim().toLowerCase())
    return { ok: false, reason: 'TYPE_MISMATCH' };

  return { ok: true, kind };
}
