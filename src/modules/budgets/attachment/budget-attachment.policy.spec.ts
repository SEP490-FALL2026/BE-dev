import {
  BudgetAttachmentFileInvalidError,
  BudgetAttachmentTooLargeError,
  BudgetAttachmentTypeNotAllowedError,
} from './budget-attachment.errors';
import {
  assertFileAllowed,
  budgetRecordView,
  expiresAt,
  extensionOf,
  formatForContentType,
} from './budget-attachment.policy';

describe('budget-attachment.policy', () => {
  const MB = 1024 * 1024;
  const maxBytes = 10 * MB;

  describe('assertFileAllowed', () => {
    it('accepts valid files for all allowed extensions and matching mime types', () => {
      expect(() =>
        assertFileAllowed({
          fileName: 'bao-gia-figma-2027.pdf',
          contentType: 'application/pdf',
          sizeBytes: 50 * 1024,
          maxBytes,
        }),
      ).not.toThrow();

      expect(() =>
        assertFileAllowed({
          fileName: 'bang-tinh.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sizeBytes: 100 * 1024,
          maxBytes,
        }),
      ).not.toThrow();

      expect(() =>
        assertFileAllowed({
          fileName: 'bien-ban.docx',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sizeBytes: 100 * 1024,
          maxBytes,
        }),
      ).not.toThrow();

      expect(() =>
        assertFileAllowed({
          fileName: 'nhu-cau-2027.csv',
          contentType: 'text/csv',
          sizeBytes: 5 * 1024,
          maxBytes,
        }),
      ).not.toThrow();

      expect(() =>
        assertFileAllowed({
          fileName: 'anh-chup.png',
          contentType: 'image/png',
          sizeBytes: 20 * 1024,
          maxBytes,
        }),
      ).not.toThrow();

      expect(() =>
        assertFileAllowed({
          fileName: 'hoa-don.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 20 * 1024,
          maxBytes,
        }),
      ).not.toThrow();
    });

    it('refuses invalid file names: blank, too long, containing slashes or control characters', () => {
      for (const badName of [
        '   ',
        'a'.repeat(201) + '.pdf',
        'folder/file.pdf',
        'folder\\file.pdf',
        'file\x00.pdf',
        'file\x1f.pdf',
      ]) {
        expect(() =>
          assertFileAllowed({
            fileName: badName,
            contentType: 'application/pdf',
            sizeBytes: 1024,
            maxBytes,
          }),
        ).toThrow(BudgetAttachmentFileInvalidError);
      }
    });

    it('refuses non-positive size with EMPTY problem', () => {
      try {
        assertFileAllowed({
          fileName: 'file.pdf',
          contentType: 'application/pdf',
          sizeBytes: 0,
          maxBytes,
        });
        fail('expected to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(BudgetAttachmentFileInvalidError);
        expect((e as BudgetAttachmentFileInvalidError).problem).toBe('EMPTY');
      }
    });

    it('refuses file exceeding maxBytes', () => {
      expect(() =>
        assertFileAllowed({
          fileName: 'large.pdf',
          contentType: 'application/pdf',
          sizeBytes: maxBytes + 1,
          maxBytes,
        }),
      ).toThrow(BudgetAttachmentTooLargeError);
    });

    it('refuses forbidden extensions (.exe, .txt, .xls, .xlsm, .doc)', () => {
      for (const badExt of ['setup.exe', 'notes.txt', 'old.xls', 'macro.xlsm', 'word.doc']) {
        expect(() =>
          assertFileAllowed({
            fileName: badExt,
            contentType: 'application/octet-stream',
            sizeBytes: 1024,
            maxBytes,
          }),
        ).toThrow(BudgetAttachmentTypeNotAllowedError);
      }
    });

    it('refuses mismatch between extension and contentType', () => {
      expect(() =>
        assertFileAllowed({
          fileName: 'bao-gia.pdf',
          contentType: 'image/png',
          sizeBytes: 1024,
          maxBytes,
        }),
      ).toThrow(BudgetAttachmentTypeNotAllowedError);
    });
  });

  describe('extensionOf and formatForContentType', () => {
    it('extracts extension accurately', () => {
      expect(extensionOf('file.PDF')).toBe('pdf');
      expect(extensionOf('multiple.dots.name.xlsx')).toBe('xlsx');
      expect(extensionOf('nodot')).toBe('');
      expect(extensionOf('.hidden')).toBe('');
    });

    it('maps content type to binary format for inspection', () => {
      expect(formatForContentType('application/pdf')).toBe('PDF');
      expect(formatForContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('ZIP');
      expect(formatForContentType('text/csv')).toBe('UTF8_TEXT');
      expect(formatForContentType('unknown/type')).toBeNull();
    });
  });

  describe('budgetRecordView', () => {
    const costCenterA = 'cc-a';
    const costCenterB = 'cc-b';
    const sentDate = new Date('2026-11-01T10:00:00Z');

    it('gives FULL view to Finance or Decider regardless of cost center or sent date', () => {
      expect(
        budgetRecordView({
          isFinance: true,
          isDecider: false,
          headedCostCenterIds: [],
          recordCostCenterId: costCenterA,
          versionSentAt: null,
        }),
      ).toBe('FULL');

      expect(
        budgetRecordView({
          isFinance: false,
          isDecider: true,
          headedCostCenterIds: [costCenterB],
          recordCostCenterId: costCenterA,
          versionSentAt: null,
        }),
      ).toBe('FULL');
    });

    it('gives FULL view for proposal (versionSentAt undefined) to the head of that Cost Center', () => {
      expect(
        budgetRecordView({
          isFinance: false,
          isDecider: false,
          headedCostCenterIds: [costCenterA],
          recordCostCenterId: costCenterA,
          versionSentAt: undefined,
        }),
      ).toBe('FULL');
    });

    it('gives AS_LAST_SENT for sent version to the head of that Cost Center', () => {
      expect(
        budgetRecordView({
          isFinance: false,
          isDecider: false,
          headedCostCenterIds: [costCenterA],
          recordCostCenterId: costCenterA,
          versionSentAt: sentDate,
        }),
      ).toBe('AS_LAST_SENT');
    });

    it('gives NONE for unsent version (versionSentAt null) to the head of that Cost Center', () => {
      expect(
        budgetRecordView({
          isFinance: false,
          isDecider: false,
          headedCostCenterIds: [costCenterA],
          recordCostCenterId: costCenterA,
          versionSentAt: null,
        }),
      ).toBe('NONE');
    });

    it('gives NONE to head of different Cost Center or ordinary employee', () => {
      expect(
        budgetRecordView({
          isFinance: false,
          isDecider: false,
          headedCostCenterIds: [costCenterB],
          recordCostCenterId: costCenterA,
          versionSentAt: sentDate,
        }),
      ).toBe('NONE');

      expect(
        budgetRecordView({
          isFinance: false,
          isDecider: false,
          headedCostCenterIds: [],
          recordCostCenterId: costCenterA,
          versionSentAt: sentDate,
        }),
      ).toBe('NONE');
    });
  });

  describe('expiresAt', () => {
    it('calculates 24h for AWAITING_UPLOAD and 7 days for UPLOADED', () => {
      const created = new Date('2026-11-01T00:00:00Z');
      expect(expiresAt('AWAITING_UPLOAD', created)).toEqual(new Date('2026-11-02T00:00:00Z'));
      expect(expiresAt('UPLOADED', created)).toEqual(new Date('2026-11-08T00:00:00Z'));
    });
  });
});
