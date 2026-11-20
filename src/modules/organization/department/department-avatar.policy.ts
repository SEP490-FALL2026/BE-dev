import type { PictureKind } from '../../../infrastructure/object-storage/picture-image';

/** How long the link to the picture of a department works: the same as the picture of a person (`QĐ-113c`, `QĐ-111at`). */
export const DEPARTMENT_AVATAR_LINK_SECONDS = 15 * 60;

/** The key of the picture of a department: a new picture is a new key, so a link to the old one stops working with it. */
export function departmentAvatarObjectKey(
  organizationId: string,
  departmentId: string,
  token: string,
  extension: PictureKind['extension'],
): string {
  return `department-avatars/${organizationId}/${departmentId}/${token}.${extension}`;
}
