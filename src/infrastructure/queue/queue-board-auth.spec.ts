import crypto from 'node:crypto';
import { credentialsMatch } from './queue-board-auth';

const expected = { username: 'ops', password: 'mật:khẩu:fixture' };
const header = (value: string) => `Basic ${Buffer.from(value).toString('base64')}`;

describe('queue board credentials', () => {
  it('splits on the first colon and compares both SHA-256 digests in constant time', () => {
    const compare = jest.spyOn(crypto, 'timingSafeEqual');
    try {
      expect(credentialsMatch(header('ops:mật:khẩu:fixture'), expected)).toBe(true);
      expect(compare.mock.calls.map(([left, right]) => [left.byteLength, right.byteLength])).toEqual([
        [32, 32],
        [32, 32],
      ]);
      compare.mockClear();
      expect(credentialsMatch(header('x:short'), expected)).toBe(false);
      expect(compare).toHaveBeenCalledTimes(2);
    } finally {
      compare.mockRestore();
    }
  });

  it.each([
    undefined,
    'Bearer fixture',
    'Basic ^abc',
    'Basic YTpi====',
    'Basic YT',
    header('ops'),
    header('ops:wrong'),
    header('other:mật:khẩu:fixture'),
    'Basic b3BzOv8=',
  ])('rejects malformed or incorrect authorization %s', (authorization) => {
    expect(credentialsMatch(authorization, expected)).toBe(false);
  });

  it('rejects an empty configuration', () => {
    expect(credentialsMatch(header(':'), { username: '', password: '' })).toBe(false);
  });
});
