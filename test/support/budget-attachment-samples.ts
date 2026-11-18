import * as crypto from 'crypto';
import * as zlib from 'zlib';

export interface SampleManifestEntry {
  file: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  declare: { status: number; code?: string };
  complete: { status: number; code?: string } | null;
}

export interface SampleFileDescriptor extends SampleManifestEntry {
  content: Buffer;
}

interface ZipEntry {
  path: string;
  data: Buffer;
}

function buildStoredZip(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.path, 'utf-8');
    const crc = zlib.crc32(entry.data) >>> 0;
    const size = entry.data.length;

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(10, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    localHeaders.push(local);
    localHeaders.push(entry.data);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(10, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    centralHeaders.push(central);
    offset += local.length + entry.data.length;
  }

  const cdBuf = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, cdBuf, eocd]);
}

function buildDeterministicPdf(text: string): Buffer {
  const header = '%PDF-1.4\n';
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 =
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n';
  const streamContent = `BT /F1 12 Tf 72 712 Td (${text}) Tj ET\n`;
  const obj4 = `4 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf-8')} >>\nstream\n${streamContent}endstream\nendobj\n`;
  const obj5 = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  const objects = [obj1, obj2, obj3, obj4, obj5];
  let offset = Buffer.byteLength(header, 'ascii');
  const offsets = [offset];
  for (let i = 0; i < objects.length - 1; i += 1) {
    offset += Buffer.byteLength(objects[i], 'ascii');
    offsets.push(offset);
  }

  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) {
    xref += `${o.toString().padStart(10, '0')} 00000 n \n`;
  }

  const totalOffset = offset + Buffer.byteLength(objects[objects.length - 1], 'ascii');
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${totalOffset}\n%%EOF\n`;

  return Buffer.from(header + objects.join('') + xref + trailer, 'ascii');
}

function buildPngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcVal = zlib.crc32(Buffer.concat([t, data])) >>> 0;
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, t, data, crc]);
}

function buildSmallPng(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // width 1
  ihdr.writeUInt32BE(1, 4); // height 1
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const rawData = Buffer.from([0, 0, 128, 255]); // filter 0, pixel color
  const idat = zlib.deflateSync(rawData);
  return Buffer.concat([
    sig,
    buildPngChunk('IHDR', ihdr),
    buildPngChunk('IDAT', idat),
    buildPngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// 1x1 red pixel JPEG (standard JFIF structure)
const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00,
  0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08,
  0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a,
  0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34,
  0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00,
  0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01,
  0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
  0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf, 0x80, 0xff, 0xd9,
]);

export function buildSampleFiles(): SampleFileDescriptor[] {
  const pdfBytes = buildDeterministicPdf('Bao gia Figma Organization 2027 -- tep mau kiem thu');

  const xlsxBytes = buildStoredZip([
    {
      path: '[Content_Types].xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '</Types>',
        'utf-8',
      ),
    },
    {
      path: '_rels/.rels',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
        'utf-8',
      ),
    },
    {
      path: 'xl/workbook.xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          '<sheets><sheet name="Ngan sach" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets>' +
          '</workbook>',
        'utf-8',
      ),
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '</Relationships>',
        'utf-8',
      ),
    },
    {
      path: 'xl/worksheets/sheet1.xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          '<sheetData>' +
          '<row r="1"><c r="A1" t="inlineStr"><is><t>Phần mềm</t></is></c><c r="B1" t="inlineStr"><is><t>Số lượng</t></is></c><c r="C1" t="inlineStr"><is><t>Chi phí (VND)</t></is></c></row>' +
          '<row r="2"><c r="A2" t="inlineStr"><is><t>Figma</t></is></c><c r="B2"><v>10</v></c><c r="C2"><v>50000000</v></c></row>' +
          '<row r="3"><c r="A3" t="inlineStr"><is><t>Miro</t></is></c><c r="B3"><v>5</v></c><c r="C3"><v>20000000</v></c></row>' +
          '</sheetData></worksheet>',
        'utf-8',
      ),
    },
  ]);

  const csvBytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from('phan_mem,so_luong,chi_phi_vnd\nFigma,10,50000000\nMiro,5,20000000\n', 'utf-8'),
  ]);

  const docxBytes = buildStoredZip([
    {
      path: '[Content_Types].xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '</Types>',
        'utf-8',
      ),
    },
    {
      path: '_rels/.rels',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '</Relationships>',
        'utf-8',
      ),
    },
    {
      path: 'word/document.xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          '<w:body><w:p><w:r><w:t>Biên bản họp ngân sách 2027 — tệp mẫu kiểm thử</w:t></w:r></w:p></w:body>' +
          '</w:document>',
        'utf-8',
      ),
    },
  ]);

  const pngBytes = buildSmallPng();
  const jpgBytes = Buffer.from(MINIMAL_JPEG);
  const fakePdfBytes = Buffer.from('Day khong phai PDF', 'utf-8');
  const fakeXlsxBytes = Buffer.from('Day khong phai XLSX', 'utf-8');
  const binaryCsvBytes = Buffer.from(pngBytes);
  const txtBytes = Buffer.from('Ghi chu noi bo - tep mau kiem thu\n', 'utf-8');

  const files: Array<Omit<SampleFileDescriptor, 'sha256' | 'sizeBytes'>> = [
    {
      file: 'bao-gia-figma-2027.pdf',
      contentType: 'application/pdf',
      content: pdfBytes,
      declare: { status: 201 },
      complete: { status: 200 },
    },
    {
      file: 'bang-tinh-ngan-sach-2027.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: xlsxBytes,
      declare: { status: 201 },
      complete: { status: 200 },
    },
    {
      file: 'nhu-cau-2027.csv',
      contentType: 'text/csv',
      content: csvBytes,
      declare: { status: 201 },
      complete: { status: 200 },
    },
    {
      file: 'bien-ban-hop-ngan-sach.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      content: docxBytes,
      declare: { status: 201 },
      complete: { status: 200 },
    },
    {
      file: 'anh-chup-bao-gia.png',
      contentType: 'image/png',
      content: pngBytes,
      declare: { status: 201 },
      complete: { status: 200 },
    },
    {
      file: 'anh-hoa-don.jpg',
      contentType: 'image/jpeg',
      content: jpgBytes,
      declare: { status: 201 },
      complete: { status: 200 },
    },
    {
      file: 'gia-mao.pdf',
      contentType: 'application/pdf',
      content: fakePdfBytes,
      declare: { status: 201 },
      complete: { status: 422, code: 'BUDGET_ATTACHMENT.UPLOAD_MISMATCH' },
    },
    {
      file: 'gia-mao.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: fakeXlsxBytes,
      declare: { status: 201 },
      complete: { status: 422, code: 'BUDGET_ATTACHMENT.UPLOAD_MISMATCH' },
    },
    {
      file: 'nhi-phan.csv',
      contentType: 'text/csv',
      content: binaryCsvBytes,
      declare: { status: 201 },
      complete: { status: 422, code: 'BUDGET_ATTACHMENT.UPLOAD_MISMATCH' },
    },
    {
      file: 'ghi-chu.txt',
      contentType: 'text/plain',
      content: txtBytes,
      declare: { status: 422, code: 'BUDGET_ATTACHMENT.TYPE_NOT_ALLOWED' },
      complete: null,
    },
  ];

  return files.map((f) => ({
    ...f,
    sizeBytes: f.content.length,
    sha256: crypto.createHash('sha256').update(f.content).digest('hex'),
  }));
}
