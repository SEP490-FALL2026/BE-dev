import { searchKey } from './search-key';

describe('searchKey', () => {
  it.each([
    ['Figma', 'figma'],
    ['  FÍGMA   Inc ', 'figma inc'],
    ['Thiết kế giao diện', 'thiet ke giao dien'],
    ['Công ty\tKé  Toán', 'cong ty ke toan'],
    ['', ''],
    ['   ', ''],
  ])('%j has the key %j', (text, key) => {
    expect(searchKey(text)).toBe(key);
  });

  it('gives a composed and a decomposed accent the same key', () => {
    expect(searchKey('é')).toBe(searchKey('é'));
  });
});
