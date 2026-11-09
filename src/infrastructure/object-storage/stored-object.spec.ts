import { isObjectChanged, isObjectMissing } from './stored-object';

describe('stored-object error recognizers', () => {
  describe('isObjectMissing', () => {
    it('recognizes 404, NotFound and NoSuchKey', () => {
      expect(isObjectMissing({ name: 'NotFound' })).toBe(true);
      expect(isObjectMissing({ name: 'NoSuchKey' })).toBe(true);
      expect(isObjectMissing({ code: 'NotFound' })).toBe(true);
      expect(isObjectMissing({ code: 'NoSuchKey' })).toBe(true);
      expect(isObjectMissing({ $metadata: { httpStatusCode: 404 } })).toBe(true);
      expect(isObjectMissing({ status: 404 })).toBe(true);
    });

    it('returns false for other errors or primitives', () => {
      expect(isObjectMissing({ name: 'PreconditionFailed' })).toBe(false);
      expect(isObjectMissing({ status: 500 })).toBe(false);
      expect(isObjectMissing(null)).toBe(false);
      expect(isObjectMissing(undefined)).toBe(false);
      expect(isObjectMissing('error')).toBe(false);
    });
  });

  describe('isObjectChanged', () => {
    it('recognizes 412 and PreconditionFailed', () => {
      expect(isObjectChanged({ name: 'PreconditionFailed' })).toBe(true);
      expect(isObjectChanged({ code: 'PreconditionFailed' })).toBe(true);
      expect(isObjectChanged({ $metadata: { httpStatusCode: 412 } })).toBe(true);
      expect(isObjectChanged({ status: 412 })).toBe(true);
    });

    it('returns false for other errors or primitives', () => {
      expect(isObjectChanged({ name: 'NotFound' })).toBe(false);
      expect(isObjectChanged({ status: 500 })).toBe(false);
      expect(isObjectChanged(null)).toBe(false);
      expect(isObjectChanged(undefined)).toBe(false);
      expect(isObjectChanged('error')).toBe(false);
    });
  });
});
