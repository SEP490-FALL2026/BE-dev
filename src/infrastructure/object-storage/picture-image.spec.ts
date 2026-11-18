import { PICTURE_MAX_BYTES, pictureKindOf, judgePicture } from './picture-image';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const WAV = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20]);

describe('pictureKindOf (the signature of the file, QĐ-111at)', () => {
  it('knows png, jpeg and webp by their first bytes', () => {
    expect(pictureKindOf(PNG)).toEqual({ extension: 'png', contentType: 'image/png' });
    expect(pictureKindOf(JPEG)).toEqual({ extension: 'jpg', contentType: 'image/jpeg' });
    expect(pictureKindOf(WEBP)).toEqual({ extension: 'webp', contentType: 'image/webp' });
  });

  it('knows nothing else: a gif, another RIFF file, text, an empty file', () => {
    expect(pictureKindOf(GIF)).toBeNull();
    expect(pictureKindOf(WAV)).toBeNull();
    expect(pictureKindOf(Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')))).toBeNull();
    expect(pictureKindOf(new Uint8Array(0))).toBeNull();
  });

  it('does not take a short file that only starts like one', () => {
    expect(pictureKindOf(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(pictureKindOf(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('judgePicture', () => {
  it('accepts a file of a known signature whose declared type is the one it really is', () => {
    expect(judgePicture({ bytes: PNG, declaredContentType: 'image/png' })).toEqual({
      ok: true,
      kind: { extension: 'png', contentType: 'image/png' },
    });
  });

  it('accepts exactly one megabyte and refuses one byte more with TOO_LARGE', () => {
    const exactly = new Uint8Array(PICTURE_MAX_BYTES);
    exactly.set(PNG);
    const more = new Uint8Array(PICTURE_MAX_BYTES + 1);
    more.set(PNG);

    expect(judgePicture({ bytes: exactly, declaredContentType: 'image/png' }).ok).toBe(true);
    expect(judgePicture({ bytes: more, declaredContentType: 'image/png' })).toEqual({ ok: false, reason: 'TOO_LARGE' });
  });

  it('refuses a type that is not png, jpeg or webp with UNSUPPORTED_TYPE, whatever it declares', () => {
    expect(judgePicture({ bytes: GIF, declaredContentType: 'image/png' })).toEqual({
      ok: false,
      reason: 'UNSUPPORTED_TYPE',
    });
    expect(judgePicture({ bytes: GIF, declaredContentType: 'image/gif' })).toEqual({
      ok: false,
      reason: 'UNSUPPORTED_TYPE',
    });
  });

  it('refuses a file that is not what it says with TYPE_MISMATCH', () => {
    expect(judgePicture({ bytes: JPEG, declaredContentType: 'image/png' })).toEqual({
      ok: false,
      reason: 'TYPE_MISMATCH',
    });
  });

  it('refuses an empty file with EMPTY', () => {
    expect(judgePicture({ bytes: new Uint8Array(0), declaredContentType: 'image/png' })).toEqual({
      ok: false,
      reason: 'EMPTY',
    });
  });
});
