import {
  foldVietnameseName,
  parseSearchTerm,
  VIETNAMESE_ACCENTED_CHARS,
  VIETNAMESE_UNACCENTED_CHARS,
} from './employee-directory-search.policy';
import { escapeLikePattern } from '../employee/employee.policy';

describe('employee-directory-search.policy', () => {
  it('returns null for undefined, empty or whitespace strings', () => {
    expect(parseSearchTerm(undefined)).toBeNull();
    expect(parseSearchTerm('')).toBeNull();
    expect(parseSearchTerm('   ')).toBeNull();
  });

  it('classifies UUIDs (case-insensitive) as exactId matches only', () => {
    const uuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    expect(parseSearchTerm(uuid)).toEqual({ exactId: uuid.toLowerCase() });
    expect(parseSearchTerm(uuid.toUpperCase())).toEqual({ exactId: uuid.toLowerCase() });
  });

  it('classifies general search queries into code, email, and folded name patterns', () => {
    const result = parseSearchTerm('NV-0001');
    expect(result).toEqual({
      codePattern: '%NV-0001%',
      emailPattern: '%nv-0001%',
      namePattern: '%nv-0001%',
    });
  });

  it('strips +tag from valid email search queries', () => {
    const result = parseSearchTerm('a.nguyen+test@congty.vn');
    expect(result).toEqual({
      codePattern: '%A.NGUYEN+TEST@CONGTY.VN%',
      emailPattern: '%a.nguyen@congty.vn%',
      namePattern: '%a.nguyen+test@congty.vn%',
    });
  });

  it('folds Vietnamese accents including đ/Đ into d for name search', () => {
    expect(foldVietnameseName('Nguyễn Văn A')).toBe('nguyen van a');
    expect(foldVietnameseName('ĐẶNG THỊ BÍCH')).toBe('dang thi bich');
    expect(foldVietnameseName('Lê Đức Thọ')).toBe('le duc tho');

    const result = parseSearchTerm('Nguyễn Đặng');
    expect(result).toEqual({
      codePattern: '%NGUYỄN ĐẶNG%',
      emailPattern: '%nguyễn đặng%',
      namePattern: '%nguyen dang%',
    });
  });

  it('escapes %, _, and \\ so they match literally', () => {
    expect(escapeLikePattern('50%_off\\now')).toBe('50\\%\\_off\\\\now');

    const result = parseSearchTerm('50%');
    expect(result).toEqual({
      codePattern: '%50\\%%',
      emailPattern: '%50\\%%',
      namePattern: '%50\\%%',
    });
  });

  it('maintains 1:1 length between VIETNAMESE_ACCENTED_CHARS and VIETNAMESE_UNACCENTED_CHARS', () => {
    expect(VIETNAMESE_ACCENTED_CHARS.length).toBe(VIETNAMESE_UNACCENTED_CHARS.length);
  });

  it('matches JS fold with simulated SQL translate for Vietnamese name samples', () => {
    const sqlTranslateSim = (text: string) => {
      let s = text;
      for (let i = 0; i < VIETNAMESE_ACCENTED_CHARS.length; i += 1) {
        s = s.replaceAll(VIETNAMESE_ACCENTED_CHARS[i], VIETNAMESE_UNACCENTED_CHARS[i]);
      }
      return s.toLowerCase().replace(/\s+/g, ' ').trim();
    };

    const samples = [
      'Nguyễn Văn A',
      'ĐẶNG THỊ BÍCH',
      'Lê Đức Thọ',
      'Trần Đình Trọng',
      'Vũ Khắc Tiệp',
      'Phạm Nhật Vượng',
      'Đinh Bộ Lĩnh',
    ];

    for (const name of samples) {
      expect(foldVietnameseName(name)).toBe(sqlTranslateSim(name));
    }
  });
});
