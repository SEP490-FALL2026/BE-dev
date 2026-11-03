import { normalizeEmail } from '../../../core/email';
import { escapeLikePattern, searchKey } from '../../../core/search-key';

export const VIETNAMESE_ACCENTED_CHARS =
  'áàảãạăắằẳẵặâấầẩẫậÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬéèẻẽẹêếềểễệÉÈẺẼẸÊẾỀỂỄỆíìỉĩịÍÌỈĨỊóòỏõọôốồổỗộơớờởỡợÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢúùủũụưứừửữựÚÙỦŨỤƯỨỪỬỮỰýỳỷỹỵÝỲỶỸỴđĐ';

export const VIETNAMESE_UNACCENTED_CHARS =
  'aaaaaaaaaaaaaaaaaAAAAAAAAAAAAAAAAAeeeeeeeeeeeEEEEEEEEEEEiiiiiIIIIIoooooooooooooooooOOOOOOOOOOOOOOOOOuuuuuuuuuuuUUUUUUUUUUUyyyyyYYYYYdD';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Folds case and Vietnamese accents including đ/Đ, collapsing whitespaces. */
export function foldVietnameseName(name: string): string {
  return searchKey(name).replace(/[đĐ]/g, 'd');
}

export interface EmployeeDirectorySearchCriteria {
  exactId?: string;
  codePattern?: string;
  emailPattern?: string;
  namePattern?: string;
}

function resolveEmailTerm(term: string): string {
  try {
    return normalizeEmail(term);
  } catch {
    return term.toLowerCase();
  }
}

/**
 * Classifies search input `q` (spec OQ-3, US-02-02 AC-24):
 * - If UUID: matches `e.id` only.
 * - Otherwise: matches code, normalized email (or lower email), or accent-folded full name literally.
 */
export function parseSearchTerm(q: string | undefined): EmployeeDirectorySearchCriteria | null {
  const term = q?.trim();
  if (!term) return null;

  if (UUID_PATTERN.test(term)) {
    return { exactId: term.toLowerCase() };
  }

  const escapedCode = escapeLikePattern(term.toUpperCase());
  const emailTerm = resolveEmailTerm(term);
  const escapedEmail = escapeLikePattern(emailTerm);
  const foldedName = foldVietnameseName(term);
  const escapedName = escapeLikePattern(foldedName);

  return {
    codePattern: `%${escapedCode}%`,
    emailPattern: `%${escapedEmail}%`,
    namePattern: `%${escapedName}%`,
  };
}
