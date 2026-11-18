import type { PictureKind } from '../../../infrastructure/object-storage/picture-image';

/** The key of a picture in the storage: a new picture is a new key, so a link to the old one stops working with it. */
export function avatarObjectKey(
  organizationId: string,
  appUserId: string,
  token: string,
  extension: PictureKind['extension'],
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
