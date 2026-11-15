/** The largest picture of a person: one megabyte (`QĐ-111at`). */
export const AVATAR_MAX_BYTES = 1024 * 1024;

export interface AvatarKind {
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
export function avatarKindOf(bytes: Uint8Array): AvatarKind | null {
  if (startsWith(bytes, PNG)) return { extension: 'png', contentType: 'image/png' };
  if (startsWith(bytes, JPEG)) return { extension: 'jpg', contentType: 'image/jpeg' };
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return { extension: 'webp', contentType: 'image/webp' };

  return null;
}

export type AvatarRefusal = 'EMPTY' | 'TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'TYPE_MISMATCH';
export type AvatarJudgement = { ok: true; kind: AvatarKind } | { ok: false; reason: AvatarRefusal };

/**
 * Whether a file may become the picture of a person: not empty, within one megabyte, a png, jpeg or webp by its signature, and what it
 * declared to be. The order is the order of the answers: an empty file, one too large (413), a type not allowed (415), a type that
 * is not the one declared (422).
 */
export function judgeAvatar(input: { bytes: Uint8Array; declaredContentType: string }): AvatarJudgement {
  if (input.bytes.length === 0) return { ok: false, reason: 'EMPTY' };
  if (input.bytes.length > AVATAR_MAX_BYTES) return { ok: false, reason: 'TOO_LARGE' };
  const kind = avatarKindOf(input.bytes);
  if (!kind) return { ok: false, reason: 'UNSUPPORTED_TYPE' };
  if (kind.contentType !== input.declaredContentType.trim().toLowerCase())
    return { ok: false, reason: 'TYPE_MISMATCH' };

  return { ok: true, kind };
}

/** The key of a picture in the storage: a new picture is a new key, so a link to the old one stops working with it. */
export function avatarObjectKey(
  organizationId: string,
  appUserId: string,
  token: string,
  extension: AvatarKind['extension'],
): string {
  return `avatars/${organizationId}/${appUserId}/${token}.${extension}`;
}

export type WorkPhone = { ok: true; value: string | null } | { ok: false };

const PHONE = /^\+?[0-9]{8,15}$/;

/**
 * The work phone as it is kept (`R-22`): the digits of a number with an optional leading `+` (`+84…`), spaces, dots and dashes taken out, 8 to
 * 15 digits. Nothing or only blanks clears the number.
 */
export function normalizeWorkPhone(raw: string | null): WorkPhone {
  const cleaned = (raw ?? '').replace(/[\s.-]/g, '');
  if (cleaned === '') return { ok: true, value: null };

  return PHONE.test(cleaned) ? { ok: true, value: cleaned } : { ok: false };
}
