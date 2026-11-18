import { attachmentDisposition } from './content-disposition';

describe('attachmentDisposition (SEC-01, SEC-07)', () => {
  it('is always an attachment, with the plain name and the real one', () => {
    expect(attachmentDisposition('hop-dong-k1.pdf')).toBe(
      `attachment; filename="hop-dong-k1.pdf"; filename*=UTF-8''hop-dong-k1.pdf`,
    );
    expect(attachmentDisposition('Hợp đồng K1.pdf')).toBe(
      `attachment; filename="H_p __ng K1.pdf"; filename*=UTF-8''H%E1%BB%A3p%20%C4%91%E1%BB%93ng%20K1.pdf`,
    );
  });

  it('cannot be made to end the header, start another or change the disposition', () => {
    const header = attachmentDisposition("a\";\r\nSet-Cookie: x=1; inline; filename*=UTF-8''evil.html");

    expect(header.startsWith('attachment; ')).toBe(true);
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.match(/filename=/g)).toHaveLength(1);
    // The name can only ever sit inside the one pair of quotes; no quote and no `;` of its own gets out of it.
    expect(header.match(/"/g)).toHaveLength(2);
    expect(header.split('"')[2]).toMatch(/^; filename\*=UTF-8''[A-Za-z0-9%._-]*$/);
  });

  it('never answers an empty name', () => {
    expect(attachmentDisposition('')).toBe(`attachment; filename="file"; filename*=UTF-8''`);
  });
});
