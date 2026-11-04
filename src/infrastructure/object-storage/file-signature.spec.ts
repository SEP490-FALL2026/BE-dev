import { matchesFormat } from './file-signature';

describe('file-signature matchesFormat', () => {
  it('identifies PDF prefix', () => {
    expect(matchesFormat('PDF', Buffer.from('%PDF-1.7'))).toBe(true);
    expect(matchesFormat('PDF', Buffer.from('NOT-PDF'))).toBe(false);
    expect(matchesFormat('PDF', Buffer.from([]))).toBe(false);
  });

  it('identifies PNG prefix', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(matchesFormat('PNG', png)).toBe(true);
    expect(matchesFormat('PNG', Buffer.from('PNG-fake'))).toBe(false);
  });

  it('identifies JPEG prefix', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(matchesFormat('JPEG', jpeg)).toBe(true);
    expect(matchesFormat('JPEG', Buffer.from([0xff, 0xd8, 0x00]))).toBe(false);
  });

  it('identifies ZIP prefix (xlsx, docx)', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(matchesFormat('ZIP', zip)).toBe(true);
    expect(matchesFormat('ZIP', Buffer.from('PK-fake'))).toBe(false);
  });

  describe('UTF8_TEXT', () => {
    it('accepts clean UTF-8 text with tabs, newlines, carriage returns', () => {
      const csv = Buffer.from('code,name,amount\nP-01,Product\tOne,1000\r\n');
      expect(matchesFormat('UTF8_TEXT', csv)).toBe(true);
    });

    it('accepts UTF-8 text with BOM', () => {
      const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello,world\n')]);
      expect(matchesFormat('UTF8_TEXT', withBom)).toBe(true);
    });

    it('refuses binary signatures even if text follows', () => {
      expect(matchesFormat('UTF8_TEXT', Buffer.from('%PDF-fake-csv'))).toBe(false);
      expect(matchesFormat('UTF8_TEXT', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x61, 0x62]))).toBe(false);
      expect(matchesFormat('UTF8_TEXT', Buffer.from([0xff, 0xd8, 0xff, 0x61, 0x62]))).toBe(false);
      expect(matchesFormat('UTF8_TEXT', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(false);
    });

    it('refuses byte 00 and C0 control characters other than tab/LF/CR', () => {
      expect(matchesFormat('UTF8_TEXT', Buffer.from('hello\0world'))).toBe(false);
      expect(matchesFormat('UTF8_TEXT', Buffer.from('hello\x01world'))).toBe(false);
      expect(matchesFormat('UTF8_TEXT', Buffer.from('hello\x08world'))).toBe(false);
      expect(matchesFormat('UTF8_TEXT', Buffer.from('hello\x1bworld'))).toBe(false);
    });

    it('refuses invalid UTF-8 byte sequences', () => {
      expect(matchesFormat('UTF8_TEXT', Buffer.from([0xff, 0xfe]))).toBe(false);
      expect(matchesFormat('UTF8_TEXT', Buffer.from([0xc0, 0xaf]))).toBe(false);
    });

    it('handles truncated UTF-8 sequences based on truncated option', () => {
      // 0xE1 0xBB is incomplete 3-byte character 'ệ' (0xE1 0xBB 0x87)
      const prefixWithIncomplete = Buffer.concat([Buffer.from('Tiếng Việt: '), Buffer.from([0xe1, 0xbb])]);

      // When truncated is false: should be rejected
      expect(matchesFormat('UTF8_TEXT', prefixWithIncomplete, { truncated: false })).toBe(false);
      expect(matchesFormat('UTF8_TEXT', prefixWithIncomplete)).toBe(false);

      // When truncated is true: should be accepted
      expect(matchesFormat('UTF8_TEXT', prefixWithIncomplete, { truncated: true })).toBe(true);
    });
  });
});
