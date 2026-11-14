import { createApplicationBodySchema } from '../application-intake/application-intake.dto';
import { logoUrlSchema, updateApplicationBodySchema } from './application.dto';

const create = (extra: object) =>
  createApplicationBodySchema.safeParse({
    name: 'Figma',
    vendorName: 'Figma Inc',
    plan: { name: 'Organization', provisioningType: 'K2', controlLevel: 'FULL' },
    ...extra,
  });

describe('the logo of an application is a link to an image, https only (CT-1.L1)', () => {
  it.each([
    'https://cdn.example.com/figma.png',
    'https://cdn.example.com/a/b/figma.svg?size=64&v=2',
    'HTTPS://CDN.EXAMPLE.COM/LOGO.PNG',
    `https://cdn.example.com/${'a'.repeat(500 - 'https://cdn.example.com/'.length)}`,
  ])('takes %s', (link) => {
    expect(logoUrlSchema.safeParse(link).success).toBe(true);
  });

  it.each([
    ['http, which is not encrypted', 'http://cdn.example.com/figma.png'],
    ['a script', 'javascript:alert(1)'],
    ['a data link', 'data:image/png;base64,AAAA'],
    ['a file link', 'file:///etc/passwd'],
    ['a link with another scheme', 'ftp://cdn.example.com/figma.png'],
    ['no scheme at all', 'cdn.example.com/figma.png'],
    ['a scheme with no host', 'https://'],
    ['text that is not a link', 'a logo'],
    ['an empty text', ''],
    ['a link of 501 characters', `https://cdn.example.com/${'a'.repeat(501 - 'https://cdn.example.com/'.length)}`],
  ])('refuses %s', (_name, link) => {
    expect(logoUrlSchema.safeParse(link).success).toBe(false);
  });

  it('trims the blanks at both ends before it judges the link, and keeps the link as written', () => {
    expect(logoUrlSchema.parse('  https://cdn.example.com/figma.png \n')).toBe('https://cdn.example.com/figma.png');
    expect(logoUrlSchema.safeParse('  http://cdn.example.com/figma.png ').success).toBe(false);
    // 501 characters once the blanks are gone is still too long; 500 with blanks around it is fine.
    const exact = `https://cdn.example.com/${'a'.repeat(500 - 'https://cdn.example.com/'.length)}`;
    expect(logoUrlSchema.safeParse(`  ${exact}  `).success).toBe(true);
  });

  it('is optional when an application is declared and answers 422 for a link that is not https', () => {
    expect(create({}).success).toBe(true);
    expect(create({ logoUrl: 'https://cdn.example.com/figma.png' }).success).toBe(true);
    expect(create({ logoUrl: 'http://cdn.example.com/figma.png' }).success).toBe(false);
    expect(create({ logoUrl: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('is kept when an update leaves it out, replaced by a link and cleared by null', () => {
    expect('logoUrl' in updateApplicationBodySchema.parse({ name: 'Figma' })).toBe(false);
    expect(updateApplicationBodySchema.parse({ logoUrl: 'https://cdn.example.com/figma.png' }).logoUrl).toBe(
      'https://cdn.example.com/figma.png',
    );
    expect(updateApplicationBodySchema.parse({ logoUrl: null }).logoUrl).toBeNull();
    expect(updateApplicationBodySchema.safeParse({ logoUrl: 'http://cdn.example.com/figma.png' }).success).toBe(false);
    expect(updateApplicationBodySchema.safeParse({ logoUrl: '' }).success).toBe(false);
  });
});
