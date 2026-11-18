import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import type { BuiltFile } from './file-builders';

/**
 * The PDFs the seed uploads (SPEC S23 section 4, decision Q-D): one A4 page each, written in Vietnamese with Noto Sans embedded, so the file the FE
 * opens shows the number, the amount and the names of the step that attached it. `lines` is the text that was drawn: the font is embedded as glyph
 * codes, so a test reads `lines`, never the bytes.
 */
export interface BuiltPdf extends BuiltFile {
  lines: string[];
}

/** From `steps/` and from `dist/cli/seed/steps/` alike, the font is one folder up and into `assets`. */
const FONT_PATH = join(__dirname, '../assets/fonts/NotoSans-Regular.ttf');
let fontBytes: Buffer | undefined;

const PAGE = { width: 595, height: 842, margin: 56 };
const BODY_SIZE = 11;
const HEADING_SIZE = 17;
const LINE_HEIGHT = 20;

/** `2000000` → `2.000.000`: the groups of thousands of the amounts the FE shows. */
export const grouped = (amount: string | number): string => String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

interface Sheet {
  /** The number of the document: the title in the file's properties. */
  number: string;
  fileName: string;
  heading: string;
  rows: readonly (readonly [label: string, value: string])[];
  footer: string;
  /** The day of the document (`YYYY-MM-DD`), its creation date in the file's properties. */
  date: string;
}

type Font = Awaited<ReturnType<PDFDocument['embedFont']>>;

/** Breaks a text into lines no wider than `maxWidth`, at spaces (a word wider than the line stays on one). */
function wrap(text: string, font: Font, maxWidth: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const next = current === '' ? word : `${current} ${word}`;
    if (current !== '' && font.widthOfTextAtSize(next, BODY_SIZE) > maxWidth) {
      out.push(current);
      current = word;
    } else current = next;
  }
  out.push(current);

  return out;
}

async function render(sheet: Sheet): Promise<BuiltPdf> {
  fontBytes ??= readFileSync(FONT_PATH);
  const document = await PDFDocument.create({ updateMetadata: false });
  document.registerFontkit(fontkit);
  // No `ccmp`: composing the vowels with a dot below (ạ ẹ ị ọ ụ ỵ) from a base and a mark leaves the mark without a Unicode value in the file,
  // so copying or searching the text would give `tri` for "trị". The precomposed glyphs of Noto Sans draw them the same.
  const font = await document.embedFont(fontBytes, { subset: true, features: { ccmp: false } });
  document.setTitle(sheet.number);
  document.setProducer('SaaS-Sentry demo dataset');
  document.setCreator('SaaS-Sentry seed');
  document.setCreationDate(new Date(`${sheet.date}T00:00:00Z`));
  document.setModificationDate(new Date(`${sheet.date}T00:00:00Z`));
  const page = document.addPage([PAGE.width, PAGE.height]);
  const width = PAGE.width - 2 * PAGE.margin;
  const lines: string[] = [sheet.heading];
  let y = PAGE.height - PAGE.margin;
  const draw = (text: string, size: number) => {
    page.drawText(text, { x: PAGE.margin, y, size, font, color: rgb(0.1, 0.1, 0.1) });
    y -= size === HEADING_SIZE ? LINE_HEIGHT + 14 : LINE_HEIGHT;
  };
  draw(sheet.heading, HEADING_SIZE);
  for (const [label, value] of sheet.rows) {
    for (const part of wrap(`${label}: ${value}`, font, width)) {
      lines.push(part);
      draw(part, BODY_SIZE);
    }
  }
  y -= LINE_HEIGHT;
  for (const part of wrap(sheet.footer, font, width)) {
    lines.push(part);
    draw(part, BODY_SIZE);
  }
  const bytes = await document.save({ useObjectStreams: false });

  return { fileName: sheet.fileName, contentType: 'application/pdf', bytes, lines };
}

const DEMO_NOTE = 'Chứng từ mô phỏng của bộ dữ liệu demo, không có giá trị pháp lý.';

export interface ContractSpec {
  number: string;
  name: string;
  vendor: string;
  effectiveFrom: string;
  effectiveTo: string;
}

/** A contract: its number, name, vendor and the days it is in force. */
export function contractPdf(spec: ContractSpec): Promise<BuiltPdf> {
  return render({
    date: spec.effectiveFrom,
    number: spec.number,
    fileName: `${spec.number}.pdf`,
    heading: `Hợp đồng ${spec.number}`,
    rows: [
      ['Số hợp đồng', spec.number],
      ['Tên hợp đồng', spec.name],
      ['Nhà cung cấp', spec.vendor],
      ['Hiệu lực từ', spec.effectiveFrom],
      ['Hiệu lực đến', spec.effectiveTo],
    ],
    footer: DEMO_NOTE,
  });
}

export interface InvoiceSpec {
  vendorInvoiceNumber: string;
  vendorName: string;
  issuedOn: string;
  servicePeriodMonth: string;
  quantity: number;
  /** VND, whole. */
  unitPrice: string;
  netAmount: string;
}

/** A purchase invoice: the figures of the `POST /purchase-invoices` that attaches it. */
export function invoicePdf(spec: InvoiceSpec): Promise<BuiltPdf> {
  return render({
    date: spec.issuedOn,
    number: spec.vendorInvoiceNumber,
    fileName: `${spec.vendorInvoiceNumber}.pdf`,
    heading: `Hóa đơn ${spec.vendorInvoiceNumber}`,
    rows: [
      ['Số hóa đơn', spec.vendorInvoiceNumber],
      ['Nhà cung cấp', spec.vendorName],
      ['Ngày phát hành', spec.issuedOn],
      ['Kỳ dịch vụ', spec.servicePeriodMonth],
      ['Số lượng', String(spec.quantity)],
      ['Đơn giá', `${grouped(spec.unitPrice)} VND`],
      ['Thành tiền chưa thuế', `${grouped(spec.netAmount)} VND`],
    ],
    footer: DEMO_NOTE,
  });
}

export interface ReceiptSpec {
  number: string;
  vendor: string;
  /** VND, whole. */
  amount: string;
  issuedOn: string;
  note: string;
}

/** The proof of a purchase outside the process, attached when Finance records what was spent. */
export function receiptPdf(spec: ReceiptSpec): Promise<BuiltPdf> {
  return render({
    date: spec.issuedOn,
    number: spec.number,
    fileName: `${spec.number}.pdf`,
    heading: `Biên nhận ${spec.number}`,
    rows: [
      ['Số chứng từ', spec.number],
      ['Nhà cung cấp', spec.vendor],
      ['Ngày', spec.issuedOn],
      ['Số tiền đã chi', `${grouped(spec.amount)} VND`],
      ['Ghi chú', spec.note],
    ],
    footer: DEMO_NOTE,
  });
}

export interface SignatureSpec {
  assetCode: string;
  holder: string;
  noticeVersion: string;
  signedOn: string;
}

/** `BM-06`, the record a person signs when a device they hold is monitored: the device, the holder and the version of the notice. */
export function signaturePdf(spec: SignatureSpec): Promise<BuiltPdf> {
  return render({
    date: spec.signedOn,
    number: spec.assetCode,
    fileName: `BM-06-${spec.assetCode}.pdf`,
    heading: `BM-06 Bản ký xác nhận thông báo giám sát — ${spec.assetCode}`,
    rows: [
      ['Mã máy', spec.assetCode],
      ['Người giữ máy', spec.holder],
      ['Phiên bản thông báo', spec.noticeVersion],
      ['Ngày ký', spec.signedOn],
    ],
    footer: DEMO_NOTE,
  });
}
